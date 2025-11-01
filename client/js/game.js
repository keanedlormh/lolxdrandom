/**
 * client/js/game.js
 * Lógica principal del lado del cliente. 
 * Se encarga de la comunicación con Socket.IO, el renderizado y la gestión de inputs.
 *
 * Incluye:
 * 1. Gestión de Estados (Lobby, Playing, GameOver).
 * 2. Input del Jugador (Joystick simulado).
 * 3. Renderizado (Canvas, minimapa).
 * 4. Interpolación (Lerp) para movimiento suave de entidades.
 */

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCALE = 1.0; // Escala general del renderizado
const SERVER_TICK_RATE = 30; // 30 FPS del servidor
const CLIENT_RENDER_RATE = 60; // 60 FPS del cliente
const RENDER_INTERVAL = 1000 / CLIENT_RENDER_RATE;

// Estado del juego en el cliente
const clientState = {
    // Estados posibles: 'menu', 'lobby', 'playing', 'gameOver'
    currentState: 'menu', 
    me: { id: null, name: 'Jugador', isHost: false },
    roomId: null,
    
    // Datos recibidos del servidor
    serverSnapshot: {
        players: [],
        zombies: [],
        bullets: [],
        score: 0,
        wave: 1
    },
    
    // Datos interpolados (usados para el dibujo)
    interpolatedEntities: {
        players: new Map(), // { id: { x, y, health, ... } }
        zombies: new Map()  // { id: { x, y } }
    },

    // Datos estáticos de la partida
    mapData: {
        map: [], // Array de la cuadrícula
        cellSize: 40,
        mapWorldSize: 0
    },

    // Input
    input: {
        moveX: 0, moveY: 0, // Joystick de movimiento
        shootX: 0, shootY: 0 // Joystick de disparo
    }
};

let lastRenderTime = 0;
let animationFrameId = null;

// --- UTILITIES (FUNCIÓN LERP) ---

/**
 * Interpolación Lineal (Lerp) para suavizar el movimiento de la red.
 * @param {number} start - Valor inicial.
 * @param {number} end - Valor final (objetivo).
 * @param {number} amount - Cantidad de interpolación (0.0 a 1.0).
 * @returns {number} El valor interpolado.
 */
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

// --- GESTIÓN DE ENTRADAS (INPUT) ---

/**
 * Normaliza los vectores de movimiento y los envía al servidor.
 * Este input se envía en cada frame de renderizado del cliente.
 */
function sendInputToServer() {
    // Normalización del vector de movimiento (si ambos son > 0)
    const moveLength = Math.sqrt(clientState.input.moveX ** 2 + clientState.input.moveY ** 2);
    let n_moveX = clientState.input.moveX;
    let n_moveY = clientState.input.moveY;
    if (moveLength > 1) {
        n_moveX /= moveLength;
        n_moveY /= moveLength;
    }

    // Normalización del vector de disparo
    const shootLength = Math.sqrt(clientState.input.shootX ** 2 + clientState.input.shootY ** 2);
    let n_shootX = clientState.input.shootX;
    let n_shootY = clientState.input.shootY;
    if (shootLength > 1) {
        n_shootX /= shootLength;
        n_shootY /= shootLength;
    }

    socket.emit('playerInput', {
        moveX: n_moveX,
        moveY: n_moveY,
        shootX: n_shootX,
        shootY: n_shootY
    });
}

// Implementación de Joysticks (simplificada para teclado/mouse)

// Mapeo de teclas de movimiento (WASD/Flechas)
const moveKeys = {
    'w': { dy: -1 }, 's': { dy: 1 },
    'a': { dx: -1 }, 'd': { dx: 1 },
    'ArrowUp': { dy: -1 }, 'ArrowDown': { dy: 1 },
    'ArrowLeft': { dx: -1 }, 'ArrowRight': { dx: 1 }
};
const keysPressed = new Set();

document.addEventListener('keydown', (e) => {
    if (clientState.currentState !== 'playing') return;
    const key = e.key;

    if (moveKeys[key]) {
        keysPressed.add(key);
        updateMoveInput();
        e.preventDefault(); // Evita scroll de la ventana
    }
});

document.addEventListener('keyup', (e) => {
    if (clientState.currentState !== 'playing') return;
    const key = e.key;

    if (moveKeys[key]) {
        keysPressed.delete(key);
        updateMoveInput();
    }
});

function updateMoveInput() {
    let moveX = 0;
    let moveY = 0;

    keysPressed.forEach(key => {
        if (moveKeys[key].dx) moveX += moveKeys[key].dx;
        if (moveKeys[key].dy) moveY += moveKeys[key].dy;
    });

    clientState.input.moveX = moveX;
    clientState.input.moveY = moveY;
}


// Mapeo de input de disparo (Mouse o clic en joystick de disparo)
canvas.addEventListener('mousemove', (e) => {
    if (clientState.currentState !== 'playing') return;

    // Obtener la posición del mouse relativa al canvas
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / SCALE;
    const mouseY = (e.clientY - rect.top) / SCALE;

    const me = clientState.serverSnapshot.players.find(p => p.id === clientState.me.id);
    if (!me) return;

    // Obtener la posición del jugador en la pantalla (centro de la vista)
    const playerScreenX = canvas.width / (2 * SCALE);
    const playerScreenY = canvas.height / (2 * SCALE);

    // Vector de disparo relativo al jugador en coordenadas de pantalla
    let shootX = mouseX - playerScreenX;
    let shootY = mouseY - playerScreenY;
    
    // Normalizar la dirección del vector de disparo
    const length = Math.sqrt(shootX ** 2 + shootY ** 2);
    if (length > 0) {
        shootX /= length;
        shootY /= length;
    }
    
    // El input de disparo se almacena como una dirección normalizada
    clientState.input.shootX = shootX;
    clientState.input.shootY = shootY;
});

// Evento de disparo con el mouse (simulando manteniéndolo presionado)
canvas.addEventListener('mousedown', (e) => {
    if (clientState.currentState !== 'playing') return;
    // Esto asegura que el disparo ocurra incluso si el mouse no se mueve
    // Usamos el 'mousemove' para la dirección y 'mousedown' como trigger si es necesario
    // Pero como estamos enviando la dirección del mouse en 'mousemove', no es estrictamente necesario 
    // otro evento aquí para simular 'disparo continuo'.
});

canvas.addEventListener('mouseup', (e) => {
    if (clientState.currentState !== 'playing') return;
    // Detener el disparo (configurando el vector de disparo a 0)
    // Esto es un poco rudimentario; un sistema real usaría un botón de "disparo"
    // Pero si usamos el mouse para apuntar, el disparo debe ser continuo al apuntar.
    // Para simplificar, asumiremos que el jugador dispara cuando apunta (input != 0).
    // Si queremos que solo dispare al hacer clic, necesitamos un 'isShooting: true' en el input.
    // Dejaremos la lógica simple del servidor (dispara si shootX/Y != 0).
});


// --- GESTIÓN DE RENDERIZADO ---

/**
 * Función principal del renderizado (se ejecuta a 60 FPS).
 */
function gameLoopRender(timestamp) {
    if (clientState.currentState === 'playing') {
        const deltaTime = timestamp - lastRenderTime;

        // Calcular el factor de interpolación
        // `interpolationFactor` será un valor entre 0 y 1, que indica cuánto
        // avanzar entre el último snapshot y el actual.
        // Se asume que el servidor envía 30 snapshots/seg (TICK_RATE).
        // El tiempo transcurrido desde el último snapshot es aproximadamente 
        // 1/SERVER_TICK_RATE (33.33ms).
        const serverSnapshotTime = 1000 / SERVER_TICK_RATE;
        const interpolationFactor = Math.min(1, deltaTime / serverSnapshotTime);
        
        // 1. Interpolación de entidades
        interpolateEntities(interpolationFactor);
        
        // 2. Dibujo
        drawGame(deltaTime);
        
        // 3. Enviar Input
        sendInputToServer();
    }
    
    lastRenderTime = timestamp;
    animationFrameId = requestAnimationFrame(gameLoopRender);
}

/**
 * Aplica la interpolación lineal (Lerp) a todas las entidades.
 */
function interpolateEntities(factor) {
    const { serverSnapshot, interpolatedEntities } = clientState;
    
    // --- Jugadores ---
    serverSnapshot.players.forEach(p_server => {
        let p_client = interpolatedEntities.players.get(p_server.id);

        if (!p_client) {
            // Primer snapshot, inicializar la posición
            p_client = { ...p_server, prevX: p_server.x, prevY: p_server.y };
        } else {
            // Actualizar el estado objetivo y la posición previa
            p_client.prevX = p_client.x;
            p_client.prevY = p_client.y;
            p_client.targetX = p_server.x;
            p_client.targetY = p_server.y;
            p_client.health = p_server.health;
            p_client.kills = p_server.kills;
        }

        // Aplicar Lerp: Mover la posición actual (x, y) hacia el objetivo (targetX, targetY)
        p_client.x = lerp(p_client.prevX, p_client.targetX, factor);
        p_client.y = lerp(p_client.prevY, p_client.targetY, factor);

        interpolatedEntities.players.set(p_server.id, p_client);
    });
    
    // --- Zombies ---
    // Mismo proceso para zombies
    serverSnapshot.zombies.forEach(z_server => {
        let z_client = interpolatedEntities.zombies.get(z_server.id);

        if (!z_client) {
            z_client = { ...z_server, prevX: z_server.x, prevY: z_server.y };
        } else {
            z_client.prevX = z_client.x;
            z_client.prevY = z_client.y;
            z_client.targetX = z_server.x;
            z_client.targetY = z_server.y;
        }
        
        z_client.x = lerp(z_client.prevX, z_client.targetX, factor);
        z_client.y = lerp(z_client.prevY, z_client.targetY, factor);

        interpolatedEntities.zombies.set(z_server.id, z_client);
    });

    // Limpiar entidades que ya no están en el snapshot del servidor
    const currentPlayerIds = new Set(serverSnapshot.players.map(p => p.id));
    interpolatedEntities.players.forEach((_, id) => {
        if (!currentPlayerIds.has(id)) {
            interpolatedEntities.players.delete(id);
        }
    });

    const currentZombieIds = new Set(serverSnapshot.zombies.map(z => z.id));
    interpolatedEntities.zombies.forEach((_, id) => {
        if (!currentZombieIds.has(id)) {
            interpolatedEntities.zombies.delete(id);
        }
    });
}


/**
 * Dibuja el estado actual del juego en el canvas.
 * @param {number} deltaTime - Tiempo transcurrido desde el último frame.
 */
function drawGame(deltaTime) {
    // 1. Configuración de la vista (Cámara)
    // El punto central de la cámara es el jugador local
    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me) return; 

    const viewportW = canvas.width / SCALE;
    const viewportH = canvas.height / SCALE;
    
    // La cámara se centra en el jugador
    let cameraX = me.x - viewportW / 2;
    let cameraY = me.y - viewportH / 2;

    // Aplicar límites de la cámara al borde del mapa
    const mapSize = clientState.mapData.mapWorldSize;
    if (cameraX < 0) cameraX = 0;
    if (cameraY < 0) cameraY = 0;
    if (cameraX + viewportW > mapSize) cameraX = mapSize - viewportW;
    if (cameraY + viewportH > mapSize) cameraY = mapSize - viewportH;
    
    
    // 2. Limpiar Canvas y Transformar
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); // Resetear transformación
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Aplicar traslación para simular la cámara
    ctx.translate(-cameraX, -cameraY); 

    
    // 3. DIBUJAR MAPA
    drawMap();
    
    // 4. DIBUJAR ENTIDADES INTERPOLADAS
    
    // Balas (no interpoladas ya que se mueven rápido y el servidor es autoritativo)
    clientState.serverSnapshot.bullets.forEach(b => {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Zombies
    clientState.interpolatedEntities.zombies.forEach(z => {
        ctx.fillStyle = 'green';
        ctx.beginPath();
        ctx.arc(z.x, z.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.fillText('Z', z.x - 4, z.y + 4);
    });

    // Jugadores
    clientState.interpolatedEntities.players.forEach(p => {
        const isMe = p.id === clientState.me.id;
        ctx.fillStyle = isMe ? 'blue' : 'red';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Barra de vida
        const barWidth = 30;
        const barHeight = 4;
        const healthPercent = p.health / 100; // Asumimos 100 de vida máxima
        ctx.fillStyle = 'gray';
        ctx.fillRect(p.x - barWidth / 2, p.y - 25, barWidth, barHeight);
        ctx.fillStyle = healthPercent > 0.3 ? 'lime' : 'orange';
        ctx.fillRect(p.x - barWidth / 2, p.y - 25, barWidth * healthPercent, barHeight);
    });

    ctx.restore(); // Restaurar el contexto (quitar la traslación de la cámara)
    
    // 5. DIBUJAR UI (HUD) - Sin transformación de cámara
    drawHUD(me);
}

/**
 * Dibuja el mapa (muros y suelo)
 */
function drawMap() {
    const { map, cellSize } = clientState.mapData;
    if (map.length === 0) return;

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            const cellType = map[y][x];
            
            // Suelo
            ctx.fillStyle = 'rgb(30, 30, 30)';
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

            // Muro
            if (cellType === 1) {
                ctx.fillStyle = 'rgb(100, 100, 100)';
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }

            // Dibujar grid (opcional)
            // ctx.strokeStyle = '#555';
            // ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }
}

/**
 * Dibuja la interfaz de usuario (score, vida, etc.)
 */
function drawHUD(player) {
    const { serverSnapshot } = clientState;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Usar coordenadas de pantalla sin escala

    // Fondo para HUD
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, 40);

    ctx.fillStyle = 'white';
    ctx.font = '18px Arial';
    
    // Información de la izquierda
    ctx.fillText(`Vida: ${player ? player.health : 0} | Kills: ${player ? player.kills : 0}`, 10, 25);
    
    // Información central
    ctx.textAlign = 'center';
    ctx.fillText(`Puntuación: ${serverSnapshot.score} | Oleada: ${serverSnapshot.wave}`, canvas.width / 2, 25);

    // Lista de jugadores (Derecha)
    ctx.textAlign = 'right';
    let yOffset = 25;
    serverSnapshot.players.forEach(p => {
        const playerName = clientState.playersInLobby.find(lp => lp.id === p.id)?.name || p.id;
        ctx.fillStyle = p.id === clientState.me.id ? 'cyan' : 'white';
        ctx.fillText(`${playerName}: ${p.health}`, canvas.width - 10, yOffset);
        yOffset += 20;
    });
}


// --- LÓGICA DE INTERFAZ Y LOBBY ---

/**
 * Redimensiona el canvas para llenar la ventana.
 */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Se podría aplicar la escala aquí si fuera necesario
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();


// Función para actualizar la UI según el estado del juego
function updateUI() {
    // Esbozo de lógica de UI:
    const gameScreen = document.getElementById('gameScreen');
    const menuScreen = document.getElementById('menuScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    
    // Ocultar todo
    gameScreen.style.display = 'none';
    menuScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';

    // Mostrar solo el estado actual
    if (clientState.currentState === 'menu') {
        menuScreen.style.display = 'block';
    } else if (clientState.currentState === 'lobby') {
        lobbyScreen.style.display = 'block';
        updateLobbyDisplay();
    } else if (clientState.currentState === 'playing') {
        gameScreen.style.display = 'block';
    } else if (clientState.currentState === 'gameOver') {
        gameOverScreen.style.display = 'block';
    }
}

/**
 * Actualiza la lista de jugadores y el botón de inicio en el lobby.
 */
function updateLobbyDisplay() {
    const playerList = document.getElementById('lobbyPlayerList');
    const startButton = document.getElementById('startButton');

    if (clientState.currentState !== 'lobby') return;

    // Actualizar lista de jugadores
    playerList.innerHTML = '';
    clientState.playersInLobby.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} ${p.isHost ? '(Host)' : ''}`;
        li.style.color = p.id === clientState.me.id ? 'cyan' : 'white';
        playerList.appendChild(li);
    });

    // Gestionar botón de inicio (solo para el host)
    if (clientState.me.isHost && clientState.playersInLobby.length >= 1) { // Permitir 1 para pruebas
        startButton.style.display = 'block';
        startButton.disabled = clientState.playersInLobby.length < 1; // Solo si hay suficientes
    } else {
        startButton.style.display = 'none';
    }

    document.getElementById('lobbyRoomId').textContent = `Sala ID: ${clientState.roomId}`;
}


// --- LISTENERS DE SOCKET.IO ---

socket.on('connect', () => {
    clientState.me.id = socket.id;
    console.log(`Conectado al servidor con ID: ${socket.id}`);
});

/**
 * @event gameCreated (Recibido al crear sala)
 */
socket.on('gameCreated', (game) => {
    clientState.currentState = 'lobby';
    clientState.roomId = game.id;
    clientState.me.isHost = true;
    clientState.playersInLobby = game.players;
    updateUI();
});

/**
 * @event joinSuccess (Recibido al unirse a sala)
 */
socket.on('joinSuccess', (game) => {
    clientState.currentState = 'lobby';
    clientState.roomId = game.id;
    clientState.me.isHost = game.players.find(p => p.id === clientState.me.id)?.isHost || false;
    clientState.playersInLobby = game.players;
    updateUI();
});

/**
 * @event joinFailed (Error al unirse)
 */
socket.on('joinFailed', (message) => {
    alert(`Error al unirse: ${message}`);
});

/**
 * @event lobbyUpdate (Estado del lobby cambiado)
 */
socket.on('lobbyUpdate', (game) => {
    clientState.playersInLobby = game.players;
    // Asegurar que el estado del host se actualice si cambia
    clientState.me.isHost = game.players.find(p => p.id === clientState.me.id)?.isHost || false;
    updateUI();
});

/**
 * @event gameStarted (El juego ha iniciado, entrar a la vista de juego)
 */
socket.on('gameStarted', (data) => {
    clientState.currentState = 'playing';
    clientState.mapData.map = data.mapData;
    clientState.mapData.mapWorldSize = data.mapWorldSize;
    // Limpiar entidades interpoladas para el nuevo juego
    clientState.interpolatedEntities.players.clear();
    clientState.interpolatedEntities.zombies.clear();
    
    updateUI();
    // Reiniciar el loop de renderizado (si no está ya corriendo)
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
});

/**
 * @event gameState (Snapshot del estado del juego del servidor)
 * ESTE ES EL EVENTO MÁS IMPORTANTE PARA LA SINCRONIZACIÓN
 */
socket.on('gameState', (snapshot) => {
    // Almacenar el snapshot para ser usado por la interpolación
    clientState.serverSnapshot = snapshot;
});

/**
 * @event gameOver (El juego ha terminado)
 */
socket.on('gameOver', (data) => {
    clientState.currentState = 'gameOver';
    document.getElementById('finalScore').textContent = data.finalScore;
    document.getElementById('finalWave').textContent = data.finalWave;
    updateUI();
});

/**
 * @event gameEnded (Limpieza del juego/lobby)
 */
socket.on('gameEnded', () => {
    alert('La partida ha terminado o el host se ha desconectado. Volviendo al menú.');
    clientState.currentState = 'menu';
    clientState.roomId = null;
    clientState.me.isHost = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    updateUI();
});


// --- INICIALIZACIÓN DE LISTENERS DE BOTONES (UI) ---

document.getElementById('createGameButton').addEventListener('click', () => {
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    clientState.me.name = playerName;
    socket.emit('createGame', playerName);
});

document.getElementById('joinGameButton').addEventListener('click', () => {
    const roomId = document.getElementById('roomIdInput').value.toUpperCase();
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    if (!roomId) {
        alert('Por favor, ingresa un ID de sala válido.');
        return;
    }
    clientState.me.name = playerName;
    socket.emit('joinGame', roomId, playerName);
});

document.getElementById('startButton').addEventListener('click', () => {
    if (clientState.me.isHost && clientState.roomId) {
        socket.emit('startGame', clientState.roomId);
    }
});

document.getElementById('backToMenuButton').addEventListener('click', () => {
    // Lógica para abandonar la sala (si está en lobby) o volver al menú
    if (clientState.roomId) {
        // Podríamos enviar un evento 'leaveGame' si fuera necesario
    }
    clientState.currentState = 'menu';
    updateUI();
});


// --- INICIO ---
updateUI(); // Iniciar en el estado 'menu'
requestAnimationFrame(gameLoopRender); // Iniciar el loop de renderizado (se detendrá si no está en 'playing')
