// Avisos (toasts) y diálogos: aviso, confirmar, pedirTexto, modal.
// Son los que llegan a cada rama como ctx.ui.
//
// Los diálogos son propios y no los del navegador (alert/confirm/prompt):
// esos congelan el proceso de la página entero, y con la captura grabando
// eso son segundos de video que no llegan al disco.

import { escapar } from './util.js';
import { iconoHTML } from './iconos.js';

// ─────────────────────────────────────────────
// AVISOS
// ─────────────────────────────────────────────
const DURACION_AVISO = 5000;
const MAX_AVISOS = 5;
const ICONO_AVISO = { info: 'info', ok: 'check', error: 'alerta', aviso: 'alerta' };

function contenedorAvisos() {
    let caja = document.getElementById('tv-avisos');
    if (!caja) {
        caja = document.createElement('div');
        caja.id = 'tv-avisos';
        caja.className = 'tv-avisos';
        // role=status: el lector de pantalla lo anuncia sin robar el foco.
        caja.setAttribute('role', 'status');
        caja.setAttribute('aria-live', 'polite');
        document.body.appendChild(caja);
    }
    return caja;
}

// aviso(texto, tipo = 'info' | 'ok' | 'error' | 'aviso', { accion: {texto, alHacer}, duracion })
// Los de error se quedan hasta que se cierran: un "no se pudo guardar el
// video" que se va solo en 5 s mientras mirás la cancha es un error perdido.
export function aviso(texto, tipo = 'info', opciones = {}) {
    const caja = contenedorAvisos();
    const div = document.createElement('div');
    div.className = `tv-aviso tv-aviso--${ICONO_AVISO[tipo] ? tipo : 'info'}`;
    div.innerHTML = `
        ${iconoHTML(ICONO_AVISO[tipo] || 'info', 'tv-aviso__icono')}
        <div class="tv-aviso__texto tv-seleccionable">${escapar(texto)}</div>
        ${opciones.accion ? `<button type="button" class="tv-btn tv-btn--chico tv-aviso__accion">${escapar(opciones.accion.texto)}</button>` : ''}
        <button type="button" class="tv-btn tv-btn--chico tv-btn--icono tv-btn--fantasma tv-aviso__cerrar" title="Cerrar">${iconoHTML('cerrar')}</button>`;

    let temporizador = null;
    const cerrar = () => {
        clearTimeout(temporizador);
        if (!div.isConnected) return;
        div.classList.add('es-saliendo');
        setTimeout(() => div.remove(), 160);
    };
    const programar = () => {
        const dura = opciones.duracion ?? (tipo === 'error' ? 0 : DURACION_AVISO);
        if (dura > 0) temporizador = setTimeout(cerrar, dura);
    };
    // Con el mouse encima no se va: da tiempo a leerlo o a tocar la acción.
    div.addEventListener('mouseenter', () => clearTimeout(temporizador));
    div.addEventListener('mouseleave', programar);
    div.querySelector('.tv-aviso__cerrar').addEventListener('click', cerrar);
    if (opciones.accion) {
        div.querySelector('.tv-aviso__accion').addEventListener('click', () => {
            try { opciones.accion.alHacer(); } finally { cerrar(); }
        });
    }

    caja.appendChild(div);
    // Los más viejos que no son error se van primero si se apilan demasiados.
    const vivos = [...caja.children].filter(a => !a.classList.contains('es-saliendo'));
    if (vivos.length > MAX_AVISOS) {
        const sobra = vivos.find(a => !a.classList.contains('tv-aviso--error')) || vivos[0];
        sobra.remove();
    }
    programar();
    return { cerrar };
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
// Pila de modales abiertos: un confirmar puede abrirse arriba de un
// elegirPlantilla. Solo el de arriba escucha el teclado.
const pila = [];

export function hayModalAbierto() {
    return pila.length > 0;
}

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function enfocables(raiz) {
    return [...raiz.querySelectorAll(ENFOCABLES)].filter(e => e.offsetParent !== null || e === document.activeElement);
}

// modal({ titulo, contenido: HTMLElement, botones: [{texto, valor, primario, peligro}],
//         ancho?: px, antesDeCerrar?: (valor) => boolean, foco?: HTMLElement,
//         focoBoton?: índice del botón que arranca con el foco })
//   → Promise<valor | null>
//
// Esc o la X → null. Enter → el botón primario (salvo que el foco esté en
// otro botón, un textarea o un select: ahí Enter hace lo de siempre).
// El contenido puede cerrar el modal solo, con un valor, disparando:
//   contenido.dispatchEvent(new CustomEvent('tv-modal-cerrar', { detail: valor, bubbles: true }))
export function modal({ titulo = '', contenido = null, botones, ancho, antesDeCerrar, foco, focoBoton, clase = '' } = {}) {
    return new Promise(resolve => {
        const anterior = document.activeElement;
        const lista = botones || [{ texto: 'Cerrar', valor: null, primario: true }];

        const fondo = document.createElement('div');
        fondo.className = 'tv-modal-fondo';
        const caja = document.createElement('div');
        caja.className = 'tv-modal' + (clase ? ' ' + clase : '');
        caja.setAttribute('role', 'dialog');
        caja.setAttribute('aria-modal', 'true');
        if (ancho) caja.style.width = `min(${ancho}px, calc(100vw - 48px))`;

        const idTitulo = 'tv-modal-t-' + Math.random().toString(36).slice(2, 8);
        caja.setAttribute('aria-labelledby', idTitulo);
        caja.innerHTML = `
            <header class="tv-modal__cabecera">
                <h2 class="tv-modal__titulo" id="${idTitulo}">${escapar(titulo)}</h2>
                <button type="button" class="tv-btn tv-btn--icono tv-btn--fantasma tv-btn--chico tv-modal__x" title="Cerrar (Esc)">${iconoHTML('cerrar')}</button>
            </header>
            <div class="tv-modal__cuerpo"></div>
            <footer class="tv-modal__pie"></footer>`;
        const cuerpo = caja.querySelector('.tv-modal__cuerpo');
        if (contenido) cuerpo.appendChild(contenido);
        else cuerpo.remove();

        const pie = caja.querySelector('.tv-modal__pie');
        let primario = null;
        const creados = [];
        lista.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tv-btn' + (b.peligro ? (b.primario ? ' tv-modal__peligro' : ' tv-btn--peligro') : b.primario ? ' tv-btn--primario' : '');
            btn.textContent = b.texto;
            btn.addEventListener('click', () => cerrar(b.valor === undefined ? b.texto : b.valor));
            if (b.primario) primario = btn;
            creados.push(btn);
            pie.appendChild(btn);
        });
        if (!lista.length) pie.remove();

        const entrada = { caja, teclado };
        let cerrado = false;

        function cerrar(valor) {
            if (cerrado) return;
            if (valor !== null && antesDeCerrar && antesDeCerrar(valor) === false) return;
            cerrado = true;
            const i = pila.indexOf(entrada);
            if (i >= 0) pila.splice(i, 1);
            window.removeEventListener('keydown', teclado, true);
            fondo.classList.add('es-saliendo');
            setTimeout(() => fondo.remove(), 120);
            // El foco vuelve a donde estaba, así el teclado sigue donde lo dejaste.
            if (anterior && anterior.isConnected && typeof anterior.focus === 'function') anterior.focus();
            resolve(valor);
        }

        // Captura en window: el modal de arriba se queda con el teclado antes
        // que cualquier rama (la captura escucha todas las teclas y no puede
        // marcar un evento mientras escribís el nombre de un partido).
        function teclado(e) {
            if (pila[pila.length - 1] !== entrada) return;
            const adentro = caja.contains(e.target);

            if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                cerrar(null);
                return;
            }
            if (e.key === 'Tab') {
                const f = enfocables(caja);
                if (!f.length) { e.preventDefault(); return; }
                const primero = f[0], ultimo = f[f.length - 1];
                if (!adentro) { e.preventDefault(); primero.focus(); }
                else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
                e.stopPropagation();
                return;
            }
            if (e.key === 'Enter' && !e.isComposing) {
                const t = e.target;
                const esPropio = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
                                       (t.tagName === 'BUTTON' && adentro) || t.closest?.('[data-tv-enter-propio]'));
                if (!esPropio && primario) {
                    e.preventDefault(); e.stopPropagation();
                    primario.click();
                    return;
                }
            }
            // Cualquier otra tecla: si nació adentro, que siga a sus oyentes
            // (un buscador con flechas); si no, no llega a la rama de atrás.
            if (!adentro) { e.stopPropagation(); e.preventDefault(); }
        }

        // El contenido puede cerrar el modal (un clic en una fila de la lista).
        caja.addEventListener('tv-modal-cerrar', e => { e.stopPropagation(); cerrar(e.detail ?? null); });
        caja.querySelector('.tv-modal__x').addEventListener('click', () => cerrar(null));
        // Clic en el fondo: no cierra (en Windows un diálogo no se va por un clic
        // afuera) pero tampoco se lleva el foco.
        fondo.addEventListener('mousedown', e => { if (e.target === fondo) { e.preventDefault(); caja.classList.remove('es-llamando'); void caja.offsetWidth; caja.classList.add('es-llamando'); } });

        fondo.appendChild(caja);
        document.body.appendChild(fondo);
        pila.push(entrada);
        window.addEventListener('keydown', teclado, true);

        // Foco inicial: el que pidan, o el primer campo, o el primario.
        const campo = contenido && contenido.querySelector('[autofocus], input:not([type="hidden"]), textarea, select');
        const destino = foco || creados[focoBoton] || campo || primario || enfocables(caja)[0];
        requestAnimationFrame(() => {
            if (!destino) return;
            destino.focus();
            if (destino.select && destino.tagName === 'INPUT') destino.select();
        });
    });
}

// ─────────────────────────────────────────────
// CONFIRMAR y PEDIR TEXTO
// ─────────────────────────────────────────────
// confirmar(texto, { titulo, peligro, si, no }) → Promise<boolean>
// Con peligro el foco arranca en Cancelar: un Enter apurado no borra nada.
export async function confirmar(texto, { titulo = 'Confirmar', peligro = false, si, no = 'Cancelar' } = {}) {
    const p = document.createElement('p');
    p.className = 'tv-modal__texto';
    p.textContent = texto;
    const promesa = modal({
        titulo,
        contenido: p,
        ancho: 440,
        botones: [
            { texto: no, valor: false },
            { texto: si || (peligro ? 'Borrar' : 'Aceptar'), valor: true, primario: true, peligro }
        ],
        focoBoton: peligro ? 0 : undefined
    });
    return (await promesa) === true;
}

// pedirTexto(titulo, valorInicial, { etiqueta, placeholder, si }) → Promise<string | null>
// Devuelve el texto sin espacios en los bordes; null si se canceló. Vacío no
// cierra: pedir un nombre y aceptar "" siempre es un error.
export async function pedirTexto(titulo, valorInicial = '', { etiqueta = '', placeholder = '', si = 'Aceptar', multilinea = false } = {}) {
    const div = document.createElement('div');
    const id = 'tv-pedir-' + Math.random().toString(36).slice(2, 8);
    div.innerHTML = `
        ${etiqueta ? `<label class="tv-etiqueta" for="${id}">${escapar(etiqueta)}</label>` : ''}
        ${multilinea
            ? `<textarea class="tv-campo" id="${id}" placeholder="${escapar(placeholder)}"></textarea>`
            : `<input class="tv-campo" id="${id}" type="text" spellcheck="false" placeholder="${escapar(placeholder)}">`}`;
    const campo = div.querySelector('#' + id);
    campo.value = valorInicial ?? '';

    const r = await modal({
        titulo,
        contenido: div,
        ancho: 440,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: si, valor: 'ok', primario: true }],
        antesDeCerrar: () => {
            if (campo.value.trim()) return true;
            campo.classList.remove('es-invalido'); void campo.offsetWidth;
            campo.classList.add('es-invalido');
            campo.focus();
            return false;
        }
    });
    return r === 'ok' ? campo.value.trim() : null;
}
