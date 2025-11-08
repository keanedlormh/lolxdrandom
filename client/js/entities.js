/**
 * client/js/entities.js (v1.6 - Refactorizado)
 * - Convertido a Módulo de JS (ESM).
 * - Clases ahora se exportan en lugar de asignarse a `window`.
 * - (v1.5) Barra de vida del jugador corregida para usar `this.maxHealth`.
 */

// --- 1. ENTIDAD BASE PARA JUGADORES Y ZOMBIES ---

export class Entity {
    constructor(id, x, y, radius, color) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;

        // Propiedades para interpolación
        this.prevX = x; 
        this.prevY = y;
        this.targetX = x;
        this.targetY = y;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- 2. JUGADOR ---

export class Player extends Entity {
    constructor(id, x, y, isMe, name = "Jugador") {
        const radius = 15;
        const color = isMe ? '#2596be' : '#477be3'; 
        super(id, x, y, radius, color);

        this.isMe = isMe;
        this.name = name;
        this.health = 100;
        this.maxHealth = 100; // v1.5: Inicializar (será sobreescrito)
        this.kills = 0;
        this.shootX = 1; 
        this.shootY = 0;
    }

    draw(ctx) {
        super.draw(ctx);

        const worldX = this.x;
        const worldY = this.y;

        if (this.isMe) {
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const startX = worldX + this.shootX * this.radius;
            const startY = worldY + this.shootY * this.radius;
            const endX = worldX + this.shootX * (this.radius + 15);
            const endY = worldY + this.shootY * (this.radius + 15);
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.fillStyle = this.isMe ? '#00FFFF' : '#FFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, worldX, worldY - this.radius - 12);

        // v1.5: Barra de salud CORREGIDA
        const barWidth = this.radius * 2;
        const barHeight = 4;
        const healthRatio = (this.maxHealth > 0) ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;
        const barY = worldY + this.radius + 8;

        ctx.fillStyle = '#555';
        ctx.fillRect(worldX - this.radius, barY, barWidth, barHeight);

        ctx.fillStyle = healthRatio > 0.4 ? '#4CAF50' : (healthRatio > 0.15 ? '#FFC107' : '#F44336');
        ctx.fillRect(worldX - this.radius, barY, barWidth * healthRatio, barHeight);
    }
}

// --- 3. ZOMBIE ---

export class Zombie extends Entity {
    constructor(id, x, y, maxHealth) {
        const radius = 14;
        const color = '#38761d';
        super(id, x, y, radius, color);
        this.maxHealth = maxHealth;
        this.health = maxHealth;
    }

    draw(ctx) {
        super.draw(ctx);

        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Z', this.x, this.y + 4);

        const barWidth = 20; 
        const barHeight = 3;
        const healthRatio = this.health / this.maxHealth;
        const barY = this.y - this.radius - 8; 

        ctx.fillStyle = '#222';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);

        if (healthRatio > 0) {
            ctx.fillStyle = '#FF4500';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthRatio, barHeight);
        }
    }
}

// --- 4. BALA ---

export class Bullet extends Entity {
    constructor(id, x, y) {
        const radius = 4;
        const color = '#ffeb3b';
        super(id, x, y, radius, color);
    }
}

// --- 5. NÚCLEO ZOMBIE ---

export class ZombieCore {
    constructor(id, x, y, size, health, maxHealth) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.size = size;
        this.health = health;
        this.maxHealth = maxHealth;
        this.color = '#4A044E';
        this.borderColor = '#FF00FF';
    }

    draw(ctx) {
        const halfSize = this.size / 2;
        const worldX = this.x;
        const worldY = this.y;

        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 3;
        ctx.fillRect(worldX - halfSize, worldY - halfSize, this.size, this.size);
        ctx.strokeRect(worldX - halfSize, worldY - halfSize, this.size, this.size);

        const barWidth = this.size * 1.5;
        const barHeight = 8;
        const healthRatio = this.health / this.maxHealth;
        const barY = worldY - halfSize - 15;

        ctx.fillStyle = '#555';
        ctx.fillRect(worldX - barWidth / 2, barY, barWidth, barHeight);

        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(worldX - barWidth / 2, barY, barWidth * healthRatio, barHeight);

        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(worldX - barWidth / 2, barY, barWidth, barHeight);
    }
}

// --- 6. GENERADOR DE MAPAS (CLIENTE) ---

export class MapRenderer {
    constructor(mapArray, cellSize = 40) {
        this.map = mapArray; 
        this.size = mapArray.length;
        this.cellSize = cellSize; 
        this.mapWorldSize = this.size * this.cellSize;
    }

    draw(ctx, cameraX, cameraY) {
        if (this.map.length === 0) return;

        const canvasWidth = ctx.canvas.width; // No usa SCALE aquí
        const canvasHeight = ctx.canvas.height;

        const startX = Math.max(0, Math.floor(cameraX / this.cellSize));
        const startY = Math.max(0, Math.floor(cameraY / this.cellSize));
        const endX = Math.min(this.size, Math.ceil((cameraX + canvasWidth) / this.cellSize));
        const endY = Math.min(this.size, Math.ceil((cameraY + canvasHeight) / this.cellSize));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const worldX = x * this.cellSize;
                const worldY = y * this.cellSize;

                ctx.fillStyle = '#1a1a1a'; 
                ctx.fillRect(worldX, worldY, this.cellSize, this.cellSize);

                if (this.map[y][x] === 1) {
                    ctx.fillStyle = '#444'; 
                    ctx.fillRect(worldX, worldY, this.cellSize, this.cellSize);
                }
            }
        }
    }
}