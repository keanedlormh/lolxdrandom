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
        // Inicializa un mapa vacío (todo abierto)
        const map = Array(this.gridSize).fill(0).map(() => Array(this.gridSize).fill(0));


        const center = Math.floor(this.gridSize / 2);
        const borderThickness = 1;

        // 1. Muros perimetrales
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < borderThickness; j++) {
                map[j][i] = 1; // Borde superior
                map[this.gridSize - 1 - j][i] = 1; // Borde inferior
                map[i][j] = 1; // Borde izquierdo
                map[i][this.gridSize - 1 - j] = 1; // Borde derecho
            }
        }


        // 2. Obstáculos centrales (Un laberinto simple)
        const wallStart = center - 5;
        const wallEnd = center + 5;
        
        // Muro horizontal en el centro
        for (let i = wallStart; i < wallEnd; i++) {
             map[center - 5][i] = 1;
             map[center + 5][i] = 1;
        }

        // Muro vertical en el centro (con un pasaje)
        for (let i = center - 5; i < center + 5; i++) {
             map[i][center - 5] = 1;
             map[i][center + 5] = 1;
        }

        // Crear una abertura
        map[center - 5][center] = 0;
        map[center + 5][center] = 0;
        map[center][center - 5] = 0;
        map[center][center + 5] = 0;
        

        return map;
    }


    /**
     * Obtiene la coordenada del mundo para el punto de spawn inicial.
     */
    getSpawnPoint() {
        // En este mapa, el centro está abierto, es un buen punto de spawn.
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
        // Solo spawneamos en el 80% interior del mapa para evitar spawns muy cercanos a los bordes
        const minCoord = Math.floor(this.gridSize * 0.1);
        const maxCoord = Math.floor(this.gridSize * 0.9);

        while (attempts < 100) {
            const x = minCoord + Math.floor(Math.random() * (maxCoord - minCoord));
            const y = minCoord + Math.floor(Math.random() * (maxCoord - minCoord));


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
}


module.exports = ServerMapGenerator;