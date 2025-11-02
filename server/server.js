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
const GameLogic = require('./gameLogic'); 


const app = express();
app.use(express.static(path.join(__dirname, '../client')));
const server = http.createServer(app);
const io = new Server(server);


const PORT = process.env.PORT || 3000;
const SERVER_TICK_RATE = 30; // 30 ticks por segundo para la lógica de juego


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

// Lógica de limpieza y reasignación de Host
function handleGameCleanup(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;

    if (game.players.length === 0) {
        if (game.gameLoopInterval) clearInterval(game.gameLoopInterval);
        activeGames.delete(roomId);
        console.log(`[CLEANUP] Sala ${roomId} eliminada por vacía.`);
    } else {
        // 1. Verificar si hay un Host
        let currentHost = game.players.find(p => p.isHost);

        // 2. Si no hay host o el host que se fue era el único, asignar uno nuevo
        if (!currentHost || !game.players.some(p => p.id === currentHost.id)) {
            // Asegurar que solo el nuevo host tenga la bandera
            game.players.forEach(p => p.isHost = false); 
            
            const newHost = game.players[0]; // El primero en la lista es el nuevo host
            newHost.isHost = true;
            
            console.log(`[LOBBY] Nuevo Host asignado en sala ${roomId}: ${newHost.name} (${newHost.id})`);
        }
        // Notificar a todos del cambio de host o lista de jugadores
        io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
    }
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

        if (userToRoom.has(socket.id)) {
             socket.emit('joinFailed', 'Ya estás en una sala. Por favor, recarga o abandona la sala actual.');
            return;
        }

        const newGame = new Game(roomId, socket.id, playerName);
        activeGames.set(roomId, newGame);
        userToRoom.set(socket.id, roomId);
        
        socket.join(roomId);
        
        console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
        socket.emit('gameCreated', newGame.getLobbyData());
    });


    // --- LOBBY: Unirse a una partida ---
    socket.on('joinGame', (roomId, playerName) => {
        const game = activeGames.get(roomId);

        if (!game || game.status !== 'lobby') {
            socket.emit('joinFailed', 'Sala no encontrada o la partida ya ha iniciado.');
            return;
        }

        if (userToRoom.has(socket.id)) {
            socket.emit('joinFailed', 'Ya estás en una sala.');
            return;
        }

        const newPlayer = new Player(socket.id, playerName);
        game.players.push(newPlayer);
        userToRoom.set(socket.id, roomId);
        socket.join(roomId);

        console.log(`[LOBBY] Jugador ${playerName} se unió a la sala ${roomId}`);
        
        socket.emit('joinSuccess', game.getLobbyData()); 
        io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
    });
    
    // --- LOBBY: Abandona la sala (Volver al menú) ---
    socket.on('leaveRoom', (roomId) => {
        const game = activeGames.get(roomId);
        
        if (game && userToRoom.get(socket.id) === roomId && game.status === 'lobby') {
            socket.leave(roomId);
            game.players = game.players.filter(p => p.id !== socket.id);
            userToRoom.delete(socket.id);
            
            console.log(`[LOBBY] Jugador ${socket.id} abandonó sala ${roomId} voluntariamente.`);
            handleGameCleanup(roomId);
        }
    });


    // --- JUEGO: Iniciar Partida ---
    socket.on('startGame', (roomId) => {
        const game = activeGames.get(roomId);

        // Verificación de seguridad: Solo el host en el lobby puede iniciar
        const isHost = game?.players.find(p => p.id === socket.id)?.isHost;
        if (!game || game.status !== 'lobby' || !isHost) {
            console.warn(`[SEGURIDAD] Intento fallido de inicio de juego en sala: ${roomId} por ${socket.id}. (No es Host o no está en Lobby)`);
            return;
        }

        console.log(`[GAME START] Iniciando partida en sala: ${roomId}`);

        // Inicializar la lógica de juego con los datos de los jugadores (incluyendo nombres)
        const playerData = game.players.map(p => ({ id: p.id, name: p.name }));
        game.gameLogic = new GameLogic(playerData);
        game.status = 'playing';

        // 3. Emitir evento de inicio con datos del mapa
        const mapData = {
            mapData: game.gameLogic.map.map,
            cellSize: game.gameLogic.map.cellSize
        };
        
        io.to(roomId).emit('gameStarted', mapData);
        
        // 4. Iniciar el Game Loop
        game.gameLoopInterval = setInterval(() => {
            if (game.status !== 'playing') return;
            
            game.gameLogic.update(); 
            
            if (game.gameLogic.isGameOver()) {
                clearInterval(game.gameLoopInterval);
                game.status = 'finished';
                const finalData = game.gameLogic.getFinalScore();
                io.to(roomId).emit('gameOver', finalData);
                return;
            }

            // CRÍTICO: gameLogic.getGameStateSnapshot() fue agregado a gameLogic.js
            const snapshot = game.gameLogic.getGameStateSnapshot(); 
            io.to(roomId).emit('gameState', snapshot);
            
        }, 1000 / SERVER_TICK_RATE);
    });


    // --- JUEGO: Recibir Input ---
    socket.on('playerInput', (input) => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);

        if (game && game.status === 'playing' && game.gameLogic) {
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
            
            // 2. Notificar a GameLogic si el juego estaba activo
            if (game.status === 'playing' && game.gameLogic) {
                game.gameLogic.removePlayer(socket.id);
                io.to(roomId).emit('playerDisconnected', socket.id);
                // Si el juego está en curso y el host se va, se podría detener la partida
                // Por ahora, solo reasignamos el host para el lobby/futuros juegos
            }
            
            // 3. Limpiar la sala o reasignar Host
            handleGameCleanup(roomId);

            // Si el juego estaba en curso y la sala queda vacía, se detiene en handleGameCleanup
        } else {
            userToRoom.delete(socket.id); 
        }

        console.log(`[DESCONEXIÓN] Usuario desconectado: ${socket.id}`);
    });
});


// --- INICIO DEL SERVIDOR ---


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client', 'index.html')); 
});


server.listen(PORT, () => {
    console.log(`Servidor de juego iniciado en http://localhost:${PORT}`);
    console.log(`Tasa de tick del servidor: ${SERVER_TICK_RATE} TPS`);
});