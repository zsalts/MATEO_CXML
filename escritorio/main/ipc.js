// Registro de handlers IPC y validacion de argumentos.
//
// Por que un envoltorio: cuando un ipcMain.handle tira un error, la pagina
// recibe "Error invoking remote method 'x': Error: ..." y pierde cualquier
// propiedad extra (como necesitaLogin). Aca el error se devuelve como dato
// {__tvError} y preload.js lo vuelve a tirar limpio, con sus propiedades.

function manejar(ipcMain, canal, fn) {
    ipcMain.removeHandler(canal);
    ipcMain.handle(canal, async (evento, ...args) => {
        try {
            return await fn(...args);
        } catch (err) {
            const e = err || {};
            const extra = {};
            Object.keys(e).forEach(k => {
                const v = e[k];
                if (['string', 'number', 'boolean'].includes(typeof v)) extra[k] = v;
            });
            if (!e.necesitaLogin) console.warn(`[${canal}]`, e.message || e);
            return { __tvError: { message: String(e.message || e), ...extra } };
        }
    });
}

// ── Validacion ──
// La pagina es nuestra, pero lo que manda se revisa igual: un error de
// programacion en una pantalla no puede terminar en una ruta rara o en SQL
// con basura.

function falla(msg) { throw new Error(msg); }

function texto(v, nombre, { opcional = false, max = 2000 } = {}) {
    if (v === undefined || v === null || v === '') {
        if (opcional) return null;
        falla(`Falta ${nombre}`);
    }
    if (typeof v !== 'string') falla(`${nombre} tiene que ser texto`);
    if (v.length > max) falla(`${nombre} es demasiado largo`);
    return v;
}

function numero(v, nombre, { opcional = false, min = -Infinity, max = Infinity } = {}) {
    if (v === undefined || v === null || v === '') {
        if (opcional) return null;
        falla(`Falta ${nombre}`);
    }
    const n = Number(v);
    if (!isFinite(n) || n < min || n > max) falla(`${nombre} no es un numero valido`);
    return n;
}

function id(v, nombre = 'id') {
    const n = numero(v, nombre, { min: 1 });
    if (!Number.isInteger(n)) falla(`${nombre} no es valido`);
    return n;
}

function objeto(v, nombre, { opcional = false } = {}) {
    if (v === undefined || v === null) {
        if (opcional) return {};
        falla(`Falta ${nombre}`);
    }
    if (typeof v !== 'object' || Array.isArray(v)) falla(`${nombre} tiene que ser un objeto`);
    return v;
}

function lista(v, nombre, { opcional = false, max = 100000 } = {}) {
    if (v === undefined || v === null) {
        if (opcional) return [];
        falla(`Falta ${nombre}`);
    }
    if (!Array.isArray(v)) falla(`${nombre} tiene que ser una lista`);
    if (v.length > max) falla(`${nombre} tiene demasiados elementos`);
    return v;
}

module.exports = { manejar, v: { texto, numero, id, objeto, lista, falla } };
