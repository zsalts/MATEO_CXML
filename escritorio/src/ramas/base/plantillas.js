// Pestaña Plantillas: las botoneras que vinieron del iPad. Acá no se diseñan
// (eso se hace en el iPad o en la web): se ven, se renombran, se duplican,
// se exportan de vuelta para el iPad, se borran, y se les pone atajos de
// teclado, que es lo único que la compu agrega (element.atajo; el iPad lo
// ignora).

import { h, llenar, boton, crearIcono, intentar, hacer, cargarNucleo, vacio, fechaCorta } from './comun.js';
import { datosDePlantilla, botonesDePlantilla, atajosRepetidos, atajoValido, conAtajo, rectangulosMiniatura, NOMBRE_TIPO } from './logica.js';

const ORIGEN = { ipad: 'Del iPad', nube: 'De la nube', archivo: 'De un archivo', web: 'De la web' };

export function crearPestanaPlantillas(ctx) {
    const api = ctx.api;
    let plantillas = [];
    let elegida = null;          // { id, nombre, datos }
    const vistas = [];           // miniaturas con crearVista, para destruirlas

    const grilla = h('div', { class: 'tv-base-pt__grilla' });
    const detalle = h('div', { class: 'tv-base-pt__detalle' });
    const el = h('div', { class: 'tv-base-pt' },
        h('div', { class: 'tv-base-pt__izq' },
            h('div', { class: 'tv-barra' },
                h('span', { class: 'tv-barra__titulo' }, 'Plantillas'),
                h('span', { class: 'tv-chica tv-texto-2' }, 'Se arman en el iPad y se traen acá'),
                h('span', { class: 'tv-barra__espacio' }),
                boton('Importar archivo', { icono: 'importar', clase: 'tv-btn--chico', titulo: 'El archivo que exporta el iPad', alHacer: () => importar('archivo') }),
                boton('Traer de la nube', { icono: 'nube', clase: 'tv-btn--chico', alHacer: () => importar('nube') })),
            grilla),
        detalle);

    // ── Datos ──
    async function cargar() {
        plantillas = (await intentar(ctx, () => api.plantillas.listar(), 'No se pudieron leer las plantillas')) || [];
        await pintarGrilla();
        if (elegida && plantillas.some(p => p.id === elegida.id)) await elegir(elegida.id);
        else { elegida = null; pintarDetalle(); }
    }

    async function importar(desde) {
        const r = await hacer(ctx, () => desde === 'nube' ? api.plantillas.importarNube() : api.plantillas.importarArchivo(),
            desde === 'nube' ? 'No se pudo traer de la nube' : 'No se pudo importar el archivo');
        if (!r.ok || !r.valor || r.valor.cancelado) return;   // canceló el diálogo
        const x = r.valor;
        const partes = [
            x.plantillas ? `${x.plantillas} ${x.plantillas === 1 ? 'plantilla' : 'plantillas'}` : null,
            x.equipos ? `${x.equipos} ${x.equipos === 1 ? 'equipo' : 'equipos'}` : null,
            x.partidos ? `${x.partidos} ${x.partidos === 1 ? 'partido' : 'partidos'}` : null
        ].filter(Boolean);
        ctx.ui.aviso(partes.length ? 'Importado: ' + partes.join(', ') : 'No había nada nuevo para importar', partes.length ? 'ok' : 'info');
        await cargar();
    }

    // ── Grilla con miniaturas ──
    async function pintarGrilla() {
        vistas.splice(0).forEach(v => { try { v.destruir(); } catch (_) { /* nada */ } });
        if (!plantillas.length) {
            grilla.replaceChildren(vacio('botonera', 'Todavía no hay plantillas',
                'Armá la botonera en el iPad, exportala y traela con "Importar archivo" o "Traer de la nube".',
                boton('Importar archivo', { icono: 'importar', clase: 'tv-btn--primario', alHacer: () => importar('archivo') })));
            return;
        }
        const tarjetas = plantillas.map(p => {
            const mini = h('div', { class: 'tv-base-pt__mini' });
            const t = h('div', {
                class: 'tv-base-pt__tarjeta' + (elegida && elegida.id === p.id ? ' es-activa' : ''), tabindex: '0', role: 'button', 'data-id': p.id,
                onclick: () => elegir(p.id), onkeydown: e => { if (e.key === 'Enter') elegir(p.id); }
            }, mini,
                h('div', { class: 'tv-base-pt__pie' },
                    h('div', { class: 'tv-recortar', title: p.nombre }, p.nombre),
                    h('div', { class: 'tv-chica tv-texto-2' }, [ORIGEN[p.origen] || '', fechaCorta(p.actualizado)].filter(Boolean).join(' · '))));
            return { p, t, mini };
        });
        grilla.replaceChildren(...tarjetas.map(x => x.t));
        // Las miniaturas se llenan después, de a una: leer 30 plantillas no
        // tiene que frenar que aparezca la grilla
        (async () => {
            for (const { p, mini } of tarjetas) {
                if (!mini.isConnected) return;         // se volvió a pintar la grilla
                const leida = await intentar(ctx, () => api.plantillas.leer(p.id), 'No se pudo leer una plantilla');
                if (leida) await miniatura(mini, datosDePlantilla(leida.datos));
            }
        })();
    }

    async function miniatura(caja, datos) {
        const mod = await cargarNucleo('botonera-vista');
        if (mod && typeof mod.crearVista === 'function') {
            try {
                const lienzo = h('div', { class: 'tv-base-pt__vista' });
                caja.replaceChildren(lienzo);
                vistas.push(mod.crearVista(lienzo, datos, { hoja: null, ajustar: true, modo: 'miniatura', mostrarAtajos: false }));
                return;
            } catch (err) {
                console.warn('[base] crearVista falló, va la miniatura simple', err);
            }
        }
        // Sin botonera-vista.js: rectángulos con el color de cada botón
        const W = 200, H = 120;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'tv-base-pt__svg');
        const rects = rectangulosMiniatura(datos, W, H);
        const ox = (W - Math.max(0, ...rects.map(r => r.x + r.w))) / 2;
        const oy = (H - Math.max(0, ...rects.map(r => r.y + r.h))) / 2;
        rects.forEach(r => {
            const n = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            n.setAttribute('x', r.x + ox); n.setAttribute('y', r.y + oy);
            n.setAttribute('width', r.w); n.setAttribute('height', r.h);
            n.setAttribute('rx', Math.min(3, r.w / 4));
            if (r.contenedor) n.setAttribute('class', 'tv-base-pt__contenedor');
            else n.setAttribute('fill', r.color);
            svg.appendChild(n);
        });
        caja.replaceChildren(rects.length ? svg : h('span', { class: 'tv-chica tv-texto-2' }, 'Vacía'));
    }

    // ── Detalle ──
    async function elegir(id) {
        const p = await intentar(ctx, () => api.plantillas.leer(id), 'No se pudo abrir la plantilla');
        if (!p) return;
        elegida = { id: p.id, nombre: p.nombre, datos: datosDePlantilla(p.datos), crudo: p.datos };
        grilla.querySelectorAll('.tv-base-pt__tarjeta').forEach(t => t.classList.toggle('es-activa', String(t.dataset.id) === String(id)));
        pintarDetalle();
    }

    function pintarDetalle() {
        if (!elegida) {
            detalle.replaceChildren(vacio('botonera', 'Elegí una plantilla', 'Vas a ver sus botones y poder ponerles atajos de teclado.'));
            return;
        }
        const { id, nombre, datos } = elegida;
        const repetidos = atajosRepetidos(datos);
        const botones = botonesDePlantilla(datos);
        const conflicto = [...repetidos.keys()];

        const filas = botones.map(b => {
            const repetido = b.atajo && repetidos.has(b.atajo.toLowerCase());
            const campo = h('input', {
                class: 'tv-campo tv-base-pt__atajo tv-mono' + (repetido ? ' es-repetido' : ''),
                value: b.atajo ? b.atajo.toUpperCase() : '', placeholder: '—', readonly: true,
                title: 'Tocá una tecla. Supr o Retroceso lo borra.', 'aria-label': 'Atajo de ' + b.nombre
            });
            // La tecla se toma del keydown, no del texto: así "F5" o "ñ" andan
            // igual y no hace falta borrar antes de cambiar
            campo.addEventListener('keydown', e => {
                if (e.key === 'Tab' || e.key === 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                if (e.ctrlKey || e.altKey || e.metaKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
                const tecla = e.key === 'Backspace' || e.key === 'Delete' ? '' : e.key;
                if (!atajoValido(tecla)) { ctx.ui.aviso('Esa tecla no sirve de atajo: usá una letra, un número, un símbolo o F1–F12', 'aviso'); return; }
                cambiarAtajo(b.id, tecla);
            });
            return h('tr', { class: repetido ? 'es-repetido' : '' },
                h('td', {}, b.color ? h('i', { class: 'tv-base-punto', style: { background: b.color } }) : null, ' ', b.nombre),
                h('td', { class: 'tv-texto-2' }, NOMBRE_TIPO[b.tipo] || b.tipo),
                h('td', { class: 'tv-texto-2' }, b.hoja),
                h('td', {}, campo));
        });

        llenar(detalle,
            h('div', { class: 'tv-barra' }, h('span', { class: 'tv-barra__titulo tv-recortar' }, nombre)),
            h('div', { class: 'tv-base-pt__acciones' },
                boton('Capturar con esta', { icono: 'camara', clase: 'tv-btn--primario', alHacer: () => ctx.navegar('captura', { plantillaId: id }) }),
                boton('Capturar desde iPad', { icono: 'ipad', alHacer: () => ctx.navegar('ipad', { plantillaId: id }) })),
            h('div', { class: 'tv-base-pt__acciones' },
                boton('Renombrar', { icono: 'lapiz', clase: 'tv-btn--chico', alHacer: () => renombrar() }),
                boton('Duplicar', { icono: 'copia', clase: 'tv-btn--chico', alHacer: () => duplicar() }),
                boton('Exportar para el iPad', { icono: 'descargar', clase: 'tv-btn--chico', alHacer: () => exportar() }),
                boton('Borrar', { icono: 'basura', clase: 'tv-btn--chico tv-btn--peligro', alHacer: () => borrar() })),
            h('div', { class: 'tv-base-pt__ayuda tv-chica tv-texto-2' },
                'El diseño se cambia en el iPad. Acá solo se ponen los atajos de teclado para capturar en la compu: tocá el casillero y apretá la tecla.'),
            conflicto.length ? h('div', { class: 'tv-base-error tv-chica' }, crearIcono('alerta'),
                ` Teclas repetidas: ${conflicto.map(k => k.toUpperCase()).join(', ')}. En la captura, esa tecla dispara solo el primero.`) : null,
            botones.length
                ? h('div', { class: 'tv-base-tabla__caja' }, h('table', { class: 'tv-base-tabla' },
                    h('thead', {}, h('tr', {}, h('th', {}, 'Botón'), h('th', {}, 'Tipo'), h('th', {}, 'Pestaña'), h('th', {}, 'Atajo'))),
                    h('tbody', {}, ...filas)))
                : vacio('botonera', 'Esta plantilla no tiene botones', ''));
    }

    // Guardar SOLO cambia el atajo: el resto de los datos se manda tal cual
    // vino, sin normalizar, para no tocar nada que el iPad use.
    async function cambiarAtajo(elementoId, tecla) {
        const antes = elegida.datos;
        const crudo = typeof elegida.crudo === 'string' ? JSON.parse(elegida.crudo) : (elegida.crudo || antes);
        const nuevo = conAtajo({ ...crudo, elements: crudo.elements || [] }, elementoId, tecla);
        const r = await hacer(ctx, () => api.plantillas.guardar({ id: elegida.id, nombre: elegida.nombre, datos: nuevo }), 'No se pudo guardar el atajo');
        if (!r.ok) return;
        elegida.crudo = nuevo;
        elegida.datos = datosDePlantilla(nuevo);
        pintarDetalle();
        // El foco vuelve al casillero siguiente, para cargar varios seguidos
        const campos = [...detalle.querySelectorAll('.tv-base-pt__atajo')];
        const i = botonesDePlantilla(elegida.datos).findIndex(b => String(b.id) === String(elementoId));
        const sig = campos[Math.min(campos.length - 1, i + 1)];
        if (sig) sig.focus();
    }

    async function renombrar() {
        const n = await ctx.ui.pedirTexto('Renombrar plantilla', elegida.nombre, { etiqueta: 'Nombre' });
        if (!n || !n.trim() || n.trim() === elegida.nombre) return;
        const r = await hacer(ctx, () => api.plantillas.guardar({ id: elegida.id, nombre: n.trim(), datos: elegida.crudo }), 'No se pudo renombrar');
        if (r.ok) { elegida.nombre = n.trim(); await cargar(); }
    }

    async function duplicar() {
        const n = await ctx.ui.pedirTexto('Duplicar plantilla', elegida.nombre + ' (copia)', { etiqueta: 'Nombre de la copia' });
        if (!n || !n.trim()) return;
        const id = await intentar(ctx, () => api.plantillas.guardar({ nombre: n.trim(), datos: elegida.crudo }), 'No se pudo duplicar');
        if (id === undefined) return;
        ctx.ui.aviso('Plantilla duplicada', 'ok');
        elegida = { id };
        await cargar();
    }

    async function exportar() {
        const ruta = await intentar(ctx, () => api.plantillas.exportarArchivo(elegida.id), 'No se pudo exportar');
        if (ruta) ctx.ui.aviso('Plantilla exportada. Pasala al iPad y abrila desde ahí.', 'ok',
            { accion: { texto: 'Mostrar en la carpeta', alHacer: () => api.archivos.mostrar(ruta) } });
    }

    async function borrar() {
        const si = await ctx.ui.confirmar(`¿Borrar la plantilla "${elegida.nombre}"? Los partidos que se codificaron con ella guardan su propia copia.`,
            { titulo: 'Borrar plantilla', peligro: true });
        if (!si) return;
        if ((await hacer(ctx, () => api.plantillas.borrar(elegida.id), 'No se pudo borrar la plantilla')).ok) {
            elegida = null;
            await cargar();
        }
    }

    return {
        el,
        activar: cargar,
        teclas: () => false,
        pausar() {},
        destruir() { vistas.splice(0).forEach(v => { try { v.destruir(); } catch (_) { /* nada */ } }); el.remove(); }
    };
}
