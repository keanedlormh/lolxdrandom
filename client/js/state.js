/**
 * client/js/state.js (v1.6 - NUEVO)
 * - Define y exporta todo el estado compartido, configuración y el socket.
 * - Asume que la variable global `io` existe (cargada desde index.html).
 */

// --- 1. SOCKET ---
// `io` es una variable global cargada desde /socket.io/socket.io.js
export const socket = io();

// --- 2. CONFIGURACIÓN ---
export const DEFAULT_CONFIG = {
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
    coreHealthMultiplier: 1.15 
};

// Exportamos el objeto de configuración.
// Otros módulos lo importarán y modificarán sus propiedades.
export const gameConfig = {...DEFAULT_CONFIG};

// --- 3. ESTADO DEL CLIENTE ---
export const clientState = {
    currentState: 'menu',
    me: { id: null, name: 'Jugador', isHost: false },
    roomId: null,
    playersInLobby: [], // Lista de jugadores en el lobby
    serverSnapshot: {
        players: [],
        zombies: [],
        bullets: [],
        score: 0,
        wave: 1,
        zombieCore: null
    },
    interpolatedEntities: {
        players: new Map(),
        zombies: new Map()
    },
    zombieCoreEntity: null,
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

// --- 4. ESTADO DE CONTROLES (TÁCTIL) ---
export const touchState = {
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    currentControlMethod: 'auto',
    move: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 },
    aim: { active: false, id: null, centerX: 0, centerY: 0, currentX: 0, currentY: 0 }
};

// Función de ayuda para actualizar el método de control
export function updateControlMethod() {
    let method = gameConfig.controlType;
    if (method === 'auto') {
        method = (touchState.isTouchDevice) ? 'touch' : 'keyboard';
    }
    touchState.currentControlMethod = method;
    console.log(`[CONTROLES] Método de control activo: ${method}`);
}