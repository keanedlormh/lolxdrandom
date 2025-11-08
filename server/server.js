/**
 * server/server.js (v1.7 - Refactorizado)
 * - Punto de entrada principal del servidor.
 * - Configura Express y Socket.io.
 * - Delega toda la lógica de salas y sockets al lobbyManager.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Importar el nuevo gestor de lobby
const { initLobbyManager } = require('./lobbyManager.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir los archivos estáticos del cliente
app.use(express.static(path.join(__dirname, '../client')));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client', 'index.html')); 
});

// Iniciar el gestor de lobby y pasarle la instancia de io
initLobbyManager(io);

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`[SERVER v1.7] Servidor ejecutándose en el puerto ${PORT}`);
});