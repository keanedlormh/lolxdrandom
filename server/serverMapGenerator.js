/**
 * server/serverMapGenerator.js - ACTUALIZADO
 * - Añadida una función helper 'isValid(x, y)' para que 
 * la lógica del juego (zombies) pueda comprobar
 * fácilmente si una celda de la cuadrícula es transitable.
 */


class ServerMapGenerator {
    constructor(config = {}) {
        this.gridSize = config.mapSize || 60;
        this.cellSize = config.cellSize || 40;
        this.numRooms = config.roomCount || 6;
        this.corridorWidth = config.corridorWidth || 3;
        
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
     * CORREGIDO: Ahora busca activamente la primera celda abierta
     * si la sala[0] por algún casual no existe.
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
                    return {
                        x: x * this.cellSize + this.cellSize / 2,
                        y: y * this.cellSize + this.cellSize / 2
                    };
                }
            }
        }

        // Si todo falla (mapa sólido?)
        const center = Math.floor(this.gridSize / 2);
        return {
            x: center * this.cellSize + this.cellSize / 2,
            y: center * this.cellSize + this.cellSize / 2
        };
    }


    /**
     * Obtiene una posición aleatoria en una celda abierta
     */
    getRandomOpenCellPosition() {
        // Intentar primero obtener una posición de una sala aleatoria
        if (this.rooms.length > 0 && Math.random() < 0.7) {
            const room = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            const x = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
            const y = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
            
            if (this.map[y][x] === 0) {
                return {
                    x: x * this.cellSize + this.cellSize / 2,
                    y: y * this.cellSize + this.cellSize / 2
                };
            }
        }
        
        // Si falla, buscar cualquier celda abierta
        let attempts = 0;
        const maxAttempts = 100;
        
        while (attempts < maxAttempts) {
            const x = Math.floor(Math.random() * this.gridSize);
            const y = Math.floor(Math.random() * this.gridSize);
            
            if (this.map[y][x] === 0) {
                return {
                    x: x * this.cellSize + this.cellSize / 2,
                    y: y * this.cellSize + this.cellSize / 2
                };
            }
            attempts++;
        }
        
        return this.getSpawnPoint(); // Fallback
    }


    /**
     * Genera un grid de navegación para pathfinding
     * Retorna una matriz donde 0 = transitable, 1 = muro
     */
    getNavigationGrid() {
        return this.map.map(row => [...row]);
    }

    /**
     * NUEVO: Comprueba si una celda de la cuadrícula es válida y transitable.
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