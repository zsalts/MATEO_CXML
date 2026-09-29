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

// ─────────────────────────────────────────────
// EL QUE CORTA Y MANDA
// ─────────────────────────────────────────────
// Lo usan las dos capturas: la desde iPad y la en vivo de la compu. Cada una
// le da sus piezas y llama a revisar() con cada cambio del motor.
//
//   api          window.tv (clips.exportar, remoto.enviar)
//   eventos()    los eventos del motor, el más nuevo primero
//   clipDe(ev)   {vInicio, vFin} en segundos del video
//   video()      ruta de la grabación en curso, o null si no se graba
//   subcarpeta() dónde van los clips (clips.exportar le agrega /Clips)
//   equipoDe(ev) nombre del equipo del evento, o null
//   nombreClip(meta) nombre del archivo
//   alFallar(err) una sola vez: si ffmpeg no puede con uno, no puede con ninguno
//
// Los cortes van en paralelo, no en fila: uno cuyo video todavía no llegó
// al disco (un evento largo, o con segundos después del toque) espera solo,
// sin frenar a los que ya se pueden cortar. Cortar sin recomprimir tarda
// menos de medio segundo, así que varios a la vez no pesan.
//
// Apenas se cierra un evento nuevo, el que mira ya lo ve en la lista como
// "cortando…" (pendiente); cuando está el archivo llega el mismo id completo.
//
// esperar() termina cuando no queda ninguno: antes de mover el video hay que
// esperarlos (en Windows no se renombra un archivo que ffmpeg está leyendo).
export function crearClipsEnVivo(o) {
    const porEvento = new Map();   // id del evento → {id, tiempos, meta, ruta}
    const enCurso = new Set();     // promesas de los cortes que faltan
    let n = 0, fallo = false, apagado = false;

    function publicar(hecho, pendiente) {
        const clip = { id: hecho.id, ...hecho.meta, duracion: hecho.tiempos.hasta - hecho.tiempos.desde };
        if (pendiente) clip.pendiente = true; else clip.ruta = hecho.ruta;
        return o.api.remoto.enviar({ tipo: 'clip', clip }).catch(() => {});
    }

    function cortar(hecho, video, evId) {
        const p = (async () => {
            // Ya se volvió a cortar con otros segundos, o el evento se borró.
            if (apagado || porEvento.get(evId) !== hecho) return;
            const r = await o.api.clips.exportar({
                ruta: video,
                cortes: [{ desde: hecho.tiempos.desde, hasta: hecho.tiempos.hasta, nombre: o.nombreClip(hecho.meta) }],
                destino: 'carpeta',
                subcarpeta: o.subcarpeta()
            });
            hecho.ruta = r && r.rutas && r.rutas[0];
            if (hecho.ruta && !apagado && porEvento.get(evId) === hecho) publicar(hecho);
        })().catch(err => {
            console.warn('Clip en vivo:', err);
            // El "cortando…" no queda para siempre en la lista del que mira.
            if (!hecho.ruta && !hecho.anterior && porEvento.get(evId) === hecho) {
                porEvento.delete(evId);
                o.api.remoto.enviar({ tipo: 'quitarClip', id: hecho.id }).catch(() => {});
            }
            if (!fallo && !apagado) { fallo = true; if (o.alFallar) o.alFallar(err); }
        }).finally(() => enCurso.delete(p));
        enCurso.add(p);
    }

    function revisar() {
        if (apagado) return;
        const video = o.video();
        if (!video) return;
        const plan = planClipsEnVivo(o.eventos(), porEvento, { clipDe: o.clipDe, equipoDe: o.equipoDe });
        for (const { ev, tiempos, meta } of plan.cortar) {
            // Se anota ya, antes de cortar: el próximo cambio del motor no lo
            // vuelve a encolar. Si el corte falla no se reintenta.
            const previo = porEvento.get(ev.id);
            // Vuelto a cortar: el que mira sigue viendo el anterior hasta que
            // llegue el nuevo. Nuevo: aparece ya, como "cortando…".
            const hecho = { id: previo ? previo.id : 'c' + (++n), tiempos, meta, ruta: null, anterior: !!(previo && (previo.ruta || previo.anterior)) };
            porEvento.set(ev.id, hecho);
            if (!previo) publicar(hecho, true);
            cortar(hecho, video, ev.id);
        }
        for (const { ev, meta } of plan.actualizar) {
            const hecho = porEvento.get(ev.id);
            hecho.meta = meta;
            // Recortándose con el anterior a la vista: el nombre nuevo llega
            // con el corte nuevo.
            if (hecho.ruta) publicar(hecho);
            else if (!hecho.anterior) publicar(hecho, true);
        }
        for (const id of plan.quitar) {
            const hecho = porEvento.get(id);
            porEvento.delete(id);
            o.api.remoto.enviar({ tipo: 'quitarClip', id: hecho.id }).catch(() => {});
        }
    }

    return {
        revisar,
        // Hasta que no quede ninguno (mientras se espera pueden entrar otros).
        async esperar() { while (enCurso.size) await Promise.all([...enCurso]); },
        cantidad: () => porEvento.size,
        apagar() { apagado = true; }
    };
}
