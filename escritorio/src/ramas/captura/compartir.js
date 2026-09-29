// Clips en vivo desde la Captura en vivo: se codifica en la compu y un iPad
// o iPhone, en la misma wifi, ve cada evento como clip unos segundos después.
//
// Es el mismo servidor de la Captura desde iPad (main/remoto.js), prendido en
// modo soloMirar: todo el que entra mira, por cualquiera de las direcciones,
// y nadie puede tocar la botonera. Se prende recién cuando se toca el botón.
// Los clips salen igual que en la otra captura (ramas/ipad/clips-vivo.js); a
// la franja del que mira le llega también el reloj y el REC (espejo.js).
//
// El servidor sigue prendido después de Terminar, para que el que mira pueda
// seguir viendo: lo apaga detener(), al salir de la rama o empezar otra.

import { clipDeVideo } from '../../nucleo/codificacion.js';
import { equipoDeBoton } from '../../nucleo/plantilla.js';
import { crearClipsEnVivo } from '../ipad/clips-vivo.js';
import { resumir, crearEmisor } from '../ipad/espejo.js';
import { el, icono, reloj } from './piezas.js';
import { seccionInternet } from '../ipad/internet.js';
import { crearEspejoBajo } from '../../nucleo/espejo-bajo.js';

// el() de piezas.js con html (el QR de internet.js).
const h = (tag, props, ...hijos) => {
    const { html, ...resto } = props || {};
    const n = el(tag, resto, ...hijos);
    if (html) n.innerHTML = html;
    return n;
};

const CADA_MS = 2000;       // se pregunta quién está (el aviso onCliente no llega en la Mac)
const REENVIO_MS = 5000;    // estado forzado: re-sincroniza el reloj del que mira

/**
 * @param o.ctx
 * @param o.config        lo de la preparación (nombre, local, visitante, cortarAuto)
 * @param o.motor
 * @param o.datos         la plantilla normalizada
 * @param o.grabadora     o null (codificando un archivo no hay nada que mandar)
 * @param o.subcarpeta    () => subcarpeta del partido
 */
export function crearCompartir(o) {
    const { ctx, config, motor, datos, grabadora: g } = o;
    const api = ctx.api;
    let conexion = null, clientes = [], timers = [], ffmpeg = false;
    const alCambiarOyentes = new Set();
    const avisarCambio = () => alCambiarOyentes.forEach(f => { try { f(); } catch (_) {} });

    const miran = () => clientes.filter(c => c.conectado).length;
    // La copia chica para los que miran por internet (solo compartiendo).
    const espejo = g ? crearEspejoBajo({ grabadora: g, api }) : null;
    const eq = { A: config.local || 'Local', B: config.visitante || 'Visitante' };

    const enVivo = crearClipsEnVivo({
        api,
        eventos: () => motor.estado().eventos,
        clipDe: ev => clipDeVideo(ev, motor.estado().mapa || []),
        // Solo con alguien mirando: si nadie entró, no se corta nada. El que
        // entra tarde recibe también lo anterior.
        video: () => {
            if (!conexion || !ffmpeg || !g || !clientes.length) return null;
            const s = g.estado();
            return s.grabando && s.ruta ? s.ruta : null;
        },
        // Con el corte automático prendido, esos clips ya van a Clips/: los
        // del que mira van aparte, para no tener cada evento dos veces.
        subcarpeta: () => o.subcarpeta() + (config.cortarAuto ? '/En vivo' : ''),
        equipoDe: ev => eq[equipoDeBoton(datos, ev.buttonId)] || null,
        nombreClip: m => `${m.nombre} ${reloj(m.inicio).replace(/:/g, '-')}`,
        alFallar: err => ctx.ui.aviso('No se pudo cortar un clip para el que mira: ' + ((err && err.message) || err), 'error')
    });

    const emisor = crearEmisor(m => api.remoto.enviar({ ...m, tServidor: Date.now() }).catch(() => {}));
    function emitir(forzar) {
        if (!conexion) return;
        const s = g ? g.estado() : null;
        emisor(resumir(motor.estado(), { datos, enCurso: true, rec: !!(s && s.grabando) }), { forzar });
    }

    async function prender() {
        if (conexion) return conexion;
        try { ffmpeg = !!(await api.clips.disponible()); } catch (_) { ffmpeg = false; }
        let puerto;
        try { puerto = (await api.ajustes.leer()).puertoRemoto; } catch (_) {}
        conexion = await api.remoto.iniciar({ soloMirar: true, puerto });
        clientes = [];
        let ultimoForzado = 0;
        timers.push(setInterval(async () => {
            let e = null;
            try { e = await api.remoto.estado(); } catch (_) {}
            if (espejo) espejo.revisar(!!(e && e.internet) && g.estado().grabando);
            if (e && Array.isArray(e.clientes)) {
                const antes = JSON.stringify(clientes.map(c => [c.dispositivo, c.conectado]));
                clientes = e.clientes;
                if (JSON.stringify(clientes.map(c => [c.dispositivo, c.conectado])) !== antes) {
                    enVivo.revisar();
                    emitir(true);
                    avisarCambio();
                }
            }
            const ahora = Date.now();
            emitir(ahora - ultimoForzado >= REENVIO_MS);
            if (ahora - ultimoForzado >= REENVIO_MS) ultimoForzado = ahora;
        }, CADA_MS));
        avisarCambio();
        return conexion;
    }

    // El QR, la dirección y el PIN. Se abre con el botón de la barra.
    async function mostrar() {
        if (!g) return ctx.ui.aviso('Codificando un archivo no hay video en vivo para mandar.', 'aviso');
        let c;
        try { c = await prender(); }
        catch (err) { return ctx.ui.aviso('No se pudo abrir el servidor: ' + ((err && err.message) || err), 'error'); }
        const url = c.urlClips;
        const qr = c.qrs && c.qrs[url];
        const lista = el('p', { class: 'tv-captura-compartir__quien' });
        const pintarQuien = () => {
            const n = miran();
            lista.textContent = n === 0 ? 'Todavía no entró nadie.' : n === 1 ? '1 aparato mirando.' : `${n} aparatos mirando.`;
        };
        pintarQuien();
        alCambiarOyentes.add(pintarQuien);
        const internet = seccionInternet({ api, ui: ctx.ui, h });
        const qrCaja = el('div', { class: 'tv-captura-compartir__qr' });
        if (qr) qrCaja.innerHTML = qr;   // SVG que genera la librería qrcode en main
        await ctx.ui.modal({
            titulo: 'Enlazar para ver cortes en vivo',
            contenido: el('div', { class: 'tv-captura-compartir' },
                el('p', { class: 'tv-texto-2', texto: 'En el otro iPad (misma wifi) abrí Tag & View → Ver cortes en vivo y escribí esta dirección, o apuntá la cámara al código. Ve la imagen en vivo todo el tiempo, y cada evento que marques le llega como clip.' }),
                qr ? qrCaja : null,
                el('div', { class: 'tv-captura-compartir__url', texto: url }),
                el('div', { class: 'tv-captura-compartir__pin' }, el('span', { texto: 'PIN' }), el('strong', { texto: c.pin })),
                ffmpeg ? null : el('p', { class: 'tv-captura-compartir__error', texto: 'No está ffmpeg: sin él no se pueden cortar los clips.' }),
                lista,
                internet.el),
            botones: [{ texto: 'Listo', valor: true, primario: true }]
        });
        internet.soltar();
        alCambiarOyentes.delete(pintarQuien);
    }

    // El botón de la barra: dice cuántos miran una vez prendido.
    function boton() {
        const texto = el('span', { texto: 'Enlazar cortes en vivo' });
        const b = el('button', { type: 'button', class: 'tv-btn', title: 'Ver los cortes en otro iPad o iPhone', onClick: () => mostrar() },
            icono('wifi'), texto);
        const pintar = () => {
            const n = miran();
            texto.textContent = conexion ? (n ? `Cortes en vivo · ${n} mirando` : 'Cortes en vivo · nadie') : 'Enlazar cortes en vivo';
        };
        alCambiarOyentes.add(pintar);
        return b;
    }

    return {
        boton,
        // Con cada cambio del motor.
        alCambiar() { if (conexion) { enVivo.revisar(); emitir(false); } },
        // Antes de mover el video (terminar.js).
        esperar: () => enVivo.esperar(),
        // Terminado: no se corta más, pero el que mira sigue viendo.
        terminar() {
            enVivo.apagar();
            if (espejo) espejo.revisar(false);
            timers.forEach(clearInterval);
            timers = [];
            if (conexion) api.remoto.enviar({ tipo: 'guardado', nombre: config.nombre }).catch(() => {});
        },
        async detener() {
            enVivo.apagar();
            if (espejo) espejo.destruir();
            timers.forEach(clearInterval);
            timers = [];
            if (conexion) { conexion = null; try { await api.remoto.detener(); } catch (_) {} }
        }
    };
}
