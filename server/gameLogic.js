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
        this.x = x; this.y = y; this.g = g; this.h = h;
        this.f = g + h; this.parent = parent;
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
    heuristic(node, target) {
        return Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
    }
    
    // NOTA: Los métodos 'getNeighbors' y 'findPathAStar' se copian del cliente
    // asegurando que solo usen 'Node' y 'this.map'.
    // ... (Se asume que el código completo de A* va aquí) ...
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

        // --- 2. MOVER HACIA EL OBJETIVO (A*) ---
        
        // Simplemente mover hacia el objetivo para esta versión inicial.
        // Implementar Pathfinding (A*) aquí es crucial para evitar que los zombies
        // atraviesen paredes en el servidor. 
        
        const targetX = closestPlayer.x;
        const targetY = closestPlayer.y;
        
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > this.radius) { // Moverse si no está lo suficientemente cerca para atacar
            const normalizedX = dx / distance;
            const normalizedY = dy / distance;
            
            this.x += normalizedX * this.speed;
            this.y += normalizedY * this.speed;
            
            // NOTA: Se necesita implementar la colisión con paredes aquí
        }

        // --- 3. ATAQUE ---
        if (distance <= this.radius + closestPlayer.radius) {
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
    Node // Aunque solo se usa internamente, es útil para el A*
};
