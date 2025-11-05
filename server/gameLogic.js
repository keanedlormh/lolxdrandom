/**
 * server/gameLogic.js - ACTUALIZADO
 * - Lógica de "Enjambre Estable": los zombies ahora "recuerdan" su punto de
 * offset aleatorio y no lo cambian cada 500ms, evitando el zigzag.
 * - El camino se recalcula si el jugador se mueve, pero el *objetivo*
 * relativo al jugador sigue siendo el mismo.
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

        // Pathfinding
        this.path = [];
        this.currentPathIndex = 0;
        this.pathUpdateTimer = 0;
        this.pathUpdateInterval = 500; // Recalcular ruta cada 500ms
        this.stuckTimer = 0;
        this.lastPosition = { x, y };

        // *** NUEVO: Lógica de Enjambre Estable ***
        this.targetOffset = { x: 0, y: 0 }; // El offset (x,y) recordado
        this.currentTargetId = null;        // El ID del jugador que persigue
        this.needsNewOffset = true;         // Flag para recalcular el offset
    }

    /**
     * IA mejorada con pathfinding y lógica de desatasco
     */
    updateAI(players, pathfinder, mapGenerator, deltaTime) {
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
        if (!target) return;

        // *** NUEVO: Comprobar si el objetivo ha cambiado ***
        if (this.currentTargetId !== target.id) {
            this.currentTargetId = target.id;
            this.needsNewOffset = true; // Forzar un nuevo offset para el nuevo objetivo
            this.path = []; // Limpiar el camino antiguo
        }

        // 2. Lógica de Ataque
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= this.radius + target.radius + 15) { // Aumentado el rango de ataque
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
            }
            return; // Si está atacando, no necesita moverse
        }

        // 3. Lógica de Atasco
        this.pathUpdateTimer += deltaTime;
        const movedDistance = Math.sqrt(
            (this.x - this.lastPosition.x) ** 2 + 
            (this.y - this.lastPosition.y) ** 2
        );
        if (movedDistance < this.speed * 0.5) { 
            this.stuckTimer += deltaTime;
        } else {
            this.stuckTimer = 0;
            this.lastPosition = { x: this.x, y: this.y };
        }

        // 4. Decidir si recalcular el camino
        let forceRecalculate = false;

        if (this.stuckTimer > 1000) {
            this.needsNewOffset = true; // Quedó atascado, buscar un nuevo punto
            forceRecalculate = true;
            this.stuckTimer = 0;
            // console.log(`[AI] Zombie ${this.id} atascado. Buscando nuevo offset.`);
        }

        if (this.pathUpdateTimer > this.pathUpdateInterval) {
            forceRecalculate = true; // El jugador se ha movido, recalcular
            this.pathUpdateTimer = 0;
        }

        if (forceRecalculate || this.path.length === 0) {
            this.calculatePath(target, pathfinder, mapGenerator);
        }

        // 5. Lógica de seguimiento de camino (fluida)
        if (this.path.length > 0) {
            const nextWaypointNode = this.path[this.currentPathIndex];

            if (nextWaypointNode) {
                const waypointWorld = mapGenerator.gridToWorld(nextWaypointNode.x, nextWaypointNode.y);
                const wpDx = waypointWorld.x - this.x;
                const wpDy = waypointWorld.y - this.y;
                const wpDist = Math.sqrt(wpDx * wpDx + wpDy * wpDy);

                const moveDistance = this.speed; 

                if (wpDist <= moveDistance) {
                    this.x = waypointWorld.x;
                    this.y = waypointWorld.y;
                    this.currentPathIndex++;

                    if (this.currentPathIndex >= this.path.length) {
                        this.path = [];
                        this.currentPathIndex = 0;
                    }
                } else {
                    const nx = wpDx / wpDist;
                    const ny = wpDy / wpDist;
                    this.x += nx * moveDistance;
                    this.y += ny * moveDistance;
                }
            }
        } else {
            // Fallback: moverse directamente (solo si no hay camino)
            if (distance > this.radius + target.radius) {
                const nx = dx / distance;
                const ny = dy / distance;
                this.x += nx * this.speed;
                this.y += ny * this.speed;
            }
        }
    }

    /**
     * Calcula un nuevo camino hacia el objetivo usando A*
     * *** AHORA CON LÓGICA DE ENJAMBRE ESTABLE ***
     */
    calculatePath(target, pathfinder, mapGenerator) {
        const startGrid = mapGenerator.worldToGrid(this.x, this.y);

        // *** NUEVA LÓGICA DE ENJAMBRE (SWARM) ESTABLE ***
        if (this.needsNewOffset) {
            const offset = mapGenerator.cellSize * 3; // Apuntar a un área de +/- 3 celdas
            this.targetOffset.x = (Math.random() - 0.5) * offset;
            this.targetOffset.y = (Math.random() - 0.5) * offset;
            this.needsNewOffset = false; // Marcar que ya tenemos un offset
        }

        // Apuntar al offset *recordado*
        const targetX = target.x + this.targetOffset.x;
        const targetY = target.y + this.targetOffset.y;

        const goalGrid = mapGenerator.worldToGrid(targetX, targetY);

        // Validar el nuevo goalGrid
        let finalGoalGrid = goalGrid;
        if (!pathfinder.isValid(goalGrid)) {
            finalGoalGrid = mapGenerator.worldToGrid(target.x, target.y); // Fallback al centro del jugador
            if (!pathfinder.isValid(finalGoalGrid)) {
                this.path = []; this.currentPathIndex = 0; return;
            }
        }

        const path = pathfinder.findPath(startGrid, finalGoalGrid);

        if (path && path.length > 1) {
            this.path = path; // Usar el camino puro de A*
            this.currentPathIndex = 0; 
        } else {
            this.path = [];
            this.currentPathIndex = 0;
        }
    }
}

// --- CLASE PRINCIPAL: GAMELOGIC ---
// (El resto de esta clase no necesita cambios)

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

        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });
        this.spawnZombies(config.initialZombies);
    }

    checkMapCollision(entity) {
        const cellSize = this.map.cellSize;
        const radius = entity.radius;
        const checkPoints = [
            { x: entity.x, y: entity.y },
            { x: entity.x + radius, y: entity.y },
            { x: entity.x - radius, y: entity.y },
            { x: entity.x, y: entity.y + radius },
            { x: entity.x, y: entity.y - radius }
        ];
        for (const p of checkPoints) {
            const tileX = Math.floor(p.x / cellSize);
            const tileY = Math.floor(p.y / cellSize);
            if (p.x < 0 || p.x > this.map.worldSize || p.y < 0 || p.y > this.map.worldSize) {
                return true; 
            }
            if (tileY >= 0 && tileY < this.map.gridSize && tileX >= 0 && tileX < this.map.gridSize) {
                if (this.map.map[tileY][tileX] === 1) {
                    return true;
                }
            }
        }
        return false;
    }

    checkEntityCollision(entityA, entityB) {
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

        // 1. Actualizar Jugadores
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

        // 2. Actualizar Zombies
        const zombieArray = Array.from(this.entities.zombies.values());
        zombieArray.forEach(zombie => {
            const oldX = zombie.x;
            const oldY = zombie.y;
            zombie.updateAI(this.entities.players, this.pathfinder, this.map, deltaTime);
            if (this.checkMapCollision(zombie)) {
                zombie.x = oldX;
                zombie.y = oldY;
                zombie.path = [];
                zombie.stuckTimer = 1001; // Forzar recalculo
            }
        });

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
        if (this.entities.zombies.size === 0 && this.running) {
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
                id: p.id, x: p.x, y: p.y, name: p.name, health: p.health,
                kills: p.kills, shootX: p.input.shootX, shootY: p.input.shootY
            })),
            zombies: Array.from(this.entities.zombies.values()).map(z => ({
                id: z.id, x: z.x, y: z.y, health: z.health, maxHealth: z.maxHealth
            })),
            bullets: Array.from(this.entities.bullets.values()).map(b => ({
                id: b.id, x: b.x, y: b.y
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

Initial
    isGameOver() {
        if (!this.running) return false;
        const activePlayers = Array.from(this.entities.players.values()).filter(p => p.health > 0);
        const isOver = activePlayers.length === 0 && this.entities.players.size > 0;
        if (isOver) {
            this.running = false;
        }
        return isOver;
    }

    getFinalScore() {
        return { finalScore: this.score, finalWave: this.wave };
    }
}

module.exports = GameLogic;
