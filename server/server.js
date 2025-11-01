/**
 * server/server.js
 * Servidor principal de Node.js que gestiona las conexiones (Express),
 * la comunicación en tiempo real (Socket.IO) y el bucle de juego autoritativo.
 */


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');


// Importar la lógica de juego autoritativa
const { 
    ServerMapGenerator, 
    ServerPlayer, 
    ServerZombie, 
    ServerBullet 
} = require('./gameLogic.js');


// --- CONFIGURACIÓN DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);


// Configuración de Socket.IO
// IMPORTANTE: 'cors' es necesario para permitir conexiones desde un dominio diferente (ej. Render)
const io = new Server(server, {
    cors: {
        origin: "*", // Permite cualquier origen (para desarrollo/pruebas)
        methods: ["GET", "POST"]
    }
});


// Servir archivos estáticos del cliente
// Esto permite que los clientes accedan a 'index.html', 'js/game.js', etc.
app.use(express.static(path.join(__dirname, '../client')));


// --- ESTRUCTURA DE DATOS DEL JUEGO ---


// Almacena el estado de todos los lobbies activos
const games = {}; 
// { 
//   'ABC1': { 
//      id: 'ABC1', 
//      hostId: 'socketId1', 
//      players: [{ id: 'socketId1', name: 'HostName' }],
//      state: 'lobby' | 'playing', 
//      gameData: { map, players: [], zombies: [], bullets: [], score: 0, wave: 1 },
//      gameInterval: null 
//   } 
// }


// Almacena el último tiempo de input para el Rate Limiting
const inputLimiter = new Map();


// --- CONFIGURACIÓN DEL GAME LOOP AUTORITATIVO ---
const TICK_RATE = 30; // 30 actualizaciones por segundo
const TICK_TIME = 1000 / TICK_RATE;
const INPUT_RATE_LIMIT_MS = 16; // Limitar inputs a ~60/seg (1000ms / 60fps)
const MAP_SIZE = 50; // Configuración del mapa (Debería ser configurable)
let zombieCounter = 0; // Contador global para asignar IDs únicos a los zombies


// --- FUNCIONES AUXILIARES DE LOBBY ---


/**
 * Genera un ID de sala único de 4 caracteres.
 */
function generateRoomId() {
    let id;
    do {
        id = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (games[id]);
    return id;
}


/**
 * Encuentra el objeto de juego (lobby) al que pertenece un socket ID.
 */
function findGameBySocketId(socketId) {
    return Object.values(games).find(game => 
        game.players.some(p => p.id === socketId)
    );
}


/**
 * Elimina la partida por completo y notifica a los jugadores.
 */
function cleanUpGame(roomId) {
    const game = games[roomId];
    if (game) {
        if (game.gameInterval) {
            clearInterval(game.gameInterval);
        }


        // Notificar a los clientes antes de la eliminación (ej. 'gameEnded')
        io.to(roomId).emit('gameEnded', { reason: 'Host left' });


        // Desconectar a los jugadores de la sala de Socket.IO (opcional, ya salen con disconnect)
        // Pero eliminamos el objeto del estado global
        delete games[roomId];
        console.log(`[LOBBY] Partida ${roomId} eliminada.`);
    }
}


// ==========================================================
// LÓGICA DEL GAME LOOP DEL SERVIDOR
// ==========================================================


/**
 * El Game Loop autoritativo principal.
 * Se ejecuta 30 veces por segundo (TICK_RATE).
 */
function updateGame(roomId) {
    const game = games[roomId];
    if (!game || game.state !== 'playing') {
        if (game && game.gameInterval) clearInterval(game.gameInterval);
        return;
    }


    const { map, players, zombies, bullets, wave } = game.gameData;
    let scoreGained = 0;


    // --- 1. ACTUALIZAR ENTIDADES AUTORITATIVAS ---


    // Jugadores: Aplicar el último input recibido
    players.forEach(player => {
        player.update(map, bullets);
        // Colisiones de jugador a jugador o con zombies son manejadas en 2 y 3.
    });


    // Balas: Mover y detectar colisión con el mapa
    game.gameData.bullets = bullets.filter(bullet => {
        // Si update() devuelve true, colisionó o salió del mapa -> eliminar
        return !bullet.update(map); 
    });


    // Zombies: IA y Ataque a Jugadores
    zombies.forEach(zombie => {
        zombie.update(map, players);
    });


    // --- 2. GESTIÓN DE COLISIONES (Bala vs. Zombie) ---


    const bulletsToRemove = new Set();
    const zombiesToKill = new Set();


    bullets.forEach((bullet, bIndex) => {
        if (bulletsToRemove.has(bIndex)) return;


        zombies.forEach((zombie, zIndex) => {
            if (zombiesToKill.has(zIndex)) return;


            // Distancia cuadrada para optimización
            const distSq = (bullet.x - zombie.x)**2 + (bullet.y - zombie.y)**2;
            const hitRadiusSq = (bullet.radius + zombie.radius)**2;


            if (distSq <= hitRadiusSq) {
                // Hay colisión!
                bulletsToRemove.add(bIndex);


                const isDead = zombie.takeDamage(bullet.damage);
                if (isDead) {
                    zombiesToKill.add(zIndex);
                    scoreGained += 100; // Puntuación por matar


                    // Aumentar kills del jugador que disparó
                    const killer = players.find(p => p.id === bullet.ownerId);
                    if (killer) killer.kills++;
                }
            }
        });
    });


    // Aplicar eliminaciones
    game.gameData.bullets = bullets.filter((_, index) => !bulletsToRemove.has(index));
    game.gameData.zombies = zombies.filter((_, index) => !zombiesToKill.has(index));


    // Actualizar score
    game.gameData.score += scoreGained;


    // --- 3. GESTIÓN DE OLEADAS Y SPAWN DE ZOMBIES ---


    // Lógica simple de oleadas: Spawn constante si no hay suficientes
    const MAX_ZOMBIES_PER_WAVE = 10 + game.gameData.wave * 5;


    if (zombies.length < MAX_ZOMBIES_PER_WAVE / 2) {
        if (zombies.length < MAX_ZOMBIES_PER_WAVE) {
            const spawnPos = map.getRandomOpenSpot();
            const newZombie = new ServerZombie(
                `Z_${zombieCounter++}`, 
                spawnPos.x, 
                spawnPos.y
            );
            game.gameData.zombies.push(newZombie);
        }
    }


    // Si todos los jugadores mueren, el juego termina
    const activePlayers = players.filter(p => p.health > 0);
    if (activePlayers.length === 0) {
        console.log(`[GAME OVER] Partida ${roomId} finalizada.`);
        game.state = 'gameOver';
        io.to(roomId).emit('gameOver', { 
            finalScore: game.gameData.score,
            finalWave: game.gameData.wave
        });
        // Esperar un momento y luego limpiar
        setTimeout(() => cleanUpGame(roomId), 5000);
        return;
    }




    // --- 4. ENVIAR SNAPSHOT DEL ESTADO (Sincronización) ---


    const gameStateSnapshot = {
        players: players.map(p => ({ 
            id: p.id, 
            x: p.x, 
            y: p.y, 
            health: p.health, 
            isMe: p.id === p.id, // Esto es para el cliente, no necesario aquí
            kills: p.kills 
        })),
        zombies: zombies.map(z => ({ 
            id: z.id, 
            x: z.x, 
            y: z.y 
        })),
        bullets: bullets.map(b => ({ 
            id: b.id, 
            x: b.x, 
            y: b.y 
        })),
        score: game.gameData.score,
        wave: game.gameData.wave
    };


    // Broadcast al lobby completo
    io.to(roomId).emit('gameState', gameStateSnapshot);
}


// ==========================================================
// GESTIÓN DE CONEXIONES DE SOCKET.IO
// ==========================================================


io.on('connection', (socket) => {
    console.log(`[CONEXIÓN] Nuevo cliente conectado: ${socket.id}`);
    inputLimiter.set(socket.id, 0); // Inicializar el rate limiter para este socket


    // --- LÓGICA DE LOBBY ---


    /**
     * @event createGame
     * Un jugador quiere ser el host y crear una sala.
     */
    socket.on('createGame', (playerName) => {
        const roomId = generateRoomId();


        games[roomId] = {
            id: roomId,
            hostId: socket.id,
            players: [{ id: socket.id, name: playerName, isHost: true }],
            state: 'lobby',
            gameData: null, // Se inicializa al iniciar la partida
            gameInterval: null
        };


        socket.join(roomId);
        console.log(`[LOBBY] Partida creada: ${roomId} por ${playerName}`);
        socket.emit('gameCreated', games[roomId]);
        io.to(roomId).emit('lobbyUpdate', games[roomId]);
    });


    /**
     * @event joinGame
     * Un jugador intenta unirse a una sala.
     */
    socket.on('joinGame', (roomId, playerName) => {
        const game = games[roomId];


        if (!game) {
            return socket.emit('joinFailed', 'La sala no existe.');
        }
        if (game.state !== 'lobby') {
            return socket.emit('joinFailed', 'La partida ya ha comenzado.');
        }
        if (game.players.length >= 4) {
             return socket.emit('joinFailed', 'La sala está llena.');
        }


        socket.join(roomId);
        game.players.push({ id: socket.id, name: playerName, isHost: false });
        console.log(`[LOBBY] ${playerName} se unió a ${roomId}.`);


        socket.emit('joinSuccess', game);
        // Notificar a todos en el lobby sobre el nuevo jugador
        io.to(roomId).emit('lobbyUpdate', game); 
    });


    /**
     * @event getLobbies
     * Pide la lista de salas disponibles para unirse.
     */
    socket.on('getLobbies', () => {
        const availableLobbies = Object.values(games)
            .filter(g => g.state === 'lobby' && g.players.length < 4)
            .map(g => ({
                id: g.id,
                hostName: g.players.find(p => p.isHost)?.name || 'Host',
                playerCount: g.players.length
            }));
        socket.emit('lobbiesList', availableLobbies);
    });


    // --- LÓGICA DE INICIO DE JUEGO ---


    /**
     * @event startGame
     * El host presiona "Iniciar Partida".
     */
    socket.on('startGame', (roomId) => {
        const game = games[roomId];
        // Solo el host puede iniciar, y debe haber al menos 2 jugadores (o 1 para pruebas)
        // CAMBIO: Permitir 1 jugador (g.players.length >= 1) para facilitar pruebas.
        if (!game || game.hostId !== socket.id || game.players.length < 1 || game.state !== 'lobby') {
            return; 
        }


        console.log(`[PARTIDA INICIADA] ID: ${roomId}`);
        game.state = 'playing';


        // --- 1. Inicializar el Estado del Juego en el Servidor ---
        const map = new ServerMapGenerator(MAP_SIZE); 
        game.gameData = {
            map: map,
            players: [],
            zombies: [],
            bullets: [],
            wave: 1,
            score: 0
        };


        // Crear instancias de ServerPlayer para cada jugador
        game.players.forEach(p => {
            const spawnPoint = map.spawnPoint; 
            game.gameData.players.push(
                new ServerPlayer(p.id, spawnPoint.x, spawnPoint.y)
            );
        });


        // --- 2. Iniciar el Game Loop del Servidor ---
        game.gameInterval = setInterval(() => {
            updateGame(roomId);
        }, TICK_TIME);


        // Notificar a los clientes que el juego (real) ha comenzado
        io.to(roomId).emit('gameStarted', { 
            mapData: map.map, // Enviar el array del mapa para el dibujo en el cliente
            mapWorldSize: map.mapWorldSize 
        });
    });


    // --- LÓGICA DE JUEGO ACTIVO ---


    /**
     * @event playerInput
     * Recibe la entrada del joystick de un cliente.
     */
    socket.on('playerInput', (inputData) => {
        
        // --- 1. Rate Limiting ---
        const now = Date.now();
        const lastInputTime = inputLimiter.get(socket.id) || 0;
        if (now - lastInputTime < INPUT_RATE_LIMIT_MS) {
            // Demasiados inputs, ignorar.
            return;
        }
        inputLimiter.set(socket.id, now);


        // --- 2. Validación de Inputs ---
        if (!inputData || typeof inputData.moveX !== 'number' || typeof inputData.moveY !== 'number' ||
            typeof inputData.shootX !== 'number' || typeof inputData.shootY !== 'number') {
            console.warn(`[VALIDATION] Input inválido (tipo) de ${socket.id}`);
            return;
        }


        if (Math.abs(inputData.moveX) > 1 || Math.abs(inputData.moveY) > 1 ||
            Math.abs(inputData.shootX) > 1 || Math.abs(inputData.shootY) > 1) {
            // Los vectores del joystick no deben ser mayores a 1
            console.warn(`[VALIDATION] Input inválido (rango) de ${socket.id}`);
            return;
        }


        // --- 3. Procesar Input Válido ---
        const game = findGameBySocketId(socket.id); 
        if (!game || !game.gameData || game.state !== 'playing') return;


        const player = game.gameData.players.find(p => p.id === socket.id);
        if (player) {
            // Almacenar la última entrada conocida para ser usada en el próximo TICK
            player.input = inputData;
        }
    });


    // --- DESCONEXIÓN ---


    socket.on('disconnect', () => {
        console.log(`[DESCONEXIÓN] Cliente desconectado: ${socket.id}`);
        inputLimiter.delete(socket.id); // Limpiar el registro del rate limiter


        const game = findGameBySocketId(socket.id);
        if (game) {
            // 1. Quitar al jugador del lobby/juego
            game.players = game.players.filter(p => p.id !== socket.id);


            if (game.players.length === 0) {
                // Si la sala está vacía, la limpiamos
                cleanUpGame(game.id);
            } else {
                // Si el host se desconectó, asignamos un nuevo host
                if (game.hostId === socket.id) {
                    const newHost = game.players[0];
                    game.hostId = newHost.id;
                    newHost.isHost = true;
                    io.to(game.id).emit('hostChanged', newHost.id);
                }


                // Si el juego estaba en curso, actualizamos el estado
                if (game.state === 'playing' && game.gameData) {
                    // Remover la entidad del ServerPlayer del GameData
                    game.gameData.players = game.gameData.players.filter(p => p.id !== socket.id);
                }


                // Notificar a los restantes sobre el cambio
                io.to(game.id).emit('lobbyUpdate', game);
            }
        }
    });
});


// --- INICIAR EL SERVIDOR ---


server.listen(PORT, () => {
    console.log(`Servidor de juego iniciado en http://localhost:${PORT}`);
});
