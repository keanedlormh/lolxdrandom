/**
 * client/js/entities.js
 * Contiene las clases de las entidades del cliente.
 * Su función principal es el DIBUJO (renderizado) de la posición y estado
 * que es determinado por el servidor. No tienen lógica de física local.
 */

// --- 1. ENTIDAD BASE PARA JUGADORES Y ZOMBIES ---

/**
 * Clase genérica para dibujar entidades circulares.
 */
class Entity {
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

    /**
     * Dibuja la entidad en el canvas.
     */
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- 2. JUGADOR ---

/**
 * Representa al jugador local o a un compañero.
 */
class Player extends Entity {
    constructor(id, x, y, isMe, name = "Jugador") {
        const radius = 15;
        // Colores más visibles y distintivos
        const color = isMe ? '#2596be' : '#e34747'; // Azul: local, Rojo oscuro: otros
        super(id, x, y, radius, color);

        this.isMe = isMe;
        this.name = name;
        this.health = 100;
        this.kills = 0;
        this.shootX = 1; // Dirección de puntería (por defecto a la derecha)
        this.shootY = 0;
    }

    /**
     * Dibuja el jugador, la barra de vida y el nombre, y el indicador de puntería.
     */
    draw(ctx) {
        // 1. DIBUJAR CUERPO
        super.draw(ctx);

        const worldX = this.x;
        const worldY = this.y;

        // 2. DIBUJAR INDICADOR DE PUNTERÍA (Solo si soy yo)
        if (this.isMe) {
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Inicia en el borde del jugador
            const startX = worldX + this.shootX * this.radius;
            const startY = worldY + this.shootY * this.radius;
            // Termina un poco más lejos
            const endX = worldX + this.shootX * (this.radius + 15);
            const endY = worldY + this.shootY * (this.radius + 15);

            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // 3. DIBUJAR NOMBRE
        ctx.fillStyle = this.isMe ? '#00FFFF' : '#FFF'; // Cyan para ti, Blanco para otros
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, worldX, worldY - this.radius - 12);

        // 4. DIBUJAR BARRA DE SALUD
        const barWidth = this.radius * 2; // 30px
        const barHeight = 4;
        const healthRatio = this.health / 100;
        const barY = worldY + this.radius + 8; // Posicionado debajo

        // Fondo de la barra
        ctx.fillStyle = '#555';
        ctx.fillRect(worldX - this.radius, barY, barWidth, barHeight);

        // Relleno de salud
        ctx.fillStyle = healthRatio > 0.4 ? '#4CAF50' : (healthRatio > 0.15 ? '#FFC107' : '#F44336');
        ctx.fillRect(worldX - this.radius, barY, barWidth * healthRatio, barHeight);
    }
}

// --- 3. ZOMBIE ---

/**
 * Representa a un enemigo.
 */
class Zombie extends Entity {
    constructor(id, x, y, maxHealth) {
        const radius = 14;
        const color = '#38761d'; // Verde oscuro
        super(id, x, y, radius, color);
        this.maxHealth = maxHealth;
        this.health = maxHealth;
    }

    draw(ctx) {
        // 1. DIBUJAR CUERPO
        super.draw(ctx);

        // Indicador central
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Z', this.x, this.y + 4);

        // 2. DIBUJAR BARRA DE SALUD DEL ZOMBI (Pequeña y roja)
        const barWidth = 20; 
        const barHeight = 3;
        const healthRatio = this.health / this.maxHealth;
        const barY = this.y - this.radius - 8; 

        // Fondo de la barra
        ctx.fillStyle = '#222';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);

        // Relleno de salud (si tiene más de 0)
        if (healthRatio > 0) {
            ctx.fillStyle = '#FF4500'; // Rojo-Naranja
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthRatio, barHeight);
        }
    }
}

// --- 4. BALA ---

/**
 * Representa una bala. 
 */
class Bullet extends Entity {
    constructor(id, x, y) {
        const radius = 4;
        const color = '#ffeb3b'; // Amarillo brillante
        super(id, x, y, radius, color);
    }
}

// --- 5. GENERADOR DE MAPAS (SOLO PARA DIBUJO EN CLIENTE) ---

/**
 * Clase para manejar el dibujo del entorno estático.
 */
class MapRenderer {
    constructor(mapArray, cellSize = 40) {
        this.map = mapArray; 
        this.size = mapArray.length;
        this.cellSize = cellSize; 
        this.mapWorldSize = this.size * this.cellSize;
    }

    /**
     * Dibuja el mapa completo.
     */
    draw(ctx, cameraX, cameraY) {
        if (this.map.length === 0) return;

        // Rango de celdas visibles para optimización
        const canvasWidth = ctx.canvas.width / window.SCALE;
        const canvasHeight = ctx.canvas.height / window.SCALE;

        const startX = Math.max(0, Math.floor(cameraX / this.cellSize));
        const startY = Math.max(0, Math.floor(cameraY / this.cellSize));
        const endX = Math.min(this.size, Math.ceil((cameraX + canvasWidth) / this.cellSize));
        const endY = Math.min(this.size, Math.ceil((cameraY + canvasHeight) / this.cellSize));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const worldX = x * this.cellSize;
                const worldY = y * this.cellSize;

                // Suelo 
                ctx.fillStyle = '#1a1a1a'; 
                ctx.fillRect(worldX, worldY, this.cellSize, this.cellSize);

                // Muros (1)
                if (this.map[y][x] === 1) {
                    ctx.fillStyle = '#444'; 
                    ctx.fillRect(worldX, worldY, this.cellSize, this.cellSize);
                }
            }
        }
    }
}

// Exportar clases para uso global (ya que no usamos módulos ES6)
window.Player = Player;
window.Zombie = Zombie;
window.Bullet = Bullet;
window.MapRenderer = MapRenderer;
window.SCALE = 1.0;