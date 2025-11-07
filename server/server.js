/**
 * server/server.js - ACTUALIZADO v1.4
 *
 * 1. (v1.3) Lógica de 'returnToLobby' y 'finished' (post-partida).
 * 2. (v1.3) DEFAULT_CONFIG actualizado con las variables del Núcleo de 2 fases.
 * 3. (v1.4) MODIFICADO 'joinGame':
 * - Ahora permite unirse si `game.status === 'playing'`.
 * - Si se une a una partida en juego:
 * - Llama a `game.gameLogic.addPlayer()` para añadir al jugador
 * en estado "pendiente".
 * - Emite 'gameStarted' solo al nuevo jugador para que cargue el mapa.
 * - Emite 'lobbyUpdate' a todos para actualizar el contador de jugadores.
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


// --- v1.3: Configuración por defecto actualizada ---
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
    initialZombies: 10, // Zombies Fase 1 (Oleada 1)
    waveMultiplier: 1.5, // Aum. Zombies Fase 1 (+50%)
    coreBaseHealth: 500,
    coreBaseSpawnRate: 5000, // Ritmo Fase 2 (ms)
    coreBurstSpawnMultiplier: 2.5 // Ritmo Fase 1 (x2.5)
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
        // v1.3: Asegurarse que la config fusionada
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
        // v1.3: Fusionar config recibida con default
        const config = { ...DEFAULT_CONFIG, ...(data.config || {}) };


        const newGame = new Game(roomId, socket.id, playerName, config);
        activeGames.set(roomId, newGame);
        userToRoom.set(socket.id, roomId);


        socket.join(roomId);


        console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
        console.log(`[CONFIG] Configuracion:`, config);
        socket.emit('gameCreated', newGame.getLobbyData());
    });


    // --- v1.4: 'joinGame' MODIFICADO ---
    socket.on('joinGame', (roomId, playerName) => {
        const game = activeGames.get(roomId);


        if (!game) {
            socket.emit('joinFailed', 'Sala no encontrada.');
            return;
        }


        // v1.4: Permitir unirse a 'lobby' o 'playing'
        if (game.status !== 'lobby' && game.status !== 'playing') {
            socket.emit('joinFailed', 'Sala no disponible.');
            return;
        }


        if (userToRoom.has(socket.id)) {
            socket.emit('joinFailed', 'Ya estas en una sala.');
            return;
        }


        const newPlayer = new Player(socket.id, playerName);
        game.players.push(newPlayer); // Añadir a la lista general de la sala
        userToRoom.set(socket.id, roomId);
        socket.join(roomId);


        if (game.status === 'lobby') {
            // Comportamiento normal: unirse al lobby
            console.log(`[LOBBY] ${playerName} se unio a sala ${roomId}`);
            socket.emit('joinSuccess', game.getLobbyData()); 
            io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
        
        } else if (game.status === 'playing') {
            // v1.4: Comportamiento de "Unirse en Curso"
            console.log(`[GAME] ${playerName} se unio a partida en curso ${roomId}`);
            
            // 1. Añadir jugador a la lógica del juego como "pendiente"
            if (game.gameLogic) {
                game.gameLogic.addPlayer(newPlayer, game.config);
            }


            // 2. Enviar datos del mapa SÓLO al nuevo jugador
            const mapData = {
                mapData: game.gameLogic.map.map,
                cellSize: game.gameLogic.map.cellSize
            };
            socket.emit('gameStarted', mapData); // El cliente cargará el juego


            // 3. Notificar a todos (incluido el nuevo) del cambio en la sala
            io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
        }
    });


    socket.on('requestGameList', () => {
        const joinableGames = Array.from(activeGames.values())
            // v1.4: Ahora se pueden unir a 'lobby' o 'playing'
            .filter(game => game.status === 'lobby' || game.status === 'playing')
            .map(game => ({
                id: game.id,
                hostName: game.players.find(p => p.isHost)?.name || 'Desconocido',
                playerCount: game.players.length
            }));
        socket.emit('gameList', joinableGames);
    });


    socket.on('leaveRoom', (roomId) => {
        const game = activeGames.get(roomId);


        if (game && userToRoom.get(socket.id) === roomId) {
            socket.leave(roomId);
            game.players = game.players.filter(p => p.id !== socket.id);
            userToRoom.delete(socket.id);


            console.log(`[SALA] Jugador ${socket.id} abandono sala ${roomId}`);
            
            // v1.4: Si el jugador estaba en una partida, removerlo de la lógica
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


            // v1.4: isGameOver() ahora solo es true si todos los activos mueren
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


    socket.on('playerInput', (input) => {
        const roomId = userToRoom.get(socket.id);
        const game = activeGames.get(roomId);


        if (game && game.status === 'playing' && game.gameLogic) {
            game.gameLogic.handlePlayerInput(socket.id, input);
        }
    });


    socket.on('returnToLobby', (roomId) => {
        const game = activeGames.get(roomId);
        
        if (game && game.status === 'finished') {
            
            if (game.gameLogic) {
                game.gameLogic = null;
                console.log(`[LOBBY] Reseteando GameLogic para sala ${roomId}`);
            }


            game.status = 'lobby';


            handleGameCleanup(roomId);
            
            io.to(roomId).emit('lobbyUpdate', game.getLobbyData());
            console.log(`[LOBBY] Sala ${roomId} ha vuelto a la sala de espera.`);
        }
    });


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