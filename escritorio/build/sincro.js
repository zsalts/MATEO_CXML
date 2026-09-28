// Sincronización de plantillas entre el iPad y la compu, por la nube.
//
// En la nube hay un solo archivo, plantillas.json, con todas las plantillas.
// Cada una tiene un uid que no cambia (el mismo en todos los dispositivos) y
// la fecha de su último cambio. Borrar deja una "lápida" (borrado: true) para
// que el borrado también viaje. Cada dispositivo baja el archivo, lo une con
// lo suyo con fusionar(), aplica lo que ganó afuera y sube si ganó algo suyo.
//
// Regla: por uid gana el cambio más nuevo. Empate de fecha con contenido
// distinto: gana la firma mayor, así los dos lados eligen lo mismo.
//
// Lo usan las dos apps y por eso vive acá, en la raíz: el iPad lo carga con
// <script> (window.SincroPlantillas) y la compu con require (build/preparar.js
// lo copia al armar). Puro: sin red, sin DOM, sin base. Tiene que correr en el
// Safari de un iPad con iOS 12: nada de ?? ni ?., ni Array.prototype.find
// sobre cosas raras.
(function (raiz) {
    'use strict';

    var ARCHIVO = 'plantillas.json';
    // Una lápida más vieja que esto se olvida: un dispositivo que estuvo tres
    // meses sin conectarse podría devolver una plantilla borrada, y está bien.
    var VIDA_LAPIDA = 90 * 24 * 60 * 60 * 1000;
    var FECHA_CERO = '1970-01-01T00:00:00.000Z';

    function nuevoUid() {
        return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function lista(v) { return Array.isArray(v) ? v : []; }

    // Deja un item con la forma de siempre. null si no sirve (sin uid).
    function limpiar(x) {
        if (!x || typeof x.uid !== 'string' || !x.uid) return null;
        var d = x.datos || {};
        return {
            uid: x.uid,
            nombre: x.nombre == null ? '' : String(x.nombre),
            datos: { elements: lista(d.elements), links: lista(d.links), hojas: lista(d.hojas) },
            actualizado: typeof x.actualizado === 'string' && x.actualizado ? x.actualizado : FECHA_CERO,
            borrado: !!x.borrado,
            nueva: !!x.nueva
        };
    }

    // Lo que se compara para saber si dos plantillas dicen lo mismo.
    function firma(x) {
        if (x.borrado) return 'borrada';
        return JSON.stringify([x.nombre, x.datos.elements, x.datos.links, x.datos.hojas]);
    }

    // ¿b le gana a a? El más nuevo; si empatan, la firma mayor.
    function gana(b, a) {
        if (b.actualizado !== a.actualizado) return b.actualizado > a.actualizado;
        return firma(b) > firma(a);
    }

    // locales, remotas: [{uid, nombre, datos, actualizado, borrado?, nueva?}]
    //   nueva = la local nunca se subió (su uid lo inventó este dispositivo).
    // Devuelve:
    //   plantillas  la lista unida, lista para subir (sin "nueva")
    //   poner       las que hay que escribir acá (llegaron o cambiaron afuera)
    //   borrar      uids que hay que borrar acá
    //   uids        {uidLocalViejo: uidNuevo} de las locales que resultaron ser
    //               la misma que una de la nube (primera vez: mismo nombre y
    //               mismos botones), para que cada lado guarde el uid común
    //   subir       true si la nube no tiene todo lo de acá
    function fusionar(locales, remotas, ahora) {
        var hoy = ahora == null ? Date.now() : ahora;
        var L = lista(locales).map(limpiar).filter(Boolean);
        var R = lista(remotas).map(limpiar).filter(Boolean);

        var remotaPorUid = {};
        R.forEach(function (r) { remotaPorUid[r.uid] = r; });

        // Primera vez: una local nueva igual a una de la nube (que no tenga ya
        // su pareja) es la misma plantilla y toma su uid. Así no se duplica
        // todo lo que ya estaba en los dos lados.
        var uids = {};
        var tomadas = {};
        L.forEach(function (l) { if (remotaPorUid[l.uid]) tomadas[l.uid] = true; });
        L.forEach(function (l) {
            if (!l.nueva || remotaPorUid[l.uid] || l.borrado) return;
            var f = firma(l);
            for (var i = 0; i < R.length; i++) {
                var r = R[i];
                if (!r.borrado && !tomadas[r.uid] && firma(r) === f) {
                    tomadas[r.uid] = true;
                    uids[l.uid] = r.uid;
                    l.uid = r.uid;
                    break;
                }
            }
        });

        // Unir: por uid, gana el más nuevo.
        var elegida = {};      // uid → item
        var deAca = {};        // uid → true si ganó el de este dispositivo
        var localPorUid = {};
        R.forEach(function (r) { elegida[r.uid] = r; });
        L.forEach(function (l) {
            localPorUid[l.uid] = l;
            var r = elegida[l.uid];
            if (!r || gana(l, r)) { elegida[l.uid] = l; deAca[l.uid] = true; }
        });

        var plantillas = [], poner = [], borrar = [], subir = false;
        Object.keys(elegida).forEach(function (uid) {
            var x = elegida[uid];
            // Lápidas viejas: se olvidan (y no hace falta avisar a nadie).
            if (x.borrado && hoy - Date.parse(x.actualizado) > VIDA_LAPIDA) {
                if (remotaPorUid[uid]) subir = true;
                return;
            }
            plantillas.push({ uid: x.uid, nombre: x.nombre, datos: x.datos, actualizado: x.actualizado, borrado: x.borrado || undefined });
            if (deAca[uid]) {
                var r = remotaPorUid[uid];
                if (!r || firma(r) !== firma(x) || r.actualizado !== x.actualizado) subir = true;
            } else {
                var l = localPorUid[uid];
                if (x.borrado) {
                    if (l && !l.borrado) borrar.push(uid);
                } else if (!l || l.borrado || firma(l) !== firma(x) || l.actualizado !== x.actualizado) {
                    poner.push(x);
                }
            }
        });
        // Siempre en el mismo orden: el archivo de la nube no cambia de un
        // lado a otro solo por cómo se armó.
        plantillas.sort(function (a, b) { return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0; });
        return { plantillas: plantillas, poner: poner, borrar: borrar, uids: uids, subir: subir };
    }

    // El archivo de la nube, como texto. Y al revés: lo que venga (vacío, roto,
    // de una versión vieja) da una lista, nunca un error.
    function armarArchivo(plantillas, dispositivo) {
        return JSON.stringify({
            app: 'tagview', kind: 'plantillas', version: 1,
            dispositivo: dispositivo || '', actualizado: new Date().toISOString(),
            plantillas: plantillas
        });
    }
    function leerArchivo(texto) {
        try {
            var d = typeof texto === 'string' ? JSON.parse(texto) : texto;
            return d && d.kind === 'plantillas' ? lista(d.plantillas) : [];
        } catch (e) { return []; }
    }

    var api = { ARCHIVO: ARCHIVO, nuevoUid: nuevoUid, fusionar: fusionar, armarArchivo: armarArchivo, leerArchivo: leerArchivo };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.SincroPlantillas = api;
})(typeof window !== 'undefined' ? window : this);
