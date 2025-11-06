/**
 * server/gameLogic.js - ACTUALIZADO
 * - AÑADIDO: `this.lastWaveZombieCount` para rastrear los zombies de la oleada anterior.
 * - MODIFICADO: La "Lógica de Oleadas" en `update()` ahora usa el
 * `waveMultiplier` (1.1-2.0) como un porcentaje de aumento
 * sobre `lastWaveZombieCount`, garantizando Mín. 1 zombie extra.
 */


const ServerMapGenerator = require('./serverMapGenerator'); 
const Pathfinder = require('./pathfinding');


// ... (Clases ServerEntity, ServerBullet, ServerPlayer, ServerZombie sin cambios) ...
// (Omitidas por brevedad)
class ServerEntity {
    constructor(id, x, y, radius, speed) { this.id = id; this.x = x; this.y = y; this.radius = radius; this.speed = speed; }
}
class ServerBullet extends ServerEntity {
    constructor(id, x, y, dx, dy, speed, damage) { super(id, x, y, 4, speed); this.dx = dx; this.dy = dy; this.damage = damage; this.ownerId = id.split('_')[1]; }
    updatePosition() { this.x += this.dx * this.speed; this.y += this.dy * this.speed; }
}
class ServerPlayer extends ServerEntity {
    constructor(id, x, y, name, config) { super(id, x, y, 15, config.playerSpeed); this.name = name; this.maxHealth = config.playerHealth; this.health = config.playerHealth; this.kills = 0; this.input = { moveX: 0, moveY: 0, shootX: 1, shootY: 0, isShooting: false }; this.lastShotTime = 0; this.isDead = false; this.shootCooldown = config.shootCooldown; }
}
class ServerZombie extends ServerEntity {
    constructor(id, x, y, config) { super(id, x, y, 14, config.zombieSpeed); this.maxHealth = config.zombieHealth; this.health = config.zombieHealth; this.lastAttackTime = 0; this.attackDamage = config.zombieAttack; this.attackCooldown = config.zombieAttackCooldown; this.directions = [ { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 } ]; }
    updateAI(players, costMap, mapGenerator, deltaTime) { if (players.size === 0 || !costMap) return null; let target = null; let minDistanceSq = Infinity; players.forEach(player => { if (player.health > 0) { const dx = player.x - this.x; const dy = player.y - this.y; const distSq = dx * dx + dy * dy; if (distSq < minDistanceSq) { minDistanceSq = distSq; target = player; } } }); if (!target) return null; const distance = Math.sqrt(minDistanceSq); if (distance <= this.radius + target.radius + 10) { const currentTime = Date.now(); if (currentTime - this.lastAttackTime > this.attackCooldown) { target.health = Math.max(0, target.health - this.attackDamage); this.lastAttackTime = currentTime; } return null; } const currentGrid = mapGenerator.worldToGrid(this.x, this.y); if (!mapGenerator.isValid(currentGrid.x, currentGrid.y)) { return null; } let bestCost = costMap[currentGrid.y][currentGrid.x]; let bestDir = { dx: 0, dy: 0 }; for (const dir of this.directions) { const newX = currentGrid.x + dir.x; const newY = currentGrid.y + dir.y; if (mapGenerator.isValid(newX, newY)) { const newCost = costMap[newY][newX]; if (newCost < bestCost) { bestCost = newCost; bestDir = { dx: dir.x, dy: dir.y }; } } } if (bestDir.dx !== 0 || bestDir.dy !== 0) { const targetCellX = currentGrid.x + bestDir.dx; const targetCellY = currentGrid.y + bestDir.dy; const targetWorldPos = mapGenerator.gridToWorld(targetCellX, targetCellY); const moveDx = targetWorldPos.x - this.x; const moveDy = targetWorldPos.y - this.y; const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy); if (moveDist > 0) { return { dx: (moveDx / moveDist) * this.speed, dy: (moveDy / moveDist) * this.speed }; } } return null; }
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


        // --- v1.2: AÑADIDO ---
        // Rastrea cuántos zombies hubo en la última oleada
        this.lastWaveZombieCount = config.initialZombies;
        // --- FIN AÑADIDO v1.2 ---


        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });


        // Spawn inicial basado en la configuración
        this.spawnZombies(this.lastWaveZombieCount);
        this.updatePlayerCostMap();
    }


    /**
     * (Función de pathfinding multijugador v1.2, sin cambios)
     */
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


    /**
     * (Funciones checkMapCollision y checkEntityCollision sin cambios)
     */
    checkMapCollision(entity) {
        const radius = entity.radius;
        const checkPoints = [ { x: entity.x, y: entity.y }, { x: entity.x + radius, y: entity.y }, { x: entity.x - radius, y: entity.y }, { x: entity.x, y: entity.y + radius }, { x: entity.x, y: entity.y - radius } ];
        for (const p of checkPoints) { const gridPos = this.map.worldToGrid(p.x, p.y); if (!this.map.isValid(gridPos.x, gridPos.y)) { return true; } }
        return false; 
    }
    checkEntityCollision(entityA, entityB) {
        const dx = entityB.x - entityA.x; const dy = entityB.y - entityA.y; const distance = Math.sqrt(dx * dx + dy * dy); const minDistance = entityA.radius + entityB.radius;
        return distance < minDistance;
    }


    /**
     * (Función de spawn seguro v1.2, sin cambios)
     */
    spawnZombies(count) {
        const playerPositions = Array.from(this.entities.players.values())
            .filter(p => p.health > 0)
            .map(p => ({ x: p.x, y: p.y }));


        for (let i = 0; i < count; i++) {
            const zombieId = `zombie_${Date.now()}_${i}`; 
            const randomSpawn = this.map.getRandomOpenCellPosition(playerPositions);


            if (randomSpawn) {
                this.entities.zombies.set(
                    zombieId, 
                    new ServerZombie(zombieId, randomSpawn.x, randomSpawn.y, this.config)
                );
            } else {
                console.warn(`[SPAWN] No se pudo encontrar un lugar seguro para el zombie ${i+1}/${count}`);
            }
        }
    }


    createBullet(playerId, x, y, dx, dy) {
        // ... (Sin cambios)
        const player = this.entities.players.get(playerId); if (!player || player.health <= 0) return; const currentTime = Date.now(); if (currentTime - player.lastShotTime < player.shootCooldown) { return; } player.lastShotTime = currentTime; const bulletId = `bullet_${playerId}_${currentTime}`; const startX = x + dx * (player.radius + 4); const startY = y + dy * (player.radius + 4); const newBullet = new ServerBullet( bulletId, startX, startY, dx, dy, this.config.bulletSpeed, this.config.bulletDamage ); this.entities.bullets.set(bulletId, newBullet);
    }


    update() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime; 
        this.lastUpdateTime = currentTime;


        // 1. Actualizar el mapa de costes
        this.pathfindUpdateTimer += deltaTime;
        if (this.pathfindUpdateTimer > this.pathfindUpdateInterval) {
            this.pathfindUpdateTimer = 0;
            this.updatePlayerCostMap();
        }


        // 2. Actualizar Jugadores
        // ... (Sin cambios)
        this.entities.players.forEach(player => { if (player.health <= 0) { player.isDead = true; return; } const oldX = player.x; const oldY = player.y; const moveX = player.input.moveX * player.speed; const moveY = player.input.moveY * player.speed; player.x += moveX; if (this.checkMapCollision(player)) { player.x = oldX; } player.y += moveY; if (this.checkMapCollision(player)) { player.y = oldY; } if (player.input.isShooting) { this.createBullet(player.id, player.x, player.y, player.input.shootX, player.input.shootY); } });


        // 3. Actualizar Zombies
        // ... (Sin cambios)
        this.entities.zombies.forEach(zombie => { const oldX = zombie.x; const oldY = zombie.y; const moveVector = zombie.updateAI(this.entities.players, this.playerCostMap, this.map, deltaTime); if (moveVector) { zombie.x += moveVector.dx; if (this.checkMapCollision(zombie)) { zombie.x = oldX; } zombie.y += moveVector.dy; if (this.checkMapCollision(zombie)) { zombie.y = oldY; } } });


        // 4. Actualizar Balas
        // ... (Sin cambios)
        const bulletsToRemove = []; const zombiesToRemove = []; this.entities.bullets.forEach(bullet => { bullet.updatePosition(); if (this.checkMapCollision(bullet)) { bulletsToRemove.push(bullet.id); return; } this.entities.zombies.forEach(zombie => { if (this.checkEntityCollision(bullet, zombie)) { zombie.health -= bullet.damage; bulletsToRemove.push(bullet.id); if (zombie.health <= 0) { zombiesToRemove.push(zombie.id); const player = this.entities.players.get(bullet.ownerId); if (player) { player.kills++; this.score += 10; } } } }); }); bulletsToRemove.forEach(id => this.entities.bullets.delete(id)); zombiesToRemove.forEach(id => this.entities.zombies.delete(id));


        // --- v1.2: LÓGICA DE OLEADAS MODIFICADA ---
        if (this.entities.zombies.size === 0) {
            this.wave++;
            this.score += 100 * this.wave;
            
            // 1. Obtener la base de la oleada anterior
            const baseCount = this.lastWaveZombieCount;
            // 2. Obtener el multiplicador (ej: 1.5 para 50%)
            const multiplier = this.config.waveMultiplier;
            // 3. Calcular el aumento (ej: 1.5 - 1.0 = 0.5)
            const increasePercentage = multiplier - 1;
            // 4. Calcular el número de zombies a añadir (ej: 10 * 0.5 = 5)
            const increaseAmount = baseCount * increasePercentage;


            // 5. El aumento es al menos 1 (redondeado)
            const increase = Math.max(1, Math.round(increaseAmount));


            // 6. Calcular el nuevo total y guardarlo
            const newZombieCount = baseCount + increase;
            this.lastWaveZombieCount = newZombieCount;


            this.spawnZombies(newZombieCount);
            console.log(`[SERVER] Iniciando oleada ${this.wave} con ${newZombieCount} zombies (Base: ${baseCount}, Aumento: ${increase})`);
        }
        // --- FIN MODIFICACIÓN v1.2 ---
    }


    getGameStateSnapshot() {
        // ... (Sin cambios)
        return { players: Array.from(this.entities.players.values()).map(p => ({ id: p.id, x: p.x, y: p.y, name: p.name, health: p.health, kills: p.kills, shootX: p.input.shootX, shootY: p.input.shootY })), zombies: Array.from(this.entities.zombies.values()).map(z => ({ id: z.id, x: z.x, y: z.y, health: z.health, maxHealth: z.maxHealth })), bullets: Array.from(this.entities.bullets.values()).map(b => ({ id: b.id, x: b.x, y: b.y })), score: this.score, wave: this.wave };
    }


    handlePlayerInput(id, input) {
        // ... (Sin cambios)
        const player = this.entities.players.get(id); if (player && player.health > 0) { player.input = input; }
    }


    removePlayer(id) {
        // ... (Sin cambios)
        this.entities.players.delete(id);
    }


    isGameOver() {
        // ... (Sin cambios)
        const activePlayers = Array.from(this.entities.players.values()).filter(p => p.health > 0); return activePlayers.length === 0 && this.entities.players.size > 0;
    }


    getFinalScore() {
        // ... (Sin cambios)
        return { finalScore: this.score, finalWave: this.wave };
    }
}


module.exports = GameLogic;