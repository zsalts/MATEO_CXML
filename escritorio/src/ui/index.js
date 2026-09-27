// Todo lo compartido de la interfaz, en un solo lugar. Desde una rama:
//     import { crearIcono, escapar, formatoTiempo, elegirPlantilla, estadoGlobal } from '../../ui/index.js';
// ctx.ui (aviso, confirmar, pedirTexto, modal) son estas mismas funciones.

export { escapar, formatoTiempo, fechaCorta, aFecha, plural, normalizar } from './util.js';
export { crearIcono, iconoHTML, nombresDeIconos } from './iconos.js';
export { estadoGlobal } from './estado.js';
export { aviso, confirmar, pedirTexto, modal, hayModalAbierto } from './dialogos.js';
export { esMac, ponerPlataforma, teclaMod, sumaSeleccion, esZoomRueda, textoAtajo, textoMostrarEnCarpeta, nombreExplorador, letraDeTecla, alSoltarTodo } from './plataforma.js';
export { panelPermiso, panelAyudaRed } from './permisos.js';
export { elegirPlantilla, capturarCon, miniaturaSVG, resumenPlantilla, resumenImportacion, datosDePlantilla } from './plantillas.js';
