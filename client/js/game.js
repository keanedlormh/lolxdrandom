/**
 * client/js/game.js - ACTUALIZADO
 * - Añadido 'controlType' a DEFAULT_CONFIG.
 * - 'loadConfig', 'saveConfig', 'applyConfigToUI', 'readConfigFromUI' ahora
 * manejan la nueva opción 'setting_controlType'.
 * - 'applyPreset' ahora fusiona los presets sin sobreescribir 'controlType'.
 * - Añadida 'updateControlMethod' para cambiar entre modos de control.
 * - Los listeners de Teclado/Ratón y Táctil ahora dependen de 'touchState.currentControlMethod'
 * en lugar de 'touchState.isTouchDevice'.
 * - 'drawJoysticks' y la lógica de interpolación de puntería ahora también
 * respetan el método de control seleccionado.
 */

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCALE = 1.0; 
window.SCALE = SCALE;
const SERVER_TICK_RATE = 30;

// Configuración por defecto del juego
const DEFAULT_CONFIG = {
    controlType: 'auto', // NUEVO: 'auto', 'touch', 'keyboard'
    playerHealth: 100,
    playerSpeed: 6,
    shootCooldown: 150,
    zombieHealth: 30,
    zombieSpeed: 3,
    zombieAttack: 10,
    zombieAttackCooldown: 1000,
    bulletDamage: 10,
    bulletSpeed: 25,
    mapSize: 60,
    roomCount: 6,
    corridorWidth: 3,
    initialZombies: 5,
    waveMultiplier: 3
};

// Configuración actual del juego
let gameConfig = {...DEFAULT_CONFIG};

// Cargar configuración guardada del localStorage
function loadConfig() {
    const saved = localStorage.getItem('zombieGameConfig');
    if (saved) {
        try {
            // Fusionar defaults con guardado para no romper con nuevas configs
            gameConfig = {...DEFAULT_CONFIG, ...JSON.parse(saved)};
        } catch (e) {
            console.warn('Error cargando configuración, usando defaults:', e);
            gameConfig = {...DEFAULT_CONFIG};
        }
    }
    applyConfigToUI();
    updateControlMethod(); // Determinar método de control al cargar
}

// Guardar configuración en localStorage
function saveConfig() {
    localStorage.setItem('zombieGameConfig', JSON.stringify(gameConfig));
}

// Aplicar configuración a los inputs del UI
function applyConfigToUI() {
    document.getElementById('setting_controlType').value = gameConfig.controlType; // NUEVO
    document.getElementById('setting_playerHealth').value = gameConfig.playerHealth;
    document.getElementById('setting_playerSpeed').value = gameConfig.playerSpeed;
    document.getElementById('setting_shootCooldown').value = gameConfig.shootCooldown;
    document.getElementById('setting_zombieHealth').value = gameConfig.zombieHealth;
    document.getElementById('setting_zombieSpeed').value = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieAttack').value = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttackCooldown').value = gameConfig.zombieAttackCooldown;
    document.getElementById('setting_bulletDamage').value = gameConfig.bulletDamage;
    document.getElementById('setting_bulletSpeed').value = gameConfig.bulletSpeed;
    document.getElementById('setting_mapSize').value = gameConfig.mapSize;
    document.getElementById('setting_roomCount').value = gameConfig.roomCount;
    document.getElementById('setting_corridorWidth').value = gameConfig.corridorWidth;
    document.getElementById('setting_initialZombies').value = gameConfig.initialZombies;
    document.getElementById('setting_waveMultiplier').value = gameConfig.waveMultiplier;
}

// Leer configuración desde el UI
function readConfigFromUI() {
    gameConfig.controlType = document.getElementById('setting_controlType').value; // NUEVO
    gameConfig.playerHealth = parseInt(document.getElementById('setting_playerHealth').value);
    gameConfig.playerSpeed = parseFloat(document.getElementById('setting_playerSpeed').value);
    gameConfig.shootCooldown = parseInt(document.getElementById('setting_shootCooldown').value);
    gameConfig.zombieHealth = parseInt(document.getElementById('setting_zombieHealth').value);
    gameConfig.zombieSpeed = parseFloat(document.getElementById('setting_zombieSpeed').value);
    gameConfig.zombieAttack = parseInt(document.getElementById('setting_zombieAttack').value);
    gameConfig.zombieAttackCooldown = parseInt(document.getElementById('setting_zombieAttackCooldown').value);
    gameConfig.bulletDamage = parseInt(document.getElementById('setting_bulletDamage').value);
    gameConfig.bulletSpeed = parseInt(document.getElementById('setting_bulletSpeed').value);
    gameConfig.mapSize = parseInt(document.getElementById('setting_mapSize').value);
    gameConfig.roomCount = parseInt(document.getElementById('setting_roomCount').value);
    gameConfig.corridorWidth = parseInt(document.getElementById('setting_corridorWidth').value);
    gameConfig.initialZombies = parseInt(document.getElementById('setting_initialZombies').value);
    gameConfig.waveMultiplier = parseFloat(document.getElementById('setting_waveMultiplier').value);
}

// Presets de dificultad (CORREGIDO para no sobreescribir config de control)
window.applyPreset = function(preset) {
    let presetSettings = {};
    switch(preset) {
        case 'easy':
            presetSettings = {
                playerHealth: 150,
                playerSpeed: 7,
                shootCooldown: 100,
                zombieHealth: 20,
                zombieSpeed: 2,
                zombieAttack: 5,
                zombieAttackCooldown: 1500,
                bulletDamage: 15,
                bulletSpeed: 30,
                mapSize: 60,
                roomCount: 5,
                corridorWidth: 3,
                initialZombies: 3,
                waveMultiplier: 2
            };
            break;
        case 'normal':
            presetSettings = {...DEFAULT_CONFIG};
            // Borrar controlType para que no resetee el del usuario
            delete presetSettings.controlType; 
            break;
        case 'hard':
            presetSettings = {
                playerHealth: 80,
                playerSpeed: 5,
                shootCooldown: 200,
                zombieHealth: 40,
                zombieSpeed: 4,
                zombieAttack: 15,
                zombieAttackCooldown: 800,
                bulletDamage: 8,
                bulletSpeed: 20,
                mapSize: 80,
                roomCount: 8,
                corridorWidth: 2,
                initialZombies: 8,
                waveMultiplier: 4
            };
            break;
    }
    // Fusionar preset con config existente (para no perder controlType)
    gameConfig = {...gameConfig, ...presetSettings};
    applyConfigToUI();
};


// Generar resumen de configuración
function getConfigSummary() {
    return `
        Jugador: ${gameConfig.playerHealth}HP, Vel ${gameConfig.playerSpeed} | 
        Zombies: ${gameConfig.zombieHealth}HP, Vel ${gameConfig.zombieSpeed} | 
        Mapa: ${gameConfig.mapSize}x${gameConfig.mapSize}, ${gameConfig.roomCount} salas
    `;
}


// --- CONFIGURACIÓN DE JOYSTICK TÁCTIL ---
const JOYSTICK_RADIUS = 70;
const KNOB_RADIUS = 30;


const touchState = {
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    currentControlMethod: 'auto', // NUEVO: Se setea a 'touch' o 'keyboard' en updateControlMethod
    move: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 },
    aim: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 }
};

/**
 * NUEVO: Determina qué método de control usar basado en la config
 */
function updateControlMethod() {
    let method = gameConfig.controlType;
    if (method === 'auto') {
        method = (touchState.isTouchDevice) ? 'touch' : 'keyboard';
    }
    touchState.currentControlMethod = method;
    console.log(`[CONTROLES] Método de control activo: ${method}`);
}


// Estado del juego en el cliente
const clientState = {
    currentState: 'menu',
    me: { id: null, name: 'Jugador', isHost: false },
    roomId: null,
    serverSnapshot: {
        players: [],
        zombies: [],
        bullets: [],
        score: 0,
        wave: 1
    },
    interpolatedEntities: {
        players: new Map(),
        zombies: new Map()
    },
    mapRenderer: null,
    minimapCanvas: null, // Canvas de fondo para el minimapa
    input: {
        moveX: 0, moveY: 0,
        shootX: 1, shootY: 0,
        isShooting: false
    }
};


let lastRenderTime = 0;
let animationFrameId = null;


function lerp(start, end, amount) {
    return start + (end - start) * amount;
}


function sendInputToServer() {
    const moveLength = Math.sqrt(clientState.input.moveX ** 2 + clientState.input.moveY ** 2);
    let n_moveX = clientState.input.moveX;
    let n_moveY = clientState.input.moveY;
    if (moveLength > 1) { n_moveX /= moveLength; n_moveY /= moveLength; }


    socket.emit('playerInput', {
        moveX: n_moveX,
        moveY: n_moveY,
        shootX: clientState.input.shootX,
        shootY: clientState.input.shootY,
        isShooting: clientState.input.isShooting
    });
}


// --- MOVIMIENTO Y PUNTERÍA (TECLADO/RATÓN) ---
// CAMBIADO: 'if (!touchState.isTouchDevice)' por 'if (touchState.currentControlMethod === 'keyboard')'
// Nota: Se debe volver a comprobar en el evento, ya que el método puede cambiar.
// El listener se añade una vez, pero solo ejecutará la lógica si el modo es correcto.

const moveKeys = {
    'w': { dy: -1 }, 's': { dy: 1 },
    'a': { dx: -1 }, 'd': { dx: 1 },
};
const keysPressed = new Set();

document.addEventListener('keydown', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; // CHECK
    const key = e.key.toLowerCase();
    if (moveKeys[key]) {
        keysPressed.add(key);
        updateMoveInput();
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; // CHECK
    const key = e.key.toLowerCase();
    if (moveKeys[key]) {
        keysPressed.delete(key);
        updateMoveInput();
    }
});

function updateMoveInput() {
    if (touchState.currentControlMethod !== 'keyboard') { // CHECK
        clientState.input.moveX = 0;
        clientState.input.moveY = 0;
        return;
    }
    let moveX = 0;
    let moveY = 0;
    keysPressed.forEach(key => {
        if (moveKeys[key].dx) moveX += moveKeys[key].dx;
        if (moveKeys[key].dy) moveY += moveKeys[key].dy;
    });
    clientState.input.moveX = moveX;
    clientState.input.moveY = moveY;
}

function calculateAimVector(e) {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; // CHECK

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; 
    const mouseY = e.clientY - rect.top;

    const playerScreenX = canvas.width / 2;
    const playerScreenY = canvas.height / 2;

    let shootX = mouseX - playerScreenX;
    let shootY = mouseY - playerScreenY;

    const length = Math.sqrt(shootX ** 2 + shootY ** 2);
    if (length > 0.1) { 
        clientState.input.shootX = shootX / length;
        clientState.input.shootY = shootY / length;

        const me = clientState.interpolatedEntities.players.get(clientState.me.id);
        if (me) {
            me.shootX = clientState.input.shootX;
            me.shootY = clientState.input.shootY;
        }
    }
}

canvas.addEventListener('mousemove', calculateAimVector);

canvas.addEventListener('mousedown', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; // CHECK
    if (e.button === 0) {
        clientState.input.isShooting = true;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; // CHECK
    if (e.button === 0) {
        clientState.input.isShooting = false;
    }
});


// --- LÓGICA TÁCTIL (JOYSTICKS) ---
// CAMBIADO: 'if (touchState.isTouchDevice)' por 'if (touchState.currentControlMethod === 'touch')'
// (Misma lógica que arriba, los listeners se añaden pero solo actúan si el modo es 'touch')

canvas.addEventListener('touchstart', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return; // CHECK
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const screenX = touch.clientX;
        const screenY = touch.clientY;
        const isLeftHalf = screenX < canvas.width * 0.5;

        if (isLeftHalf && !touchState.move.active) {
            const move = touchState.move;
            move.active = true;
            move.id = touch.identifier;
            move.centerX = screenX;
            move.centerY = screenY;
            move.currentX = screenX;
            move.currentY = screenY;
        } else if (!isLeftHalf && !touchState.aim.active) {
            const aim = touchState.aim;
            aim.active = true;
            aim.id = touch.identifier;
            aim.centerX = screenX;
            aim.centerY = screenY;
            aim.currentX = screenX;
            aim.currentY = screenY;
            clientState.input.isShooting = true;
        }
    });
}, { passive: false }); // Necesario para preventDefault

canvas.addEventListener('touchmove', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return; // CHECK
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        const screenX = touch.clientX;
        const screenY = touch.clientY;

        if (touchState.move.active && touch.identifier === touchState.move.id) {
            const move = touchState.move;
            let dx = screenX - move.centerX;
            let dy = screenY - move.centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > JOYSTICK_RADIUS) {
                dx *= JOYSTICK_RADIUS / distance;
                dy *= JOYSTICK_RADIUS / distance;
            }

            move.currentX = move.centerX + dx;
            move.currentY = move.centerY + dy;
            clientState.input.moveX = dx / JOYSTICK_RADIUS;
            clientState.input.moveY = dy / JOYSTICK_RADIUS;
        } 
        else if (touchState.aim.active && touch.identifier === touchState.aim.id) {
            const aim = touchState.aim;
            let dx = screenX - aim.centerX;
            let dy = screenY - aim.centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > JOYSTICK_RADIUS) {
                dx *= JOYSTICK_RADIUS / distance;
                dy *= JOYSTICK_RADIUS / distance;
            }

            aim.currentX = aim.centerX + dx;
            aim.currentY = aim.centerY + dy;

            if (distance > KNOB_RADIUS / 2) { 
                clientState.input.shootX = dx / distance;
                clientState.input.shootY = dy / distance;

                const me = clientState.interpolatedEntities.players.get(clientState.me.id);
                if (me) {
                    me.shootX = clientState.input.shootX;
                    me.shootY = clientState.input.shootY;
                }
            }
        }
    });
}, { passive: false }); // Necesario para preventDefault

canvas.addEventListener('touchend', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return; // CHECK
    e.preventDefault();

    Array.from(e.changedTouches).forEach(touch => {
        if (touchState.move.active && touch.identifier === touchState.move.id) {
            touchState.move.active = false;
            touchState.move.id = null;
            clientState.input.moveX = 0;
            clientState.input.moveY = 0;
        } 
        else if (touchState.aim.active && touch.identifier === touchState.aim.id) {
            touchState.aim.active = false;
            touchState.aim.id = null;
            clientState.input.isShooting = false;
        }
    });
}, { passive: false }); // Necesario para preventDefault


// --- RENDERIZADO ---
function gameLoopRender(timestamp) {
    if (clientState.currentState === 'playing') {
        const serverSnapshotTime = 1000 / SERVER_TICK_RATE;
        const timeSinceLastSnapshot = timestamp - lastRenderTime;
        const interpolationFactor = Math.min(1, timeSinceLastSnapshot / serverSnapshotTime);


        interpolateEntities(interpolationFactor);
        drawGame(timeSinceLastSnapshot);
        sendInputToServer();
    }


    lastRenderTime = timestamp;
    animationFrameId = requestAnimationFrame(gameLoopRender);
}


function interpolateEntities(factor) {
    const { serverSnapshot, interpolatedEntities } = clientState;
    const serverPlayerIds = new Set();
    const serverZombieIds = new Set();


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

        // CAMBIADO: 'if (!isMe || !touchState.isTouchDevice)'
        // Si no soy yo, O si soy yo y uso teclado, actualiza la mira desde el servidor.
        // Si soy yo y uso touch, NO actualices (mi pulgar manda).
        if (!isMe || touchState.currentControlMethod === 'keyboard') {
            p_client.shootX = p_server.shootX;
            p_client.shootY = p_server.shootY;
        }


        p_client.x = lerp(p_client.prevX, p_client.targetX, factor);
        p_client.y = lerp(p_client.prevY, p_client.targetY, factor);
    });


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


    interpolatedEntities.players.forEach((_, id) => {
        if (!serverPlayerIds.has(id)) { interpolatedEntities.players.delete(id); }
    });


    interpolatedEntities.zombies.forEach((_, id) => {
        if (!serverZombieIds.has(id)) { interpolatedEntities.zombies.delete(id); }
    });
}


function drawGame(deltaTime) {
    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me) {
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }


    const viewportW = canvas.width / SCALE; 
    const viewportH = canvas.height / SCALE;


    let cameraX = me.x - viewportW / 2;
    let cameraY = me.y - viewportH / 2;


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


    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);


    ctx.save();
    ctx.translate(-clientState.cameraX, -clientState.cameraY); 


    if (clientState.mapRenderer) {
        clientState.mapRenderer.draw(ctx, clientState.cameraX, clientState.cameraY);
    }


    clientState.serverSnapshot.bullets.forEach(b => {
        const bullet = new Bullet(b.id, b.x, b.y);
        bullet.draw(ctx);
    });


    clientState.interpolatedEntities.zombies.forEach(z => {
        z.draw(ctx);
    });


    clientState.interpolatedEntities.players.forEach(p => {
        p.draw(ctx);
    });


    ctx.restore();


    drawHUD(me);

    // CAMBIADO: 'if (touchState.isTouchDevice)'
    if (touchState.currentControlMethod === 'touch') {
        drawJoysticks();
    }
}


function drawJoysticks() {
    if (touchState.move.active) {
        const move = touchState.move;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(move.centerX, move.centerY, JOYSTICK_RADIUS, 0, Math.PI * 2);
        ctx.fill();


        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(move.currentX, move.currentY, KNOB_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }


    if (touchState.aim.active) {
        const aim = touchState.aim;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(aim.centerX, aim.centerY, JOYSTICK_RADIUS, 0, Math.PI * 2);
        ctx.fill();


        ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(aim.currentX, aim.currentY, KNOB_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }
}


/**
 * Dibuja el HUD (Puntuación, Vida) y el Minimapa.
 */
function drawHUD(player) {
    const { serverSnapshot } = clientState;


    // 1. Dibujar la barra superior de información
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, 40);


    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';


    ctx.textAlign = 'left';
    ctx.fillText(`Vida: ${player && player.health > 0 ? player.health : 0} | Kills: ${player ? player.kills : 0}`, 10, 25);


    ctx.textAlign = 'center';
    ctx.fillText(`Puntuación: ${serverSnapshot.score} | Oleada: ${serverSnapshot.wave}`, canvas.width / 2, 25);


    ctx.textAlign = 'right';
    let xRight = canvas.width - 10;


    const myInfo = clientState.playersInLobby?.find(p => p.id === clientState.me.id);
    const myName = myInfo ? myInfo.name : 'Desconocido';


    ctx.fillStyle = player?.health > 0 ? 'cyan' : '#F44336';
    ctx.fillText(`${myName}: ${clientState.me.id?.substring(0, 4)}`, xRight, 25);


    // 2. Dibujar el minimapa
    drawMinimap(ctx, player);
}


/**
 * Crea el canvas de fondo para el minimapa (solo se llama una vez)
 */
function createMinimapBackground() {
    if (!clientState.mapRenderer) return;

    const mapData = clientState.mapRenderer.map;
    const gridSize = mapData.length;

    // Crear un canvas del tamaño exacto de la cuadrícula
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = gridSize;
    mapCanvas.height = gridSize;
    const mapCtx = mapCanvas.getContext('2d');

    // Dibujar el fondo (muros)
    mapCtx.fillStyle = '#222'; // Color del muro
    mapCtx.fillRect(0, 0, gridSize, gridSize);

    // Dibujar el suelo
    mapCtx.fillStyle = '#555'; // Color del suelo (más claro que el muro)
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (mapData[y][x] === 0) { // 0 = Suelo
                mapCtx.fillRect(x, y, 1, 1);
            }
        }
    }

    clientState.minimapCanvas = mapCanvas;
}


/**
 * Dibuja el minimapa en la esquina superior derecha.
 */
function drawMinimap(ctx, me) {
    if (!clientState.mapRenderer || !clientState.minimapCanvas || !me) {
        return; // Aún no estamos listos para dibujar
    }

    const MINIMAP_SIZE = 150; // Tamaño del minimapa en píxeles
    const MINIMAP_MARGIN = 20; // Margen desde los bordes

    // Posición debajo de la barra de HUD (40px)
    const minimapX = canvas.width - MINIMAP_SIZE - MINIMAP_MARGIN;
    const minimapY = 40 + MINIMAP_MARGIN;

    const mapWorldSize = clientState.mapRenderer.mapWorldSize;

    // Ratio para convertir coordenadas del mundo a coordenadas del minimapa
    const ratio = MINIMAP_SIZE / mapWorldSize;

    // 1. Guardar contexto y crear un área de recorte (clipping)
    ctx.save();
    ctx.beginPath();
    ctx.rect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.clip(); // No dibujar nada fuera de este rectángulo

    // 2. Dibujar el fondo del minimapa (el canvas pre-renderizado)
    // Esto es muy rápido porque es solo una imagen
    ctx.drawImage(clientState.minimapCanvas, minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

    // 3. Dibujar Zombies
    ctx.fillStyle = '#F44336'; // Rojo
    clientState.interpolatedEntities.zombies.forEach(zombie => {
        const dotX = minimapX + (zombie.x * ratio);
        const dotY = minimapY + (zombie.y * ratio);
        ctx.fillRect(dotX - 1, dotY - 1, 2, 2); // Punto de 2x2
    });

    // 4. Dibujar otros jugadores
    ctx.fillStyle = '#e34747'; // Rojo claro (color de 'otros' en entities.js)
    clientState.interpolatedEntities.players.forEach(player => {
        if (player.id === me.id) return; // Saltar, 'me' se dibuja al final
        const dotX = minimapX + (player.x * ratio);
        const dotY = minimapY + (player.y * ratio);
        ctx.fillRect(dotX - 1, dotY - 1, 3, 3); // Punto de 3x3
    });

    // 5. Dibujar al jugador local (encima de todo)
    ctx.fillStyle = '#2596be'; // Azul cian (color de 'me' en entities.js)
    const meDotX = minimapX + (me.x * ratio);
    const meDotY = minimapY + (me.y * ratio);
    ctx.fillRect(meDotX - 2, meDotY - 2, 4, 4); // Punto de 4x4 (más grande)

    // 6. Restaurar el contexto (quitar el clipping)
    ctx.restore();

    // 7. Dibujar el borde (después de restaurar)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
}


// --- INTERFAZ Y LOBBY ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
}


window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 


function updateUI() {
    const menuScreen = document.getElementById('menuScreen');
    const settingsScreen = document.getElementById('settingsScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const roomListScreen = document.getElementById('roomListScreen'); // NUEVO

    menuScreen.style.display = 'none';
    settingsScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    roomListScreen.style.display = 'none'; // NUEVO
    canvas.style.display = 'none';


    if (clientState.currentState === 'menu') {
        menuScreen.style.display = 'flex';
    } else if (clientState.currentState === 'settings') {
        settingsScreen.style.display = 'flex';
    } else if (clientState.currentState === 'lobby') {
        lobbyScreen.style.display = 'flex';
        updateLobbyDisplay();
    } else if (clientState.currentState === 'playing') {
        canvas.style.display = 'block';
    } else if (clientState.currentState === 'gameOver') {
        gameOverScreen.style.display = 'flex';
    } else if (clientState.currentState === 'roomList') { // NUEVO
        roomListScreen.style.display = 'flex';
    }
}


function updateLobbyDisplay() {
    const playerList = document.getElementById('lobbyPlayerList');
    const startButton = document.getElementById('startButton');
    const hostConfigInfo = document.getElementById('hostConfigInfo');


    if (clientState.currentState !== 'lobby') return;


    playerList.innerHTML = '';
    clientState.playersInLobby.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} ${p.isHost ? '(Host)' : ''}`;
        li.style.color = p.id === clientState.me.id ? 'cyan' : 'white';
        playerList.appendChild(li);
    });


    if (clientState.me.isHost) { 
        startButton.style.display = 'block';
        startButton.disabled = clientState.playersInLobby.length < 1;
        hostConfigInfo.style.display = 'block';
        document.getElementById('configSummary').textContent = getConfigSummary();
    } else {
        startButton.style.display = 'none';
        hostConfigInfo.style.display = 'none';
    }


    document.getElementById('lobbyRoomId').textContent = `Sala ID: ${clientState.roomId}`;
}

/**
 * NUEVA FUNCIÓN: Rellena la lista de salas activas
 */
function populateRoomList(games) {
    const container = document.getElementById('roomListContainer');
    if (!container) return;

    container.innerHTML = ''; // Limpiar lista anterior

    if (games.length === 0) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">No hay salas activas. ¡Crea una!</p>';
        return;
    }

    games.forEach(game => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';

        // Info de la sala
        const roomInfo = document.createElement('div');
        roomInfo.className = 'room-info';
        roomInfo.innerHTML = `
            <strong>Sala: ${game.id}</strong>
            <span>Host: ${game.hostName} (${game.playerCount} jugador${game.playerCount > 1 ? 'es' : ''})</span>
        `;

        // Botón de unirse
        const joinButton = document.createElement('button');
        joinButton.textContent = 'Unirse';
        joinButton.className = 'room-join-button';
        joinButton.onclick = () => {
            const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
            clientState.me.name = playerName;
            socket.emit('joinGame', game.id, playerName);
        };

        roomItem.appendChild(roomInfo);
        roomItem.appendChild(joinButton);
        container.appendChild(roomItem);
    });
}


// --- SOCKET.IO LISTENERS ---
socket.on('connect', () => {
    clientState.me.id = socket.id;
    console.log(`[CLIENTE] Conectado: ${socket.id}`);
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
    // No usamos alert, mostramos error en el input de ID
    const input = document.getElementById('roomIdInput');
    if (input) {
        input.value = '';
        input.placeholder = message.toUpperCase();
        input.style.borderColor = '#F44336';
        input.style.boxShadow = '0 0 10px rgba(244, 67, 54, 0.5)';
        setTimeout(() => {
            input.placeholder = 'UNIRSE POR ID (EJ: ABCD)';
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }, 3000);
    }
    clientState.currentState = 'menu';
    updateUI();
});


socket.on('lobbyUpdate', (game) => {
    clientState.playersInLobby = game.players;
    clientState.me.isHost = game.players.find(p => p.id === clientState.me.id)?.isHost || false;

    // Si estamos en el lobby, actualizamos
    if (clientState.currentState === 'lobby') {
        updateUI();
    }
});


socket.on('gameStarted', (data) => {
    clientState.currentState = 'playing';
    clientState.mapRenderer = new MapRenderer(data.mapData, data.cellSize);

    // Crear el fondo del minimapa (solo una vez)
    createMinimapBackground(); 

    clientState.interpolatedEntities.players.clear();
    clientState.interpolatedEntities.zombies.clear();


    updateUI();
    resizeCanvas(); 


    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
});


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
    console.warn('La partida terminó.');
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

/**
 * NUEVO LISTENER: Recibe la lista de salas del servidor
 */
socket.on('gameList', (games) => {
    populateRoomList(games);
});


// --- LISTENERS DE BOTONES ---
document.getElementById('createGameButton').addEventListener('click', () => {
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    clientState.me.name = playerName;
    socket.emit('createGame', { name: playerName, config: gameConfig });
});

/**
 * NUEVO: Botón para abrir el buscador de salas
 */
document.getElementById('browseGamesButton').addEventListener('click', () => {
    clientState.currentState = 'roomList';
    updateUI();
    // Mostrar un "cargando" y pedir la lista
    const container = document.getElementById('roomListContainer');
    if (container) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">Buscando salas...</p>';
    }
    socket.emit('requestGameList');
});

/**
 * NUEVO: Botón para refrescar la lista de salas
 */
document.getElementById('refreshRoomListButton').addEventListener('click', () => {
    const container = document.getElementById('roomListContainer');
    if (container) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">Refrescando...</p>';
    }
    socket.emit('requestGameList');
});

/**
 * NUEVO: Botón para volver al menú desde la lista de salas
 */
document.getElementById('backToMenuFromRoomListButton').addEventListener('click', () => {
    clientState.currentState = 'menu';
    updateUI();
});


document.getElementById('joinGameButton').addEventListener('click', () => {
    // Esta es ahora "Unirse por ID"
    const roomId = document.getElementById('roomIdInput').value.toUpperCase();
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    if (!roomId || roomId.length !== 4) {
        // Mostrar error visual en lugar de alert
        const input = document.getElementById('roomIdInput');
        input.style.borderColor = '#F44336';
        input.style.boxShadow = '0 0 10px rgba(244, 67, 54, 0.5)';
        setTimeout(() => {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }, 2000);
        return;
    }
    clientState.me.name = playerName;
    socket.emit('joinGame', roomId, playerName);
});


document.getElementById('settingsButton').addEventListener('click', () => {
    clientState.currentState = 'settings';
    updateUI();
});


document.getElementById('saveSettingsButton').addEventListener('click', () => {
    readConfigFromUI();
    saveConfig();
    updateControlMethod(); // ACTUALIZAR método de control al guardar
    clientState.currentState = 'menu';
    updateUI();
});


document.getElementById('resetSettingsButton').addEventListener('click', () => {
    // Guardar el controlType actual para no resetearlo
    const currentControl = gameConfig.controlType;
    gameConfig = {...DEFAULT_CONFIG};
    // Restaurarlo
    gameConfig.controlType = currentControl;

    applyConfigToUI();
    saveConfig();
    updateControlMethod(); // ACTUALIZAR
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
loadConfig(); // Esto ahora llama a updateControlMethod() internamente
updateUI();
requestAnimationFrame(gameLoopRender);