// ─────────────────────────────────────────────
// ARRANQUE Y ROUTER — Tag & View Pro Escritorio
// ─────────────────────────────────────────────
// La carcasa: barra superior, barra lateral y el hueco donde se monta la
// rama activa. Cada rama es src/ramas/<id>/index.js con un export default
// { id, titulo, icono, descripcion, montar(contenedor, ctx), desmontar() }.
// Se cargan con import() recién cuando se abren: si una todavía no existe
// (otro agente la está haciendo) se ve "En construcción" y nada se rompe.

import {
    aviso, confirmar, pedirTexto, modal, hayModalAbierto,
    crearIcono, iconoHTML, escapar, formatoTiempo, aFecha, estadoGlobal,
    ponerPlataforma, teclaMod, textoAtajo
} from './ui/index.js';

// Sin preload (abierto en un servidor estático para probar), la API de
// mentira. SOLO PARA DESARROLLO: en Electron el preload ya puso el window.tv
// real y este import nunca corre (api-simulada.js tampoco pisa uno real).
// Tiene que estar antes de cualquier rama: todas usan ctx.api.
if (!window.tv) await import('./ui/api-simulada.js');
const api = window.tv;

// Plataforma antes de pintar nada: pone data-plataforma="mac"|"win" en <html>
// (el CSS de Mac cuelga de ahí) y decide ⌘ o Ctrl en atajos y textos.
try { ponerPlataforma((await api.sys.info()).plataforma); } catch { ponerPlataforma('win32'); }

// El orden es el de la barra lateral y el de Ctrl+1..6 (⌘1..6 en Mac).
export const RAMAS = [
    { id: 'inicio',   titulo: 'Inicio',             icono: 'casa' },
    { id: 'base',     titulo: 'Base de datos',      icono: 'base' },
    { id: 'captura',  titulo: 'Captura en vivo',    icono: 'camara' },
    { id: 'ipad',     titulo: 'Captura desde iPad', icono: 'ipad' },
    { id: 'importar', titulo: 'Importar',           icono: 'importar' },
    { id: 'ajustes',  titulo: 'Ajustes',            icono: 'ajustes' }
];
const infoRama = id => RAMAS.find(r => r.id === id);

const $ = sel => document.querySelector(sel);
const hueco = $('#tv-rama');
const lateral = $('.tv-app-lateral');
const miga = $('.tv-app-miga');
const botonRec = $('.tv-app-rec');
const relojRec = $('.tv-app-rec__reloj');

const ui = { aviso, confirmar, pedirTexto, modal };

// ─────────────────────────────────────────────
// BARRA LATERAL
// ─────────────────────────────────────────────
function lsLeer(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
function lsPoner(clave, v) { try { localStorage.setItem(clave, v); } catch {} }

function armarLateral() {
    const item = (r, i) => `
        <button type="button" class="tv-app-lateral__item" data-rama="${r.id}" aria-label="${escapar(r.titulo)}">
            ${iconoHTML(r.icono)}
            <span class="tv-app-lateral__texto">${escapar(r.titulo)}</span>
            <span class="tv-app-lateral__tip" role="tooltip">${escapar(r.titulo)}<span class="tv-tecla">${escapar(textoAtajo('Mod+' + (i + 1)).replace('+', ' '))}</span></span>
        </button>`;
    // Ajustes va abajo, separado, como en cualquier app de escritorio.
    const principales = RAMAS.filter(r => r.id !== 'ajustes');
    lateral.innerHTML =
        principales.map(r => item(r, RAMAS.indexOf(r))).join('') +
        `<div class="tv-app-lateral__espacio"></div>` +
        item(infoRama('ajustes'), RAMAS.findIndex(r => r.id === 'ajustes')) +
        `<div class="tv-app-lateral__separador"></div>
         <button type="button" class="tv-app-lateral__item tv-app-lateral__plegar" aria-label="Mostrar nombres">
            ${iconoHTML('desplegar')}
            <span class="tv-app-lateral__texto">Ocultar nombres</span>
            <span class="tv-app-lateral__tip" role="tooltip">Mostrar nombres</span>
         </button>`;

    lateral.addEventListener('click', e => {
        const b = e.target.closest('.tv-app-lateral__item');
        if (!b) return;
        if (b.classList.contains('tv-app-lateral__plegar')) return alternarLateral();
        navegar(b.dataset.rama);
    });
    // El tooltip es position: fixed (la barra tiene overflow hidden): se
    // ubica a la altura del ícono al pasar por encima.
    lateral.addEventListener('mouseover', e => {
        const b = e.target.closest('.tv-app-lateral__item');
        if (!b) return;
        const r = b.getBoundingClientRect();
        b.querySelector('.tv-app-lateral__tip').style.top = (r.top + r.height / 2) + 'px';
    });
    lateral.addEventListener('focusin', e => {
        const b = e.target.closest('.tv-app-lateral__item');
        if (b) { const r = b.getBoundingClientRect(); b.querySelector('.tv-app-lateral__tip').style.top = (r.top + r.height / 2) + 'px'; }
    });

    if (lsLeer('tv_lateral_abierta') === '1') alternarLateral(true);
}

function alternarLateral(forzar) {
    const abierta = lateral.classList.toggle('es-abierta', forzar);
    const b = lateral.querySelector('.tv-app-lateral__plegar');
    b.innerHTML = `${iconoHTML(abierta ? 'plegar' : 'desplegar')}
        <span class="tv-app-lateral__texto">Ocultar nombres</span>
        <span class="tv-app-lateral__tip" role="tooltip">Mostrar nombres</span>`;
    b.setAttribute('aria-label', abierta ? 'Ocultar nombres' : 'Mostrar nombres');
    lateral.setAttribute('aria-expanded', String(abierta));
    lsPoner('tv_lateral_abierta', abierta ? '1' : '0');
}

function marcarLateral(id) {
    lateral.querySelectorAll('[data-rama]').forEach(b => {
        if (b.dataset.rama === id) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
}

// ─────────────────────────────────────────────
// MIGA DE PAN
// ─────────────────────────────────────────────
// La rama puede agregar un nivel con ctx.miga('Norte vs Sur').
function pintarMiga(titulo, extra) {
    const partes = [titulo, extra].filter(Boolean);
    miga.innerHTML = partes.map(p => `${iconoHTML('chevron-der')}<span class="tv-app-miga__parte">${escapar(p)}</span>`).join('');
    document.title = partes.length ? `${partes[partes.length - 1]} — Tag & View Pro` : 'Tag & View Pro';
}

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
let actual = null;          // { id, modulo, contenedor, titulo }
let pedido = null;          // la última navegación pedida mientras otra estaba en curso
let enCurso = null;
const estilosCargados = new Map();

// navegar(id, params): si llegan varias seguidas (Ctrl+2, Ctrl+3 apurado)
// se procesa solo la última, y nunca dos desmontar() a la vez.
export function navegar(id, params = {}) {
    pedido = { id, params: params || {} };
    if (!enCurso) enCurso = (async () => {
        try { while (pedido) { const p = pedido; pedido = null; await cambiarA(p.id, p.params); } }
        finally { enCurso = null; }
    })();
    return enCurso;
}

function cargarEstilo(id) {
    if (!estilosCargados.has(id)) {
        estilosCargados.set(id, new Promise(resolve => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `ramas/${id}/estilo.css`;
            link.dataset.rama = id;
            // Sin estilo.css la rama anda igual: el error no frena nada. El
            // tope de 1,5 s es por si el esquema no contesta nunca.
            const listo = () => resolve();
            link.onload = listo;
            link.onerror = () => { link.remove(); listo(); };
            setTimeout(listo, 1500);
            document.head.appendChild(link);
        }));
    }
    return estilosCargados.get(id);
}

async function cambiarA(id, params) {
    // 1. La rama actual decide si se puede salir (la captura grabando dice que no).
    if (actual) {
        let seVa = true;
        try { seVa = actual.modulo && typeof actual.modulo.desmontar === 'function' ? await actual.modulo.desmontar() : true; }
        catch (err) { console.error(`Rama ${actual.id}: desmontar falló`, err); }
        if (seVa === false) { marcarLateral(actual.id); return false; }
        actual = null;
    }

    const info = infoRama(id);
    marcarLateral(id);
    hueco.innerHTML = '<div class="tv-app-cargando"></div>';

    // 2. Cargar la rama. Solo ids conocidos o con forma de carpeta: nada de
    //    "../" armando una ruta a mano.
    let modulo = null, fallo = null;
    if (/^[a-z0-9-]+$/.test(String(id))) {
        try { modulo = (await import(`./ramas/${id}/index.js`)).default; }
        catch (err) { fallo = err; }
    }
    if (!modulo || typeof modulo.montar !== 'function') {
        const titulo = (info && info.titulo) || id;
        pintarMiga(titulo);
        mostrarEnConstruccion(id, titulo, fallo);
        actual = { id, modulo: null, contenedor: null, titulo };
        return true;
    }
    await cargarEstilo(id);

    // 3. Montarla en un contenedor nuevo.
    const titulo = modulo.titulo || (info && info.titulo) || id;
    const contenedor = document.createElement('section');
    contenedor.className = `tv-rama tv-rama--${id}`;
    contenedor.dataset.rama = id;
    hueco.innerHTML = '';
    hueco.appendChild(contenedor);
    pintarMiga(titulo);
    actual = { id, modulo, contenedor, titulo };

    const ctx = {
        api,
        ui,
        navegar,
        params: params || {},
        // Extra, fuera del contrato: un nivel más en la miga de pan.
        miga: texto => { if (actual && actual.contenedor === contenedor) pintarMiga(titulo, texto); }
    };
    try {
        await modulo.montar(contenedor, ctx);
    } catch (err) {
        console.error(`Rama ${id}: montar falló`, err);
        contenedor.innerHTML = pantallaAviso('alerta', 'Esta pantalla no pudo abrirse',
            'Algo falló al armarla. Lo demás de la app sigue andando.', err);
        contenedor.querySelector('[data-ir-inicio]')?.addEventListener('click', () => navegar('inicio'));
    }
    return true;
}

function pantallaAviso(icono, titulo, texto, err) {
    const detalle = err ? `<div class="tv-app-aviso-rama__detalle tv-seleccionable">${escapar(err.message || String(err))}</div>` : '';
    return `<div class="tv-app-aviso-rama">
        ${iconoHTML(icono)}
        <h2>${escapar(titulo)}</h2>
        <p>${escapar(texto)}</p>
        ${detalle}
        <button type="button" class="tv-btn" data-ir-inicio>${iconoHTML('casa')} Volver al inicio</button>
    </div>`;
}

function mostrarEnConstruccion(id, titulo, err) {
    // Un archivo que no está (404) es "todavía no existe"; cualquier otro
    // error es un bug de la rama, y se muestra para que se note.
    const noEsta = !err || /Failed to fetch|Cannot find module|404|No esta|error loading dynamically imported module/i.test(err.message || '');
    hueco.innerHTML = noEsta
        ? pantallaAviso('lapiz', `${titulo}: en construcción`, 'Esta parte de la app todavía no está lista.')
        : pantallaAviso('alerta', `${titulo}: no se pudo cargar`, 'El código de esta pantalla tiene un error.', err);
    if (err && !noEsta) console.error(`Rama ${id}: no se pudo importar`, err);
    hueco.querySelector('[data-ir-inicio]')?.addEventListener('click', () => navegar('inicio'));
}

// ─────────────────────────────────────────────
// ● REC
// ─────────────────────────────────────────────
// estadoGlobal.poner('grabando', {desde, rama?}) desde cualquier rama. Si no
// dice la rama, es la que estaba montada en ese momento: la que grabó.
let ramaQueGraba = null;
let relojInterval = null;

function pintarRec(valor) {
    clearInterval(relojInterval);
    lateral.querySelectorAll('.es-grabando').forEach(b => b.classList.remove('es-grabando'));
    if (!valor) { botonRec.hidden = true; ramaQueGraba = null; return; }
    ramaQueGraba = valor.rama || ramaQueGraba || (actual && actual.id) || 'captura';
    const desde = aFecha(valor.desde) || new Date();
    const tic = () => { relojRec.textContent = formatoTiempo((Date.now() - desde.getTime()) / 1000, { largo: true }); };
    tic();
    relojInterval = setInterval(tic, 1000);
    botonRec.hidden = false;
    botonRec.title = `Grabando — ir a ${(infoRama(ramaQueGraba) || {}).titulo || ramaQueGraba}`;
    lateral.querySelector(`[data-rama="${ramaQueGraba}"]`)?.classList.add('es-grabando');
}
botonRec.addEventListener('click', () => { if (ramaQueGraba && (!actual || actual.id !== ramaQueGraba)) navegar(ramaQueGraba); });

// ─────────────────────────────────────────────
// TEMA
// ─────────────────────────────────────────────
// Ajustes hace estadoGlobal.poner('tema', 'claro'): la carcasa lo aplica y
// le avisa a la ventana para que los botones nativos combinen.
function aplicarTema(tema) {
    const raiz = document.documentElement;
    if (tema === 'claro') raiz.dataset.tema = 'claro';
    else delete raiz.dataset.tema;
    const css = getComputedStyle(raiz);
    const fondo = css.getPropertyValue('--tv-panel').trim();
    const simbolos = css.getPropertyValue('--tv-texto').trim();
    try { api.ventana?.tema?.({ fondo, simbolos })?.catch?.(() => {}); } catch {}
}

estadoGlobal.alCambiar((clave, valor) => {
    if (clave === 'grabando') pintarRec(valor);
    if (clave === 'tema') aplicarTema(valor);
});

// ─────────────────────────────────────────────
// ATAJOS
// ─────────────────────────────────────────────
// Los de la rama van primero: la captura usa todo el teclado. Este oyente
// espera a que el evento termine de recorrer todos los demás (setTimeout 0)
// y si alguien hizo preventDefault(), no hace nada. Esc lo maneja el modal.
// Ctrl en Windows, ⌘ en Mac (en Mac Ctrl+flechas/números es del sistema).
window.addEventListener('keydown', e => {
    if (!teclaMod(e) || e.altKey || (e.ctrlKey && e.metaKey) || e.repeat) return;
    const digito = /^(Digit|Numpad)([1-6])$/.exec(e.code);
    const esK = e.code === 'KeyK';
    if (!digito && !esK) return;
    if (hayModalAbierto()) return;
    setTimeout(() => {
        if (e.defaultPrevented) return;
        if (digito) navegar(RAMAS[Number(digito[2]) - 1].id);
        else abrirBuscador();
    }, 0);
});

// ─────────────────────────────────────────────
// BUSCADOR GLOBAL (Ctrl+K)
// ─────────────────────────────────────────────
async function abrirBuscador() {
    if (hayModalAbierto()) return;
    const { abrirBuscador: abrir } = await import('./ui/buscador.js');
    abrir({ api, ui, navegar });
}
$('.tv-app-buscar__icono').append(crearIcono('buscar'));
$('.tv-app-buscar').addEventListener('click', abrirBuscador);
// index.html trae el texto de Windows; en Mac, ⌘K.
$('.tv-app-buscar').title = `Buscar partidos y plantillas (${textoAtajo('Mod+K')})`;
$('.tv-app-buscar .tv-tecla').textContent = textoAtajo('Mod+K').replace('+', ' ');

// ─────────────────────────────────────────────
// VENTANA (Mac)
// ─────────────────────────────────────────────
// En pantalla completa el semáforo desaparece y la barra deja de reservarle
// lugar (carcasa.css). ⌘, del menú de Mac llega como "ir a ajustes".
function marcarPantallaCompleta(si) {
    if (si) document.documentElement.dataset.pantallaCompleta = '';
    else delete document.documentElement.dataset.pantallaCompleta;
}
try {
    api.ventana?.onPantallaCompleta?.(marcarPantallaCompleta);
    api.ventana?.esPantallaCompleta?.()?.then?.(marcarPantallaCompleta, () => {});
    api.ventana?.onIrA?.(rama => { if (infoRama(rama) && !hayModalAbierto()) navegar(rama); });
} catch {}

// ─────────────────────────────────────────────
// ACTUALIZACIONES
// ─────────────────────────────────────────────
// La versión nueva se baja sola (main/actualizar.js) y se instala al cerrar
// la app. Cuando está lista se avisa una vez, con la opción de reiniciar ya.
let versionAvisada = null;
function avisarActualizacion(e) {
    if (!e || e.fase !== 'lista' || e.version === versionAvisada) return;
    versionAvisada = e.version;
    aviso(`Hay una versión nueva (${e.version}). Se instala sola al cerrar la app.`, 'info', {
        duracion: 0,
        accion: { texto: 'Reiniciar ahora', alHacer: () => api.actualizar.instalar().catch(() => {}) }
    });
}
try {
    api.actualizar?.onEstado?.(avisarActualizacion);
    api.actualizar?.estado?.()?.then?.(avisarActualizacion, () => {});
} catch {}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
armarLateral();
try {
    const ajustes = await api.ajustes.leer();
    estadoGlobal.poner('tema', (ajustes && ajustes.tema) || 'oscuro');
} catch (err) {
    console.warn('No se pudieron leer los ajustes; tema oscuro', err);
    aplicarTema('oscuro');
}
if (!estadoGlobal.leer('tema')) aplicarTema('oscuro');

// Errores sueltos: que se vean en un aviso y no queden solo en la consola.
window.addEventListener('unhandledrejection', e => {
    const msg = e.reason && (e.reason.message || String(e.reason));
    console.error('Promesa rechazada sin manejar', e.reason);
    if (msg) aviso(msg, 'error');
});

navegar('inicio');
