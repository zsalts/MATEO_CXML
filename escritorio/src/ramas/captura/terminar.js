// c) Terminar: cerrar el video, dejarlo con el XML en Partidos/<nombre>/,
// guardar el partido en la base con todo enlazado, terminar los cortes
// pendientes y mostrar dónde quedó cada cosa.
//
// El orden importa:
//   1. el motor cierra lo abierto (turnos, posesión) → todo llega al XML;
//   2. la cola de cortes se frena: no se puede mover un archivo que ffmpeg
//      está leyendo;
//   3. se cierra la grabación y el video va a Partidos/<nombre>/<nombre>.mp4;
//   4. los cortes que fallaron vuelven a la cola, ahora sobre el archivo
//      cerrado y en su lugar final;
//   5. XML (y CSV) al lado del video, con el MISMO nombre;
//   6. el partido a la base, con videoRuta y xmlRuta.
// Si algo del medio falla, se sigue: un XML que no se pudo escribir no
// puede costar el partido entero en la base. Lo que falló se cuenta al final.

import { crearCodificacion } from '../../nucleo/codificacion.js';
import { el, icono, reloj } from './piezas.js';
import {
    armarPartido, archivosDelPartido, subcarpetaDe, subcarpetaDeRuta, nombreDeArchivo, limpiarNombre,
    estadoParaRecuperar
} from './logica.js';
import { borrarRespaldo } from './respaldo.js';

const mensaje = err => (err && err.message) || String(err);

/**
 * @param o.api
 * @param o.config          el de la preparación (nombre, local, visitante, plantillaId, datos, fuente…)
 * @param o.nombre          el nombre final (confirmado)
 * @param o.motor
 * @param o.grabadora       null si no hay (archivo, o recuperando un respaldo)
 * @param o.grabado         { ruta } del video ya cerrado (recuperando un respaldo)
 * @param o.cola            la cola de cortes, o null
 * @param o.antesDeMover    async () => void, o null (los clips en vivo que falten)
 * @param o.ponerFinal      ({ ruta, nombre }) => void: desde acá los cortes van a ese archivo
 * @param o.alPaso          (texto) => void
 */
export async function terminarCaptura(o) {
    const { api, config } = o;
    const paso = t => { try { o.alPaso && o.alPaso(t); } catch (_) {} };
    const avisos = [];
    const nombre = limpiarNombre(o.nombre || config.nombre);
    let subcarpeta = subcarpetaDe(nombre);

    // 1.
    const estado = o.motor.terminar();

    // 2.
    if (o.cola) await o.cola.frenar();

    // 3.
    let video = null;
    if (config.fuente === 'camara') {
        let grabado = o.grabado || null;
        if (o.grabadora) {
            paso('Cerrando el video…');
            const s = o.grabadora.estado();
            grabado = s.grabando || s.deteniendo ? await o.grabadora.detener() : (s.ultima || grabado);
        }
        // Los clips para el que mira (compartir.js) que falten, antes de
        // mover el video: en Windows no se mueve lo que ffmpeg está leyendo.
        if (o.antesDeMover) { try { await o.antesDeMover(); } catch (_) {} }
        if (grabado && grabado.ruta) {
            paso('Moviendo el video a su carpeta…');
            video = { ruta: grabado.ruta, mime: grabado.mime || null, bytes: grabado.bytes || null };
            try {
                video.ruta = (await ubicarVideo(api, grabado.ruta, { nombre, subcarpeta })).ruta;
            } catch (err) {
                avisos.push(`El video no se pudo mover a Partidos/${nombre}: quedó en ${grabado.ruta} (${mensaje(err)}).`);
            }
        }
    } else if (config.partido) {
        // Codificar un video que ya estaba en la base: queda donde está, y el
        // XML va a su lado para que Sportscode los empareje.
        const p = config.partido;
        video = { ruta: p.video_ruta || config.videoRuta, mime: p.video_mime || null, bytes: p.video_bytes || null };
        try {
            const info = await api.sys.info();
            subcarpeta = subcarpetaDeRuta(video.ruta, info && info.carpeta) ?? subcarpeta;
        } catch (_) {}
    } else if (config.videoRuta) {
        video = { ruta: config.videoRuta, mime: null, bytes: config.videoInfo ? config.videoInfo.bytes : null };
        let ajustes = {};
        try { ajustes = await api.ajustes.leer(); } catch (_) {}
        let carpeta = null;
        try { carpeta = (await api.sys.info()).carpeta; } catch (_) {}
        const adentro = subcarpetaDeRuta(video.ruta, carpeta);
        if (adentro != null) {
            subcarpeta = adentro || subcarpeta;
        } else if (ajustes.copiarVideosImportados !== false) {
            paso('Copiando el video a la carpeta del partido…');
            try { video.ruta = (await api.video.copiarACarpeta(video.ruta, { nombre, subcarpeta })).ruta; }
            catch (err) { avisos.push('El video no se pudo copiar a la carpeta del partido: quedó enlazado donde estaba (' + mensaje(err) + ').'); }
        }
    }

    // 4.
    let clips = { hechos: 0, fallidos: 0 };
    if (o.cola) {
        if (o.ponerFinal) o.ponerFinal({ ruta: video ? video.ruta : null, nombre, subcarpeta });
        const reintentos = o.cola.reintentarFallidos();
        o.cola.seguir();
        if (o.cola.resumen().pendientes) paso(reintentos ? 'Reintentando los clips que fallaron…' : 'Terminando de cortar los clips…');
        await o.cola.vaciar();
        const r = o.cola.resumen();
        clips = { hechos: r.hechos, fallidos: r.fallidos };
        // Se le cambió el nombre al terminar: los clips que se cortaron
        // durante el partido están en la carpeta del nombre viejo.
        const vieja = subcarpetaDe(config.nombre);
        if (vieja !== subcarpeta) {
            for (const c of r.cortes) {
                for (const ruta of c.rutas || []) {
                    if (!ruta.replace(/\\/g, '/').includes('/' + vieja + '/')) continue;
                    try { await api.video.ubicar(ruta, { nombre: nombreDeArchivo(ruta).replace(/\.[^.]+$/, ''), subcarpeta: subcarpeta + '/Clips' }); }
                    catch (err) { avisos.push(`Un clip quedó en ${vieja}/Clips: ${mensaje(err)}`); }
                }
            }
        }
        if (r.fallidos) avisos.push(`${r.fallidos === 1 ? 'Un clip no se pudo' : r.fallidos + ' clips no se pudieron'} cortar: ${r.cortes.filter(c => c.estado === 'fallido').map(c => c.error).filter(Boolean)[0] || ''}`);
    }

    // 5.
    const previo = config.partido || null;
    const desfase = previo ? Number(previo.desfase) || 0 : 0;
    const partido = armarPartido({
        id: previo ? previo.id : undefined,
        datos: config.datos,
        estado,
        nombre: previo ? previo.nombre : nombre,
        local: config.local,
        visitante: config.visitante,
        plantillaId: config.plantillaId,
        origen: previo ? previo.origen : 'captura',
        video,
        desfase,
        previos: previo ? previo.eventos : []
    });
    if (previo) {
        // Lo que ya tenía el partido y la codificación no cambia.
        partido.huella = previo.huella || null;
        partido.inicioReal = previo.inicio_real || partido.inicioReal;
        partido.duracion = Math.max(Number(previo.duracion) || 0, partido.duracion);
        // En un video codificado el reloj del partido es el del video; si la
        // base tenía un desfase, el partido va corrido por eso.
        if (desfase) partido.eventos.forEach(ev => { if (ev.id == null) { ev.inicio -= desfase; if (ev.fin != null) ev.fin -= desfase; } });
    }
    const nuevos = partido.eventos.filter(ev => ev.id == null);
    const conVideo = !!video;
    // Los eventos que ya estaban vienen de la base (v_inicio): van al XML igual.
    const paraXml = partido.eventos.map(ev => ev.id == null ? ev
        : { ...ev, vInicio: ev.vInicio ?? ev.v_inicio ?? null, vFin: ev.vFin ?? ev.v_fin ?? null });
    // El XML se llama como el video (si al moverlo quedó "(2)", también).
    const base = nombreDeArchivo(video && video.ruta).replace(/\.[^.]+$/, '') || nombre;
    const archivos = archivosDelPartido({ datos: config.datos, estado, partido: { ...partido, eventos: paraXml }, nombre: base, conVideo });
    const rutas = {};
    if (archivos.length) paso('Escribiendo el XML…');
    for (const a of archivos) {
        try {
            // Actualizando un partido, el XML nuevo (con los eventos de antes y
            // los de ahora) reemplaza al que estaba al lado del video: si
            // quedaran dos, Sportscode emparejaría el viejo.
            const r = await api.archivos.guardarTexto({ nombre: a.nombre, extension: a.extension, contenido: a.contenido, subcarpeta, pisar: !!previo });
            (rutas[a.tipo] = rutas[a.tipo] || []).push(r);
        } catch (err) {
            avisos.push(`No se pudo escribir ${a.nombre}.${a.extension}: ${mensaje(err)}`);
        }
    }
    const xmlRuta = rutas.xml ? rutas.xml[0] : (previo ? previo.xml_ruta || null : null);
    partido.xmlRuta = xmlRuta;

    // 6.
    const sinVideo = conVideo ? nuevos.filter(ev => ev.vInicio == null).length : 0;
    if (sinVideo) avisos.push(`${sinVideo === 1 ? 'Un evento se marcó' : sinVideo + ' eventos se marcaron'} sin cámara: está${sinVideo === 1 ? '' : 'n'} en la base pero no en el XML.`);

    // El video ya está en su lugar y el XML escrito: si la base falla, lo
    // único que hay que repetir es este paso (e.reintentar).
    const guardar = async () => {
        paso('Guardando en la base…');
        const partidoId = await api.partidos.guardar(partido);
        await borrarRespaldo();
        return {
            partidoId: partidoId ?? (previo && previo.id),
            nombre: partido.nombre,
            subcarpeta,
            videoRuta: video ? video.ruta : null,
            xmlRuta,
            csvRutas: rutas.csv || [],
            eventos: nuevos.length,
            duracion: estado.tiempo,
            clips,
            avisos
        };
    };
    try {
        return await guardar();
    } catch (err) {
        const e = new Error('No se pudo guardar el partido en la base: ' + mensaje(err));
        e.reintentar = guardar;
        e.videoRuta = video ? video.ruta : null;
        throw e;
    }
}

// Con la ventana recién abierta de nuevo, main puede seguir teniendo el
// archivo abierto (se cerró la página, no la app): se cierra y se reintenta.
async function ubicarVideo(api, ruta, opciones) {
    try {
        return await api.video.ubicar(ruta, opciones);
    } catch (err) {
        if (!/grabando/i.test(mensaje(err))) throw err;
        await api.video.finalizar();
        return api.video.ubicar(ruta, opciones);
    }
}

// Un respaldo de una captura que no se terminó → partido en la base, con el
// video que quedó en el disco.
export async function recuperarRespaldo(api, respaldo, alPaso) {
    const meta = respaldo.meta;
    let datos = meta.datos;
    if (!datos && meta.plantillaId != null) {
        try { datos = (await api.plantillas.leer(meta.plantillaId)).datos; } catch (_) {}
    }
    const motor = crearCodificacion(datos || {});
    motor.importarEstado(estadoParaRecuperar(respaldo.motor));
    let partido = null;
    if (meta.partidoId != null) { try { partido = await api.partidos.leer(meta.partidoId); } catch (_) {} }
    return terminarCaptura({
        api,
        config: { ...meta, datos: datos || {}, partido },
        nombre: meta.nombre,
        motor,
        grabadora: null,
        grabado: meta.fuente === 'camara' && respaldo.ruta ? { ruta: respaldo.ruta } : null,
        cola: null,
        alPaso
    });
}

// ─────────────────────────────────────────────
// PANTALLA FINAL
// ─────────────────────────────────────────────
export function montarResultado(contenedor, { ctx, r, alNueva }) {
    const api = ctx.api;
    const fila = (etq, valor, ruta) => el('div', { class: 'tv-captura-fin__fila' },
        el('span', { class: 'tv-texto-2', texto: etq }),
        el('span', { class: 'tv-captura-fin__valor tv-recortar', title: ruta || valor, texto: valor }),
        ruta ? el('button', { type: 'button', class: 'tv-btn tv-btn--chico tv-btn--fantasma', title: 'Mostrar en la carpeta', onClick: () => api.archivos.mostrar(ruta) }, icono('carpeta')) : el('span'));
    const clipsTexto = r.clips.hechos || r.clips.fallidos
        ? `${r.clips.hechos} en Clips/` + (r.clips.fallidos ? ` · ${r.clips.fallidos} sin cortar` : '')
        : 'ninguno';

    const raiz = el('div', { class: 'tv-captura-fin' },
        el('div', { class: 'tv-captura-fin__caja tv-panel' },
            el('div', { class: 'tv-captura-fin__icono' }, icono('check')),
            el('h1', { texto: 'Partido guardado' }),
            el('p', { class: 'tv-texto-2', texto: `${r.nombre} · ${r.eventos} eventos · ${reloj(r.duracion)}` }),
            el('div', { class: 'tv-captura-fin__filas' },
                fila('Carpeta', r.subcarpeta || '—'),
                fila('Video', r.videoRuta ? nombreDeArchivo(r.videoRuta) : 'sin video', r.videoRuta),
                fila('XML', r.xmlRuta ? nombreDeArchivo(r.xmlRuta) : 'no hay eventos para el XML', r.xmlRuta),
                ...r.csvRutas.map(c => fila('CSV', nombreDeArchivo(c), c)),
                fila('Clips', clipsTexto)),
            r.avisos.length ? el('ul', { class: 'tv-captura-fin__avisos' }, r.avisos.map(a => el('li', {}, icono('alerta'), el('span', { texto: a })))) : null,
            el('div', { class: 'tv-captura-fin__acciones' },
                el('button', { type: 'button', class: 'tv-btn tv-btn--primario', onClick: () => ctx.navegar('base', { partidoId: r.partidoId }) }, icono('base'), el('span', { texto: 'Ver en la base' })),
                el('button', { type: 'button', class: 'tv-btn', onClick: () => api.archivos.abrirCarpeta(r.subcarpeta) }, icono('carpeta'), el('span', { texto: 'Abrir carpeta' })),
                el('button', { type: 'button', class: 'tv-btn', onClick: alNueva }, icono('camara'), el('span', { texto: 'Nueva captura' })))));
    contenedor.append(raiz);
    return { destruir() { raiz.remove(); } };
}

// Mientras se cierra todo: un cartel con el paso en curso.
export function montarCerrando(contenedor) {
    const texto = el('p', { class: 'tv-texto-2', texto: 'Terminando…' });
    const raiz = el('div', { class: 'tv-captura-fin' },
        el('div', { class: 'tv-captura-fin__caja tv-panel' },
            el('div', { class: 'tv-captura-fin__girando' }),
            el('h1', { texto: 'Guardando el partido' }),
            texto,
            el('p', { class: 'tv-chica tv-texto-2', texto: 'No cierres la app: se está cerrando el video y cortando los clips pendientes.' })));
    contenedor.append(raiz);
    return { paso: t => { texto.textContent = t; }, destruir() { raiz.remove(); } };
}
