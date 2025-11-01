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
    }

    /**
     * Dibuja la entidad en el canvas, aplicando el desplazamiento de la cámara.
     * @param {CanvasRenderingContext2D} ctx - Contexto del canvas.
     * @param {number} offsetX - Desplazamiento horizontal de la cámara.
     * @param {number} offsetY - Desplazamiento vertical de la cámara.
     */
    draw(ctx, offsetX, offsetY) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        // Las coordenadas se transforman para que (this.x, this.y) sean coordenadas del mundo
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- 2. JUGADOR ---

export class Player extends Entity {
    constructor(id, x, y, isMe, name = "Jugador") {
        const radius = 15;
        // Asignar un color distinto basado en si es el jugador local o un oponente
        const color = isMe ? '#00ff00' : '#00aaff'; 
        super(id, x, y, radius, color);
        
        this.isMe = isMe;
        this.name = name;
        this.health = 100;
        this.kills = 0;
    }

    /**
     * Dibuja el jugador, la barra de vida y el nombre.
     */
    draw(ctx, offsetX, offsetY) {
        // Posición en pantalla
        const screenX = this.x - offsetX;
        const screenY = this.y - offsetY;

        // Dibujar el cuerpo del jugador (heredado de Entity)
        super.draw(ctx, offsetX, offsetY);

        // Dibujar el nombre
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, screenX, screenY - this.radius - 8);

        // Dibujar barra de salud (para compañeros)
        if (!this.isMe) {
            const barWidth = this.radius * 2;
            const barHeight = 4;
            const healthRatio = this.health / 100;

            // Fondo de la barra
            ctx.fillStyle = '#555';
            ctx.fillRect(screenX - this.radius, screenY + this.radius + 5, barWidth, barHeight);

            // Relleno de salud
            ctx.fillStyle = healthRatio > 0.3 ? '#0f0' : '#f00';
            ctx.fillRect(screenX - this.radius, screenY + this.radius + 5, barWidth * healthRatio, barHeight);
        }
    }
}

// --- 3. ZOMBIE ---

export class Zombie extends Entity {
    constructor(id, x, y) {
        const radius = 14;
        const color = '#ff0000';
        super(id, x, y, radius, color);
    }
    
    // Podemos añadir aquí lógica de dibujo específica para zombies (ej. animación, daño visual)
}

// --- 4. BALA ---

export class Bullet extends Entity {
    constructor(id, x, y) {
        const radius = 4;
        const color = '#ffff00';
        super(id, x, y, radius, color);
    }
}

// --- 5. GENERADOR DE MAPAS (SOLO PARA DIBUJO EN CLIENTE) ---

export class MapGenerator {
    constructor(mapArray) {
        // 'mapArray' es el array 2D [gy][gx] enviado por el servidor
        this.map = mapArray; 
        this.size = mapArray.length;
        this.cellSize = 40;
    }

    /**
     * Dibuja el mapa completo.
     * @param {number} offsetX - Desplazamiento de la cámara (mundo)
     * @param {number} offsetY - Desplazamiento de la cámara (mundo)
     */
    draw(ctx, offsetX, offsetY) {
        // Rango de celdas visibles para optimización del renderizado
        const startX = Math.max(0, Math.floor(offsetX / this.cellSize));
        const startY = Math.max(0, Math.floor(offsetY / this.cellSize));
        const endX = Math.min(this.size, Math.ceil((offsetX + ctx.canvas.width) / this.cellSize));
        const endY = Math.min(this.size, Math.ceil((offsetY + ctx.canvas.height) / this.cellSize));
        
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const worldX = x * this.cellSize;
                const worldY = y * this.cellSize;
                
                // Muros (1) vs Espacios Abiertos (0)
                if (this.map[y][x] === 1) {
                    ctx.fillStyle = '#444'; // Color del muro
                    ctx.fillRect(worldX - offsetX, worldY - offsetY, this.cellSize, this.cellSize);
                } else {
                    ctx.fillStyle = '#1a1a1a'; // Color del suelo (puede ser opcional si el canvas ya tiene fondo)
                    ctx.fillRect(worldX - offsetX, worldY - offsetY, this.cellSize, this.cellSize);
                }
            }
        }
    }

    /**
     * Dibuja el minimapa en un canvas separado.
     */
    drawMinimap(mapCtx, players, zombies, myPlayerId) {
        // El minimapa tiene un tamaño fijo de 150x150 (definido en index.html)
        const minimapSize = 150; 
        const cellDrawSize = minimapSize / this.size; 
        
        mapCtx.clearRect(0, 0, minimapSize, minimapSize);
        
        // 1. Dibujar el mapa (muros)
        mapCtx.fillStyle = '#222'; // Color base del suelo en el minimapa
        mapCtx.fillRect(0, 0, minimapSize, minimapSize);

        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.map[y][x] === 1) {
                    mapCtx.fillStyle = '#666'; // Muros
                    mapCtx.fillRect(x * cellDrawSize, y * cellDrawSize, cellDrawSize, cellDrawSize);
                }
            }
        }

        // 2. Dibujar entidades
        const mapWorldSize = this.size * this.cellSize;
        
        // ZOMBIES (Rojo)
        mapCtx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        zombies.forEach(z => {
            const mapX = (z.x / mapWorldSize) * minimapSize;
            const mapY = (z.y / mapWorldSize) * minimapSize;
            mapCtx.beginPath();
            mapCtx.arc(mapX, mapY, 2, 0, Math.PI * 2);
            mapCtx.fill();
        });

        // JUGADORES (Verde: local, Azul: otros)
        players.forEach(p => {
            const mapX = (p.x / mapWorldSize) * minimapSize;
            const mapY = (p.y / mapWorldSize) * minimapSize;
            
            mapCtx.fillStyle = (p.id === myPlayerId) ? '#0f0' : '#00f';
            mapCtx.beginPath();
            mapCtx.arc(mapX, mapY, 3, 0, Math.PI * 2);
            mapCtx.fill();
        });
    }
}
