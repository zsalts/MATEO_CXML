// ─────────────────────────────────────────────
// RAMA BASE DE DATOS — partidos, clips, plantillas y playlists
// ─────────────────────────────────────────────
// Esto es solo la carcasa: las cuatro pestañas y el teclado. Cada pestaña
// vive en su archivo y expone lo mismo: { el, activar(params), teclas(e),
// pausar(), destruir() }. Se arman recién la primera vez que se abren (la de
// Clips lee todos los eventos de la base, no tiene sentido pagarlo si solo
// venís a ver un partido) y quedan armadas: volver a una pestaña no pierde
// el partido abierto ni la selección, solo refresca los datos.

import { h, iconoHTML, crearIcono, tecladoLibre, leerDisposicion } from './comun.js';
import { estadoGlobal } from '../../ui/index.js';
import { crearPestanaPartidos } from './partidos.js';
import { crearPestanaClips } from './clips.js';
import { crearPestanaPlantillas } from './plantillas.js';
import { crearPestanaPlaylists } from './playlists.js';

const PESTANAS = [
    { id: 'partidos',   titulo: 'Partidos',   icono: 'base',     crear: crearPestanaPartidos },
    { id: 'clips',      titulo: 'Clips',      icono: 'tijera',   crear: crearPestanaClips },
    { id: 'plantillas', titulo: 'Plantillas', icono: 'botonera', crear: crearPestanaPlantillas },
    { id: 'playlists',  titulo: 'Playlists',  icono: 'lista',    crear: crearPestanaPlaylists }
];

const CLAVE_PESTANA = 'tv_base_pestana';
function lsLeer() { try { return localStorage.getItem(CLAVE_PESTANA); } catch { return null; } }
function lsPoner(v) { try { localStorage.setItem(CLAVE_PESTANA, v); } catch { /* sin storage: no se recuerda */ } }

// Lo de la rama montada. Una sola a la vez: el router desmonta antes de montar.
let montada = null;

export default {
    id: 'base',
    titulo: 'Base de datos',
    icono: iconoHTML('base'),
    descripcion: 'Partidos, clips, plantillas y playlists',

    async montar(contenedor, ctx) {
        const disposicion = await leerDisposicion(ctx.api);
        const params = ctx.params || {};

        const pestanas = new Map();          // id → pestaña ya armada
        let actual = null;
        const botones = new Map();
        const cuerpo = h('div', { class: 'tv-base-cuerpo' });
        const barra = h('div', { class: 'tv-base-tabs', role: 'tablist' },
            ...PESTANAS.map(p => {
                const b = h('button', {
                    type: 'button', class: 'tv-base-tab', role: 'tab', 'aria-selected': 'false',
                    title: `${p.titulo}`, onclick: () => ir(p.id)
                }, crearIcono(p.icono), h('span', {}, p.titulo));
                botones.set(p.id, b);
                return b;
            }));
        const raiz = h('div', { class: 'tv-base' }, barra, cuerpo);
        contenedor.replaceChildren(raiz);

        let turno = 0;
        async function ir(id, extra = {}) {
            const def = PESTANAS.find(p => p.id === id) || PESTANAS[0];
            const mio = ++turno;
            if (actual && actual !== def.id) pestanas.get(actual)?.pausar();
            actual = def.id;
            lsPoner(def.id);
            botones.forEach((b, k) => b.setAttribute('aria-selected', String(k === def.id)));

            let p = pestanas.get(def.id);
            if (!p) {
                p = def.crear(ctx, { disposicion });
                pestanas.set(def.id, p);
                cuerpo.appendChild(p.el);
            }
            pestanas.forEach((x, k) => { x.el.hidden = k !== def.id; });
            ctx.miga?.(def.titulo);
            try { await p.activar(extra); }
            catch (err) {
                console.error('[base] no se pudo abrir la pestaña', def.id, err);
                if (mio === turno) ctx.ui.aviso(`No se pudo abrir ${def.titulo}: ${(err && err.message) || err}`, 'error');
            }
        }

        // Teclado: la pestaña visible decide. Si la usó, nadie más la ve (ni
        // el Ctrl+Z del navegador ni el scroll con la barra espaciadora).
        // Ctrl+1..6 y Ctrl+K no los toca ninguna pestaña: son del router.
        function alTeclear(e) {
            if (e.defaultPrevented || !tecladoLibre(e) || !actual) return;
            const p = pestanas.get(actual);
            if (p && p.teclas(e)) { e.preventDefault(); e.stopPropagation(); }
        }
        window.addEventListener('keydown', alTeclear);

        // Cambio de tema: la matriz está en un canvas y lee los colores a mano
        const dejarTema = estadoGlobal.alCambiar(clave => {
            if (clave === 'tema') pestanas.forEach(p => p.tema && p.tema());
        });

        montada = {
            desmontar() {
                window.removeEventListener('keydown', alTeclear);
                dejarTema();
                pestanas.forEach(p => { try { p.pausar(); p.destruir(); } catch (err) { console.error('[base] destruir', err); } });
                pestanas.clear();
            }
        };

        // Con partidoId (desde Inicio, Captura o Importar) se abre ese partido;
        // si no, la última pestaña que usaste.
        const tienePartido = params.partidoId !== undefined && params.partidoId !== null;
        const inicial = tienePartido ? 'partidos'
            : PESTANAS.some(p => p.id === params.pestana) ? params.pestana
            : lsLeer() || 'partidos';
        await ir(inicial, tienePartido ? { partidoId: params.partidoId } : {});
    },

    async desmontar() {
        if (montada) { montada.desmontar(); montada = null; }
        return true;
    }
};
