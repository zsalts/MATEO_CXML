// ─────────────────────────────────────────────
// RAMA AJUSTES — ajustes y equipos
// ─────────────────────────────────────────────
// Se guarda al cambiar, sin botón Guardar: como los ajustes de Windows. Cada
// control llama a guardar({clave: valor}) y un "Guardado" chiquito arriba
// confirma que llegó a la base.

import { escapar, iconoHTML, estadoGlobal, textoAtajo } from '../../ui/index.js';

const SECCIONES = [
    { id: 'general',  titulo: 'General',        icono: 'ajustes' },
    { id: 'video',    titulo: 'Video',          icono: 'video' },
    { id: 'importar', titulo: 'Importar',       icono: 'importar' },
    { id: 'ipad',     titulo: 'iPad',           icono: 'ipad' },
    { id: 'equipos',  titulo: 'Equipos',        icono: 'equipo' },
    { id: 'base',     titulo: 'Base de datos',  icono: 'base' },
    { id: 'acerca',   titulo: 'Acerca de',      icono: 'info' }
];

const CALIDADES = [3, 6, 10, 16];     // Mb/s
const MARGENES = [0, 2, 5, 10];       // segundos
const PUERTO_DEF = 8787;

let vivo = false;

export default {
    id: 'ajustes',
    titulo: 'Ajustes',
    icono: iconoHTML('ajustes'),
    descripcion: 'Carpeta, video, iPad y equipos',

    async montar(contenedor, ctx) {
        vivo = true;
        const { api, ui } = ctx;

        let ajustes = {};
        try { ajustes = await api.ajustes.leer() || {}; }
        catch (err) { ui.aviso('No se pudieron leer los ajustes: ' + mensaje(err), 'error'); }
        if (!vivo) return;

        contenedor.innerHTML = `
            <div class="tv-ajustes">
                <nav class="tv-ajustes-indice" aria-label="Secciones">
                    <h1>Ajustes</h1>
                    ${SECCIONES.map(s => `
                        <button type="button" class="tv-ajustes-indice__item" data-ir="${s.id}">${iconoHTML(s.icono)} ${escapar(s.titulo)}</button>`).join('')}
                    <div class="tv-ajustes-guardado" aria-live="polite"></div>
                </nav>
                <div class="tv-ajustes-contenido">
                    ${seccion('general', 'General', `
                        ${fila('Tema', 'Oscuro para trabajar a oscuras sin encandilarse; claro para oficinas con mucha luz.',
                            opciones('tema', [['oscuro', 'Oscuro'], ['claro', 'Claro']], ajustes.tema || 'oscuro'))}
                        ${fila('Carpeta de trabajo', 'Acá quedan los videos, los XML, los clips y la base de datos.', `
                            <div class="tv-ajustes-carpeta">
                                <code class="tv-ajustes-ruta tv-seleccionable" data-carpeta>${escapar(ajustes.carpeta || '—')}</code>
                                <div class="tv-ajustes-botones">
                                    <button type="button" class="tv-btn" data-accion="elegirCarpeta">${iconoHTML('carpeta')} Cambiar…</button>
                                    <button type="button" class="tv-btn" data-accion="abrirCarpeta">${iconoHTML('flecha-der')} Abrir carpeta</button>
                                </div>
                            </div>`, true)}
                    `)}
                    ${seccion('video', 'Video', `
                        ${fila('Calidad de grabación', 'Más calidad es más nitidez y más espacio en disco. 6 Mb/s alcanza para 1080p; 16 para ver detalle fino.',
                            opciones('calidad', CALIDADES.map(n => [n, `${n} Mb/s`]), Number(ajustes.calidad) || 6))}
                        ${fila('Margen de los clips', 'Segundos que se agregan antes y después de cada clip al cortarlo.',
                            opciones('margen', MARGENES.map(n => [n, n ? `${n} s` : 'Sin margen']), Number(ajustes.margen ?? 2)))}
                        <p class="tv-ajustes-nota tv-texto-2 tv-chica">${iconoHTML('info')} Referencia: 6 Mb/s son unos 2,7 GB por hora de partido.</p>
                    `)}
                    ${seccion('importar', 'Importar', `
                        ${fila('Copiar los videos importados a la carpeta de trabajo',
                            'Así el partido queda completo aunque desenchufes el disco de donde vino. Si lo desactivás, la base apunta al archivo original.',
                            interruptor('copiarVideosImportados', ajustes.copiarVideosImportados !== false))}
                    `)}
                    ${seccion('ipad', 'iPad', `
                        ${fila('Puerto', `El iPad se conecta a la compu por este puerto, en la misma red wifi. Cambialo solo si otro programa ya lo usa (por defecto ${PUERTO_DEF}).`, `
                            <input class="tv-campo tv-ajustes-puerto tv-numeros" type="number" min="1024" max="65535" step="1" data-clave="puertoRemoto" value="${escapar(ajustes.puertoRemoto || PUERTO_DEF)}">`)}
                    `)}
                    ${seccion('equipos', 'Equipos', `
                        <p class="tv-texto-2 tv-ajustes-intro">Los equipos que aparecen al capturar, importar y filtrar la base. El color se usa en las estadísticas y en el tiempo de posesión.</p>
                        <div class="tv-lista tv-ajustes-equipos" data-equipos></div>
                        <button type="button" class="tv-btn" data-accion="agregarEquipo">${iconoHTML('mas')} Agregar equipo</button>
                    `)}
                    ${seccion('base', 'Base de datos', `
                        ${fila('Copia de seguridad', 'Guarda una copia de la base (partidos, eventos, plantillas, playlists) en la carpeta Respaldos. Los videos no se copian.', `
                            <button type="button" class="tv-btn" data-accion="respaldar">${iconoHTML('copia')} Hacer copia de la base</button>`)}
                    `)}
                    ${seccion('acerca', 'Acerca de', `<dl class="tv-ajustes-acerca" data-acerca><dt>Versión</dt><dd>…</dd></dl>`)}
                </div>
            </div>`;

        const $ = s => contenedor.querySelector(s);
        const zonaGuardado = $('.tv-ajustes-guardado');
        let temporizadorGuardado = null;

        // ── Guardar ──
        async function guardar(parcial) {
            try {
                const nuevos = await api.ajustes.guardar(parcial);
                ajustes = nuevos && typeof nuevos === 'object' ? nuevos : Object.assign({}, ajustes, parcial);
                if (!vivo) return true;
                zonaGuardado.innerHTML = `${iconoHTML('check')} Guardado`;
                zonaGuardado.classList.add('es-visible');
                clearTimeout(temporizadorGuardado);
                temporizadorGuardado = setTimeout(() => zonaGuardado.classList.remove('es-visible'), 1800);
                return true;
            } catch (err) {
                ui.aviso('No se pudo guardar el ajuste: ' + mensaje(err), 'error');
                return false;
            }
        }

        // ── Opciones de a una (tema, calidad, margen) ──
        contenedor.addEventListener('click', async e => {
            const op = e.target.closest('[data-opcion]');
            if (op) {
                const grupo = op.closest('[data-grupo]');
                const clave = grupo.dataset.grupo;
                const valor = clave === 'tema' ? op.dataset.opcion : Number(op.dataset.opcion);
                const anterior = grupo.querySelector('[aria-checked="true"]');
                marcarOpcion(grupo, op);
                if (clave === 'tema') estadoGlobal.poner('tema', valor);    // se ve al instante
                if (!(await guardar({ [clave]: valor })) && anterior) {
                    marcarOpcion(grupo, anterior);
                    if (clave === 'tema') estadoGlobal.poner('tema', anterior.dataset.opcion);
                }
                return;
            }
            const ir = e.target.closest('[data-ir]');
            if (ir) {
                contenedor.querySelector(`#tv-ajustes-${ir.dataset.ir}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            const accion = e.target.closest('[data-accion]');
            if (accion) acciones[accion.dataset.accion]?.(accion, e.target);
        });

        // Flechas dentro de un grupo de opciones, como un radio de Windows.
        contenedor.addEventListener('keydown', e => {
            const op = e.target.closest?.('[data-opcion]');
            if (!op || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            const todas = [...op.parentElement.querySelectorAll('[data-opcion]')];
            const i = todas.indexOf(op) + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
            const sig = todas[(i + todas.length) % todas.length];
            sig.focus();
            sig.click();
        });

        // ── Interruptor ──
        contenedor.addEventListener('change', async e => {
            const t = e.target;
            if (t.matches('[data-interruptor]')) {
                if (!(await guardar({ [t.dataset.interruptor]: t.checked }))) t.checked = !t.checked;
            }
            if (t.matches('[data-clave="puertoRemoto"]')) {
                const n = Math.round(Number(t.value));
                if (!Number.isFinite(n) || n < 1024 || n > 65535) {
                    ui.aviso('El puerto tiene que ser un número entre 1024 y 65535.', 'error');
                    t.value = ajustes.puertoRemoto || PUERTO_DEF;
                    return;
                }
                t.value = n;
                if (n !== Number(ajustes.puertoRemoto)) await guardar({ puertoRemoto: n });
            }
        });
        // Enter en el puerto = listo, igual que salir del campo.
        $('.tv-ajustes-puerto').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

        // ── Acciones ──
        const acciones = {
            async elegirCarpeta(boton) {
                boton.disabled = true;
                try {
                    const r = await api.sys.elegirCarpeta();
                    if (r && r.cambio) {
                        ajustes.carpeta = r.carpeta;
                        $('[data-carpeta]').textContent = r.carpeta;
                        ui.aviso('La carpeta de trabajo ahora es ' + r.carpeta, 'ok');
                        pintarAcerca();
                    }
                } catch (err) { ui.aviso('No se pudo cambiar la carpeta: ' + mensaje(err), 'error'); }
                finally { boton.disabled = false; }
            },
            async abrirCarpeta() {
                try { await api.archivos.abrirCarpeta(); }
                catch (err) { ui.aviso('No se pudo abrir la carpeta: ' + mensaje(err), 'error'); }
            },
            async respaldar(boton) {
                boton.disabled = true;
                try {
                    const ruta = await api.archivos.respaldarBase();
                    ui.aviso('Copia de la base guardada.', 'ok', ruta ? { accion: { texto: 'Mostrar', alHacer: () => api.archivos.mostrar(ruta) } } : {});
                } catch (err) { ui.aviso('No se pudo hacer la copia: ' + mensaje(err), 'error'); }
                finally { boton.disabled = false; }
            },
            async agregarEquipo() {
                const nombre = await ui.pedirTexto('Agregar equipo', '', { etiqueta: 'Nombre del equipo', placeholder: 'Club Atlético…' });
                if (!nombre) return;
                const usados = equipos.map(x => String(x.color).toLowerCase());
                const color = PALETA.find(c => !usados.includes(c)) || PALETA[equipos.length % PALETA.length];
                try {
                    await api.equipos.guardar({ nombre, color });
                    await pintarEquipos();
                } catch (err) { ui.aviso('No se pudo agregar el equipo: ' + mensaje(err), 'error'); }
            },
            async borrarEquipo(boton) {
                const fila = boton.closest('[data-equipo]');
                const eq = equipos.find(x => String(x.id) === fila.dataset.equipo);
                if (!eq) return;
                if (!(await ui.confirmar(`¿Borrar "${eq.nombre}"?\n\nLos partidos donde jugó no se tocan: siguen teniendo su nombre.`, { titulo: 'Borrar equipo', peligro: true }))) return;
                try {
                    await api.equipos.borrar(eq.id);
                    await pintarEquipos();
                } catch (err) { ui.aviso('No se pudo borrar el equipo: ' + mensaje(err), 'error'); }
            }
        };

        // ── Equipos (ABM en el lugar) ──
        let equipos = [];
        async function pintarEquipos() {
            const caja = $('[data-equipos]');
            try { equipos = await api.equipos.listar() || []; }
            catch (err) { ui.aviso('No se pudieron leer los equipos: ' + mensaje(err), 'error'); equipos = []; }
            if (!vivo) return;
            if (!equipos.length) {
                caja.innerHTML = `<div class="tv-vacio tv-chica">${iconoHTML('equipo')} Todavía no cargaste equipos. También llegan solos al importar una copia del iPad.</div>`;
                return;
            }
            caja.innerHTML = equipos.map(eq => `
                <div class="tv-lista__fila tv-ajustes-equipo" data-equipo="${escapar(eq.id)}">
                    <input class="tv-campo" type="color" value="${escapar(colorValido(eq.color))}" data-campo="color" aria-label="Color de ${escapar(eq.nombre)}">
                    <input class="tv-campo" type="text" value="${escapar(eq.nombre)}" data-campo="nombre" spellcheck="false" aria-label="Nombre del equipo">
                    <button type="button" class="tv-btn tv-btn--icono tv-btn--fantasma tv-btn--peligro" data-accion="borrarEquipo" title="Borrar equipo">${iconoHTML('basura')}</button>
                </div>`).join('');
        }
        // El nombre se guarda al salir del campo (o Enter), no en cada tecla.
        $('[data-equipos]').addEventListener('change', async e => {
            const fila = e.target.closest('[data-equipo]');
            if (!fila) return;
            const eq = equipos.find(x => String(x.id) === fila.dataset.equipo);
            if (!eq) return;
            const campo = e.target.dataset.campo;
            let valor = e.target.value;
            if (campo === 'nombre') {
                valor = valor.trim();
                if (!valor) { e.target.value = eq.nombre; return; }
                if (valor === eq.nombre) return;
            }
            try {
                await api.equipos.guardar({ id: eq.id, nombre: campo === 'nombre' ? valor : eq.nombre, color: campo === 'color' ? valor : eq.color });
                eq[campo] = valor;
                zonaGuardado.innerHTML = `${iconoHTML('check')} Guardado`;
                zonaGuardado.classList.add('es-visible');
                clearTimeout(temporizadorGuardado);
                temporizadorGuardado = setTimeout(() => zonaGuardado.classList.remove('es-visible'), 1800);
            } catch (err) {
                ui.aviso('No se pudo guardar el equipo: ' + mensaje(err), 'error');
                e.target.value = campo === 'color' ? colorValido(eq.color) : eq.nombre;
            }
        });
        $('[data-equipos]').addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.dataset.campo === 'nombre') e.target.blur();
            if (e.key === 'Escape' && e.target.dataset.campo === 'nombre') {
                const eq = equipos.find(x => String(x.id) === e.target.closest('[data-equipo]').dataset.equipo);
                if (eq) e.target.value = eq.nombre;
                e.target.blur();
            }
        });

        // ── Acerca de ──
        async function pintarAcerca() {
            let info = {};
            try { info = await api.sys.info() || {}; } catch {}
            if (!vivo) return;
            const filas = [
                ['Versión', info.version],
                ['Electron', info.electron],
                ['Chromium', info.chrome],
                ['Carpeta de trabajo', info.carpeta || ajustes.carpeta],
                ['Base de datos', info.base]
            ].filter(([, v]) => v);
            $('[data-acerca]').innerHTML = filas.map(([k, v]) => `<dt>${escapar(k)}</dt><dd class="tv-seleccionable">${escapar(v)}</dd>`).join('') +
                `<dt>Atajos</dt><dd><span class="tv-tecla">${escapar(textoAtajo('Mod').replace('+', ' '))} 1…6</span> cambiar de pantalla · <span class="tv-tecla">${escapar(textoAtajo('Mod+K').replace('+', ' '))}</span> buscar · <span class="tv-tecla">Esc</span> cerrar</dd>`;
        }

        // La sección visible queda marcada en el índice.
        const contenido = $('.tv-ajustes-contenido');
        const observador = new IntersectionObserver(entradas => {
            entradas.forEach(en => {
                if (!en.isIntersecting) return;
                const id = en.target.id.replace('tv-ajustes-', '');
                contenedor.querySelectorAll('[data-ir]').forEach(b => b.classList.toggle('es-activa', b.dataset.ir === id));
            });
        }, { root: contenido, rootMargin: '0px 0px -70% 0px' });
        contenedor.querySelectorAll('.tv-ajustes-seccion').forEach(s => observador.observe(s));
        quitar = () => observador.disconnect();

        await Promise.all([pintarEquipos(), pintarAcerca()]);
    },

    async desmontar() {
        // Un nombre de equipo a medio escribir se guarda con el blur antes de irse.
        if (document.activeElement && document.activeElement.closest?.('.tv-ajustes')) document.activeElement.blur();
        vivo = false;
        quitar();
        return true;
    }
};

let quitar = () => {};

// ─────────────────────────────────────────────
// PIEZAS
// ─────────────────────────────────────────────
const mensaje = err => (err && err.message) || String(err);
const PALETA = ['#1f6feb', '#d9480f', '#2f9e44', '#ae3ec9', '#f59f00', '#0c8599', '#e03131', '#495057'];
const colorValido = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '#888888';

function seccion(id, titulo, cuerpo) {
    const s = SECCIONES.find(x => x.id === id);
    return `<section class="tv-ajustes-seccion" id="tv-ajustes-${id}" aria-labelledby="tv-ajustes-t-${id}">
        <h2 id="tv-ajustes-t-${id}">${iconoHTML(s ? s.icono : 'ajustes')} ${escapar(titulo)}</h2>
        <div class="tv-panel tv-ajustes-panel">${cuerpo}</div>
    </section>`;
}

function fila(titulo, ayuda, control, ancha = false) {
    return `<div class="tv-ajustes-fila${ancha ? ' tv-ajustes-fila--ancha' : ''}">
        <div class="tv-ajustes-fila__texto">
            <div class="tv-ajustes-fila__titulo">${escapar(titulo)}</div>
            <div class="tv-texto-2 tv-chica">${escapar(ayuda)}</div>
        </div>
        <div class="tv-ajustes-fila__control">${control}</div>
    </div>`;
}

function opciones(clave, lista, actual) {
    return `<div class="tv-ajustes-opciones" role="radiogroup" data-grupo="${clave}">
        ${lista.map(([valor, texto]) => {
            const si = String(valor) === String(actual);
            return `<button type="button" role="radio" aria-checked="${si}" tabindex="${si ? 0 : -1}" data-opcion="${escapar(valor)}">${escapar(texto)}</button>`;
        }).join('')}
    </div>`;
}

function marcarOpcion(grupo, boton) {
    grupo.querySelectorAll('[data-opcion]').forEach(b => {
        const si = b === boton;
        b.setAttribute('aria-checked', String(si));
        b.tabIndex = si ? 0 : -1;
    });
}

function interruptor(clave, encendido) {
    return `<label class="tv-ajustes-interruptor">
        <input type="checkbox" role="switch" data-interruptor="${clave}" ${encendido ? 'checked' : ''}>
        <span class="tv-ajustes-interruptor__pista"></span>
    </label>`;
}
