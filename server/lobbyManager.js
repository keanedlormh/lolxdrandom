/**
 * server/lobbyManager.js (v1.7 - NUEVO)
 * - Gestiona todas las conexiones de Socket.io, salas y lógica de alto nivel.
 * - Importa GameLogic para crear nuevas instancias de juego.
 * - (v1.5) DEFAULT_CONFIG incluye coreHealthMultiplier.
 */

const GameLogic = require('./gameLogic'); 

const SERVER_TICK_RATE = 30;

// Estado global del servidor (privado a este módulo)
const activeGames = new Map();
const userToRoom = new Map();

// (v1.5) Configuración por defecto actualizada
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
    coreHealthMultiplier: 1.15 // Añadido en v1.5
};

// --- CLASES DE ALTO NIVEL (LOBBY) ---
class Player {
    constructor(id, name, isHost = false) {
        this.id = id;
        this.name = name;
        this.isHost = isHost;
    }
}

class Game {
    constructor(id, hostId, hostName, config) {
        this.id = id;
        this.players = [new Player(hostId, hostName, true)];
        this.status = 'lobby';
        this.gameLogic = null;
        this.gameLoopInterval = null;
        this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
    }

    getLobbyData() {
        return {
            id: this.id,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                isHost: p.isHost
            })),
            status: this.status
        };
    }
}

// --- FUNCIONES DE ALTO NIVEL (LOBBY) ---
function generateRoomId() {
    let id = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Gestiona la limpieza de salas, la migración de host y la eliminación de salas vacías.
 * @param {string} roomId - El ID de la sala a limpiar.
 * @param {Server} io - La instancia de Socket.io.
 */
function handleGameCleanup(roomId, io) {
    const game = activeGames.get(roomId);
    if (!game) return;

    if (game.players.length === 0) {
        if (game.gameLoopInterval) clearInterval(game.gameLoopInterval);
        activeGames.delete(roomId);
        console.log(`[CLEANUP] Sala ${roomId} eliminada.`);
    } else {
        let currentHost = game.players.find(p => p.isHost);

        if (!currentHost || !game.players.some(p => p.id === currentHost.id)) {
            game.players.forEach(p => p.isHost = false); 
            const newHost = game.players[0];
            newHost.isHost = true;
            console.log(`[LOBBY] Nuevo Host en sala ${roomId}: ${newHost.name}`);
        }
        io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
    }
}

// --- FUNCIÓN PRINCIPAL DE INICIALIZACIÓN ---
/**
 * Inicializa todos los listeners de Socket.io para la gestión de salas.
 * @param {Server} io - La instancia del servidor Socket.io.
 */
function initLobbyManager(io) {
    
    io.on('connection', (socket) => {
        console.log(`[CONEXION] Usuario: ${socket.id}`);

        // Crear partida
        socket.on('createGame', (data) => {
            let roomId = generateRoomId();
            while (activeGames.has(roomId)) {
                roomId = generateRoomId();
            }

            if (userToRoom.has(socket.id)) {
                 socket.emit('joinFailed', 'Ya estas en una sala.');
                return;
            }

            const playerName = data.name || 'Jugador';
            const config = { ...DEFAULT_CONFIG, ...(data.config || {}) };
            const newGame = new Game(roomId, socket.id, playerName, config);
            
            activeGames.set(roomId, newGame);
            userToRoom.set(socket.id, roomId);
            socket.join(roomId);

            console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
            socket.emit('gameCreated', newGame.getLobbyData());
        });

        // Unirse a partida
        socket.on('joinGame', (roomId, playerName) => {
            const game = activeGames.get(roomId);

            if (!game) {
                socket.emit('joinFailed', 'Sala no encontrada.');
                return;
            }

            if (game.status !== 'lobby' && game.status !== 'playing') {
                socket.emit('joinFailed', 'Sala no disponible.');
                return;
            }

            if (userToRoom.has(socket.id)) {
                socket.emit('joinFailed', 'Ya estas en una sala.');
                return;
            }

            const newPlayer = new Player(socket.id, playerName);
            game.players.push(newPlayer);
            userToRoom.set(socket.id, roomId);
            socket.join(roomId);

            if (game.status === 'lobby') {
                console.log(`[LOBBY] ${playerName} se unio a sala ${roomId}`);
                socket.emit('joinSuccess', game.getLobbyData()); 
                io.to(roomId).emit('lobbyUpdate', game.getLobbyData());

            } else if (game.status === 'playing') {
                console.log(`[GAME] ${playerName} se unio a partida en curso ${roomId}`);
                if (game.gameLogic) {
                    game.gameLogic.addPlayer(newPlayer, game.config);
                }
                const mapData = {
                    mapData: game.gameLogic.map.map,
                    cellSize: game.gameLogic.map.cellSize
                };
                socket.emit('gameStarted', mapData);
                io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
            }
        });

        // Pedir lista de salas
        socket.on('requestGameList', () => {
            const joinableGames = Array.from(activeGames.values())
                .filter(game => game.status === 'lobby' || game.status === 'playing')
                .map(game => ({
                    id: game.id,
                    hostName: game.players.find(p => p.isHost)?.name || 'Desconocido',
                    playerCount: game.players.length
                }));
            socket.emit('gameList', joinableGames);
        });

        // Salir de una sala
        socket.on('leaveRoom', (roomId) => {
            const game = activeGames.get(roomId);
            if (game && userToRoom.get(socket.id) === roomId) {
                socket.leave(roomId);
                game.players = game.players.filter(p => p.id !== socket.id);
                userToRoom.delete(socket.id);

                console.log(`[SALA] Jugador ${socket.id} abandono sala ${roomId}`);
                if (game.status === 'playing' && game.gameLogic) {
                    game.gameLogic.removePlayer(socket.id);
                }
                handleGameCleanup(roomId, io);
            }
        });

        // Iniciar partida
        socket.on('startGame', (roomId) => {
            const game = activeGames.get(roomId);
            const isHost = game?.players.find(p => p.id === socket.id)?.isHost;
            
            if (!game || game.status !== 'lobby' || !isHost) {
                console.warn(`[SEGURIDAD] Inicio fallido en sala ${roomId}`);
                return;
            }

            console.log(`[GAME START] Iniciando en sala ${roomId}`);
            console.log(`[CONFIG] Usando configuracion:`, game.config);

            const playerData = game.players.map(p => ({ id: p.id, name: p.name }));
            
            // Crear la instancia de GameLogic
            game.gameLogic = new GameLogic(playerData, game.config);
            game.status = 'playing';

            const mapData = {
                mapData: game.gameLogic.map.map,
                cellSize: game.gameLogic.map.cellSize
            };
            io.to(roomId).emit('gameStarted', mapData);

            // Iniciar el bucle del juego
            game.gameLoopInterval = setInterval(() => {
                if (game.status !== 'playing') return;
                game.gameLogic.update(); 

                if (game.gameLogic.isGameOver()) {
                    clearInterval(game.gameLoopInterval);
                    game.status = 'finished'; 
                    const finalData = game.gameLogic.getFinalScore();
                    io.to(roomId).emit('gameOver', finalData);
                    console.log(`[GAME OVER] Sala ${roomId} - Puntuacion: ${finalData.finalScore}, Oleada: ${finalData.finalWave}`);
                    return;
                }
                const snapshot = game.gameLogic.getGameStateSnapshot(); 
                io.to(roomId).emit('gameState', snapshot);
            }, 1000 / SERVER_TICK_RATE);
        });

        // Recibir input
        socket.on('playerInput', (input) => {
            const roomId = userToRoom.get(socket.id);
            const game = activeGames.get(roomId);
            if (game && game.status === 'playing' && game.gameLogic) {
                game.gameLogic.handlePlayerInput(socket.id, input);
            }
        });

        // Volver al lobby (desde Game Over)
        socket.on('returnToLobby', (roomId) => {
            const game = activeGames.get(roomId);
            if (game && game.status === 'finished') {
                if (game.gameLogic) {
                    game.gameLogic = null;
                }
                game.status = 'lobby';
                handleGameCleanup(roomId, io);
                io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
                console.log(`[LOBBY] Sala ${roomId} ha vuelto a la sala de espera.`);
            }
        });

        // Desconexión
        socket.on('disconnect', () => {
            const roomId = userToRoom.get(socket.id);
            const game = activeGames.get(roomId);

            if (game) {
                console.log(`[DESCONEXION] Jugador ${socket.id} en sala ${roomId}`);
                game.players = game.players.filter(p => p.id !== socket.id);
                userToRoom.delete(socket.id);

                if (game.status === 'playing' && game.gameLogic) {
                    game.gameLogic.removePlayer(socket.id);
                }
                handleGameCleanup(roomId, io);
            } else {
                userToRoom.delete(socket.id); 
            }
            console.log(`[DESCONEXION] Usuario: ${socket.id}`);
        });
    });
}

// Exportar la función de inicialización
module.exports = {
    initLobbyManager
};