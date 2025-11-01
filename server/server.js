/**
 * server/server.js
 * Servidor Node.js con Express y Socket.IO para el modo Multijugador.
 *
 * NOTA: Este código solo gestiona el estado de las SALAS/LOBBIES.
 * La lógica del GameLoop (movimiento, colisiones de balas) se implementará después
 * para que corra en el servidor y sincronice a los clientes.
 */

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const crypto = require('crypto'); // Para generar IDs únicos

// --- 1. Configuración de Express y HTTP ---
const app = express();
const server = http.createServer(app);

// Configuración de Socket.IO
// Importante para Render: el CORS debe permitir el acceso desde tu dominio de cliente.
// Usamos '*' por ahora para desarrollo/Render, pero es mejor especificar dominios.
const io = new Server(server, {
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Middleware para servir archivos estáticos (opcional si Render solo aloja el backend)
// Si quieres servir la carpeta 'client' desde este mismo servidor:
// app.use(express.static('../client')); 

// --- 2. Almacén de Estado Global ---

// Almacena todas las partidas activas
// games = { 'roomId': { hostId: 'socketId', state: 'waiting', players: [] } }
let games = {};

// --- 3. Generación de IDs ---

/**
 * Genera un ID de sala único de 6 caracteres.
 * @returns {string} ID único de la sala.
 */
function generateRoomId() {
    // Genera un string de 3 bytes y lo convierte a hex (6 caracteres)
    let id;
    do {
        id = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (games[id]); // Asegura que el ID sea único
    return id;
}

// --- 4. Gestión de Conexiones Socket.IO ---

io.on('connection', (socket) => {
    console.log(`[CONEXIÓN] Usuario conectado: ${socket.id}`);

    // ==========================================================
    // LÓGICA DE SALAS Y LOBBIES
    // ==========================================================

    /**
     * @event createGame
     * Un jugador pide crear una nueva sala de espera.
     */
    socket.on('createGame', (playerName) => {
        const roomId = generateRoomId();
        
        // Inicializar la partida
        games[roomId] = {
            id: roomId,
            hostId: socket.id,
            state: 'waiting', // Estado inicial: esperando jugadores
            players: [{ 
                id: socket.id, 
                name: playerName || `Player ${socket.id.substring(0, 4)}`,
                isHost: true // Identifica al host
            }],
            // Aquí se almacenarán los datos del juego (mapa, entidades) más tarde
            gameData: null 
        };

        // Unir el socket a la sala específica de Socket.IO
        socket.join(roomId);

        console.log(`[SALA CREADA] ID: ${roomId} por Host: ${socket.id}`);
        
        // Notificar solo a este cliente que la sala fue creada exitosamente
        socket.emit('gameCreated', games[roomId]);
    });

    /**
     * @event getLobbies
     * Un jugador pide la lista de partidas disponibles.
     */
    socket.on('getLobbies', () => {
        const availableLobbies = Object.values(games)
            .filter(game => game.state === 'waiting' && game.players.length < 4) // Máx. 4 jugadores
            .map(game => ({
                id: game.id,
                hostName: game.players[0].name,
                playerCount: game.players.length
            }));
            
        // Notificar al cliente con la lista
        socket.emit('lobbiesList', availableLobbies);
    });

    /**
     * @event joinGame
     * Un jugador intenta unirse a una sala existente.
     */
    socket.on('joinGame', (roomId, playerName) => {
        const game = games[roomId];
        
        if (!game || game.state !== 'waiting' || game.players.length >= 4) {
            socket.emit('joinFailed', 'La partida no existe, ya ha comenzado o está llena.');
            return;
        }

        const newPlayer = {
            id: socket.id, 
            name: playerName || `Player ${socket.id.substring(0, 4)}`,
            isHost: false
        };

        // Agregar al jugador y unirlo a la sala
        game.players.push(newPlayer);
        socket.join(roomId);

        console.log(`[SALA UNIDO] ID: ${roomId}, Jugador: ${socket.id}`);
        
        // 1. Notificar a TODOS en la sala la nueva lista de jugadores
        io.to(roomId).emit('lobbyUpdate', game); 
        
        // 2. Notificar al jugador que se unió (para que muestre la pantalla del lobby)
        socket.emit('joinSuccess', game);
    });
    
    /**
     * @event startGame
     * El host presiona "Iniciar Partida".
     */
    socket.on('startGame', (roomId) => {
        const game = games[roomId];
        
        // Verificar que el juego exista, esté en estado de espera y el emisor sea el host
        if (!game || game.state !== 'waiting' || game.hostId !== socket.id) {
            socket.emit('error', 'No tienes permiso para iniciar esta partida.');
            return;
        }
        
        // --- 1. Lógica de Inicio (Prepara los datos iniciales) ---
        game.state = 'starting'; // Cambiar estado para evitar uniones tardías
        
        // En un proyecto real, aquí se generaría el mapa, se asignarían posiciones
        // Inicialmente, enviamos la señal de inicio y dejamos que el cliente lo prepare.
        
        // --- 2. Notificar a todos los clientes de la sala ---
        console.log(`[PARTIDA INICIADA] ID: ${roomId}`);
        // Enviamos el evento para que los clientes comiencen la inicialización
        io.to(roomId).emit('gameStarted', { mapConfig: 'default' }); 
        
        // Después de un breve retraso, se puede cambiar a 'playing' y empezar el loop de juego en el servidor (futura implementación)
        game.state = 'playing';
    });

    // ==========================================================
    // LÓGICA DE DESCONEXIÓN Y LIMPIEZA
    // ==========================================================

    /**
     * @event disconnect
     * Se ejecuta cuando un cliente se desconecta (cierra la pestaña, pierde conexión).
     */
    socket.on('disconnect', () => {
        console.log(`[DESCONEXIÓN] Usuario desconectado: ${socket.id}`);
        
        // Recorrer las salas para ver si el jugador desconectado estaba en alguna
        for (const roomId in games) {
            let game = games[roomId];
            
            // 1. Eliminar al jugador de la lista de players
            const initialCount = game.players.length;
            game.players = game.players.filter(p => p.id !== socket.id);
            
            if (game.players.length < initialCount) {
                // El jugador estaba en esta sala
                
                if (game.players.length === 0) {
                    // Si la sala se queda vacía, la eliminamos
                    delete games[roomId];
                    console.log(`[SALA ELIMINADA] ID: ${roomId} (Vacía)`);
                    
                } else if (game.hostId === socket.id) {
                    // Si el host se desconecta, asignamos un nuevo host
                    const newHost = game.players[0];
                    game.hostId = newHost.id;
                    newHost.isHost = true;
                    
                    console.log(`[NUEVO HOST] Sala: ${roomId}, Host: ${newHost.id}`);
                    
                    // Notificar a todos en la sala del cambio
                    io.to(roomId).emit('lobbyUpdate', game);
                    io.to(roomId).emit('hostChanged', newHost.id);
                    
                } else {
                    // Solo notificar que un jugador normal se fue
                    io.to(roomId).emit('lobbyUpdate', game);
                }
            }
        }
    });
    
    // ==========================================================
    // LÓGICA DE JUEGO (Placeholder para el futuro)
    // ==========================================================
    
    // Placeholder para la sincronización de movimiento
    socket.on('playerMove', (data) => {
        // En el futuro, esta data actualizará el estado del jugador en el servidor
        // y el servidor la retransmitirá a los otros jugadores en la sala.
        // io.to(data.roomId).emit('playerState', { playerId: socket.id, pos: data.pos });
    });
});

// --- 5. Iniciar el Servidor ---

// Render o servicios similares usan la variable de entorno PORT
const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
  console.log(`🚀 Servidor Socket.IO escuchando en puerto ${PORT}`);
  console.log(`Acceso: http://localhost:${PORT}`);
});
