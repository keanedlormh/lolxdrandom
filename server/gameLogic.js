/**
 * server/gameLogic.js - ACTUALIZADO
 * - GameLogic ahora genera un 'playerCostMap' (flow field) cada 500ms.
 * - ServerZombie.updateAI se ha reescrito COMPLETAMENTE.
 * - Los zombies ya no calculan rutas A*.
 * - Los zombies ahora leen el 'playerCostMap' y simplemente se mueven
 * hacia la celda vecina con el coste más bajo (más cercana al jugador).
 * - Eliminadas las propiedades 'path', 'stuckTimer', etc. del zombie.
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
        
        // ¡No más propiedades de pathfinding!
        // El movimiento se gestiona por el costMap
        this.directions = [
            { x: 0, y: -1 },  // Arriba
            { x: 1, y: 0 },   // Derecha
            { x: 0, y: 1 },   // Abajo
            { x: -1, y: 0 }   // Izquierda
        ];
    }


    /**
     * IA REDISEÑADA: Sigue el Flow Field (playerCostMap)
     * @param {Map} players - Mapa de jugadores (para atacar)
     * @param {Array} costMap - El mapa 2D de costes generado por el Pathfinder
     * @param {ServerMapGenerator} mapGenerator - Para helpers de coordenadas
     * @param {number} deltaTime - Tiempo desde el último frame
     */
    updateAI(players, costMap, mapGenerator, deltaTime) {
        if (players.size === 0 || !costMap) return;

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

        if (!target) return;

        // 2. Lógica de Ataque (si está lo suficientemente cerca)
        const distance = Math.sqrt(minDistanceSq);
        if (distance <= this.radius + target.radius + 10) {
            const currentTime = Date.now();
            if (currentTime - this.lastAttackTime > this.attackCooldown) {
                target.health = Math.max(0, target.health - this.attackDamage);
                this.lastAttackTime = currentTime;
                // console.log(`[GAME] Jugador ${target.id} golpeado. Vida: ${target.health}`);
            }
            return; // No te muevas si estás atacando
        }

        // 3. Lógica de Movimiento (Seguir el CostMap)
        
        // Obtener la celda actual del zombie
        const currentGrid = mapGenerator.worldToGrid(this.x, this.y);
        if (!mapGenerator.isValid(currentGrid.x, currentGrid.y)) {
             // El zombie está atascado o fuera del mapa, no hacer nada
            return;
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

        // 4. Moverse hacia el mejor vecino
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
                const moveX = (moveDx / moveDist) * this.speed;
                const moveY = (moveDy / moveDist) * this.speed;

                this.x += moveX;
                this.y += moveY;
            }
        }
        // Si bestDir es (0,0), significa que estamos en un mínimo local o
        // ya en la celda del jugador. No nos movemos.
    }

    // Ya no se necesita calculatePath()
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
        
        // Inicializar pathfinder (ahora es un generador de CostMap)
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

        // Propiedades del nuevo Pathfinding
        this.playerCostMap = null; // El mapa de flujos
        this.pathfindUpdateTimer = 0;
        this.pathfindUpdateInterval = 500; // Recalcular el mapa cada 500ms

        // Inicializar jugadores
        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });


        // Inicializar enemigos
        this.spawnZombies(config.initialZombies);

        // Generar el primer mapa de costes
        this.updatePlayerCostMap();
    }

    /**
     * NUEVO: Genera el mapa de costes (flow field) para los zombies.
     * Se basa en el jugador vivo más cercano al centro del mapa.
     */
    updatePlayerCostMap() {
        // Encontrar un jugador vivo como objetivo
        let targetPlayer = null;
        for (const player of this.entities.players.values()) {
            if (player.health > 0) {
                targetPlayer = player;
                break; // Usar al primer jugador vivo
            }
        }

        if (targetPlayer) {
            const gridPos = this.map.worldToGrid(targetPlayer.x, targetPlayer.y);
            this.playerCostMap = this.pathfinder.generatePlayerCostMap(gridPos);
        } else {
            // No hay jugadores vivos, no hay mapa
            this.playerCostMap = null;
        }
    }


    /**
     * Comprueba colisión de entidad con el mapa
     */
    checkMapCollision(entity) {
        // Esta función es simple y rápida, la mantenemos
        const gridPos = this.map.worldToGrid(entity.x, entity.y);
        if (!this.map.isValid(gridPos.x, gridPos.y)) {
            return true;
        }
        
        // Comprobación simple de radio (menos precisa pero rápida)
        const radiusCheck = (offset) => {
            const checkGrid = this.map.worldToGrid(entity.x + offset, entity.y + offset);
            return !this.map.isValid(checkGrid.x, checkGrid.y);
        };

        if (radiusCheck(entity.radius) || radiusCheck(-entity.radius)) {
            return true;
        }

        return false;
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
     * MODIFICADO: Ahora comprueba si la nueva pos es válida
     */
    resolveEntityCollision(entityA, entityB) {
        const dx = entityB.x - entityA.x;
        const dy = entityB.y - entityA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = entityA.radius + entityB.radius;
        
        if (distance < minDistance && distance > 0) {
            const overlap = (minDistance - distance) * 0.5;
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Posiciones propuestas
            const newAx = entityA.x - nx * overlap;
            const newAy = entityA.y - ny * overlap;
            const newBx = entityB.x + nx * overlap;
            const newBy = entityB.y + ny * overlap;

            // Comprobar validez ANTES de mover
            const aGrid = this.map.worldToGrid(newAx, newAy);
            if (this.map.isValid(aGrid.x, aGrid.y)) {
                entityA.x = newAx;
                entityA.y = newAy;
            }

            const bGrid = this.map.worldToGrid(newBx, newBy);
            if (this.map.isValid(bGrid.x, bGrid.y)) {
                entityB.x = newBx;
                entityB.y = newBy;
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


        // 3. Actualizar Zombies con la nueva IA
        this.entities.zombies.forEach(zombie => {
            const oldX = zombie.x;
            const oldY = zombie.y;

            // Pasar el costMap generado
            zombie.updateAI(this.entities.players, this.playerCostMap, this.map, deltaTime);
            
            // Colisión con mapa
            if (this.checkMapCollision(zombie)) {
                zombie.x = oldX;
                zombie.y = oldY;
            }
        });

        // NOTA: Colisión Zombie-Zombie eliminada (como pediste)


        // 4. Actualizar Balas
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