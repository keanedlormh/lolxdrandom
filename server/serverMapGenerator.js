/**
 * server/serverMapGenerator.js - ACTUALIZADO
 * - Añadido `MIN_SPAWN_DISTANCE_SQUARED` en el constructor.
 * - Añadida una función helper `isSafeSpawn` para comprobar la distancia.
 * - `getRandomOpenCellPosition` ahora acepta `playerPositions` y
 * usa el helper para encontrar una celda aleatoria segura.
 */


class ServerMapGenerator {
    constructor(config = {}) {
        this.gridSize = config.mapSize || 60;
        this.cellSize = config.cellSize || 40;
        this.numRooms = config.roomCount || 6;
        this.corridorWidth = config.corridorWidth || 3;


        // --- v1.2: NUEVA CONSTANTE ---
        // Distancia mínima (en unidades del mundo) al cuadrado.
        // 15 celdas * 40 unidades/celda = 600 unidades. 600*600 = 360000
        // Usamos el cuadrado para evitar cálculos de raíz cuadrada (más rápido).
        this.MIN_SPAWN_DISTANCE_SQUARED = (15 * this.cellSize) * (15 * this.cellSize);
        // --- FIN v1.2 ---


        this.map = this.generateMapArray();
        this.worldSize = this.gridSize * this.cellSize;
        this.rooms = []; // Almacena las salas generadas
    }


    /**
     * Genera un mapa con salas conectadas por pasillos
     */
    generateMapArray() {
        // 1. Inicializar mapa lleno de muros
        const map = Array(this.gridSize).fill(0).map(() => Array(this.gridSize).fill(1));


        this.rooms = [];


        // 2. Generar salas aleatorias
        const minRoomSize = 6;
        const maxRoomSize = Math.floor(this.gridSize / 5);


        let attempts = 0;
        const maxAttempts = 50;


        while (this.rooms.length < this.numRooms && attempts < maxAttempts) {
            const roomW = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize));
            const roomH = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize));


            const roomX = 2 + Math.floor(Math.random() * (this.gridSize - roomW - 4));
            const roomY = 2 + Math.floor(Math.random() * (this.gridSize - roomH - 4));


            const newRoom = { x: roomX, y: roomY, w: roomW, h: roomH };


            // Verificar que no se superponga con otras salas
            let overlaps = false;
            for (const room of this.rooms) {
                if (this.roomsOverlap(newRoom, room)) {
                    overlaps = true;
                    break;
                }
            }


            if (!overlaps) {
                this.rooms.push(newRoom);
                this.carveRoom(map, newRoom);
            }


            attempts++;
        }


        // 3. Conectar las salas con pasillos
        for (let i = 0; i < this.rooms.length - 1; i++) {
            const roomA = this.rooms[i];
            const roomB = this.rooms[i + 1];
            this.connectRooms(map, roomA, roomB);
        }


        // 4. Conectar la primera con la última para crear más caminos
        if (this.rooms.length > 2) {
            this.connectRooms(map, this.rooms[0], this.rooms[this.rooms.length - 1]);
        }


        // 5. Añadir conexiones adicionales aleatorias para más complejidad
        const extraConnections = Math.floor(this.rooms.length / 3);
        for (let i = 0; i < extraConnections; i++) {
            const roomA = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            const roomB = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            if (roomA !== roomB) {
                this.connectRooms(map, roomA, roomB);
            }
        }


        return map;
    }


    /**
     * Verifica si dos salas se superponen (con margen de seguridad)
     */
    roomsOverlap(roomA, roomB) {
        const margin = 3; // Margen entre salas
        return !(
            roomA.x + roomA.w + margin < roomB.x ||
            roomB.x + roomB.w + margin < roomA.x ||
            roomA.y + roomA.h + margin < roomB.y ||
            roomB.y + roomB.h + margin < roomA.y
        );
    }


    /**
     * Crea una sala (espacio abierto) en el mapa
     */
    carveRoom(map, room) {
        for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                if (y >= 0 && y < this.gridSize && x >= 0 && x < this.gridSize) {
                    map[y][x] = 0;
                }
            }
        }
    }


    /**
     * Conecta dos salas con un pasillo en forma de L
     */
    connectRooms(map, roomA, roomB) {
        // Centros de las salas
        const centerA = {
            x: Math.floor(roomA.x + roomA.w / 2),
            y: Math.floor(roomA.y + roomA.h / 2)
        };
        const centerB = {
            x: Math.floor(roomB.x + roomB.w / 2),
            y: Math.floor(roomB.y + roomB.h / 2)
        };


        // Decidir aleatoriamente si ir primero horizontal o vertical
        if (Math.random() < 0.5) {
            // Horizontal primero, luego vertical
            this.carveHorizontalCorridor(map, centerA.x, centerB.x, centerA.y);
            this.carveVerticalCorridor(map, centerA.y, centerB.y, centerB.x);
        } else {
            // Vertical primero, luego horizontal
            this.carveVerticalCorridor(map, centerA.y, centerB.y, centerA.x);
            this.carveHorizontalCorridor(map, centerA.x, centerB.x, centerB.y);
        }
    }


    /**
     * Crea un pasillo horizontal con el ancho configurado
     */
    carveHorizontalCorridor(map, x1, x2, y) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const offset = Math.floor(this.corridorWidth / 2);


        for (let x = minX; x <= maxX; x++) {
            for (let dy = -offset; dy <= offset; dy++) {
                const ny = y + dy;
                if (ny >= 0 && ny < this.gridSize && x >= 0 && x < this.gridSize) {
                    map[ny][x] = 0;
                }
            }
        }
    }


    /**
     * Crea un pasillo vertical con el ancho configurado
     */
    carveVerticalCorridor(map, y1, y2, x) {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const offset = Math.floor(this.corridorWidth / 2);


        for (let y = minY; y <= maxY; y++) {
            for (let dx = -offset; dx <= offset; dx++) {
                const nx = x + dx;
                if (y >= 0 && y < this.gridSize && nx >= 0 && nx < this.gridSize) {
                    map[y][nx] = 0;
                }
            }
        }
    }


    /**
     * Obtiene el punto de spawn (centro de la primera sala)
     */
    getSpawnPoint() {
        if (this.rooms.length > 0) {
            const room = this.rooms[0];
            return {
                x: (room.x + room.w / 2) * this.cellSize,
                y: (room.y + room.h / 2) * this.cellSize
            };
        }


        // Fallback: Buscar la PRIMERA celda abierta (0)
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.map[y][x] === 0) {
                    return this.gridToWorld(x, y);
                }
            }
        }


        // Si todo falla (mapa sólido?)
        const center = Math.floor(this.gridSize / 2);
        return this.gridToWorld(center, center);
    }


    // --- v1.2: NUEVA FUNCIÓN HELPER ---
    /**
     * Comprueba si una posición del mundo está lo suficientemente lejos de todos los jugadores.
     * @param {object} spawnPos - {x, y} en coordenadas del mundo
     * @param {Array} playerPositions - Array de {x, y} de los jugadores
     * @returns {boolean} - true si es un lugar seguro, false si está demasiado cerca
     */
    isSafeSpawn(spawnPos, playerPositions) {
        if (playerPositions.length === 0) {
            return true; // Seguro si no hay jugadores que comprobar
        }


        for (const playerPos of playerPositions) {
            const dx = spawnPos.x - playerPos.x;
            const dy = spawnPos.y - playerPos.y;
            const distSq = dx * dx + dy * dy;


            if (distSq < this.MIN_SPAWN_DISTANCE_SQUARED) {
                return false; // Demasiado cerca
            }
        }
        return true; // Está lo suficientemente lejos de todos los jugadores
    }
    // --- FIN v1.2 ---


    /**
     * Obtiene una posición aleatoria en una celda abierta
     * --- v1.2: MODIFICADO ---
     * Ahora acepta playerPositions y busca una celda aleatoria LEJOS de ellos.
     */
    getRandomOpenCellPosition(playerPositions = []) {
        let attempts = 0;
        const maxAttempts = 200; // Aumentamos intentos por si acaso


        while (attempts < maxAttempts) {
            attempts++;
            
            // 1. Elegir una celda aleatoria en todo el mapa
            const x = Math.floor(Math.random() * this.gridSize);
            const y = Math.floor(Math.random() * this.gridSize);


            // 2. Comprobar si es transitable (suelo)
            if (this.map[y][x] === 0) { 
                const worldPos = this.gridToWorld(x, y);


                // 3. Comprobar si está lejos de los jugadores
                if (this.isSafeSpawn(worldPos, playerPositions)) {
                    return worldPos; // ¡Éxito! Encontramos un lugar seguro.
                }
            }
            // Si la celda es un muro O está demasiado cerca, el bucle continúa...
        }


        // Fallback: Si no encontramos un lugar aleatorio seguro después de 200 intentos
        // (mapa pequeño o jugadores muy separados),
        // simplemente devolvemos el punto de spawn principal.
        console.warn(`[SPAWN] No se pudo encontrar un punto de spawn aleatorio seguro tras ${maxAttempts} intentos.`);
        
        // Comprobamos el punto de spawn principal como último recurso
        const spawnPoint = this.getSpawnPoint();
        if (this.isSafeSpawn(spawnPoint, playerPositions)) {
            return spawnPoint;
        }


        // Fallback definitivo: si incluso el spawn principal está demasiado cerca,
        // devolvemos una posición aleatoria en la primera sala (mejor que nada).
        if (this.rooms.length > 0) {
            const room = this.rooms[0];
            const x = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
            const y = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
            return this.gridToWorld(x, y);
        }


        return spawnPoint; // Fallback final
    }


    /**
     * Genera un grid de navegación para pathfinding
     * Retorna una matriz donde 0 = transitable, 1 = muro
     */
    getNavigationGrid() {
        return this.map.map(row => [...row]);
    }


    /**
     * Comprueba si una celda de la cuadrícula es válida y transitable.
     */
    isValid(x, y) {
        return x >= 0 && x < this.gridSize &&
               y >= 0 && y < this.gridSize &&
               this.map[y][x] === 0; // 0 = transitable
    }


    /**
     * Convierte coordenadas del mundo a coordenadas de grid
     */
    worldToGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.cellSize),
            y: Math.floor(worldY / this.cellSize)
        };
    }


    /**
     * Convierte coordenadas de grid a coordenadas del mundo (centro de la celda)
     */
    gridToWorld(gridX, gridY) {
        return {
            x: gridX * this.cellSize + this.cellSize / 2,
            y: gridY * this.cellSize + this.cellSize / 2
        };
    }
}


module.exports = ServerMapGenerator;