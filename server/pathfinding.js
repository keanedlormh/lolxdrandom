/**
 * server/pathfinding.js - ACTUALIZADO
 * - `generatePlayerCostMap` ahora acepta un array `playerGridPositions`
 * en lugar de un solo `playerGridPos`.
 * - El BFS (Búsqueda de Rango Amplio) se inicia desde TODAS las
 * posiciones de los jugadores a la vez, creando un "flow field"
 * que siempre apunta al jugador más cercano.
 */


class Pathfinder {
    constructor(navigationGrid, cellSize) {
        this.grid = navigationGrid; // Matriz de navegación (0 = libre, 1 = muro)
        this.cellSize = cellSize;
        this.rows = navigationGrid.length;
        this.cols = navigationGrid[0].length;


        // Direcciones (4-way) para BFS y movimiento
        this.directions = [
            { x: 0, y: -1 },  // Arriba
            { x: 1, y: 0 },   // Derecha
            { x: 0, y: 1 },   // Abajo
            { x: -1, y: 0 }   // Izquierda
        ];
    }


    /**
     * Comprueba si una celda de la cuadrícula es válida y transitable.
     */
    isValid(x, y) {
        return x >= 0 && x < this.cols &&
               y >= 0 && y < this.rows &&
               this.grid[y][x] === 0; // 0 = transitable
    }


    /**
     * --- v1.2: MODIFICADO PARA MULTIJUGADOR ---
     * Genera un mapa de costes (distancia) desde la posición de TODOS los jugadores.
     * @param {Array} playerGridPositions - Array de posiciones {x, y} de los jugadores.
     * @returns {Array} - Un mapa 2D (Array de Arrays) donde cada celda
     * contiene la distancia al jugador MÁS CERCANO.
     */
    generatePlayerCostMap(playerGridPositions) {
        // 1. Inicializar el mapa de costes con Infinito
        const costMap = Array(this.rows).fill(0).map(() => Array(this.cols).fill(Infinity));


        // 2. Inicializar la cola (queue) para el BFS
        const queue = [];


        // 3. Empezar el BFS desde la posición de TODOS los jugadores
        for (const playerPos of playerGridPositions) {
            if (this.isValid(playerPos.x, playerPos.y)) {
                // Comprobar si ya está en la cola (ej. dos jugadores en la misma celda)
                if (costMap[playerPos.y][playerPos.x] === Infinity) {
                    costMap[playerPos.y][playerPos.x] = 0;
                    queue.push(playerPos);
                }
            }
        }
        
        // Si no hay jugadores válidos (o están todos en muros), devolver mapa vacío
        if (queue.length === 0) {
            return costMap;
        }


        // 4. Procesar la cola (BFS)
        let head = 0;
        while (head < queue.length) {
            const current = queue[head++];
            const currentCost = costMap[current.y][current.x];


            // Explorar los 4 vecinos
            for (const dir of this.directions) {
                const newX = current.x + dir.x;
                const newY = current.y + dir.y;


                // Si el vecino es válido Y no ha sido visitado (coste es Infinity)
                if (this.isValid(newX, newY) && costMap[newY][newX] === Infinity) {
                    // Asignar el nuevo coste y añadirlo a la cola
                    costMap[newY][newX] = currentCost + 1;
                    queue.push({ x: newX, y: newY });
                }
            }
        }


        return costMap;
    }
}


module.exports = Pathfinder;