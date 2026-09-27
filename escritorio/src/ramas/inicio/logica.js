// Lógica pura del menú principal: sin DOM ni window.tv, se prueba con
// node --test (escritorio/test/menu.test.js).

import { aFecha } from '../../ui/util.js';

// Los últimos n partidos, del más nuevo al más viejo. Los que no tienen
// fecha legible van al final (no pueden tapar a uno de ayer).
export function recientes(partidos, n = 8) {
    const t = p => { const d = aFecha(p && p.creado); return d ? d.getTime() : -Infinity; };
    return [...(partidos || [])]
        .sort((a, b) => t(b) - t(a) || (Number(b.id) || 0) - (Number(a.id) || 0))
        .slice(0, n);
}

// La primera vez no hay nada: ni plantillas ni partidos. Ahí el menú
// muestra los tres pasos en vez de listas vacías.
export function esPrimeraVez(plantillas, partidos) {
    return !(plantillas && plantillas.length) && !(partidos && partidos.length);
}

// Ícono y texto de cada origen de partido.
const ORIGENES = {
    'captura':        { icono: 'camara',   texto: 'Captura en vivo' },
    'ipad-vivo':      { icono: 'ipad',     texto: 'Captura desde iPad' },
    'ipad-importado': { icono: 'ipad',     texto: 'Importado del iPad' },
    'importado':      { icono: 'importar', texto: 'Importado' }
};
export function origenDe(origen) {
    return ORIGENES[origen] || { icono: 'video', texto: origen || 'Partido' };
}

export function saludo(hora = new Date().getHours()) {
    if (hora >= 5 && hora < 13) return 'Buen día';
    if (hora >= 13 && hora < 20) return 'Buenas tardes';
    return 'Buenas noches';
}

// "Norte vs Sur", "Norte", o nada.
export function rivales(p) {
    const l = (p && p.local || '').trim(), v = (p && p.visitante || '').trim();
    return l && v ? `${l} vs ${v}` : (l || v);
}

// importarNube puede decir "hace falta login" de tres maneras según cómo
// cruce el IPC de Electron: rechazando con {necesitaLogin}, con un Error
// cuyo mensaje lo nombra (invoke pierde las propiedades del error), o
// resolviendo con {necesitaLogin: true}.
export function pideLogin(x) {
    if (!x) return false;
    if (x.necesitaLogin) return true;
    return /necesitaLogin/i.test(String(x.message || x));
}
