/**
 * server/gameLogic.js
 * Contiene la lógica central del juego: física, colisiones, IA, puntuación,
 * y la gestión de entidades. Se ejecuta en cada "tick" del servidor.
 */


const ServerMapGenerator = require('./serverMapGenerator'); 


// --- CONSTANTES ---
const ZOMBIE_MAX_HEALTH = 30;
const ZOMBIE_ATTACK_DAMAGE = 10;
const ZOMBIE_ATTACK_COOLDOWN = 1000; // 1 segundo
const PLAYER_MAX_HEALTH = 100;
const BULLET_DAMAGE = 10;
const PLAYER_SHOOT_COOLDOWN = 150; // 150ms


// --- ENTIDADES DE SERVIDOR ---


// Entidad base para la lógica de servidor (solo posición y radio)
class ServerEntity {
    constructor(id, x, y, radius, speed) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
    }
}


// Clase de Bala del lado del servidor
class ServerBullet extends ServerEntity {
    constructor(id, x, y, dx, dy, speed = 25) { // Velocidad más rápida
        super(id, x, y, 4, speed); // Radio 4, Velocidad 25
        this.dx = dx; // Dirección X (normalizada)
        this.dy = dy; // Dirección Y (normalizada)
        this.ownerId = id.split('_')[1]; // El ID del jugador que disparó
    }


    updatePosition() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;
    }
}


// Clase de Jugador del lado del servidor
class ServerPlayer extends ServerEntity {
    constructor(id, x, y, name) {
        super(id, x, y, 15, 6); // Radio 15, Velocidad 6
        this.name = name;
        this.health = PLAYER_MAX_HEALTH;
        this.kills = 0;
        this.input = { moveX: 0, moveY: 0, shootX: 1, shootY: 0, isShooting: false }; // Por defecto apuntando a la derecha
        this.lastShotTime = 0; // Para el cooldown de disparo
        this.isDead = false;
    }


    // El movimiento es manejado en GameLogic.update con la detección de colisiones.
}


// Clase de Zombie del lado del servidor
class ServerZombie extends ServerEntity {
    constructor(id, x, y) {
        super(id, x, y, 14, 3); // Radio 14, Velocidad 3
        this.maxHealth = ZOMBIE_MAX_HEALTH;
        this.health = ZOMBIE_MAX_HEALTH;
        this.lastAttackTime = 0; // Para el cooldown de ataque
    }


    /**
     * Lógica de IA: Persigue al jugador más cercano.
     * @param {Map<string, ServerPlayer>} players - Mapa de jugadores.
     */
    updateAI(players) {
        if (players.size === 0) return;
        
        let target = null;
        let minDistanceSq = Infinity;

        // Encontrar el jugador vivo más cercano
        players.forEach(player => {
            if (player.health > 0) {
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    target = player;
                }
            }
        });

        if (target) {
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.radius + target.radius) { // Si están separados, perseguir
                const nx = dx / distance;
                const ny = dy / distance;
                this.x += nx * this.speed;
                this.y += ny * this.speed;
            }
        }
    }
}




// --- CLASE PRINCIPAL: GAMELOGIC ---


class GameLogic {
    constructor(playerData) {
        this.map = new ServerMapGenerator(); 
        this.entities = {
            players: new Map(), 
            zombies: new Map(), 
            bullets: new Map()
        };
        this.score = 0;
        this.wave = 1;
        this.running = true;
        this.lastUpdateTime = Date.now(); // Para control de tiempo de ataque/disparo


        // 1. Inicializar jugadores
        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name));
        });


        // 2. Inicializar enemigos
        this.spawnZombies(5);
    }

    /**
     * Comprueba si una entidad circular colisiona con un muro.
     * Implementación simple: Comprueba los 4 puntos cardinales y el centro de la entidad.
     */
    checkMapCollision(entity) {
        const cellSize = this.map.cellSize;
        const radius = entity.radius;
        
        const checkPoints = [
            { x: entity.x, y: entity.y }, // Centro
            { x: entity.x + radius, y: entity.y }, // Derecha
            { x: entity.x - radius, y: entity.y }, // Izquierda
            { x: entity.x, y: entity.y + radius }, // Abajo
            { x: entity.x, y: entity.y - radius }, // Arriba
        ];

        for (const p of checkPoints) {
            const tileX = Math.floor(p.x / cellSize);
            const tileY = Math.floor(p.y / cellSize);

            // Comprobar límites del mapa (que son muros)
            if (p.x < 0 || p.x > this.map.worldSize || p.y < 0 || p.y > this.map.worldSize) {
                return true;
            }

            // Comprobar la matriz de mapa
            if (tileY >= 0 && tileY < this.map.gridSize && tileX >= 0 && tileX < this.map.gridSize) {
                if (this.map.map[tileY][tileX] === 1) {
                    return true;
                }
            }
        }
        return false;
    }


    /**
     * Genera un número de zombies.
     */
    spawnZombies(count) {
        for (let i = 0; i < count; i++) {
            const zombieId = `zombie_${Date.now() + i}`; 
            const randomSpawn = this.map.getRandomOpenCellPosition();
            if (randomSpawn) {
                this.entities.zombies.set(zombieId, new ServerZombie(zombieId, randomSpawn.x, randomSpawn.y));
            }
        }
    }

    /**
     * Crea una nueva instancia de bala.
     */
    createBullet(playerId, x, y, dx, dy) {
        const player = this.entities.players.get(playerId);
        if (!player) return;
        
        // Cooldown Check
        const currentTime = Date.now();
        if (currentTime - player.lastShotTime < PLAYER_SHOOT_COOLDOWN) {
            return; // No se permite disparar
        }
        player.lastShotTime = currentTime; // Reiniciar el cooldown

        // Generar bala
        const bulletId = `bullet_${playerId}_${currentTime}`; 
        const startX = x + dx * (player.radius + 4);
        const startY = y + dy * (player.radius + 4);

        const newBullet = new ServerBullet(bulletId, startX, startY, dx, dy);
        this.entities.bullets.set(bulletId, newBullet);
    }


    /**
     * Se llama en cada tick del servidor.
     */
    update() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;
        
        // 1. Actualizar Posición del Jugador con Colisión
        this.entities.players.forEach(player => {
            if (player.health <= 0) {
                player.isDead = true;
                return;
            }

            const oldX = player.x;
            const oldY = player.y;

            // Intento de movimiento X
            player.x += player.input.moveX * player.speed;
            if (this.checkMapCollision(player)) {
                player.x = oldX; // Revertir si colisiona
            }

            // Intento de movimiento Y
            player.y += player.input.moveY * player.speed;
            if (this.checkMapCollision(player)) {
                player.y = oldY; // Revertir si colisiona
            }

            // Disparo: La lógica de cooldown se ejecuta en handlePlayerInput/createBullet
            if (player.input.isShooting) {
                this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY);
            }
        });


        // 2. Actualizar Zombis: Mover y Atacar
        this.entities.zombies.forEach(zombie => {
            zombie.updateAI(this.entities.players);
            
            // Colisión Zombie ↔ Jugador
            this.entities.players.forEach(player => {
                if (player.health > 0) {
                    const dx = player.x - zombie.x;
                    const dy = player.y - zombie.y;
                    const distSq = dx * dx + dy * dy;
                    const collisionDistSq = (player.radius + zombie.radius) ** 2;

                    if (distSq < collisionDistSq) {
                        // Atacar al jugador
                        if (currentTime - zombie.lastAttackTime > ZOMBIE_ATTACK_COOLDOWN) {
                            player.health = Math.max(0, player.health - ZOMBIE_ATTACK_DAMAGE);
                            zombie.lastAttackTime = currentTime;
                            console.log(`[GAME] Jugador ${player.id} golpeado. Vida: ${player.health}`);
                        }
                    }
                }
            });
        });

        // 3. Actualizar Balas y Colisiones
        const bulletsToRemove = [];
        const zombiesToRemove = [];

        this.entities.bullets.forEach(bullet => {
            bullet.updatePosition();

            // Colisión con Muro
            if (this.checkMapCollision(bullet)) {
                bulletsToRemove.push(bullet.id);
                return;
            }

            // Colisión con Zombi
            this.entities.zombies.forEach(zombie => {
                const dx = zombie.x - bullet.x;
                const dy = zombie.y - bullet.y;
                const distSq = dx * dx + dy * dy;
                const collisionDistSq = (zombie.radius + bullet.radius) ** 2;

                if (distSq < collisionDistSq) {
                    // Bala golpeó al zombi
                    zombie.health -= BULLET_DAMAGE;
                    bulletsToRemove.push(bullet.id);

                    if (zombie.health <= 0) {
                        zombiesToRemove.push(zombie.id);
                        // Acreditar el kill al jugador
                        const player = this.entities.players.get(bullet.ownerId);
                        if (player) {
                            player.kills++;
                            this.score += 10;
                        }
                    }
                }
            });
        });

        // Limpiar entidades
        bulletsToRemove.forEach(id => this.entities.bullets.delete(id));
        zombiesToRemove.forEach(id => this.entities.zombies.delete(id));


        // 4. Lógica de Oleadas y Spawning
        if (this.entities.zombies.size === 0) {
            this.wave++;
            this.score += 100 * this.wave; // Bonificación por oleada
            this.spawnZombies(this.wave * 3 + 5); // Aumenta la dificultad
            console.log(`[SERVER] Iniciando oleada ${this.wave}`);
        }
    }


    /**
     * Guarda el input del cliente para ser usado en el próximo tick de actualización.
     */
    handlePlayerInput(id, input) {
        const player = this.entities.players.get(id);
        if (player && player.health > 0) {
            player.input = input;
        }
    }

    /**
     * Elimina un jugador de la lógica de juego.
     */
    removePlayer(id) {
        this.entities.players.delete(id);
    }


    // Métodos para Game Over
    isGameOver() {
        // True si todos los jugadores están muertos o el mapa está vacío (no debería pasar)
        const activePlayers = Array.from(this.entities.players.values()).filter(p => p.health > 0);
        return activePlayers.length === 0 && this.entities.players.size > 0;
    }


    getFinalScore() {
        return { finalScore: this.score, finalWave: this.wave };
    }
}


module.exports = GameLogic;