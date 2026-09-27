// Panel "no hay permiso" para la Captura en vivo y la Captura desde iPad
// (Agente 7). En Mac, con la cámara negada, getUserMedia deja una vista
// previa negra sin decir nada: esto lo explica y lleva a Ajustes del Sistema.
//
// Uso, donde la pantalla llama a grabadora.conectar():
//     try { await grab.conectar(p); }
//     catch (err) {
//         if (err.permiso) return panelPermiso(hueco, { api: ctx.api, tipo: err.permiso, estado: err.estado, alReintentar: () => conectar() });
//         throw err;
//     }
// Después de conceder el permiso, volver a pedir la lista de entradas
// (grabadora.listarEntradas): los nombres de las cámaras recién aparecen ahí.
//
// Para el firewall del iPad: si tv.remoto.estado() trae ayudaRed, mostrar
// panelAyudaRed(hueco, { api, ayuda: estado.ayudaRed }).

import { escapar } from './util.js';
import { iconoHTML } from './iconos.js';
import { esMac } from './plataforma.js';

const NOMBRE = { camara: 'la cámara', microfono: 'el micrófono' };
const PAGINA_MAC = { camara: 'Cámara', microfono: 'Micrófono' };

function pasosMac(tipo) {
    return `Abrí <b>Ajustes del Sistema → Privacidad y seguridad → ${PAGINA_MAC[tipo] || 'Cámara'}</b>,
        activá <b>Tag &amp; View Pro</b> y tocá <b>Reintentar</b>. Si macOS pide reabrir la app, reabrila:
        la grabación no se pierde porque todavía no empezó.`;
}

function pasosWin(tipo) {
    return `Abrí <b>Configuración → Privacidad y seguridad → ${tipo === 'microfono' ? 'Micrófono' : 'Cámara'}</b>,
        activá el acceso para las aplicaciones de escritorio y tocá <b>Reintentar</b>.`;
}

// Devuelve quitar().
export function panelPermiso(contenedor, { api, tipo = 'camara', estado = 'denegado', alReintentar } = {}) {
    const div = document.createElement('div');
    div.className = 'tv-app-aviso-rama tv-permiso';
    const restringido = estado === 'restringido';
    div.innerHTML = `
        ${iconoHTML('alerta')}
        <h2>Sin permiso para usar ${escapar(NOMBRE[tipo] || 'la cámara')}</h2>
        <p>${restringido
            ? 'Esta Mac tiene la cámara bloqueada por un perfil de la empresa o el control parental. Hay que pedírselo a quien administra la Mac.'
            : (esMac ? pasosMac(tipo) : pasosWin(tipo))}</p>
        <div class="tv-permiso__botones" style="display:flex;gap:8px;justify-content:center">
            ${restringido ? '' : `<button type="button" class="tv-btn" data-abrir>${iconoHTML('ajustes')} ${esMac ? 'Abrir Ajustes del Sistema' : 'Abrir Configuración'}</button>`}
            <button type="button" class="tv-btn" data-reintentar>Reintentar</button>
        </div>`;
    div.querySelector('[data-abrir]')?.addEventListener('click', () => {
        api?.sys?.abrirAjustesSistema?.(tipo)?.catch?.(() => {});
    });
    div.querySelector('[data-reintentar]').addEventListener('click', () => {
        div.remove();
        if (typeof alReintentar === 'function') alReintentar();
    });
    contenedor.innerHTML = '';
    contenedor.appendChild(div);
    return () => div.remove();
}

// El iPad no llega en un minuto: firewall (y en Mac, Red local). `ayuda` es
// lo que trae tv.remoto.estado().ayudaRed. Devuelve quitar().
export function panelAyudaRed(contenedor, { api, ayuda } = {}) {
    if (!ayuda) return () => {};
    const div = document.createElement('div');
    div.className = 'tv-permiso tv-permiso--red';
    div.setAttribute('role', 'status');
    const boton = (pagina, texto) => `<button type="button" class="tv-btn tv-btn--chico" data-pagina="${escapar(pagina)}">${escapar(texto)}</button>`;
    div.innerHTML = `<p>${escapar(ayuda.texto)}</p>
        <div style="display:flex;gap:8px">
            ${esMac ? boton(ayuda.pagina, 'Abrir Firewall') : ''}
            ${esMac && ayuda.paginaExtra ? boton(ayuda.paginaExtra, 'Abrir Red local') : ''}
        </div>`;
    div.addEventListener('click', e => {
        const b = e.target.closest('[data-pagina]');
        if (b) api?.sys?.abrirAjustesSistema?.(b.dataset.pagina)?.catch?.(() => {});
    });
    contenedor.appendChild(div);
    return () => div.remove();
}
