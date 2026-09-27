// ─────────────────────────────────────────────
// RAMA INICIO — el menú principal
// ─────────────────────────────────────────────
// Lo primero que se ve. Cuatro caminos grandes (capturar en vivo, capturar
// desde el iPad, importar, base de datos), las plantillas que vinieron del
// iPad listas para usar y los últimos partidos.

import {
    escapar, iconoHTML, formatoTiempo, fechaCorta, plural,
    miniaturaSVG, datosDePlantilla, resumenImportacion, capturarCon
} from '../../ui/index.js';
import { textoAtajo } from '../../ui/plataforma.js';   // ⌘ en Mac, Ctrl en Windows (Agente 7)
import { recientes, esPrimeraVez, origenDe, saludo, rivales, pideLogin } from './logica.js';

// Cada tarjeta tiene su color de identidad, siempre sacado de los tokens:
// así se distinguen de un vistazo y el tema claro sigue andando.
const ACCIONES = [
    { rama: 'captura',  titulo: 'Captura en vivo',          texto: 'Conectá la cámara, codificá y cortá en vivo', icono: 'camara',   tono: 'rec',    tecla: 3 },
    { rama: 'ipad',     titulo: 'Captura desde iPad',       texto: 'La compu graba, el iPad codifica por wifi',   icono: 'ipad',     tono: 'acento', tecla: 4 },
    { rama: 'importar', titulo: 'Importar video + archivo', texto: 'Subí un partido ya grabado a la base',        icono: 'importar', tono: 'aviso',  tecla: 5 },
    { rama: 'base',     titulo: 'Base de datos',            texto: 'Partidos, clips, plantillas y playlists',     icono: 'base',     tono: 'ok',     tecla: 2 }
];

let vivo = false;

export default {
    id: 'inicio',
    titulo: 'Inicio',
    icono: iconoHTML('casa'),
    descripcion: 'Menú principal',

    async montar(contenedor, ctx) {
        vivo = true;
        const { api } = ctx;

        contenedor.innerHTML = `
            <div class="tv-inicio">
                <header class="tv-inicio-cabecera">
                    <h1>${escapar(saludo())}</h1>
                    <p class="tv-texto-2">¿Qué hacemos hoy?</p>
                </header>

                <div class="tv-inicio-pasos" hidden></div>

                <section class="tv-inicio-acciones" aria-label="Acciones">
                    ${ACCIONES.map(a => `
                        <button type="button" class="tv-inicio-tarjeta tv-inicio-tarjeta--${a.tono}" data-rama="${a.rama}">
                            <span class="tv-inicio-tarjeta__icono">${iconoHTML(a.icono)}</span>
                            <span class="tv-inicio-tarjeta__titulo">${escapar(a.titulo)}</span>
                            <span class="tv-inicio-tarjeta__texto">${escapar(a.texto)}</span>
                            <span class="tv-inicio-tarjeta__tecla"><span class="tv-tecla">${escapar(textoAtajo('Mod+' + a.tecla).replace('+', ' '))}</span></span>
                        </button>`).join('')}
                    <button type="button" class="tv-inicio-tarjeta tv-inicio-tarjeta--chica" data-rama="ajustes">
                        <span class="tv-inicio-tarjeta__icono">${iconoHTML('ajustes')}</span>
                        <span class="tv-inicio-tarjeta__titulo">Ajustes</span>
                        <span class="tv-inicio-tarjeta__texto">Carpeta, video, equipos</span>
                    </button>
                </section>

                <div class="tv-inicio-columnas">
                    <section class="tv-panel tv-inicio-bloque" aria-labelledby="tv-inicio-t-plantillas">
                        <header class="tv-inicio-bloque__cabecera">
                            <h2 id="tv-inicio-t-plantillas">Mis plantillas</h2>
                            <span class="tv-chip" data-cuenta-plantillas></span>
                            <span class="tv-barra__espacio"></span>
                            <button type="button" class="tv-btn tv-btn--chico" data-importar="archivo" title="Una copia de seguridad o una plantilla exportada desde el iPad">
                                ${iconoHTML('ipad')} Importar del iPad (archivo)
                            </button>
                            <button type="button" class="tv-btn tv-btn--chico" data-importar="nube" title="Lo que el iPad subió a la nube">
                                ${iconoHTML('nube')} Traer de la nube
                            </button>
                        </header>
                        <div class="tv-lista tv-inicio-bloque__lista" data-plantillas>
                            ${cargando()}
                        </div>
                    </section>

                    <section class="tv-panel tv-inicio-bloque" aria-labelledby="tv-inicio-t-recientes">
                        <header class="tv-inicio-bloque__cabecera">
                            <h2 id="tv-inicio-t-recientes">Partidos recientes</h2>
                            <span class="tv-barra__espacio"></span>
                            <button type="button" class="tv-btn tv-btn--chico tv-btn--fantasma" data-rama="base">
                                Ver todos ${iconoHTML('chevron-der')}
                            </button>
                        </header>
                        <div class="tv-lista tv-inicio-bloque__lista" data-recientes>
                            ${cargando()}
                        </div>
                    </section>
                </div>
            </div>`;

        contenedor.addEventListener('click', e => {
            const imp = e.target.closest('[data-importar]');
            if (imp) return importar(imp.dataset.importar, imp);
            const plantilla = e.target.closest('[data-plantilla]');
            if (plantilla) return capturarCon(ctx, idDe(plantilla.dataset.plantilla, listaPlantillas), plantilla.dataset.nombre);
            const partido = e.target.closest('[data-partido]');
            if (partido) return ctx.navegar('base', { partidoId: idDe(partido.dataset.partido, listaPartidos) });
            const rama = e.target.closest('[data-rama]');
            if (rama) return ctx.navegar(rama.dataset.rama);
        });

        let listaPlantillas = [], listaPartidos = [];
        // El id vuelve de un data-*, como texto: se busca el original para no
        // mandarle "12" a una API que espera 12.
        const idDe = (texto, lista) => { const x = lista.find(o => String(o.id) === texto); return x ? x.id : texto; };

        async function refrescar() {
            const [pl, pa] = await Promise.all([
                api.plantillas.listar().catch(err => { ctx.ui.aviso('No se pudieron leer las plantillas: ' + mensaje(err), 'error'); return []; }),
                api.partidos.listar().catch(err => { ctx.ui.aviso('No se pudieron leer los partidos: ' + mensaje(err), 'error'); return []; })
            ]);
            if (!vivo) return;
            listaPlantillas = pl || [];
            listaPartidos = pa || [];
            pintarPasos(contenedor, esPrimeraVez(listaPlantillas, listaPartidos));
            pintarPlantillas(contenedor, listaPlantillas, api);
            pintarRecientes(contenedor, recientes(listaPartidos, 8));
        }

        // Importar del iPad: archivo o nube. El botón queda ocupado mientras
        // tanto, así un doble clic no importa dos veces.
        async function importar(desde, boton) {
            const botones = contenedor.querySelectorAll('[data-importar]');
            botones.forEach(b => { b.disabled = true; });
            const textoOriginal = boton.innerHTML;
            boton.innerHTML = `${iconoHTML(desde === 'nube' ? 'nube' : 'ipad')} ${desde === 'nube' ? 'Trayendo…' : 'Importando…'}`;
            try {
                const r = desde === 'nube' ? await traerDeLaNube(ctx) : await api.plantillas.importarArchivo();
                // cancelado = cerró el diálogo sin elegir: no hay nada que avisar.
                if (r && !r.cancelado) {
                    ctx.ui.aviso(resumenImportacion(r), 'ok');
                    await refrescar();
                }
            } catch (err) {
                ctx.ui.aviso('No se pudo importar: ' + mensaje(err), 'error');
            } finally {
                if (vivo) {
                    boton.innerHTML = textoOriginal;
                    botones.forEach(b => { b.disabled = false; });
                }
            }
        }

        await refrescar();
    },

    async desmontar() {
        vivo = false;
        return true;
    }
};

// ─────────────────────────────────────────────
// PARTES DE LA PANTALLA
// ─────────────────────────────────────────────
const cargando = () => `<div class="tv-inicio-cargando"><span></span><span></span><span></span></div>`;
const mensaje = err => (err && err.message) || String(err);

function pintarPasos(raiz, primeraVez) {
    const caja = raiz.querySelector('.tv-inicio-pasos');
    caja.hidden = !primeraVez;
    raiz.querySelector('.tv-inicio').classList.toggle('es-primera-vez', primeraVez);
    if (!primeraVez) { caja.innerHTML = ''; return; }
    caja.innerHTML = `
        <div class="tv-inicio-pasos__texto">
            <h2>Para arrancar</h2>
            <ol>
                <li class="es-actual"><span>1</span> Importá tus plantillas del iPad</li>
                <li><span>2</span> Conectá la cámara</li>
                <li><span>3</span> Capturá</li>
            </ol>
        </div>
        <button type="button" class="tv-btn tv-btn--primario tv-inicio-pasos__boton" data-importar="archivo">
            ${iconoHTML('ipad')} Importar del iPad
        </button>`;
}

function pintarPlantillas(raiz, lista, api) {
    const caja = raiz.querySelector('[data-plantillas]');
    raiz.querySelector('[data-cuenta-plantillas]').textContent = lista.length || '';
    if (!lista.length) {
        caja.innerHTML = `
            <div class="tv-vacio">
                ${iconoHTML('botonera')}
                <div class="tv-vacio__titulo">Sin plantillas todavía</div>
                <div>Las botoneras se arman en el iPad.<br>Exportá una copia de seguridad allá e importala acá.</div>
            </div>`;
        return;
    }
    caja.innerHTML = lista.map(p => `
        <button type="button" class="tv-lista__fila tv-inicio-plantilla" data-plantilla="${escapar(p.id)}" data-nombre="${escapar(p.nombre)}" title="Capturar con ${escapar(p.nombre)}">
            <span class="tv-inicio-plantilla__mini" data-mini="${escapar(p.id)}"></span>
            <span class="tv-inicio-fila__texto">
                <span class="tv-recortar tv-inicio-fila__nombre">${escapar(p.nombre)}</span>
                <span class="tv-texto-2 tv-chica tv-recortar">${escapar(fechaCorta(p.actualizado))}${p.origen ? ' · ' + escapar(p.origen) : ''}</span>
            </span>
            <span class="tv-inicio-fila__ir">${iconoHTML('grabar')} Capturar</span>
        </button>`).join('');
    // Las miniaturas llegan de a una: la lista aparece al toque y se completa.
    lista.forEach(p => datosDePlantilla(api, p).then(datos => {
        const hueco = caja.querySelector(`[data-mini="${CSS.escape(String(p.id))}"]`);
        if (hueco) hueco.innerHTML = miniaturaSVG(datos);
    }));
}

function pintarRecientes(raiz, lista) {
    const caja = raiz.querySelector('[data-recientes]');
    if (!lista.length) {
        caja.innerHTML = `
            <div class="tv-vacio">
                ${iconoHTML('video')}
                <div class="tv-vacio__titulo">Todavía no hay partidos</div>
                <div>Lo que captures o importes aparece acá.</div>
            </div>`;
        return;
    }
    caja.innerHTML = lista.map(p => {
        const o = origenDe(p.origen);
        const vs = rivales(p);
        return `
        <button type="button" class="tv-lista__fila tv-inicio-partido" data-partido="${escapar(p.id)}" title="Abrir en la base de datos">
            <span class="tv-inicio-partido__origen" title="${escapar(o.texto)}">${iconoHTML(o.icono)}</span>
            <span class="tv-inicio-fila__texto">
                <span class="tv-recortar tv-inicio-fila__nombre">${escapar(p.nombre)}</span>
                <span class="tv-texto-2 tv-chica tv-recortar">${escapar(fechaCorta(p.creado))}${vs && vs !== p.nombre ? ' · ' + escapar(vs) : ''}</span>
            </span>
            <span class="tv-inicio-partido__datos tv-texto-2 tv-chica tv-numeros">
                <span title="Duración">${p.duracion ? escapar(formatoTiempo(p.duracion)) : '—'}</span>
                <span title="Eventos">${escapar(plural(p.eventos || 0, 'evento'))}</span>
            </span>
            <span class="tv-inicio-partido__archivos">
                <span class="${p.video_ruta ? 'es-si' : ''}" title="${p.video_ruta ? 'Tiene video' : 'Sin video'}">${iconoHTML('video')}</span>
                <span class="${p.xml_ruta ? 'es-si' : ''}" title="${p.xml_ruta ? 'Tiene XML de Sportscode' : 'Sin XML'}">${iconoHTML('documento')}</span>
            </span>
        </button>`;
    }).join('');
}

// ─────────────────────────────────────────────
// NUBE CON LOGIN
// ─────────────────────────────────────────────
// Primero sin credenciales (si ya hay sesión guardada, entra directo). Si la
// nube pide login, se piden correo y contraseña y se reintenta; si están
// mal, se vuelven a pedir con el correo ya escrito.
async function traerDeLaNube(ctx) {
    const api = ctx.api;
    let r;
    try { r = await api.plantillas.importarNube(); }
    catch (err) { if (!pideLogin(err)) throw err; r = { necesitaLogin: true }; }
    if (!pideLogin(r)) return r;

    let correo = '', error = '';
    for (;;) {
        const datos = await pedirLogin(ctx, correo, error);
        if (!datos) return null;
        correo = datos.correo;
        try {
            r = await api.plantillas.importarNube(datos);
            if (!pideLogin(r)) return r;
            error = 'La nube sigue pidiendo iniciar sesión.';
        } catch (err) {
            if (!pideLogin(err) && !/contrase|password|credencial|login|incorrect|invalid/i.test(mensaje(err))) throw err;
            error = pideLogin(err) ? 'Correo o contraseña incorrectos.' : mensaje(err);
        }
    }
}

async function pedirLogin(ctx, correo, error) {
    const div = document.createElement('form');
    div.className = 'tv-form';
    div.innerHTML = `
        <p class="tv-texto-2">Entrá con la misma cuenta que usás en el iPad para traer tus plantillas y partidos.</p>
        ${error ? `<p class="tv-inicio-login__error">${iconoHTML('alerta')} ${escapar(error)}</p>` : ''}
        <div>
            <label class="tv-etiqueta" for="tv-login-correo">Correo</label>
            <input class="tv-campo" id="tv-login-correo" type="email" autocomplete="username" spellcheck="false">
        </div>
        <div>
            <label class="tv-etiqueta" for="tv-login-clave">Contraseña</label>
            <input class="tv-campo" id="tv-login-clave" type="password" autocomplete="current-password">
        </div>`;
    div.addEventListener('submit', e => e.preventDefault());
    const campoCorreo = div.querySelector('#tv-login-correo');
    const campoClave = div.querySelector('#tv-login-clave');
    campoCorreo.value = correo || '';
    const r = await ctx.ui.modal({
        titulo: 'Iniciar sesión en la nube',
        contenido: div,
        ancho: 400,
        foco: correo ? campoClave : campoCorreo,
        botones: [{ texto: 'Cancelar', valor: null }, { texto: 'Entrar', valor: 'ok', primario: true }],
        antesDeCerrar: () => {
            const falta = !campoCorreo.value.trim() ? campoCorreo : !campoClave.value ? campoClave : null;
            if (falta) { falta.classList.remove('es-invalido'); void falta.offsetWidth; falta.classList.add('es-invalido'); falta.focus(); return false; }
            return true;
        }
    });
    return r === 'ok' ? { correo: campoCorreo.value.trim(), clave: campoClave.value } : null;
}
