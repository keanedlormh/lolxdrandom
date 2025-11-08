/**
 * client/js/game.js - CORREGIDO v1.5
 *
 * ¡FALLO CRÍTICO CORREGIDO!
 * - La función `updateUI` estaba intentando mostrar/ocultar
 * `canvas` en lugar de su contenedor `gameScreen`.
 * - Añadida la variable `gameScreen` al inicio.
 * - `updateUI` ahora oculta `gameScreen` por defecto y lo
 * muestra cuando `currentState === 'playing'`.
 */


const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameScreen = document.getElementById('gameScreen'); // <-- AÑADIDO


const SCALE = 1.0; 
window.SCALE = SCALE;
const SERVER_TICK_RATE = 30;


// v1.4: Configuración por defecto
const DEFAULT_CONFIG = {
    controlType: 'auto',
    playerHealth: 100,
    playerSpeed: 6,
    shootCooldown: 150,
    bulletDamage: 10,
    bulletSpeed: 25,
    mapSize: 60,
    roomCount: 6,
    corridorWidth: 3,
    zombieHealth: 30,
    zombieSpeed: 3,
    zombieAttack: 10,
    zombieAttackCooldown: 1000,
    initialZombies: 10,       // Fase 1 (Oleada 1)
    waveMultiplier: 1.5,      // Aum. Fase 1
    coreBaseHealth: 500,
    coreBaseSpawnRate: 5000,  // Ritmo Fase 2 (Oleada 1)
    coreBurstSpawnMultiplier: 2.5 // Multiplicador Ritmo Fase 1
};


// Configuración actual del juego
let gameConfig = {...DEFAULT_CONFIG};


// Cargar configuración guardada del localStorage
function loadConfig() {
    const saved = localStorage.getItem('zombieGameConfig');
    if (saved) {
        try {
            gameConfig = {...DEFAULT_CONFIG, ...JSON.parse(saved)};
        } catch (e) {
            console.warn('Error cargando configuración, usando defaults:', e);
            gameConfig = {...DEFAULT_CONFIG};
        }
    }
    applyConfigToUI();
    updateControlMethod();
}


// Guardar configuración en localStorage
function saveConfig() {
    localStorage.setItem('zombieGameConfig', JSON.stringify(gameConfig));
}


// --- v1.5: MODIFICADO ---
// Aplicar configuración a los inputs del UI (ahora sliders)
function applyConfigToUI() {
    // Local
    document.getElementById('setting_controlType').value = gameConfig.controlType;

    // Jugador y Combate
    document.getElementById('setting_playerHealth').value = gameConfig.playerHealth;
    document.getElementById('setting_playerHealth_value').textContent = gameConfig.playerHealth;
    
    document.getElementById('setting_playerSpeed').value = gameConfig.playerSpeed;
    document.getElementById('setting_playerSpeed_value').textContent = gameConfig.playerSpeed.toFixed(1);

    document.getElementById('setting_shootCooldown').value = gameConfig.shootCooldown;
    document.getElementById('setting_shootCooldown_value').textContent = `${gameConfig.shootCooldown} ms`;

    document.getElementById('setting_bulletDamage').value = gameConfig.bulletDamage;
    document.getElementById('setting_bulletDamage_value').textContent = gameConfig.bulletDamage;
    
    document.getElementById('setting_bulletSpeed').value = gameConfig.bulletSpeed;
    document.getElementById('setting_bulletSpeed_value').textContent = gameConfig.bulletSpeed;

    // Mapa
    document.getElementById('setting_mapSize').value = gameConfig.mapSize;
    document.getElementById('setting_roomCount').value = gameConfig.roomCount;
    document.getElementById('setting_roomCount_value').textContent = gameConfig.roomCount;
    document.getElementById('setting_corridorWidth').value = gameConfig.corridorWidth;

    // Enemigos - Zombies
    document.getElementById('setting_zombieHealth').value = gameConfig.zombieHealth;
    document.getElementById('setting_zombieHealth_value').textContent = gameConfig.zombieHealth;
    
    document.getElementById('setting_zombieSpeed').value = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieSpeed_value').textContent = gameConfig.zombieSpeed.toFixed(1);

    document.getElementById('setting_zombieAttack').value = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttack_value').textContent = gameConfig.zombieAttack;

    document.getElementById('setting_zombieAttackCooldown').value = gameConfig.zombieAttackCooldown;
    document.getElementById('setting_zombieAttackCooldown_value').textContent = `${gameConfig.zombieAttackCooldown} ms`;
    
    // Enemigos - Oleadas y Núcleo
    const waveMultiplierSlider = Math.round((gameConfig.waveMultiplier - 1) * 100);
    document.getElementById('setting_waveMultiplier_slider').value = waveMultiplierSlider;
    document.getElementById('waveMultiplierValue').textContent = `+${waveMultiplierSlider}%`;
    document.getElementById('setting_waveMultiplier').value = gameConfig.waveMultiplier; // hidden input

    const burstMultiplierSlider = gameConfig.coreBurstSpawnMultiplier * 100;
    document.getElementById('setting_coreBurstSpawnMultiplier_slider').value = burstMultiplierSlider;
    document.getElementById('coreBurstSpawnMultiplierValue').textContent = `x${gameConfig.coreBurstSpawnMultiplier.toFixed(1)}`;
    document.getElementById('setting_coreBurstSpawnMultiplier').value = gameConfig.coreBurstSpawnMultiplier; // hidden input

    document.getElementById('setting_coreBaseHealth').value = gameConfig.coreBaseHealth;
    document.getElementById('setting_coreBaseHealth_value').textContent = gameConfig.coreBaseHealth;
    
    document.getElementById('setting_initialZombies').value = gameConfig.initialZombies;
    document.getElementById('setting_initialZombies_value').textContent = gameConfig.initialZombies;

    document.getElementById('setting_coreBaseSpawnRate').value = gameConfig.coreBaseSpawnRate;
    document.getElementById('setting_coreBaseSpawnRate_value').textContent = `${gameConfig.coreBaseSpawnRate} ms`;
}


// --- v1.5: MODIFICADO ---
// Leer configuración desde el UI (ahora sliders)
function readConfigFromUI() {
    gameConfig.controlType = document.getElementById('setting_controlType').value;

    // Jugador y Combate
    gameConfig.playerHealth = parseInt(document.getElementById('setting_playerHealth').value);
    gameConfig.playerSpeed = parseFloat(document.getElementById('setting_playerSpeed').value);
    gameConfig.shootCooldown = parseInt(document.getElementById('setting_shootCooldown').value);
    gameConfig.bulletDamage = parseInt(document.getElementById('setting_bulletDamage').value);
    gameConfig.bulletSpeed = parseInt(document.getElementById('setting_bulletSpeed').value);

    // Mapa
    gameConfig.mapSize = parseInt(document.getElementById('setting_mapSize').value);
    gameConfig.roomCount = parseInt(document.getElementById('setting_roomCount').value);
    gameConfig.corridorWidth = parseInt(document.getElementById('setting_corridorWidth').value);
    
    // Enemigos - Zombies
    gameConfig.zombieHealth = parseInt(document.getElementById('setting_zombieHealth').value);
    gameConfig.zombieSpeed = parseFloat(document.getElementById('setting_zombieSpeed').value);
    gameConfig.zombieAttack = parseInt(document.getElementById('setting_zombieAttack').value);
    gameConfig.zombieAttackCooldown = parseInt(document.getElementById('setting_zombieAttackCooldown').value);
    
    // Enemigos - Oleadas y Núcleo
    const waveMultiplierSlider = parseInt(document.getElementById('setting_waveMultiplier_slider').value);
    gameConfig.waveMultiplier = 1 + (waveMultiplierSlider / 100);
    
    const burstMultiplierSlider = parseInt(document.getElementById('setting_coreBurstSpawnMultiplier_slider').value);
    gameConfig.coreBurstSpawnMultiplier = burstMultiplierSlider / 100;

    gameConfig.coreBaseHealth = parseInt(document.getElementById('setting_coreBaseHealth').value);
    gameConfig.initialZombies = parseInt(document.getElementById('setting_initialZombies').value);
    gameConfig.coreBaseSpawnRate = parseInt(document.getElementById('setting_coreBaseSpawnRate').value);
}


// --- v1.5: MODIFICADO ---
// Presets de dificultad (ajustados a v1.4)
window.applyPreset = function(preset) {
    let presetSettings = {};
    switch(preset) {
        case 'easy':
            presetSettings = {
                playerHealth: 150, playerSpeed: 7, shootCooldown: 100,
                bulletDamage: 15, bulletSpeed: 30,
                zombieHealth: 20, zombieSpeed: 2.5, zombieAttack: 5, zombieAttackCooldown: 1500,
                initialZombies: 8, waveMultiplier: 1.2, // +20%
                coreBaseHealth: 400, coreBaseSpawnRate: 6000,
                coreBurstSpawnMultiplier: 2.0 // x2
            };
            break;
        case 'normal':
            presetSettings = {...DEFAULT_CONFIG};
            delete presetSettings.controlType; 
            break;
        case 'hard':
            presetSettings = {
                playerHealth: 80, playerSpeed: 5.5, shootCooldown: 200,
                bulletDamage: 8, bulletSpeed: 20,
                zombieHealth: 40, zombieSpeed: 3.5, zombieAttack: 15, zombieAttackCooldown: 800,
                initialZombies: 12, waveMultiplier: 1.7, // +70%
                coreBaseHealth: 750, coreBaseSpawnRate: 4000,
                coreBurstSpawnMultiplier: 3.5 // x3.5
            };
            break;
    }
    gameConfig = {...gameConfig, ...presetSettings};
    applyConfigToUI();
};


// Generar resumen de configuración
function getConfigSummary() {
    // v1.4: Resumen actualizado
    return `
        Jugador: ${gameConfig.playerHealth}HP, Vel ${gameConfig.playerSpeed} | 
        Zombies: ${gameConfig.zombieHealth}HP, Vel ${gameConfig.zombieSpeed} | 
        Núcleo: ${gameConfig.coreBaseHealth}HP (Oleada 1) | 
        Mapa: ${gameConfig.mapSize}x${gameConfig.mapSize}, ${gameConfig.roomCount} salas
    `;
}


// --- CONFIGURACIÓN DE JOYSTICK TÁCTIL ---
const JOYSTICK_RADIUS = 70;
const KNOB_RADIUS = 30;


const touchState = {
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    currentControlMethod: 'auto',
    move: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 },
    aim: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 }
};


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
        zombieCore: null, // v1.3
        score: 0,
        wave: 1
    },
    interpolatedEntities: {
        players: new Map(),
        zombies: new Map(),
        zombieCore: null // v1.3
    },
    mapRenderer: null,
    minimapCanvas: null,
    cameraX: 0, 
    cameraY: 0,
    // v1.4: Estado del jugador
    amIDead: false,
    amISpectating: false,
    cameraTargetId: null, // A quién estamos mirando
    // Input
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
    // v1.4: No enviar input si estamos muertos o espectando
    if (clientState.amIDead || clientState.amISpectating) {
        // Enviar un input "vacío" para que el servidor no use el último
        socket.emit('playerInput', {
            moveX: 0, moveY: 0, shootX: 1, shootY: 0, isShooting: false
        });
        return;
    }

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
const moveKeys = {
    'w': { dy: -1 }, 's': { dy: 1 },
    'a': { dx: -1 }, 'd': { dx: 1 },
};
const keysPressed = new Set();


document.addEventListener('keydown', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; 
    const key = e.key.toLowerCase();
    if (moveKeys[key]) {
        keysPressed.add(key);
        updateMoveInput();
        e.preventDefault();
    }
});


document.addEventListener('keyup', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return; 
    const key = e.key.toLowerCase();
    if (moveKeys[key]) {
        keysPressed.delete(key);
        updateMoveInput();
    }
});


function updateMoveInput() {
    if (touchState.currentControlMethod !== 'keyboard') { 
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
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return;

    // v1.4: No apuntar si estamos muertos
    if (clientState.amIDead || clientState.amISpectating) return;

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me || clientState.cameraX === undefined || clientState.cameraY === undefined) {
        return;
    }


    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; 
    const mouseY = e.clientY - rect.top;


    const playerScreenX = me.x - clientState.cameraX;
    const playerScreenY = me.y - clientState.cameraY;


    let shootX = mouseX - playerScreenX;
    let shootY = mouseY - playerScreenY;


    const length = Math.sqrt(shootX ** 2 + shootY ** 2);
    if (length > 0.1) { 
        clientState.input.shootX = shootX / length;
        clientState.input.shootY = shootY / length;


        if (me) {
            me.shootX = clientState.input.shootX;
            me.shootY = clientState.input.shootY;
        }
    }
}


canvas.addEventListener('mousemove', calculateAimVector);


canvas.addEventListener('mousedown', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return;
    // v1.4: No disparar si estamos muertos
    if (clientState.amIDead || clientState.amISpectating) return;
    
    if (e.button === 0) {
        clientState.input.isShooting = true;
    }
});


canvas.addEventListener('mouseup', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return;
    if (e.button === 0) {
        clientState.input.isShooting = false;
    }
});


// --- LÓGICA TÁCTIL (JOYSTICKS) ---
canvas.addEventListener('touchstart', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return;
    e.preventDefault();

    // v1.4: No controlar si estamos muertos
    if (clientState.amIDead || clientState.amISpectating) return;

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
}, { passive: false });


canvas.addEventListener('touchmove', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return;
    e.preventDefault();

    // v1.4: No controlar si estamos muertos
    if (clientState.amIDead || clientState.amISpectating) return;

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
}, { passive: false });


canvas.addEventListener('touchend', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return;
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
}, { passive: false });


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
    if (animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
}


function interpolateEntities(factor) {
    const { serverSnapshot, interpolatedEntities } = clientState;
    const serverPlayerIds = new Set();
    const serverZombieIds = new Set();

    // v1.4: Resetear estados de espectador/muerte
    clientState.amIDead = true;
    clientState.amISpectating = true;
    let livingPlayerFound = false;

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

        // v1.4: Actualizar mi estado
        if (isMe) {
            clientState.amISpectating = p_server.isSpectating; // v1.4
            clientState.amIDead = !p_server.isSpectating && p_server.health <= 0;
        }
        if (p_server.health > 0 && !p_server.isSpectating) {
            livingPlayerFound = true;
            clientState.cameraTargetId = p_server.id; // v1.4: Encontrar un jugador vivo para mirar
        }

        p_client.prevX = p_client.x;
        p_client.prevY = p_client.y;
        p_client.targetX = p_server.x;
        p_client.targetY = p_server.y;
        p_client.health = p_server.health;
        p_client.kills = p_server.kills;
        p_client.isSpectating = p_server.isSpectating; // v1.4

        if (!isMe || touchState.currentControlMethod === 'keyboard') {
            p_client.shootX = p_server.shootX;
            p_client.shootY = p_server.shootY;
        }


        p_client.x = lerp(p_client.prevX, p_client.targetX, factor);
        p_client.y = lerp(p_client.prevY, p_client.targetY, factor);
    });

    // v1.4: Si no hay jugadores vivos, la cámara se queda en el último ID (o 'me')
    if (!livingPlayerFound) {
        clientState.cameraTargetId = clientState.me.id;
    }

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


    // v1.3: Interpolar el Núcleo Zombie
    const core_server = serverSnapshot.zombieCore;
    let core_client = interpolatedEntities.zombieCore;


    if (core_server) {
        if (!core_client) {
            core_client = new ZombieCore(core_server.id, core_server.x, core_server.y, core_server.size);
            interpolatedEntities.zombieCore = core_client;
        }
        // El núcleo no se mueve, solo actualiza la vida
        core_client.health = core_server.health;
        core_client.maxHealth = core_server.maxHealth;
    } else {
        interpolatedEntities.zombieCore = null; // El núcleo fue destruido
    }


    interpolatedEntities.players.forEach((_, id) => {
        if (!serverPlayerIds.has(id)) { interpolatedEntities.players.delete(id); }
    });


    interpolatedEntities.zombies.forEach((_, id) => {
        if (!serverZombieIds.has(id)) { interpolatedEntities.zombies.delete(id); }
    });
}


function drawGame(deltaTime) {
    // v1.4: Lógica de cámara modificada
    let cameraTarget;
    if (clientState.amIDead || clientState.amISpectating) {
        // Estamos muertos o espectando -> mirar a un compañero
        cameraTarget = interpolatedEntities.players.get(clientState.cameraTargetId);
    } else {
        // Estamos vivos -> usar nuestra propia posición
        cameraTarget = interpolatedEntities.players.get(clientState.me.id);
    }

    if (!cameraTarget) {
        // Fallback: si el objetivo no existe (ej. justo al conectarse)
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }
    // --- Fin lógica v1.4 ---

    const viewportW = canvas.width / SCALE; 
    const viewportH = canvas.height / SCALE;


    let cameraX = cameraTarget.x - viewportW / 2;
    let cameraY = cameraTarget.y - viewportH / 2;


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

    // v1.3: Dibujar el Núcleo
    if (clientState.interpolatedEntities.zombieCore) {
        clientState.interpolatedEntities.zombieCore.draw(ctx);
    }

    // v1.4: Dibujar jugadores (y mostrar si están muertos)
    clientState.interpolatedEntities.players.forEach(p => {
        if (p.isSpectating) return; // No dibujar espectadores
        
        ctx.globalAlpha = (p.health <= 0) ? 0.4 : 1.0;
        p.draw(ctx);
        ctx.globalAlpha = 1.0;
    });


    ctx.restore();


    // v1.4: Pasar 'me' (jugador local) al HUD
    const me = interpolatedEntities.players.get(clientState.me.id);
    drawHUD(me); // 'me' puede ser undefined si acabamos de unirnos


    // v1.4: No dibujar joysticks si estamos muertos
    if (touchState.currentControlMethod === 'touch' && !clientState.amIDead && !clientState.amISpectating) {
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


// v1.5: Tamaño del minimapa como constante global
const MINIMAP_SIZE = 150; // Tamaño del minimapa en píxeles


/**
 * Dibuja el HUD (Puntuación, Vida) y el Minimapa.
 * --- v1.5: REDISEÑADO PARA NUEVO LAYOUT ---
 * --- v1.4: MODIFICADO para estado espectador ---
 */
function drawHUD(player) { // 'player' es el jugador local
    const { serverSnapshot } = clientState;
    
    // --- NUEVA LÓGICA DE LAYOUT ---
    
    // 1. Definir tamaños
    const isMobileLayout = canvas.width < 700;
    const barHeight = isMobileLayout ? 60 : 40; // Barra más alta en móvil
    const hudWidth = canvas.width - MINIMAP_SIZE; // Ancho dinámico para la barra
    
    const baseFontSize = isMobileLayout ? 16 : 18;
    const padding = 10;
    const line1Y = isMobileLayout ? 22 : 25;
    const line2Y = 45; // Solo para móvil


    // 2. Dibujar el fondo de la barra de HUD (izquierda)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, hudWidth, barHeight);


    ctx.fillStyle = 'white';
    ctx.font = `bold ${baseFontSize}px Arial`;


    // 3. Bloque 1: Info del Jugador (Vida/Kills)
    ctx.textAlign = 'left';
    // v1.4: Mostrar info aunque 'player' sea null (recién unido)
    const health = (player && player.health > 0) ? player.health : 0;
    const kills = player ? player.kills : 0;
    ctx.fillText(`Vida: ${health} | Kills: ${kills}`, padding, line1Y);


    // 4. Bloque 2: Info de Partida (Puntuación/Oleada)
    const scoreText = `Puntuación: ${serverSnapshot.score} | Oleada: ${serverSnapshot.wave}`;
    
    if (isMobileLayout) {
        // En móvil: Poner en la segunda línea
        ctx.textAlign = 'left';
        ctx.fillText(scoreText, padding, line2Y);
    } else {
        // En escritorio: Poner en el centro de la barra
        ctx.textAlign = 'center';
        ctx.fillText(scoreText, hudWidth / 2, line1Y);
    }


    // 5. Bloque 3: Nombre del Jugador
    ctx.textAlign = 'right';
    const myName = player ? player.name : clientState.me.name;
    ctx.fillStyle = (player && player.health > 0) ? 'cyan' : '#F44336';
    // Alineado a la derecha del *ancho del HUD*, no del canvas
    ctx.fillText(`${myName}`, hudWidth - padding, line1Y);

    // v1.4: Mensaje de Espectador/Muerto
    if (clientState.amIDead || clientState.amISpectating) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, barHeight, canvas.width, 40);

        ctx.fillStyle = clientState.amIDead ? '#FF4500' : '#00FFFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        const message = clientState.amIDead ? '¡ESTÁS MUERTO!' : 'ESPECTANDO...';
        ctx.fillText(message, canvas.width / 2, barHeight + 28);
        
        // v1.4: Mostrar oleada correcta
        const nextWave = serverSnapshot.zombieCore ? serverSnapshot.wave : serverSnapshot.wave + 1;
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText(`Esperando al inicio de la oleada ${nextWave}...`, canvas.width / 2, barHeight + 55);
    }


    // 6. Dibujar el minimapa (ahora sin argumentos)
    drawMinimap(ctx, player);
}


function createMinimapBackground() {
    if (!clientState.mapRenderer) return;
    const mapData = clientState.mapRenderer.map;
    const gridSize = mapData.length;
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = gridSize;
    mapCanvas.height = gridSize;
    const mapCtx = mapCanvas.getContext('2d');
    mapCtx.fillStyle = '#222';
    mapCtx.fillRect(0, 0, gridSize, gridSize);
    mapCtx.fillStyle = '#555';
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (mapData[y][x] === 0) {
                mapCtx.fillRect(x, y, 1, 1);
            }
        }
    }
    clientState.minimapCanvas = mapCanvas;
}


/**
 * Dibuja el minimapa en la esquina superior derecha.
 * --- v1.5: MODIFICADO ---
 */
function drawMinimap(ctx, me) { // 'me' es el jugador local
    if (!clientState.mapRenderer || !clientState.minimapCanvas) {
        return;
    }


    const minimapX = canvas.width - MINIMAP_SIZE;
    const minimapY = 0; 


    const mapWorldSize = clientState.mapRenderer.mapWorldSize;
    const ratio = MINIMAP_SIZE / mapWorldSize;


    ctx.save();
    ctx.beginPath();
    ctx.rect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.clip();


    // Fondo
    ctx.drawImage(clientState.minimapCanvas, minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);


    // v1.3: Núcleo
    if (clientState.interpolatedEntities.zombieCore) {
        const core = clientState.interpolatedEntities.zombieCore;
        ctx.fillStyle = '#FF00FF'; // Violeta
        const coreDotX = minimapX + (core.x * ratio);
        const coreDotY = minimapY + (core.y * ratio);
        ctx.fillRect(coreDotX - 2, coreDotY - 2, 4, 4);
    }


    // Zombies
    ctx.fillStyle = '#F44336';
    clientState.interpolatedEntities.zombies.forEach(zombie => {
        const dotX = minimapX + (zombie.x * ratio);
        const dotY = minimapY + (zombie.y * ratio);
        ctx.fillRect(dotX - 1, dotY - 1, 2, 2);
    });


    // Otros jugadores
    ctx.fillStyle = '#477be3'; // Azul oscuro
    clientState.interpolatedEntities.players.forEach(player => {
        if ((me && player.id === me.id) || player.isSpectating || player.health <= 0) return; // v1.4
        const dotX = minimapX + (player.x * ratio);
        const dotY = minimapY + (player.y * ratio);
        ctx.fillRect(dotX - 1, dotY - 1, 3, 3);
    });


    // Jugador local
    if (me && me.health > 0 && !me.isSpectating) { // v1.4
        ctx.fillStyle = '#2596be'; // Azul cian
        const meDotX = minimapX + (me.x * ratio);
        const meDotY = minimapY + (me.y * ratio);
        ctx.fillRect(meDotX - 2, meDotY - 2, 4, 4);
    }


    ctx.restore();


    // Borde
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


// --- v1.5: CORRECCIÓN ---
function updateUI() {
    const menuScreen = document.getElementById('menuScreen');
    const settingsScreen = document.getElementById('settingsScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const roomListScreen = document.getElementById('roomListScreen');


    menuScreen.style.display = 'none';
    settingsScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    roomListScreen.style.display = 'none';
    gameScreen.style.display = 'none'; // <-- CORREGIDO (era 'canvas.style.display')


    if (clientState.currentState === 'menu') {
        menuScreen.style.display = 'flex';
    } else if (clientState.currentState === 'settings') {
        settingsScreen.style.display = 'flex';
    } else if (clientState.currentState === 'lobby') {
        lobbyScreen.style.display = 'flex';
        updateLobbyDisplay();
    } else if (clientState.currentState === 'playing') {
        gameScreen.style.display = 'block'; // <-- CORREGIDO (era 'canvas.style.display')
    } else if (clientState.currentState === 'gameOver') {
        gameOverScreen.style.display = 'flex';
    } else if (clientState.currentState === 'roomList') {
        roomListScreen.style.display = 'flex';
    }
}
// --- FIN CORRECCIÓN v1.5 ---


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
 * (v1.4) Rellena la lista de salas activas
 */
function populateRoomList(games) {
    const container = document.getElementById('roomListContainer');
    if (!container) return;


    container.innerHTML = '';


    if (games.length === 0) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">No hay salas activas. ¡Crea una!</p>';
        return;
    }


    games.forEach(game => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        // v1.4: Añadir clase si está jugando
        if (game.status === 'playing') {
            roomItem.classList.add('playing');
        }


        const roomInfo = document.createElement('div');
        roomInfo.className = 'room-info';
        // v1.4: Mostrar estado (Lobby / Jugando)
        const statusText = game.status === 'playing' ? `Jugando (Oleada ${game.wave})` : 'En Lobby';
        roomInfo.innerHTML = `
            <strong>Sala: ${game.id}</strong>
            <span>Host: ${game.hostName} (${game.playerCount} jug.)</span>
            <span style="color: ${game.status === 'playing' ? '#FFC107' : '#4CAF50'}; font-weight: bold;">${statusText}</span>
        `;


        const joinButton = document.createElement('button');
        joinButton.textContent = 'Unirse';
        joinButton.className = 'room-join-button';
        // v1.4: Estilo diferente si se une a partida en curso
        if (game.status === 'playing') {
            joinButton.classList.add('join-playing');
            joinButton.textContent = 'Espectar';
        }
        
        joinButton.onclick = () => {
            const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
            clientState.me.name = playerName;
            // v1.4: 'joinGame' ahora maneja unirse a lobby y a partidas en curso
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


// v1.4: Unirse como espectador
socket.on('joinAsSpectator', (gameData) => {
    clientState.currentState = 'playing';
    clientState.roomId = gameData.id;
    clientState.me.isHost = false;
    clientState.playersInLobby = gameData.players; // Lista de jugadores
    
    // Iniciar el juego en modo espectador
    clientState.mapRenderer = new MapRenderer(gameData.mapData.mapData, gameData.mapData.cellSize);
    createMinimapBackground(); 
    clientState.interpolatedEntities.players.clear();
    clientState.interpolatedEntities.zombies.clear();


    updateUI();
    resizeCanvas(); 


    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
});


socket.on('joinFailed', (message) => {
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

    // v1.4: Si estamos espectando (gameOver) y nos mueven al lobby
    if (clientState.currentState === 'gameOver') {
        clientState.currentState = 'lobby';
    }

    if (clientState.currentState === 'lobby') {
        updateUI();
    }
});


socket.on('gameStarted', (data) => {
    clientState.currentState = 'playing';
    clientState.mapRenderer = new MapRenderer(data.mapData, data.cellSize);


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
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    clientState.currentState = 'gameOver';
    document.getElementById('finalScore').textContent = data.finalScore;
    document.getElementById('finalWave').textContent = data.finalWave;
    updateUI();
});


socket.on('gameEnded', () => {
    console.warn('La partida terminó.');
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }


    clientState.currentState = 'menu';
    clientState.roomId = null;
    clientState.me.isHost = false;
    updateUI();
});


socket.on('playerDisconnected', (playerId) => {
    console.log(`Jugador desconectado: ${playerId}`);
});


socket.on('gameList', (games) => {
    populateRoomList(games);
});


// --- LISTENERS DE BOTONES ---
document.getElementById('createGameButton').addEventListener('click', () => {
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    clientState.me.name = playerName;
    readConfigFromUI(); // v1.5: Leer config antes de crear
    saveConfig();
    socket.emit('createGame', { name: playerName, config: gameConfig });
});


document.getElementById('browseGamesButton').addEventListener('click', () => {
    clientState.currentState = 'roomList';
    updateUI();
    const container = document.getElementById('roomListContainer');
    if (container) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">Buscando salas...</p>';
    }
    socket.emit('requestGameList');
});


document.getElementById('refreshRoomListButton').addEventListener('click', () => {
    const container = document.getElementById('roomListContainer');
    if (container) {
        container.innerHTML = '<p style="padding: 20px; color: #aaa; text-align: center;">Refrescando...</p>';
    }
    socket.emit('requestGameList');
});


document.getElementById('backToMenuFromRoomListButton').addEventListener('click', () => {
    clientState.currentState = 'menu';
    updateUI();
});


document.getElementById('joinGameButton').addEventListener('click', () => {
    const roomId = document.getElementById('roomIdInput').value.toUpperCase();
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    if (!roomId || roomId.length !== 4) {
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
    updateControlMethod();
    clientState.currentState = 'menu';
    updateUI();
});


document.getElementById('resetSettingsButton').addEventListener('click', () => {
    const currentControl = gameConfig.controlType;
    gameConfig = {...DEFAULT_CONFIG};
    gameConfig.controlType = currentControl;


    applyConfigToUI();
    saveConfig();
    updateControlMethod();
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
    clientState.roomId = null;
    clientState.me.isHost = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    updateUI();
});


document.getElementById('continueGameButton').addEventListener('click', () => {
    if (clientState.currentState === 'gameOver' && clientState.roomId) {
        socket.emit('returnToLobby', clientState.roomId);
        clientState.currentState = 'lobby';
        updateUI();
    }
});


document.getElementById('exitToMenuButton').addEventListener('click', () => {
    if (clientState.roomId) {
        socket.emit('leaveRoom', clientState.roomId);
    }
    
    clientState.currentState = 'menu';
    clientState.roomId = null;
    clientState.me.isHost = false;
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    updateUI();
});


// --- v1.5: LISTENERS PARA TODOS LOS SLIDERS ---
function setupSliderListener(sliderId, displayId, options = {}) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (!slider || !display) {
        // console.warn(`Slider o display no encontrado: ${sliderId}, ${displayId}`);
        return;
    }

    const { suffix = '', prefix = '', multiplier = 1, fixed = 0 } = options;

    slider.addEventListener('input', (e) => {
        let value = parseFloat(e.target.value);
        let displayValue = (value * multiplier).toFixed(fixed);
        display.textContent = `${prefix}${displayValue}${suffix}`;
    });
}

// Conectar todos los sliders a sus spans
// Se ejecuta una vez que el DOM está cargado
document.addEventListener('DOMContentLoaded', () => {
    // Jugador y Combate
    setupSliderListener('setting_playerHealth', 'setting_playerHealth_value');
    setupSliderListener('setting_playerSpeed', 'setting_playerSpeed_value', { fixed: 1 });
    setupSliderListener('setting_shootCooldown', 'setting_shootCooldown_value', { suffix: ' ms' });
    setupSliderListener('setting_bulletDamage', 'setting_bulletDamage_value');
    setupSliderListener('setting_bulletSpeed', 'setting_bulletSpeed_value');
    
    // Mapa
    setupSliderListener('setting_roomCount', 'setting_roomCount_value');

    // Enemigos - Zombies
    setupSliderListener('setting_zombieHealth', 'setting_zombieHealth_value');
    setupSliderListener('setting_zombieSpeed', 'setting_zombieSpeed_value', { fixed: 1 });
    setupSliderListener('setting_zombieAttack', 'setting_zombieAttack_value');
    setupSliderListener('setting_zombieAttackCooldown', 'setting_zombieAttackCooldown_value', { suffix: ' ms' });

    // Enemigos - Oleadas y Núcleo
    setupSliderListener('setting_waveMultiplier_slider', 'waveMultiplierValue', { prefix: '+', suffix: '%' });
    setupSliderListener('setting_coreBurstSpawnMultiplier_slider', 'coreBurstSpawnMultiplierValue', { prefix: 'x', multiplier: 0.01, fixed: 1 });
    setupSliderListener('setting_coreBaseHealth', 'setting_coreBaseHealth_value');
    setupSliderListener('setting_initialZombies', 'setting_initialZombies_value');
    setupSliderListener('setting_coreBaseSpawnRate', 'setting_coreBaseSpawnRate_value', { suffix: ' ms' });
});
// --- FIN v1.5 ---


// --- INICIO ---
loadConfig();
updateUI();
// El bucle de renderizado se inicia en 'gameStarted'