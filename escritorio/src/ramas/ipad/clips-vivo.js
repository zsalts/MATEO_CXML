// Qué clips hay que cortar, actualizar o quitar para el iPad que mira.
//
// Se llama con cada cambio del motor. Compara los eventos de ahora con los
// que ya salieron (`hechos`: id del evento → {tiempos, meta}) y devuelve el
// trabajo que falta:
//   cortar:     eventos nuevos, o con otros segundos de video (hay que
//               volver a cortar)
//   actualizar: mismos segundos, otro nombre o etiquetas (solo se reenvía)
//   quitar:     ids de eventos que ya no están (se borraron)
//
// Solo cuentan los eventos cerrados y con video. Los tramos de posesión no,
// y los turnos de una línea tampoco: un cambio de línea son cinco eventos
// con los mismos segundos, cinco clips iguales.
//
// El más nuevo primero (como vienen del motor): si el iPad que mira entra
// tarde, lo último del partido le llega antes.
//
// Puro: lo prueba node --test.

const MIN_SEGUNDOS = 1;   // un evento de cero segundos igual se ve un poco

export function tiemposDe(ev, clipDe) {
    const c = clipDe(ev);
    if (c.vInicio == null || c.vFin == null) return null;
    const desde = Math.round(c.vInicio * 100) / 100;
    const hasta = Math.round(Math.max(c.vFin, c.vInicio + MIN_SEGUNDOS) * 100) / 100;
    return { desde, hasta };
}

export function metaDe(ev, equipo) {
    return {
        nombre: ev.name || 'Clip',
        etiquetas: (ev.descriptors || []).slice(),
        equipo: equipo || null,
        inicio: Number(ev.start) || 0
    };
}

export function planClipsEnVivo(eventos, hechos, { clipDe, equipoDe = () => null }) {
    const cortar = [], actualizar = [], vistos = new Set();
    for (const ev of eventos || []) {
        if (!ev || ev.end == null || ev.posesionDe || ev.line) continue;
        const tiempos = tiemposDe(ev, clipDe);
        if (!tiempos) continue;
        vistos.add(ev.id);
        const meta = metaDe(ev, equipoDe(ev));
        const ya = hechos.get(ev.id);
        if (!ya || ya.tiempos.desde !== tiempos.desde || ya.tiempos.hasta !== tiempos.hasta) {
            cortar.push({ ev, tiempos, meta });
        } else if (JSON.stringify(ya.meta) !== JSON.stringify(meta)) {
            actualizar.push({ ev, tiempos, meta });
        }
    }
    const quitar = [...hechos.keys()].filter(id => !vistos.has(id));
    return { cortar, actualizar, quitar };
}
