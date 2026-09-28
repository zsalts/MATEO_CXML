// Dibujar una botonera del iPad y tocarla en vivo.
//
// Es la parte de RENDER y AJUSTAR A LA PANTALLA de app.js que se ve en el
// modo Codificación: mismos colores, mismas formas, mismos lugares. No sabe
// nada de relojes ni de eventos: dibuja, avisa qué se tocó (alTocar) y se
// deja marcar desde afuera. pintar(estado) aplica de una el estado del motor
// (codificacion.js).
//
// Sin window.tv ni Electron: la usa la Captura en la compu, la página del
// iPad por wifi (Safari) y las miniaturas de la Base y del menú. Trae sus
// propios estilos (se inyectan una vez), así no depende de ninguna hoja de
// estilos de la app.
//
// AJUSTAR A LA PANTALLA: la botonera entera se achica para caber, con la
// misma disposición, y el lienzo queda sin scroll: cada botón está siempre
// en el mismo lugar y un toque al costado no corre nada. Las coordenadas de
// la plantilla no se tocan nunca: la escala es solo cómo se ve. Si ni
// achicada al mínimo entra, vuelve el scroll para poder llegar a todo.

import {
    normalizar, elementosDeHoja, cajaDeHoja, ubicarEmergentes, elemento, brillo, colorPorDefecto,
    nombresEquipos, coloresEquipos, atajos as leerAtajos, ANCHO_BOTON, ALTO_BOTON
} from './plantilla.js';
import { posesionDe } from './codificacion.js';

const ESCALA_MINIMA = 0.35;   // la de app.js: más chico, un botón no se puede tocar
// ¿El navegador tiene pointer events? Safari los tiene desde iOS 13.
const CON_PUNTERO = typeof window !== 'undefined' && 'PointerEvent' in window;

/**
 * @param contenedor  elemento donde se dibuja (ocupa todo su tamaño)
 * @param datos       plantilla { elements, links, hojas }
 * @param opciones.hoja          pestaña a mostrar (null = Principal)
 * @param opciones.alTocar       (elemento, eventoDOM, extra) => void.
 *        extra.equipo = 'A'|'B' en el botón de posesión. Las emergentes
 *        escritas en el evento llegan como { id:'<evento>#<n>', type:
 *        'popup_label', name, emergente:true }.
 * @param opciones.alCerrarDetalle () => void: "Volver sin elegir" / "Listo"
 * @param opciones.ajustar       true: achicar para que entre sin scroll
 * @param opciones.maxEscala     1: como el iPad, solo achica. Más = agranda
 * @param opciones.tactil        true: sin selección, sin zoom, sin rebote
 * @param opciones.modo          'vivo' | 'miniatura' (sin toques; se ven las emergentes)
 * @param opciones.tema          'auto' | 'oscuro' | 'claro'
 * @param opciones.mostrarAtajos true: la tecla chiquita en la esquina
 */
export function crearVista(contenedor, datos, opciones = {}) {
    inyectarEstilos();
    let d = normalizar(datos);
    const o = {
        hoja: null, alTocar: null, alCerrarDetalle: null, ajustar: true, maxEscala: 1, tactil: false,
        modo: 'vivo', tema: 'auto', mostrarAtajos: true, ...opciones
    };
    const vivo = o.modo !== 'miniatura';

    const raiz = document.createElement('div');
    raiz.className = 'tv-bv' + (o.tactil ? ' tv-bv--tactil' : '') + (vivo ? ' tv-bv--vivo' : ' tv-bv--miniatura');
    const lienzo = document.createElement('div');
    lienzo.className = 'tv-bv-lienzo';
    raiz.appendChild(lienzo);
    contenedor.appendChild(raiz);

    let hoja = o.hoja || null;
    let escala = 1;
    let nodos = new Map();         // id → nodo
    let temporales = [];           // botones de emergentes escritas
    let barraDetalle = null;
    let ultimoEstado = null;
    const marcas = new Map();      // id → 'activo'|'fijo'|'abierto'|'elegido'

    function tema() {
        if (o.tema === 'oscuro' || o.tema === 'claro') return o.tema;
        const t = document.documentElement.getAttribute('data-tema');
        // En la compu el tema de trabajo es el oscuro (sin atributo); en el
        // iPad, oscuro es data-tema="oscuro".
        return t === 'claro' ? 'claro' : 'oscuro';
    }

    function aplicarColoresEquipos() {
        const c = coloresEquipos(d);
        raiz.style.setProperty('--equipo-a', c.A);
        raiz.style.setProperty('--equipo-b', c.B);
        raiz.style.setProperty('--equipo-a-texto', brillo(c.A) > 150 ? '#000' : '#fff');
        raiz.style.setProperty('--equipo-b-texto', brillo(c.B) > 150 ? '#000' : '#fff');
    }

    function aLaVista() {
        const lista = elementosDeHoja(d, hoja);
        // Contenedores e imágenes primero: van detrás de los botones.
        const fondo = e => e.type === 'container' || e.type === 'image';
        return lista.filter(fondo).concat(lista.filter(e => !fondo(e)));
    }

    function dibujar() {
        raiz.classList.toggle('tv-bv--oscuro', tema() === 'oscuro');
        aplicarColoresEquipos();
        lienzo.textContent = '';
        nodos = new Map();
        temporales = [];
        const teclas = new Map();
        if (o.mostrarAtajos && vivo) leerAtajos(d).mapa.forEach((id, t) => teclas.set(id, t));
        const nombres = nombresEquipos(d);
        const frag = document.createDocumentFragment();

        aLaVista().forEach(e => {
            const div = document.createElement('div');
            div.className = 'tv-bv-el';
            div.dataset.eltype = e.type;
            div.dataset.id = String(e.id);
            div.style.left = e.x + 'px';
            div.style.top = e.y + 'px';
            div.style.width = e.w + 'px';
            div.style.height = e.h + 'px';
            div.style.zIndex = (e.type === 'container' || e.type === 'image') ? 1 : 10;
            const opaco = parseInt(e.transparencia);
            if (e.type !== 'image' && opaco > 0 && opaco < 100) div.style.opacity = opaco / 100;
            if (e.type === 'event' && (e.equipo === 'A' || e.equipo === 'B')) div.classList.add('tv-bv-equipo-' + e.equipo);

            if (e.type === 'text') {
                if (e.color && e.color.toLowerCase() !== colorPorDefecto('text')) div.style.color = e.color;
            } else if (e.type !== 'teams' && e.type !== 'image' && e.color && e.color !== colorPorDefecto(e.type)) {
                div.style.setProperty('--btn-color', e.color);
                div.classList.add('tv-bv-color');
                div.style.color = brillo(e.color) > 150 ? '#000' : '#fff';
            }

            if (e.type === 'container') {
                // vacío
            } else if (e.type === 'text') {
                const sp = span('tv-bv-texto', e.name);
                sp.style.fontSize = (parseInt(e.fontSize) || 18) + 'px';
                div.appendChild(sp);
            } else if (e.type === 'image') {
                if (e.src) {
                    const img = document.createElement('img');
                    img.className = 'tv-bv-img';
                    img.alt = '';
                    img.draggable = false;
                    img.src = e.src;
                    img.style.objectFit = e.ajuste === 'cover' ? 'cover' : 'contain';
                    img.style.opacity = (parseInt(e.opacidad) || 100) / 100;
                    div.appendChild(img);
                } else {
                    div.appendChild(span('', 'Sin imagen'));
                }
            } else if (e.type === 'teams') {
                const a = document.createElement('div'); a.className = 'tv-bv-eq-lado';
                a.append(span('tv-bv-eq-punto tv-bv-eq-a', ''), span('tv-bv-eq-nombre', e.equipoA || 'Local'));
                const b = document.createElement('div'); b.className = 'tv-bv-eq-lado';
                b.append(span('tv-bv-eq-nombre', e.equipoB || 'Visitante'), span('tv-bv-eq-punto tv-bv-eq-b', ''));
                div.append(a, span('tv-bv-eq-vs', 'vs'), b);
            } else if (e.type === 'possession') {
                ['A', 'B'].forEach(eq => {
                    const lado = document.createElement('div');
                    lado.className = 'tv-bv-pos-lado tv-bv-pos-' + eq;
                    lado.dataset.equipo = eq;
                    lado.append(span('tv-bv-pos-nombre', nombres[eq]));
                    if (vivo) lado.append(span('tv-bv-pos-pct', ''));
                    div.appendChild(lado);
                });
            } else if (e.type === 'counter') {
                div.appendChild(span('tv-bv-num', vivo ? '0' : e.name));
            } else if (e.type === 'event') {
                div.appendChild(span('tv-bv-nombre', e.name));
                if (vivo) {
                    div.appendChild(span('tv-bv-reloj', ''));   // turno en curso
                    div.appendChild(span('tv-bv-sub', ''));     // acumulado / lo que se ponga
                }
            } else if (e.type === 'line') {
                div.appendChild(span('tv-bv-nombre', e.name));
                div.appendChild(span('tv-bv-linea-sub', (e.lineMemberIds || []).length + ' jug.'));
            } else {
                div.appendChild(span('tv-bv-nombre', e.name));
            }

            if (e.type === 'event' && e.mostrarContador && vivo) div.appendChild(span('tv-bv-contador', '0'));
            if (teclas.has(e.id)) div.appendChild(span('tv-bv-atajo', teclas.get(e.id).toUpperCase()));

            // En vivo, las emergentes de la plantilla no se ven hasta que se
            // toca su evento. En la miniatura se ve todo.
            if (vivo && e.type === 'popup_label') div.classList.add('tv-bv-oculto');
            if (vivo && !['container', 'text', 'teams', 'image'].includes(e.type)) div.classList.add('tv-bv-tocable');

            frag.appendChild(div);
            nodos.set(String(e.id), div);
        });
        lienzo.appendChild(frag);
        marcas.forEach((m, id) => aplicarMarca(id, m));
        reajustar();
        if (ultimoEstado) pintar(ultimoEstado);
    }

    function span(clase, texto) {
        const s = document.createElement('span');
        if (clase) s.className = clase;
        s.textContent = texto == null ? '' : String(texto);
        return s;
    }

    // ── Ajustar a la pantalla ────────────────
    function reajustar() {
        const ancho = raiz.clientWidth, alto = raiz.clientHeight;
        const caja = cajaDeHoja(elementosDeHoja(d, hoja));
        lienzo.style.width = caja.w + 'px';
        lienzo.style.height = caja.h + 'px';
        if (!ancho || !alto || !o.ajustar) {
            escala = 1;
        } else {
            escala = Math.max(ESCALA_MINIMA, Math.min(o.maxEscala, ancho / caja.w, alto / caja.h));
        }
        lienzo.style.transform = escala === 1 ? '' : `scale(${escala})`;
        const entra = caja.w * escala <= ancho + 1 && caja.h * escala <= alto + 1;
        raiz.classList.toggle('tv-bv--scroll', !entra);
        // El marco del lienzo ocupa lo escalado, así el scroll (si hace
        // falta) llega justo hasta el último botón.
        lienzo.style.marginRight = (caja.w * escala - caja.w) + 'px';
        lienzo.style.marginBottom = (caja.h * escala - caja.h) + 'px';
        if (entra) { raiz.scrollTop = 0; raiz.scrollLeft = 0; }
        ubicarBarraDetalle();
    }

    // Hasta dónde se ve, en coordenadas de la plantilla (cajaVisible()).
    function cajaVisible() {
        const caja = cajaDeHoja(elementosDeHoja(d, hoja));
        const ancho = raiz.clientWidth, alto = raiz.clientHeight;
        if (!ancho || !alto) return caja;
        return { w: Math.max(caja.w, ancho / escala), h: Math.max(caja.h, alto / escala) };
    }

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => reajustar());
        ro.observe(raiz);
    } else {
        window.addEventListener('resize', reajustar);
    }

    // ── Toques ───────────────────────────────
    // pointerdown y no click: la marca entra en el instante del toque, que
    // es lo que se siente como "responde". Solo el botón principal.
    function alPresionar(ev) {
        if (!vivo || !o.alTocar) return;
        if (ev.button != null && ev.button !== 0) return;
        const nodo = ev.target.closest('.tv-bv-el, .tv-bv-temp');
        if (!nodo || !raiz.contains(nodo)) return;
        if (nodo.classList.contains('tv-bv-temp')) {
            ev.preventDefault();
            o.alTocar({ id: nodo.dataset.id, type: 'popup_label', name: nodo.dataset.nombre, emergente: true }, ev, {});
            return;
        }
        if (!nodo.classList.contains('tv-bv-tocable') || nodo.classList.contains('tv-bv-oculto')) return;
        const e = elemento(d, nodo.dataset.id);
        if (!e) return;
        ev.preventDefault();
        const extra = {};
        if (e.type === 'possession') {
            const lado = ev.target.closest('.tv-bv-pos-lado');
            if (!lado) return;
            extra.equipo = lado.dataset.equipo;
        }
        nodo.classList.add('tv-bv--apretado');
        setTimeout(() => nodo.classList.remove('tv-bv--apretado'), 120);
        o.alTocar(e, ev, extra);
    }
    // Safari de iOS 12 (iPad Air 1, mini 2 y 3 no pasan de ahí) no tiene
    // pointer events: sin esto, tocar un botón no hacía nada. Ahí se escucha
    // touchstart (y mousedown para un mouse); el preventDefault de un toque
    // que cae en un botón evita el mousedown "de compatibilidad" que Safari
    // manda después, así no cuenta dos veces.
    function alPresionarTactil(ev) {
        const t = ev.changedTouches && ev.changedTouches[0];
        alPresionar({
            target: ev.target, button: 0,
            clientX: t ? t.clientX : undefined, clientY: t ? t.clientY : undefined,
            preventDefault: () => ev.preventDefault()
        });
    }
    const oyentes = CON_PUNTERO
        ? [['pointerdown', alPresionar, false]]
        : [['touchstart', alPresionarTactil, { passive: false }], ['mousedown', alPresionar, false]];
    oyentes.forEach(([tipo, fn, op]) => raiz.addEventListener(tipo, fn, op));
    // Un toque largo en el iPad no abre el menú de copiar.
    const sinMenu = ev => { if (vivo) ev.preventDefault(); };
    raiz.addEventListener('contextmenu', sinMenu);

    // ── Marcas ───────────────────────────────
    const CLASES = { activo: 'tv-bv--activo', fijo: 'tv-bv--fijo', abierto: 'tv-bv--grabando', elegido: 'tv-bv--elegido' };

    function aplicarMarca(id, m) {
        const n = nodos.get(String(id));
        if (!n) return;
        Object.values(CLASES).forEach(c => n.classList.remove(c));
        if (m && CLASES[m]) n.classList.add(CLASES[m]);
    }

    function marcar(id, m) {
        if (m) marcas.set(String(id), m); else marcas.delete(String(id));
        aplicarMarca(id, m);
    }

    function ponerTexto(id, texto, cual) {
        const n = nodos.get(String(id));
        if (!n) return;
        const sel = cual === 'reloj' ? '.tv-bv-reloj' : cual === 'contador' ? '.tv-bv-contador'
            : n.dataset.eltype === 'counter' ? '.tv-bv-num' : '.tv-bv-sub';
        const t = n.querySelector(sel);
        const s = texto == null ? '' : String(texto);
        if (t && t.textContent !== s) t.textContent = s;
    }

    // ── Emergentes ───────────────────────────
    // lista: la de estado.emergentes.lista del motor ({id, nombre,
    // elementoId?, indice?}) o la de emergentesDe() de plantilla.js.
    function mostrarEmergentes(eventoId, lista) {
        ocultarEmergentes();
        const ev = elemento(d, eventoId);
        const escritas = [];
        (lista || []).forEach(x => {
            const elId = x.elementoId != null ? x.elementoId : (x.elemento ? x.elemento.id : null);
            if (elId != null) {
                const n = nodos.get(String(elId));
                if (n) n.classList.remove('tv-bv-oculto');
            } else {
                escritas.push(x);
            }
        });
        if (!ev || !escritas.length) return;
        const lugares = ubicarEmergentes(ev, escritas.map(x => x.nombre), cajaVisible());
        lugares.forEach((b, i) => {
            const x = escritas[i];
            const div = document.createElement('div');
            div.className = 'tv-bv-el tv-bv-temp tv-bv-pop';
            div.dataset.eltype = 'popup_label';
            div.dataset.id = x.id != null ? String(x.id) : ev.id + '#' + x.indice;
            div.dataset.nombre = b.name;
            div.style.left = b.x + 'px';
            div.style.top = b.y + 'px';
            div.style.width = (b.w || ANCHO_BOTON) + 'px';
            div.style.height = (b.h || ALTO_BOTON) + 'px';
            div.style.zIndex = 20;
            div.appendChild(span('tv-bv-nombre', b.name));
            lienzo.appendChild(div);
            temporales.push(div);
        });
    }

    function ocultarEmergentes() {
        temporales.forEach(n => n.remove());
        temporales = [];
        if (vivo) nodos.forEach(n => { if (n.dataset.eltype === 'popup_label') n.classList.add('tv-bv-oculto'); });
    }

    // ── Pestañas ─────────────────────────────
    function mostrarHoja(id) {
        const nueva = id || null;
        if (nueva === hoja) return;
        hoja = nueva;
        dibujar();
    }

    function ubicarBarraDetalle() {
        if (!barraDetalle) return;
        barraDetalle.style.left = (raiz.scrollLeft + raiz.clientWidth / 2) + 'px';
    }

    function barra(det) {
        if (!det) {
            if (barraDetalle) { barraDetalle.remove(); barraDetalle = null; }
            return;
        }
        if (!barraDetalle) {
            barraDetalle = document.createElement('div');
            barraDetalle.className = 'tv-bv-barra-detalle';
            barraDetalle.append(span('tv-bv-bd-texto', ''));
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tv-bv-bd-boton';
            b.addEventListener(CON_PUNTERO ? 'pointerdown' : 'click', ev => { ev.preventDefault(); ev.stopPropagation(); if (o.alCerrarDetalle) o.alCerrarDetalle(); });
            barraDetalle.append(b);
            raiz.appendChild(barraDetalle);
        }
        barraDetalle.querySelector('.tv-bv-bd-texto').textContent =
            det.evento + ' › ' + det.plantilla + (det.max > 1 ? ` · ${det.elegidas.length} de ${det.max}` : '');
        barraDetalle.querySelector('.tv-bv-bd-boton').textContent = det.elegidas.length ? 'Listo' : 'Volver sin elegir';
        ubicarBarraDetalle();
    }

    // ── Todo el estado del motor de una ──────
    // estado = codificacion.estado(). Se puede llamar en cada cambio y cada
    // segundo: toca solo clases y textos que cambiaron.
    function pintar(estado) {
        ultimoEstado = estado;
        if (!estado) return;
        const det = estado.detalle;
        const hojaQueva = det ? det.hojaId : null;
        if ((hojaQueva || null) !== hoja && (!det || det.hojaId)) { hoja = hojaQueva || null; dibujar(); return; }
        barra(det);

        const abiertos = new Map((estado.abiertos || []).map(a => [String(a.buttonId), a]));
        const fijas = new Set((estado.fijas || []).map(String));
        const elegidas = new Set(det ? det.elegidas : []);
        const veces = new Map();
        (estado.eventos || []).forEach(ev => { if (!ev.posesionDe) veces.set(String(ev.buttonId), (veces.get(String(ev.buttonId)) || 0) + 1); });
        (estado.abiertos || []).forEach(ev => veces.set(String(ev.buttonId), (veces.get(String(ev.buttonId)) || 0) + 1));

        nodos.forEach((n, id) => {
            const e = elemento(d, id);
            if (!e) return;
            let m = null;
            if (det) {
                if (elegidas.has(e.name)) m = 'elegido';
            } else if (e.type === 'sticky_label') {
                if (fijas.has(id)) m = 'fijo';
            } else if (e.type === 'line') {
                const ids = (e.lineMemberIds || []).map(String);
                if (ids.length && ids.every(x => abiertos.has(x))) m = 'activo';
            } else if (abiertos.has(id)) {
                m = 'abierto';
            }
            marcar(id, m);
            if (e.type === 'counter') ponerTexto(id, (estado.contadores || {})[e.id] || 0);
            if (e.type === 'event' && !det) {
                const a = abiertos.get(id);
                ponerTexto(id, a ? fmt(Math.max(0, estado.tiempo - a.start)) : '', 'reloj');
                if (e.mostrarContador) ponerTexto(id, veces.get(id) || 0, 'contador');
            }
        });

        // Posesión: la mitad del que tiene la pelota se enciende.
        const hayPos = lienzo.querySelector('.tv-bv-pos-lado');
        const pos = estado.posesionCalculada || (hayPos ? posesionDe(d, estado) : null);
        lienzo.querySelectorAll('.tv-bv-pos-lado').forEach(l => {
            l.classList.toggle('tv-bv--activo', !!pos && pos.conPelota === l.dataset.equipo);
            const pct = l.querySelector('.tv-bv-pos-pct');
            if (pct && pos) {
                const v = l.dataset.equipo === 'A' ? pos.pctA : pos.pctB;
                const t = v === null || v === undefined ? '–' : v + '%';
                if (pct.textContent !== t) pct.textContent = t;
            }
        });

        const em = !det && estado.emergentes;
        const firma = em ? em.botonId + ':' + em.lista.map(x => x.id).join(',') : '';
        if (firma !== raiz.dataset.emergentes) {
            raiz.dataset.emergentes = firma;
            if (em) mostrarEmergentes(em.botonId, em.lista); else ocultarEmergentes();
        }
    }

    function actualizar(nuevos) {
        d = normalizar(nuevos);
        raiz.dataset.emergentes = '';
        dibujar();
    }

    function destruir() {
        if (ro) ro.disconnect(); else window.removeEventListener('resize', reajustar);
        oyentes.forEach(([tipo, fn, op]) => raiz.removeEventListener(tipo, fn, op));
        raiz.removeEventListener('contextmenu', sinMenu);
        raiz.remove();
    }

    dibujar();

    return {
        mostrarHoja,
        marcar,
        ponerTexto,
        mostrarEmergentes,
        ocultarEmergentes,
        actualizar,
        pintar,
        reajustar,
        destruir,
        escala: () => escala,
        hoja: () => hoja,
        nodo: id => nodos.get(String(id)) || null,
        raiz
    };
}

function fmt(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

// Los estilos del lienzo de style.css (iPad), con prefijo tv-bv-. Van
// adentro del módulo para que la vista ande igual en cualquier página.
function inyectarEstilos() {
    if (typeof document === 'undefined' || document.getElementById('tv-bv-estilos')) return;
    const st = document.createElement('style');
    st.id = 'tv-bv-estilos';
    st.textContent = `
.tv-bv{position:relative;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;box-sizing:border-box;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.tv-bv--scroll{overflow:auto}
.tv-bv--tactil{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.tv-bv-lienzo{position:relative;transform-origin:0 0}
.tv-bv-el{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;border-radius:4px;font-size:13px;font-weight:600;user-select:none;-webkit-user-select:none;overflow:hidden;line-height:1.15}
.tv-bv--vivo .tv-bv-tocable{cursor:pointer;transition:transform .08s,filter .08s}
.tv-bv--vivo .tv-bv-tocable:active,.tv-bv--apretado{transform:scale(.96);filter:brightness(.88)}
.tv-bv-oculto{display:none!important}
.tv-bv-el[data-eltype=event]{background:linear-gradient(180deg,#5cb0f5 0%,#3a8fd6 100%);border:1.5px solid #2a5b84;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.2)}
.tv-bv-el[data-eltype=popup_label]{background:linear-gradient(180deg,#ffe55a 0%,#f8d022 100%);border:1.5px solid #c49a00;color:#000}
.tv-bv-el[data-eltype=popup_label]::before{content:'';position:absolute;top:3px;left:3px;width:7px;height:7px;background:#fff;border:1.5px solid #333;border-radius:50%}
.tv-bv-pop{animation:tvBvPop .15s cubic-bezier(.175,.885,.32,1.275)}
@keyframes tvBvPop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
.tv-bv-el[data-eltype=descriptor]{background:#fff9c4;border:1.5px solid #e0c800;color:#000;border-radius:6px}
.tv-bv-el[data-eltype=sticky_label]{background:#ffedd5;border:1.5px dashed #f97316;color:#000;border-radius:6px}
.tv-bv-el[data-eltype=sticky_label].tv-bv--fijo{background:#f97316;border-style:solid;color:#fff;box-shadow:0 0 0 3px rgba(249,115,22,.45)}
.tv-bv-el[data-eltype=counter]{background:#f5f5f7;border:1.5px solid #aaa;color:#000;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.tv-bv-el[data-eltype=container]{background:rgba(255,255,255,.85);border:1.5px solid #bbb;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.tv-bv-color{background:var(--btn-color)!important;border-color:color-mix(in srgb,var(--btn-color) 70%,black)!important}
.tv-bv-equipo-A{box-shadow:inset 6px 0 0 var(--equipo-a,#1e3a8a)}
.tv-bv-equipo-B{box-shadow:inset 6px 0 0 var(--equipo-b,#dc2626)}
.tv-bv-el[data-eltype=text]{background:transparent;border:0;font-weight:700;color:#1c1c1e}
.tv-bv-texto{white-space:nowrap}
.tv-bv-el[data-eltype=image]{background:transparent;border:0;padding:0;color:#8e8e93}
.tv-bv-img{width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}
.tv-bv-el[data-eltype=teams]{flex-direction:row;gap:10px;padding:0 12px;background:#fff;border:1.5px solid #d1d1d6;border-radius:10px;color:#1c1c1e;font-size:14px;font-weight:800}
.tv-bv-eq-lado{display:flex;align-items:center;gap:6px;min-width:0}
.tv-bv-eq-nombre{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
.tv-bv-eq-punto{width:12px;height:12px;border-radius:999px;flex-shrink:0}
.tv-bv-eq-a{background:var(--equipo-a,#3a8fd6)}.tv-bv-eq-b{background:var(--equipo-b,#dc2626)}
.tv-bv-eq-vs{color:#8e8e93;font-size:12px;font-weight:600}
.tv-bv-contador{position:absolute;top:3px;right:4px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:rgba(0,0,0,.38);
  color:#fff;font:800 11px/18px system-ui,sans-serif;text-align:center;font-variant-numeric:tabular-nums;text-shadow:none;pointer-events:none;box-sizing:border-box}
.tv-bv-atajo{position:absolute;bottom:2px;right:3px;min-width:14px;height:14px;padding:0 3px;border-radius:3px;background:rgba(0,0,0,.35);color:#fff;
  font:700 9px/14px ui-monospace,Consolas,monospace;text-shadow:none;pointer-events:none;box-sizing:border-box}
.tv-bv--elegido{outline:3px solid #34c759!important;outline-offset:2px;filter:brightness(.92)}
.tv-bv-el[data-eltype=possession]{flex-direction:row;align-items:stretch;padding:0;border:1.5px solid #555;border-radius:10px;background:#fff}
.tv-bv-pos-lado{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;transition:filter .1s}
.tv-bv-pos-A{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(0,0,0,.08)),var(--equipo-a,#3a8fd6);color:var(--equipo-a-texto,#fff)}
.tv-bv-pos-B{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(0,0,0,.08)),var(--equipo-b,#dc2626);color:var(--equipo-b-texto,#fff)}
.tv-bv-pos-lado+.tv-bv-pos-lado{border-left:1.5px solid rgba(0,0,0,.25)}
.tv-bv-pos-nombre{font-size:12px;font-weight:700;line-height:1.1}
.tv-bv-pos-pct{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.tv-bv--vivo .tv-bv-pos-lado{filter:saturate(.35) brightness(.95)}
.tv-bv--vivo .tv-bv-pos-lado.tv-bv--activo{filter:none;box-shadow:inset 0 0 0 3px #fde047}
.tv-bv--grabando{outline:3px solid #ef4444!important;animation:tvBvRec 1s infinite alternate}
@keyframes tvBvRec{0%{filter:brightness(1)}100%{filter:brightness(1.2) drop-shadow(0 0 10px rgba(239,68,68,.9))}}
.tv-bv-el[data-eltype=line]{background:linear-gradient(180deg,#7b83e8 0%,#4c51bf 100%);border:1.5px solid #363b8f;color:#fff;border-radius:8px;text-shadow:0 1px 1px rgba(0,0,0,.25)}
.tv-bv--activo[data-eltype=line]{outline:3px solid #34c759!important;box-shadow:0 0 12px rgba(52,199,89,.65)}
.tv-bv-linea-sub{font-size:10px;opacity:.8;font-weight:500}
.tv-bv-reloj{display:none;font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:700;color:#fff;background:rgba(220,38,38,.9);border-radius:3px;padding:0 5px;margin-top:2px;text-shadow:none}
.tv-bv--grabando .tv-bv-reloj{display:block}
.tv-bv-sub{font-family:ui-monospace,Consolas,monospace;font-size:10px;font-weight:600;opacity:.75;margin-top:1px}
.tv-bv-sub:empty{display:none}
.tv-bv-barra-detalle{position:absolute;top:8px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;
  border-radius:999px;background:#1c1c1e;color:#fff;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap}
.tv-bv-bd-boton{border:0;border-radius:999px;padding:5px 12px;background:#fff;color:#1c1c1e;font:inherit;cursor:pointer}
.tv-bv--oscuro .tv-bv-el[data-eltype=counter]{background:#2c2c2e;border-color:#636366;color:#f2f2f7}
.tv-bv--oscuro .tv-bv-el[data-eltype=container]{background:rgba(28,28,30,.85);border-color:#48484a}
.tv-bv--oscuro .tv-bv-el[data-eltype=text]{color:#f2f2f7}
.tv-bv--oscuro .tv-bv-el[data-eltype=teams]{background:#1c1c1e;border-color:#48484a;color:#f2f2f7}
.tv-bv--oscuro .tv-bv-el[data-eltype=possession]{background:#1c1c1e;border-color:#636366}
.tv-bv--oscuro .tv-bv-barra-detalle{background:#f2f2f7;color:#1c1c1e}
.tv-bv--oscuro .tv-bv-bd-boton{background:#1c1c1e;color:#f2f2f7}
.tv-bv--miniatura .tv-bv-el{cursor:default}
`;
    document.head.appendChild(st);
}
