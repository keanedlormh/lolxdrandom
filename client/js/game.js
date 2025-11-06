/**
 * client/js/game.js - ACTUALIZADO v1.2
 * - MODIFICADO: Lógica de Configuración (apply, read, presets) para
 * manejar el nuevo slider de porcentaje (10-100) y convertirlo
 * al valor real del multiplicador (1.1-2.0).
 * - AÑADIDO: Event listener para que el slider actualice el texto (span).
 */


const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');


const SCALE = 1.0; 
window.SCALE = SCALE;
const SERVER_TICK_RATE = 30;


// --- v1.2: MODIFICADO ---
// El waveMultiplier ahora es 1.5 (un 50% de aumento) por defecto
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
    initialZombies: 5,
    waveMultiplier: 1.5 // 50% de aumento
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


// --- v1.2: MODIFICADO ---
// Aplicar configuración a los inputs del UI
function applyConfigToUI() {
    document.getElementById('setting_controlType').value = gameConfig.controlType;
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


    // Convertir el valor real (1.1 - 2.0) al valor del slider (10 - 100)
    const sliderValue = Math.round((gameConfig.waveMultiplier - 1) * 100);
    document.getElementById('setting_waveMultiplier_slider').value = sliderValue;
    document.getElementById('waveMultiplierValue').textContent = `+${sliderValue}%`;
    // El input oculto (si aún existe)
    document.getElementById('setting_waveMultiplier').value = gameConfig.waveMultiplier;
}


// --- v1.2: MODIFICADO ---
// Leer configuración desde el UI
function readConfigFromUI() {
    gameConfig.controlType = document.getElementById('setting_controlType').value; 
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


    // Convertir el valor del slider (10 - 100) al valor real (1.1 - 2.0)
    const sliderValue = parseInt(document.getElementById('setting_waveMultiplier_slider').value);
    gameConfig.waveMultiplier = 1 + (sliderValue / 100);
}


// --- v1.2: MODIFICADO ---
// Presets de dificultad actualizados a la nueva lógica de multiplicador
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
                initialZombies: 3,
                waveMultiplier: 1.3 // 30%
            };
            break;
        case 'normal':
            presetSettings = {...DEFAULT_CONFIG};
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
                initialZombies: 8,
                waveMultiplier: 1.8 // 80%
            };
            break;
    }
    gameConfig = {...gameConfig, ...presetSettings};
    applyConfigToUI();
};


// ... (Lógica de controles, red, interpolación, renderizado, HUD, minimapa... omitida por brevedad) ...
// ... (Toda la parte de drawHUD y drawMinimap se mantiene como en la v1.2 anterior) ...
// ... (Toda la parte de Socket.IO y listeners de botones se mantiene) ...


// --- v1.2: AÑADIDO ---
// Listener para el nuevo slider de oleadas
document.getElementById('setting_waveMultiplier_slider').addEventListener('input', (e) => {
    document.getElementById('waveMultiplierValue').textContent = `+${e.target.value}%`;
});
// --- FIN AÑADIDO v1.2 ---


// --- INICIO ---
loadConfig(); 
updateUI();
requestAnimationFrame(gameLoopRender);