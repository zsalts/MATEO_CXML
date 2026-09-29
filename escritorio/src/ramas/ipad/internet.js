// "Desde otra red": la parte de abajo de la ventana "Enlazar para ver cortes
// en vivo", en las dos capturas (Captura desde iPad y Captura en vivo).
//
// Un botón prende el túnel (main/tunel.js vía tv.remoto.internet) y muestra
// el link https con su QR, para mandarlo por WhatsApp: se abre desde
// cualquier red, con el mismo PIN, y solo mira. La imagen en vivo va en
// calidad reducida (src/nucleo/espejo-bajo.js).
//
// El estado vive en main: cerrar la ventana no corta nada; lo corta "Dejar
// de compartir", salir de la captura o cerrar la app.

// h(tag, props, ...hijos): el armador de cada rama (mismas props: class,
// texto, html, onClick…).
export function seccionInternet({ api, ui, h }) {
    const caja = h('div', { class: 'tv-internet' });
    let quitar = null;

    function pintar(estado) {
        caja.textContent = '';
        caja.append(h('h3', { class: 'tv-internet__titulo', texto: 'Desde otra red (por internet)' }));
        if (estado.fase === 'apagado') {
            caja.append(
                h('p', { class: 'tv-internet__texto', texto: 'Para mirar desde otra wifi o con datos del celular. Genera un link para mandar por WhatsApp; la imagen en vivo va en calidad reducida.' }),
                h('button', { class: 'tv-btn', texto: 'Compartir por internet', onClick: prender }));
        } else if (estado.fase === 'trabajando') {
            caja.append(h('p', { class: 'tv-internet__texto', texto: estado.texto }));
        } else if (estado.fase === 'listo') {
            const copiar = h('button', { class: 'tv-btn tv-btn--primario', texto: 'Copiar link', onClick: async () => {
                try { await navigator.clipboard.writeText(estado.link); copiar.textContent = 'Copiado ✓'; }
                catch (_) { ui.aviso('No se pudo copiar. Seleccioná el link y copialo a mano.', 'error'); }
            } });
            caja.append(
                h('p', { class: 'tv-internet__texto', texto: 'Mandá este link. Se abre desde cualquier red, pide el mismo PIN y solo deja mirar.' }),
                estado.qr ? h('div', { class: 'tv-internet__qr', html: estado.qr }) : null,
                h('div', { class: 'tv-internet__link', texto: estado.link }),
                h('div', { class: 'tv-internet__botones' },
                    copiar,
                    h('button', { class: 'tv-btn tv-btn--peligro', texto: 'Dejar de compartir', onClick: apagar })));
        }
    }

    async function prender() {
        pintar({ fase: 'trabajando', texto: 'Conectando con internet…' });
        if (!quitar && api.remoto.onInternet) {
            quitar = api.remoto.onInternet(p => {
                if (!p || !caja.isConnected) return;
                if (p.fase === 'bajando') pintar({ fase: 'trabajando', texto: `Bajando lo necesario (solo la primera vez)… ${p.porcentaje || 0}%` });
                else if (p.fase === 'conectando') pintar({ fase: 'trabajando', texto: 'Abriendo la conexión…' });
                else if (p.fase === 'caido') { pintar({ fase: 'apagado' }); ui.aviso('Se cortó la conexión por internet. Tocá “Compartir por internet” de nuevo.', 'error'); }
            });
        }
        try {
            const r = await api.remoto.internet({ prender: true });
            pintar({ fase: 'listo', link: r.link, qr: r.qr });
        } catch (err) {
            pintar({ fase: 'apagado' });
            ui.aviso('No se pudo compartir por internet: ' + ((err && err.message) || err), 'error');
        }
    }

    async function apagar() {
        try { await api.remoto.internet({ prender: false }); } catch (_) {}
        pintar({ fase: 'apagado' });
    }

    // Si ya se estaba compartiendo, se muestra el link de una.
    pintar({ fase: 'apagado' });
    api.remoto.estado().then(e => { if (e && e.internet) prender(); }).catch(() => {});

    return {
        el: caja,
        // Al cerrar la ventana: se deja de escuchar (el túnel sigue).
        soltar() { if (quitar) { try { quitar(); } catch (_) {} quitar = null; } }
    };
}
