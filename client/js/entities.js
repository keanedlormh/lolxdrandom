/**
 * client/js/entities.js
 * Contiene las clases de las entidades del cliente.
 * Su función principal es el DIBUJO (renderizado) de la posición y estado
 * que es determinado por el servidor. No tienen lógica de física local.
 *
 * NOTA CRÍTICA: Se eliminó el "export" ya que este archivo no está
 * siendo cargado como un módulo ES6 en index.html, sino como un script clásico.
 * Las clases se definen como variables globales (window.Player, window.Zombie, etc.)
 * para que client/js/game.js pueda usarlas.
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

        // Propiedades para interpolación (aunque la interpolación se maneja en game.js)
        this.prevX = x; 
        this.prevY = y;
        this.targetX = x;
        this.targetY = y;
    }

    /**
     * Dibuja la entidad en el canvas, asumiendo que el contexto (ctx)
     * ya ha sido transformado para la cámara.
     * * NOTA: En la implementación de game.js, el ctx ya está traducido,
     * por lo que draw no necesita los offsets.
     * @param {CanvasRenderingContext2D} ctx - Contexto del canvas.
     */
    draw(ctx) {
        // Coordenadas ya son del mundo, dibujadas dentro del contexto transformado.
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
    }

    /**
     * Dibuja el jugador, la barra de vida y el nombre.
     * Se asume que el contexto (ctx) ya ha sido transformado por la cámara.
     */
    draw(ctx) {
        // 1. DIBUJAR CUERPO (llamada al método del padre)
        super.draw(ctx);

        // Posición del mundo (ya transformada por ctx.translate en game.js)
        const worldX = this.x;
        const worldY = this.y;

        // 2. DIBUJAR NOMBRE
        ctx.fillStyle = this.isMe ? '#00FFFF' : '#FFF'; // Cyan para ti, Blanco para otros
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        // Texto sobre el jugador
        ctx.fillText(this.name, worldX, worldY - this.radius - 12);

        // 3. DIBUJAR BARRA DE SALUD
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
    constructor(id, x, y) {
        const radius = 14;
        const color = '#38761d'; // Verde oscuro
        super(id, x, y, radius, color);
    }
    
    draw(ctx) {
        super.draw(ctx);
        
        // Indicador central para zombi
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Z', this.x, this.y + 4);
    }
}

// --- 4. BALA ---

/**
 * Representa una bala. Se mantiene la implementación simple para evitar problemas de interpolación
 * en objetos de alta velocidad.
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
        this.cellSize = cellSize; // Se asegura de usar el valor correcto, por defecto 40
        this.mapWorldSize = this.size * this.cellSize;
    }

    /**
     * Dibuja el mapa completo.
     * NOTA: Esta función fue eliminada de game.js y traída aquí. 
     * No necesita offset ya que game.js maneja la traducción de la cámara.
     * @param {CanvasRenderingContext2D} ctx - Contexto del canvas (ya transformado).
     * @param {number} cameraX - Posición x de la cámara (mundo)
     * @param {number} cameraY - Posición y de la cámara (mundo)
     */
    draw(ctx, cameraX, cameraY) {
        if (this.map.length === 0) return;

        // Rango de celdas visibles para optimización del renderizado.
        // Se usa la posición de la cámara (world coordinates) para calcular el rango.
        const startX = Math.max(0, Math.floor(cameraX / this.cellSize));
        const startY = Math.max(0, Math.floor(cameraY / this.cellSize));
        const endX = Math.min(this.size, Math.ceil((cameraX + ctx.canvas.width) / this.cellSize));
        const endY = Math.min(this.size, Math.ceil((cameraY + ctx.canvas.height) / this.cellSize));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const worldX = x * this.cellSize;
                const worldY = y * this.cellSize;

                // Suelo (Dibujado para tener textura, aunque el fondo sea gris)
                // Usamos fillRect en coordenadas del mundo.
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