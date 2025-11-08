/**
 * server/gameLogic.js (v1.7 - Refactorizado)
 * - Importa las clases de entidades desde entities.js.
 * - Contiene ÚNICAMENTE la clase GameLogic (el "cerebro" de una partida).
 * - (v1.5) ServerPlayer incluye maxHealth en el snapshot.
 * - (v1.5) createBullet spawnea en el centro (x, y).
 */

const ServerMapGenerator = require('./serverMapGenerator'); 
const Pathfinder = require('./pathfinding');

// Importar las clases de entidades
const { 
    ServerPlayer, 
    ServerZombie, 
    ServerBullet, 
    ServerZombieCore 
} = require('./entities.js');

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
            bullets: new Map(),
            zombieCore: null
        };

        this.score = 0;
        this.wave = 0;
        this.running = true;
        this.lastUpdateTime = Date.now();
        this.playerCostMap = null; 
        this.pathfindUpdateTimer = 0;
        this.pathfindUpdateInterval = 500; 

        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            const newPlayer = new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config);
            newPlayer.isPendingSpawn = false;
            this.entities.players.set(p.id, newPlayer);
        });

        this.spawnNewCore(); 
        this.updatePlayerCostMap();
    }

    addPlayer(playerData, config) {
        const spawn = this.map.getSpawnPoint();
        const newPlayer = new ServerPlayer(playerData.id, spawn.x, spawn.y, playerData.name, config);
        newPlayer.isDead = true;
        newPlayer.health = 0;
        newPlayer.isPendingSpawn = true;
        this.entities.players.set(newPlayer.id, newPlayer);
        console.log(`[GAME] Jugador pendiente ${newPlayer.name} añadido. Esperando oleada ${this.wave + 1}.`);
    }

    spawnNewCore() {
        this.wave++;
        let anchorPlayer = null;
        let maxHealth = -1;
        this.entities.players.forEach(p => {
            if (!p.isPendingSpawn && p.health > maxHealth) { 
                maxHealth = p.health;
                anchorPlayer = p;
            }
        });

        let spawnPos;
        if (anchorPlayer) {
            const anchorGridPos = this.map.worldToGrid(anchorPlayer.x, anchorPlayer.y);
            spawnPos = this.map.findValidSpawnNear(anchorGridPos.x, anchorGridPos.y);
        } else {
            spawnPos = this.map.getSpawnPoint(); 
        }

        this.entities.players.forEach(player => {
            if (player.health > 0 && !player.isPendingSpawn) {
                player.health = player.maxHealth;
            } else {
                player.health = player.maxHealth;
                player.isDead = false;
                player.isPendingSpawn = false;
                player.x = spawnPos.x;
                player.y = spawnPos.y;
            }
        });

        const playerPositions = Array.from(this.entities.players.values())
            .map(p => ({ x: p.x, y: p.y }));
        const coreSpawnPos = this.map.getRandomOpenCellPosition(playerPositions, 20);

        if (!coreSpawnPos) {
            console.error("[ERROR] No se pudo encontrar un spawn seguro para el Núcleo. Usando spawn por defecto.");
            coreSpawnPos = this.map.getSpawnPoint();
        }

        const coreId = `core_${this.wave}`;
        this.entities.zombieCore = new ServerZombieCore(coreId, coreSpawnPos.x, coreSpawnPos.y, this.wave, this.config);
        this.pathfindUpdateTimer = this.pathfindUpdateInterval;
    }

    spawnZombieAtCore() {
        if (!this.entities.zombieCore) return;
        const core = this.entities.zombieCore;
        const gridPos = this.map.worldToGrid(core.x, core.y);
        const spawnPos = this.map.findValidSpawnNear(gridPos.x, gridPos.y);

        if (spawnPos) {
            const zombieId = `zombie_${Date.now()}_${Math.random()}`;
            this.entities.zombies.set(
                zombieId, 
                new ServerZombie(zombieId, spawnPos.x, spawnPos.y, this.config)
            );
        } else {
            console.warn(`[SPAWN] El núcleo en (${gridPos.x}, ${gridPos.y}) está bloqueado, no puede spawnear zombies.`);
        }
    }

    updatePlayerCostMap() {
        const livingPlayers = Array.from(this.entities.players.values())
                                   .filter(p => p.health > 0);
        if (livingPlayers.length > 0) {
            const playerGridPositions = livingPlayers.map(player => {
                return this.map.worldToGrid(player.x, player.y);
            });
            this.playerCostMap = this.pathfinder.generatePlayerCostMap(playerGridPositions);
        } else {
            this.playerCostMap = null;
        }
    }

    checkMapCollision(entity) {
        const radius = entity.radius;
        const checkPoints = [
            { x: entity.x, y: entity.y },
            { x: entity.x + radius, y: entity.y },
            { x: entity.x - radius, y: entity.y },
            { x: entity.x, y: entity.y + radius },
            { x: entity.x, y: entity.y - radius }
        ];

        for (const p of checkPoints) {
            const gridPos = this.map.worldToGrid(p.x, p.y);
            if (!this.map.isValid(gridPos.x, gridPos.y)) {
                return true;
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

    createBullet(playerId, x, y, dx, dy) {
        const player = this.entities.players.get(playerId);
        if (!player || player.health <= 0) return;

        const currentTime = Date.now();
        if (currentTime - player.lastShotTime < player.shootCooldown) {
            return;
        }
        player.lastShotTime = currentTime;

        const bulletId = `bullet_${playerId}_${currentTime}`; 
        
        // v1.5: Spawnea la bala en el CENTRO (x, y) del jugador
        const startX = x;
        const startY = y;

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

        // 1. Actualizar mapa de costes
        this.pathfindUpdateTimer += deltaTime;
        if (this.pathfindUpdateTimer > this.pathfindUpdateInterval) {
            this.pathfindUpdateTimer = 0;
            this.updatePlayerCostMap();
        }

        // 2. Actualizar Jugadores
        this.entities.players.forEach(player => {
            if (player.health <= 0 || player.isPendingSpawn) {
                player.isDead = true;
                return;
            }
            const oldX = player.x;
            const oldY = player.y;
            const moveX = player.input.moveX * player.speed;
            const moveY = player.input.moveY * player.speed;
            player.x += moveX;
            if (this.checkMapCollision(player)) {
                player.x = oldX;
            }
            player.y += moveY;
            if (this.checkMapCollision(player)) {
                player.y = oldY;
            }
            if (player.input.isShooting) {
                this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY);
            }
        });

        // 3. Actualizar Zombies
        this.entities.zombies.forEach(zombie => {
            const oldX = zombie.x;
            const oldY = zombie.y;
            const moveVector = zombie.updateAI(this.entities.players, this.playerCostMap, this.map, deltaTime);
            if (moveVector) {
                zombie.x += moveVector.dx;
                if (this.checkMapCollision(zombie)) {
                    zombie.x = oldX;
                }
                zombie.y += moveVector.dy;
                if (this.checkMapCollision(zombie)) {
                    zombie.y = oldY;
                }
            }
        });

        // 4. Lógica del Núcleo y Oleadas
        if (this.entities.zombieCore) {
            const core = this.entities.zombieCore;
            const shouldSpawn = core.update(deltaTime);
            if (shouldSpawn) {
                this.spawnZombieAtCore();
            }
        } else {
            if (this.entities.zombies.size === 0) {
                this.score += 100 * this.wave;
                this.spawnNewCore();
            }
        }

        // 5. Actualizar Balas
        const bulletsToRemove = [];
        const zombiesToRemove = [];
        this.entities.bullets.forEach(bullet => {
            bullet.updatePosition();
            if (this.checkMapCollision(bullet)) {
                bulletsToRemove.push(bullet.id);
                return;
            }
            if (this.entities.zombieCore) {
                const core = this.entities.zombieCore;
                if (this.checkEntityCollision(bullet, core)) {
                    bulletsToRemove.push(bullet.id);
                    core.health -= bullet.damage;
                    if (core.health <= 0) {
                        this.entities.zombieCore = null;
                        this.score += 500 * this.wave;
                        const player = this.entities.players.get(bullet.ownerId);
                        if (player) {
                            player.kills++;
                        }
                    }
                    return;
                }
            }
            this.entities.zombies.forEach(zombie => {
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
    }

    getGameStateSnapshot() {
        return {
            players: Array.from(this.entities.players.values()).map(p => ({
                id: p.id,
                x: p.x,
                y: p.y,
                name: p.name,
                health: p.health,
                maxHealth: p.maxHealth, // v1.5
                kills: p.kills,
                shootX: p.input.shootX, 
                shootY: p.input.shootY,
                isPending: p.isPendingSpawn,
                isDead: p.isDead 
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
            zombieCore: this.entities.zombieCore ? this.entities.zombieCore.getSnapshot() : null,
            score: this.score,
            wave: this.wave
        };
    }

    handlePlayerInput(id, input) {
        const player = this.entities.players.get(id);
        if (player && player.health > 0 && !player.isPendingSpawn) {
            player.input = input;
        }
    }

    removePlayer(id) {
        this.entities.players.delete(id);
    }

    isGameOver() {
        const activePlayers = Array.from(this.entities.players.values())
                                .filter(p => !p.isPendingSpawn);
        if (activePlayers.length === 0) {
            return this.wave > 0;
        }
        const livingActivePlayers = activePlayers.filter(p => p.health > 0);
        return livingActivePlayers.length === 0;
    }

    getFinalScore() {
        return { finalScore: this.score, finalWave: this.wave };
    }
}

module.exports = GameLogic;