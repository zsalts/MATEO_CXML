// Set chico de íconos de trazo, 24×24, dibujados a mano para esta app (nada
// bajado de internet). Usan currentColor: toman el color del texto.
//
// crearIcono(nombre) devuelve un <svg> de verdad, pero con toString() igual
// a su HTML. Así sirven las dos formas de usarlo:
//     boton.append(crearIcono('play'))
//     boton.innerHTML = `${crearIcono('play')} Reproducir`
// Los nombres aceptan tilde o no ('cámara' = 'camara').

const TRAZOS = {
    play:      '<path d="M7 4.5v15l12-7.5z"/>',
    pausa:     '<path d="M8 5v14M16 5v14"/>',
    stop:      '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    grabar:    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    camara:    '<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    ipad:      '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    wifi:      '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r=".9" fill="currentColor"/>',
    base:      '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    importar:  '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    carpeta:   '<path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    lista:     '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="18" r=".9" fill="currentColor"/>',
    filtro:    '<path d="M3.5 5h17l-6.5 8v5.5l-4 2V13z"/>',
    tijera:    '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.3 8.2L20 18.5M8.3 15.8L20 5.5"/>',
    descargar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    subir:     '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
    mas:       '<path d="M12 5v14M5 12h14"/>',
    menos:     '<path d="M5 12h14"/>',
    basura:    '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    lapiz:     '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
    ajustes:   '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/><circle cx="12" cy="12" r="6.5"/>',
    casa:      '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>',
    botonera:  '<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="4" width="8" height="6" rx="1.5"/><rect x="3" y="14" width="5" height="6" rx="1.5"/><rect x="10" y="14" width="11" height="6" rx="1.5"/>',
    cerrar:    '<path d="M6 6l12 12M18 6L6 18"/>',
    'flecha-izq':    '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'flecha-der':    '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'flecha-arriba': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'flecha-abajo':  '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'chevron-izq':   '<path d="M15 5l-7 7 7 7"/>',
    'chevron-der':   '<path d="M9 5l7 7-7 7"/>',
    'chevron-abajo': '<path d="M5 9l7 7 7-7"/>',
    buscar:    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    nube:      '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 10z"/>',
    video:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.6-2.8z"/>',
    documento: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    check:     '<path d="M4.5 12.5l5 5L20 7"/>',
    alerta:    '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".9" fill="currentColor"/>',
    info:      '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
    menu:      '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plegar:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 10l-2 2 2 2"/>',
    desplegar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M13 10l2 2-2 2"/>',
    reloj:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    equipo:    '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.5-3.3 3-5.2 6-5.2s5.5 1.9 6 5.2"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.6c1.8.7 3.1 2.4 3.5 4.9"/>',
    enlace:    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    teclado:   '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    copia:     '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    tema:      '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>'
};

// Sinónimos: los nombres que usa el contrato y algunos que otros agentes
// probablemente escriban.
const ALIAS = {
    flechas: 'flecha-der', flecha: 'flecha-der',
    'flecha-izquierda': 'flecha-izq', 'flecha-derecha': 'flecha-der',
    atras: 'flecha-izq', volver: 'flecha-izq',
    rec: 'grabar', grabacion: 'grabar',
    borrar: 'basura', eliminar: 'basura', editar: 'lapiz',
    agregar: 'mas', nuevo: 'mas', inicio: 'casa',
    plantilla: 'botonera', plantillas: 'botonera',
    partidos: 'base', 'base-de-datos': 'base',
    exportar: 'descargar', xml: 'documento', archivo: 'documento',
    equipos: 'equipo', ok: 'check', error: 'alerta', configuracion: 'ajustes',
    captura: 'camara', clip: 'tijera', clips: 'tijera', cortar: 'tijera',
    playlist: 'lista', playlists: 'lista', pause: 'pausa'
};

const quitarTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function nombresDeIconos() {
    return Object.keys(TRAZOS);
}

// HTML del ícono como texto. Útil para armar templates largos.
export function iconoHTML(nombre, clase = '') {
    const clave = quitarTildes(nombre);
    const trazo = TRAZOS[clave] || TRAZOS[ALIAS[clave]];
    if (!trazo) console.warn('crearIcono: no hay ícono', nombre);
    return `<svg class="tv-icono${clase ? ' ' + clase : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${trazo || TRAZOS.info}</svg>`;
}

export function crearIcono(nombre, clase = '') {
    const plantilla = document.createElement('template');
    plantilla.innerHTML = iconoHTML(nombre, clase);
    const svg = plantilla.content.firstElementChild;
    svg.toString = () => svg.outerHTML;
    return svg;
}
