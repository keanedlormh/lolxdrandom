/**
 * server/gameLogic.js - ACTUALIZADO v1.3 (Paso 2: El Núcleo)
 *
 * ¡CAMBIO DE LÓGICA DE JUEGO!
 * 1. Nueva entidad: ServerZombieCore.
 * 2. Constructor: Ya no spawnea zombies, llama a `spawnNewCore()` para
 * iniciar la oleada 1.
 * 3. Lógica de Oleadas: Una oleada termina cuando `zombieCore` es nulo
 * Y `zombies.size` es 0.
 * 4. spawnNewCore(): Calcula la vida/ritmo del núcleo y lo coloca
 * en un lugar seguro del mapa.
 * 5. update(): Ahora gestiona el temporizador de spawn del núcleo
 * y llama a `spawnZombieAtCore()` a un ritmo fijo.
 * 6. Lógica de Balas: Ahora comprueban la colisión con el núcleo PRIMERO.
 * Si el núcleo es destruido, `this.entities.zombieCore` se pone a `null`.
 * 7. getGameStateSnapshot(): Ahora incluye la información del núcleo.
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


        // 2. Lógica de Ataque
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


        // 4. Calcular el vector de movimiento
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
 * v1.3: NUEVA CLASE PARA EL NÚCLEO
 * Almacena el estado del nexo/spawner.
 * Se trata como una entidad circular en el servidor
 * para simplificar las colisiones.
 */
class ServerZombieCore {
    constructor(id, x, y, wave, config) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.config = config;
        this.wave = wave;


        // v1.3: El tamaño es 1 celda (40x40). El radio es la mitad.
        this.size = 40;
        this.radius = 20; 


        // v1.3: Calcular vida y ritmo de spawn basado en la oleada
        // Vida: Aumenta un 40% por oleada (compuesto)
        this.maxHealth = Math.floor(config.coreBaseHealth * Math.pow(1.4, wave - 1));
        this.health = this.maxHealth;


        // Ritmo: Se reduce un 10% por oleada (compuesto), con un mín. de 1 seg.
        this.spawnRate = Math.max(1000, config.coreBaseSpawnRate * Math.pow(0.9, wave - 1));
        this.spawnTimer = this.spawnRate; // Tiempo para el próximo spawn
    }


    /**
     * v1.3: Devuelve los datos que el cliente necesita
     */
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
            zombieCore: null // v1.3: El núcleo se gestiona aquí
        };


        this.score = 0;
        this.wave = 0; // v1.3: Empezar en 0, spawnNewCore() la pondrá en 1
        this.running = true;
        this.lastUpdateTime = Date.now();


        this.playerCostMap = null; 
        this.pathfindUpdateTimer = 0;
        this.pathfindUpdateInterval = 500; 


        const spawn = this.map.getSpawnPoint();
        playerData.forEach(p => {
            this.entities.players.set(p.id, new ServerPlayer(p.id, spawn.x, spawn.y, p.name, config));
        });


        // v1.3: Iniciar la primera oleada creando el primer núcleo
        this.spawnNewCore(); 
        this.updatePlayerCostMap();
    }


    /**
     * v1.3: NUEVA FUNCIÓN PARA INICIAR OLEADAS
     * Se llama al inicio y cada vez que se completa una oleada.
     */
    spawnNewCore() {
        this.wave++; // Incrementar oleada
        
        // 1. Obtener posiciones de jugadores para spawn seguro
        const playerPositions = Array.from(this.entities.players.values())
            .filter(p => p.health > 0)
            .map(p => ({ x: p.x, y: p.y }));


        // 2. Pedir al mapa un spawn lejos de los jugadores (mín 20 celdas)
        // v1.3: Nota: `getRandomOpenCellPosition` fue modificado en v1.2
        const spawnPos = this.map.getRandomOpenCellPosition(playerPositions, 20);


        if (!spawnPos) {
            console.error("[ERROR] No se pudo encontrar un spawn seguro para el Núcleo. Usando spawn por defecto.");
            spawnPos = this.map.getSpawnPoint();
        }


        // 3. Crear la nueva entidad Núcleo
        const coreId = `core_${this.wave}`;
        this.entities.zombieCore = new ServerZombieCore(coreId, spawnPos.x, spawnPos.y, this.wave, this.config);


        console.log(`[SERVER] Iniciando oleada ${this.wave}. Núcleo spawneado en (${spawnPos.x.toFixed(0)}, ${spawnPos.y.toFixed(0)}).`);
        console.log(`[SERVER] Vida: ${this.entities.zombieCore.maxHealth}, Ritmo: ${this.entities.zombieCore.spawnRate}ms`);


        // 4. Forzar una actualización del pathfinding
        this.pathfindUpdateTimer = this.pathfindUpdateInterval;
    }


    /**
     * v1.3: NUEVA FUNCIÓN PARA SPAWNEAR 1 ZOMBIE
     * Spawnea un zombie cerca del núcleo.
     */
    spawnZombieAtCore() {
        if (!this.entities.zombieCore) return;


        const core = this.entities.zombieCore;
        const gridPos = this.map.worldToGrid(core.x, core.y);


        // v1.3: `findValidSpawnNear` debe ser añadido a serverMapGenerator.js
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


    /**
     * v1.2: Pathfinding multijugador
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
     * v1.1: Colisión de 5 puntos
     */
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


    /**
     * Colisión Círculo-Círculo
     */
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


        // 2. Actualizar Jugadores (Colisión deslizante)
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


        // 3. Actualizar Zombies (Colisión deslizante)
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


        // --- v1.3: LÓGICA DEL NÚCLEO Y OLEADAS ---
        if (this.entities.zombieCore) {
            // AÚN HAY NÚCLEO: Spawnear zombies
            const core = this.entities.zombieCore;
            core.spawnTimer -= deltaTime;
            
            if (core.spawnTimer <= 0) {
                core.spawnTimer += core.spawnRate; // Resetear (contabilizando exceso)
                this.spawnZombieAtCore();
            }
        } else {
            // NO HAY NÚCLEO: Comprobar si la oleada ha terminado
            if (this.entities.zombies.size === 0) {
                // ¡Oleada terminada! (Núcleo muerto Y zombies muertos)
                this.score += 100 * this.wave; // Bonus de oleada
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
                return; // Bala golpea muro
            }


            // v1.3: Comprobar colisión con el Núcleo PRIMERO
            if (this.entities.zombieCore) {
                const core = this.entities.zombieCore;
                // Usamos la colisión de círculo-círculo
                if (this.checkEntityCollision(bullet, core)) {
                    bulletsToRemove.push(bullet.id);
                    core.health -= bullet.damage;
                    
                    if (core.health <= 0) {
                        this.entities.zombieCore = null; // ¡Núcleo destruido!
                        this.score += 500 * this.wave; // Bonus por destruir
                        const player = this.entities.players.get(bullet.ownerId);
                        if (player) {
                            player.kills++; // Dar el "kill" del núcleo
                        }
                    }
                    return; // Bala consumida por el núcleo
                }
            }


            // Si no golpea el núcleo, comprobar zombies
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


    /**
     * v1.3: MODIFICADO
     * Añadido el estado del núcleo al snapshot.
     */
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
            // v1.3: Enviar datos del núcleo (o null si no existe)
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