/**
 * server/pathfinding.js - REDISEÑADO DESDE CERO
 *
 * Esta clase ya no usa A* (A-Star).
 * Ahora genera un "Campo de Flujo" (Flow Field) usando un algoritmo BFS (Breadth-First Search).
 *
 * ¿Cómo funciona?
 * 1. Se le da la cuadrícula del mapa (muros/suelo).
 * 2. Se le da la posición del jugador (el "objetivo").
 * 3. Genera un nuevo mapa donde cada celda tiene un número:
 * - Celda del jugador = 0
 * - Celdas adyacentes = 1 (o 1.41 si es diagonal)
 * - Celdas siguientes = 2... y así sucesivamente.
 * - Muros = Infinito (99999)
 *
 * Los zombies simplemente "caerán" por esta cuadrícula, moviéndose
 * siempre al número más bajo cercano.
 */

class FlowField {
    constructor(grid) {
        this.grid = grid; // El mapa de colisión (0=suelo, 1=muro)
        this.rows = grid.length;
        this.cols = grid[0].length;
    }

    /**
     * Comprueba si una celda es válida (dentro del mapa y no es un muro)
     */
    isValid(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows && this.grid[y][x] === 0;
    }

    /**
     * Genera el campo de flujo desde un punto objetivo (el jugador)
     * @param {object} goal - Posición del objetivo en la cuadrícula {x, y}
     * @returns {Array<Array<number>>} - Un mapa 2D con los costes (distancias)
     */
    generateField(goal) {
        // 1. Crear el mapa de flujo, todo a Infinito (99999)
        const field = Array(this.rows).fill(null).map(() => Array(this.cols).fill(99999));

        // 2. Validar el punto de inicio (objetivo del jugador)
        if (!this.isValid(goal.x, goal.y)) {
            console.warn(`[FlowField] Objetivo en ${goal.x},${goal.y} está en un muro.`);
            
            // Buscar una celda válida cercana si el jugador está en un muro (poco probable)
            let validGoal = this.findValidNeighbor(goal);
            if (!validGoal) {
                console.error("[FlowField] No se pudo encontrar un punto de inicio válido.");
                return field; // Devuelve un campo vacío
            }
            goal = validGoal;
        }

        // 3. Configurar la cola para el algoritmo BFS
        const queue = [];
        
        // 4. Iniciar: El objetivo tiene coste 0
        field[goal.y][goal.x] = 0;
        queue.push(goal);

        // 5. Definir las 8 direcciones (incluyendo diagonales)
        const directions = [
            { x: 0, y: -1, cost: 1 },   // Arriba
            { x: 1, y: 0, cost: 1 },    // Derecha
            { x: 0, y: 1, cost: 1 },    // Abajo
            { x: -1, y: 0, cost: 1 },   // Izquierda
            { x: 1, y: -1, cost: 1.41 },  // Arriba-Derecha
            { x: 1, y: 1, cost: 1.41 },   // Abajo-Derecha
            { x: -1, y: 1, cost: 1.41 },  // Abajo-Izquierda
            { x: -1, y: -1, cost: 1.41 }  // Arriba-Izquierda
        ];

        // 6. Procesar la cola (algoritmo BFS)
        let head = 0;
        while (head < queue.length) {
            const current = queue[head++];

            // Ver los 8 vecinos
            for (const dir of directions) {
                const newX = current.x + dir.x;
                const newY = current.y + dir.y;

                // Si el vecino es una celda válida
                if (this.isValid(newX, newY)) {
                    // Calcular el nuevo coste
                    const newCost = field[current.y][current.x] + dir.cost;
                    
                    // Si hemos encontrado un camino más corto a esta celda
                    if (newCost < field[newY][newX]) {
                        // Impedir cortes de esquina (si es diagonal, los lados deben estar libres)
                        if (dir.cost > 1) { // Es diagonal
                            const sideA = this.isValid(current.x + dir.x, current.y);
                            const sideB = this.isValid(current.x, current.y + dir.y);
                            if (!sideA || !sideB) {
                                continue; // No se puede cortar esta esquina
                            }
                        }

                        field[newY][newX] = newCost;
                        queue.push({ x: newX, y: newY });
                    }
                }
            }
        }

        return field;
    }

    /**
     * Función de ayuda para encontrar una celda válida si el objetivo está en un muro
     */
    findValidNeighbor(goal) {
        const directions = [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
        ];
        for (let i = 1; i < 5; i++) {
            for (const dir of directions) {
                const newX = goal.x + dir.x * i;
                const newY = goal.y + dir.y * i;
                if (this.isValid(newX, newY)) {
                    return { x: newX, y: newY };
                }
            }
        }
        return null; // No se encontró nada
    }
}

module.exports = FlowField;