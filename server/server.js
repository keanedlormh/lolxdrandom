/**
 * server/server.js - ACTUALIZADO v1.2
 *
 * Esta versión incluye:
 * 1. (v1.1) Listener 'requestGameList' para el buscador de salas.
 * 2. (v1.2) Lógica de Game Over modificada:
 * - El bucle de juego se detiene.
 * - El estado de la sala se cambia a 'finished'.
 * - Se emite 'gameOver' pero la sala NO se destruye.
 * 3. (v1.2) Nuevo listener 'returnToLobby':
 * - Resetea una sala 'finished' de nuevo a 'lobby'.
 * - Vuelve a crear el 'gameLogic' la próxima vez que el host inicie.
 */


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
const SERVER_TICK_RATE = 30;


const activeGames = new Map();
const userToRoom = new Map();


// Configuracion por defecto (misma que en el cliente)
const DEFAULT_CONFIG = {
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
    waveMultiplier: 1.5 // v1.2: Default 50%
};


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
        this.config = config || { ...DEFAULT_CONFIG };
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


function generateRoomId() {
    let id = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}


function handleGameCleanup(roomId) {
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


// --- SOCKET.IO ---


io.on('connection', (socket) => {
    console.log(`[CONEXION] Usuario: ${socket.id}`);


    // Crear partida CON configuracion
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
        const config = data.config || { ...DEFAULT_CONFIG };


        const newGame = new Game(roomId, socket.id, playerName, config);
        activeGames.set(roomId, newGame);
        userToRoom.set(socket.id, roomId);


        socket.join(roomId);


        console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
        console.log(`[CONFIG] Configuracion:`, config);
        socket.emit('gameCreated', newGame.getLobbyData());
    });


    socket.on('joinGame', (roomId, playerName) => {
        const game = activeGames.get(roomId);


        if (!game || game.status !== 'lobby') {
            socket.emit('joinFailed', 'Sala no encontrada o partida iniciada.');
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


        console.log(`[LOBBY] ${playerName} se unio a sala ${roomId}`);


        socket.emit('joinSuccess', game.getLobbyData()); 
        io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
    });


    /**
     * v1.1: Petición de lista de salas
     */
    socket.on('requestGameList', () => {
        // Filtrar juegos activos para encontrar solo los que están en 'lobby'
        const joinableGames = Array.from(activeGames.values())
            .filter(game => game.status === 'lobby')
            .map(game => ({
                id: game.id,
                hostName: game.players.find(p => p.isHost)?.name || 'Desconocido',
                playerCount: game.players.length
            }));


        // Enviar la lista solo al cliente que la pidió
        socket.emit('gameList', joinableGames);
    });


    socket.on('leaveRoom', (roomId) => {
        const game = activeGames.get(roomId);


        if (game && userToRoom.get(socket.id) === roomId) {
            socket.leave(roomId);
            game.players = game.players.filter(p => p.id !== socket.id);
            userToRoom.delete(socket.id);


            console.log(`[SALA] Jugador ${socket.id} abandono sala ${roomId}`);

            // Si el jugador estaba en una partida 'playing' o 'finished'
            if (game.status === 'playing' && game.gameLogic) {
                game.gameLogic.removePlayer(socket.id);
            }

            handleGameCleanup(roomId);
        }
    });


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


        // Pasar configuracion al GameLogic
        game.gameLogic = new GameLogic(playerData, game.config);
        game.status = 'playing';


        const mapData = {
            mapData: game.gameLogic.map.map,
            cellSize: game.gameLogic.map.cellSize
        };


        io.to(roomId).emit('gameStarted', mapData);


        game.gameLoopInterval = setInterval(() => {
            if (game.status !== 'playing') return;


            game.gameLogic.update(); 


            // --- v1.2: LÓGICA DE GAME OVER MODIFICADA ---
            if (game.gameLogic.isGameOver()) {
                clearInterval(game.gameLoopInterval);
                game.status = 'finished'; // Cambia a 'finished' en lugar de destruir
                const finalData = game.gameLogic.getFinalScore();

                io.to(roomId).emit('gameOver', finalData);
                console.log(`[GAME OVER] Sala ${roomId} - Puntuacion: ${finalData.finalScore}, Oleada: ${finalData.finalWave}`);
                // Ya no se limpia la sala aquí, se espera a los jugadores
                return;
            }
            // --- FIN MODIFICACIÓN v1.2 ---


            const snapshot = game.gameLogic.getGameStateSnapshot(); 
            io.to(roomId).emit('gameState', snapshot);


        }, 1000 / SERVER_TICK_RATE);
    });


    socket.on('playerInput', (input) => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);


        if (game && game.status === 'playing' && game.gameLogic) {
            game.gameLogic.handlePlayerInput(socket.id, input);
        }
    });


    // --- v1.2: NUEVO LISTENER POST-PARTIDA ---
    socket.on('returnToLobby', (roomId) => {
        const game = activeGames.get(roomId);

        // Solo el host puede reiniciar el lobby (o podría ser cualquiera)
        // Por ahora, cualquiera puede reiniciar si la partida terminó
        if (game && game.status === 'finished') {

            // Si la lógica del juego aún existe, la reseteamos
            if (game.gameLogic) {
                game.gameLogic = null; // Libera la instancia del juego
                console.log(`[LOBBY] Reseteando GameLogic para sala ${roomId}`);
            }

            // Si el estado es 'finished', lo cambiamos a 'lobby'
            game.status = 'lobby';

            // Forzar una actualización de host por si acaso
            handleGameCleanup(roomId);

            // Notificar a todos que volvemos al lobby
            io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
            console.log(`[LOBBY] Sala ${roomId} ha vuelto a la sala de espera.`);
        }
    });
    // --- FIN NUEVO LISTENER v1.2 ---


    socket.on('disconnect', () => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);


        if (game) {
            console.log(`[DESCONEXION] Jugador ${socket.id} en sala ${roomId}`);


            game.players = game.players.filter(p => p.id !== socket.id);
            userToRoom.delete(socket.id);


            if (game.status === 'playing' && game.gameLogic) {
                game.gameLogic.removePlayer(socket.id);
                io.to(roomId).emit('playerDisconnected', socket.id);
            }


            handleGameCleanup(roomId);
        } else {
            userToRoom.delete(socket.id); 
        }


        console.log(`[DESCONEXION] Usuario: ${socket.id}`);
    });
});


// --- INICIO DEL SERVIDOR ---


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client', 'index.html')); 
});


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Tick Rate: ${SERVER_TICK_RATE} TPS`);
});