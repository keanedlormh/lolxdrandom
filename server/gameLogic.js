/**
 * server/gameLogic.js - ACTUALIZADO
 *
 * ¡GRAN CAMBIO! Se ha implementado una nueva lógica de colisiones
 * para solucionar el "atasco en las esquinas".
 *
 * 1. `checkMapCollision(entity)`:
 * - Reescrita para ser más precisa para círculos.
 * - Ahora comprueba 5 puntos: Centro, Arriba, Abajo, Izquierda, Derecha.
 *
 * 2. `ServerZombie.updateAI(...)`:
 * - Modificada para NO mover al zombie (`this.x = ...`).
 * - Ahora DEVUELVE el vector de movimiento deseado (ej: {dx: 0, dy: -3}).
 *
 * 3. `GameLogic.update()`:
 * - Implementa "COLISIÓN CON DESLIZAMIENTO" (Sliding Collision).
 * - Aplica el movimiento del vector en el eje X y en el eje Y por separado.
 * - Si un eje choca, se resetea, pero el otro puede continuar.
 * - ¡Esto permite a los zombies "deslizarse" por muros y esquinas!
 */

const ServerMapGenerator = require('./serverMapGenerator'); 
const Pathfinder = require('./pathfinding');

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
        
        // Direcciones (4-way) para el flow field
        this.directions = [
            { x: 0, y: -1 },  // Arriba
            { x: 1, y: 0 },   // Derecha
            { x: 0, y: 1 },   // Abajo
            { x: -1, y: 0 }   // Izquierda
        ];
    }

    /**
     * IA REDISEÑADA: Sigue el Flow Field (playerCostMap)
     * MODIFICADO: Ahora DEVUELVE un vector de movimiento {dx, dy}
     *
     * @param {Map} players - Mapa de jugadores (para atacar)
     * @param {Array} costMap - El mapa 2D de costes generado por el Pathfinder
     * @param {ServerMapGenerator} mapGenerator - Para helpers de coordenadas
     * @param {number} deltaTime - Tiempo desde el último frame
     * @returns {Object} Un vector de movimiento {dx, dy} o null
     */
    updateAI(players, costMap, mapGenerator, deltaTime) {
        if (players.size === 0 || !costMap) return null;

        // 1. Encontrar el jugador vivo más cercano (SOLO para atacar)
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

        if (!target) return null;

        // 2. Lógica de Ataque (si está lo suficientemente cerca)
        const distance = Math.sqrt(minDistanceSq);
        if (distance <= this.radius + target.radius + 10) {
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
            }
            return null; // No te muevas si estás atacando
        }

        // 3. Lógica de Movimiento (Seguir el CostMap)
        
        // Obtener la celda actual del zombie
        const currentGrid = mapGenerator.worldToGrid(this.x, this.y);
        if (!mapGenerator.isValid(currentGrid.x, currentGrid.y)) {
             // El zombie está atascado o fuera del mapa
            return null;
        }

        // Encontrar el mejor vecino (coste más bajo)
        let bestCost = costMap[currentGrid.y][currentGrid.x];
        let bestDir = { dx: 0, dy: 0 }; // Dirección (en cuadrícula) al mejor vecino

        for (const dir of this.directions) {
            const newX = currentGrid.x + dir.x;
            const newY = currentGrid.y + dir.y;

            // Comprobar si el vecino es válido y transitable
            if (mapGenerator.isValid(newX, newY)) {
                const newCost = costMap[newY][newX];
                // Si esta celda es "mejor" (más cercana al jugador), tomarla
                if (newCost < bestCost) {
                    bestCost = newCost;
                    bestDir = { dx: dir.x, dy: dir.y };
                }
            }
        }

        // 4. Calcular el vector de movimiento
        if (bestDir.dx !== 0 || bestDir.dy !== 0) {
            // Objetivo: moverse al *centro* de la celda vecina
            const targetCellX = currentGrid.x + bestDir.dx;
            const targetCellY = currentGrid.y + bestDir.dy;

            const targetWorldPos = mapGenerator.gridToWorld(targetCellX, targetCellY);

            // Calcular vector de movimiento hacia el centro de esa celda
            const moveDx = targetWorldPos.x - this.x;
            const moveDy = targetWorldPos.y - this.y;
            
            const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);

            if (moveDist > 0) {
                // Normalizar y aplicar velocidad
                // Devolvemos el vector de movimiento completo
                return {
                    dx: (moveDx / moveDist) * this.speed,
                    dy: (moveDy / moveDist) * this.speed
                };
            }
        }
        
        return null; // No hay movimiento
    }
}


// --- CLASE PRINCIPAL: GAMELOGIC ---


class GameLogic {
    constructor(playerData, config) {
        this.config = config;
        
        this.map = new ServerMapGenerator({
            mapSize: config.mapSize,
            cellSize: 40,
            roomCount: config.roomCount,
            corridorWidth: config.corridorWidth
        });
        
        this.pathfinder = new Pathfinder(this.map.getNavigationGrid(), this.map.cellSize);
        
        this.entities = {
            players: new Map(), 
            zombies: new Map(), 
            bullets: new Map()
        };
        
        this.score = 0;
        this.wave = 1;
        this.running = true;
        this.lastUpdateTime = Date.now();

        this.playerCostMap = null; 
        this.pathfindUpdateTimer = 0;
        this.pathfindUpdateInterval = 500; 

        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });

        this.spawnZombies(config.initialZombies);
        this.updatePlayerCostMap();
    }

    /**
     * Genera el mapa de costes (flow field) para los zombies.
     */
    updatePlayerCostMap() {
        let targetPlayer = null;
        for (const player of this.entities.players.values()) {
            if (player.health > 0) {
                targetPlayer = player;
                break; 
            }
        }

        if (targetPlayer) {
            const gridPos = this.map.worldToGrid(targetPlayer.x, targetPlayer.y);
            this.playerCostMap = this.pathfinder.generatePlayerCostMap(gridPos);
        } else {
            this.playerCostMap = null;
        }
    }


    /**
     * ¡FUNCIÓN DE COLISIÓN MEJORADA!
     * Comprueba 5 puntos (Centro + N,S,E,W) para una colisión circular más precisa.
     */
    checkMapCollision(entity) {
        const radius = entity.radius;

        // Puntos a comprobar (Centro + 4 bordes del círculo)
        const checkPoints = [
            { x: entity.x, y: entity.y },           // Centro
            { x: entity.x + radius, y: entity.y },  // Derecha
            { x: entity.x - radius, y: entity.y },  // Izquierda
            { x: entity.x, y: entity.y + radius },  // Abajo
            { x: entity.x, y: entity.y - radius }   // Arriba
        ];

        for (const p of checkPoints) {
            const gridPos = this.map.worldToGrid(p.x, p.y);
            if (!this.map.isValid(gridPos.x, gridPos.y)) {
                return true; // Colisión si CUALQUIER punto está en un muro
            }
        }

        return false; // Sin colisión
    }


    /**
     * Comprueba colisión entre dos entidades circulares
     */
    checkEntityCollision(entityA, entityB) {
        // ... (Esta función no se usa para zombies, pero la dejamos para balas)
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = entityA.radius + entityB.radius;
        
        return distance < minDistance;
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
        // ... (Sin cambios en esta función)
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

        // 1. Actualizar el mapa de costes (Flow Field)
        this.pathfindUpdateTimer += deltaTime;
        if (this.pathfindUpdateTimer > this.pathfindUpdateInterval) {
            this.pathfindUpdateTimer = 0;
            this.updatePlayerCostMap();
        }


        // 2. Actualizar Jugadores (CON COLISIÓN DESLIZANTE)
        this.entities.players.forEach(player => {
            if (player.health <= 0) {
                player.isDead = true;
                return;
            }

            const oldX = player.x;
            const oldY = player.y;
            
            const moveX = player.input.moveX * player.speed;
            const moveY = player.input.moveY * player.speed;

            // Mover en X
            player.x += moveX;
            if (this.checkMapCollision(player)) {
                player.x = oldX; // Colisión, resetear X
            }

            // Mover en Y
            player.y += moveY;
            if (this.checkMapCollision(player)) {
                player.y = oldY; // Colisión, resetear Y
            }


            if (player.input.isShooting) {
                this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY);
            }
        });


        // 3. Actualizar Zombies (CON COLISIÓN DESLIZANTE)
        this.entities.zombies.forEach(zombie => {
            const oldX = zombie.x;
            const oldY = zombie.y;

            // La IA ahora solo devuelve un vector, no mueve al zombie
            const moveVector = zombie.updateAI(this.entities.players, this.playerCostMap, this.map, deltaTime);
            
            if (moveVector) {
                // Mover en X
                zombie.x += moveVector.dx;
                if (this.checkMapCollision(zombie)) {
                    zombie.x = oldX; // Colisión, resetear X
                }

                // Mover en Y
                zombie.y += moveVector.dy;
                if (this.checkMapCollision(zombie)) {
                    zombie.y = oldY; // Colisión, resetear Y
                }
            }
        });

        // 4. Actualizar Balas
        const bulletsToRemove = [];
        const zombiesToRemove = [];


        this.entities.bullets.forEach(bullet => {
            bullet.updatePosition();

            // Usamos la colisión de 5 puntos también para la bala
            if (this.checkMapCollision(bullet)) {
                bulletsToRemove.push(bullet.id);
                return;
            }


            this.entities.zombies.forEach(zombie => {
                // checkEntityCollision (círculo-círculo) es perfecto para esto
                if (this.checkEntityCollision(bullet, zombie)) {
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


        // 5. Lógica de Oleadas
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