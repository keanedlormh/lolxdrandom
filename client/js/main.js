/**
 * client/js/main.js (v1.6 - NUEVO)
 * - Punto de entrada principal (cargado por index.html).
 * - Importa los módulos de UI y del cliente de juego para iniciarlos.
 */

// Importar el gestor de UI.
// Esto ejecutará el código de uiManager.js, 
// cargando la configuración y mostrando el menú inicial.
import './uiManager.js';

// Importar el cliente de juego.
// Esto ejecutará el código de gameClient.js,
// configurando el canvas y los listeners de input.
import './gameClient.js';

console.log("[MAIN] Cliente v1.6 (Refactorizado) inicializado.");