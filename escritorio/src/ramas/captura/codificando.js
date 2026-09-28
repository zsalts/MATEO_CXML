// b) Codificación: video grande, botonera, reloj, ● REC, registro, tira y
// visor de clips. El motor (nucleo/codificacion.js) tiene todas las reglas
// del iPad; esta pantalla solo le pasa los toques y dibuja lo que dice.
//
// Grabación: el primer PLAY (o el primer toque, que arranca el reloj como en
// el iPad) arranca la grabadora. Abrir el archivo tarda: el motor abre el
// tramo de video recién cuando llega el primer cuadro (evento 'inicio' →
// sincronizarVideo), y los toques de esos segundos se pegan al principio del
// video. Si la cámara se conecta con el partido empezado, la grabación
// arranca ahí mismo.
//
// VER UN CLIP MIENTRAS SE GRABA
// video.js juntaba en memoria los trozos que iba mandando MediaRecorder y
// armaba un Blob con los del tramo pedido. No andaba bien: el primer trozo
// de un tramo casi nunca empieza en un keyframe, y el <video> o no lo abría
// o arrancaba con segundos grises. Acá se lee el ARCHIVO que se está
// escribiendo, servido por tv.video.url con Range: la grabadora escribe MP4
// fragmentado con un keyframe por segundo, así que lo que ya está en el disco
// es un video válido y el <video> salta a cualquier segundo. Cada vez que se
// abre el visor la dirección cambia (?v=…) para que pida el tamaño de ahora.
// Si el clip termina más adelante de lo escrito (se marca y se mira al
// toque) se espera a que llegue, hasta 3 s.

import { hayModalAbierto } from '../../ui/index.js';
import { crearCodificacion } from '../../nucleo/codificacion.js';
import { crearVista } from '../../nucleo/botonera-vista.js';
import { atajos as leerAtajos, elemento } from '../../nucleo/plantilla.js';
import {
    el, icono, reloj, enlazarVistaPrevia, crearPanelCamara, crearRelojRec, crearRegistro, crearTira,
    crearVisor, crearAvisoVer, crearColaVista, crearCartel
} from './piezas.js';
import { rangoDeClip, nombreDeClip, subcarpetaDe, crearColaCortes, armarRespaldo } from './logica.js';
import { guardarRespaldo as guardarRespaldoEnDisco } from './respaldo.js';
import { crearCompartir } from './compartir.js';

const ESPERA_VER = 3000;   // ms que se espera a que el final de un clip llegue al disco

/**
 * @param o.ctx
 * @param o.config     lo que entregó la preparación
 * @param o.grabadora
 * @param o.ajustes
 * @param o.alTerminar () => void   (el botón Terminar)
 */
export function montarCodificacion(contenedor, o) {
    const { ctx, config, grabadora: g } = o;
    const api = ctx.api;
    const conCamara = config.fuente === 'camara';
    const quitar = [];
    let destruido = false;
    let ultimoRespaldo = 0;
    // Al terminar, el video se cierra y se mueve: desde ahí los cortes que
    // falten van al archivo en su lugar final (terminar.js → ponerFinal).
    let final = null;
    let clipsDisponible = true;
    api.clips.disponible().then(v => { clipsDisponible = !!v; }).catch(() => { clipsDisponible = false; });

    // ── Armado ───────────────────────────────
    const video = el('video', { class: 'tv-captura-cod__video', muted: conCamara, playsInline: true });
    const zonaVideo = el('div', { class: 'tv-captura-cod__video-marco' }, video);
    const barra = el('div', { class: 'tv-captura-cod__barra' });
    const lateral = el('div', { class: 'tv-captura-cod__lateral' });
    const zonaBotonera = el('div', { class: 'tv-captura-cod__botonera' });
    const zonaTira = el('div', { class: 'tv-captura-cod__tira' });
    const raiz = el('div', { class: 'tv-captura-cod' + (conCamara ? '' : ' es-archivo') },
        barra,
        el('div', { class: 'tv-captura-cod__medio' }, zonaVideo, lateral),
        zonaBotonera,
        zonaTira);
    contenedor.append(raiz);

    if (conCamara) {
        quitar.push(enlazarVistaPrevia(video, g));
        zonaVideo.append(el('div', { class: 'tv-captura-cod__sinsenal' }, icono('camara'), el('span', { texto: 'Sin cámara' })));
        const pintarSenal = () => zonaVideo.classList.toggle('es-sinsenal', !g.estado().conectada);
        quitar.push(g.on('estado', pintarSenal));
        pintarSenal();
    } else {
        api.video.url(config.videoRuta).then(url => { if (url && !destruido) video.src = url; }).catch(() => {});
        video.controls = true;
    }

    // ── Motor ────────────────────────────────
    const motor = crearCodificacion(config.datos, conCamara
        ? { relojVideo: () => g.vAhora() }
        // Codificar un archivo: el partido ES el video. Los dos relojes son
        // el mismo y los eventos caen justo en el segundo que se ve.
        : { relojExterno: () => video.currentTime || 0, relojVideo: () => video.currentTime || 0 });
    const datos = motor.datos();
    const mapaAtajos = leerAtajos(datos).mapa;

    // ── Barra de arriba ──────────────────────
    const relojRec = crearRelojRec(barra, { motor, grabadora: conCamara ? g : null, alAlternar: alternar, rama: 'captura' });
    const cola = crearColaCortes({
        cortar: async c => (await api.clips.exportar({
            ruta: rutaVideo(),
            cortes: [{ desde: c.desde, hasta: c.hasta, nombre: c.nombre }],
            subcarpeta: final ? final.subcarpeta : subcarpetaDe(config.nombre)
        })).rutas,
        // Grabando, un corte espera a que lo que pide esté en el disco. Con
        // la grabación parada (o un archivo) todo está: se corta ya.
        listo: c => !(conCamara && g.estado().grabando) || c.hasta <= g.vEscrito() + 0.05
    });
    const colaVista = crearColaVista(barra, cola);
    barra.append(el('span', { class: 'tv-barra__espacio' }));
    barra.append(el('span', { class: 'tv-captura-cod__nombre tv-recortar', title: `Partidos/${config.nombre}`, texto: config.nombre }));
    // Clips en vivo para otro iPad o iPhone (solo grabando: con un archivo no
    // hay nada en vivo que mandar).
    const compartir = conCamara ? crearCompartir({
        ctx, config, motor, datos, grabadora: g, subcarpeta: () => subcarpetaDe(config.nombre)
    }) : null;
    if (compartir) barra.append(compartir.boton());
    if (conCamara) {
        barra.append(el('button', { type: 'button', class: 'tv-btn', title: 'Cambiar o reconectar la cámara', onClick: abrirCamara },
            icono('camara'), el('span', { texto: 'Cámara' })));
    }
    barra.append(el('button', { type: 'button', class: 'tv-btn tv-btn--peligro', onClick: () => o.alTerminar() },
        icono('stop'), el('span', { texto: 'Terminar' })));

    // ── Registro, tira, visor ────────────────
    const registro = crearRegistro(lateral, {
        datos,
        alVer: ev => verEvento(ev),
        alCortar: ev => cortarEvento(ev),
        alBorrar: ev => borrarEvento(ev)
    });
    const tira = crearTira(zonaTira, { datos, alVer: ev => verEvento(ev) });
    const visor = crearVisor(raiz, { alGuardarClip: info => info && info.ev && cortarEvento(info.ev) });
    const avisoVer = crearAvisoVer(zonaVideo, { alVer: ev => verEvento(ev) });
    const cartel = crearCartel(zonaVideo);

    // ── Botonera ─────────────────────────────
    const vista = crearVista(zonaBotonera, datos, {
        ajustar: true,
        maxEscala: 1.6,
        alTocar(e, _ev, extra) {
            let r;
            if (e.emergente) r = motor.elegirEmergente(e.id);
            else r = motor.tocar(e.id, { equipo: extra && extra.equipo });
            avisarError(r);
        },
        alCerrarDetalle: () => motor.cerrarDetalle()
    });

    function avisarError(r) {
        if (!r || r.ok !== false || !r.error) return;
        if (r.error === 'linea-vacia') ctx.ui.aviso('Esa línea no tiene jugadores cargados.', 'aviso');
        if (r.error === 'falta-equipo') ctx.ui.aviso('Tocá la mitad del equipo que tiene la pelota.', 'info');
    }

    // ── Reloj ────────────────────────────────
    function alternar() {
        const andando = motor.estado().andando;
        if (andando) motor.pausa(); else motor.play();
    }

    if (!conCamara) {
        // El <video> manda: sus controles, el espacio y el PLAY de la barra
        // hacen lo mismo.
        video.addEventListener('play', () => { if (!motor.estado().andando) motor.play(); });
        video.addEventListener('pause', () => { if (motor.estado().andando) motor.pausa(); });
        quitar.push(motor.alCambiar(e => {
            if (e.andando && video.paused && !e.terminado) video.play().catch(() => {});
            if (!e.andando && !video.paused) video.pause();
        }));
    }

    // ── Grabación ────────────────────────────
    let arrancando = false;
    let rutaGrabacion = null;
    async function asegurarGrabacion() {
        if (!conCamara || destruido || arrancando) return;
        const s = g.estado();
        const est = motor.estado();
        if (s.grabando || s.deteniendo || !s.conectada || est.terminado || est.inicioReal == null) return;
        arrancando = true;
        try {
            const r = await g.grabar(config.nombre);
            rutaGrabacion = r.ruta;
            guardarRespaldo(true);
        } catch (err) {
            cartel.mostrar('No se pudo empezar a grabar: ' + ((err && err.message) || err) + '. La codificación sigue.',
                [{ texto: 'Reintentar', alHacer: () => { cartel.ocultar(); asegurarGrabacion(); } }]);
        } finally {
            arrancando = false;
        }
    }

    if (conCamara) {
        quitar.push(g.on('inicio', () => motor.sincronizarVideo()));
        quitar.push(g.on('estado', () => asegurarGrabacion()));
        quitar.push(g.on('desconectada', d => {
            cartel.mostrar(d.grabando
                ? 'Se desconectó la cámara. La grabación sigue en el mismo archivo (queda la imagen congelada) y la codificación no se corta. Enchufala de nuevo: se reconecta sola.'
                : 'Se desconectó la cámara. Enchufala de nuevo: se reconecta sola.',
                [{ texto: 'Reconectar', alHacer: () => reconectar() }, { texto: 'Otra entrada…', alHacer: abrirCamara }]);
        }));
        quitar.push(g.on('reconectada', () => {
            if (!g.estado().errorDisco) cartel.ocultar();
            ctx.ui.aviso('Cámara reconectada. La grabación sigue en el mismo archivo.', 'ok');
        }));
        quitar.push(g.on('error', e => {
            if (e.tipo === 'disco') {
                cartel.mostrar('El disco falló: ' + e.mensaje + '. La codificación sigue; lo grabado hasta acá quedó guardado.', []);
                cartel.raiz.classList.add('es-disco');
            } else {
                ctx.ui.aviso('Problema con la grabación: ' + e.mensaje, 'error');
            }
        }));
    }

    async function reconectar() {
        try { await g.conectar(panelPedido || {}); cartel.ocultar(); }
        catch (err) { ctx.ui.aviso('No se pudo reconectar: ' + ((err && err.message) || err), 'error'); }
    }

    let panelPedido = null;
    async function abrirCamara() {
        const caja = el('div', { class: 'tv-captura-cod__cam-modal' });
        const panel = crearPanelCamara(caja, {
            grabadora: g, calidad: config.calidad, compacto: false, api,
            alConectar: () => { panelPedido = panel.pedido(); cartel.ocultar(); },
            alError: m => ctx.ui.aviso(m, 'aviso')
        });
        panel.listar();
        await ctx.ui.modal({ titulo: 'Cámara', contenido: caja, ancho: 520, botones: [{ texto: 'Listo', valor: true, primario: true }] });
        panel.destruir();
    }

    // ── Clips ────────────────────────────────
    function rutaVideo() {
        if (final && final.ruta) return final.ruta;
        if (!conCamara) return config.videoRuta;
        const s = g.estado();
        return (s.grabando ? s.ruta : (s.ultima && s.ultima.ruta)) || rutaGrabacion;
    }

    function esperarEscrito(hasta, ms) {
        return new Promise(res => {
            const fin = Date.now() + ms;
            const mirar = () => {
                const s = g.estado();
                if (!s.grabando || g.vEscrito() >= hasta || Date.now() > fin || destruido) return res();
                setTimeout(mirar, 100);
            };
            mirar();
        });
    }

    async function verEvento(ev) {
        const est = motor.estado();
        const rango = rangoDeClip(ev, est.mapa, { margen: config.margen, vAhora: conCamara ? g.vAhora() : video.currentTime });
        const titulo = `${ev.name} · ${reloj(ev.start)}`;
        const base = { titulo, puedeGuardar: clipsDisponible, info: { ev } };
        if (!rango) return visor.abrir({ ...base, url: null, desde: 0, hasta: 0, puedeGuardar: false,
            sinVideo: 'Este evento se marcó sin cámara conectada: no tiene video.' });
        const ruta = rutaVideo();
        if (!ruta) return visor.abrir({ ...base, url: null, ...rango, puedeGuardar: false, sinVideo: 'Todavía no hay archivo de video.' });
        if (conCamara) await esperarEscrito(rango.hasta, ESPERA_VER);
        let url = null;
        try { url = await api.video.url(ruta); } catch (_) {}
        const fps = conCamara ? g.estado().fps : null;
        visor.abrir({ ...base, url, desde: rango.desde, hasta: rango.hasta, fps,
            sinVideo: 'No se encuentra el archivo de video.' });
    }

    // Codificando un partido que ya tenía eventos, la numeración sigue: sus
    // clips viejos ya pueden estar en la carpeta con 001, 002…
    let numClip = config.partido && Array.isArray(config.partido.eventos) ? config.partido.eventos.length : 0;
    function cortarEvento(ev) {
        if (!clipsDisponible) return ctx.ui.aviso('No está ffmpeg: no se pueden guardar clips.', 'error');
        const ya = cola.resumen().cortes.find(c => String(c.evId) === String(ev.id) && c.estado !== 'fallido');
        if (ya) return ctx.ui.aviso(ya.estado === 'hecho' ? 'Ese clip ya está guardado.' : 'Ese clip ya se está cortando.', 'info');
        const est = motor.estado();
        const rango = rangoDeClip(ev, est.mapa, { margen: config.margen, vAhora: conCamara ? g.vAhora() : null });
        if (!rango || !rutaVideo()) return ctx.ui.aviso(`"${ev.name}" no tiene video para cortar.`, 'aviso');
        cola.agregar({ evId: ev.id, desde: rango.desde, hasta: rango.hasta, nombre: nombreDeClip(++numClip, ev.name, ev.start) });
    }
    quitar.push(cola.alCambiar(() => pedirPintar()));

    async function borrarEvento(ev) {
        const ok = await ctx.ui.confirmar(`¿Borrar "${ev.name}" (${reloj(ev.start)}) del registro?`, { titulo: 'Borrar evento', peligro: true });
        if (ok) motor.borrarEvento(ev.id);
    }

    // ── Pintar ───────────────────────────────
    const vistos = new Set();
    let primeraVez = true;
    function alCambiarMotor(est) {
        // Eventos nuevos: "▶ Ver" y, si se pidió, el corte automático.
        const nuevos = [];
        est.eventos.forEach(ev => {
            if (ev.posesionDe || vistos.has(ev.id)) return;
            vistos.add(ev.id);
            if (!primeraVez) nuevos.push(ev);
        });
        primeraVez = false;
        if (nuevos.length) {
            const conVideo = conCamara ? g.estado().grabando || g.estado().ultima : true;
            if (conVideo) avisoVer.mostrar(nuevos[0]);
            if (config.cortarAuto) nuevos.slice().reverse().forEach(ev => cortarEvento(ev));
        }
        if (est.andando || est.inicioReal != null) asegurarGrabacion();
        if (compartir) compartir.alCambiar();
        pedirPintar(est);
        guardarRespaldo(false);
    }
    quitar.push(motor.alCambiar(alCambiarMotor));

    let pedido = null, ultimoEstado = null;
    function pedirPintar(est) {
        if (est) ultimoEstado = est;
        if (pedido) return;
        pedido = requestAnimationFrame(() => {
            pedido = null;
            if (destruido) return;
            const e = ultimoEstado || motor.estado();
            ultimoEstado = null;
            vista.pintar(e);
            registro.pintar(e, cola.resumen().cortes);
            tira.pintar(e);
        });
    }
    // Los relojes de los turnos, la posesión y la tira corren solos.
    const tic = setInterval(() => pedirPintar(motor.estado()), 500);
    alCambiarMotor(motor.estado());

    // ── Teclado ──────────────────────────────
    function alTecla(e) {
        if (destruido || e.ctrlKey || e.metaKey || e.altKey) return;
        if (hayModalAbierto()) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (visor.teclas(e)) { e.preventDefault(); return; }
        if (e.repeat) { if (e.key === ' ') e.preventDefault(); return; }
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === ' ') { e.preventDefault(); alternar(); return; }
        if (k === 'Escape') { if (motor.estado().detalle) { e.preventDefault(); motor.cerrarDetalle(); } return; }
        if (mapaAtajos.has(k)) {
            e.preventDefault();
            const id = mapaAtajos.get(k);
            const x = elemento(datos, id);
            // La posesión necesita saber qué equipo: con el teclado no se sabe.
            if (x && x.type === 'possession') return ctx.ui.aviso('La posesión se toca con el mouse (una mitad por equipo).', 'info');
            const n = vista.nodo(id);
            if (n) { n.classList.add('tv-bv--apretado'); setTimeout(() => n.classList.remove('tv-bv--apretado'), 120); }
            avisarError(motor.tocar(id));
            return;
        }
        if (k === 'r') {
            const ult = avisoVer.ultimo() || motor.estado().eventos.find(ev => !ev.posesionDe);
            if (ult) { e.preventDefault(); verEvento(ult); }
        }
    }
    window.addEventListener('keydown', alTecla);
    quitar.push(() => window.removeEventListener('keydown', alTecla));

    // ── Respaldo ─────────────────────────────
    function guardarRespaldo(ya) {
        const ahora = Date.now();
        if (!ya && ahora - ultimoRespaldo < 2000) return;
        ultimoRespaldo = ahora;
        const est = motor.estado();
        if (est.terminado || (est.inicioReal == null && !est.eventos.length)) return;
        const meta = {
            fuente: config.fuente, nombre: config.nombre, local: config.local, visitante: config.visitante,
            plantillaId: config.plantillaId, nombrePlantilla: config.nombrePlantilla,
            videoRuta: config.videoRuta, partidoId: config.partidoId, margen: config.margen
        };
        // Con la plantilla adentro: si la borran de la base antes de
        // recuperar, igual se sabe con qué botones se codificó.
        guardarRespaldoEnDisco(armarRespaldo({ meta: { ...meta, datos }, motor: motor.exportarEstado(), ruta: rutaVideo() }));
    }
    const ticRespaldo = setInterval(() => guardarRespaldo(true), 5000);

    return {
        raiz,
        motor,
        cola,
        rutaVideo,
        ponerFinal(f) { final = f; },
        conCamara,
        compartir,   // lo apaga la rama (index.js): sigue prendido después de Terminar
        video,
        // true mientras hay algo que perder si se sale.
        enCurso() {
            const est = motor.estado();
            return !est.terminado && (est.inicioReal != null || est.eventos.length > 0 || g.estado().grabando);
        },
        guardarRespaldo: () => guardarRespaldo(true),
        destruir() {
            destruido = true;
            clearInterval(tic);
            clearInterval(ticRespaldo);
            if (pedido) cancelAnimationFrame(pedido);
            quitar.forEach(f => { try { f(); } catch (_) {} });
            [relojRec, colaVista, registro, tira, visor, avisoVer, cartel, vista].forEach(x => { try { x.destruir(); } catch (_) {} });
            if (!conCamara) { video.pause(); video.removeAttribute('src'); video.load(); }
            raiz.remove();
        }
    };
}
