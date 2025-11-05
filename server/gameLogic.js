/**
 * server/gameLogic.js - REDISEÑADO DESDE CERO
 *
 * - Importa y utiliza 'FlowField' en lugar de 'Pathfinder'.
 * - 'GameLogic' ahora genera UN solo campo de flujo para el jugador.
 * - 'ServerZombie.updateAI' ha sido reemplazado por completo.
 * - Ya NO tiene 'path', 'stuckTimer', 'targetOffset', etc.
 * - Ahora simplemente mira el 'flowField' y se mueve al
 * vecino con el valor (coste) más bajo.
 * - Esto es mucho más rápido y resulta en un movimiento de horda fluido.
 */

const ServerMapGenerator = require('./serverMapGenerator'); 
const FlowField = require('./pathfinding'); // Importamos el nuevo FlowField

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

class ServerZombie extends ServerEntity {
    constructor(id, x, y, config) {
        super(id, x, y, 14, config.zombieSpeed);
        this.maxHealth = config.zombieHealth;
        this.health = config.zombieHealth;
        this.lastAttackTime = 0;
        this.attackDamage = config.zombieAttack;
        this.attackCooldown = config.zombieAttackCooldown;
        
        // --- ¡TODA LA LÓGICA DE PATHFINDING SE HA ELIMINADO DE AQUÍ! ---
    }

    /**
     * IA REDISEÑADA: Sigue el FlowField
     * @param {Map} players - Mapa de jugadores
     * @param {Array<Array<number>>} flowField - El campo de flujo generado por el servidor
     * @param {ServerMapGenerator} mapGenerator - Para conversiones de coordenadas
     * @param {number} deltaTime - Tiempo desde el último fotograma
     */
    updateAI(players, flowField, mapGenerator) {
        if (players.size === 0) return;

        // 1. Encontrar el jugador vivo más cercano (para atacar)
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

        // 2. Lógica de ataque (si está lo suficientemente cerca)
        const distanceToTarget = Math.sqrt(minDistanceSq);
        const attackRange = this.radius + target.radius + 10;

        if (distanceToTarget <= attackRange) {
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
                // console.log(`[GAME] Jugador ${target.id} golpeado. Vida: ${target.health}`);
            }
            // Si está atacando, no se mueve
            return;
        }

        // 3. Lógica de movimiento (Seguir el FlowField)
        if (!flowField) {
            // El campo de flujo aún no está listo, no hacer nada
            return;
        }

        // Convertir mi posición a cuadrícula
        const myGridPos = mapGenerator.worldToGrid(this.x, this.y);

        // Si estoy fuera del mapa o en un estado inválido, no mover
        if (myGridPos.y < 0 || myGridPos.y >= flowField.length || myGridPos.x < 0 || myGridPos.x >= flowField[0].length) {
            return;
        }

        // Definir las 8 direcciones
        const directions = [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
            { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
        ];

        let bestCost = field[myGridPos.y][myGridPos.x];
        let bestDir = { x: 0, y: 0 }; // Dirección para moverse

        // Mirar las 8 celdas vecinas
        for (const dir of directions) {
            const newX = myGridPos.x + dir.x;
            const newY = myGridPos.y + dir.y;

            // Comprobar que el vecino está en el mapa
            if (newY >= 0 && newY < flowField.length && newX >= 0 && newX < flowField[0].length) {
                const neighborCost = flowField[newY][newX];
                
                // Si este vecino tiene un coste más bajo, es el mejor camino
                if (neighborCost < bestCost) {
                    bestCost = neighborCost;
                    bestDir = dir;
                }
            }
        }
        
        // 4. Moverse en la mejor dirección encontrada
        if (bestDir.x !== 0 || bestDir.y !== 0) {
            // Normalizar el vector de dirección
            const length = Math.sqrt(bestDir.x * bestDir.x + bestDir.y * bestDir.y);
            
            const moveX = (bestDir.x / length) * this.speed;
            const moveY = (bestDir.y / length) * this.speed;
            
            this.x += moveX;
            this.y += moveY;
        } else {
            // Si bestCost sigue siendo mi coste (estoy en un mínimo local o no hay camino),
            // moverme directamente al jugador (fallback).
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                this.x += (dx / length) * this.speed;
                this.y += (dy / length) * this.speed;
            }
        }
    }

    // ¡Ya no se necesita calculatePath()!
}

// --- CLASE PRINCIPAL: GAMELOGIC ---

class GameLogic {
    constructor(playerData, config) {
        this.config = config;
        
        // 1. Generar mapa
        this.map = new ServerMapGenerator({
            mapSize: config.mapSize,
            cellSize: 40,
            roomCount: config.roomCount,
            corridorWidth: config.corridorWidth
        });
        
        // 2. Inicializar el generador de FlowField
        this.pathfinder = new FlowField(this.map.getNavigationGrid());
        this.flowField = null; // El mapa de flujo se generará en 'update'
        this.lastTargetGridPos = { x: -1, y: -1 }; // Para saber cuándo recalcular

        this.entities = {
            players: new Map(), 
            zombies: new Map(), 
            bullets: new Map()
        };
        
        this.score = 0;
        this.wave = 1;
        this.running = true;
        this.lastUpdateTime = Date.now();

        // 3. Inicializar jugadores
        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });

        // 4. Inicializar enemigos
        this.spawnZombies(config.initialZombies);
    }

    /**
     * Comprueba colisión de entidad con el mapa
     */
    checkMapCollision(entity) {
        const cellSize = this.map.cellSize;
        const radius = entity.radius;

        // Simplificado: solo comprobar el centro de la entidad por eficiencia
        const tileX = Math.floor(entity.x / cellSize);
        const tileY = Math.floor(entity.y / cellSize);

        if (tileY < 0 || tileY >= this.map.gridSize || tileX < 0 || tileX >= this.map.gridSize) {
            return true; // Fuera del mapa
        }

        if (this.map.map[tileY][tileX] === 1) {
            return true; // Es un muro
        }

        // TODO: Añadir una comprobación de radio más robusta si es necesario
        // Por ahora, el flow field debería mantener a los zombies fuera de los muros.

        return false;
    }

    /**
     * Resuelve la colisión del mapa empujando la entidad
     */
    resolveMapCollision(entity) {
        const cellSize = this.map.cellSize;
        const radius = entity.radius;

        const entityGridPos = this.map.worldToGrid(entity.x, entity.y);

        // Comprobar colisiones en 8 direcciones + centro
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                const tileX = entityGridPos.x + x;
                const tileY = entityGridPos.y + y;

                if (tileY >= 0 && tileY < this.map.gridSize && tileX >= 0 && tileX < this.map.gridSize) {
                    // Si es un muro
                    if (this.map.map[tileY][tileX] === 1) {
                        // Coordenadas del mundo del muro
                        const wallX = tileX * cellSize + cellSize / 2;
                        const wallY = tileY * cellSize + cellSize / 2;

                        // Distancia del centro de la entidad al centro del muro
                        const dx = entity.x - wallX;
                        const dy = entity.y - wallY;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Distancia mínima para no solapar (radio + mitad de la celda)
                        const minDist = radius + cellSize / 2;

                        if (dist < minDist) {
                            // Colisión. Empujar la entidad
                            const overlap = minDist - dist;
                            const nx = dx / dist;
                            const ny = dy / dist;
                            
                            entity.x += nx * overlap;
                            entity.y += ny * overlap;
                        }
                    }
                }
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

    /**
     * Bucle principal de actualización del juego
     */
    update() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime; 
        this.lastUpdateTime = currentTime;

        // 0. ACTUALIZAR EL FLOW FIELD (si es necesario)
        
        // Encontrar un jugador vivo como objetivo
        const alivePlayers = Array.from(this.entities.players.values()).filter(p => p.health > 0);
        
        if (alivePlayers.length > 0) {
            // Usar al primer jugador vivo como el objetivo del flow field
            const targetPlayer = alivePlayers[0];
            const targetGridPos = this.map.worldToGrid(targetPlayer.x, targetPlayer.y);

            // Si el jugador se movió a una nueva celda, recalcular el campo
            if (targetGridPos.x !== this.lastTargetGridPos.x || targetGridPos.y !== this.lastTargetGridPos.y) {
                this.flowField = this.pathfinder.generateField(targetGridPos);
                this.lastTargetGridPos = targetGridPos;
            }
        } else {
            this.flowField = null; // No hay jugadores vivos, no hay campo
        }


        // 1. Actualizar Jugadores
        this.entities.players.forEach(player => {
            if (player.health <= 0) {
                player.isDead = true;
                return;
            }

            const oldX = player.x;
            const oldY = player.y;

            // Mover en X
            player.x += player.input.moveX * player.speed;
            this.resolveMapCollision(player); // Usar la nueva colisión

            // Mover en Y
            player.y += player.input.moveY * player.speed;
            this.resolveMapCollision(player); // Usar la nueva colisión

            // Disparar
            if (player.input.isShooting) {
                this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY);
            }
        });

        // 2. Actualizar Zombies
        this.entities.zombies.forEach(zombie => {
            // Pasar el flowField a la IA del zombie
            zombie.updateAI(this.entities.players, this.flowField, this.map);
            
            // Resolver colisión con el mapa
            this.resolveMapCollision(zombie);
        });

        // (Las colisiones Zombie-Zombie se han eliminado intencionadamente)

        // 3. Actualizar Balas
        const bulletsToRemove = [];
        const zombiesToRemove = [];

        this.entities.bullets.forEach(bullet => {
            bullet.updatePosition();

            // Colisión de bala con muro (simple)
            if (this.checkMapCollision(bullet)) {
                bulletsToRemove.push(bullet.id);
                return;
            }

            // Colisión de bala con zombie
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
        if (this.entities.zombies.size === 0 && alivePlayers.length > 0) {
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