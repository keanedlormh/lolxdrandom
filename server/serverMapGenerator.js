/**
 * server/serverMapGenerator.js
 * Genera el mapa 2D del mundo, gestiona el tamaño de celda
 * y proporciona puntos de spawn para jugadores y enemigos.
 */

class ServerMapGenerator {
    constructor(gridSize = 50, cellSize = 40) {
        this.gridSize = gridSize; // 50x50 celdas
        this.cellSize = cellSize; // 40 pixeles por celda
        this.map = this.generateMapArray();
        this.worldSize = this.gridSize * this.cellSize;
    }

    /**
     * Genera un array 2D simple para el mapa.
     * 0: Espacio Abierto, 1: Muro
     */
    generateMapArray() {
        // Algoritmo de generación de mapa simple (solo un borde y un centro libre)
        const map = Array(this.gridSize).fill(0).map(() => Array(this.gridSize).fill(0));
        
        const center = Math.floor(this.gridSize / 2);

        // 1. Muros perimetrales
        for (let i = 0; i < this.gridSize; i++) {
            map[0][i] = 1;
            map[this.gridSize - 1][i] = 1;
            map[i][0] = 1;
            map[i][this.gridSize - 1] = 1;
        }

        // 2. Creación de una "sala" central libre (5x5)
        this.createRoom(center - 2, center - 2, 5, 5, map);
        
        // 3. Añadir algunos obstáculos aleatorios (Stub)
        // Por ejemplo, una pared en el medio
        for (let i = center - 5; i < center + 5; i++) {
             map[center][i] = 1;
        }


        return map;
    }
    
    /**
     * Dibuja una región de espacio abierto (0) en el mapa.
     * @param {number} startX - Coordenada X de inicio de la celda.
     * @param {number} startY - Coordenada Y de inicio de la celda.
     * @param {number} width - Ancho de la sala en celdas.
     * @param {number} height - Alto de la sala en celdas.
     * @param {Array<Array<number>>} map - El array del mapa.
     */
    createRoom(startX, startY, width, height, map) {
        for (let y = startY; y < startY + height; y++) {
            for (let x = startX; x < startX + width; x++) {
                if (map[y] && map[y][x] !== undefined) {
                    map[y][x] = 0;
                }
            }
        }
    }

    /**
     * Obtiene la coordenada del mundo para el punto de spawn inicial.
     */
    getSpawnPoint() {
        const center = Math.floor(this.gridSize / 2);
        // Retorna el centro de la celda central
        return {
            x: center * this.cellSize + this.cellSize / 2,
            y: center * this.cellSize + this.cellSize / 2
        };
    }
    
    /**
     * Obtiene la coordenada del mundo de una celda abierta aleatoria (para spawns de enemigos).
     */
    getRandomOpenCellPosition() {
        let attempts = 0;
        while (attempts < 100) {
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
        return this.getSpawnPoint(); // Fallback al punto de spawn si no se encuentra nada
    }

    // Aquí irían otros métodos: getTileAt, checkCollision, etc.
}

module.exports = ServerMapGenerator;