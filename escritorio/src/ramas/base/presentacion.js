// Modo presentación: los clips que elegiste, en pantalla completa, para
// mostrarlos en una charla técnica y pasar de uno a otro a tu ritmo.
//
// Cada clip frena al terminar (para explicar) y el siguiente arranca con →,
// PageDown o un clic en la lista. Los punteros de presentación mandan
// PageDown / PageUp, así que andan sin configurar nada. "Seguir solo" los
// pasa de corrido, como una playlist.
//
// Usa el mismo reproductor de la base (cambia de video solo entre partidos)
// y se monta sobre toda la ventana. presentar(ctx, items, { titulo }) con
// items de armarPresentacion() (logica.js). Devuelve cerrar().

import { h, llenar, boton, crearIcono } from './comun.js';
import { crearReproductor } from './reproductor.js';

const CLAVE_SEGUIR = 'tv_presentacion_seguir';
const CLAVE_LISTA = 'tv_presentacion_lista';
const lsLeer = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsPoner = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin storage: no se recuerda */ } };

// Una sola a la vez; la base la cierra si te vas de la rama.
let abierta = null;
export function cerrarPresentacion() { if (abierta) abierta(); }

export function presentar(ctx, itemsIniciales, { titulo = 'Presentación' } = {}) {
    cerrarPresentacion();
    let items = itemsIniciales.slice();
    if (!items.length) { ctx.ui.aviso('No hay clips con video para presentar', 'aviso'); return () => {}; }

    let actual = 0;
    let seguir = lsLeer(CLAVE_SEGUIR) === '1';
    let conLista = lsLeer(CLAVE_LISTA) !== '0';
    let alFinal = false;

    const reproductor = crearReproductor(ctx, {
        // Un video que no abre deja el mensaje en pantalla: saltar solo haría
        // perder en qué clip de la charla ibas.
        saltearSinVideo: false,
        alCambioCola: c => { if (c) { actual = c.indice; alFinal = false; pintar(); } },
        // Se mira `actual` y no el índice que manda el reproductor: si se sacó
        // un clip de la lista, la cola del reproductor quedó con el orden viejo.
        alFinTramo: () => {
            if (seguir && actual < items.length - 1) { ir(actual + 1); return; }
            alFinal = true;
            pintar();
        }
    });

    // ── Armado ──
    const contador = h('span', { class: 'tv-pres__contador tv-numeros' });
    const btnSeguir = h('button', { type: 'button', class: 'tv-btn tv-btn--chico', 'aria-pressed': 'false',
        title: 'Pasar solo al siguiente clip al terminar (A)', onclick: () => alternarSeguir() }, crearIcono('play'), h('span', {}, 'Seguir solo'));
    const btnLista = h('button', { type: 'button', class: 'tv-btn tv-btn--chico', 'aria-pressed': 'false',
        title: 'Mostrar u ocultar la lista (L)', onclick: () => alternarLista() }, crearIcono('lista'), h('span', {}, 'Lista'));
    const cabeza = h('div', { class: 'tv-pres__cabeza' },
        h('span', { class: 'tv-pres__titulo tv-recortar' }, titulo),
        contador,
        h('span', { class: 'tv-barra__espacio' }),
        btnSeguir, btnLista,
        boton('Pantalla completa', { clase: 'tv-btn--chico', titulo: 'F', alHacer: () => alternarPantalla() }),
        boton('Salir', { icono: 'cerrar', clase: 'tv-btn--chico', titulo: 'Esc', alHacer: () => cerrar() }));

    const rotuloNombre = h('div', { class: 'tv-pres__nombre' });
    const rotuloDetalle = h('div', { class: 'tv-pres__detalle' });
    const rotuloNota = h('div', { class: 'tv-pres__nota' });
    const finCartel = h('div', { class: 'tv-pres__fin', hidden: true });
    const rotulo = h('div', { class: 'tv-pres__rotulo' }, rotuloNombre, rotuloDetalle, rotuloNota);

    const btnAnterior = boton('Anterior', { icono: 'chevron-izq', clase: 'tv-pres__paso', titulo: '← o PageUp', alHacer: () => anterior() });
    const btnRepetir = boton('Repetir', { icono: 'atras', clase: 'tv-pres__paso', titulo: 'R', alHacer: () => ir(actual) });
    const btnSiguiente = boton('Siguiente', { icono: 'chevron-der', clase: 'tv-pres__paso tv-btn--primario', titulo: '→ o PageDown', alHacer: () => siguiente() });
    // El texto va antes del ícono en "Siguiente": se lee como una flecha.
    btnSiguiente.append(btnSiguiente.querySelector('.tv-icono'));
    const pie = h('div', { class: 'tv-pres__pie' }, btnAnterior, btnRepetir, btnSiguiente);

    const escenario = h('div', { class: 'tv-pres__escenario' },
        h('div', { class: 'tv-pres__video' }, reproductor.el, rotulo, finCartel), pie);
    const lista = h('div', { class: 'tv-pres__lista', role: 'listbox', 'aria-label': 'Clips' });
    const el = h('div', { class: 'tv-pres', role: 'dialog', 'aria-label': titulo },
        cabeza, h('div', { class: 'tv-pres__cuerpo' }, escenario, lista));
    document.body.appendChild(el);

    // ── Navegar ──
    function ir(i) {
        if (!items.length) return;
        actual = Math.max(0, Math.min(items.length - 1, i));
        alFinal = false;
        pintar();
        // reproducirCola y no irACola: la cola vuelve a armarse si se sacó un clip.
        reproductor.reproducirCola(items, actual);
    }
    // En el último no hace nada: el cartel ya dice que es el último (y en
    // pantalla completa los avisos de la app no se ven).
    function siguiente() { if (actual < items.length - 1) ir(actual + 1); }
    function anterior() { if (actual > 0) ir(actual - 1); else ir(0); }

    // Espacio: pausa y sigue; con el clip ya terminado, lo vuelve a pasar.
    function playPausa() {
        if (alFinal || reproductor.alFinal) ir(actual);
        else reproductor.alternar();
    }

    // Sacar uno de la lista. Si es el que se está viendo, pasa al que queda
    // en su lugar; si no, el video sigue donde está.
    function quitar(i) {
        const eraElActual = i === actual;
        items.splice(i, 1);
        if (!items.length) { cerrar(); return; }
        if (i < actual) actual--;
        pintarLista();
        if (eraElActual) ir(Math.min(actual, items.length - 1));
        else pintar();
    }

    function alternarSeguir() {
        seguir = !seguir;
        lsPoner(CLAVE_SEGUIR, seguir ? '1' : '0');
        if (seguir && alFinal) siguiente();
        pintar();
    }

    function alternarLista() {
        conLista = !conLista;
        lsPoner(CLAVE_LISTA, conLista ? '1' : '0');
        pintar();
    }

    function alternarPantalla() {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else el.requestFullscreen().catch(() => {});
    }

    // ── Pintar ──
    function pintarLista() {
        llenar(lista, ...items.map((it, i) => h('div', {
            class: 'tv-pres__fila', role: 'option', 'data-i': String(i), title: it.titulo,
            onclick: () => ir(i)
        },
            h('span', { class: 'tv-pres__num tv-numeros' }, String(i + 1)),
            h('span', { class: 'tv-pres__fila-texto' },
                h('span', { class: 'tv-recortar' }, it.nombre),
                it.detalle ? h('span', { class: 'tv-recortar tv-chica tv-texto-2' }, it.detalle) : null,
                it.nota ? h('span', { class: 'tv-pres__fila-nota tv-chica' }, it.nota) : null),
            h('button', {
                type: 'button', class: 'tv-btn tv-btn--icono tv-btn--chico tv-btn--fantasma tv-pres__quitar',
                title: 'Sacar de esta presentación (no se borra de la base)',
                onclick: e => { e.stopPropagation(); quitar(i); }
            }, crearIcono('cerrar')))));
    }

    function pintar() {
        const it = items[actual];
        contador.textContent = `Clip ${actual + 1} de ${items.length}`;
        rotuloNombre.textContent = it ? it.nombre : '';
        rotuloDetalle.textContent = it ? it.detalle : '';
        rotuloNota.textContent = it ? it.nota : '';
        rotuloNota.hidden = !(it && it.nota);
        finCartel.hidden = !alFinal;
        finCartel.textContent = actual < items.length - 1
            ? 'Fin del clip · → siguiente · R repetir'
            : 'Último clip · R repetir · Esc salir';
        btnAnterior.disabled = actual <= 0;
        btnSiguiente.disabled = actual >= items.length - 1;
        btnSeguir.setAttribute('aria-pressed', String(seguir));
        btnLista.setAttribute('aria-pressed', String(conLista));
        el.classList.toggle('es-sin-lista', !conLista);
        lista.querySelectorAll('.tv-pres__fila').forEach(f => {
            const es = Number(f.dataset.i) === actual;
            f.setAttribute('aria-selected', String(es));
            if (es) f.scrollIntoView({ block: 'nearest' });
        });
    }

    // ── Teclado ──
    // Va antes que todo lo de la página (captura) y ninguna tecla sin Ctrl
    // sigue de largo: detrás está la base, que también escucha flechas,
    // espacio y letras. Ctrl/⌘ sí pasan (Ctrl+1…6 cambian de pantalla, y la
    // base cierra la presentación al irse).
    function alTecla(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        e.stopImmediatePropagation();
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        const acciones = {
            ArrowRight: siguiente, PageDown: siguiente, n: siguiente, Enter: siguiente,
            ArrowLeft: anterior, PageUp: anterior, p: anterior, Backspace: anterior,
            ' ': playPausa, r: () => ir(actual), a: alternarSeguir, l: alternarLista, f: alternarPantalla,
            Home: () => ir(0), End: () => ir(items.length - 1),
            Escape: () => { if (!document.fullscreenElement) cerrar(); }
        };
        // Shift+flechas: ±1 s adentro del clip, como en el reproductor.
        if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
            reproductor.irA(reproductor.tiempo + (k === 'ArrowLeft' ? -1 : 1));
        } else if (acciones[k]) {
            if (!e.repeat || k === 'ArrowRight' || k === 'ArrowLeft') acciones[k]();
        } else if (!reproductor.teclas(e)) {
            return;                               // Tab y demás: lo de siempre
        }
        e.preventDefault();
    }
    window.addEventListener('keydown', alTecla, true);

    function cerrar() {
        if (abierta !== cerrar) return;
        abierta = null;
        window.removeEventListener('keydown', alTecla, true);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        reproductor.destruir();
        el.remove();
    }
    abierta = cerrar;

    pintarLista();
    ir(0);
    // Pantalla completa de entrada: se abre con un clic, así que se puede.
    el.requestFullscreen().catch(() => {});
    return cerrar;
}
