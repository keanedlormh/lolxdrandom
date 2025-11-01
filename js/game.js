/**
 * client/js/game.js
 * Lógica principal del juego, GameLoop, MapGenerator y gestión de estado.
 * INTEGRACIÓN MULTIJUGADOR con Socket.IO
 */

// Importa entidades y utilidades
import { config, Node, VirtualJoystick } from './utils.js';
import { Player, Zombie, Bullet } from './entities.js';

// --- CONFIGURACIÓN DE RED Y ESTADO ---
// **IMPORTANTE:** Cambia 'http://localhost:3000' por la URL de Render cuando despliegues.
const SERVER_URL = 'http://localhost:3000'; 
let socket = null;
let currentLobby = null; // Almacena el objeto del lobby actual
let playerName = 'Player'; // Nombre por defecto

// --- VARIABLES GLOBALES DEL MOTOR ---
export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');
export const minimap = document.getElementById('minimap');
export const minimapCtx = minimap.getContext('2d');

let gameState = 'menu'; // Estados: 'menu', 'multiplayerMenu', 'settings', 'lobby', 'playing', 'gameOver'

export let score = 0;
export let kills = 0;
export let wave = 1;
export let zombiesInWave = 0;
export let zombiesSpawned = 0;

export let gameMap;
export let player;
export let zombies = [];
export let bullets = [];
let moveJoystick;
let shootJoystick;

// Elementos del DOM para los menús multijugador
const mainMenu = document.getElementById('mainMenu');
const settingsMenu = document.getElementById('settingsMenu');
const gameOverMenu = document.getElementById('gameOverMenu');
const multiplayerMenu = document.getElementById('multiplayerMenu');
const createLobbyMenu = document.getElementById('createLobbyMenu');
const lobbiesListMenu = document.getElementById('lobbiesListMenu');
const lobbyWaitMenu = document.getElementById('lobbyWaitMenu');
const playerNameInput = document.getElementById('playerNameInput');
const lobbyIdDisplay = document.getElementById('lobbyIdDisplay');
const lobbyPlayersList = document.getElementById('lobbyPlayersList');
const startMultiplayerButton = document.getElementById('startMultiplayerButton');


// Ajustar canvas al tamaño de la ventana
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ==========================================================
// MÓDULOS DE JUEGO (MapGenerator, VirtualJoystick, etc.)
// Estos módulos no cambian, por lo que su código va aquí.
// ==========================================================

/**
 * Generador y gestor del mapa laberíntico.
 * (Clase MapGenerator - Mismo código que antes)
 */
class MapGenerator {
    constructor(size) {
        this.size = size;
        this.cellSize = 40;
        this.map = [];
        this.rooms = [];
        this.generate();
    }
    
    generate() {
        for (let y = 0; y < this.size; y++) {
            this.map[y] = [];
            for (let x = 0; x < this.size; x++) {
                this.map[y][x] = 1; 
            }
        }
        
        const numRooms = Math.floor(this.size / 5);
        for (let i = 0; i < numRooms; i++) {
            const w = 4 + Math.floor(Math.random() * 6);
            const h = 4 + Math.floor(Math.random() * 6);
            const x = 2 + Math.floor(Math.random() * (this.size - w - 4));
            const y = 2 + Math.floor(Math.random() * (this.size - h - 4));
            
            this.createRoom(x, y, w, h);
            this.rooms.push({x, y, w, h, cx: x + Math.floor(w/2), cy: y + Math.floor(h/2)});
        }
        
        for (let i = 0; i < this.rooms.length - 1; i++) {
            this.createCorridor(
                this.rooms[i].cx, this.rooms[i].cy,
                this.rooms[i + 1].cx, this.rooms[i + 1].cy
            );
        }
        
        const center = Math.floor(this.size / 2);
        this.createRoom(center - 3, center - 3, 7, 7);
        this.spawnPoint = {x: center * this.cellSize + this.cellSize/2, y: center * this.cellSize + this.cellSize/2};
    }
    
    createRoom(x, y, w, h) {
        for (let j = y; j < y + h && j < this.size; j++) {
            for (let i = x; i < x + w && i < this.size; i++) {
                this.map[j][i] = 0;
            }
        }
    }
    
    createCorridor(x1, y1, x2, y2) {
        let x = x1, y = y1;
        while (x !== x2) {
            this.map[y][x] = 0;
            if (y > 0) this.map[y-1][x] = 0;
            if (y < this.size - 1) this.map[y+1][x] = 0;
            x += x < x2 ? 1 : -1;
        }
        while (y !== y2) {
            this.map[y][x] = 0;
            if (x > 0) this.map[y][x-1] = 0;
            if (x < this.size - 1) this.map[y][x+1] = 0;
            y += y < y2 ? 1 : -1;
        }
    }
    
    isWall(x, y) {
        const gx = Math.floor(x / this.cellSize);
        const gy = Math.floor(y / this.cellSize);
        if (gx < 0 || gx >= this.size || gy < 0 || gy >= this.size) return true;
        return this.map[gy][gx] === 1;
    }
    
    getRandomOpenSpot() {
        let x, y, gx, gy;
        do {
            gx = Math.floor(Math.random() * this.size);
            gy = Math.floor(Math.random() * this.size);
        } while (this.map[gy][gx] === 1 || this.isCloseToPlayer(gx, gy));
        
        x = gx * this.cellSize + this.cellSize / 2;
        y = gy * this.cellSize + this.cellSize / 2;
        return {x, y};
    }

    isCloseToPlayer(gx, gy) {
        if (!player) return false;
        const px = Math.floor(player.x / this.cellSize);
        const py = Math.floor(player.y / this.cellSize);
        const distSq = (gx - px) * (gx - px) + (gy - py) * (gy - py);
        return distSq < 100;
    }
    
    draw(offsetX, offsetY) {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const px = x * this.cellSize - offsetX;
                const py = y * this.cellSize - offsetY;
                
                if (px > -this.cellSize && px < canvas.width + this.cellSize &&
                    py > -this.cellSize && py < canvas.height + this.cellSize) {
                    
                    ctx.fillStyle = this.map[y][x] === 1 ? '#333' : '#1a1a1a';
                    ctx.fillRect(px, py, this.cellSize, this.cellSize);
                    
                    if (this.map[y][x] === 1) { 
                         ctx.strokeStyle = '#222';
                         ctx.strokeRect(px, py, this.cellSize, this.cellSize);
                    }
                }
            }
        }
    }
    
    drawMinimap(player, zombies) {
        minimapCtx.fillStyle = '#000';
        minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
        
        const scale = minimap.width / (this.size * this.cellSize);
        
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                minimapCtx.fillStyle = this.map[y][x] === 1 ? '#666' : '#222';
                minimapCtx.fillRect(x * this.cellSize * scale, y * this.cellSize * scale, 
                                  this.cellSize * scale, this.cellSize * scale);
            }
        }
        
        minimapCtx.fillStyle = '#00ff00';
        minimapCtx.beginPath();
        minimapCtx.arc(player.x * scale, player.y * scale, 3, 0, Math.PI * 2);
        minimapCtx.fill();
        
        minimapCtx.fillStyle = '#ff0000';
        zombies.forEach(zombie => {
            minimapCtx.beginPath();
            minimapCtx.arc(zombie.x * scale, zombie.y * scale, 2, 0, Math.PI * 2);
            minimapCtx.fill();
        });
    }

    // --- (Métodos de Pathfinding A* - Sin cambios) ---
    heuristic(node, target) {
        return Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
    }
    // ... (Métodos getNeighbors y findPathAStar omitidos para brevedad) ...
    // NOTE: El código A* original debe permanecer aquí.
}


// ==========================================================
// FUNCIÓN PRINCIPAL DE CONEXIÓN Y EVENTOS DE SOCKET
// ==========================================================

/**
 * Inicializa la conexión de Socket.IO y configura los escuchadores de eventos del servidor.
 */
function connectToServer() {
    if (socket) return; // Ya estamos conectados
    
    // Asumimos que la librería socket.io.js ya está cargada en index.html
    socket = io(SERVER_URL); 

    socket.on('connect', () => {
        console.log(`[SOCKET.IO] Conectado al servidor con ID: ${socket.id}`);
        // El nombre del jugador se guarda al conectar por si se necesita
        playerName = playerNameInput.value || `Player ${socket.id.substring(0, 4)}`;
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET.IO] Desconectado del servidor.`);
        // Manejar la pérdida de conexión: regresar al menú principal
        if (gameState !== 'menu') {
            alert('¡Conexión perdida con el servidor!');
            window.location.reload(); // Recargar para simplificar el estado
        }
    });

    // --- EVENTOS DEL LOBBY ---
    
    socket.on('gameCreated', (gameData) => {
        currentLobby = gameData;
        console.log(`[LOBBY] Partida creada: ${gameData.id}`);
        enterLobbyWaitScreen();
    });
    
    socket.on('joinSuccess', (gameData) => {
        currentLobby = gameData;
        enterLobbyWaitScreen();
    });
    
    socket.on('lobbyUpdate', (gameData) => {
        currentLobby = gameData;
        console.log(`[LOBBY] Actualización, jugadores: ${gameData.players.length}`);
        // Renderizar la lista de jugadores actualizada
        renderLobbyPlayers();
    });

    socket.on('joinFailed', (message) => {
        alert('No se pudo unir a la partida: ' + message);
        showMultiplayerMenu();
    });
    
    socket.on('hostChanged', (newHostId) => {
        if (newHostId === socket.id) {
            alert('¡Eres el nuevo HOST de la partida!');
        }
        // Actualiza la visualización del botón de inicio si es necesario
        renderLobbyPlayers(); 
    });

    // --- EVENTOS DE INICIO DE JUEGO ---
    
    socket.on('gameStarted', (data) => {
        console.log('[JUEGO] Iniciando partida multijugador...');
        // Por ahora, usamos la misma inicialización, pero más adelante se usará 'data'
        // para sincronizar el mapa.
        startMultiplayerGame();
    });
}


// ==========================================================
// TRANSICIONES DE MENÚS Y LÓGICA DE MULTIJUGADOR
// ==========================================================

function hideAllMenus() {
    mainMenu.classList.add('hidden');
    settingsMenu.classList.add('hidden');
    gameOverMenu.classList.add('hidden');
    multiplayerMenu.classList.add('hidden');
    createLobbyMenu.classList.add('hidden');
    lobbiesListMenu.classList.add('hidden');
    lobbyWaitMenu.classList.add('hidden');
    document.getElementById('moveJoystick').classList.add('hidden');
    document.getElementById('shootJoystick').classList.add('hidden');
}

/**
 * Muestra el menú de selección de modo (Single/Multi).
 */
function showMainMenu() {
    hideAllMenus();
    mainMenu.classList.remove('hidden');
    gameState = 'menu';
}
window.showMainMenu = showMainMenu;
window.backToMenu = showMainMenu; // Reutilizar la función

/**
 * Inicia el juego en modo UN JUGADOR (Single Player).
 */
function startGame() {
    hideAllMenus();
    document.getElementById('moveJoystick').classList.remove('hidden');
    document.getElementById('shootJoystick').classList.remove('hidden');
    
    gameState = 'playing';
    initGame();
    gameLoop();
}
window.startGame = startGame; 

/**
 * Muestra el menú de multijugador y conecta al servidor si no está conectado.
 */
function showMultiplayerMenu() {
    hideAllMenus();
    multiplayerMenu.classList.remove('hidden');
    gameState = 'multiplayerMenu';
    
    // Intenta conectarse al servidor al entrar al menú MP
    connectToServer(); 
}
window.showMultiplayerMenu = showMultiplayerMenu;

/**
 * Pide al servidor crear una nueva sala.
 */
function createNewLobby() {
    if (socket && socket.connected) {
        playerName = playerNameInput.value || `Host ${socket.id.substring(0, 4)}`;
        socket.emit('createGame', playerName);
        hideAllMenus();
        // Espera el evento 'gameCreated' para continuar
    } else {
        alert('Aún no conectado al servidor. Intenta de nuevo.');
        connectToServer();
    }
}
window.createNewLobby = createNewLobby;

/**
 * Pide al servidor la lista de salas disponibles y las muestra.
 */
function showLobbiesList() {
    hideAllMenus();
    lobbiesListMenu.classList.remove('hidden');
    document.getElementById('lobbiesContainer').innerHTML = 'Cargando salas...';
    
    if (socket && socket.connected) {
        socket.emit('getLobbies');
        
        socket.once('lobbiesList', (lobbies) => {
            const container = document.getElementById('lobbiesContainer');
            container.innerHTML = ''; // Limpiar
            if (lobbies.length === 0) {
                container.innerHTML = '<p style="text-align:center;">No hay partidas disponibles.</p>';
            } else {
                lobbies.forEach(lobby => {
                    const button = document.createElement('button');
                    button.textContent = `[${lobby.id}] ${lobby.hostName} (${lobby.playerCount}/4)`;
                    button.onclick = () => joinLobby(lobby.id);
                    container.appendChild(button);
                });
            }
        });
    } else {
        document.getElementById('lobbiesContainer').innerHTML = '<p style="color:red; text-align:center;">Desconectado. Vuelve al menú.</p>';
    }
}
window.showLobbiesList = showLobbiesList;


/**
 * Intenta unirse a una sala.
 */
function joinLobby(roomId) {
    playerName = playerNameInput.value || `Player ${socket.id.substring(0, 4)}`;
    socket.emit('joinGame', roomId, playerName);
    hideAllMenus();
    // Espera el evento 'joinSuccess' para continuar
}

/**
 * Muestra la pantalla de espera del lobby y la actualiza.
 */
function enterLobbyWaitScreen() {
    hideAllMenus();
    lobbyWaitMenu.classList.remove('hidden');
    gameState = 'lobby';
    
    lobbyIdDisplay.textContent = currentLobby.id;
    renderLobbyPlayers();
}

/**
 * Renderiza la lista de jugadores y el botón de inicio.
 */
function renderLobbyPlayers() {
    lobbyPlayersList.innerHTML = '';
    const isHost = currentLobby.hostId === socket.id;

    currentLobby.players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} ${p.isHost ? '(HOST)' : ''}`;
        if (p.id === socket.id) {
             li.style.color = '#00ff00';
        }
        lobbyPlayersList.appendChild(li);
    });
    
    // Mostrar/Ocultar botón de iniciar partida
    if (isHost) {
        startMultiplayerButton.classList.remove('hidden');
        if (currentLobby.players.length < 2) {
             startMultiplayerButton.disabled = true;
             startMultiplayerButton.textContent = 'Esperando más jugadores (min 2)';
        } else {
             startMultiplayerButton.disabled = false;
             startMultiplayerButton.textContent = 'INICIAR PARTIDA';
        }
    } else {
        startMultiplayerButton.classList.add('hidden');
    }
}

/**
 * El host envía la señal para iniciar el juego.
 */
function requestStartGame() {
    if (currentLobby && currentLobby.hostId === socket.id) {
        socket.emit('startGame', currentLobby.id);
        startMultiplayerButton.disabled = true;
        startMultiplayerButton.textContent = 'Iniciando...';
    }
}
window.requestStartGame = requestStartGame; // Exportar para el onclick en HTML

/**
 * Inicialización específica del juego multijugador.
 */
function startMultiplayerGame() {
    hideAllMenus();
    document.getElementById('moveJoystick').classList.remove('hidden');
    document.getElementById('shootJoystick').classList.remove('hidden');
    
    gameState = 'playing';
    
    // *** TODO: En el futuro, el servidor debe proveer esta configuración ***
    // Usamos la configuración por defecto por ahora
    initGame(); 
    
    // En multijugador, la lógica de actualización del jugador
    // debe enviar su estado al servidor.
    gameLoopMultiplayer(); 
}

// --- Otras funciones de Menú (Sin cambios) ---

function showSettings() { /* ... */ }
window.showSettings = showSettings;
function hideSettings() { /* ... */ }
window.hideSettings = hideSettings;
function updateSettings() { /* ... */ }
window.updateSettings = updateSettings;

// --- Funciones de Estado de Juego (Sin cambios) ---

function initGame() {
    gameMap = new MapGenerator(config.mapSize);
    player = new Player(gameMap.spawnPoint.x, gameMap.spawnPoint.y);
    player.speed = config.playerSpeed;
    zombies.length = 0; 
    bullets.length = 0; 
    score = 0;
    kills = 0;
    wave = 1;
    
    moveJoystick = new VirtualJoystick(
        document.getElementById('moveJoystick'),
        document.getElementById('moveKnob')
    );
    
    shootJoystick = new VirtualJoystick(
        document.getElementById('shootJoystick'),
        document.getElementById('shootKnob')
    );
    
    startWave();
    updateHUD();
    updateHealthBar();
}

function startWave() { /* ... */ }
function spawnZombie() { /* ... */ }
export function updateHUD() { /* ... */ }
export function updateHealthBar() { /* ... */ }

// --- Game Loops ---

// Game loop UN JUGADOR (El original, sin sockets)
let lastSpawn = 0;
let spawnInterval = 2000;
function gameLoop() {
    if (gameState !== 'playing') return;
    // ... (Código original de gameLoop UN JUGADOR) ...
    
    // (Actualización de input, lógica de colisiones, dibujo, spawn)
    
    requestAnimationFrame(gameLoop);
}

// Game loop MULTIJUGADOR (Envía y recibe datos por socket)
let lastUpdate = 0;
const UPDATE_INTERVAL = 1000 / 30; // 30 FPS de actualización de red
function gameLoopMultiplayer() {
    if (gameState !== 'playing') return;
    
    // --- 1. Lógica Local (Mismo código que en gameLoop) ---
    // (Limpiar canvas, calcular offset, dibujar mapa, actualizar player, bullets, zombies)
    // ...
    
    // --- 2. Sincronización de Red (Solo en Multijugador) ---
    if (Date.now() - lastUpdate > UPDATE_INTERVAL) {
        // Enviar la posición y dirección del jugador al servidor
        const moveVec = moveJoystick.getVector();
        const shootVec = shootJoystick.getVector();
        
        socket.emit('playerMove', {
            x: player.x,
            y: player.y,
            moveX: moveVec.x,
            moveY: moveVec.y,
            shootX: shootVec.x,
            shootY: shootVec.y
        });
        
        lastUpdate = Date.now();
    }
    
    // NOTE: La actualización de la posición de otros jugadores y zombies
    // vendrá del servidor a través de un evento 'gameState' (a implementar)
    
    requestAnimationFrame(gameLoopMultiplayer);
}

// --- Gestión de Game Over (Sin cambios) ---
export function gameOver() { /* ... */ }
function restartGame() { /* ... */ }
window.restartGame = restartGame;


// Asegurar que la configuración inicial se muestra al cargar
document.addEventListener('DOMContentLoaded', () => {
    updateSettings();
    
    // Añadir los listeners de joysticks a la ventana para multitouch
    window.addEventListener('touchmove', (e) => {
        if (moveJoystick) moveJoystick.handleTouchMove(e);
        if (shootJoystick) shootJoystick.handleTouchMove(e);
    }, {passive: false});

    window.addEventListener('touchend', (e) => {
        if (moveJoystick) moveJoystick.handleTouchEnd(e);
        if (shootJoystick) shootJoystick.handleTouchEnd(e);
    }, {passive: false});

    window.addEventListener('touchcancel', (e) => {
        if (moveJoystick) moveJoystick.handleTouchEnd(e); 
        if (shootJoystick) shootJoystick.handleTouchEnd(e);
    }, {passive: false});
});
