// Dónde se guarda el respaldo de la codificación en curso (logica.js arma y
// lee el contenido; esto solo lo guarda).
//
// IndexedDB y no localStorage: Chromium baja localStorage al disco por
// tandas, cada unos segundos. Probado matando la app en medio de una
// captura: al volver, localStorage tenía el respaldo de la captura
// ANTERIOR y no el de la que se cortó. Una transacción de IndexedDB con
// durability 'strict' termina (oncomplete) recién cuando el dato está
// escrito, así que sobrevive a que maten el proceso o se corte la luz.
// localStorage queda de plan B si IndexedDB no abre.

import { CLAVE_RESPALDO } from './logica.js';

const BASE = 'tv-captura';
const ALMACEN = 'respaldo';
const CLAVE = 'actual';

let conexion = null;
function abrir() {
    if (!conexion) {
        conexion = new Promise((res, rej) => {
            const r = indexedDB.open(BASE, 1);
            r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        }).catch(err => { conexion = null; throw err; });
    }
    return conexion;
}

async function transaccion(modo, fn) {
    const db = await abrir();
    return new Promise((res, rej) => {
        const t = db.transaction(ALMACEN, modo, { durability: 'strict' });
        const pedido = fn(t.objectStore(ALMACEN));
        t.oncomplete = () => res(pedido ? pedido.result : undefined);
        t.onerror = t.onabort = () => rej(t.error);
    });
}

export async function guardarRespaldo(texto) {
    try { await transaccion('readwrite', st => st.put(texto, CLAVE)); }
    catch (_) { try { localStorage.setItem(CLAVE_RESPALDO, texto); } catch (__) {} }
}

export async function leerRespaldoGuardado() {
    try {
        const v = await transaccion('readonly', st => st.get(CLAVE));
        if (v) return v;
    } catch (_) {}
    try { return localStorage.getItem(CLAVE_RESPALDO); } catch (_) { return null; }
}

export async function borrarRespaldo() {
    try { await transaccion('readwrite', st => st.delete(CLAVE)); } catch (_) {}
    try { localStorage.removeItem(CLAVE_RESPALDO); } catch (_) {}
}
