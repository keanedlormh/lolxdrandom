// IMPORTANTE: Este código requiere 'express' y 'socket.io' instalados.
// npm install express socket.io
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Inicializa Socket.IO
const io = new Server(server);

// Mapa para almacenar instancias de juegos activos por Room ID
const games = new Map(); 

// --- CLASES Y LÓGICA DE JUEGO DEL SERVIDOR ---

/**
 * Clase que gestiona el estado de un único juego (sala de multijugador).
 * Sustituye a la lógica de server/gameLogic.js (que se puede refinar luego)
 */
class ServerGame {
    constructor(id, hostId) {
        this.id = id;
        this.hostId = hostId;
        // Mapa de jugadores: { id: { id, name, isHost, socket } }
        this.players = new Map(); 
        this.isRunning = false;
        this.gameInterval = null;
        
        // Simulación de datos de mapa
        // Nota: En una implementación real, esto se generaría con MapGenerator.
        this.map = {
            cellSize: 40,
            mapArray: this.generateTestMap(30) // Mapa de 30x30 celdas
        };
    }

    /**
     * Genera un mapa de prueba simple (un laberinto sencillo o solo un área abierta).
     * @param {number} size - Tamaño N x N del mapa.
     */
    generateTestMap(size) {
        const map = Array(size).fill(0).map(() => Array(size).fill(0));
        // Crear un borde simple para verificación
        for (let i = 0; i < size; i++) {
            map[0][i] = 1; // Muro superior
            map[size - 1][i] = 1; // Muro inferior
            map[i][0] = 1; // Muro izquierdo
            map[i][size - 1] = 1; // Muro derecho
        }
        return map;
    }

    /**
     * Añade un jugador al lobby de la sala.
     */
    addPlayer(id, name, socket) {
        const isHost = id === this.hostId;
        const player = { id, name, isHost, socket };
        this.players.set(id, player);
        return player;
    }

    /**
     * Prepara el juego y empieza el bucle de actualización.
     */
    startGame() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[SERVER] Partida ${this.id} iniciada. Empezando bucle de juego.`);
        
        // NOTA: Aquí se añadiría la lógica de spawn de entidades, zombis, etc.

        // Iniciar el bucle de juego (30 ticks/segundo)
        this.gameInterval = setInterval(() => {
            this.updateGame();
        }, 1000 / 30); // 30 FPS del servidor
    }

    /**
     * Actualiza el estado del juego (simulación de física, IA, etc.)
     * y emite el nuevo estado a los clientes.
     */
    updateGame() {
        // En un juego real, aquí se calcularía el movimiento de todas las entidades.
        
        // Simulación de un snapshot de ejemplo para que el cliente tenga algo que dibujar
        const snapshot = {
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                x: 1000, // Coordenadas del mundo (deberían ser dinámicas)
                y: 1000,
                health: 100,
                kills: 0
            })),
            zombies: [],
            bullets: [],
            score: 0,
            wave: 1
        };

        // Enviar el estado a toda la sala
        io.to(this.id).emit('gameState', snapshot);
    }
}


// --- CONFIGURACIÓN DE RUTAS HTTP Y CARPETA ESTÁTICA ---
app.use(express.static(path.join(__dirname, 'client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});


// --- GESTIÓN DE CONEXIONES SOCKET.IO ---

io.on('connection', (socket) => {
    console.log(`[SERVER] Nuevo cliente conectado: ${socket.id}`);

    // [EVENTO 1] Crear una nueva partida (lobby)
    socket.on('createGame', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const game = new ServerGame(roomId, socket.id);
        const player = game.addPlayer(socket.id, playerName, socket);
        games.set(roomId, game);
        socket.join(roomId);

        const lobbyPlayers = Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name, isHost: p.isHost }));
        
        socket.emit('gameCreated', { id: roomId, players: lobbyPlayers });
        console.log(`[SERVER] Sala creada: ${roomId} por ${playerName}`);
    });

    // [EVENTO 2] Unirse a una partida existente
    socket.on('joinGame', (roomId, playerName) => {
        const game = games.get(roomId);

        if (!game) {
            return socket.emit('joinFailed', 'Sala no encontrada.');
        }
        if (game.isRunning) {
            return socket.emit('joinFailed', 'La partida ya está en curso.');
        }

        socket.join(roomId);
        const player = game.addPlayer(socket.id, playerName, socket);
        
        const lobbyPlayers = Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name, isHost: p.isHost }));
        
        socket.emit('joinSuccess', { id: roomId, players: lobbyPlayers });
        // Notificar a todos los demás en la sala sobre el nuevo jugador
        socket.to(roomId).emit('lobbyUpdate', { id: roomId, players: lobbyPlayers });
        
        console.log(`[SERVER] ${playerName} se unió a la sala ${roomId}`);
    });

    // [EVENTO 3] EL FIX: Iniciar la partida (solo el host puede hacerlo)
    socket.on('startGame', (roomId) => {
        const game = games.get(roomId);

        // --- VALIDACIONES CRÍTICAS ---
        const player = game && game.players.get(socket.id);

        if (!game) {
            return console.error(`Intento de inicio de partida fallido: Sala ${roomId} no existe.`);
        }
        if (!player || player.id !== game.hostId) {
            return console.warn(`Intento de inicio de partida fallido: ${socket.id} no es el host.`);
        }
        if (game.isRunning) {
            return console.warn(`Intento de inicio de partida fallido: La partida ${roomId} ya está corriendo.`);
        }
        if (game.players.size < 1) { // Mínimo 1 jugador (para pruebas)
            return console.warn(`Intento de inicio de partida fallido: Se necesitan al menos 1 jugador.`);
        }
        // --- FIN VALIDACIONES ---
        
        // 1. Iniciar la lógica de juego del servidor
        game.startGame(); 

        // 2. Broadcast del evento 'gameStarted' a TODOS los jugadores de la sala
        io.to(roomId).emit('gameStarted', {
            mapData: game.map.mapArray,
            cellSize: game.map.cellSize
        });
        
        console.log(`[SERVER] El Host ${player.name} inició la partida ${roomId}.`);
    });

    // [EVENTO 4] El cliente envía su input
    socket.on('playerInput', (input) => {
        // En una implementación real, este input se aplicaría a la entidad del jugador
        // en el bucle 'updateGame'. Aquí simplemente lo ignoramos por ahora.
        // console.log(`Input de ${socket.id}:`, input); 
    });


    socket.on('disconnect', () => {
        console.log(`[SERVER] Cliente desconectado: ${socket.id}`);
        // Lógica para manejar desconexiones (notificar a la sala, eliminar si era el host)
        games.forEach((game, roomId) => {
            if (game.players.has(socket.id)) {
                game.players.delete(socket.id);
                // Si la sala se vacía, la eliminamos.
                if (game.players.size === 0) {
                    clearInterval(game.gameInterval);
                    games.delete(roomId);
                    console.log(`[SERVER] Sala ${roomId} eliminada por estar vacía.`);
                } else {
                    // Si el host se desconecta, la partida termina.
                    if (socket.id === game.hostId) {
                        clearInterval(game.gameInterval);
                        game.isRunning = false;
                        io.to(roomId).emit('gameEnded', 'El host se ha desconectado.');
                        games.delete(roomId);
                        console.log(`[SERVER] Partida ${roomId} terminada. Host desconectado.`);
                    } else {
                        // Si un jugador normal se desconecta, actualizamos el lobby
                        const lobbyPlayers = Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name, isHost: p.isHost }));
                        io.to(roomId).emit('lobbyUpdate', { id: roomId, players: lobbyPlayers });
                    }
                }
            }
        });
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de juego corriendo en http://localhost:${PORT}`);
});