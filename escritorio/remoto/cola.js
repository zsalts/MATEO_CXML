// Cola de toques del iPad: ninguno se pierde si se corta el wifi.
//
// Cada accion recibe un n creciente (por iPad, nunca vuelve para atras,
// tampoco al recargar la pagina) y queda guardada — en memoria y en
// localStorage — hasta que la compu contesta {ack, n}. Al reconectar se
// reenvia todo lo pendiente, en orden. La compu aplica cada n una sola vez:
// si un ack se perdio en el corte y el toque se reenvia, lo confirma sin
// aplicarlo de nuevo. Resultado: ni perdidos ni duplicados.
//
// El momento del toque (en reloj de la compu) se calcula al tocar, no al
// mandar: la cola guarda la hora local del iPad y la pasa a hora de la compu
// con el desfase que se conozca. Si se toco antes del primer ping, se
// completa despues; el desfase entre dos relojes no cambia en minutos.
//
// Puro: el almacen (localStorage) y el reloj se inyectan; lo prueba
// node --test.

export function crearCola({ almacen = null, clave = 'tv-remoto-cola', reloj = null, ahora = () => Date.now() } = {}) {
    let datos = { ultimoN: 0, sesion: null, items: [] };

    try {
        const g = almacen && JSON.parse(almacen.getItem(clave) || 'null');
        if (g && Array.isArray(g.items) && Number.isInteger(g.ultimoN)) datos = g;
    } catch (_) { /* almacen roto o bloqueado: se sigue solo en memoria */ }

    function guardar() {
        try { if (almacen) almacen.setItem(clave, JSON.stringify(datos)); } catch (_) { /* lleno o privado */ }
    }

    function completarMomentos() {
        if (!reloj || !reloj.listo()) return;
        for (const it of datos.items) {
            if (it.accion.momento == null && 'tLocal' in it) it.accion.momento = reloj.aServidor(it.tLocal);
        }
    }

    return {
        // Devuelve el mensaje listo para mandar ({tipo:'accion', n, accion}).
        agregar(accion, { conMomento = true } = {}) {
            const n = ++datos.ultimoN;
            const it = { n, accion: { ...accion } };
            if (conMomento) {
                it.tLocal = ahora();
                it.accion.momento = reloj && reloj.listo() ? reloj.aServidor(it.tLocal) : null;
            }
            datos.items.push(it);
            guardar();
            return { tipo: 'accion', n, accion: it.accion };
        },

        // Todo lo que falta confirmar, en orden, listo para mandar. Los que
        // todavia no tienen momento (no hubo ningun pong) se retienen: mandar
        // un toque sin hora lo haria caer donde llega, que es justo lo que no
        // queremos.
        pendientes() {
            completarMomentos();
            guardar();
            const out = [];
            for (const it of datos.items) {
                if ('tLocal' in it && it.accion.momento == null) break;   // respeta el orden
                out.push({ tipo: 'accion', n: it.n, accion: it.accion });
            }
            return out;
        },

        // La compu aplica en orden y guarda el n mas alto: todo lo <= n ya
        // entro (o no va a entrar nunca), asi que se puede soltar.
        confirmar(n) {
            const antes = datos.items.length;
            datos.items = datos.items.filter(it => it.n > n);
            if (datos.items.length !== antes) guardar();
        },

        // Cada vez que la compu arranca un servidor nuevo cambia la sesion.
        // Lo que quedo en la cola de una sesion vieja era de otro partido: se
        // descarta en vez de meterlo en este.
        sesion(id) {
            if (datos.sesion !== id) {
                datos.sesion = id;
                datos.items = [];
                guardar();
                return true;
            }
            return false;
        },

        cantidad() { return datos.items.length; },
        ultimoN() { return datos.ultimoN; }
    };
}
