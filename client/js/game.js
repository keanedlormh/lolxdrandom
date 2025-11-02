/**
 * client/js/game.js
 * Lógica principal del lado del cliente. 
 * Se encarga de la comunicación con Socket.IO, el renderizado y la gestión de inputs.
 * * IMPLEMENTACIÓN: Joysticks Táctiles para móvil.
 */


// --- CONFIGURACIÓN Y ESTADO GLOBAL ---


const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');


// Las entidades asumen que window.SCALE existe
const SCALE = 1.0; 
window.SCALE = SCALE;
const SERVER_TICK_RATE = 30; // 30 FPS del servidor


// --- CONFIGURACIÓN DE JOYSTICK TÁCTIL ---
const JOYSTICK_RADIUS = 70; // Radio del joystick de fondo
const KNOB_RADIUS = 30;   // Radio del botón de control
const JOYSTICK_AREA_RATIO = 0.4; // 40% de la pantalla para joysticks


// Estado para el control táctil
const touchState = {
    // Si la pantalla es táctil, deshabilitamos teclado/ratón para movimiento y puntería
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,

    // Estado de los joysticks
    move: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 },
    aim: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 }
};


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

    mapRenderer: null,

    // Input
    input: {
        moveX: 0, moveY: 0, // Joystick de movimiento
        shootX: 1, shootY: 0, // Dirección de disparo (por defecto a la derecha)
        isShooting: false // Nuevo: Bandera para disparo continuo
    }
};


let lastRenderTime = 0;
let animationFrameId = null;


// --- UTILITIES (FUNCIÓN LERP) ---


/**
 * Interpolación Lineal (Lerp) para suavizar el movimiento de la red.
 */
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}


// --- GESTIÓN DE ENTRADAS (INPUT) ---

function sendInputToServer() {
    // Normalización de movimiento
    const moveLength = Math.sqrt(clientState.input.moveX ** 2 + clientState.input.moveY ** 2);
    let n_moveX = clientState.input.moveX;
    let n_moveY = clientState.input.moveY;
    if (moveLength > 1) { n_moveX /= moveLength; n_moveY /= moveLength; }

    // El servidor usará isShooting para aplicar el cooldown
    socket.emit('playerInput', {
        moveX: n_moveX,
        moveY: n_moveY,
        shootX: clientState.input.shootX,
        shootY: clientState.input.shootY,
        isShooting: clientState.input.isShooting
    });
}


// --- MOVIMIENTO Y PUNTERÍA (TECLADO/RATÓN - SOLO EN DESKTOP) ---

if (!touchState.isTouchDevice) {
    // Lógica de Teclado (WASD)
    const moveKeys = {
        'w': { dy: -1 }, 's': { dy: 1 },
        'a': { dx: -1 }, 'd': { dx: 1 },
    };
    const keysPressed = new Set();


    document.addEventListener('keydown', (e) => {
        if (clientState.currentState !== 'playing') return;
        const key = e.key.toLowerCase();
        if (moveKeys[key]) {
            keysPressed.add(key);
            updateMoveInput();
            e.preventDefault();
        }
    });


    document.addEventListener('keyup', (e) => {
        if (clientState.currentState !== 'playing') return;
        const key = e.key.toLowerCase();
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


    // Lógica de Ratón (Puntería y Disparo)
    
    // Calcula el vector de puntería basado en la posición del ratón
    function calculateAimVector(e) {
        if (clientState.currentState !== 'playing') return;

        const rect = canvas.getBoundingClientRect();
        // MouseX y MouseY ya son coordenadas del viewport ya que SCALE = 1
        const mouseX = e.clientX - rect.left; 
        const mouseY = e.clientY - rect.top;

        // Centro del viewport (pantalla)
        const playerScreenX = canvas.width / 2;
        const playerScreenY = canvas.height / 2;

        // Vector de disparo
        let shootX = mouseX - playerScreenX;
        let shootY = mouseY - playerScreenY;
        
        // Normalizar la dirección
        const length = Math.sqrt(shootX ** 2 + shootY ** 2);
        if (length > 0.1) { 
            clientState.input.shootX = shootX / length;
            clientState.input.shootY = shootY / length;

            // Actualizar la entidad local para el dibujo inmediato de la línea de puntería
            const me = clientState.interpolatedEntities.players.get(clientState.me.id);
            if (me) {
                me.shootX = clientState.input.shootX;
                me.shootY = clientState.input.shootY;
            }
        }
    }

    canvas.addEventListener('mousemove', calculateAimVector);

    canvas.addEventListener('mousedown', (e) => {
        if (clientState.currentState !== 'playing') return;
        if (e.button === 0) { // Clic izquierdo
            clientState.input.isShooting = true;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (clientState.currentState !== 'playing') return;
        if (e.button === 0) { // Clic izquierdo
            clientState.input.isShooting = false;
        }
    });

}


// --- LÓGICA TÁCTIL (JOYCSTICS) ---

if (touchState.isTouchDevice) {

    // Función para manejar el inicio de un toque (toca en la pantalla)
    canvas.addEventListener('touchstart', (e) => {
        if (clientState.currentState !== 'playing') return;
        e.preventDefault(); // Prevenir el scroll y el zoom

        Array.from(e.changedTouches).forEach(touch => {
            const screenX = touch.clientX;
            const screenY = touch.clientY;
            
            // Determinar si es un joystick de movimiento (izquierda) o puntería (derecha)
            const isLeftHalf = screenX < canvas.width * 0.5;

            // Intentar activar el joystick
            if (isLeftHalf && !touchState.move.active) {
                const move = touchState.move;
                move.active = true;
                move.id = touch.identifier;
                // Posicionar el centro del joystick en la posición del primer toque
                move.centerX = screenX;
                move.centerY = screenY;
                move.currentX = screenX;
                move.currentY = screenY;
                console.log('Joystick MOVIMIENTO activado');
            } else if (!isLeftHalf && !touchState.aim.active) {
                const aim = touchState.aim;
                aim.active = true;
                aim.id = touch.identifier;
                // Posicionar el centro del joystick en la posición del primer toque
                aim.centerX = screenX;
                aim.centerY = screenY;
                aim.currentX = screenX;
                aim.currentY = screenY;
                clientState.input.isShooting = true; // Empezar a disparar al tocar el joystick de puntería
                console.log('Joystick PUNTERÍA activado');
            }
        });
    });

    // Función para manejar el movimiento de un toque (desliza el dedo)
    canvas.addEventListener('touchmove', (e) => {
        if (clientState.currentState !== 'playing') return;
        e.preventDefault();

        Array.from(e.changedTouches).forEach(touch => {
            const screenX = touch.clientX;
            const screenY = touch.clientY;

            // 1. Joystick de Movimiento (Izquierda)
            if (touchState.move.active && touch.identifier === touchState.move.id) {
                const move = touchState.move;
                
                let dx = screenX - move.centerX;
                let dy = screenY - move.centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > JOYSTICK_RADIUS) {
                    // Limitar el botón al radio del joystick
                    dx *= JOYSTICK_RADIUS / distance;
                    dy *= JOYSTICK_RADIUS / distance;
                }
                
                // Actualizar posición del botón (knob)
                move.currentX = move.centerX + dx;
                move.currentY = move.centerY + dy;

                // Actualizar input de movimiento
                clientState.input.moveX = dx / JOYSTICK_RADIUS;
                clientState.input.moveY = dy / JOYSTICK_RADIUS;
            } 
            
            // 2. Joystick de Puntería (Derecha)
            else if (touchState.aim.active && touch.identifier === touchState.aim.id) {
                const aim = touchState.aim;

                let dx = screenX - aim.centerX;
                let dy = screenY - aim.centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > JOYSTICK_RADIUS) {
                    // Limitar el botón al radio del joystick
                    dx *= JOYSTICK_RADIUS / distance;
                    dy *= JOYSTICK_RADIUS / distance;
                }

                // Actualizar posición del botón (knob)
                aim.currentX = aim.centerX + dx;
                aim.currentY = aim.centerY + dy;
                
                // Actualizar input de puntería (si el movimiento es significativo)
                if (distance > KNOB_RADIUS / 2) { 
                    clientState.input.shootX = dx / distance;
                    clientState.input.shootY = dy / distance;
                    
                    // Actualizar la entidad local para el dibujo inmediato del puntero
                    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
                    if (me) {
                        me.shootX = clientState.input.shootX;
                        me.shootY = clientState.input.shootY;
                    }
                }
            }
        });
    });

    // Función para manejar el fin de un toque (levanta el dedo)
    canvas.addEventListener('touchend', (e) => {
        if (clientState.currentState !== 'playing') return;
        e.preventDefault();

        Array.from(e.changedTouches).forEach(touch => {
            // 1. Joystick de Movimiento
            if (touchState.move.active && touch.identifier === touchState.move.id) {
                touchState.move.active = false;
                touchState.move.id = null;
                clientState.input.moveX = 0;
                clientState.input.moveY = 0; // Detener el movimiento
            } 
            
            // 2. Joystick de Puntería
            else if (touchState.aim.active && touch.identifier === touchState.aim.id) {
                touchState.aim.active = false;
                touchState.aim.id = null;
                clientState.input.isShooting = false; // Detener el disparo
            }
        });
    });
}


// --- GESTIÓN DE RENDERIZADO ---


/**
 * Función principal del renderizado (se ejecuta a 60 FPS).
 */
function gameLoopRender(timestamp) {
    if (clientState.currentState === 'playing') {
        const serverSnapshotTime = 1000 / SERVER_TICK_RATE;
        const timeSinceLastSnapshot = timestamp - lastRenderTime;

        // Calcular el factor de interpolación
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
    
    const serverPlayerIds = new Set();
    const serverZombieIds = new Set();
    
    // --- Jugadores ---
    serverSnapshot.players.forEach(p_server => {
        serverPlayerIds.add(p_server.id);
        let p_client = interpolatedEntities.players.get(p_server.id);
        const isMe = p_server.id === clientState.me.id;


        if (!p_client) {
            p_client = new Player(p_server.id, p_server.x, p_server.y, isMe, p_server.name);
            p_client.shootX = p_server.shootX || 1;
            p_client.shootY = p_server.shootY || 0;
            interpolatedEntities.players.set(p_server.id, p_client);
        }
        
        p_client.prevX = p_client.x;
        p_client.prevY = p_client.y;
        p_client.targetX = p_server.x;
        p_client.targetY = p_server.y;
        
        p_client.health = p_server.health;
        p_client.kills = p_server.kills;

        // Si es el jugador local y estamos usando joystick, la dirección de puntería se actualiza localmente
        if (!isMe || !touchState.isTouchDevice) {
            p_client.shootX = p_server.shootX;
            p_client.shootY = p_server.shootY;
        }

        // Aplicar Lerp
        p_client.x = lerp(p_client.prevX, p_client.targetX, factor);
        p_client.y = lerp(p_client.prevY, p_client.targetY, factor);
    });
    
    // --- Zombies y Limpieza ---
    serverSnapshot.zombies.forEach(z_server => {
        serverZombieIds.add(z_server.id);
        let z_client = interpolatedEntities.zombies.get(z_server.id);

        if (!z_client) {
            z_client = new Zombie(z_server.id, z_server.x, z_server.y, z_server.maxHealth);
            interpolatedEntities.zombies.set(z_server.id, z_client);
        }
        
        z_client.prevX = z_client.x;
        z_client.prevY = z_client.y;
        z_client.targetX = z_server.x;
        z_client.targetY = z_server.y;
        z_client.health = z_server.health;
        z_client.maxHealth = z_server.maxHealth;
        
        z_client.x = lerp(z_client.prevX, z_client.targetX, factor);
        z_client.y = lerp(z_client.prevY, z_client.targetY, factor);
    });


    // Limpiar entidades que ya no están en el snapshot del servidor 
    interpolatedEntities.players.forEach((_, id) => {
        if (!serverPlayerIds.has(id)) { interpolatedEntities.players.delete(id); }
    });

    interpolatedEntities.zombies.forEach((_, id) => {
        if (!serverZombieIds.has(id)) { interpolatedEntities.zombies.delete(id); }
    });
}


/**
 * Dibuja el estado actual del juego en el canvas.
 */
function drawGame(deltaTime) {
    
    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me) {
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }


    // --- 1. CONFIGURACIÓN DE LA CÁMARA ---
    const viewportW = canvas.width / SCALE; 
    const viewportH = canvas.height / SCALE;
    
    let cameraX = me.x - viewportW / 2;
    let cameraY = me.y - viewportH / 2;


    // Aplicar límites de la cámara al borde del mapa
    if (clientState.mapRenderer) {
        const mapSize = clientState.mapRenderer.mapWorldSize;
        cameraX = Math.max(0, Math.min(cameraX, mapSize - viewportW));
        cameraY = Math.max(0, Math.min(cameraY, mapSize - viewportH));

        if (viewportW > mapSize) cameraX = -(viewportW - mapSize) / 2; 
        if (viewportH > mapSize) cameraY = -(viewportH - mapSize) / 2;

        clientState.cameraX = cameraX;
        clientState.cameraY = cameraY;
    } else {
        clientState.cameraX = cameraX;
        clientState.cameraY = cameraY;
    }


    
    // --- 2. LIMPIAR Y APLICAR TRANSFORMACIÓN DE LA CÁMARA ---
    
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(-clientState.cameraX, -clientState.cameraY); 


    
    // --- 3. DIBUJAR MAPA ---
    if (clientState.mapRenderer) {
        clientState.mapRenderer.draw(ctx, clientState.cameraX, clientState.cameraY);
    }
    
    // --- 4. DIBUJAR ENTIDADES ---
    
    // Balas
    clientState.serverSnapshot.bullets.forEach(b => {
        const bullet = new Bullet(b.id, b.x, b.y);
        bullet.draw(ctx);
    });


    // Zombies
    clientState.interpolatedEntities.zombies.forEach(z => {
        z.draw(ctx);
    });


    // Jugadores
    clientState.interpolatedEntities.players.forEach(p => {
        p.draw(ctx);
    });


    ctx.restore(); // Restaurar el contexto
    
    // 5. DIBUJAR UI (HUD)
    drawHUD(me);

    // 6. DIBUJAR JOYSTICKS (Si es dispositivo táctil)
    if (touchState.isTouchDevice) {
        drawJoysticks();
    }
}


/**
 * Dibuja los joysticks virtuales en la interfaz táctil.
 */
function drawJoysticks() {
    // Dibujar Joystick de MOVIMIENTO (Izquierda)
    if (touchState.move.active) {
        const move = touchState.move;
        
        // Círculo de fondo (Área de joystick)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Semitransparente
        ctx.beginPath();
        ctx.arc(move.centerX, move.centerY, JOYSTICK_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Círculo del botón (Knob)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(move.currentX, move.currentY, KNOB_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    // Dibujar Joystick de PUNTERÍA (Derecha)
    if (touchState.aim.active) {
        const aim = touchState.aim;

        // Círculo de fondo (Área de joystick)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Semitransparente
        ctx.beginPath();
        ctx.arc(aim.centerX, aim.centerY, JOYSTICK_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Círculo del botón (Knob)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'; // Rojo para indicar disparo
        ctx.beginPath();
        ctx.arc(aim.currentX, aim.currentY, KNOB_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}


/**
 * Dibuja la interfaz de usuario (score, vida, etc.)
 */
function drawHUD(player) {
    const { serverSnapshot } = clientState;
    
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


    // ID del jugador (Derecha)
    ctx.textAlign = 'right';
    let xRight = canvas.width - 10;
    
    // Buscar el nombre actual en el lobby (si está disponible)
    const myInfo = clientState.playersInLobby?.find(p => p.id === clientState.me.id);
    const myName = myInfo ? myInfo.name : 'Desconocido';
    
    ctx.fillStyle = player?.health > 0 ? 'cyan' : '#F44336';
    ctx.fillText(`${myName}: ${clientState.me.id?.substring(0, 4)}`, xRight, 25);
}


// --- LÓGICA DE INTERFAZ Y LOBBY ---


function resizeCanvas() {
    // Canvas a pantalla completa
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
}


window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 


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
    if (clientState.me.isHost) { 
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
    clientState.currentState = 'menu';
    updateUI();
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

    clientState.mapRenderer = new MapRenderer(data.mapData, data.cellSize);
    
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


socket.on('playerDisconnected', (playerId) => {
    console.log(`Jugador desconectado: ${playerId}`);
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
    if (!roomId || roomId.length !== 4) {
        console.warn('Por favor, ingresa un ID de sala válido de 4 caracteres.');
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
    if (clientState.currentState === 'lobby' && clientState.roomId) {
        socket.emit('leaveRoom', clientState.roomId);
    }
    clientState.currentState = 'menu';
    updateUI();
});


// --- INICIO ---
updateUI(); // Iniciar en el estado 'menu'
requestAnimationFrame(gameLoopRender); // Iniciar el loop de renderizado