/**
 * client/js/game.js
 * Lógica principal del lado del cliente. 
 * Se encarga de la comunicación con Socket.IO, el renderizado y la gestión de inputs.
 * * NOTA: Asume que client/js/entities.js ha sido cargado previamente,
 * lo que define las clases Player, Zombie, Bullet y MapRenderer globalmente.
 */

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCALE = 1.0; // Escala general del renderizado (1.0 es 1:1)
const SERVER_TICK_RATE = 30; // 30 FPS del servidor
const CLIENT_RENDER_RATE = 60; // 60 FPS del cliente

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
    
    // Contiene las instancias de las clases Player, Zombie, etc. para el dibujo
    interpolatedEntities: {
        players: new Map(), // { id: Player instance }
        zombies: new Map()  // { id: Zombie instance }
    },

    // Instancia del renderizador de mapas
    mapRenderer: null,

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
    // Lógica de normalización del vector de movimiento (omitiendo por brevedad, está en el anterior)
    const moveLength = Math.sqrt(clientState.input.moveX ** 2 + clientState.input.moveY ** 2);
    let n_moveX = clientState.input.moveX;
    let n_moveY = clientState.input.moveY;
    if (moveLength > 1) { n_moveX /= moveLength; n_moveY /= moveLength; }

    const shootLength = Math.sqrt(clientState.input.shootX ** 2 + clientState.input.shootY ** 2);
    let n_shootX = clientState.input.shootX;
    let n_shootY = clientState.input.shootY;
    if (shootLength > 1) { n_shootX /= shootLength; n_shootY /= shootLength; }

    socket.emit('playerInput', {
        moveX: n_moveX,
        moveY: n_moveY,
        shootX: n_shootX,
        shootY: n_shootY
    });
}

// Implementación de Joysticks (simplificada para teclado/mouse)
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
        e.preventDefault();
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

canvas.addEventListener('mousemove', (e) => {
    if (clientState.currentState !== 'playing') return;

    const rect = canvas.getBoundingClientRect();
    // Usar el tamaño sin escala para el cálculo de la posición del mouse en el viewport
    const mouseX = (e.clientX - rect.left) / SCALE; 
    const mouseY = (e.clientY - rect.top) / SCALE;

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me) return;

    // Centro del viewport (pantalla)
    const playerScreenX = canvas.width / (2 * SCALE);
    const playerScreenY = canvas.height / (2 * SCALE);

    // Vector de disparo
    let shootX = mouseX - playerScreenX;
    let shootY = mouseY - playerScreenY;
    
    // Normalizar la dirección
    const length = Math.sqrt(shootX ** 2 + shootY ** 2);
    if (length > 0) {
        shootX /= length;
        shootY /= length;
    }
    
    clientState.input.shootX = shootX;
    clientState.input.shootY = shootY;
});


// --- GESTIÓN DE RENDERIZADO ---

/**
 * Función principal del renderizado (se ejecuta a 60 FPS).
 */
function gameLoopRender(timestamp) {
    if (clientState.currentState === 'playing') {
        const timeSinceLastSnapshot = timestamp - lastRenderTime;

        // Calcular el factor de interpolación
        const serverSnapshotTime = 1000 / SERVER_TICK_RATE;
        // El factor asegura que el movimiento sea suave entre 0 (justo al recibir el snapshot) y 1 (listo para el siguiente snapshot)
        const interpolationFactor = Math.min(1, timeSinceLastSnapshot / serverSnapshotTime);
        
        // 1. Interpolación de entidades
        interpolateEntities(interpolationFactor);
        
        // 2. Dibujo
        drawGame(timeSinceLastSnapshot);
        
        // 3. Enviar Input
        sendInputToServer();
    }
    
    lastRenderTime = timestamp;
    animationFrameId = requestAnimationFrame(gameLoopRender);
}

/**
 * Aplica la interpolación lineal (Lerp) a todas las entidades y las inicializa si es necesario.
 */
function interpolateEntities(factor) {
    const { serverSnapshot, interpolatedEntities } = clientState;
    
    // --- Jugadores ---
    serverSnapshot.players.forEach(p_server => {
        let p_client = interpolatedEntities.players.get(p_server.id);
        const isMe = p_server.id === clientState.me.id;

        if (!p_client) {
            // Inicializar la instancia de la clase Player
            p_client = new Player(p_server.id, p_server.x, p_server.y, isMe, p_server.name);
            p_client.prevX = p_server.x;
            p_client.prevY = p_server.y;
            p_client.targetX = p_server.x;
            p_client.targetY = p_server.y;
        } else {
            // Guardar posición actual como previa
            p_client.prevX = p_client.x;
            p_client.prevY = p_client.y;
            // Establecer nueva posición objetivo del servidor
            p_client.targetX = p_server.x;
            p_client.targetY = p_server.y;
            // Actualizar propiedades no geométricas
            p_client.health = p_server.health;
            p_client.kills = p_server.kills;
        }

        // Aplicar Lerp
        p_client.x = lerp(p_client.prevX, p_client.targetX, factor);
        p_client.y = lerp(p_client.prevY, p_client.targetY, factor);

        interpolatedEntities.players.set(p_server.id, p_client);
    });
    
    // --- Zombies ---
    serverSnapshot.zombies.forEach(z_server => {
        let z_client = interpolatedEntities.zombies.get(z_server.id);

        if (!z_client) {
            z_client = new Zombie(z_server.id, z_server.x, z_server.y);
            z_client.prevX = z_server.x;
            z_client.prevY = z_server.y;
            z_client.targetX = z_server.x;
            z_client.targetY = z_server.y;
        } else {
            z_client.prevX = z_client.x;
            z_client.prevY = z_client.y;
            z_client.targetX = z_server.x;
            z_client.targetY = z_server.y;
        }
        
        // Aplicar Lerp
        z_client.x = lerp(z_client.prevX, z_client.targetX, factor);
        z_client.y = lerp(z_client.prevY, z_client.targetY, factor);

        interpolatedEntities.zombies.set(z_server.id, z_client);
    });

    // Limpiar entidades que ya no están en el snapshot del servidor
    const currentPlayerIds = new Set(serverSnapshot.players.map(p => p.id));
    interpolatedEntities.players.forEach((_, id) => {
        if (!currentPlayerIds.has(id)) { interpolatedEntities.players.delete(id); }
    });

    const currentZombieIds = new Set(serverSnapshot.zombies.map(z => z.id));
    interpolatedEntities.zombies.forEach((_, id) => {
        if (!currentZombieIds.has(id)) { interpolatedEntities.zombies.delete(id); }
    });
}


/**
 * Dibuja el estado actual del juego en el canvas.
 * @param {number} deltaTime - Tiempo transcurrido desde el último frame.
 */
function drawGame(deltaTime) {
    
    // Obtener jugador local para centrar la cámara
    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me) {
        // Limpiar el canvas, aunque el jugador aún no esté disponible
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // --- 1. CONFIGURACIÓN DE LA CÁMARA ---
    // Dimensiones del viewport en coordenadas del mundo (igual que el canvas en pixeles si SCALE=1)
    const viewportW = canvas.width / SCALE; 
    const viewportH = canvas.height / SCALE;
    
    // La cámara se centra en la posición interpolada del jugador
    let cameraX = me.x - viewportW / 2;
    let cameraY = me.y - viewportH / 2;

    // Aplicar límites de la cámara al borde del mapa
    if (clientState.mapRenderer) {
        const mapSize = clientState.mapRenderer.mapWorldSize;

        // Limitar la cámara para que no se salga del mapa (izquierda/arriba)
        cameraX = Math.max(0, cameraX);
        cameraY = Math.max(0, cameraY);
        
        // Limitar la cámara para que no se salga del mapa (derecha/abajo)
        cameraX = Math.min(cameraX, mapSize - viewportW);
        cameraY = Math.min(cameraY, mapSize - viewportH);

        // Si el mapa es más pequeño que el viewport, centrarlo
        if (viewportW > mapSize) cameraX = -(viewportW - mapSize) / 2; 
        if (viewportH > mapSize) cameraY = -(viewportH - mapSize) / 2;

        // CÁMARA FINAL (Para el dibujo del mapa)
        clientState.cameraX = cameraX;
        clientState.cameraY = cameraY;
    } else {
        // En caso de que el mapa no se haya cargado, no aplicar límites
        clientState.cameraX = cameraX;
        clientState.cameraY = cameraY;
    }

    
    // --- 2. LIMPIAR Y APLICAR TRANSFORMACIÓN DE LA CÁMARA ---
    
    // Limpiar canvas con el color de fondo
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Aplicar traslación: Mueve el origen del canvas al punto (-cameraX, -cameraY)
    // Esto hace que la posición (cameraX, cameraY) en el mundo se dibuje en (0, 0) de la pantalla.
    ctx.translate(-clientState.cameraX, -clientState.cameraY); 

    
    // --- 3. DIBUJAR MAPA (DELEGADO A MapRenderer) ---
    if (clientState.mapRenderer) {
        // Pasamos la posición de la cámara al renderizador para que pueda optimizar
        clientState.mapRenderer.draw(ctx, clientState.cameraX, clientState.cameraY);
    }
    
    // --- 4. DIBUJAR ENTIDADES ---
    
    // Balas (No interpoladas, solo dibujadas con el último snapshot)
    // Se usa la clase Bullet para el dibujo estético.
    clientState.serverSnapshot.bullets.forEach(b => {
        const bullet = new Bullet(b.id, b.x, b.y);
        bullet.draw(ctx);
    });

    // Zombies (Delegado a la clase Zombie, usa posiciones interpoladas)
    clientState.interpolatedEntities.zombies.forEach(z => {
        z.draw(ctx);
    });

    // Jugadores (Delegado a la clase Player, usa posiciones interpoladas)
    clientState.interpolatedEntities.players.forEach(p => {
        p.draw(ctx);
    });

    ctx.restore(); // Restaurar el contexto (quitar la traslación de la cámara)
    
    // 5. DIBUJAR UI (HUD) - Sin transformación de cámara
    drawHUD(me);
}


/**
 * Dibuja la interfaz de usuario (score, vida, etc.)
 * @param {Player} player - La instancia interpolada del jugador local.
 */
function drawHUD(player) {
    const { serverSnapshot } = clientState;
    // La transformación se resetea automáticamente con ctx.setTransform(1, 0, 0, 1, 0, 0)
    
    // Fondo para HUD
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, 40);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    
    // Información de la izquierda
    ctx.textAlign = 'left';
    ctx.fillText(`Vida: ${player && player.health > 0 ? player.health : 0} | Kills: ${player ? player.kills : 0}`, 10, 25);
    
    // Información central
    ctx.textAlign = 'center';
    ctx.fillText(`Puntuación: ${serverSnapshot.score} | Oleada: ${serverSnapshot.wave}`, canvas.width / 2, 25);

    // Lista de jugadores (Derecha)
    ctx.textAlign = 'right';
    let xRight = canvas.width - 10;
    
    // Usamos el listado del lobby para obtener los nombres
    const playerList = clientState.playersInLobby || [];
    
    // Mostrar solo el nombre del jugador local y su ID
    const myInfo = playerList.find(p => p.id === clientState.me.id);
    const myName = myInfo ? myInfo.name : 'Desconocido';
    
    ctx.fillStyle = 'cyan';
    ctx.fillText(`${myName}: ${clientState.me.id.substring(0, 4)}`, xRight, 25);
    
    // Si quisieras dibujar la lista de todos los jugadores:
    /*
    let yOffset = 25;
    playerList.forEach(p => {
        const entity = serverSnapshot.players.find(ep => ep.id === p.id);
        const health = entity ? entity.health : (p.isHost ? 'Espera' : 'Espera');
        ctx.fillStyle = p.id === clientState.me.id ? 'cyan' : 'white';
        ctx.fillText(`${p.name}: ${health}`, canvas.width - 10, yOffset);
        yOffset += 20;
    });
    */
}


// --- LÓGICA DE INTERFAZ Y LOBBY ---

/**
 * Redimensiona el canvas para llenar la ventana del navegador.
 * (Corregido para ajustar al 100% de la pantalla)
 */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); // Reaplicar la transformación
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();


// Función para actualizar la UI según el estado del juego
function updateUI() {
    const menuScreen = document.getElementById('menuScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    
    menuScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    canvas.style.display = 'none';

    if (clientState.currentState === 'menu') {
        menuScreen.style.display = 'flex';
    } else if (clientState.currentState === 'lobby') {
        lobbyScreen.style.display = 'flex';
        updateLobbyDisplay();
    } else if (clientState.currentState === 'playing') {
        canvas.style.display = 'block';
    } else if (clientState.currentState === 'gameOver') {
        gameOverScreen.style.display = 'flex';
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
    if (clientState.me.isHost && clientState.playersInLobby.length >= 1) { 
        startButton.style.display = 'block';
        startButton.disabled = clientState.playersInLobby.length < 1; 
    } else {
        startButton.style.display = 'none';
    }

    document.getElementById('lobbyRoomId').textContent = `Sala ID: ${clientState.roomId}`;
}


// --- LISTENERS DE SOCKET.IO ---

socket.on('connect', () => {
    clientState.me.id = socket.id;
    console.log(`[CLIENTE] Conectado al servidor con ID: ${socket.id}`);
});

socket.on('gameCreated', (game) => {
    clientState.currentState = 'lobby';
    clientState.roomId = game.id;
    clientState.me.isHost = true;
    clientState.playersInLobby = game.players;
    updateUI();
});

socket.on('joinSuccess', (game) => {
    clientState.currentState = 'lobby';
    clientState.roomId = game.id;
    clientState.me.isHost = game.players.find(p => p.id === clientState.me.id)?.isHost || false;
    clientState.playersInLobby = game.players;
    updateUI();
});

socket.on('joinFailed', (message) => {
    console.error(`Error al unirse: ${message}`);
    // Usar un modal o mensaje de error en la UI, no alert()
    // Simplificado a console.error para cumplir con la regla de no usar alert()
});

socket.on('lobbyUpdate', (game) => {
    clientState.playersInLobby = game.players;
    clientState.me.isHost = game.players.find(p => p.id === clientState.me.id)?.isHost || false;
    updateUI();
});

/**
 * @event gameStarted (El juego ha iniciado, entrar a la vista de juego)
 */
socket.on('gameStarted', (data) => {
    clientState.currentState = 'playing';

    // Inicializar el MapRenderer con los datos del servidor
    // Se asume que data.mapData (array 2D) y data.cellSize (número) vienen en el paquete
    clientState.mapRenderer = new MapRenderer(data.mapData, data.cellSize);
    
    // Limpiar entidades interpoladas para el nuevo juego
    clientState.interpolatedEntities.players.clear();
    clientState.interpolatedEntities.zombies.clear();
    
    updateUI();
    resizeCanvas(); 

    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
});

/**
 * @event gameState (Snapshot del estado del juego del servidor)
 */
socket.on('gameState', (snapshot) => {
    clientState.serverSnapshot = snapshot;
});

socket.on('gameOver', (data) => {
    clientState.currentState = 'gameOver';
    document.getElementById('finalScore').textContent = data.finalScore;
    document.getElementById('finalWave').textContent = data.finalWave;
    updateUI();
});

socket.on('gameEnded', () => {
    console.warn('La partida ha terminado o el host se ha desconectado. Volviendo al menú.');
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
        // En lugar de alert, usar feedback visual o console.log
        console.warn('Por favor, ingresa un ID de sala válido.');
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
    clientState.currentState = 'menu';
    updateUI();
});


// --- INICIO ---
updateUI(); // Iniciar en el estado 'menu'
requestAnimationFrame(gameLoopRender); // Iniciar el loop de renderizado