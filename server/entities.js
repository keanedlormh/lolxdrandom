/**
 * server/entities.js (v1.7 - NUEVO)
 * - Define todas las clases (plantillas) de las entidades del servidor.
 * - Estas clases son importadas por gameLogic.js.
 * - (v1.5) ServerPlayer incluye maxHealth.
 * - (v1.5) ServerBullet spawnea en el centro (x, y).
 * - (v1.5) ServerZombieCore usa config.coreHealthMultiplier.
 */

// --- 1. ENTIDAD BASE ---
class ServerEntity {
    constructor(id, x, y, radius, speed) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
    }
}

// --- 2. BALA ---
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

// --- 3. JUGADOR ---
class ServerPlayer extends ServerEntity {
    constructor(id, x, y, name, config) {
        super(id, x, y, 15, config.playerSpeed);
        this.name = name;
        this.maxHealth = config.playerHealth; // v1.5
        this.health = config.playerHealth;
        this.kills = 0;
        this.input = { moveX: 0, moveY: 0, shootX: 1, shootY: 0, isShooting: false };
        this.lastShotTime = 0;
        this.isDead = false;
        this.shootCooldown = config.shootCooldown;
        this.isPendingSpawn = false; 
    }
}

// --- 4. ZOMBI ---
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

// --- 5. NÚCLEO ZOMBI ---
class ServerZombieCore {
    constructor(id, x, y, wave, config) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.config = config;
        this.wave = wave;
        this.size = 40;
        this.radius = 20; 
        this.currentPhase = 'phase1';
        this.phase1ZombiesSpawned = 0;

        this.phase1ZombieAmount = Math.floor(config.initialZombies * Math.pow(config.waveMultiplier, wave - 1));
        this.spawnRatePhase2 = Math.max(1000, config.coreBaseSpawnRate * Math.pow(0.9, wave - 1));
        this.spawnRatePhase1 = Math.max(250, this.spawnRatePhase2 / config.coreBurstSpawnMultiplier);

        this.currentSpawnRate = this.spawnRatePhase1;
        this.spawnTimer = this.currentSpawnRate; 

        // v1.5: Usar el multiplicador de vida del núcleo
        this.maxHealth = Math.floor(config.coreBaseHealth * Math.pow(config.coreHealthMultiplier, wave - 1));
        this.health = this.maxHealth;

        console.log(`[CORE OLEADA ${wave}] Fase 1: ${this.phase1ZombieAmount} zombies @ ${this.spawnRatePhase1.toFixed(0)}ms. Fase 2: Ritmo de ${this.spawnRatePhase2.toFixed(0)}ms. Vida: ${this.maxHealth}`);
    }

    update(deltaTime) {
        this.spawnTimer -= deltaTime;
        if (this.spawnTimer <= 0) {
            this.spawnTimer += this.currentSpawnRate;
            if (this.currentPhase === 'phase1') {
                this.phase1ZombiesSpawned++;
                if (this.phase1ZombiesSpawned >= this.phase1ZombieAmount) {
                    this.currentPhase = 'phase2';
                    this.currentSpawnRate = this.spawnRatePhase2;
                    this.spawnTimer = this.currentSpawnRate;
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

// Exportar todas las clases
module.exports = {
    ServerEntity,
    ServerBullet,
    ServerPlayer,
    ServerZombie,
    ServerZombieCore
};