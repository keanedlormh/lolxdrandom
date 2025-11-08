/**
 * client/js/gameClient.js (v1.6 - NUEVO)
 * - Gestiona el bucle del juego, renderizado, HUD, e inputs del canvas.
 * - Importa estado, entidades y `updateUI`.
 * - Exporta `stopGameLoop`.
 */

import { socket, clientState, touchState, updateControlMethod } from './state.js';
import { Player, Zombie, Bullet, ZombieCore, MapRenderer } from './entities.js';
import { updateUI } from './uiManager.js';

// --- 1. CONSTANTES Y VARIABLES DEL JUEGO ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SCALE = 1.0;
const SERVER_TICK_RATE = 30;
const JOYSTICK_RADIUS = 70;
const KNOB_RADIUS = 30;
const MINIMAP_SIZE = 150; 

let lastRenderTime = 0;
let animationFrameId = null;

const moveKeys = {
    'w': { dy: -1 }, 's': { dy: 1 },
    'a': { dx: -1 }, 'd': { dx: 1 },
};
const keysPressed = new Set();

// --- 2. LÓGICA DEL BUCLE DE JUEGO (RENDER) ---

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function gameLoopRender(timestamp) {
    if (clientState.currentState === 'playing') {
        const serverSnapshotTime = 1000 / SERVER_TICK_RATE;
        const timeSinceLastSnapshot = timestamp - lastRenderTime;
        const interpolationFactor = Math.min(1, timeSinceLastSnapshot / serverSnapshotTime);

        updateCore(); 
        interpolateEntities(interpolationFactor);
        drawGame(timeSinceLastSnapshot);

        const me = clientState.interpolatedEntities.players.get(clientState.me.id);
        if (me && me.health > 0) {
            sendInputToServer();
        } else {
            // Asegurarse de no enviar input si estás muerto
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

export function stopGameLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// --- 3. LÓGICA DE ACTUALIZACIÓN DE ENTIDADES (CLIENTE) ---

function updateCore() {
    const coreData = clientState.serverSnapshot.zombieCore;
    if (coreData) {
        if (!clientState.zombieCoreEntity) {
            clientState.zombieCoreEntity = new ZombieCore(
                coreData.id, coreData.x, coreData.y, coreData.size,
                coreData.health, coreData.maxHealth
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
        p_client.maxHealth = p_server.maxHealth; // v1.5
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

// --- 4. LÓGICA DE DIBUJADO (RENDER) ---

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
        // Pasa las coordenadas de cámara escaladas
        clientState.mapRenderer.draw(ctx, clientState.cameraX, clientState.cameraY);
    }
    if (clientState.zombieCoreEntity) {
        clientState.zombieCoreEntity.draw(ctx);
    }
    clientState.serverSnapshot.bullets.forEach(b => {
        const bullet = new Bullet(b.id, b.x, b.y);
        bullet.draw(ctx);
    });
    clientState.interpolatedEntities.zombies.forEach(z => z.draw(ctx));
    clientState.interpolatedEntities.players.forEach(p => p.draw(ctx));

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

function drawHUD(player) {
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

function drawMinimap(ctx, me) { 
    if (!clientState.mapRenderer || !clientState.minimapCanvas) return;

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

// --- 5. LÓGICA DE INPUTS (JUEGO) ---

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
    if (clientState.cameraX === undefined) return;

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

// --- 6. EVENTOS DE SOCKET (JUEGO) ---

socket.on('gameStarted', (data) => {
    clientState.currentState = 'playing';
    clientState.mapRenderer = new MapRenderer(data.mapData, data.cellSize);

    createMinimapBackground(); 

    clientState.interpolatedEntities.players.clear();
    clientState.interpolatedEntities.zombies.clear();
    clientState.zombieCoreEntity = null;

    updateUI(); // Importado de uiManager.js
    resizeCanvas(); 

    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoopRender);
    }
});

socket.on('gameState', (snapshot) => {
    clientState.serverSnapshot = snapshot;
});

// --- 7. LISTENERS DE INPUTS (JUEGO) ---

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

window.addEventListener('resize', resizeCanvas);

// --- 8. INICIALIZACIÓN DEL CLIENTE DE JUEGO ---
resizeCanvas();
updateControlMethod(); // Sincroniza el estado de control al cargar
