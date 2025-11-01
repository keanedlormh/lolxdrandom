/**
 * server/gameLogic.js
 * Contiene todas las clases y la lógica de simulación que corre en el servidor.
 * El servidor es la única "fuente de la verdad" para la física del juego.
 *
 * NOTA: Usa 'module.exports' para Node.js en lugar de 'export default/const'.
 */


// --- UTILITIES: CLASES BÁSICAS ---


/**
 * Clase Node para el algoritmo de Pathfinding A*.
 * No requiere Canvas ni dependencias del cliente.
 */
class Node {
    constructor(x, y, g = 0, h = 0, parent = null) {
        this.x = x; // Coordenada X (cuadrícula)
        this.y = y; // Coordenada Y (cuadrícula)
        this.g = g; // Costo desde el inicio
        this.h = h; // Heurística hasta el objetivo
        this.f = g + h; // Costo total (f = g + h)
        this.parent = parent; // Nodo padre
    }
}


// --- MAPA ---


/**
 * MapGenerator del Servidor.
 * Solo contiene la lógica de generación del laberinto y el Pathfinding.
 * Se eliminan todos los métodos de 'draw' (dibujo).
 */
class ServerMapGenerator {
    constructor(size) {
        this.size = size;
        this.cellSize = 40;
        this.map = [];
        this.rooms = [];
        this.generate();


        // Simulación de los límites del mapa para colisiones
        this.mapWorldSize = size * this.cellSize;
    }


    generate() {
        // Lógica de generación del laberinto (misma que en el cliente)
        for (let y = 0; y < this.size; y++) {
            this.map[y] = [];
            for (let x = 0; x < this.size; x++) {
                this.map[y][x] = 1; 
            }
        }


        const numRooms = Math.floor(this.size / 5);
        for (let i = 0; i < numRooms; i++) {
            const w = 4 + Math.floor(Math.random() * 6);
            const h = 4 + Math.floor(Math.random() * 6);
            const x = 2 + Math.floor(Math.random() * (this.size - w - 4));
            const y = 2 + Math.floor(Math.random() * (this.size - h - 4));
            this.createRoom(x, y, w, h);
            this.rooms.push({x, y, w, h, cx: x + Math.floor(w/2), cy: y + Math.floor(h/2)});
        }


        for (let i = 0; i < this.rooms.length - 1; i++) {
            this.createCorridor(this.rooms[i].cx, this.rooms[i].cy, this.rooms[i + 1].cx, this.rooms[i + 1].cy);
        }


        const center = Math.floor(this.size / 2);
        this.createRoom(center - 3, center - 3, 7, 7);
        // Punto de spawn inicial para los jugadores
        this.spawnPoint = {x: center * this.cellSize + this.cellSize/2, y: center * this.cellSize + this.cellSize/2};
    }


    createRoom(x, y, w, h) {
        for (let j = y; j < y + h && j < this.size; j++) {
            for (let i = x; i < x + w && i < this.size; i++) {
                this.map[j][i] = 0;
            }
        }
    }


    createCorridor(x1, y1, x2, y2) {
        let x = x1, y = y1;
        while (x !== x2) {
            this.map[y][x] = 0;
            x += x < x2 ? 1 : -1;
        }
        while (y !== y2) {
            this.map[y][x] = 0;
            y += y < y2 ? 1 : -1;
        }
    }


    /**
     * Comprueba si una posición (coordenadas del mundo) está dentro de un muro.
     */
    isWall(x, y) {
        // Comprobar límites del mapa
        if (x < 0 || x > this.mapWorldSize || y < 0 || y > this.mapWorldSize) return true;


        const gx = Math.floor(x / this.cellSize);
        const gy = Math.floor(y / this.cellSize);


        // Evitar acceso a índices fuera del array (aunque ya comprobamos límites)
        if (gx < 0 || gx >= this.size || gy < 0 || gy >= this.size) return true;


        return this.map[gy][gx] === 1; // 1 = Muro
    }


    getRandomOpenSpot() {
        let x, y, gx, gy;
        do {
            gx = Math.floor(Math.random() * this.size);
            gy = Math.floor(Math.random() * this.size);
        } while (this.map[gy][gx] === 1);


        x = gx * this.cellSize + this.cellSize / 2;
        y = gy * this.cellSize + this.cellSize / 2;
        return {x, y};
    }


    // --- Lógica de Pathfinding A* (Necesaria para la IA del zombie) ---


    // Heurística de Manhattan (para movimiento sin diagonales, o con costo de diagonal 1)
    heuristic(node, targetGridX, targetGridY) {
        // La distancia es en coordenadas de cuadrícula (grid)
        return Math.abs(node.x - targetGridX) + Math.abs(node.y - targetGridY);
    }


    /**
     * Devuelve los vecinos de una celda de cuadrícula.
     * Se permite movimiento diagonal con un costo ligeramente mayor (1.414).
     */
    getNeighbors(node) {
        const neighbors = [];
        const x = node.x;
        const y = node.y;
        
        // Movimientos (dx, dy, cost)
        const moves = [
            // Cardinales (costo 1)
            [0, 1, 1], [0, -1, 1], [1, 0, 1], [-1, 0, 1],
            // Diagonales (costo raíz de 2 ≈ 1.414)
            [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
        ];


        for (const [dx, dy, cost] of moves) {
            const nx = x + dx;
            const ny = y + dy;


            // Comprobar límites y si es un muro
            if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && this.map[ny][nx] === 0) {
                neighbors.push({ x: nx, y: ny, cost: cost });
            }
        }
        return neighbors;
    }


    /**
     * Implementación del algoritmo A* para encontrar la ruta más corta.
     * Devuelve un array de objetos {x: mundo, y: mundo} a seguir.
     */
    findPathAStar(targetWorldX, targetWorldY, startWorldX, startWorldY) {
        // Convertir coordenadas del mundo a coordenadas de cuadrícula (grid)
        const startX = Math.floor(startWorldX / this.cellSize);
        const startY = Math.floor(startWorldY / this.cellSize);
        const targetX = Math.floor(targetWorldX / this.cellSize);
        const targetY = Math.floor(targetWorldY / this.cellSize);


        // Comprobar si los puntos de inicio/fin son válidos (no están en muros)
        if (this.isWall(startWorldX, startWorldY) || this.isWall(targetWorldX, targetWorldY)) {
             return []; 
        }
        
        // Evitar pathfinding si el inicio y el fin son la misma celda
        if (startX === targetX && startY === targetY) {
            return [];
        }


        const startNode = new Node(startX, startY);
        const openList = [startNode];
        const closedList = new Set();
        // Usar un mapa para almacenar el mejor camino a cada nodo
        const allNodes = new Map();
        allNodes.set(`${startX},${startY}`, startNode);


        let path = [];


        while (openList.length > 0) {
            // Encontrar el nodo con la F más baja
            openList.sort((a, b) => a.f - b.f);
            let currentNode = openList.shift();


            if (currentNode.x === targetX && currentNode.y === targetY) {
                // Ruta encontrada, reconstruir el camino
                let temp = currentNode;
                while (temp) {
                    // Convertir de coordenadas de cuadrícula a coordenadas del mundo (centro de la celda)
                    path.unshift({ 
                        x: temp.x * this.cellSize + this.cellSize / 2, 
                        y: temp.y * this.cellSize + this.cellSize / 2 
                    });
                    temp = temp.parent;
                }
                // El primer elemento es el punto de partida, lo omitimos para que el zombi
                // solo se mueva hacia el siguiente paso.
                path.shift(); 
                return path;
            }


            closedList.add(`${currentNode.x},${currentNode.y}`);


            for (const neighbor of this.getNeighbors(currentNode)) {
                const nKey = `${neighbor.x},${neighbor.y}`;
                if (closedList.has(nKey)) continue;


                const gScore = currentNode.g + neighbor.cost;


                let neighborNode = allNodes.get(nKey);


                if (!neighborNode) {
                    neighborNode = new Node(neighbor.x, neighbor.y);
                    allNodes.set(nKey, neighborNode);
                } else if (gScore >= neighborNode.g) {
                    continue; // No es un mejor camino
                }


                // Este es el mejor camino hasta ahora
                neighborNode.parent = currentNode;
                neighborNode.g = gScore;
                neighborNode.h = this.heuristic(neighborNode, targetX, targetY);
                neighborNode.f = neighborNode.g + neighborNode.h;


                if (!openList.includes(neighborNode)) {
                    openList.push(neighborNode);
                }
            }
        }


        return []; // No se encontró camino
    }
}


// --- ENTIDADES ---


/**
 * Clase Player del Servidor.
 * Gestiona el estado, movimiento, y disparo basándose en la entrada del cliente.
 */
class ServerPlayer {
    constructor(id, x, y, speed = 3) {
        this.id = id; // Socket ID del jugador
        this.x = x; this.y = y;
        this.radius = 15;
        this.speed = speed;
        this.health = 100;
        this.maxHealth = 100;
        this.kills = 0;
        this.lastShot = Date.now();
        this.fireRate = 200; // Milisegundos entre disparos (5 disparos/seg)


        // Almacena la última entrada recibida del cliente
        this.input = { moveX: 0, moveY: 0, shootX: 0, shootY: 0 }; 
    }


    /**
     * Actualiza el estado del jugador (movimiento y disparo)
     * @param {ServerMapGenerator} map
     * @param {Array<ServerBullet>} bulletsArray - Array mutable para añadir balas
     */
    update(map, bulletsArray) {
        // --- 1. MOVIMIENTO ---
        const dx = this.input.moveX;
        const dy = this.input.moveY;
        const length = Math.sqrt(dx * dx + dy * dy);


        if (length > 0) {
            const normalizedX = dx / length;
            const normalizedY = dy / length;


            const newX = this.x + normalizedX * this.speed;
            const newY = this.y + normalizedY * this.speed;


            // Colisión con Paredes (Comprobación simple)
            // Se mueve solo en las coordenadas que no tienen colisión.
            if (!map.isWall(newX, this.y)) {
                this.x = newX;
            }
            if (!map.isWall(this.x, newY)) {
                this.y = newY;
            }
        }


        // --- 2. DISPARO ---
        if (this.input.shootX !== 0 || this.input.shootY !== 0) {
            const now = Date.now();
            if (now - this.lastShot >= this.fireRate) {
                // Calcular ángulo/dirección del disparo
                const sx = this.input.shootX;
                const sy = this.input.shootY;
                const slength = Math.sqrt(sx * sx + sy * sy);


                if (slength > 0) {
                    const dirX = sx / slength;
                    const dirY = sy / slength;


                    // Crear la bala y añadirla al array global de balas
                    const bullet = new ServerBullet(
                        this.x + dirX * this.radius, // Spawn ligeramente delante
                        this.y + dirY * this.radius,
                        dirX, dirY,
                        this.id // ID del jugador que disparó
                    );
                    bulletsArray.push(bullet);
                    this.lastShot = now;
                }
            }
        }
    }


    takeDamage(damage) {
        this.health -= damage;
        if (this.health < 0) this.health = 0;
        return this.health === 0; // Devuelve true si el jugador ha muerto
    }
}


/**
 * Clase Zombie del Servidor.
 * Gestiona el movimiento (IA) y la lógica de ataque.
 */
class ServerZombie {
    constructor(id, x, y, speed = 1.5) {
        this.id = id; // ID único del zombie (UUID)
        this.x = x; this.y = y;
        this.radius = 14;
        this.speed = speed;
        this.health = 50;
        this.damage = 5; // Daño por ataque
        this.lastAttack = 0;
        this.attackRate = 1000; // 1 ataque por segundo
        this.targetId = null; // El ID del jugador objetivo
        this.path = []; // Ruta calculada por A*
        this.repathTimer = 0; // Temporizador para recalcular la ruta
        this.REPATH_INTERVAL = 30; // Recalcular ruta cada 30 ticks (1 segundo a 30 FPS)
        this.PATH_REACH_DIST_SQ = 5 * 5; // Distancia cuadrada para considerar alcanzado un punto de la ruta (5px)
    }


    /**
     * Actualiza el estado del zombie (IA, movimiento, ataque)
     * @param {ServerMapGenerator} map
     * @param {Array<ServerPlayer>} players - Array de jugadores para buscar objetivos
     */
    update(map, players) {
        // --- 1. SELECCIÓN DE OBJETIVO (IA) ---
        // En multijugador, el zombie persigue al jugador más cercano.
        let closestPlayer = null;
        let minDistSq = Infinity;


        players.forEach(p => {
            const distSq = (this.x - p.x)**2 + (this.y - p.y)**2;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestPlayer = p;
            }
        });


        if (!closestPlayer) return; // No hay jugadores activos
        this.targetId = closestPlayer.id;


        const targetX = closestPlayer.x;
        const targetY = closestPlayer.y;
        
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);


        // --- 2. MOVER HACIA EL OBJETIVO (A*) ---


        // Recalcular el pathfinding periódicamente o si el camino actual se agotó
        this.repathTimer++;
        if (this.repathTimer >= this.REPATH_INTERVAL || this.path.length === 0) {
            this.path = map.findPathAStar(targetX, targetY, this.x, this.y);
            this.repathTimer = 0;
        }


        let nextWaypoint = null;
        if (this.path.length > 0) {
            nextWaypoint = this.path[0];
        }


        if (distance > this.radius + closestPlayer.radius) {
            let moveTargetX, moveTargetY;


            if (nextWaypoint) {
                 // Moverse hacia el siguiente waypoint
                moveTargetX = nextWaypoint.x;
                moveTargetY = nextWaypoint.y;


                const distToWaypointSq = (moveTargetX - this.x)**2 + (moveTargetY - this.y)**2;
                
                // Si el waypoint está cerca, lo removemos de la ruta y apuntamos al siguiente
                if (distToWaypointSq < this.PATH_REACH_DIST_SQ) {
                    this.path.shift();
                    if (this.path.length > 0) {
                         nextWaypoint = this.path[0];
                         moveTargetX = nextWaypoint.x;
                         moveTargetY = nextWaypoint.y;
                    } else {
                        // Si ya está en el último waypoint, el objetivo es el jugador
                        moveTargetX = targetX;
                        moveTargetY = targetY;
                    }
                }


            } else {
                // Si no hay ruta A* (probablemente cerca del jugador o sin camino), ir directo
                moveTargetX = targetX;
                moveTargetY = targetY;
            }


            // Calcular el movimiento hacia el punto objetivo (waypoint o jugador)
            dx = moveTargetX - this.x;
            dy = moveTargetY - this.y;
            const moveDistance = Math.sqrt(dx * dx + dy * dy);


            if (moveDistance > 0) {
                const normalizedX = dx / moveDistance;
                const normalizedY = dy / moveDistance;


                const newX = this.x + normalizedX * this.speed;
                const newY = this.y + normalizedY * this.speed;


                // Colisión con Paredes (Comprobación simple)
                // Se mueve solo en las coordenadas que no tienen colisión.
                if (!map.isWall(newX, this.y)) {
                    this.x = newX;
                }
                if (!map.isWall(this.x, newY)) {
                    this.y = newY;
                }
            }
        }


        // --- 3. ATAQUE ---
        if (distance <= this.radius + closestPlayer.radius + 5) { // Pequeño margen para el ataque
            const now = Date.now();
            if (now - this.lastAttack >= this.attackRate) {
                closestPlayer.takeDamage(this.damage);
                this.lastAttack = now;
            }
        }
    }


    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0; // Devuelve true si el zombie ha muerto
    }
}




/**
 * Clase Bullet del Servidor.
 * Gestiona el movimiento y la lógica de colisión (solo con paredes).
 */
class ServerBullet {
    constructor(x, y, dirX, dirY, ownerId, speed = 8, damage = 10) {
        this.id = Date.now() + Math.random(); // ID simple
        this.x = x; this.y = y;
        this.dirX = dirX; this.dirY = dirY;
        this.speed = speed;
        this.damage = damage;
        this.radius = 4;
        this.ownerId = ownerId;
    }


    /**
     * Actualiza el estado de la bala (movimiento)
     * @param {ServerMapGenerator} map
     * @returns {boolean} True si la bala ha colisionado o salido del mapa.
     */
    update(map) {
        this.x += this.dirX * this.speed;
        this.y += this.dirY * this.speed;


        // Colisión con Paredes y Límites del Mapa
        if (map.isWall(this.x, this.y)) {
            return true; // Indica que debe ser eliminada
        }


        return false; // Continúa viva
    }
}




// Exportar las clases que el servidor principal necesita
module.exports = { 
    ServerMapGenerator, 
    ServerPlayer, 
    ServerZombie, 
    ServerBullet,
    Node // Exportar Node es necesario ya que se usa en ServerMapGenerator
};
