/**
 * server/gameLogic.js
 * Contiene la lógica central del juego: física, colisiones, IA, puntuación,
 * y la gestión de entidades. Se ejecuta en cada "tick" del servidor.
 */

// Importar el generador de mapas del lado del servidor
const ServerMapGenerator = require('./serverMapGenerator'); 

// --- ENTIDADES DE SERVIDOR (ServerPlayer, ServerZombie, etc.) ---

// Entidad base para la lógica de servidor (solo posición y radio)
class ServerEntity {
    constructor(id, x, y, radius, speed) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
    }

    // Aquí iría la lógica de movimiento, si no fuera manejada por la física
    // move(dt) {} 
}

// Clase de Jugador del lado del servidor
class ServerPlayer extends ServerEntity {
    constructor(id, x, y) {
        super(id, x, y, 15, 5); // Radio 15, Velocidad 5
        this.health = 100;
        this.kills = 0;
        this.input = { moveX: 0, moveY: 0, shootX: 0, shootY: 0 };
    }

    // Actualiza la posición basándose en el input del cliente
    updatePosition() {
        // Lógica de movimiento: dt asumido como 1 para simplificar, ya que la velocidad es por tick
        this.x += this.input.moveX * this.speed;
        this.y += this.input.moveY * this.speed;

        // Aquí se aplicaría la lógica de colisión con muros
    }
}

// Clase de Zombie del lado del servidor (Stub)
class ServerZombie extends ServerEntity {
    constructor(id, x, y) {
        super(id, x, y, 14, 3); // Radio 14, Velocidad 3
    }

    // Aquí iría la lógica de IA (pathfinding hacia el jugador más cercano)
    updateAI() {
        // Por ahora, no hace nada
    }
}


// --- CLASE PRINCIPAL: GAMELOGIC ---

class GameLogic {
    constructor(playerIds) {
        this.map = new ServerMapGenerator(); 
        this.entities = {
            players: new Map(), // { id: ServerPlayer instance }
            zombies: new Map(), // { id: ServerZombie instance }
            bullets: new Map()
        };
        this.score = 0;
        this.wave = 1;
        this.running = true;

        // 1. Inicializar jugadores
        const spawn = this.map.getSpawnPoint();
        playerIds.forEach(id => {
            // Crea una instancia de jugador en el punto de spawn
            this.entities.players.set(id, new ServerPlayer(id, spawn.x, spawn.y));
        });

        // 2. Inicializar enemigos (Stub)
        this.spawnZombies(5);
    }

    /**
     * Genera un número de zombies en puntos aleatorios.
     * @param {number} count 
     */
    spawnZombies(count) {
        for (let i = 0; i < count; i++) {
            // Generar un ID único para el zombie
            const zombieId = `zombie_${Date.now()}_${i}`; 
            
            // Usar un punto aleatorio en el mapa (temporalmente)
            const randomSpawn = this.map.getRandomOpenCellPosition();
            if (randomSpawn) {
                this.entities.zombies.set(zombieId, new ServerZombie(zombieId, randomSpawn.x, randomSpawn.y));
            }
        }
    }

    /**
     * Se llama en cada tick del servidor (30 veces por segundo).
     */
    update() {
        // 1. Actualizar Posición del Jugador
        this.entities.players.forEach(player => {
            player.updatePosition();
            // Lógica de colisión con muros iría aquí
        });

        // 2. Actualizar Zombis
        this.entities.zombies.forEach(zombie => {
            zombie.updateAI();
            // Lógica de movimiento y colisión
        });

        // 3. Actualizar Balas
        this.entities.bullets.forEach(bullet => {
            // Lógica de movimiento, colisión con muros y entidades
        });
        
        // 4. Lógica de Oleadas y Spawning (Por ahora solo para debug)
        if (this.entities.zombies.size < 2 && this.wave < 5) {
            this.wave++;
            this.spawnZombies(this.wave * 2 + 3);
            console.log(`[SERVER] Iniciando oleada ${this.wave}`);
        }

        // 5. Check de Game Over (Si todos los jugadores mueren)
        // ...
    }

    /**
     * Guarda el input del cliente para ser usado en el próximo tick de actualización.
     */
    handlePlayerInput(id, input) {
        const player = this.entities.players.get(id);
        if (player) {
            player.input = input;
        }
    }

    /**
     * Genera un objeto simple para enviar a los clientes (Snapshot).
     */
    getGameStateSnapshot() {
        // Mapear instancias de jugador a objetos JSON simples
        const players = Array.from(this.entities.players.values()).map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            health: p.health,
            kills: p.kills,
            radius: p.radius
        }));

        // Mapear instancias de zombi a objetos JSON simples
        const zombies = Array.from(this.entities.zombies.values()).map(z => ({
            id: z.id,
            x: z.x,
            y: z.y,
            radius: z.radius
        }));

        // Mapear instancias de bala (Stub)
        const bullets = Array.from(this.entities.bullets.values()).map(b => ({
            id: b.id,
            x: b.x,
            y: b.y,
            radius: b.radius
        }));

        return {
            players: players,
            zombies: zombies,
            bullets: bullets,
            score: this.score,
            wave: this.wave
        };
    }

    // Métodos para Game Over
    isGameOver() {
        // Lógica: true si todos los jugadores tienen salud <= 0
        return false;
    }

    getFinalScore() {
        return { finalScore: this.score, finalWave: this.wave };
    }
}

module.exports = GameLogic;