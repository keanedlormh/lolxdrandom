/**
 * client/js/uiManager.js (v1.6 - NUEVO)
 * - Gestiona todos los menús, botones, configuración y eventos de lobby.
 * - Importa el estado compartido desde state.js.
 * - Exporta `updateUI` para que gameClient.js pueda llamarlo.
 * - Importa `stopGameLoop` desde gameClient.js.
 */

import { socket, clientState, gameConfig, DEFAULT_CONFIG, updateControlMethod } from './state.js';
import { stopGameLoop } from './gameClient.js';

// --- 1. LÓGICA DE CONFIGURACIÓN (del antiguo game.js) ---

function loadConfig() {
    const saved = localStorage.getItem('zombieGameConfig');
    if (saved) {
        try {
            // Modifica el objeto importado en lugar de reasignarlo
            Object.assign(gameConfig, {...DEFAULT_CONFIG, ...JSON.parse(saved)});
        } catch (e) {
            console.warn('Error cargando configuración, usando defaults:', e);
            Object.assign(gameConfig, {...DEFAULT_CONFIG});
        }
    }
    applyConfigToUI();
    updateControlMethod(); // Llama al método importado
}

function saveConfig() {
    localStorage.setItem('zombieGameConfig', JSON.stringify(gameConfig));
}

function applyConfigToUI() {
    document.getElementById('setting_controlType').value = gameConfig.controlType;
    
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

    document.getElementById('setting_mapSize').value = gameConfig.mapSize;
    document.getElementById('setting_roomCount').value = gameConfig.roomCount;
    document.getElementById('setting_roomCount_value').textContent = `${gameConfig.roomCount} salas`;
    document.getElementById('setting_corridorWidth').value = gameConfig.corridorWidth;

    document.getElementById('setting_zombieHealth').value = gameConfig.zombieHealth;
    document.getElementById('setting_zombieHealth_value').textContent = gameConfig.zombieHealth;
    document.getElementById('setting_zombieSpeed').value = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieSpeed_value').textContent = gameConfig.zombieSpeed;
    document.getElementById('setting_zombieAttack').value = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttack_value').textContent = gameConfig.zombieAttack;
    document.getElementById('setting_zombieAttackCooldown').value = gameConfig.zombieAttackCooldown;
    document.getElementById('setting_zombieAttackCooldown_value').textContent = `${gameConfig.zombieAttackCooldown} ms`;

    document.getElementById('setting_initialZombies').value = gameConfig.initialZombies;
    document.getElementById('setting_initialZombies_value').textContent = `${gameConfig.initialZombies} zombies`;
    document.getElementById('setting_coreBaseHealth').value = gameConfig.coreBaseHealth;
    document.getElementById('setting_coreBaseHealth_value').textContent = gameConfig.coreBaseHealth;
    document.getElementById('setting_coreBaseSpawnRate').value = gameConfig.coreBaseSpawnRate;
    document.getElementById('setting_coreBaseSpawnRate_value').textContent = `${gameConfig.coreBaseSpawnRate} ms`;

    const coreHealthSliderValue = Math.round(gameConfig.coreHealthMultiplier * 100);
    document.getElementById('setting_coreHealthMultiplier_slider').value = coreHealthSliderValue;
    document.getElementById('setting_coreHealthMultiplier_value').textContent = `+${coreHealthSliderValue - 100}%`;
    document.getElementById('setting_coreHealthMultiplier').value = gameConfig.coreHealthMultiplier;

    const waveSliderValue = Math.round((gameConfig.waveMultiplier - 1) * 100);
    document.getElementById('setting_waveMultiplier_slider').value = waveSliderValue;
    document.getElementById('waveMultiplierValue').textContent = `+${waveSliderValue}%`;
    document.getElementById('setting_waveMultiplier').value = gameConfig.waveMultiplier;
    
    const burstSliderValue = Math.round(gameConfig.coreBurstSpawnMultiplier * 100);
    document.getElementById('setting_coreBurstSpawnMultiplier_slider').value = burstSliderValue;
    document.getElementById('coreBurstSpawnMultiplierValue').textContent = `x${(burstSliderValue / 100).toFixed(1)}`;
    document.getElementById('setting_coreBurstSpawnMultiplier').value = gameConfig.coreBurstSpawnMultiplier;
}

function readConfigFromUI() {
    gameConfig.controlType = document.getElementById('setting_controlType').value;
    
    gameConfig.playerHealth = parseInt(document.getElementById('setting_playerHealth').value);
    gameConfig.playerSpeed = parseFloat(document.getElementById('setting_playerSpeed').value);
    gameConfig.shootCooldown = parseInt(document.getElementById('setting_shootCooldown').value);
    gameConfig.bulletDamage = parseInt(document.getElementById('setting_bulletDamage').value);
    gameConfig.bulletSpeed = parseInt(document.getElementById('setting_bulletSpeed').value);
    
    gameConfig.mapSize = parseInt(document.getElementById('setting_mapSize').value);
    gameConfig.roomCount = parseInt(document.getElementById('setting_roomCount').value);
    gameConfig.corridorWidth = parseInt(document.getElementById('setting_corridorWidth').value);

    gameConfig.zombieHealth = parseInt(document.getElementById('setting_zombieHealth').value);
    gameConfig.zombieSpeed = parseFloat(document.getElementById('setting_zombieSpeed').value);
    gameConfig.zombieAttack = parseInt(document.getElementById('setting_zombieAttack').value);
    gameConfig.zombieAttackCooldown = parseInt(document.getElementById('setting_zombieAttackCooldown').value);

    gameConfig.initialZombies = parseInt(document.getElementById('setting_initialZombies').value);
    gameConfig.coreBaseHealth = parseInt(document.getElementById('setting_coreBaseHealth').value);
    gameConfig.coreBaseSpawnRate = parseInt(document.getElementById('setting_coreBaseSpawnRate').value);
    
    const coreHealthSliderValue = parseInt(document.getElementById('setting_coreHealthMultiplier_slider').value);
    gameConfig.coreHealthMultiplier = coreHealthSliderValue / 100;

    const waveSliderValue = parseInt(document.getElementById('setting_waveMultiplier_slider').value);
    gameConfig.waveMultiplier = 1 + (waveSliderValue / 100);

    const burstSliderValue = parseInt(document.getElementById('setting_coreBurstSpawnMultiplier_slider').value);
    gameConfig.coreBurstSpawnMultiplier = burstSliderValue / 100;
}

// Hacer 'applyPreset' global para el 'onclick' del HTML
window.applyPreset = function(preset) {
    let presetSettings = {};
    switch(preset) {
        case 'easy':
            presetSettings = {
                playerHealth: 150, playerSpeed: 7, shootCooldown: 100,
                zombieHealth: 20, zombieSpeed: 2, zombieAttack: 5, zombieAttackCooldown: 1500,
                bulletDamage: 15, bulletSpeed: 30, mapSize: 60, roomCount: 5, corridorWidth: 3,
                initialZombies: 8, waveMultiplier: 1.3, coreBaseHealth: 300, coreBaseSpawnRate: 6000,
                coreBurstSpawnMultiplier: 2.0, coreHealthMultiplier: 1.10
            };
            break;
        case 'normal':
            presetSettings = {...DEFAULT_CONFIG};
            delete presetSettings.controlType; 
            break;
        case 'hard':
            presetSettings = {
                playerHealth: 80, playerSpeed: 5, shootCooldown: 200,
                zombieHealth: 40, zombieSpeed: 4, zombieAttack: 15, zombieAttackCooldown: 800,
                bulletDamage: 8, bulletSpeed: 20, mapSize: 80, roomCount: 8, corridorWidth: 2,
                initialZombies: 15, waveMultiplier: 1.8, coreBaseHealth: 1000, coreBaseSpawnRate: 3500,
                coreBurstSpawnMultiplier: 4.0, coreHealthMultiplier: 1.25
            };
            break;
    }
    // Modifica el objeto importado en lugar de reasignarlo
    Object.assign(gameConfig, {...gameConfig, ...presetSettings});
    applyConfigToUI();
};

function getConfigSummary() {
    return `
        Jugador: ${gameConfig.playerHealth}HP, Vel ${gameConfig.playerSpeed} | 
        Zombies: ${gameConfig.zombieHealth}HP, Vel ${gameConfig.zombieSpeed} | 
        Mapa: ${gameConfig.mapSize}x${gameConfig.mapSize}, ${gameConfig.roomCount} salas
    `;
}

// --- 2. GESTIÓN DE PANTALLAS (UI) ---

export function updateUI() {
    const menuScreen = document.getElementById('menuScreen');
    const settingsScreen = document.getElementById('settingsScreen');
    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const roomListScreen = document.getElementById('roomListScreen');
    const canvas = document.getElementById('gameCanvas'); // Obtener canvas aquí

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

// --- 3. EVENTOS DE SOCKET (UI/LOBBY) ---

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

socket.on('gameOver', (data) => {
    stopGameLoop(); // Importado de gameClient.js
    clientState.currentState = 'gameOver';
    document.getElementById('finalScore').textContent = data.finalScore;
    document.getElementById('finalWave').textContent = data.finalWave;
    updateUI();
});

socket.on('gameEnded', () => {
    console.warn('La partida terminó.');
    stopGameLoop(); // Importado de gameClient.js
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

// --- 4. LISTENERS DE BOTONES (UI) ---

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
    updateControlMethod(); // Actualiza el método de control global
    clientState.currentState = 'menu';
    updateUI();
});

document.getElementById('resetSettingsButton').addEventListener('click', () => {
    const currentControl = gameConfig.controlType;
    // Modifica el objeto importado
    Object.assign(gameConfig, {...DEFAULT_CONFIG, controlType: currentControl});
    
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
    stopGameLoop(); // Detiene el bucle si estaba activo (ej. desde 'Continuar')
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
    stopGameLoop(); // Asegurarse de que el bucle esté detenido
    updateUI();
});

// --- 5. LISTENERS DE SLIDERS (UI) ---

document.getElementById('setting_waveMultiplier_slider').addEventListener('input', (e) => {
    document.getElementById('waveMultiplierValue').textContent = `+${e.target.value}%`;
});

document.getElementById('setting_coreBurstSpawnMultiplier_slider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value) / 100;
    document.getElementById('coreBurstSpawnMultiplierValue').textContent = `x${value.toFixed(1)}`;
});

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
document.getElementById('setting_roomCount').addEventListener('input', (e) => {
    document.getElementById('setting_roomCount_value').textContent = `${e.target.value} salas`;
});
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
document.getElementById('setting_coreBaseHealth').addEventListener('input', (e) => {
    document.getElementById('setting_coreBaseHealth_value').textContent = e.target.value;
});
document.getElementById('setting_initialZombies').addEventListener('input', (e) => {
    document.getElementById('setting_initialZombies_value').textContent = `${e.target.value} zombies`;
});
document.getElementById('setting_coreBaseSpawnRate').addEventListener('input', (e) => {
    document.getElementById('setting_coreBaseSpawnRate_value').textContent = `${e.target.value} ms`;
});
document.getElementById('setting_coreHealthMultiplier_slider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('setting_coreHealthMultiplier_value').textContent = `+${value - 100}%`;
});

// --- 6. INICIALIZACIÓN DE LA UI ---
loadConfig();
updateUI();