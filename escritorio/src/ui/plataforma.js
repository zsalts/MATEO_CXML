// Diferencias de teclado y mouse entre Mac y Windows. Puro: cada funcion
// acepta la plataforma ('mac' | 'win') como ultimo parametro, asi se prueba
// con node --test (escritorio/test/mac-teclado.test.js). Sin parametro, usa
// la que puso el router con ponerPlataforma().
//
// Regla: donde Windows usa Ctrl, Mac usa ⌘. Nunca Ctrl en Mac: Ctrl+clic es
// clic derecho y Ctrl+flechas cambia de Escritorio.

// `let` exportado: los import ven el valor nuevo cuando el router lo cambia
// (el modulo se importa antes de que tv.sys.info() conteste).
export let esMac = false;

// La llama el router al arrancar, con tv.sys.info().plataforma. Tambien pone
// data-plataforma en <html>: todo el CSS de Mac cuelga de ahi.
export function ponerPlataforma(plataformaSistema) {
    esMac = plataformaSistema === 'darwin' || plataformaSistema === 'mac';
    try { document.documentElement.dataset.plataforma = esMac ? 'mac' : 'win'; } catch (_) { /* sin DOM: pruebas */ }
    return esMac;
}

function esMacEn(plat) {
    return plat ? plat === 'mac' || plat === 'darwin' : esMac;
}

// ¿Esta apretada la tecla "de comando"? (⌘ en Mac, Ctrl en Windows)
export function teclaMod(evento, plat) {
    if (!evento) return false;
    return esMacEn(plat) ? !!evento.metaKey : !!evento.ctrlKey;
}

// Clic para sumar a la seleccion (la de Shift, rango, es igual en las dos).
export function sumaSeleccion(evento, plat) {
    return teclaMod(evento, plat);
}

// Rueda que hace zoom. El pellizco del trackpad llega como `wheel` con
// ctrlKey = true aunque nadie toque Ctrl: en Mac vale ⌘+rueda y pellizco;
// en Windows, Ctrl+rueda (que tambien es el pellizco del touchpad).
export function esZoomRueda(evento, plat) {
    if (!evento) return false;
    return esMacEn(plat) ? !!(evento.metaKey || evento.ctrlKey) : !!evento.ctrlKey;
}

// 'Mod+K' → '⌘K' en Mac, 'Ctrl+K' en Windows. Tambien Shift, Alt y Ctrl
// (Ctrl literal, para cuando de verdad es Ctrl en las dos).
const SIMBOLOS_MAC = { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃', enter: '↩', esc: 'Esc', backspace: '⌫', supr: '⌦', delete: '⌦' };
const NOMBRES_WIN = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl', enter: 'Enter', esc: 'Esc', backspace: 'Retroceso', supr: 'Supr', delete: 'Supr' };

export function textoAtajo(atajo, plat) {
    const partes = String(atajo || '').split('+').map(s => s.trim()).filter(Boolean);
    if (esMacEn(plat)) {
        // En Mac los modificadores van pegados y en este orden: ⌃⌥⇧⌘.
        const orden = ['ctrl', 'alt', 'shift', 'mod'];
        const mods = partes.filter(p => orden.includes(p.toLowerCase()))
            .sort((a, b) => orden.indexOf(a.toLowerCase()) - orden.indexOf(b.toLowerCase()))
            .map(p => SIMBOLOS_MAC[p.toLowerCase()]);
        const resto = partes.filter(p => !orden.includes(p.toLowerCase()))
            .map(p => SIMBOLOS_MAC[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p));
        return mods.join('') + resto.join('');
    }
    return partes.map(p => NOMBRES_WIN[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p)).join('+');
}

// "Mostrar en Finder" / "Mostrar en el Explorador".
export function textoMostrarEnCarpeta(plat) {
    return esMacEn(plat) ? 'Mostrar en Finder' : 'Mostrar en el Explorador';
}

// Nombre del administrador de archivos, para frases armadas.
export function nombreExplorador(plat) {
    return esMacEn(plat) ? 'el Finder' : 'el Explorador';
}

// Letra de un atajo de la plantilla a partir de la tecla apretada. En Mac,
// ⌥+Q escribe "œ": si hay ⌥, se usa la tecla fisica (e.code "KeyQ").
export function letraDeTecla(evento) {
    if (!evento) return '';
    if (evento.altKey && /^Key[A-Z]$/.test(evento.code || '')) return evento.code.slice(3).toLowerCase();
    if (evento.altKey && /^Digit\d$/.test(evento.code || '')) return evento.code.slice(5);
    return String(evento.key || '').toLowerCase();
}

// Mientras ⌘ esta apretada, macOS NO manda keyup de las otras teclas. Si una
// pantalla mantiene eventos abiertos mientras se sostiene una tecla, este
// vigilante avisa cuando hay que soltar todo: al soltar ⌘ y al perder el foco.
// Devuelve quitar().
export function alSoltarTodo(cb, destino = typeof window !== 'undefined' ? window : null) {
    if (!destino) return () => {};
    const alTeclaArriba = e => { if (e.key === 'Meta') cb('meta'); };
    const alPerderFoco = () => cb('blur');
    destino.addEventListener('keyup', alTeclaArriba, true);
    destino.addEventListener('blur', alPerderFoco);
    return () => {
        destino.removeEventListener('keyup', alTeclaArriba, true);
        destino.removeEventListener('blur', alPerderFoco);
    };
}
