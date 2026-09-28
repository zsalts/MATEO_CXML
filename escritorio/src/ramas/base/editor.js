// Editor de plantillas en la compu: armar la botonera como en el iPad, con
// el mouse, y ponerle a cada botón la tecla que lo toca en la captura.
//
// Se dibuja con la misma vista que la captura (nucleo/botonera-vista.js en
// modo miniatura), así lo que ves acá es exactamente lo que vas a tocar en
// vivo. Encima va una capa transparente con una caja por elemento: esa capa
// es la que se agarra, se arrastra y se estira. Las coordenadas son las de la
// plantilla, a escala 1, igual que en el iPad.
//
// abrirEditor(ctx, { id, nombre, datos, alCerrar }) → { el, teclas(e), puedeSalir() }
// alCerrar(idGuardado | null) se llama al volver.

import { h, llenar, boton, crearIcono } from './comun.js';
import { NOMBRE_TIPO } from './logica.js';
import {
    crearElemento, buscar, moverElementos, idsQueSeMueven, redimensionar, borrarElementos,
    duplicarElementos, enlazado, enlazar, ponerExcluyente, ponerEnLinea, agregarHoja, borrarHoja,
    teclaDeEvento, quienUsa, ponerAtajo, atajosAutomaticos, rejilla
} from './editor-logica.js';
import { normalizar, elementosDeHoja, cajaDeHoja, colorPorDefecto, excluyentesDe } from '../../nucleo/plantilla.js';
import { crearVista } from '../../nucleo/botonera-vista.js';
import { teclaMod, textoAtajo } from '../../ui/plataforma.js';

// La paleta, en el orden en que se usan al armar una botonera.
const PALETA = [
    { tipo: 'event',        ayuda: 'Marca un momento del partido: es lo que después se corta como clip' },
    { tipo: 'descriptor',   ayuda: 'Se pega al último evento' },
    { tipo: 'sticky_label', ayuda: 'Queda prendida y se pega a todo lo que marques mientras tanto' },
    { tipo: 'popup_label',  ayuda: 'Aparece al tocar su evento (ponela en el mismo contenedor o enlazala)' },
    { tipo: 'counter',      ayuda: 'Cuenta cuántas veces se tocaron los eventos enlazados' },
    { tipo: 'line',         ayuda: 'Prende o apaga varios eventos juntos (jugadores de una línea)' },
    { tipo: 'possession',   ayuda: 'Posesión: una mitad por equipo' },
    { tipo: 'teams',        ayuda: 'Nombres y colores de los equipos' },
    { tipo: 'container',    ayuda: 'Un recuadro para agrupar: lo que tiene adentro se mueve con él' },
    { tipo: 'text',         ayuda: 'Un título' },
    { tipo: 'image',        ayuda: 'Una imagen (un escudo, una cancha)' }
];

// Los que se tocan con una tecla en la captura. La posesión no: necesita
// saber de qué equipo, y eso es la mitad que tocás con el mouse.
const CON_TECLA = new Set(['event', 'descriptor', 'sticky_label', 'popup_label', 'line', 'counter']);
const CON_NOMBRE = new Set(['event', 'descriptor', 'sticky_label', 'popup_label', 'line', 'counter', 'text']);
const CON_COLOR = new Set(['event', 'descriptor', 'sticky_label', 'popup_label', 'line', 'counter', 'container', 'text']);

const MAX_IMAGEN = 3 * 1024 * 1024;

export function abrirEditor(ctx, { id = null, nombre = '', datos: original, alCerrar }) {
    let datos = normalizar(original);
    let idPlantilla = id;
    let nombreActual = nombre;
    let guardado = JSON.stringify(datos);
    let nombreGuardado = nombre;
    let hoja = null;
    let sel = new Set();                 // ids (texto) elegidos
    const deshacer = [], rehacer = [];
    let juntarCon = null;                // cambios seguidos del mismo campo = un solo deshacer
    let ocupado = false;

    // ── Armado ───────────────────────────────
    const campoNombre = h('input', {
        class: 'tv-campo tv-ed__nombre', value: nombre, placeholder: 'Nombre de la plantilla', spellcheck: 'false',
        'aria-label': 'Nombre de la plantilla',
        oninput: () => { nombreActual = campoNombre.value; pintarEstado(); }
    });
    const btnDeshacer = boton('', { icono: 'flecha-izq', clase: 'tv-btn--chico tv-btn--icono', titulo: `Deshacer (${textoAtajo('Mod+Z')})`, alHacer: () => pasoHistoria(-1) });
    const btnRehacer = boton('', { icono: 'flecha-der', clase: 'tv-btn--chico tv-btn--icono', titulo: `Rehacer (${textoAtajo('Mod+Y')})`, alHacer: () => pasoHistoria(1) });
    const estado = h('span', { class: 'tv-chica tv-texto-2 tv-ed__estado' });
    const btnGuardar = boton('Guardar', { icono: 'check', clase: 'tv-btn--primario tv-btn--chico', titulo: `Guardar (${textoAtajo('Mod+S')})`, alHacer: () => guardar() });

    const barra = h('div', { class: 'tv-barra tv-ed__barra' },
        boton('Volver', { icono: 'atras', clase: 'tv-btn--chico', alHacer: () => cerrar() }),
        campoNombre,
        h('span', { class: 'tv-barra__separador' }),
        btnDeshacer, btnRehacer,
        boton('Teclas solas', { icono: 'teclado', clase: 'tv-btn--chico', titulo: 'Le pone una tecla libre a cada botón que no tiene (la inicial del nombre si está libre)', alHacer: () => teclasSolas() }),
        h('span', { class: 'tv-barra__espacio' }),
        estado, btnGuardar);

    const paleta = h('div', { class: 'tv-ed__paleta', 'aria-label': 'Agregar' },
        h('div', { class: 'tv-ed__paleta-titulo tv-chica tv-texto-2' }, 'Agregar'),
        ...PALETA.map(p => h('button', {
            type: 'button', class: 'tv-ed__pieza', draggable: 'true', title: p.ayuda + '. Clic o arrastrá al lienzo.',
            onclick: () => agregar(p.tipo),
            ondragstart: ev => { ev.dataTransfer.setData('application/x-tv-tipo', p.tipo); ev.dataTransfer.effectAllowed = 'copy'; }
        }, h('i', { class: 'tv-ed__muestra', 'data-tipo': p.tipo, style: { background: colorPorDefecto(p.tipo) || 'transparent' } }),
           h('span', {}, NOMBRE_TIPO[p.tipo]))));

    const hojasBarra = h('div', { class: 'tv-ed__hojas', role: 'tablist' });
    const vistaCaja = h('div', { class: 'tv-ed__vista' });
    const flechas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    flechas.setAttribute('class', 'tv-ed__flechas');
    const capa = h('div', { class: 'tv-ed__capa' });
    const lienzo = h('div', { class: 'tv-ed__lienzo' }, vistaCaja, flechas, capa);
    const scroll = h('div', { class: 'tv-ed__scroll' }, lienzo);
    const inspector = h('div', { class: 'tv-ed__inspector' });

    const el = h('div', { class: 'tv-ed' }, barra,
        h('div', { class: 'tv-ed__cuerpo' },
            paleta,
            h('div', { class: 'tv-ed__centro' }, hojasBarra, scroll),
            inspector));

    const vista = crearVista(vistaCaja, datos, { hoja: null, ajustar: false, modo: 'miniatura', mostrarAtajos: false });

    // ── Historia ─────────────────────────────
    function registrar(antes, juntar = null) {
        if (!(juntar && juntar === juntarCon)) {
            deshacer.push(antes);
            if (deshacer.length > 200) deshacer.shift();
        }
        juntarCon = juntar;
        rehacer.length = 0;
    }

    // cambiar(fn): fn cambia `datos` en el lugar. Si no cambió nada, no queda
    // un paso vacío en el deshacer.
    function cambiar(fn, { juntar = null, inspector: conInspector = true } = {}) {
        const antes = JSON.stringify(datos);
        const r = fn(datos);
        if (JSON.stringify(datos) === antes) return r;
        registrar(antes, juntar);
        repintar({ inspector: conInspector });
        return r;
    }

    function pasoHistoria(dir) {
        const de = dir < 0 ? deshacer : rehacer, a = dir < 0 ? rehacer : deshacer;
        if (!de.length) return;
        a.push(JSON.stringify(datos));
        datos = JSON.parse(de.pop());
        juntarCon = null;
        if (hoja && !datos.hojas.some(x => x.id === hoja)) hoja = null;
        sel = new Set([...sel].filter(x => buscar(datos, x)));
        vista.mostrarHoja(hoja);
        repintar();
    }

    const sucio = () => JSON.stringify(datos) !== guardado || nombreActual.trim() !== nombreGuardado;

    function pintarEstado() {
        const s = sucio();
        estado.textContent = s ? 'Sin guardar' : (idPlantilla != null ? 'Guardada' : '');
        estado.classList.toggle('es-sucio', s);
        btnDeshacer.disabled = !deshacer.length;
        btnRehacer.disabled = !rehacer.length;
    }

    // ── Pintar ───────────────────────────────
    function repintar({ inspector: conInspector = true } = {}) {
        vista.actualizar(datos);
        pintarCapa();
        pintarHojas();
        if (conInspector) pintarInspector();
        pintarEstado();
    }

    const aLaVista = () => {
        const lista = elementosDeHoja(datos, hoja);
        const fondo = e => e.type === 'container' || e.type === 'image';
        return lista.filter(fondo).concat(lista.filter(e => !fondo(e)));
    };

    function medirLienzo() {
        const caja = cajaDeHoja(elementosDeHoja(datos, hoja));
        const w = Math.max(caja.w + 400, scroll.clientWidth);
        const alto = Math.max(caja.h + 300, scroll.clientHeight);
        lienzo.style.width = w + 'px';
        lienzo.style.height = alto + 'px';
        flechas.setAttribute('width', w);
        flechas.setAttribute('height', alto);
    }

    function pintarCapa() {
        medirLienzo();
        const cajas = aLaVista().map(e => {
            const elegida = sel.has(String(e.id));
            const c = h('div', {
                class: 'tv-ed__caja' + (elegida ? ' es-elegida' : '') + (e.type === 'container' ? ' es-fondo' : ''),
                'data-id': String(e.id), title: (e.name || NOMBRE_TIPO[e.type]) + (e.atajo ? ` · tecla ${e.atajo.toUpperCase()}` : '')
            });
            ubicarCaja(c, e);
            if (e.atajo) c.appendChild(h('span', { class: 'tv-ed__tecla' }, e.atajo.toUpperCase()));
            if (elegida && sel.size === 1) c.appendChild(h('span', { class: 'tv-ed__tirador', title: 'Arrastrá para cambiar el tamaño' }));
            return c;
        });
        llenar(capa, ...cajas);
        dibujarFlechas();
    }

    function ubicarCaja(c, e) {
        c.style.left = e.x + 'px';
        c.style.top = e.y + 'px';
        c.style.width = e.w + 'px';
        c.style.height = e.h + 'px';
    }

    // Mientras se arrastra no se redibuja todo: se corren el botón y su caja.
    function ubicar(e) {
        const n = vista.nodo(e.id);
        if (n) ubicarCaja(n, e);
        const c = capa.querySelector(`[data-id="${CSS.escape(String(e.id))}"]`);
        if (c) ubicarCaja(c, e);
    }

    // Las flechas del iPad: de un evento a su emergente o a su contador.
    function dibujarFlechas() {
        const aca = new Set(elementosDeHoja(datos, hoja).map(e => String(e.id)));
        const ns = 'http://www.w3.org/2000/svg';
        flechas.replaceChildren();
        const defs = document.createElementNS(ns, 'defs');
        defs.innerHTML = '<marker id="tv-ed-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>';
        flechas.appendChild(defs);
        (datos.links || []).forEach(l => {
            if (!aca.has(String(l.fromId)) || !aca.has(String(l.toId))) return;
            const a = buscar(datos, l.fromId), b = buscar(datos, l.toId);
            if (!a || !b) return;
            const p1 = borde(a, b), p2 = borde(b, a);
            const ln = document.createElementNS(ns, 'line');
            ln.setAttribute('x1', p1.x); ln.setAttribute('y1', p1.y);
            ln.setAttribute('x2', p2.x); ln.setAttribute('y2', p2.y);
            ln.setAttribute('marker-end', 'url(#tv-ed-punta)');
            if (sel.has(String(a.id)) || sel.has(String(b.id))) ln.setAttribute('class', 'es-elegida');
            flechas.appendChild(ln);
        });
    }

    // El punto del borde de `a` que mira hacia el centro de `b`.
    function borde(a, b) {
        const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
        const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy;
        if (!dx && !dy) return { x: cx, y: cy };
        const k = Math.min(Math.abs((a.w / 2) / (dx || 1e-9)), Math.abs((a.h / 2) / (dy || 1e-9)));
        return { x: cx + dx * k, y: cy + dy * k };
    }

    function pintarHojas() {
        const pestana = (hid, texto) => h('button', {
            type: 'button', role: 'tab', class: 'tv-ed__hoja', 'aria-selected': String(hid === hoja),
            title: hid ? 'Doble clic para renombrar' : 'La botonera que se ve al empezar',
            onclick: () => irAHoja(hid),
            ondblclick: () => hid && renombrarHoja(hid)
        }, texto);
        llenar(hojasBarra,
            pestana(null, 'Principal'),
            ...datos.hojas.map(x => pestana(x.id, x.name || 'Pestaña')),
            h('button', { type: 'button', class: 'tv-ed__hoja tv-ed__hoja--mas', title: 'Una pestaña de detalle: se abre al tocar un evento y ahí se eligen sus etiquetas', onclick: () => nuevaHoja() },
                crearIcono('mas'), h('span', {}, 'Pestaña')));
    }

    function irAHoja(hid) {
        if (hid === hoja) return;
        hoja = hid;
        sel.clear();
        vista.mostrarHoja(hoja);
        scroll.scrollTo(0, 0);
        repintar();
    }

    async function nuevaHoja(desdeEvento = null) {
        const n = await ctx.ui.pedirTexto('Nueva pestaña', desdeEvento ? (buscar(datos, desdeEvento)?.name || '') : '', { etiqueta: 'Nombre', placeholder: 'Ej.: Resultado del tiro' });
        if (!n || !n.trim()) return null;
        const nueva = cambiar(d => {
            const x = agregarHoja(d, n.trim());
            if (desdeEvento != null) { const e = buscar(d, desdeEvento); if (e) e.subHojaId = x.id; }
            return x;
        });
        if (!desdeEvento && nueva) irAHoja(nueva.id);
        return nueva;
    }

    async function renombrarHoja(hid) {
        const x = datos.hojas.find(o => o.id === hid);
        if (!x) return;
        const n = await ctx.ui.pedirTexto('Renombrar pestaña', x.name, { etiqueta: 'Nombre' });
        if (n && n.trim()) cambiar(d => { d.hojas.find(o => o.id === hid).name = n.trim(); });
    }

    // ── Agregar ──────────────────────────────
    function agregar(tipo, donde = null) {
        const e = cambiar(d => crearElemento(d, tipo, { hoja, donde }), { inspector: false });
        if (!e) return;
        sel = new Set([String(e.id)]);
        pintarCapa();
        pintarInspector();
        const c = capa.querySelector(`[data-id="${CSS.escape(String(e.id))}"]`);
        if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        // Lo primero que se hace con un botón nuevo es ponerle nombre.
        const campo = inspector.querySelector('[data-campo="nombre"]');
        if (campo) { campo.focus(); campo.select(); }
    }

    lienzo.addEventListener('dragover', ev => {
        if (ev.dataTransfer.types.includes('application/x-tv-tipo')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; }
    });
    lienzo.addEventListener('drop', ev => {
        const tipo = ev.dataTransfer.getData('application/x-tv-tipo');
        if (!tipo) return;
        ev.preventDefault();
        const p = punto(ev);
        agregar(tipo, { x: p.x - 20, y: p.y - 15 });
    });

    function punto(ev) {
        const r = lienzo.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    // ── Mouse sobre el lienzo ────────────────
    capa.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        const tirador = ev.target.closest('.tv-ed__tirador');
        const caja = ev.target.closest('.tv-ed__caja');
        ev.preventDefault();
        if (document.activeElement && inspector.contains(document.activeElement)) document.activeElement.blur();
        if (tirador) return estirar(ev, caja.dataset.id);
        if (caja) {
            const cid = caja.dataset.id;
            if (ev.shiftKey || teclaMod(ev)) {
                if (sel.has(cid)) sel.delete(cid); else sel.add(cid);
                pintarCapa(); pintarInspector();
                return;
            }
            if (!sel.has(cid)) { sel = new Set([cid]); pintarCapa(); pintarInspector(); }
            return arrastrar(ev);
        }
        marco(ev);
    });

    capa.addEventListener('dblclick', ev => {
        if (!ev.target.closest('.tv-ed__caja')) return;
        const campo = inspector.querySelector('[data-campo="nombre"]');
        if (campo) { campo.focus(); campo.select(); }
    });

    // Un gesto de mouse: `mover(dx, dy, ev)` en cada paso, `fin(huboMovimiento)`.
    function gesto(ev, mover, fin) {
        const x0 = ev.clientX, y0 = ev.clientY;
        let movio = false;
        capa.setPointerCapture(ev.pointerId);
        const alMover = e => {
            const dx = e.clientX - x0, dy = e.clientY - y0;
            if (!movio && Math.abs(dx) + Math.abs(dy) < 3) return;
            movio = true;
            mover(dx, dy, e);
        };
        const alSoltar = () => {
            capa.removeEventListener('pointermove', alMover);
            capa.removeEventListener('pointerup', alSoltar);
            capa.removeEventListener('pointercancel', alSoltar);
            fin(movio);
        };
        capa.addEventListener('pointermove', alMover);
        capa.addEventListener('pointerup', alSoltar);
        capa.addEventListener('pointercancel', alSoltar);
    }

    // Alt suelta la rejilla, para acomodar al píxel.
    const paso = (v, e) => e.altKey ? Math.round(v) : rejilla(v);

    function arrastrar(ev) {
        const antes = JSON.stringify(datos);
        const ids = idsQueSeMueven(datos, [...sel]);
        const orig = new Map(ids.map(i => { const e = buscar(datos, i); return [String(i), { x: e.x, y: e.y }]; }));
        const minX = Math.min(...[...orig.values()].map(o => o.x)), minY = Math.min(...[...orig.values()].map(o => o.y));
        gesto(ev, (dx, dy, e) => {
            // Nada se va más allá del borde de arriba o de la izquierda.
            const mx = Math.max(-minX, paso(dx, e)), my = Math.max(-minY, paso(dy, e));
            ids.forEach(i => {
                const x = buscar(datos, i), o = orig.get(String(i));
                x.x = o.x + mx; x.y = o.y + my;
                ubicar(x);
            });
            dibujarFlechas();
        }, movio => {
            if (!movio) return;
            registrar(antes);
            repintar();
        });
    }

    function estirar(ev, cid) {
        const antes = JSON.stringify(datos);
        const e = buscar(datos, cid);
        const w0 = e.w, h0 = e.h;
        gesto(ev, (dx, dy, m) => {
            redimensionar(datos, cid, paso(w0 + dx, m), paso(h0 + dy, m));
            ubicar(e);
            dibujarFlechas();
        }, movio => {
            if (!movio) return;
            registrar(antes);
            repintar();
        });
    }

    // Arrastrar en un lugar vacío elige todo lo que toca el recuadro.
    function marco(ev) {
        const p0 = punto(ev);
        const sumar = ev.shiftKey || teclaMod(ev);
        const base = sumar ? new Set(sel) : new Set();
        const rect = h('div', { class: 'tv-ed__marco' });
        gesto(ev, (_dx, _dy, e) => {
            const p = punto(e);
            const r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
            if (!rect.isConnected) capa.appendChild(rect);
            ubicarCaja(rect, r);
            sel = new Set(base);
            elementosDeHoja(datos, hoja).forEach(x => {
                if (x.x < r.x + r.w && r.x < x.x + x.w && x.y < r.y + r.h && r.y < x.y + x.h) sel.add(String(x.id));
            });
            capa.querySelectorAll('.tv-ed__caja').forEach(c => c.classList.toggle('es-elegida', sel.has(c.dataset.id)));
        }, movio => {
            rect.remove();
            if (!movio && !sumar) sel.clear();
            pintarCapa();
            pintarInspector();
        });
    }

    // ── Inspector ────────────────────────────
    function fila(etiqueta, control, ayuda) {
        return h('label', { class: 'tv-ed__campo' },
            h('span', { class: 'tv-ed__etiqueta' }, etiqueta),
            control,
            ayuda ? h('span', { class: 'tv-ed__ayuda tv-chica tv-texto-2' }, ayuda) : null);
    }

    function seccion(titulo, ...hijos) {
        return h('section', { class: 'tv-ed__seccion' }, titulo ? h('h3', {}, titulo) : null, ...hijos);
    }

    function numero(valor, alCambiar, { min = 0, max = 99999, pasoN = 1 } = {}) {
        return h('input', {
            class: 'tv-campo tv-numeros', type: 'number', value: String(valor), min: String(min), max: String(max), step: String(pasoN),
            onchange: ev => {
                const v = Number(ev.target.value);
                if (Number.isFinite(v)) alCambiar(Math.max(min, Math.min(max, v)));
            }
        });
    }

    function casilla(texto, marcada, alCambiar, extra = null) {
        return h('label', { class: 'tv-ed__casilla' },
            h('input', { type: 'checkbox', checked: !!marcada, onchange: ev => alCambiar(ev.target.checked) }),
            h('span', {}, texto), extra ? h('span', { class: 'tv-chica tv-texto-2' }, extra) : null);
    }

    const nombreHoja = hid => hid ? ((datos.hojas.find(x => x.id === hid) || {}).name || 'Pestaña') : 'Principal';
    const rotulo = e => e.name || NOMBRE_TIPO[e.type];

    // Una lista de casillas con scroll, para elegir botones.
    function lista(elementos, marcado, alCambiar, vacioTexto) {
        if (!elementos.length) return h('div', { class: 'tv-chica tv-texto-2' }, vacioTexto);
        return h('div', { class: 'tv-ed__lista' }, ...elementos.map(x =>
            casilla(rotulo(x), marcado(x), si => alCambiar(x, si), x.hoja !== hoja ? nombreHoja(x.hoja) : null)));
    }

    function pintarInspector() {
        const elegidos = [...sel].map(x => buscar(datos, x)).filter(Boolean);
        if (elegidos.length === 1) return llenar(inspector, ...inspectorDe(elegidos[0]));
        if (elegidos.length > 1) {
            return llenar(inspector, seccion(`${elegidos.length} elementos`,
                h('div', { class: 'tv-ed__acciones' },
                    boton('Duplicar', { icono: 'copia', clase: 'tv-btn--chico', alHacer: duplicar }),
                    boton('Borrar', { icono: 'basura', clase: 'tv-btn--chico tv-btn--peligro', alHacer: borrar })),
                h('p', { class: 'tv-chica tv-texto-2' }, 'Arrastrá cualquiera para moverlos juntos. Flechas: de a 1 px; con Shift, de a 10.')));
        }
        llenar(inspector, ...(hoja ? inspectorHoja() : inspectorPlantilla()));
    }

    function inspectorPlantilla() {
        const conTecla = datos.elements.filter(e => e.atajo).sort((a, b) => a.atajo.localeCompare(b.atajo));
        const sinTecla = datos.elements.filter(e => CON_TECLA.has(e.type) && !e.atajo).length;
        return [
            seccion('Plantilla',
                h('p', { class: 'tv-chica tv-texto-2' },
                    'Agregá botones desde la izquierda (clic o arrastrando) y acomodalos con el mouse. ',
                    'Elegí un botón para cambiarle el nombre, el color, los segundos del clip y la tecla.')),
            seccion('Teclas para la captura',
                h('p', { class: 'tv-chica tv-texto-2' },
                    'En la Captura en vivo cada tecla toca su botón: marca el evento y deja el clip listo para cortar. ',
                    'Espacio es PLAY/PAUSA y R ve el último evento (si le das la R a un botón, gana el botón).'),
                conTecla.length
                    ? h('div', { class: 'tv-ed__teclas' }, ...conTecla.map(e => h('button', {
                        type: 'button', class: 'tv-ed__tecla-fila', onclick: () => elegirYVer(e)
                    }, h('span', { class: 'tv-tecla' }, e.atajo.toUpperCase()), h('span', { class: 'tv-recortar' }, rotulo(e)),
                       h('span', { class: 'tv-chica tv-texto-2' }, nombreHoja(e.hoja)))))
                    : h('p', { class: 'tv-chica tv-texto-2' }, 'Todavía ningún botón tiene tecla.'),
                sinTecla ? boton(`Poner teclas a los ${sinTecla} que faltan`, { icono: 'teclado', clase: 'tv-btn--chico', alHacer: teclasSolas }) : null),
            seccion('Atajos del editor',
                h('ul', { class: 'tv-ed__atajos tv-chica tv-texto-2' },
                    h('li', {}, 'Supr: borrar · ', textoAtajo('Mod+D'), ': duplicar · ', textoAtajo('Mod+A'), ': elegir todo'),
                    h('li', {}, 'Flechas: mover · Alt al arrastrar: sin rejilla'),
                    h('li', {}, textoAtajo('Mod+Z'), ' / ', textoAtajo('Mod+Y'), ': deshacer / rehacer · ', textoAtajo('Mod+S'), ': guardar')))
        ];
    }

    function inspectorHoja() {
        const x = datos.hojas.find(o => o.id === hoja);
        if (!x) return [];
        const quienes = datos.elements.filter(e => e.subHojaId != null && String(e.subHojaId) === hoja);
        const cuantas = h('select', {
            class: 'tv-campo', onchange: ev => cambiar(d => { d.hojas.find(o => o.id === hoja).etiquetas = Number(ev.target.value); })
        }, ...[1, 2, 3, 4, 5].map(n => h('option', { value: String(n) }, n === 1 ? '1 (se cierra al tocarla)' : String(n))));
        cuantas.value = String(x.etiquetas || 1);
        return [
            seccion('Pestaña',
                fila('Nombre', h('input', {
                    class: 'tv-campo', value: x.name, 'data-campo': 'nombre',
                    oninput: ev => cambiar(d => { d.hojas.find(o => o.id === hoja).name = ev.target.value; }, { juntar: 'hoja' + hoja, inspector: false })
                })),
                fila('Etiquetas que se eligen', cuantas, 'Cuando se eligen todas, la pestaña se cierra sola y vuelve a la Principal.'),
                h('div', { class: 'tv-chica tv-texto-2' }, quienes.length
                    ? 'La abre: ' + quienes.map(rotulo).join(', ')
                    : 'Ningún evento la abre todavía: elegí un evento en la Principal y en "Al tocarlo abre" elegí esta pestaña.'),
                h('div', { class: 'tv-ed__acciones' },
                    boton('Borrar pestaña', { icono: 'basura', clase: 'tv-btn--chico tv-btn--peligro', alHacer: async () => {
                        const n = elementosDeHoja(datos, hoja).length;
                        const si = await ctx.ui.confirmar(`¿Borrar la pestaña "${x.name}"${n ? ` y sus ${n} botones` : ''}?`, { titulo: 'Borrar pestaña', peligro: true });
                        if (!si) return;
                        const hid = hoja;
                        hoja = null;
                        vista.mostrarHoja(null);
                        cambiar(d => borrarHoja(d, hid));
                    } })))
        ];
    }

    function inspectorDe(e) {
        const eid = e.id;
        const poner = (campo, valor, juntar) => cambiar(d => { buscar(d, eid)[campo] = valor; },
            { juntar: juntar ? campo + eid : null, inspector: !juntar });
        const partes = [];

        // Nombre, tecla y color: lo que se toca siempre.
        const general = [];
        if (CON_NOMBRE.has(e.type)) {
            general.push(fila('Nombre', h('input', {
                class: 'tv-campo', value: e.name, 'data-campo': 'nombre', spellcheck: 'false',
                oninput: ev => { poner('name', ev.target.value, true); dibujarFlechas(); }
            }), e.type === 'event' ? 'Así se llama la fila en el XML y el clip.' : null));
        }
        if (CON_TECLA.has(e.type)) general.push(fila('Tecla', campoTecla(e), 'Tocá el casillero y apretá la tecla. Supr la borra.'));
        if (CON_COLOR.has(e.type)) {
            const actual = e.color || colorPorDefecto(e.type) || '#ffffff';
            general.push(fila('Color', h('div', { class: 'tv-ed__color' },
                h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(actual) ? actual : '#3a8fd6',
                             oninput: ev => poner('color', ev.target.value, true) }),
                e.color ? boton('Por defecto', { clase: 'tv-btn--chico tv-btn--fantasma', alHacer: () => poner('color', null) }) : null)));
        }
        partes.push(seccion(NOMBRE_TIPO[e.type], ...general));

        if (e.type === 'event') partes.push(...inspectorEvento(e, poner));
        if (e.type === 'line') {
            const eventos = datos.elements.filter(x => x.type === 'event');
            partes.push(seccion('Jugadores',
                lista(eventos, x => (e.lineMemberIds || []).some(m => String(m) === String(x.id)),
                    (x, si) => cambiar(d => ponerEnLinea(d, eid, x.id, si)), 'Primero agregá un evento por jugador.'),
                casilla('Al entrar, baja a la otra línea', e.lineExclusive !== false, si => poner('lineExclusive', si))));
        }
        if (e.type === 'possession' || e.type === 'teams') {
            partes.push(seccion('Equipos',
                fila('Local', h('input', { class: 'tv-campo', value: e.equipoA || '', oninput: ev => poner('equipoA', ev.target.value, true) })),
                fila('Visitante', h('input', { class: 'tv-campo', value: e.equipoB || '', oninput: ev => poner('equipoB', ev.target.value, true) })),
                e.type === 'teams' ? h('div', { class: 'tv-ed__color' },
                    h('span', { class: 'tv-chica tv-texto-2' }, 'Colores'),
                    h('input', { type: 'color', value: e.colorA || '#3a8fd6', title: 'Local', oninput: ev => poner('colorA', ev.target.value, true) }),
                    h('input', { type: 'color', value: e.colorB || '#dc2626', title: 'Visitante', oninput: ev => poner('colorB', ev.target.value, true) })) : null));
        }
        if (e.type === 'text') {
            partes.push(seccion('Letra', fila('Tamaño', numero(parseInt(e.fontSize) || 18, v => poner('fontSize', v), { min: 8, max: 96 }))));
        }
        if (e.type === 'image') partes.push(inspectorImagen(e, poner));

        partes.push(seccion('Lugar y tamaño', h('div', { class: 'tv-ed__geo' },
            fila('X', numero(e.x, v => poner('x', v))), fila('Y', numero(e.y, v => poner('y', v))),
            fila('Ancho', numero(e.w, v => poner('w', v), { min: 24 })), fila('Alto', numero(e.h, v => poner('h', v), { min: 20 })))));
        partes.push(h('div', { class: 'tv-ed__acciones' },
            boton('Duplicar', { icono: 'copia', clase: 'tv-btn--chico', titulo: textoAtajo('Mod+D'), alHacer: duplicar }),
            boton('Borrar', { icono: 'basura', clase: 'tv-btn--chico tv-btn--peligro', titulo: 'Supr', alHacer: borrar })));
        return partes;
    }

    function inspectorEvento(e, poner) {
        const eid = e.id;
        const modo = h('select', { class: 'tv-campo', onchange: ev => poner('timeMode', ev.target.value) },
            h('option', { value: 'fixed' }, 'Tiempo fijo (un toque)'),
            h('option', { value: 'manual' }, 'Manual (un toque empieza, otro termina)'));
        modo.value = e.timeMode === 'manual' ? 'manual' : 'fixed';
        const equipo = h('select', { class: 'tv-campo', onchange: ev => poner('equipo', ev.target.value || null) },
            h('option', { value: '' }, 'Ninguno'), h('option', { value: 'A' }, 'Local'), h('option', { value: 'B' }, 'Visitante'));
        equipo.value = e.equipo === 'A' || e.equipo === 'B' ? e.equipo : '';
        const abre = h('select', {
            class: 'tv-campo', onchange: async ev => {
                const v = ev.target.value;
                if (v === '__nueva') { await nuevaHoja(eid); pintarInspector(); return; }
                poner('subHojaId', v || null);
            }
        }, h('option', { value: '' }, 'Nada'), ...datos.hojas.map(x => h('option', { value: x.id }, 'La pestaña ' + (x.name || ''))),
           h('option', { value: '__nueva' }, 'Una pestaña nueva…'));
        abre.value = e.subHojaId != null ? String(e.subHojaId) : '';

        const aca = elementosDeHoja(datos, e.hoja || null);
        const emergentes = aca.filter(x => x.type === 'popup_label');
        const contadores = datos.elements.filter(x => x.type === 'counter');
        const otros = datos.elements.filter(x => x.type === 'event' && x.id !== eid);
        const excl = new Set(excluyentesDe(datos, eid).map(String));

        return [
            seccion('Clip',
                h('div', { class: 'tv-ed__geo' },
                    fila('Segundos antes', numero(e.lead || 0, v => poner('lead', v), { max: 600 })),
                    fila('Segundos después', numero(e.lag ?? 1, v => poner('lag', v), { max: 600 }))),
                h('p', { class: 'tv-chica tv-texto-2' }, e.timeMode === 'manual'
                    ? 'Manual: el clip va desde "antes" del primer toque hasta el segundo toque más "después".'
                    : `El clip va de ${e.lead || 0} s antes del toque a ${e.lag ?? 1} s después.`),
                fila('Modo', modo),
                fila('Equipo', equipo, 'Un evento de un equipo corta los que están abiertos del otro y suma a la posesión.'),
                casilla('Mostrar cuántas veces se tocó', !!e.mostrarContador, si => poner('mostrarContador', si)),
                casilla('Corta a todos los demás al tocarlo', !!e.isExclusive, si => poner('isExclusive', si))),
            seccion('Al tocarlo',
                fila('Abre', abre, 'Una pestaña de detalle para elegir sus etiquetas.'),
                fila('Emergentes escritas', h('textarea', {
                    class: 'tv-campo', rows: '3', placeholder: 'Una por renglón', spellcheck: 'false',
                    onchange: ev => poner('popups', ev.target.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))
                }, (e.popups || []).join('\n')), 'Aparecen al lado del evento para elegir una.'),
                h('div', { class: 'tv-ed__subtitulo tv-chica' }, 'Emergentes enlazadas'),
                lista(emergentes, x => enlazado(datos, eid, x.id), (x, si) => cambiar(d => enlazar(d, eid, x.id, si)),
                    'No hay botones "Etiqueta emergente" en esta pestaña.'),
                h('div', { class: 'tv-ed__subtitulo tv-chica' }, 'Suma a los contadores'),
                lista(contadores, x => enlazado(datos, eid, x.id), (x, si) => cambiar(d => enlazar(d, eid, x.id, si)),
                    'No hay contadores.'),
                h('div', { class: 'tv-ed__subtitulo tv-chica' }, 'Cierra a estos (excluyentes)'),
                lista(otros, x => excl.has(String(x.id)), (x, si) => cambiar(d => ponerExcluyente(d, eid, x.id, si)),
                    'No hay otros eventos.'))
        ];
    }

    function inspectorImagen(e, poner) {
        const archivo = h('input', {
            type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', hidden: true,
            onchange: ev => {
                const f = ev.target.files && ev.target.files[0];
                if (!f) return;
                if (f.size > MAX_IMAGEN) { ctx.ui.aviso('La imagen es muy pesada (más de 3 MB). Achicala y probá de nuevo.', 'aviso'); return; }
                const lector = new FileReader();
                lector.onload = () => poner('src', String(lector.result));
                lector.readAsDataURL(f);
            }
        });
        const ajuste = h('select', { class: 'tv-campo', onchange: ev => poner('ajuste', ev.target.value) },
            h('option', { value: 'contain' }, 'Entera'), h('option', { value: 'cover' }, 'Llenar el recuadro'));
        ajuste.value = e.ajuste === 'cover' ? 'cover' : 'contain';
        return seccion('Imagen', archivo,
            boton(e.src ? 'Cambiar imagen' : 'Elegir imagen', { icono: 'importar', clase: 'tv-btn--chico', alHacer: () => archivo.click() }),
            fila('Cómo entra', ajuste),
            fila('Opacidad %', numero(parseInt(e.opacidad) || 100, v => poner('opacidad', v), { min: 5, max: 100 })));
    }

    // La tecla se toma del keydown, no del texto: "F5" o "ñ" andan igual y
    // no hace falta borrar antes de cambiar.
    function campoTecla(e) {
        const campo = h('input', {
            class: 'tv-campo tv-mono tv-ed__campo-tecla', value: e.atajo ? e.atajo.toUpperCase() : '', placeholder: '—',
            readonly: true, 'data-campo': 'tecla', 'aria-label': 'Tecla de ' + rotulo(e)
        });
        campo.addEventListener('keydown', ev => {
            if (ev.key === 'Tab' || ev.key === 'Escape') return;
            ev.preventDefault();
            ev.stopPropagation();
            if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph'].includes(ev.key)) return;
            if (teclaMod(ev)) return;
            const borrarla = ev.key === 'Backspace' || ev.key === 'Delete';
            const t = borrarla ? '' : teclaDeEvento(ev);
            if (!borrarla && !t) {
                ctx.ui.aviso('Esa tecla no sirve: usá una letra, un número, un símbolo o F1–F12. Espacio y las flechas son de la captura.', 'aviso');
                return;
            }
            const otro = quienUsa(datos, t, e.id);
            cambiar(d => ponerAtajo(d, e.id, t));
            if (otro) ctx.ui.aviso(`La ${t.toUpperCase()} era de "${rotulo(otro)}": ahora es de "${rotulo(e)}".`, 'info');
            const nuevo = inspector.querySelector('[data-campo="tecla"]');
            if (nuevo) nuevo.focus();
        });
        return campo;
    }

    function elegirYVer(e) {
        if ((e.hoja || null) !== hoja) irAHoja(e.hoja || null);
        sel = new Set([String(e.id)]);
        pintarCapa();
        pintarInspector();
        const c = capa.querySelector(`[data-id="${CSS.escape(String(e.id))}"]`);
        if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    // ── Acciones ─────────────────────────────
    function duplicar() {
        if (!sel.size) return;
        const copias = cambiar(d => duplicarElementos(d, [...sel]), { inspector: false });
        if (!copias) return;
        sel = new Set(copias.map(c => String(c.id)));
        pintarCapa();
        pintarInspector();
    }

    function borrar() {
        if (!sel.size) return;
        const ids = [...sel];
        sel.clear();
        cambiar(d => borrarElementos(d, ids));
    }

    function teclasSolas() {
        const n = cambiar(d => atajosAutomaticos(d));
        ctx.ui.aviso(n ? `Listo: ${n} ${n === 1 ? 'botón nuevo con tecla' : 'botones nuevos con tecla'}. Cambialas eligiendo cada botón.`
                       : 'Todos los botones ya tienen tecla.', n ? 'ok' : 'info');
    }

    async function guardar() {
        const n = nombreActual.trim();
        if (!n) { ctx.ui.aviso('Ponele un nombre a la plantilla.', 'aviso'); campoNombre.focus(); return false; }
        if (ocupado) return false;
        ocupado = true;
        btnGuardar.disabled = true;
        try {
            const r = await ctx.api.plantillas.guardar({ id: idPlantilla ?? undefined, nombre: n, datos: JSON.parse(JSON.stringify(datos)) });
            if (idPlantilla == null && r != null) idPlantilla = r;
            guardado = JSON.stringify(datos);
            nombreGuardado = n;
            ctx.ui.aviso('Plantilla guardada', 'ok');
            return true;
        } catch (err) {
            ctx.ui.aviso('No se pudo guardar: ' + ((err && err.message) || err), 'error');
            return false;
        } finally {
            ocupado = false;
            btnGuardar.disabled = false;
            pintarEstado();
        }
    }

    // ¿Se puede salir? Con cambios sin guardar, se pregunta.
    async function puedeSalir() {
        if (!sucio()) return true;
        const r = await ctx.ui.modal({
            titulo: 'Cambios sin guardar',
            contenido: h('p', { class: 'tv-modal__texto' }, `"${nombreActual.trim() || 'La plantilla'}" tiene cambios sin guardar.`),
            ancho: 440,
            botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Descartar', valor: 'descartar', peligro: true },
                      { texto: 'Guardar', valor: 'guardar', primario: true }]
        });
        if (r === 'guardar') return guardar();
        return r === 'descartar';
    }

    async function cerrar() {
        if (!(await puedeSalir())) return;
        destruir();
        if (alCerrar) alCerrar(idPlantilla);
    }

    // ── Teclado ──────────────────────────────
    // Lo llama la pestaña con el teclado libre (sin modal, sin estar
    // escribiendo). true = la tecla fue del editor.
    function teclas(e) {
        const mod = teclaMod(e);
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (mod && k === 's') { guardar(); return true; }
        if (mod && k === 'z') { pasoHistoria(e.shiftKey ? 1 : -1); return true; }
        if (mod && k === 'y') { pasoHistoria(1); return true; }
        if (mod && k === 'd') { duplicar(); return true; }
        if (mod && k === 'a') {
            sel = new Set(elementosDeHoja(datos, hoja).map(x => String(x.id)));
            pintarCapa(); pintarInspector();
            return true;
        }
        if (mod) return false;
        if (k === 'Delete' || k === 'Backspace') { borrar(); return true; }
        if (k === 'Escape') { if (!sel.size) return false; sel.clear(); pintarCapa(); pintarInspector(); return true; }
        const flecha = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (flecha && sel.size) {
            const n = e.shiftKey ? 10 : 1;
            const ids = idsQueSeMueven(datos, [...sel]);
            cambiar(d => moverElementos(d, ids, flecha[0] * n, flecha[1] * n), { juntar: 'flechas', inspector: true });
            return true;
        }
        return false;
    }

    // Lo que ocupa la botonera cambia con la ventana: el lienzo siempre llena
    // el hueco, para poder soltar un botón en cualquier lado.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => medirLienzo()) : null;
    if (ro) ro.observe(scroll);

    function destruir() {
        if (ro) ro.disconnect();
        try { vista.destruir(); } catch (_) { /* nada */ }
        el.remove();
    }

    repintar();

    return { el, teclas, puedeSalir, destruir, sucio };
}
