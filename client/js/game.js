/**
 * client/js/game.js - ACTUALIZADO v1.5
 *
 * 1. (v1.5) Sliders y listeners actualizados.
 * 2. (v1.5) `interpolateEntities()`: Almacena `maxHealth`.
 * 3. (v1.5) Añadido `coreHealthMultiplier` a toda la lógica
 * de configuración (defaults, presets, UI).
 */

const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCALE = 1.0; 
window.SCALE = SCALE;
const SERVER_TICK_RATE = 30;

// --- v1.5: Configuración por defecto actualizada ---
const DEFAULT_CONFIG = {
    controlType: 'auto',
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
    initialZombies: 10,
    waveMultiplier: 1.5,
    coreBaseHealth: 500,
    coreBaseSpawnRate: 5000,
    coreBurstSpawnMultiplier: 2.5,
    coreHealthMultiplier: 1.15 // v1.5: AÑADIDO (15% por oleada)
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

// --- v1.5: MODIFICADO (Soporte para Sliders) ---
function applyConfigToUI() {
    // Config Local
    document.getElementById('setting_controlType').value = gameConfig.controlType;
    
    // Jugador y Combate
    document.getElementById('setting_playerHealth').value = gameConfig.playerHealth;
    document.getElementById('setting_playerHealth_value').textContent = gameConfig.playerHealth;
    document.getElementById('setting_playerSpeed').value = gameConfig.playerSpeed;
    document.getElementById('setting_playerSpeed_value').textContent = gameConfig.playerSpeed;
    document.getElementById('setting_shootCooldown').value = gameConfig.shootCooldown;
    document.getElementById('setting_shootCooldown_value').textContent = `${gameConfig.shootCooldown} ms`;
    document.getElementById('setting_bulletDamage').value = gameConfig.bulletDamage;
    document.getElementById('setting_bulletDamage_value').textContent = gameConfig.bulletDamage;
    document.getElementById('setting_bulletSpeed').value = gameConfig.bulletSpeed;
    document.getElementById('setting_bulletSpeed_value').textContent = gameConfig.bulletSpeed;

    // Opciones del Mapa
    document.getElementById('setting_mapSize').value = gameConfig.mapSize;
    document.getElementById('setting_roomCount').value = gameConfig.roomCount;
    document.getElementById('setting_roomCount_value').textContent = `${gameConfig.roomCount} salas`;
    document.getElementById('setting_corridorWidth').value = gameConfig.corridorWidth;

    // Enemigos (Zombie)
    document.getElementById('setting_zombieHealth').value = gameConfig.zombieHealth;
    document.getElementById('setting_zombieHealth_value').textContent = gameConfig.zombieHealth;
    document.getElementById('setting_zombieSpeed').value = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieSpeed_value').textContent = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieAttack').value = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttack_value').textContent = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttackCooldown').value = gameConfig.zombieAttackCooldown;
    document.getElementById('setting_zombieAttackCooldown_value').textContent = `${gameConfig.zombieAttackCooldown} ms`;

    // Enemigos (Oleada y Núcleo)
    document.getElementById('setting_initialZombies').value = gameConfig.initialZombies;
    document.getElementById('setting_initialZombies_value').textContent = `${gameConfig.initialZombies} zombies`;
    document.getElementById('setting_coreBaseHealth').value = gameConfig.coreBaseHealth;
    document.getElementById('setting_coreBaseHealth_value').textContent = gameConfig.coreBaseHealth;
    document.getElementById('setting_coreBaseSpawnRate').value = gameConfig.coreBaseSpawnRate;
    document.getElementById('setting_coreBaseSpawnRate_value').textContent = `${gameConfig.coreBaseSpawnRate} ms`;

    // v1.5: Añadido slider Aum. Vida Núcleo
    const coreHealthSliderValue = Math.round(gameConfig.coreHealthMultiplier * 100);
    document.getElementById('setting_coreHealthMultiplier_slider').value = coreHealthSliderValue;
    document.getElementById('setting_coreHealthMultiplier_value').textContent = `+${coreHealthSliderValue - 100}%`;
    document.getElementById('setting_coreHealthMultiplier').value = gameConfig.coreHealthMultiplier;

    // Sliders existentes (con lógica de % y x)
    const waveSliderValue = Math.round((gameConfig.waveMultiplier - 1) * 100);
    document.getElementById('setting_waveMultiplier_slider').value = waveSliderValue;
    document.getElementById('waveMultiplierValue').textContent = `+${waveSliderValue}%`;
    document.getElementById('setting_waveMultiplier').value = gameConfig.waveMultiplier;
    
    const burstSliderValue = Math.round(gameConfig.coreBurstSpawnMultiplier * 100);
    document.getElementById('setting_coreBurstSpawnMultiplier_slider').value = burstSliderValue;
    document.getElementById('coreBurstSpawnMultiplierValue').textContent = `x${(burstSliderValue / 100).toFixed(1)}`;
    document.getElementById('setting_coreBurstSpawnMultiplier').value = gameConfig.coreBurstSpawnMultiplier;
}

// --- v1.5: MODIFICADO (Lee de Sliders) ---
function readConfigFromUI() {
    gameConfig.controlType = document.getElementById('setting_controlType').value;
    
    // Jugador y Combate (parseInt/parseFloat funcionan en sliders)
    gameConfig.playerHealth = parseInt(document.getElementById('setting_playerHealth').value);
    gameConfig.playerSpeed = parseFloat(document.getElementById('setting_playerSpeed').value);
    gameConfig.shootCooldown = parseInt(document.getElementById('setting_shootCooldown').value);
    gameConfig.bulletDamage = parseInt(document.getElementById('setting_bulletDamage').value);
    gameConfig.bulletSpeed = parseInt(document.getElementById('setting_bulletSpeed').value);
    
    // Mapa
    gameConfig.mapSize = parseInt(document.getElementById('setting_mapSize').value);
    gameConfig.roomCount = parseInt(document.getElementById('setting_roomCount').value);
    gameConfig.corridorWidth = parseInt(document.getElementById('setting_corridorWidth').value);

    // Zombi
    gameConfig.zombieHealth = parseInt(document.getElementById('setting_zombieHealth').value);
    gameConfig.zombieSpeed = parseFloat(document.getElementById('setting_zombieSpeed').value);
    gameConfig.zombieAttack = parseInt(document.getElementById('setting_zombieAttack').value);
    gameConfig.zombieAttackCooldown = parseInt(document.getElementById('setting_zombieAttackCooldown').value);

    // Núcleo
    gameConfig.initialZombies = parseInt(document.getElementById('setting_initialZombies').value);
    gameConfig.coreBaseHealth = parseInt(document.getElementById('setting_coreBaseHealth').value);
    gameConfig.coreBaseSpawnRate = parseInt(document.getElementById('setting_coreBaseSpawnRate').value);
    
    // v1.5: Añadido
    const coreHealthSliderValue = parseInt(document.getElementById('setting_coreHealthMultiplier_slider').value);
    gameConfig.coreHealthMultiplier = coreHealthSliderValue / 100;

    // Sliders especiales (Ocultos)
    const waveSliderValue = parseInt(document.getElementById('setting_waveMultiplier_slider').value);
    gameConfig.waveMultiplier = 1 + (waveSliderValue / 100);

    const burstSliderValue = parseInt(document.getElementById('setting_coreBurstSpawnMultiplier_slider').value);
    gameConfig.coreBurstSpawnMultiplier = burstSliderValue / 100;
}

// --- v1.5: MODIFICADO (Presets) ---
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
                initialZombies: 8,
                waveMultiplier: 1.3,
                coreBaseHealth: 300,
                coreBaseSpawnRate: 6000,
                coreBurstSpawnMultiplier: 2.0,
                coreHealthMultiplier: 1.10 // v1.5
            };
            break;
        case 'normal':
            presetSettings = {...DEFAULT_CONFIG};
            delete presetSettings.controlType; 
            presetSettings.coreHealthMultiplier = 1.15; // v1.5
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
                initialZombies: 15,
                waveMultiplier: 1.8,
                coreBaseHealth: 1000,
                coreBaseSpawnRate: 3500,
                coreBurstSpawnMultiplier: 4.0,
                coreHealthMultiplier: 1.25 // v1.5
            };
            break;
    }
    gameConfig = {...gameConfig, ...presetSettings};
    applyConfigToUI();
};

function getConfigSummary() {
    return `
        Jugador: ${gameConfig.playerHealth}HP, Vel ${gameConfig.playerSpeed} | 
        Zombies: ${gameConfig.zombieHealth}HP, Vel ${gameConfig.zombieSpeed} | 
        Mapa: ${gameConfig.mapSize}x${gameConfig.mapSize}, ${gameConfig.roomCount} salas
    `;
}

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

const clientState = {
    currentState: 'menu',
    me: { id: null, name: 'Jugador', isHost: false },
    roomId: null,
    serverSnapshot: {
        players: [],
        zombies: [],
        bullets: [],
        score: 0,
        wave: 1,
        zombieCore: null // v1.3
    },
    interpolatedEntities: {
        players: new Map(),
        zombies: new Map()
    },
    zombieCoreEntity: null, // v1.3
    mapRenderer: null,
    minimapCanvas: null,
    cameraX: 0, 
    cameraY: 0,
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

const moveKeys = {
    'w': { dy: -1 }, 's': { dy: 1 },
    'a': { dx: -1 }, 'd': { dx: 1 },
};
const keysPressed = new Set();

document.addEventListener('keydown', (e) => {
    if (clientState.currentState === 'playing' && touchState.currentControlMethod === 'keyboard') {
        const me = clientState.interpolatedEntities.players.get(clientState.me.id);
        if (me && me.health > 0) {
            const key = e.key.toLowerCase();
            if (moveKeys[key]) {
                keysPressed.add(key);
                updateMoveInput();
                e.preventDefault();
            }
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (clientState.currentState === 'playing' && touchState.currentControlMethod === 'keyboard') {
        const key = e.key.toLowerCase();
        if (moveKeys[key]) {
            keysPressed.delete(key);
            updateMoveInput();
        }
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

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me || me.health <= 0) return;

    if (clientState.cameraX === undefined || clientState.cameraY === undefined) {
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

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (me && me.health > 0 && e.button === 0) {
        clientState.input.isShooting = true;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'keyboard') return;
    if (e.button === 0) {
        clientState.input.isShooting = false;
    }
});

canvas.addEventListener('touchstart', (e) => {
    if (clientState.currentState !== 'playing' || touchState.currentControlMethod !== 'touch') return;
    e.preventDefault();

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me || me.health <= 0) return;

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

    const me = clientState.interpolatedEntities.players.get(clientState.me.id);
    if (!me || me.health <= 0) return;

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

        updateCore(); // v1.3
        interpolateEntities(interpolationFactor);

        drawGame(timeSinceLastSnapshot);

        const me = clientState.interpolatedEntities.players.get(clientState.me.id);
        if (me && me.health > 0) {
            sendInputToServer();
        } else {
            clientState.input.isShooting = false;
            clientState.input.moveX = 0;
            clientState.input.moveY = 0;
        }
    }

    lastRenderTime = timestamp;
    if (animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
}

// v1.3
function updateCore() {
    const coreData = clientState.serverSnapshot.zombieCore;

    if (coreData) {
        if (!clientState.zombieCoreEntity) {
            clientState.zombieCoreEntity = new ZombieCore(
                coreData.id,
                coreData.x,
                coreData.y,
                coreData.size,
                coreData.health,
                coreData.maxHealth
            );
        } else {
            const core = clientState.zombieCoreEntity;
            core.x = coreData.x;
            core.y = coreData.y;
            core.health = coreData.health;
            core.maxHealth = coreData.maxHealth;
            core.size = coreData.size;
        }
    } else {
        clientState.zombieCoreEntity = null;
    }
}

// --- v1.5: `interpolateEntities` MODIFICADO ---
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
        p_client.maxHealth = p_server.maxHealth; // <-- v1.5: AÑADIDO
        p_client.kills = p_server.kills;

        p_client.isDead = p_server.isDead;
        p_client.isPending = p_server.isPending;

        if (!isMe || touchState.currentControlMethod === 'keyboard') {
            if (p_client.health > 0) {
                p_client.shootX = p_server.shootX;
                p_client.shootY = p_server.shootY;
            }
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

// --- v1.4: `drawGame` MODIFICADO (Modo Espectador) ---
function drawGame(deltaTime) {
    const me = clientState.interpolatedEntities.players.get(clientState.me.id);

    let cameraTarget = me;

    if (!me || me.health <= 0) {
        const alivePlayer = Array.from(clientState.interpolatedEntities.players.values())
                                .find(p => p.health > 0 && !p.isPending);

        if (alivePlayer) {
            cameraTarget = alivePlayer;
        } else {
            cameraTarget = me; 
        }
    }

    if (!cameraTarget) {
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); 
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawHUD(me); 
        return;
    }

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

    if (clientState.zombieCoreEntity) {
        clientState.zombieCoreEntity.draw(ctx);
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

    if (me && me.health > 0 && touchState.currentControlMethod === 'touch') {
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

const MINIMAP_SIZE = 150; 

// --- v1.4: `drawHUD` MODIFICADO (Mensaje de Espectador) ---
function drawHUD(player) { // 'player' es 'me'
    const { serverSnapshot } = clientState;

    const isMobileLayout = canvas.width < 700;
    const barHeight = isMobileLayout ? 60 : 40; 
    const hudWidth = canvas.width - MINIMAP_SIZE;
    const baseFontSize = isMobileLayout ? 16 : 18;
    const padding = 10;
    const line1Y = isMobileLayout ? 22 : 25;
    const line2Y = 45; 

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, hudWidth, barHeight);

    ctx.fillStyle = 'white';
    ctx.font = `bold ${baseFontSize}px Arial`;

    const health = player && player.health > 0 ? player.health : 0;
    const kills = player ? player.kills : 0;
    ctx.textAlign = 'left';
    ctx.fillText(`Vida: ${health} | Kills: ${kills}`, padding, line1Y);

    const scoreText = `Puntuación: ${serverSnapshot.score} | Oleada: ${serverSnapshot.wave}`;

    if (isMobileLayout) {
        ctx.textAlign = 'left';
        ctx.fillText(scoreText, padding, line2Y);
    } else {
        ctx.textAlign = 'center';
        ctx.fillText(scoreText, hudWidth / 2, line1Y);
    }

    ctx.textAlign = 'right';
    const myName = player ? player.name : (clientState.me.name || 'Jugador');

    ctx.fillStyle = player?.health > 0 ? 'cyan' : '#F44336';
    ctx.fillText(`${myName}`, hudWidth - padding, line1Y);

    drawMinimap(ctx, player); 

    if (!player || player.health <= 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);

        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 24px Orbitron, sans-serif';
        ctx.textAlign = 'center';

        const message = player && player.isPending ? 'UNIÉNDOSE A LA PARTIDA...' : '¡ESTÁS MUERTO!';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 5);

        ctx.fillStyle = 'white';
        ctx.font = '18px Rajdhani, sans-serif';
        ctx.fillText('Esperando a la siguiente oleada...', canvas.width / 2, canvas.height / 2 + 20);
    }
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

// v1.4: 'me' puede ser null, pero 'drawMinimap' debe funcionar
function drawMinimap(ctx, me) { 
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

    ctx.drawImage(clientState.minimapCanvas, minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

    ctx.fillStyle = '#F44336';
    clientState.interpolatedEntities.zombies.forEach(zombie => {
        const dotX = minimapX + (zombie.x * ratio);
        const dotY = minimapY + (zombie.y * ratio);
        ctx.fillRect(dotX - 1, dotY - 1, 2, 2);
    });

    ctx.fillStyle = '#477be3';
    clientState.interpolatedEntities.players.forEach(player => {
        if (me && player.id === me.id) return; 
        ctx.fillRect(minimapX + (player.x * ratio) - 1, minimapY + (player.y * ratio) - 1, 3, 3);
    });

    if (clientState.zombieCoreEntity) {
        ctx.fillStyle = '#FF00FF'; 
        const core = clientState.zombieCoreEntity;
        ctx.fillRect(minimapX + (core.x * ratio) - 2, minimapY + (core.y * ratio) - 2, 5, 5);
    }

    if (me) {
        ctx.fillStyle = '#2596be';
        ctx.fillRect(minimapX + (me.x * ratio) - 2, minimapY + (me.y * ratio) - 2, 4, 4);
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
}

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
    const roomListScreen = document.getElementById('roomListScreen');

    menuScreen.style.display = 'none';
    settingsScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    roomListScreen.style.display = 'none';
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
    } else if (clientState.currentState === 'roomList') {
        roomListScreen.style.display = 'flex';
    }
}

function updateLobbyDisplay() {
    const playerList = document.getElementById('lobbyPlayerList');
    const startButton = document.getElementById('startButton');
    const hostConfigInfo = document.getElementById('hostConfigInfo');

    if (clientState.currentState !== 'lobby') return;

    playerList.innerHTML = '';

    if (clientState.playersInLobby) {
        clientState.playersInLobby.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name} ${p.isHost ? '(Host)' : ''}`;
            li.style.color = p.id === clientState.me.id ? 'cyan' : 'white';
            playerList.appendChild(li);
        });
    }

    if (clientState.me.isHost) { 
        startButton.style.display = 'block';
        startButton.disabled = !clientState.playersInLobby || clientState.playersInLobby.length < 1;
        hostConfigInfo.style.display = 'block';
        document.getElementById('configSummary').textContent = getConfigSummary();
    } else {
        startButton.style.display = 'none';
        hostConfigInfo.style.display = 'none';
    }

    document.getElementById('lobbyRoomId').textContent = `Sala ID: ${clientState.roomId}`;
}

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

        const roomInfo = document.createElement('div');
        roomInfo.className = 'room-info';
        roomInfo.innerHTML = `
            <strong>Sala: ${game.id}</strong>
            <span>Host: ${game.hostName} (${game.playerCount} jugador${game.playerCount > 1 ? 'es' : ''})</span>
        `;

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
    clientState.zombieCoreEntity = null;

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

document.getElementById('createGameButton').addEventListener('click', () => {
    const playerName = document.getElementById('playerNameInput').value || 'Anónimo';
    clientState.me.name = playerName;
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

document.getElementById('setting_waveMultiplier_slider').addEventListener('input', (e) => {
    document.getElementById('waveMultiplierValue').textContent = `+${e.target.value}%`;
});

document.getElementById('setting_coreBurstSpawnMultiplier_slider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value) / 100;
    document.getElementById('coreBurstSpawnMultiplierValue').textContent = `x${value.toFixed(1)}`;
});

// --- v1.5: LISTENERS PARA LOS NUEVOS SLIDERS ---

// Jugador y Combate
document.getElementById('setting_playerHealth').addEventListener('input', (e) => {
    document.getElementById('setting_playerHealth_value').textContent = e.target.value;
});
document.getElementById('setting_playerSpeed').addEventListener('input', (e) => {
    document.getElementById('setting_playerSpeed_value').textContent = e.target.value;
});
document.getElementById('setting_shootCooldown').addEventListener('input', (e) => {
    document.getElementById('setting_shootCooldown_value').textContent = `${e.target.value} ms`;
});
document.getElementById('setting_bulletDamage').addEventListener('input', (e) => {
    document.getElementById('setting_bulletDamage_value').textContent = e.target.value;
});
document.getElementById('setting_bulletSpeed').addEventListener('input', (e) => {
    document.getElementById('setting_bulletSpeed_value').textContent = e.target.value;
});

// Mapa
document.getElementById('setting_roomCount').addEventListener('input', (e) => {
    document.getElementById('setting_roomCount_value').textContent = `${e.target.value} salas`;
});

// Zombi
document.getElementById('setting_zombieHealth').addEventListener('input', (e) => {
    document.getElementById('setting_zombieHealth_value').textContent = e.target.value;
});
document.getElementById('setting_zombieSpeed').addEventListener('input', (e) => {
    document.getElementById('setting_zombieSpeed_value').textContent = e.target.value;
});
document.getElementById('setting_zombieAttack').addEventListener('input', (e) => {
    document.getElementById('setting_zombieAttack_value').textContent = e.target.value;
});
document.getElementById('setting_zombieAttackCooldown').addEventListener('input', (e) => {
    document.getElementById('setting_zombieAttackCooldown_value').textContent = `${e.target.value} ms`;
});

// Núcleo
document.getElementById('setting_coreBaseHealth').addEventListener('input', (e) => {
    document.getElementById('setting_coreBaseHealth_value').textContent = e.target.value;
});
document.getElementById('setting_initialZombies').addEventListener('input', (e) => {
    document.getElementById('setting_initialZombies_value').textContent = `${e.target.value} zombies`;
});
document.getElementById('setting_coreBaseSpawnRate').addEventListener('input', (e) => {
    document.getElementById('setting_coreBaseSpawnRate_value').textContent = `${e.target.value} ms`;
});

// v1.5: Listener para Aum. Vida Núcleo
document.getElementById('setting_coreHealthMultiplier_slider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('setting_coreHealthMultiplier_value').textContent = `+${value - 100}%`;
});

// --- INICIO ---
loadConfig();
updateUI();