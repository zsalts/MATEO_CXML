// ─────────────────────────────────────────────
// RAMA CAPTURA EN VIVO
// ─────────────────────────────────────────────
// Conectás la cámara (placa HDMI o webcam), codificás el partido con una de
// tus plantillas del iPad, cada evento se corta en vivo como clip, y al
// terminar el video y el XML quedan enlazados al partido en la base y juntos
// en su carpeta.
//
// Tres pasos, un archivo cada uno:
//   a) preparacion.js   fuente, plantilla, equipos, nombre
//   b) codificando.js   botonera, reloj, REC, registro, clips
//   c) terminar.js      video + XML a Partidos/<nombre>/, partido a la base
// La grabadora vive en la rama entera: la cámara conectada en la preparación
// es la misma que graba, y sigue conectada para la próxima captura.

import { estadoGlobal } from '../../ui/index.js';
import { crearGrabadora } from '../../nucleo/grabadora.js';
import { montarPreparacion } from './preparacion.js';
import { montarCodificacion } from './codificando.js';
import { terminarCaptura, recuperarRespaldo, montarResultado, montarCerrando } from './terminar.js';
import { el, icono, reloj } from './piezas.js';
import { leerRespaldo } from './logica.js';
import { leerRespaldoGuardado, borrarRespaldo } from './respaldo.js';

let R = null;   // lo de la rama montada

function nuevo(contenedor, ctx) {
    return {
        contenedor, ctx,
        fase: 'prep',        // 'prep' | 'cod' | 'cerrando' | 'fin'
        ajustes: {},
        grabadora: null,
        pantalla: null,      // lo que está montado ahora (tiene destruir())
        cod: null,
        config: null,
        previo: null
    };
}

function cambiarPantalla(p) {
    if (R.pantalla && R.pantalla !== R.cod) { try { R.pantalla.destruir(); } catch (_) {} }
    R.pantalla = p;
}

// ── a) ───────────────────────────────────────
function mostrarPreparacion(ctx) {
    R.fase = 'prep';
    R.config = null;
    if (R.ctx.miga) R.ctx.miga(null);
    cambiarPantalla(montarPreparacion(R.contenedor, {
        ctx,
        grabadora: R.grabadora,
        ajustes: R.ajustes,
        previo: R.previo,
        alEmpezar: empezar
    }));
}

// ── b) ───────────────────────────────────────
function empezar(config) {
    cambiarPantalla(null);
    R.fase = 'cod';
    R.config = config;
    if (R.ctx.miga) R.ctx.miga(config.nombre);
    R.cod = montarCodificacion(R.contenedor, {
        ctx: R.ctx,
        config,
        grabadora: R.grabadora,
        ajustes: R.ajustes,
        alTerminar: () => terminar()
    });
    R.pantalla = R.cod;
}

// ── c) ───────────────────────────────────────
async function terminar() {
    if (!R || R.fase !== 'cod') return;
    const { ctx, config, cod } = R;
    let nombre = config.nombre;
    if (!config.partido) {
        nombre = await ctx.ui.pedirTexto('Terminar el partido', config.nombre, { etiqueta: 'Nombre del partido (y de su carpeta)' });
        if (nombre == null || !R || R.fase !== 'cod') return;
        nombre = nombre.trim() || config.nombre;
    } else if (!await ctx.ui.confirmar('¿Terminar la codificación y guardar el partido?', { titulo: 'Terminar' })) {
        return;
    }

    R.fase = 'cerrando';
    cod.guardarRespaldo();
    cod.raiz.hidden = true;
    const cerrando = montarCerrando(R.contenedor);
    try {
        const r = await terminarCaptura({
            api: ctx.api, config, nombre,
            motor: cod.motor,
            grabadora: cod.conCamara ? R.grabadora : null,
            cola: cod.cola,
            ponerFinal: cod.ponerFinal,
            alPaso: cerrando.paso
        });
        cerrando.destruir();
        mostrarResultado(r);
    } catch (err) {
        cerrando.destruir();
        mostrarError(err);
    }
}

function soltarCodificacion() {
    if (R.pantalla && R.pantalla === R.cod) R.pantalla = null;
    if (R.cod) { try { R.cod.destruir(); } catch (_) {} R.cod = null; }
    estadoGlobal.poner('grabando', null);
}

function mostrarResultado(r) {
    soltarCodificacion();
    R.fase = 'fin';
    const c = R.config || {};
    R.previo = { fuente: c.partido ? 'camara' : c.fuente, plantillaId: c.plantillaId, local: c.local, visitante: c.visitante, cortarAuto: c.cortarAuto };
    if (R.ctx.miga) R.ctx.miga(r.nombre);
    cambiarPantalla(montarResultado(R.contenedor, {
        ctx: R.ctx, r,
        // La nueva captura no vuelve a entrar con el video de Importar.
        alNueva: () => mostrarPreparacion({ ...R.ctx, params: {} })
    }));
}

function mostrarError(err) {
    soltarCodificacion();
    R.fase = 'fin';
    const texto = el('p', { class: 'tv-texto-2', texto: (err && err.message) || String(err) });
    const btnReintentar = el('button', { type: 'button', class: 'tv-btn tv-btn--primario' }, el('span', { texto: 'Reintentar' }));
    const raiz = el('div', { class: 'tv-captura-fin' },
        el('div', { class: 'tv-captura-fin__caja tv-panel' },
            el('div', { class: 'tv-captura-fin__icono es-error' }, icono('alerta')),
            el('h1', { texto: 'No se pudo guardar el partido' }),
            texto,
            el('p', { class: 'tv-chica tv-texto-2', texto: err && err.videoRuta
                ? `El video está a salvo en ${err.videoRuta}. La codificación quedó respaldada: si cerrás, se ofrece guardarla al volver a abrir la Captura.`
                : 'La codificación quedó respaldada: si cerrás, se ofrece guardarla al volver a abrir la Captura.' }),
            el('div', { class: 'tv-captura-fin__acciones' },
                err && err.reintentar ? btnReintentar : null,
                el('button', { type: 'button', class: 'tv-btn', onClick: () => mostrarPreparacion({ ...R.ctx, params: {} }) }, el('span', { texto: 'Volver' })))));
    btnReintentar.addEventListener('click', async () => {
        btnReintentar.disabled = true;
        try { mostrarResultado(await err.reintentar()); }
        catch (e) { texto.textContent = (e && e.message) || String(e); btnReintentar.disabled = false; }
    });
    R.contenedor.append(raiz);
    cambiarPantalla({ destruir: () => raiz.remove() });
}

// ── Respaldo de una captura que no se terminó ──
async function ofrecerRespaldo() {
    let respaldo = null;
    try { respaldo = leerRespaldo(await leerRespaldoGuardado()); } catch (_) {}
    if (!respaldo || !R) return;
    const { ctx } = R;
    const m = respaldo.motor;
    const eventos = (m.eventos || []).length + (m.abiertos || []).length;
    const min = Math.round((Date.now() - respaldo.guardadoEn) / 60000);
    const hace = min < 1 ? 'hace un momento' : min < 120 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
    const contenido = el('div', { class: 'tv-form' },
        el('p', { texto: `"${respaldo.meta.nombre}" quedó sin terminar (se cerró la ventana ${hace}).` }),
        el('p', { class: 'tv-texto-2', texto: `${eventos} eventos · ${reloj(m.acumulado || 0)} de partido` + (respaldo.ruta ? ' · el video quedó grabado en el disco' : '') + '.' }));
    const r = await ctx.ui.modal({
        titulo: 'Captura sin terminar',
        contenido,
        botones: [
            { texto: 'Descartar', valor: 'descartar', peligro: true },
            { texto: 'Más tarde', valor: null },
            { texto: 'Guardar en la base', valor: 'guardar', primario: true }
        ]
    });
    if (!R || R.fase !== 'prep') return;
    if (r === 'descartar') {
        const ok = await ctx.ui.confirmar('La codificación se pierde. El video, si había, queda en la carpeta de trabajo.', { titulo: 'Descartar la captura', peligro: true });
        if (ok) await borrarRespaldo();
        return;
    }
    if (r !== 'guardar') return;
    R.fase = 'cerrando';
    cambiarPantalla(null);
    const cerrando = montarCerrando(R.contenedor);
    try {
        const res = await recuperarRespaldo(ctx.api, respaldo, cerrando.paso);
        cerrando.destruir();
        R.config = respaldo.meta;
        mostrarResultado(res);
    } catch (err) {
        cerrando.destruir();
        mostrarError(err);
    }
}

export default {
    id: 'captura',
    titulo: 'Captura en vivo',
    icono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
    descripcion: 'Grabá y codificá el partido',

    async montar(contenedor, ctx) {
        R = nuevo(contenedor, ctx);
        contenedor.classList.add('tv-captura');
        try { R.ajustes = (await ctx.api.ajustes.leer()) || {}; } catch (_) { R.ajustes = {}; }
        R.grabadora = crearGrabadora({ destino: ctx.api.video, calidad: R.ajustes.calidad });
        mostrarPreparacion(ctx);
        ofrecerRespaldo();
    },

    async desmontar() {
        if (!R) return true;
        const { ctx } = R;
        if (R.fase === 'cerrando') {
            ctx.ui.aviso('Esperá a que termine de guardar el partido.', 'aviso');
            return false;
        }
        if (R.fase === 'cod' && R.cod && R.cod.enCurso()) {
            const grabando = R.grabadora && R.grabadora.estado().grabando;
            const r = await ctx.ui.modal({
                titulo: grabando ? 'Estás grabando' : 'El partido está en curso',
                contenido: el('p', { class: 'tv-texto-2', texto: grabando
                    ? 'Para salir hay que terminar el partido: se cierra el video y se guarda todo en la base.'
                    : 'Para salir hay que terminar el partido y guardarlo en la base.' }),
                botones: [
                    { texto: 'Seguir codificando', valor: null },
                    { texto: 'Terminar y guardar', valor: 'terminar', primario: true }
                ]
            });
            // Se queda en la rama: terminar muestra dónde quedó todo, y
            // desde ahí se va a donde se quiera.
            if (r === 'terminar') terminar();
            return false;
        }
        soltarCodificacion();
        if (R.pantalla) { try { R.pantalla.destruir(); } catch (_) {} }
        if (R.grabadora) R.grabadora.destruir();
        R = null;
        return true;
    }
};
