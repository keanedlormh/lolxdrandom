/**
 * client/js/utils.js
 * Contiene funciones de utilidad que pueden ser usadas en todo el código del cliente.
 */

/**
 * Interpolación Lineal (Lerp) para suavizar el movimiento de la red.
 *
 * NOTA: Esta función se añadió al archivo game.js para simplificar el uso
 * y evitar problemas de carga de módulos en un proyecto simple basado en script tags.
 * Sin embargo, si se estuviera usando módulos ES6 o CommonJS en el cliente,
 * este sería el lugar ideal para definirla.
 *
 * Para la arquitectura actual del proyecto (scripts simples), se recomienda
 * dejarla en game.js, pero si insistes en separarla:
 *
 * @param {number} start - Valor inicial.
 * @param {number} end - Valor final (objetivo).
 * @param {number} amount - Cantidad de interpolación (0.0 a 1.0).
 * @returns {number} El valor interpolado.
 */
function lerp(start, end, amount) {
    // La fórmula del Lerp es: start + (end - start) * amount
    return start + (end - start) * amount;
}

// En una arquitectura moderna (módulos ES6):
// export { lerp };

// Dado que este es un proyecto simple basado en etiquetas <script>,
// la función `lerp` debe ser accesible globalmente si otros archivos la necesitan.
// En este caso, el `game.js` la contiene, pero si `index.html` carga este
// archivo antes que `game.js`, `game.js` podría usarla:
// (No se requiere `module.exports` aquí ya que estamos en el cliente/navegador)
