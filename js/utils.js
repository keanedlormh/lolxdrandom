/**
 * client/js/utils.js
 * Contiene clases auxiliares para el cliente, como el joystick virtual
 * y la estructura de datos Node (para el A* si se implementa en cliente,
 * aunque la lógica principal de A* corre en el servidor).
 */

// --- 1. CLASE VIRTUAL JOYSTICK ---

export class VirtualJoystick {
    constructor(elementId, knobId) {
        this.base = document.getElementById(elementId);
        this.knob = document.getElementById(knobId);
        
        // Coordenadas del centro de la base
        this.centerX = this.base.offsetWidth / 2;
        this.centerY = this.base.offsetHeight / 2;
        
        // El radio máximo de movimiento para el 'knob'
        this.maxRadius = this.centerX - (this.knob.offsetWidth / 2);
        
        // Vector de salida (se actualiza en handleMove)
        this.vector = { x: 0, y: 0 }; 
        
        // Estado táctil y ID del toque activo
        this.activeTouchId = null;
        this.isDragging = false;
        
        // Vincular manejadores de eventos
        this.base.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        this.base.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        this.base.addEventListener('touchend', this.handleEnd.bind(this));
        
        // Inicializar el knob en el centro
        this.resetKnob();
    }
    
    // Reposiciona el knob en el centro y reinicia el vector
    resetKnob() {
        this.knob.style.transform = `translate(-50%, -50%)`;
        this.vector = { x: 0, y: 0 };
    }

    // Encuentra el objeto Touch con el ID correcto
    getTouch(e) {
        if (this.activeTouchId === null) return null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.activeTouchId) {
                return e.changedTouches[i];
            }
        }
        return null;
    }

    handleStart(e) {
        // Prevenir el comportamiento por defecto del navegador (scroll, zoom)
        e.preventDefault(); 
        
        if (this.isDragging) return; // Ya estamos arrastrando
        
        const rect = this.base.getBoundingClientRect();
        
        // Identificamos el primer toque que cae sobre nuestra base
        const touch = e.changedTouches[0]; 

        // Verificamos si el toque está dentro de la base del joystick
        if (
            touch.clientX >= rect.left && 
            touch.clientX <= rect.right && 
            touch.clientY >= rect.top && 
            touch.clientY <= rect.bottom
        ) {
            this.isDragging = true;
            this.activeTouchId = touch.identifier;
        }
    }

    handleMove(e) {
        e.preventDefault(); 
        
        if (!this.isDragging) return;
        
        const touch = this.getTouch(e);
        if (!touch) return;
        
        const rect = this.base.getBoundingClientRect();
        
        // Calcular la posición del toque relativa al centro de la base
        const inputX = touch.clientX - (rect.left + this.centerX);
        const inputY = touch.clientY - (rect.top + this.centerY);
        
        const distance = Math.sqrt(inputX * inputX + inputY * inputY);
        
        let finalX, finalY;
        
        if (distance > this.maxRadius) {
            // Limitar el movimiento del knob al borde de la base
            const angle = Math.atan2(inputY, inputX);
            finalX = Math.cos(angle) * this.maxRadius;
            finalY = Math.sin(angle) * this.maxRadius;
            
            // Vector normalizado (longitud = 1)
            this.vector = { 
                x: finalX / this.maxRadius, 
                y: finalY / this.maxRadius 
            };
        } else {
            // Si está dentro, el vector es la posición sin normalizar
            finalX = inputX;
            finalY = inputY;
            
            // Vector (no normalizado, pero la longitud será <= 1)
            this.vector = { 
                x: inputX / this.maxRadius, 
                y: inputY / this.maxRadius 
            };
        }
        
        // Mover el knob (se le suma +50% al translate para centrarlo)
        this.knob.style.transform = `translate(calc(-50% + ${finalX}px), calc(-50% + ${finalY}px))`;
    }

    handleEnd(e) {
        const touch = this.getTouch(e);
        if (!touch) return;

        this.isDragging = false;
        this.activeTouchId = null;
        this.resetKnob();
    }
    
    // Método clave que usa game.js para obtener el input
    getVector() {
        return this.vector;
    }
}

// --- 2. CLASE NODE (Para Pathfinding del Cliente, si se requiere) ---

// Aunque el A* se ejecuta en el servidor (gameLogic.js), mantenemos la clase
// Node en el cliente si en un futuro se necesita un Pathfinding visual.

export class Node {
    constructor(x, y, g = 0, h = 0, parent = null) {
        this.x = x; this.y = y; this.g = g; this.h = h;
        this.f = g + h; 
        this.parent = parent;
    }
}
