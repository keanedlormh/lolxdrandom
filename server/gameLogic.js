/**
 * server/gameLogic.js - ACTUALIZADO v1.3 (Paso 3: Lógica de 2 Fases)
 *
 * 1. Nueva clase: ServerZombieCore.
 * - Ahora contiene la lógica de 2 fases.
 * - `currentPhase`: 'phase1' o 'phase2'.
 * - `phase1ZombieAmount`: Cantidad de zombies para la Fase 1 (escalada).
 * - `phase1ZombiesSpawned`: Contador.
 * - `spawnRatePhase1`, `spawnRatePhase2`: Ritmos de aparición calculados.
 * - `currentSpawnRate`: El ritmo que se está usando ahora.
 * 2. Constructor: Llama a `spawnNewCore()` (igual que en Paso 2).
 * 3. update():
 * - La lógica de spawn del núcleo ha sido movida a la clase Core.
 * - El bucle principal ahora solo comprueba el timer del núcleo.
 * - La clase Core cambia de fase internamente.
 * 4. Lógica de Balas: (Igual que en Paso 2) Golpea al núcleo.
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


        this.directions = [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
        ];
    }


    updateAI(players, costMap, mapGenerator, deltaTime) {
        if (players.size === 0 || !costMap) return null;


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


        const distance = Math.sqrt(minDistanceSq);
        if (distance <= this.radius + target.radius + 10) {
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
            }
            return null;
        }


        const currentGrid = mapGenerator.worldToGrid(this.x, this.y);
        if (!mapGenerator.isValid(currentGrid.x, currentGrid.y)) {
            return null;
        }


        let bestCost = costMap[currentGrid.y][currentGrid.x];
        let bestDir = { dx: 0, dy: 0 };


        for (const dir of this.directions) {
            const newX = currentGrid.x + dir.x;
            const newY = currentGrid.y + dir.y;


            if (mapGenerator.isValid(newX, newY)) {
                const newCost = costMap[newY][newX];
                if (newCost < bestCost) {
                    bestCost = newCost;
                    bestDir = { dx: dir.x, dy: dir.y };
                }
            }
        }


        if (bestDir.dx !== 0 || bestDir.dy !== 0) {
            const targetCellX = currentGrid.x + bestDir.dx;
            const targetCellY = currentGrid.y + bestDir.dy;
            const targetWorldPos = mapGenerator.gridToWorld(targetCellX, targetCellY);


            const moveDx = targetWorldPos.x - this.x;
            const moveDy = targetWorldPos.y - this.y;
            const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);


            if (moveDist > 0) {
                return {
                    dx: (moveDx / moveDist) * this.speed,
                    dy: (moveDy / moveDist) * this.speed
                };
            }
        }
        return null;
    }
}


/**
 * v1.3: CLASE DE NÚCLEO MODIFICADA (LÓGICA DE 2 FASES)
 */
class ServerZombieCore {
    constructor(id, x, y, wave, config) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.config = config;
        this.wave = wave;


        this.size = 40;
        this.radius = 20; 


        // Lógica de 2 Fases
        this.currentPhase = 'phase1';
        this.phase1ZombiesSpawned = 0;


        // 1. Calcular Cantidad Fase 1
        // Usa "initialZombies" como base y "waveMultiplier" como escalado
        this.phase1ZombieAmount = Math.floor(config.initialZombies * Math.pow(config.waveMultiplier, wave - 1));


        // 2. Calcular Ritmo Fase 2 (Lento)
        // Usa "coreBaseSpawnRate" y escala 10% más rápido por oleada
        this.spawnRatePhase2 = Math.max(1000, config.coreBaseSpawnRate * Math.pow(0.9, wave - 1));


        // 3. Calcular Ritmo Fase 1 (Rápido)
        // Usa "coreBurstSpawnMultiplier" sobre el ritmo de la Fase 2
        this.spawnRatePhase1 = Math.max(250, this.spawnRatePhase2 / config.coreBurstSpawnMultiplier); // Mín 250ms


        // 4. Establecer estado inicial
        this.currentSpawnRate = this.spawnRatePhase1;
        this.spawnTimer = this.currentSpawnRate; // Tiempo para el primer spawn


        // Vida del Núcleo
        this.maxHealth = Math.floor(config.coreBaseHealth * Math.pow(1.4, wave - 1));
        this.health = this.maxHealth;
        
        console.log(`[CORE OLEADA ${wave}] Fase 1: ${this.phase1ZombieAmount} zombies @ ${this.spawnRatePhase1.toFixed(0)}ms. Fase 2: Ritmo de ${this.spawnRatePhase2.toFixed(0)}ms. Vida: ${this.maxHealth}`);
    }


    /**
     * v1.3: Nueva función de actualización del Núcleo
     * Se llama desde GameLogic.update()
     * @returns {boolean} - Devuelve 'true' si debe spawnear un zombie.
     */
    update(deltaTime) {
        this.spawnTimer -= deltaTime;
        
        if (this.spawnTimer <= 0) {
            this.spawnTimer += this.currentSpawnRate; // Añadir la duración (contabiliza exceso)
            
            // Lógica de cambio de fase (si aplica)
            if (this.currentPhase === 'phase1') {
                this.phase1ZombiesSpawned++;
                
                if (this.phase1ZombiesSpawned >= this.phase1ZombieAmount) {
                    // CAMBIAR A FASE 2
                    this.currentPhase = 'phase2';
                    this.currentSpawnRate = this.spawnRatePhase2;
                    this.spawnTimer = this.currentSpawnRate; // Resetear timer para la nueva fase
                    console.log(`[CORE OLEADA ${this.wave}] Fase 1 completada. Iniciando Fase 2 (Ritmo: ${this.currentSpawnRate.toFixed(0)}ms).`);
                }
            }
            
            return true; // ¡Spawnear!
        }
        return false; // No spawnear
    }


    getSnapshot() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            size: this.size,
            health: this.health,
            maxHealth: this.maxHealth
        };
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
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });


        this.spawnNewCore(); 
        this.updatePlayerCostMap();
    }


    spawnNewCore() {
        this.wave++;
        
        const playerPositions = Array.from(this.entities.players.values())
            .filter(p => p.health > 0)
            .map(p => ({ x: p.x, y: p.y }));


        const spawnPos = this.map.getRandomOpenCellPosition(playerPositions, 20);


        if (!spawnPos) {
            console.error("[ERROR] No se pudo encontrar un spawn seguro para el Núcleo. Usando spawn por defecto.");
            spawnPos = this.map.getSpawnPoint();
        }


        const coreId = `core_${this.wave}`;
        // v1.3: La nueva clase Core contiene toda la lógica de oleada
        this.entities.zombieCore = new ServerZombieCore(coreId, spawnPos.x, spawnPos.y, this.wave, this.config);


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


        // 2. Actualizar Jugadores
        this.entities.players.forEach(player => {
            if (player.health <= 0) {
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


        // --- v1.3: LÓGICA DEL NÚCLEO Y OLEADAS (MODIFICADA) ---
        if (this.entities.zombieCore) {
            // AÚN HAY NÚCLEO: Actualizarlo
            const core = this.entities.zombieCore;
            const shouldSpawn = core.update(deltaTime); // El núcleo gestiona su propio timer y fases
            
            if (shouldSpawn) {
                this.spawnZombieAtCore();
            }
        } else {
            // NO HAY NÚCLEO: Comprobar si la oleada ha terminado
            if (this.entities.zombies.size === 0) {
                // ¡Oleada terminada!
                this.score += 100 * this.wave;
                this.spawnNewCore(); // Iniciar siguiente oleada
            }
        }
        // --- FIN LÓGICA v1.3 ---


        // 4. Actualizar Balas
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
            zombieCore: this.entities.zombieCore ? this.entities.zombieCore.getSnapshot() : null,
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