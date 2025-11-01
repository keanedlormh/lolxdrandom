/**
 * client/js/game.js
 * Lógica principal del lado del cliente. 
 * Gestiona la UI, la conexión con Socket.IO y el bucle de renderizado.
 */

// Importar clases auxiliares y entidades
import { VirtualJoystick } from './utils.js';
import { Player, Zombie, Bullet, MapGenerator } from './entities.js';

// --- CONFIGURACIÓN GLOBAL Y ESTADO ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const mapCtx = minimapCanvas.getContext('2d');

// El estado del juego del cliente
let gameState = 'menu'; // 'menu', 'settings', 'multiplayerMenu', 'lobbiesList', 'lobby', 'playing', 'gameOver'

// Variables de red
let socket;
const SERVER_URL = window.location.origin;
let myPlayerId = null;
let myPlayerName = '';

// Variables de juego (SÓLO para cliente)
let gameMap = null;
let moveJoystick = null;
let shootJoystick = null;

// Datos de estado recibidos del servidor
let serverState = { 
    players: [], 
    zombies: [], 
    bullets: [], 
    score: 0, 
    wave: 1 
};
let myLocalPlayer = { health: 100, kills: 0, x: 0, y: 0 }; // Estado local esencial

// --- MANEJO DE LA INTERFAZ DE USUARIO (UI) ---

const menus = {
    mainMenu: document.getElementById('mainMenu'),
    settingsMenu: document.getElementById('settingsMenu'),
    multiplayerMenu: document.getElementById('multiplayerMenu'),
    lobbiesListMenu: document.getElementById('lobbiesListMenu'),
    lobbyWaitMenu: document.getElementById('lobbyWaitMenu'),
    gameOverMenu: document.getElementById('gameOverMenu'),
};
const hudElements = {
    joysticks: [document.getElementById('moveJoystick'), document.getElementById('shootJoystick')],
    score: document.getElementById('score'),
    kills: document.getElementById('kills'),
    wave: document.getElementById('wave'),
    healthFill: document.getElementById('healthFill'),
    healthText: document.getElementById('healthText'),
};

/**
 * Muestra el menú dado y oculta los demás.
 * También gestiona la visibilidad del HUD.
 * @param {string} menuName - Nombre del menú a mostrar (ej. 'mainMenu').
 */
function showMenu(menuName) {
    gameState = menuName;

    // Ocultar todos los menús
    Object.values(menus).forEach(menu => menu.classList.add('hidden'));

    // Mostrar el menú deseado
    if (menus[menuName]) {
        menus[menuName].classList.remove('hidden');
    }

    // Ocultar Joysticks y HUD cuando no se está jugando
    const isPlaying = menuName === 'playing';
    hudElements.joysticks.forEach(j => j.classList.toggle('hidden', !isPlaying));
    document.getElementById('minimap').classList.toggle('hidden', !isPlaying);
    document.querySelector('.hud').classList.toggle('hidden', !isPlaying);
    document.querySelector('.wave-info').classList.toggle('hidden', !isPlaying);
    document.querySelector('.health-bar').classList.toggle('hidden', !isPlaying);
}

// --- FUNCIONES DE NAVEGACIÓN Y ACCIÓN ---

function startGame() {
    alert('El modo Singleplayer ha sido reemplazado por la arquitectura multijugador. Por favor, use "MULTIJUGADOR".');
    showMenu('menu');
}

function backToMenu() {
    showMenu('menu');
}

function restartGame() {
    showMenu('menu');
}

function showMainMenu() { 
    showMenu('menu');
}

function showSettings() { 
    showMenu('settings');
}

function hideSettings() { 
    showMenu('menu');
}

function showMultiplayerMenu() {
    // Al pasar a este menú, capturamos el nombre
    myPlayerName = document.getElementById('playerNameInput').value || 'Anónimo';
    showMenu('multiplayerMenu');
}

// --- LÓGICA DE MULTIJUGADOR ---

function createNewLobby() {
    setupSocketConnection();
    socket.emit('createGame', myPlayerName);
}

function requestLobbiesList() {
    setupSocketConnection();
    socket.emit('getLobbies');
    // Mostrar pantalla de carga
    const container = document.getElementById('lobbiesContainer');
    container.innerHTML = '<p>Buscando salas...</p>';
}

function requestStartGame() {
    const roomId = document.getElementById('lobbyIdDisplay').textContent;
    socket.emit('startGame', roomId);
}


// --- CONEXIÓN DE RED SOCKET.IO ---

function setupSocketConnection() {
    if (socket) return; 

    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        myPlayerId = socket.id;
        console.log(`[CLIENT] Conectado al servidor: ${myPlayerId}`);
    });

    socket.on('disconnect', () => {
        console.warn(`[CLIENT] Desconectado del servidor.`);
        if (gameState === 'playing' || gameState === 'lobby') {
             alert('¡Desconexión! Volviendo al menú principal.');
             showMenu('menu');
        }
        socket = null;
    });
    
    // --- EVENTOS DE LOBBY ---
    
    socket.on('gameCreated', (game) => {
        document.getElementById('lobbyIdDisplay').textContent = game.id;
        document.getElementById('startMultiplayerButton').classList.remove('hidden'); 
        updateLobbyList(game);
        showMenu('lobbyWaitMenu'); // Usar el nombre del objeto del menú
    });

    socket.on('joinSuccess', (game) => {
        document.getElementById('lobbyIdDisplay').textContent = game.id;
        document.getElementById('startMultiplayerButton').classList.add('hidden'); 
        updateLobbyList(game);
        showMenu('lobbyWaitMenu'); // Usar el nombre del objeto del menú
    });
    
    socket.on('joinFailed', (message) => {
        alert('Error al unirse: ' + message);
        showMenu('multiplayerMenu');
    });
    
    socket.on('lobbyUpdate', (game) => {
        updateLobbyList(game);
    });

    socket.on('lobbiesList', (lobbies) => {
        displayLobbiesList(lobbies);
        showMenu('lobbiesListMenu'); // Usar el nombre del objeto del menú
    });

    // --- EVENTOS DE JUEGO ---
    
    socket.on('gameStarted', (data) => {
        console.log('[CLIENT] Partida iniciada, recibiendo mapa...');
        gameMap = new MapGenerator(data.mapData);
        
        if (!moveJoystick) {
            moveJoystick = new VirtualJoystick('moveJoystick', 'moveKnob');
            shootJoystick = new VirtualJoystick('shootJoystick', 'shootKnob');
        }

        showMenu('playing'); 
        gameLoopMultiplayer();
    });
    
    socket.on('gameState', (snapshot) => {
        serverState = snapshot;
        const myData = serverState.players.find(p => p.id === myPlayerId);
        if (myData) {
            myLocalPlayer.health = myData.health;
            myLocalPlayer.kills = myData.kills;
            myLocalPlayer.x = myData.x;
            myLocalPlayer.y = myData.y;
        }
    });

    socket.on('gameOver', (data) => {
        document.getElementById('finalScore').textContent = data.finalScore;
        document.getElementById('finalWave').textContent = data.finalWave;
        document.getElementById('finalKills').textContent = myLocalPlayer.kills;
        showMenu('gameOverMenu');
    });
}

function updateLobbyList(game) {
    // ... (Lógica idéntica a la original) ...
    const list = document.getElementById('lobbyPlayersList');
    list.innerHTML = '';

    game.players.forEach(p => {
        const li = document.createElement('li');
        const status = p.id === game.hostId ? '👑 HOST' : '🤝 Jugador';
        li.textContent = `${p.name} (${status})`;
        li.style.color = p.id === myPlayerId ? '#00ff00' : '#fff';
        list.appendChild(li);
    });

    // Mostrar/Ocultar botón de inicio si somos host
    const startBtn = document.getElementById('startMultiplayerButton');
    if (socket && socket.id === game.hostId) {
        startBtn.classList.remove('hidden');
        startBtn.disabled = game.players.length < 2;
        startBtn.textContent = game.players.length < 2 ? 'ESPERANDO JUGADORES (min 2)' : 'INICIAR PARTIDA';
    } else {
        startBtn.classList.add('hidden');
    }
}

function displayLobbiesList(lobbies) {
    // ... (Lógica idéntica a la original) ...
    const container = document.getElementById('lobbiesContainer');
    container.innerHTML = '';

    if (lobbies.length === 0) {
        container.innerHTML = '<p style="color: #ff3333;">No hay salas disponibles.</p>';
        return;
    }

    lobbies.forEach(lobby => {
        const button = document.createElement('button');
        button.textContent = `Sala: ${lobby.id} | Host: ${lobby.hostName} (${lobby.playerCount}/4)`;
        // Conexión del evento click dentro de JS para evitar problemas de módulos
        button.addEventListener('click', () => { 
            socket.emit('joinGame', lobby.id, myPlayerName);
        });
        container.appendChild(button);
    });
}


// --- BUCLE DE RENDERIZADO (El "Game Loop" del Cliente) ---

/**
 * Bucle principal de renderizado (requestAnimationFrame)
 * NO ejecuta la física; solo envía inputs y dibuja el estado recibido.
 */
function gameLoopMultiplayer() {
    if (gameState !== 'playing') return;

    // 1. ENVIAR INPUT DEL JUGADOR
    const moveVec = moveJoystick.getVector();
    const shootVec = shootJoystick.getVector();

    // Evita enviar datos si no hay movimiento o disparo
    if (moveVec.x !== 0 || moveVec.y !== 0 || shootVec.x !== 0 || shootVec.y !== 0) {
        socket.emit('playerInput', { 
            moveX: moveVec.x, 
            moveY: moveVec.y, 
            shootX: shootVec.x, 
            shootY: shootVec.y 
        });
    }

    // --- 2. PREPARAR CÁMARA Y CANVAS ---
    
    // ... (Lógica de cámara y dibujo idéntica a la original) ...
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const myX = myLocalPlayer.x;
    const myY = myLocalPlayer.y;

    const offsetX = myX - canvas.width / 2;
    const offsetY = myY - canvas.height / 2;

    // --- 3. DIBUJAR ENTIDADES (basado en serverState) ---

    // Dibujar mapa
    if (gameMap) {
        gameMap.draw(ctx, offsetX, offsetY);
        gameMap.drawMinimap(mapCtx, serverState.players, serverState.zombies, myPlayerId);
    }

    // Dibujar Balas
    serverState.bullets.forEach(bData => {
        const bullet = new Bullet(bData.id, bData.x, bData.y);
        bullet.draw(ctx, offsetX, offsetY);
    });

    // Dibujar Zombies
    serverState.zombies.forEach(zData => {
        const zombie = new Zombie(zData.id, zData.x, zData.y);
        zombie.draw(ctx, offsetX, offsetY);
    });

    // Dibujar Jugadores
    serverState.players.forEach(pData => {
        const isMe = pData.id === myPlayerId;
        const player = new Player(pData.id, pData.x, pData.y, isMe, 'Jugador ' + pData.id.substring(0, 4)); 
        player.health = pData.health;
        player.draw(ctx, offsetX, offsetY);
    });

    // --- 4. ACTUALIZAR HUD ---

    hudElements.score.textContent = serverState.score;
    hudElements.wave.textContent = serverState.wave;
    hudElements.kills.textContent = myLocalPlayer.kills;

    // Barra de salud
    const health = myLocalPlayer.health;
    const healthPercent = Math.max(0, health) / 100;
    hudElements.healthFill.style.width = `${healthPercent * 100}%`;
    hudElements.healthText.textContent = `${Math.max(0, health)} / 100`;

    // Continuar el render loop
    requestAnimationFrame(gameLoopMultiplayer);
}

// --- CONFIGURACIÓN DE LISTENERS (SOLUCIÓN AL PROBLEMA DE BOTONES) ---

/**
 * Asigna los event listeners a todos los botones del menú utilizando sus IDs.
 * Esto elimina la necesidad de los problemáticos atributos onclick="" en el HTML.
 */
function setupUIListeners() {
    // Menú Principal
    document.getElementById('btnStartSinglePlayer').addEventListener('click', startGame);
    document.getElementById('btnShowMultiplayer').addEventListener('click', showMultiplayerMenu);
    document.getElementById('btnShowSettings').addEventListener('click', showSettings);

    // Menú de Configuración
    document.getElementById('btnHideSettings').addEventListener('click', hideSettings);
    // document.getElementById('difficulty').addEventListener('input', updateSettings); // Asumiendo updateSettings existe

    // Menú Game Over
    document.getElementById('btnRestartGame').addEventListener('click', restartGame);
    document.getElementById('btnBackToMenu').addEventListener('click', backToMenu);

    // Menú Multijugador
    document.getElementById('btnCreateLobby').addEventListener('click', createNewLobby);
    document.getElementById('btnFindLobby').addEventListener('click', requestLobbiesList); // Cambié el nombre de la función para mayor claridad
    document.getElementById('btnShowMainMenu').addEventListener('click', showMainMenu);

    // Menú Lista de Lobbies
    document.getElementById('btnShowMultiplayerFromLobbies').addEventListener('click', showMultiplayerMenu);

    // Menú de Espera (Lobby)
    document.getElementById('startMultiplayerButton').addEventListener('click', requestStartGame);
    document.getElementById('btnExitLobby').addEventListener('click', showMultiplayerMenu); // Simplemente vuelve al menú multijugador
}

// --- INICIALIZACIÓN ---

/**
 * Inicializa el juego al cargar la página.
 */
function initialize() {
    // Ajustar el canvas al tamaño de la ventana
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 1. Conectar la red
    setupSocketConnection();
    // 2. Conectar los botones
    setupUIListeners(); 
    // 3. Mostrar la interfaz inicial
    showMenu('menu');
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initialize);
