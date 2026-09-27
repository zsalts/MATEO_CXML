// a) Preparación: de dónde sale el video, con qué plantilla, quién juega y
// cómo se llama el partido. Al tocar "Empezar" entrega todo a codificando.js.
//
// Dos fuentes:
//   - Cámara / placa de captura: se graba el partido mientras se codifica.
//   - Archivo de video: se codifica uno ya grabado. No se graba nada y el
//     reloj del video ES el del partido. Si llega params.videoRuta (lo manda
//     Importar con "Codificarlo ahora") se entra directo con ese video, y si
//     llega también params.partidoId, al terminar se actualiza ese partido.

import { elegirPlantilla, escapar } from '../../ui/index.js';
import { crearVista } from '../../nucleo/botonera-vista.js';
import { normalizar, nombresEquipos, atajos } from '../../nucleo/plantilla.js';
import { el, icono, reloj, crearPanelCamara } from './piezas.js';
import { nombrePropuesto, nombreUnico, limpiarNombre, nombreDeArchivo } from './logica.js';

/**
 * @param o.ctx
 * @param o.grabadora    la de la rama (sigue viva en la codificación)
 * @param o.ajustes      tv.ajustes.leer()
 * @param o.previo       la configuración de la captura anterior ("Nueva captura")
 * @param o.alEmpezar(config)
 */
export function montarPreparacion(contenedor, o) {
    const { ctx } = o;
    const api = ctx.api;
    const params = ctx.params || {};
    const previo = o.previo || {};

    const st = {
        fuente: params.videoRuta ? 'archivo' : (previo.fuente || 'camara'),
        videoRuta: params.videoRuta || null,
        videoInfo: null,
        partidoId: params.partidoId ?? null,
        partido: null,
        plantilla: null,          // { id, nombre, datos }
        nombreEditado: false,
        clipsDisponible: true
    };
    const quitar = [];

    // ── Armado ───────────────────────────────
    const tabCamara = el('button', { type: 'button', class: 'tv-captura-fuente__op', 'data-fuente': 'camara' },
        icono('camara'), el('span', {}, el('b', { texto: 'Cámara / placa de captura' }), el('span', { class: 'tv-chica tv-texto-2', texto: 'Grabás el partido mientras lo codificás' })));
    const tabArchivo = el('button', { type: 'button', class: 'tv-captura-fuente__op', 'data-fuente': 'archivo' },
        icono('video'), el('span', {}, el('b', { texto: 'Archivo de video' }), el('span', { class: 'tv-chica tv-texto-2', texto: 'Codificás un partido ya grabado' })));
    const cajaCamara = el('div', { class: 'tv-captura-prep__fuente-cuerpo' });
    const cajaArchivo = el('div', { class: 'tv-captura-prep__fuente-cuerpo' });

    const miniatura = el('div', { class: 'tv-captura-prep__mini' });
    const nombrePlantilla = el('div', { class: 'tv-captura-prep__pl-nombre tv-recortar' });
    const detallePlantilla = el('div', { class: 'tv-chica tv-texto-2' });
    const btnPlantilla = el('button', { type: 'button', class: 'tv-btn', onClick: () => cambiarPlantilla() }, icono('botonera'), el('span', { texto: 'Elegir plantilla' }));

    const listaEquipos = el('datalist', { id: 'tv-captura-equipos' });
    const inLocal = el('input', { class: 'tv-campo', list: 'tv-captura-equipos', placeholder: 'Local', spellcheck: 'false', 'aria-label': 'Local' });
    const inVisitante = el('input', { class: 'tv-campo', list: 'tv-captura-equipos', placeholder: 'Visitante', spellcheck: 'false', 'aria-label': 'Visitante' });
    const inNombre = el('input', { class: 'tv-campo', spellcheck: 'false', 'aria-label': 'Nombre del partido' });
    const ayudaNombre = el('div', { class: 'tv-chica tv-texto-2' });
    const chkAuto = el('input', { type: 'checkbox' });
    const ayudaAuto = el('span', { class: 'tv-chica tv-texto-2', texto: 'Cada evento queda también como archivo en Partidos/<nombre>/Clips, a medida que lo marcás.' });
    const btnEmpezar = el('button', { type: 'button', class: 'tv-btn tv-btn--primario tv-captura-prep__empezar', onClick: () => empezar() },
        icono('play'), el('span', { texto: 'Empezar' }));
    const motivo = el('div', { class: 'tv-chica tv-texto-2 tv-captura-prep__motivo' });

    const raiz = el('div', { class: 'tv-captura-prep' },
        el('header', { class: 'tv-captura-prep__cab' },
            el('h1', { texto: 'Captura en vivo' }),
            el('p', { class: 'tv-texto-2', texto: 'Conectá la cámara, elegí la botonera del iPad y empezá. Cada evento se puede ver al instante y cortar como clip mientras el partido sigue grabando.' })),
        el('div', { class: 'tv-captura-prep__grilla' },
            el('section', { class: 'tv-panel tv-captura-prep__bloque tv-captura-prep__fuente' },
                el('h2', { texto: 'Video' }),
                el('div', { class: 'tv-captura-fuente', role: 'tablist' }, tabCamara, tabArchivo),
                cajaCamara, cajaArchivo),
            el('div', { class: 'tv-captura-prep__col' },
                el('section', { class: 'tv-panel tv-captura-prep__bloque' },
                    el('h2', { texto: 'Plantilla' }),
                    miniatura,
                    el('div', { class: 'tv-captura-prep__pl' }, el('div', { class: 'tv-captura-prep__pl-texto' }, nombrePlantilla, detallePlantilla), btnPlantilla)),
                el('section', { class: 'tv-panel tv-captura-prep__bloque' },
                    el('h2', { texto: 'Partido' }),
                    el('div', { class: 'tv-captura-prep__equipos' },
                        el('label', {}, el('span', { class: 'tv-etiqueta', texto: 'Local' }), inLocal),
                        el('span', { class: 'tv-captura-prep__vs', texto: 'vs' }),
                        el('label', {}, el('span', { class: 'tv-etiqueta', texto: 'Visitante' }), inVisitante)),
                    listaEquipos,
                    el('label', { class: 'tv-captura-prep__nombre' }, el('span', { class: 'tv-etiqueta', texto: 'Nombre' }), inNombre, ayudaNombre),
                    el('label', { class: 'tv-captura-prep__auto' }, chkAuto,
                        el('span', {}, el('span', { texto: 'Cortar cada evento automáticamente' }), el('br'), ayudaAuto))),
                el('div', { class: 'tv-captura-prep__acciones' }, motivo, btnEmpezar))));
    contenedor.append(raiz);

    // ── Fuente ───────────────────────────────
    let panelCamara = null;
    function pintarFuente() {
        tabCamara.setAttribute('aria-selected', String(st.fuente === 'camara'));
        tabArchivo.setAttribute('aria-selected', String(st.fuente === 'archivo'));
        cajaCamara.hidden = st.fuente !== 'camara';
        cajaArchivo.hidden = st.fuente !== 'archivo';
        // Con el video de Importar no se elige otra fuente: se vino a codificar ese.
        tabCamara.disabled = !!params.videoRuta;
        if (st.fuente === 'camara' && !panelCamara) {
            panelCamara = crearPanelCamara(cajaCamara, {
                grabadora: o.grabadora,
                calidad: o.ajustes.calidad,
                api,
                alConectar: () => validar(),
                alError: m => ctx.ui.aviso(m, 'aviso')
            });
            quitar.push(() => panelCamara.destruir());
            // Si ya hay una cámara (volviendo de otra captura) no se vuelve a pedir.
            panelCamara.listar().then(videos => {
                if (!o.grabadora.estado().conectada && videos.length) panelCamara.conectar();
            });
        }
        if (st.fuente === 'archivo') pintarArchivo();
        validar();
    }
    tabCamara.addEventListener('click', () => { st.fuente = 'camara'; pintarFuente(); });
    tabArchivo.addEventListener('click', () => {
        st.fuente = 'archivo';
        // La cámara se suelta: codificando un archivo no hace falta, y queda
        // libre para otro programa.
        if (!o.grabadora.estado().grabando) o.grabadora.desconectar();
        pintarFuente();
    });

    async function pintarArchivo() {
        cajaArchivo.textContent = '';
        if (!st.videoRuta) {
            cajaArchivo.append(el('div', { class: 'tv-vacio' }, icono('video'),
                el('div', { class: 'tv-vacio__titulo', texto: 'Elegí el video del partido' }),
                el('div', { texto: 'MP4, MOV, MKV… El reloj del video es el del partido: lo que marques cae justo en ese segundo.' }),
                el('button', { type: 'button', class: 'tv-btn tv-btn--primario', onClick: elegirVideo }, icono('carpeta'), el('span', { texto: 'Elegir video…' }))));
            return;
        }
        const vista = el('video', { class: 'tv-captura-cam__vista', muted: true, playsInline: true, controls: true, preload: 'metadata' });
        const info = el('div', { class: 'tv-chica tv-texto-2 tv-mono' });
        cajaArchivo.append(
            el('div', { class: 'tv-captura-cam__marco' }, vista),
            el('div', { class: 'tv-captura-prep__archivo' },
                el('div', { class: 'tv-captura-prep__archivo-texto' },
                    el('div', { class: 'tv-recortar', texto: nombreDeArchivo(st.videoRuta), title: st.videoRuta }), info),
                params.videoRuta ? null : el('button', { type: 'button', class: 'tv-btn', onClick: elegirVideo, texto: 'Cambiar…' })));
        try {
            const url = await api.video.url(st.videoRuta);
            if (url) vista.src = url;
        } catch (_) {}
        try {
            st.videoInfo = await api.video.info(st.videoRuta);
            if (st.videoInfo) {
                info.textContent = [
                    st.videoInfo.duracion ? reloj(st.videoInfo.duracion) : null,
                    st.videoInfo.ancho ? `${st.videoInfo.ancho}×${st.videoInfo.alto}` : null
                ].filter(Boolean).join(' · ');
            }
        } catch (_) {}
    }

    async function elegirVideo() {
        try {
            const ruta = await api.video.elegirArchivo();
            if (!ruta) return;
            st.videoRuta = ruta;
            st.videoInfo = null;
            pintarArchivo();
            validar();
        } catch (err) {
            ctx.ui.aviso('No se pudo abrir el video: ' + ((err && err.message) || err), 'error');
        }
    }

    // ── Plantilla ────────────────────────────
    let vistaMini = null;
    async function ponerPlantilla(id) {
        if (id == null) return;
        let p;
        try { p = await api.plantillas.leer(id); } catch (err) {
            ctx.ui.aviso('No se pudo leer la plantilla: ' + ((err && err.message) || err), 'error');
            return;
        }
        if (!p) return;
        const datos = normalizar(p.datos);
        st.plantilla = { id: p.id, nombre: p.nombre, datos };
        if (vistaMini) vistaMini.destruir();
        miniatura.textContent = '';
        vistaMini = crearVista(miniatura, datos, { modo: 'miniatura', ajustar: true });
        nombrePlantilla.textContent = p.nombre || 'Sin nombre';
        const a = atajos(datos);
        const tocables = datos.elements.filter(e => ['event', 'descriptor', 'sticky_label', 'line', 'possession', 'counter'].includes(e.type)).length;
        detallePlantilla.textContent = [
            `${tocables} botones`,
            datos.hojas.length ? `${datos.hojas.length} pestañas` : null,
            a.mapa.size ? `${a.mapa.size} atajos de teclado` : 'sin atajos (se ponen en la Base › Plantillas)',
            a.repetidas.length ? `tecla repetida: ${a.repetidas.map(r => r.tecla.toUpperCase()).join(', ')}` : null
        ].filter(Boolean).join(' · ');
        btnPlantilla.querySelector('span').textContent = 'Cambiar…';
        // Los equipos de la tarjeta de la plantilla, si todavía no se escribieron.
        const eq = nombresEquipos(datos);
        if (!inLocal.value && eq.A !== 'Local') inLocal.value = eq.A;
        if (!inVisitante.value && eq.B !== 'Visitante') inVisitante.value = eq.B;
        proponerNombre();
        validar();
    }
    quitar.push(() => { if (vistaMini) vistaMini.destruir(); });

    async function cambiarPlantilla() {
        const id = await elegirPlantilla(ctx, { titulo: 'Plantilla para codificar', textoBoton: 'Usar esta' });
        if (id != null) ponerPlantilla(id);
    }

    // ── Nombre y equipos ─────────────────────
    function proponerNombre() {
        if (st.nombreEditado || st.partido) return;
        inNombre.value = nombrePropuesto(inLocal.value, inVisitante.value);
        ayudaNombre.textContent = `Carpeta: Partidos/${limpiarNombre(inNombre.value)}`;
    }
    inLocal.addEventListener('input', proponerNombre);
    inVisitante.addEventListener('input', proponerNombre);
    inNombre.addEventListener('input', () => {
        st.nombreEditado = !!inNombre.value.trim();
        ayudaNombre.textContent = `Carpeta: Partidos/${limpiarNombre(inNombre.value)}`;
        validar();
    });

    // ── Validar y empezar ────────────────────
    function faltante() {
        if (!st.plantilla) return 'Falta elegir la plantilla.';
        if (st.fuente === 'archivo' && !st.videoRuta) return 'Falta elegir el video.';
        return '';
    }
    function validar() {
        const f = faltante();
        btnEmpezar.disabled = !!f;
        let m = f;
        if (!f && st.fuente === 'camara' && !o.grabadora.estado().conectada) {
            m = 'Sin cámara: se codifica igual y la grabación arranca cuando la conectes.';
        }
        motivo.textContent = m;
    }

    let empezando = false;
    async function empezar() {
        if (empezando || faltante()) return;
        empezando = true;
        try {
            let nombre = limpiarNombre(inNombre.value || nombrePropuesto(inLocal.value, inVisitante.value));
            if (!st.partido) {
                // Un partido con el mismo nombre tendría la misma carpeta: se
                // le agrega "(2)" para que sus clips no se mezclen.
                try {
                    const mismos = await api.partidos.listar({ texto: nombre });
                    const libre = nombreUnico(nombre, (mismos || []).map(p => p.nombre));
                    if (libre !== nombre) {
                        ctx.ui.aviso(`Ya hay un partido "${nombre}": este se va a llamar "${libre}".`, 'info');
                        nombre = libre;
                    }
                } catch (_) {}
            }
            o.alEmpezar({
                fuente: st.fuente,
                videoRuta: st.fuente === 'archivo' ? st.videoRuta : null,
                videoInfo: st.videoInfo,
                partidoId: st.partidoId,
                partido: st.partido,
                plantillaId: st.plantilla.id,
                nombrePlantilla: st.plantilla.nombre,
                datos: st.plantilla.datos,
                local: inLocal.value.trim(),
                visitante: inVisitante.value.trim(),
                nombre,
                cortarAuto: chkAuto.checked && st.clipsDisponible,
                margen: Number(o.ajustes.margen ?? 2) || 0,
                calidad: panelCamara ? panelCamara.calidad() : o.ajustes.calidad
            });
        } finally {
            empezando = false;
        }
    }

    // Enter en cualquier campo = Empezar.
    raiz.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches('input') && !btnEmpezar.disabled) { e.preventDefault(); empezar(); }
    });

    // ── Arranque ─────────────────────────────
    (async () => {
        inLocal.value = previo.local || '';
        inVisitante.value = previo.visitante || '';
        chkAuto.checked = !!previo.cortarAuto;
        pintarFuente();
        try {
            const equipos = await api.equipos.listar();
            listaEquipos.innerHTML = (equipos || []).map(e => `<option value="${escapar(e.nombre)}"></option>`).join('');
        } catch (_) {}
        try {
            st.clipsDisponible = !!(await api.clips.disponible());
        } catch (_) { st.clipsDisponible = false; }
        if (!st.clipsDisponible) {
            chkAuto.disabled = true;
            ayudaAuto.textContent = 'No está ffmpeg: los clips se pueden ver pero no guardar como archivo.';
        }
        if (st.partidoId != null) {
            try {
                st.partido = await api.partidos.leer(st.partidoId);
                if (st.partido) {
                    inNombre.value = st.partido.nombre;
                    inNombre.readOnly = true;
                    ayudaNombre.textContent = 'Se actualiza este partido de la base.';
                    if (st.partido.local) inLocal.value = st.partido.local;
                    if (st.partido.visitante) inVisitante.value = st.partido.visitante;
                }
            } catch (_) {}
        }
        let id = params.plantillaId ?? previo.plantillaId ?? (st.partido && (st.partido.plantilla_id ?? st.partido.plantillaId));
        // Sin plantilla pedida, la última que se trajo del iPad: casi siempre
        // es la de este partido, y cambiarla es un clic.
        if (id == null) {
            try { const l = await api.plantillas.listar(); if (l && l.length) id = l[0].id; } catch (_) {}
        }
        if (id != null) await ponerPlantilla(id);
        if (!st.plantilla) {
            nombrePlantilla.textContent = 'Todavía no hay plantillas';
            detallePlantilla.textContent = 'Las botoneras se arman en el iPad y se importan.';
            btnPlantilla.querySelector('span').textContent = 'Importar del iPad';
            miniatura.append(el('div', { class: 'tv-captura-prep__mini-vacia' }, icono('botonera')));
        }
        proponerNombre();
        validar();
    })();

    const alEstado = o.grabadora.on('estado', validar);
    quitar.push(alEstado);

    return {
        destruir() { quitar.forEach(f => { try { f(); } catch (_) {} }); raiz.remove(); }
    };
}
