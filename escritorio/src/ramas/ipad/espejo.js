// Estado resumido que la compu le manda al iPad para pintar la botonera.
//
// El motor (src/nucleo/codificacion.js) tiene un estado grande: eventos,
// abiertos, mapa de tramos, posesion… Al iPad solo le hace falta saber como
// se ve cada boton. Esto lo traduce a un formato fijo, el que entiende
// remoto/app.js:
//
//   { tipo:'estado', enCurso, corriendo, reloj, rec, hoja,
//     marcas:  { id: 'activo'|'fijo'|'abierto' },
//     textos:  { id: texto },                        (contadores)
//     emergentes: { id, lista:[{id, nombre, elementoId?, indice?}] } | null,
//     ultimo:  { nombre, inicio } | null,
//     eventos: n }
//
// Puro: lo prueba node --test.

import { elemento, elementosDeHoja } from '../../nucleo/plantilla.js';

export function resumir(est, { datos = null, enCurso = true, rec = false } = {}) {
    est = est || {};
    const marcas = {};
    const abiertos = est.abiertos || [];

    // Manuales grabando (y los jugadores de una linea en cancha).
    for (const ev of abiertos) if (ev.buttonId != null) marcas[String(ev.buttonId)] = 'activo';
    // Una linea se ve encendida si alguno de sus jugadores esta adentro.
    if (datos) {
        const adentro = new Set(abiertos.map(ev => String(ev.buttonId)));
        for (const l of (datos.elements || []).filter(e => e.type === 'line')) {
            if ((l.lineMemberIds || []).some(id => adentro.has(String(id)))) marcas[String(l.id)] = 'activo';
        }
    }
    for (const id of est.fijas || []) marcas[String(id)] = 'fijo';
    for (const id of Object.keys(est.posesion || {})) marcas[String(id)] = 'activo';

    // Pestaña de detalle: el evento que la abrio, y lo ya elegido adentro.
    let hoja = null;
    const d = est.detalle;
    if (d) {
        hoja = d.hojaId ?? null;
        if (d.botonId != null) marcas[String(d.botonId)] = 'abierto';
        if (datos && hoja && (d.elegidas || []).length) {
            for (const e of elementosDeHoja(datos, hoja)) if (d.elegidas.includes(e.name)) marcas[String(e.id)] = 'activo';
        }
    }

    // Contadores: solo los botones "contador" muestran el numero; un evento
    // no cambia su texto por cuantas veces se marco.
    const textos = {};
    for (const [id, n] of Object.entries(est.contadores || {})) {
        const e = datos ? elemento(datos, id) : null;
        if (!datos || (e && e.type === 'counter')) textos[String(id)] = String(n);
    }

    let emergentes = null;
    const em = est.emergentes;
    if (em && em.lista && em.lista.length) {
        emergentes = {
            id: em.botonId ?? null,
            lista: em.lista.map(o => {
                const x = { id: String(o.id), nombre: o.nombre };
                if (o.elementoId != null) x.elementoId = o.elementoId;
                if (o.indice != null) x.indice = o.indice;
                return x;
            })
        };
    }

    // El motor guarda los eventos con el ultimo primero (como el iPad).
    const u = (est.eventos || [])[0] || est.pendiente || null;

    return {
        tipo: 'estado',
        enCurso: !!enCurso && !est.terminado,
        corriendo: !!est.andando,
        reloj: Number(est.tiempo) || 0,
        rec: !!rec,
        hoja,
        marcas,
        textos,
        emergentes,
        ultimo: u ? { nombre: u.name ?? u.nombre ?? '', inicio: u.start ?? u.inicio } : null,
        eventos: (est.eventos || []).length
    };
}

// Solo manda si algo cambio (menos el reloj, que el iPad corre solo). Un
// "forzar" periodico re-sincroniza el reloj y cubre cualquier mensaje perdido.
export function crearEmisor(enviar) {
    let ultimo = '';
    return (resumen, { forzar = false } = {}) => {
        const { reloj, ...resto } = resumen;
        const clave = JSON.stringify(resto);
        if (!forzar && clave === ultimo) return false;
        ultimo = clave;
        enviar({ ...resumen, reloj });
        return true;
    };
}
