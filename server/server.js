/**
 * server.js
 * Servidor principal de Node.js que maneja la lógica de juego central,
 * el estado del mundo y la comunicación en tiempo real a través de Socket.IO.
 */

// --- DEPENDENCIAS Y SETUP ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
// Importar la clase de lógica del juego (debe existir en el directorio server/)
const GameLogic = require('server/gameLogic.js'); 

const app = express();
const server = http.createServer(app);
// Configurar Socket.IO para trabajar con el servidor HTTP
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SERVER_TICK_RATE = 30; // 30 ticks por segundo para la lógica de juego

// Servir archivos estáticos desde el directorio 'client'
app.use(express.static(path.join(__dirname, 'client')));

// Estructuras de datos para gestionar las partidas activas
const activeGames = new Map(); // { roomId: GameInstance }
const userToRoom = new Map(); // { socketId: roomId }

// --- ESTRUCTURAS DE DATOS BÁSICAS ---
/** Clase simple para representar el estado de un jugador en el lobby/server */
class Player {
    constructor(id, name, isHost = false) {
        this.id = id;
        this.name = name;
        this.isHost = isHost;
    }
}

/** Clase simple para representar una sala de juego */
class Game {
    constructor(id, hostId, hostName) {
        this.id = id;
        this.players = [new Player(hostId, hostName, true)]; // La primera es el Host
        this.status = 'lobby'; // 'lobby', 'playing', 'finished'
        this.gameLogic = null; // Instancia de GameLogic
        this.gameLoopInterval = null; // ID del intervalo de ticks del juego
    }

    // Retorna una lista segura para enviar al cliente
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

// --- UTILIDADES ---

// Genera un ID de sala simple (ej. ABCD)
function generateRoomId() {
    let id = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// --- GESTIÓN DE SOCKET.IO ---

io.on('connection', (socket) => {
    console.log(`[CONEXIÓN] Usuario conectado: ${socket.id}`);

    // --- LOBBY: Crear una partida ---
    socket.on('createGame', (playerName) => {
        let roomId = generateRoomId();
        while (activeGames.has(roomId)) {
            roomId = generateRoomId();
        }

        const newGame = new Game(roomId, socket.id, playerName);
        activeGames.set(roomId, newGame);
        userToRoom.set(socket.id, roomId);
        
        socket.join(roomId);
        
        console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
        io.to(socket.id).emit('gameCreated', newGame.getLobbyData());
    });

    // --- LOBBY: Unirse a una partida ---
    socket.on('joinGame', (roomId, playerName) => {
        const game = activeGames.get(roomId);

        if (!game || game.status !== 'lobby') {
            io.to(socket.id).emit('joinFailed', 'Sala no encontrada o la partida ya ha iniciado.');
            return;
        }

        if (userToRoom.has(socket.id)) {
            // El usuario ya está en otra sala. Salir o manejar el error.
            io.to(socket.id).emit('joinFailed', 'Ya estás en una sala.');
            return;
        }

        const newPlayer = new Player(socket.id, playerName);
        game.players.push(newPlayer);
        userToRoom.set(socket.id, roomId);
        socket.join(roomId);

        console.log(`[LOBBY] Jugador ${playerName} se unió a la sala ${roomId}`);
        
        // Notificar al jugador que se unió (para actualizar su estado)
        io.to(socket.id).emit('joinSuccess', game.getLobbyData()); 
        // Notificar a toda la sala (incluido el nuevo jugador)
        io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
    });

    // --- LÓGICA CRÍTICA: Iniciar Partida ---
    socket.on('startGame', (roomId) => {
        const game = activeGames.get(roomId);

        if (!game) {
            console.error(`[ERROR] Intento de inicio de juego en sala inexistente: ${roomId}`);
            return;
        }

        // 1. Verificar que el host está iniciando la partida
        const isHost = game.players.find(p => p.id === socket.id)?.isHost;
        if (!isHost) {
            console.warn(`[SEGURIDAD] Usuario no host (${socket.id}) intentó iniciar la partida ${roomId}.`);
            return;
        }

        if (game.status !== 'lobby') {
            console.warn(`[WARN] Partida ${roomId} ya ha iniciado.`);
            return;
        }

        console.log(`[GAME START] Iniciando partida en sala: ${roomId}`);

        // 2. Inicializar la lógica de juego
        // AHORA se inicializa GameLogic, que contiene MapGenerator y las entidades
        try {
            game.gameLogic = new GameLogic(game.players.map(p => p.id));
        } catch (error) {
            console.error('ERROR AL INICIALIZAR GAMELOGIC. Asegúrate de que server/gameLogic.js existe y exporta la clase GameLogic.', error);
            // Evitar que el servidor falle catastróficamente
            return;
        }

        game.status = 'playing';

        // 3. Emitir evento de inicio con datos del mapa
        const mapData = {
            mapData: game.gameLogic.map.map, // Array 2D del mapa
            cellSize: game.gameLogic.map.cellSize
        };
        
        io.to(roomId).emit('gameStarted', mapData);

        // 4. Iniciar el Game Loop (Enviar snapshots periódicos)
        game.gameLoopInterval = setInterval(() => {
            if (game.status !== 'playing') return;
            
            // Actualizar la lógica del juego (movimiento, colisiones, spawns)
            game.gameLogic.update(); 
            
            // Si el juego terminó, limpiar y notificar
            if (game.gameLogic.isGameOver()) {
                clearInterval(game.gameLoopInterval);
                game.status = 'finished';
                const finalData = game.gameLogic.getFinalScore();
                io.to(roomId).emit('gameOver', finalData);
                return;
            }

            // Enviar el snapshot del estado a los clientes
            const snapshot = game.gameLogic.getGameStateSnapshot();
            io.to(roomId).emit('gameState', snapshot);
            
        }, 1000 / SERVER_TICK_RATE);
    });

    // --- JUEGO: Recibir Input ---
    socket.on('playerInput', (input) => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);

        if (game && game.status === 'playing') {
            game.gameLogic.handlePlayerInput(socket.id, input);
        }
    });

    // --- DESCONEXIÓN ---
    socket.on('disconnect', () => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);

        if (game) {
            console.log(`[DESCONEXIÓN] Jugador ${socket.id} abandonó sala ${roomId}`);
            
            // 1. Eliminar jugador de la sala
            game.players = game.players.filter(p => p.id !== socket.id);
            userToRoom.delete(socket.id);
            
            // 2. Gestionar la sala según el estado
            if (game.players.length === 0) {
                // Si la sala está vacía, detener el loop y eliminar la partida
                if (game.gameLoopInterval) clearInterval(game.gameLoopInterval);
                activeGames.delete(roomId);
                console.log(`[CLEANUP] Sala ${roomId} eliminada por vacía.`);
            } else {
                // Si el Host se desconectó, asignar un nuevo Host (el primer jugador restante)
                const currentHost = game.players.find(p => p.isHost);
                if (!currentHost) {
                    game.players.forEach(p => p.isHost = false); // Limpiar banderas viejas
                    game.players[0].isHost = true; // Asignar nuevo host
                }

                // Si el juego está en curso, notificar a GameLogic y a los clientes
                if (game.status === 'playing') {
                    game.gameLogic.removePlayer(socket.id);
                }
                
                // Actualizar lobby/juego para el resto de jugadores
                io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
                io.to(roomId).emit('playerDisconnected', socket.id);
            }
        } else {
            userToRoom.delete(socket.id); // Limpiar si estaba mapeado pero la sala no existía
        }

        console.log(`[DESCONEXIÓN] Usuario desconectado: ${socket.id}`);
    });
});


// --- INICIO DEL SERVIDOR ---

// Manejar la ruta raíz para servir el HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Servidor de juego iniciado en http://localhost:${PORT}`);
    console.log(`Tasa de tick del servidor: ${SERVER_TICK_RATE} TPS`);
});