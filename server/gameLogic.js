/**
 * server/gameLogic.js - REDISEÑADO
 *
 * Se ha eliminado por completo el sistema de Pathfinding A* (el archivo 'pathfinding.js' ya no es necesario).
 * Se reemplaza por un sistema de "Steering Behaviors" (Comportamientos de Dirección).
 *
 * 1. Los zombies ya no calculan rutas.
 * 2. Tienen un comportamiento "Seek" (Perseguir) hacia un punto objetivo.
 * 3. Tienen un comportamiento "Slide" (Deslizar) que les permite
 * deslizarse fluidamente por los muros en lugar de atascarse.
 * 4. Se mantiene la lógica de "enjambre estable" (targetOffset)
 * para que no se apilen todos en el mismo píxel.
 *
 * Esto resulta en un movimiento mucho más fluido, directo y natural
 * que elimina por completo los "zigzags" y los problemas de atascos.
 */


const ServerMapGenerator = require('./serverMapGenerator'); 
// const Pathfinder = require('./pathfinding'); // <-- ELIMINADO. Ya no se usa.


// --- ENTIDADES DE SERVIDOR ---


class ServerEntity {
    constructor(id, x, y, radius, speed) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
    }
}


class ServerBullet extends ServerEntity {
    constructor(id, x, y, dx, dy, speed, damage) {
        super(id, x, y, 4, speed);
        this.dx = dx;
        this.dy = dy;
        this.damage = damage;
        this.ownerId = id.split('_')[1];
    }


    updatePosition() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;
    }
}


class ServerPlayer extends ServerEntity {
    constructor(id, x, y, name, config) {
        super(id, x, y, 15, config.playerSpeed);
        this.name = name;
        this.maxHealth = config.playerHealth;
        this.health = config.playerHealth;
        this.kills = 0;
        this.input = { moveX: 0, moveY: 0, shootX: 1, shootY: 0, isShooting: false };
        this.lastShotTime = 0;
        this.isDead = false;
        this.shootCooldown = config.shootCooldown;
    }
}


/**
 * CLASE ServerZombie - TOTALMENTE REESCRITA
 * Ahora usa Steering Behaviors (Seek + Slide)
 */
class ServerZombie extends ServerEntity {
    constructor(id, x, y, config) {
        super(id, x, y, 14, config.zombieSpeed);
        this.maxHealth = config.zombieHealth;
        this.health = config.zombieHealth;
        this.lastAttackTime = 0;
        this.attackDamage = config.zombieAttack;
        this.attackCooldown = config.zombieAttackCooldown;
        
        // --- Lógica de Enjambre Estable ---
        // Almacena el offset de objetivo para un jugador específico
        this.targetOffset = { x: 0, y: 0 };
        // El ID del jugador al que estamos fijados
        this.currentTargetId = null; 
    }


    /**
     * IA NUEVA: Basada en Steering Behaviors (Seek + Wall Sliding)
     */
    updateAI(players, gameLogic, deltaTime) {
        if (players.size === 0) return;


        // 1. Encontrar el jugador vivo más cercano
        let target = null;
        let minDistanceSq = Infinity;


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


        if (!target) return; // No hay jugadores vivos


        // 2. Lógica de Ataque (Igual que antes)
        // Comprobar distancia real al jugador (no al offset)
        const realDx = target.x - this.x;
        const realDy = target.y - this.y;
        const realDistance = Math.sqrt(realDx * realDx + realDy * realDy);


        if (realDistance <= this.radius + target.radius + 10) {
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
                // console.log(`[GAME] Jugador ${target.id} golpeado. Vida: ${target.health}`);
            }
            return; // Si estamos atacando, no nos movemos
        }


        // 3. Lógica de Enjambre Estable (Swarm)
        // Si el objetivo es nuevo, o no teníamos, calculamos un nuevo offset
        if (!this.currentTargetId || this.currentTargetId !== target.id) {
            this.currentTargetId = target.id;
            // Calcular un punto aleatorio en un radio de 60px alrededor del jugador
            const radius = 60;
            this.targetOffset.x = (Math.random() - 0.5) * radius;
            this.targetOffset.y = (Math.random() - 0.5) * radius;
        }


        // 4. Comportamiento "Seek" (Perseguir)
        // El objetivo no es el jugador, sino el offset cerca del jugador
        const goalX = target.x + this.targetOffset.x;
        const goalY = target.y + this.targetOffset.y;


        const dx = goalX - this.x;
        const dy = goalY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);


        if (distance < 1) return; // Ya llegamos al punto de offset


        // Vector de dirección normalizado (hacia dónde queremos ir)
        const nx = dx / distance;
        const ny = dy / distance;


        // 5. Comportamiento "Slide" (Deslizamiento por muros)
        // Esta es la clave: movemos X e Y por separado y comprobamos colisiones.
        // Si uno choca, se revierte, pero el otro no.
        
        const oldX = this.x;
        const oldY = this.y;


        // Mover en eje X
        this.x += nx * this.speed;
        // ¿Hemos chocado al mover X?
        if (gameLogic.checkMapCollision(this)) {
            this.x = oldX; // Revertir movimiento X
        }


        // Mover en eje Y
        this.y += ny * this.speed;
        // ¿Hemos chocado al mover Y?
        if (gameLogic.checkMapCollision(this)) {
            this.y = oldY; // Revertir movimiento Y
        }
    }
}


// --- CLASE PRINCIPAL: GAMELOGIC ---


class GameLogic {
    constructor(playerData, config) {
        this.config = config;
        
        // Generar mapa con configuración
        this.map = new ServerMapGenerator({
            mapSize: config.mapSize,
            cellSize: 40,
            roomCount: config.roomCount,
            corridorWidth: config.corridorWidth
        });
        
        // Inicializar pathfinder - ELIMINADO
        // this.pathfinder = new Pathfinder(this.map.getNavigationGrid(), this.map.cellSize);
        
        this.entities = {
            players: new Map(), 
            zombies: new Map(), 
            bullets: new Map()
        };
        
        this.score = 0;
        this.wave = 1;
        this.running = true;
        this.lastUpdateTime = Date.now();


        // Inicializar jugadores
        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });


        // Inicializar enemigos
        this.spawnZombies(config.initialZombies);
    }


    /**
     * Comprueba colisión de entidad con el mapa
     */
    checkMapCollision(entity) {
        const cellSize = this.map.cellSize;
        const radius = entity.radius;


        // 8 puntos de chequeo alrededor del círculo + centro
        const checkPoints = [
            { x: entity.x, y: entity.y },
            { x: entity.x + radius, y: entity.y },
            { x: entity.x - radius, y: entity.y },
            { x: entity.x, y: entity.y + radius },
            { x: entity.x, y: entity.y - radius },
            { x: entity.x + radius * 0.7, y: entity.y + radius * 0.7 }, 
            { x: entity.x - radius * 0.7, y: entity.y - radius * 0.7 },
            { x: entity.x + radius * 0.7, y: entity.y - radius * 0.7 },
            { x: entity.x - radius * 0.7, y: entity.y + radius * 0.7 }
        ];


        for (const p of checkPoints) {
            const tileX = Math.floor(p.x / cellSize);
            const tileY = Math.floor(p.y / cellSize);


            // Fuera de los límites del mundo?
            if (p.x < 0 || p.x > this.map.worldSize || p.y < 0 || p.y > this.map.worldSize) {
                return true; // Colisión con el "borde"
            }


            // Dentro de los límites, ¿es un muro (1)?
            if (tileY >= 0 && tileY < this.map.gridSize && tileX >= 0 && tileX < this.map.gridSize) {
                if (this.map.map[tileY][tileX] === 1) {
                    return true; // Colisión con un muro
                }
            }
        }
        return false; // No hay colisión
    }


    /**
     * Comprueba colisión entre dos entidades circulares
     */
    checkEntityCollision(entityA, entityB) {
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = entityA.radius + entityB.radius;
        
        return distance < minDistance;
    }


    /**
     * Resuelve colisión entre dos entidades (empujándolas)
     * VERSIÓN SEGURA: Comprueba colisiones con el mapa antes de mover
     */
    resolveEntityCollision(entityA, entityB) {
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = entityA.radius + entityB.radius;
        
        if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance;
            const nx = dx / distance;
            const ny = dy / distance;
            
            const moveA = -nx * overlap * 0.5;
            const moveB = nx * overlap * 0.5;
            
            const oldAx = entityA.x;
            const oldAy = entityA.y;
            const oldBx = entityB.x;
            const oldBy = entityB.y;

            // Mover A y comprobar
            entityA.x += moveA;
            entityA.y -= ny * overlap * 0.5;
            if (this.checkMapCollision(entityA)) {
                entityA.x = oldAx;
                entityA.y = oldAy;
            }

            // Mover B y comprobar
            entityB.x += moveB;
            entityB.y += ny * overlap * 0.5;
             if (this.checkMapCollision(entityB)) {
                entityB.x = oldBx;
                entityB.y = oldBy;
            }
        }
    }


    spawnZombies(count) {
        for (let i = 0; i < count; i++) {
            const zombieId = `zombie_${Date.now()}_${i}`; 
            const randomSpawn = this.map.getRandomOpenCellPosition();
            if (randomSpawn) {
                this.entities.zombies.set(
                    zombieId, 
                    new ServerZombie(zombieId, randomSpawn.x, randomSpawn.y, this.config)
                );
            }
        }
    }


    createBullet(playerId, x, y, dx, dy) {
        const player = this.entities.players.get(playerId);
        if (!player || player.health <= 0) return;


        const currentTime = Date.now();
        if (currentTime - player.lastShotTime < player.shootCooldown) {
            return;
        }
        player.lastShotTime = currentTime;


        const bulletId = `bullet_${playerId}_${currentTime}`; 
        const startX = x + dx * (player.radius + 4); 
        const startY = y + dy * (player.radius + 4);


        const newBullet = new ServerBullet(
            bulletId, startX, startY, dx, dy, 
            this.config.bulletSpeed, 
            this.config.bulletDamage
        );
        this.entities.bullets.set(bulletId, newBullet);
    }


    update() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime; 
        this.lastUpdateTime = currentTime;


        // 1. Actualizar Jugadores (Con "Slide" de muros)
        this.entities.players.forEach(player => {
            if (player.health <= 0) {
                player.isDead = true;
                return;
            }


            const oldX = player.x;
            const oldY = player.y;


            player.x += player.input.moveX * player.speed;
            if (this.checkMapCollision(player)) {
                player.x = oldX; 
            }


            player.y += player.input.moveY * player.speed;
            if (this.checkMapCollision(player)) {
                player.y = oldY; 
            }


            if (player.input.isShooting) {
                this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY);
            }
        });


        // 2. Actualizar Zombies (con nueva IA)
        this.entities.zombies.forEach(zombie => {
            // Pasamos 'this' (GameLogic) para que el zombie
            // pueda usar 'checkMapCollision'
            zombie.updateAI(this.entities.players, this, deltaTime);
        });
        
        // Colisiones zombie-zombie (ELIMINADAS)
        // Ya no es necesario, se pueden superponer.


        // 3. Actualizar Balas
        const bulletsToRemove = [];
        const zombiesToRemove = [];


        this.entities.bullets.forEach(bullet => {
            bullet.updatePosition();


            if (this.checkMapCollision(bullet)) {
                bulletsToRemove.push(bullet.id);
                return;
            }


            this.entities.zombies.forEach(zombie => {
                const dx = zombie.x - bullet.x;
                const dy = zombie.y - bullet.y;
                const distSq = dx * dx + dy * dy;
                const collisionDistSq = (zombie.radius + bullet.radius) ** 2;


                if (distSq < collisionDistSq) {
                    zombie.health -= bullet.damage;
                    bulletsToRemove.push(bullet.id);


                    if (zombie.health <= 0) {
                        zombiesToRemove.push(zombie.id);
                        const player = this.entities.players.get(bullet.ownerId);
                        if (player) {
                            player.kills++;
                            this.score += 10;
                        }
                    }
                }
            });
        });


        bulletsToRemove.forEach(id => this.entities.bullets.delete(id));
        zombiesToRemove.forEach(id => this.entities.zombies.delete(id));


        // 4. Lógica de Oleadas
        if (this.entities.zombies.size === 0) {
            this.wave++;
            this.score += 100 * this.wave;
            const zombieCount = Math.floor(this.wave * this.config.waveMultiplier + this.config.initialZombies);
            this.spawnZombies(zombieCount);
            console.log(`[SERVER] Iniciando oleada ${this.wave} con ${zombieCount} zombies`);
        }
    }


    getGameStateSnapshot() {
        return {
            players: Array.from(this.entities.players.values()).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                name: p.name,
                health: p.health,
                kills: p.kills,
                shootX: p.input.shootX, 
                shootY: p.input.shootY
            })),
            zombies: Array.from(this.entities.zombies.values()).map(z => ({
                id: z.id,
                x: z.x,
                y: z.y,
                health: z.health,
                maxHealth: z.maxHealth
            })),
            bullets: Array.from(this.entities.bullets.values()).map(b => ({
                id: b.id,
                x: b.x,
                y: b.y
            })),
            score: this.score,
            wave: this.wave
        };
    }


    handlePlayerInput(id, input) {
        const player = this.entities.players.get(id);
        if (player && player.health > 0) {
            player.input = input;
        }
    }


    removePlayer(id) {
        this.entities.players.delete(id);
    }


    isGameOver() {
        const activePlayers = Array.from(this.entities.players.values()).filter(p => p.health > 0);
        return activePlayers.length === 0 && this.entities.players.size > 0;
    }


    getFinalScore() {
        return { finalScore: this.score, finalWave: this.wave };
    }
}


module.exports = GameLogic;