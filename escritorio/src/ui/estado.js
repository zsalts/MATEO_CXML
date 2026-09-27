// Estado que no es de ninguna rama y que la carcasa tiene que mostrar.
// Hoy: 'grabando' ({desde, rama?} | null) para el ● REC de la barra
// superior, y 'tema' ('oscuro' | 'claro') para que Ajustes cambie el tema
// sin importar app.js.
//
// Es un objeto chico a propósito: no es un store de la app. Cada rama
// guarda lo suyo; acá va solo lo que otra parte de la pantalla necesita ver.

export function crearEstado() {
    const valores = new Map();
    const oyentes = new Set();

    return {
        poner(clave, valor) {
            const anterior = valores.has(clave) ? valores.get(clave) : null;
            if (valor === undefined) valor = null;
            if (valor === null) valores.delete(clave); else valores.set(clave, valor);
            if (anterior === valor) return;
            // Un oyente que tira error no puede dejar sin aviso a los demás:
            // si la barra superior falla, la captura tiene que seguir enterándose.
            for (const cb of [...oyentes]) {
                try { cb(clave, valor, anterior); }
                catch (err) { console.error('estadoGlobal: oyente de', clave, err); }
            }
        },
        leer(clave) {
            return valores.has(clave) ? valores.get(clave) : null;
        },
        // cb(clave, valor, anterior). Devuelve la función para dejar de escuchar.
        alCambiar(cb) {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        }
    };
}

// El único que usa la app. Las pruebas usan crearEstado() para arrancar limpias.
export const estadoGlobal = crearEstado();
