// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
    mode: 'setup',
    page: 'botonera',          // 'botonera' | 'plantillas' | 'xml'
    elements: [],
    links: [],
    selectedId: null,
    selectedIds: [],          // Multi-selección

    isDragging: false,
    isResizing: false,
    dragStart: { x: 0, y: 0 },
    elStart:   { x: 0, y: 0, w: 0, h: 0 },
    elStarts:  [],            // Posiciones iniciales de todos los seleccionados al arrastrar
    resizeDir: null,

    // Marquee (rectángulo de selección arrastrado en área vacía)
    isMarquee: false,
    marqueeStart: { x: 0, y: 0 },
    marqueeEnd:   { x: 0, y: 0 },

    isLinking:    false,
    linkStartId:  null,
    mousePosCanvas: { x: 0, y: 0 },

    time: 0,
    isPlaying: false,
    sessionStartedAt: null,    // momento real del primer PLAY, para SESSION_INFO
    lastTick: 0,
    timerInterval: null,

    events: [],
    counters: {},
    toi: {},                   // Tiempo en hielo acumulado por buttonId (segundos)
    liveTab: 'log',            // 'log' | 'toi'
    pendingEvent: null,
    activePopupElementIds: [], // IDs de elementos popup_label visibles en pantalla
    tempPopupButtons: [],      // Botones popup generados dinámicamente en canvas
    openEvents: [],            // Eventos en modo manual/excluyente actualmente abiertos (grabando)

    hojas: [],                 // Pestañas de la botonera: [{ id, name }]. La Principal no figura
    hojaActiva: null,          // Pestaña que se está editando (null = Principal)
    detalle: null,             // Pestaña de detalle abierta en vivo
    posesion: {}               // Tramo de posesión en curso por botón: { [id]: { equipo, desde } }
};

const DEFAULT_W = 120;
const DEFAULT_H = 52;

// Se muestra al lado del logo para saber de un vistazo qué versión quedó
// servida. Tiene que coincidir con CACHE_VERSION de sw.js: build-ipad.py
// corta si se desfasan.
const APP_VERSION = 'v33';

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const D = id => document.getElementById(id);
const el = {
    canvas:          D('canvas'),
    canvasContainer: D('canvasContainer'),
    svgArrows:       D('svgArrows'),

    btnMenu:       D('btnMenu'),
    mainMenu:      D('mainMenu'),
    menuPageName:  D('menuPageName'),
    pageBotonera:  D('pageBotonera'),
    pagePlantillas:D('pagePlantillas'),
    pageXml:       D('pageXml'),
    titleLogo:     D('titleLogo'),
    appVersion:    D('appVersion'),
    timerDisplay:  D('timerDisplay'),
    btnExport:     D('btnExport'),

    inspectorPanel:        D('inspectorPanel'),
    inspectorContent:      D('inspectorContent'),
    btnHideInspector:      D('btnHideInspector'),
    propName:              D('propName'),
    propType:              D('propType'),
    propColor:             D('propColor'),
    propTimeMode:          D('propTimeMode'),
    templatesList:         D('templatesList'),
    btnSaveCurrentTemplate:D('btnSaveCurrentTemplate'),
    btnNewTemplate:        D('btnNewTemplate'),

    sessionsList:          D('sessionsList'),
    btnSaveCurrentSession: D('btnSaveCurrentSession'),
    btnExportTemplateFile: D('btnExportTemplateFile'),
    btnImportTemplateFile: D('btnImportTemplateFile'),
    btnImportSessionFile:  D('btnImportSessionFile'),
    btnBackupAll:          D('btnBackupAll'),
    btnRestoreAll:         D('btnRestoreAll'),

    btnOpenExclusiveModal: D('btnOpenExclusiveModal'),
    btnCloseExclusiveModal:D('btnCloseExclusiveModal'),
    exclusiveModal:        D('exclusiveModal'),
    exclusiveModalTitle:   D('exclusiveModalTitle'),
    exclusiveEventsList:   D('exclusiveEventsList'),
    exclusiveBadge:        D('exclusiveBadge'),

    propLineSection:       D('propLineSection'),
    propLineExclusive:     D('propLineExclusive'),
    btnOpenLineModal:      D('btnOpenLineModal'),
    btnCloseLineModal:     D('btnCloseLineModal'),
    lineModal:             D('lineModal'),
    lineModalTitle:        D('lineModalTitle'),
    lineMembersList:       D('lineMembersList'),
    lineBadge:             D('lineBadge'),

    tabLog:                D('tabLog'),
    tabToi:                D('tabToi'),
    logView:               D('logView'),
    toiView:               D('toiView'),
    toiList:               D('toiList'),
    btnExportToi:          D('btnExportToi'),

    fixedTimesSubSection:  D('fixedTimesSubSection'),
    propLead:              D('propLead'),
    propLag:               D('propLag'),
    propDescriptors:       D('propDescriptors'),
    propPopupDescriptors:  D('propPopupDescriptors'),
    propTimesSection:      D('propTimesSection'),
    propPopupSection:      D('propPopupSection'),
    btnStartLink:          D('btnStartLink'),
    btnDeleteElement:      D('btnDeleteElement'),

    livePanel:      D('livePanel'),
    eventList:      D('eventList'),
    btnClearEvents: D('btnClearEvents'),

    setupBar:       D('setupBar'),
    liveBar:        D('liveBar'),
    btnInsertMenu:  D('btnInsertMenu'),
    insertMenu:     D('insertMenu'),
    btnStartCoding: D('btnStartCoding'),
    btnStartCodingMenu: D('btnStartCodingMenu'),
    btnDuplicateElement: D('btnDuplicateElement'),
    btnAjustar:          D('btnAjustar'),
    propSubPlantilla:    D('propSubPlantilla'),
    propDetalleSection:  D('propDetalleSection'),
    hojasBar:            D('hojasBar'),
    btnInsertHoja:       D('btnInsertHoja'),
    tabPos:              D('tabPos'),
    posView:             D('posView'),
    posList:             D('posList'),
    propPosesionSection: D('propPosesionSection'),
    propEquipoA:         D('propEquipoA'),
    propEquipoB:         D('propEquipoB'),
    propEquipoEvento:    D('propEquipoEvento'),
    propEquipoEventoSection: D('propEquipoEventoSection'),
    btnPlayPause:   D('btnPlayPause'),
    timerLive:      D('timerLive'),
    btnStopCoding:  D('btnStopCoding'),

    nubeBar:        D('nubeBar'),
    nubeEstado:     D('nubeEstado'),
    btnNube:        D('btnNube'),

    nubeBarPlantillas:    D('nubeBarPlantillas'),
    nubeEstadoPlantillas: D('nubeEstadoPlantillas'),
    btnSubirNube:         D('btnSubirNube'),
    btnRestoreNube:       D('btnRestoreNube')
};

// ─────────────────────────────────────────────
// CUSTOM MODAL DIALOGS (iOS Style)
// ─────────────────────────────────────────────
function customAlert(message, title = 'Notificación') {
    return new Promise(resolve => {
        const dialog = D('customDialogModal');
        const titleEl = D('customDialogTitle');
        const msgEl = D('customDialogMessage');
        const inputContainer = D('customDialogInputContainer');
        const cancelBtn = D('customDialogCancelBtn');
        const confirmBtn = D('customDialogConfirmBtn');

        if (!dialog) { alert(message); return resolve(); }

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputContainer.classList.add('hidden');
        cancelBtn.classList.add('hidden');

        confirmBtn.textContent = 'Entendido';
        confirmBtn.className = 'w-full py-2.5 rounded-xl bg-[#007aff] text-white font-semibold text-xs hover:bg-blue-600 active:scale-95 transition shadow-sm';

        dialog.classList.remove('hidden');
        dialog.classList.add('flex');

        const cleanup = () => {
            dialog.classList.add('hidden');
            dialog.classList.remove('flex');
            confirmBtn.onclick = null;
        };

        confirmBtn.onclick = () => {
            cleanup();
            resolve();
        };
    });
}

// textoConfirmar: el rótulo del botón. Por defecto un cartel destructivo decía
// "Eliminar" siempre, también al restaurar una copia: la gente leía "Eliminar",
// tocaba Cancelar, y las plantillas de la PC nunca llegaban al iPad.
function customConfirm(message, title = 'Confirmar', isDestructive = false, textoConfirmar = '') {
    return new Promise(resolve => {
        const dialog = D('customDialogModal');
        const titleEl = D('customDialogTitle');
        const msgEl = D('customDialogMessage');
        const inputContainer = D('customDialogInputContainer');
        const cancelBtn = D('customDialogCancelBtn');
        const confirmBtn = D('customDialogConfirmBtn');

        if (!dialog) { return resolve(confirm(message)); }

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputContainer.classList.add('hidden');
        cancelBtn.classList.remove('hidden');

        cancelBtn.textContent = 'Cancelar';
        confirmBtn.textContent = textoConfirmar || (isDestructive ? 'Eliminar' : 'Aceptar');
        confirmBtn.className = isDestructive 
            ? 'flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-xs hover:bg-red-600 active:scale-95 transition shadow-sm'
            : 'flex-1 py-2.5 rounded-xl bg-[#007aff] text-white font-semibold text-xs hover:bg-blue-600 active:scale-95 transition shadow-sm';

        dialog.classList.remove('hidden');
        dialog.classList.add('flex');

        const cleanup = () => {
            dialog.classList.add('hidden');
            dialog.classList.remove('flex');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        confirmBtn.onclick = () => {
            cleanup();
            resolve(true);
        };
    });
}

function customPrompt(message, defaultValue = '', title = 'Ingresar dato') {
    return new Promise(resolve => {
        const dialog = D('customDialogModal');
        const titleEl = D('customDialogTitle');
        const msgEl = D('customDialogMessage');
        const inputContainer = D('customDialogInputContainer');
        const inputEl = D('customDialogInput');
        const cancelBtn = D('customDialogCancelBtn');
        const confirmBtn = D('customDialogConfirmBtn');

        if (!dialog) { return resolve(prompt(message, defaultValue)); }

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputContainer.classList.remove('hidden');
        inputEl.value = defaultValue;
        cancelBtn.classList.remove('hidden');

        cancelBtn.textContent = 'Cancelar';
        confirmBtn.textContent = 'Guardar';
        confirmBtn.className = 'flex-1 py-2.5 rounded-xl bg-[#007aff] text-white font-semibold text-xs hover:bg-blue-600 active:scale-95 transition shadow-sm';

        dialog.classList.remove('hidden');
        dialog.classList.add('flex');
        setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

        const cleanup = () => {
            dialog.classList.add('hidden');
            dialog.classList.remove('flex');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            inputEl.onkeydown = null;
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };

        const submit = () => {
            const val = inputEl.value;
            cleanup();
            resolve(val);
        };

        confirmBtn.onclick = submit;
        inputEl.onkeydown = e => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { cleanup(); resolve(null); }
        };
    });
}

// ─────────────────────────────────────────────
// ALMACENAMIENTO
// localStorage puede no estar disponible (abierto como file://, navegación
// privada, o iOS con el almacenamiento bloqueado). Si falla seguimos en
// memoria: los datos se conservan exportándolos a Archivos.
// ─────────────────────────────────────────────
const _memStore = {};
let _storageOk = null;

function storageAvailable() {
    if (_storageOk !== null) return _storageOk;
    try {
        localStorage.setItem('__tv_test__', '1');
        localStorage.removeItem('__tv_test__');
        _storageOk = true;
    } catch (err) {
        _storageOk = false;
    }
    return _storageOk;
}

function lsGet(key) {
    if (storageAvailable()) {
        try { return localStorage.getItem(key); } catch (err) { /* seguimos en memoria */ }
    }
    return Object.prototype.hasOwnProperty.call(_memStore, key) ? _memStore[key] : null;
}

function lsSet(key, value) {
    if (storageAvailable()) {
        try { localStorage.setItem(key, value); return; } catch (err) { /* cuota llena o bloqueado */ }
    }
    _memStore[key] = value;
}

// ─────────────────────────────────────────────
// ARCHIVOS DEL iPad
// Safari en iPadOS no expone la File System Access API: no se puede leer ni
// escribir una carpeta directamente. Lo que sí funciona es la hoja de
// Compartir ("Guardar en Archivos") y el selector de archivos.
// ─────────────────────────────────────────────
function safeFileName(name, ext) {
    const base = String(name || 'TagView').trim().replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 60) || 'TagView';
    return base + ext;
}

const ES_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

// iOS decide si deja compartir un archivo mirando su tipo MIME, y rechaza
// varios de los que exportamos: con application/json o text/xml, canShare
// devuelve false y la hoja de Compartir no abre nunca. El contenido no cambia
// por el tipo que declaremos, así que probamos con tipos más genéricos hasta
// dar con uno que acepte. El nombre del archivo conserva su extensión.
const TIPOS_GENERICOS = ['text/plain', 'application/octet-stream'];

function archivoCompartible(blob, filename) {
    if (!navigator.canShare) return null;
    const tipos = [blob.type || '', ...TIPOS_GENERICOS];
    for (const tipo of tipos) {
        const candidato = new File([blob], filename, { type: tipo });
        // Algunos Safari tiran en vez de devolver false: da igual, es un "no".
        try {
            if (navigator.canShare({ files: [candidato] })) return candidato;
        } catch (err) { /* siguiente tipo */ }
    }
    return null;
}

async function saveBlobToFiles(filename, blob) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

    // En iPad esto abre la hoja de Compartir, con "Guardar en Archivos".
    // navigator.share solo existe en contexto seguro (https): desde http:// o
    // desde el archivo único en file:// no está, y hay que ir al plan B.
    const compartible = archivoCompartible(blob, filename);
    if ((navigator.maxTouchPoints || 0) > 0 && compartible) {
        try {
            await navigator.share({ files: [compartible], title: filename });
            return true;
        } catch (err) {
            if (err && err.name === 'AbortError') return false;   // lo canceló el usuario
            // cualquier otro fallo: caemos al plan B de abajo
        }
    }

    // Fuera de iOS, el click sintético descarga sin preguntar nada.
    if (!ES_IOS) return descargaDirecta(file, filename);

    // En iPad un a.click() hecho por código no muestra nada: ni descarga ni
    // error. Safari pide un toque de verdad sobre un enlace de verdad, y en la
    // app instalada en pantalla de inicio ni siquiera eso alcanza siempre.
    // Por eso mostramos el enlace y que lo toque la persona.
    return dialogoGuardarArchivo(file, filename, compartible);
}

// Safari elige entre descargar y mostrar según el tipo MIME, y el atributo
// download no le gana a esa decisión: todo lo que sabe renderizar — text/xml,
// application/json, text/plain — lo abre en la pestaña, y lo que se ve es un
// blob: con el archivo adentro en vez de una descarga. Con un tipo que no sabe
// mostrar no le queda otra que bajarlo. El nombre lo sigue poniendo download,
// así que el archivo llega a Archivos con su extensión de siempre.
function urlDescargable(blob) {
    const opaco = blob.type === 'application/octet-stream'
        ? blob
        : new Blob([blob], { type: 'application/octet-stream' });
    return URL.createObjectURL(opaco);
}

function descargaDirecta(file, filename) {
    const url = urlDescargable(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);          // Safari ignora los enlaces sueltos
    a.click();
    // Safari pregunta antes de bajar el archivo: si revocamos la URL enseguida,
    // para cuando la persona toca "Descargar" ya no hay nada que descargar.
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 120000);
    return true;
}

// Plan B del iPad: una tarjeta con el enlace, para que el archivo salga de un
// toque real. Va con estilos en línea a propósito — tailwind.css solo trae las
// clases que el resto de la app ya usa.
function dialogoGuardarArchivo(file, filename, compartible) {
    return new Promise(resolve => {
        const url = urlDescargable(file);
        const kb = Math.max(1, Math.round(file.size / 1024));

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);' +
            'display:flex;align-items:center;justify-content:center;padding:24px;' +
            '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);';

        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:18px;padding:22px;width:100%;max-width:360px;' +
            'box-shadow:0 12px 44px rgba(0,0,0,.35);text-align:center;' +
            'font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;';

        const titulo = document.createElement('div');
        titulo.textContent = 'Guardar archivo';
        titulo.style.cssText = 'font-size:15px;font-weight:700;color:#111;margin-bottom:4px;';

        const detalle = document.createElement('div');
        detalle.textContent = filename + ' · ' + kb + ' KB';
        detalle.style.cssText = 'font-size:11px;color:#8a8a8e;margin-bottom:14px;word-break:break-all;';

        const ayuda = document.createElement('div');
        ayuda.textContent = 'Safari va a preguntar antes de bajarlo. Queda en Archivos → Descargas.';
        ayuda.style.cssText = 'font-size:12px;color:#555;line-height:1.45;margin-bottom:16px;';

        const botones = document.createElement('div');
        botones.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

        const estiloBoton = 'display:block;width:100%;padding:11px 12px;border-radius:12px;' +
            'font-size:13px;font-weight:600;text-decoration:none;border:0;cursor:pointer;' +
            '-webkit-appearance:none;appearance:none;box-sizing:border-box;';
        const PRIMARIO   = 'background:#007aff;color:#fff;';
        const SECUNDARIO = 'background:#f2f2f7;color:#111;';

        // Con la URL opaca de urlDescargable, Safari ya no puede mostrar el
        // archivo y lo descarga. Va primero: es el camino más corto.
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = filename;
        enlace.rel = 'noopener';
        enlace.textContent = 'Descargar';
        enlace.style.cssText = estiloBoton + PRIMARIO;
        botones.appendChild(enlace);

        // Alternativa: la hoja de Compartir, que además deja elegir la carpeta.
        // Disparada desde el toque, conserva el gesto que iOS exige.
        if (compartible) {
            const btnCompartir = document.createElement('button');
            btnCompartir.type = 'button';
            btnCompartir.textContent = 'Guardar en Archivos…';
            btnCompartir.style.cssText = estiloBoton + SECUNDARIO;
            btnCompartir.onclick = () => {
                navigator.share({ files: [compartible], title: filename })
                    .then(cerrar)
                    .catch(err => {
                        if (err && err.name === 'AbortError') return;   // lo cancelaron
                        // Antes esto se perdía en un catch vacío y el botón
                        // parecía no hacer nada.
                        ayuda.textContent = 'No se pudo compartir: ' +
                            ((err && err.message) || err) + '. Usá Descargar.';
                        ayuda.style.color = '#b91c1c';
                    });
            };
            botones.appendChild(btnCompartir);
        }

        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.textContent = 'Listo';
        btnCerrar.style.cssText = estiloBoton + 'background:transparent;color:#8a8a8e;';
        btnCerrar.onclick = () => cerrar();
        botones.appendChild(btnCerrar);

        card.appendChild(titulo);
        card.appendChild(detalle);
        card.appendChild(ayuda);
        card.appendChild(botones);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        let cerrado = false;
        function cerrar() {
            if (cerrado) return;
            cerrado = true;
            overlay.remove();
            // Margen largo: Safari sigue leyendo la URL mientras muestra su
            // propio cartel de descarga.
            setTimeout(() => URL.revokeObjectURL(url), 120000);
            resolve(true);
        }
    });
}

function saveToFiles(filename, text, mime) {
    return saveBlobToFiles(filename, new Blob([text], { type: mime || 'application/json' }));
}

// ─────────────────────────────────────────────
// NUBE (Supabase Storage)
// El XML se sigue guardando en el iPad: esto es una copia que sube cuando hay
// red, para bajarla después desde la compu con descargas.html. En una cancha
// sin wifi el archivo queda en la cola y sube solo cuando vuelve la señal, así
// que la codificación nunca depende de la conexión.
// Se habla por HTTP pelado a propósito: el proyecto no usa npm ni CDN, y el
// SDK de Supabase no le agrega nada a estas cuatro llamadas.
// ─────────────────────────────────────────────
const NUBE = window.NUBE || { url: '', anonKey: '', bucket: 'codificaciones' };

const nubeActiva = () => !!(NUBE.url && NUBE.anonKey);

function nubeSesion() {
    const raw = lsGet('tv_nube_sesion');
    try { return raw ? JSON.parse(raw) : null; } catch (err) { return null; }
}
function guardarNubeSesion(s) { lsSet('tv_nube_sesion', s ? JSON.stringify(s) : ''); }

function guardarTokens(data) {
    guardarNubeSesion({
        access:  data.access_token,
        refresh: data.refresh_token,
        // Un minuto de margen: no queremos descubrir que venció a mitad de una subida.
        vence:   Date.now() + ((data.expires_in || 3600) - 60) * 1000,
        email:   (data.user && data.user.email) || ''
    });
}

async function nubeFetch(ruta, opciones) {
    let r;
    try {
        r = await fetch(NUBE.url + ruta, opciones);
    } catch (err) {
        // Quedarse sin red no es lo mismo que que el servidor nos rechace, y no
        // se trata igual: esto se reintenta, no invalida la sesión. Va marcado
        // para que quien lo reciba sepa distinguirlo.
        const sinRed = new Error('Sin conexión');
        sinRed.red = true;
        throw sinRed;
    }
    if (r.ok) return r;
    // Supabase contesta el error en JSON, pero no siempre: si no, va el texto.
    let detalle = '';
    try {
        const cuerpo = await r.json();
        detalle = cuerpo.error_description || cuerpo.msg || cuerpo.message || cuerpo.error || '';
    } catch (err) { detalle = (await r.text().catch(() => '')).slice(0, 120); }
    throw new Error(detalle || ('HTTP ' + r.status));
}

async function nubeEntrar(email, password) {
    const r = await nubeFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: NUBE.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
    });
    guardarTokens(await r.json());
}

function nubeSalir() { guardarNubeSesion(null); renderEstadoNube(); }

// Devuelve un access_token válido, renovándolo si hizo falta.
async function nubeToken() {
    const s = nubeSesion();
    if (!s || !s.refresh) throw new Error('Todavía no entraste a la nube');
    if (Date.now() < s.vence) return s.access;

    try {
        const r = await nubeFetch('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { apikey: NUBE.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: s.refresh })
        });
        const data = await r.json();
        guardarTokens(data);
        return data.access_token;
    } catch (err) {
        // Sin red la sesión sigue siendo buena: se reintenta cuando vuelva.
        // Borrarla acá era lo que obligaba a entrar de nuevo después de cada
        // partido sin wifi.
        if (err && err.red) throw err;
        // Esto sí es el servidor rechazando el refresh, y no se arregla
        // reintentando: hay que volver a entrar.
        guardarNubeSesion(null);
        throw new Error('La sesión de la nube venció, entrá de nuevo');
    }
}

// El XML va en UTF-16 porque así lo quiere Sportscode; los respaldos son JSON
// común. Lo demás de la subida es idéntico.
function cuerpoDeItem(item) {
    const texto = item.texto !== undefined ? item.texto : item.xml;   // cola vieja
    return item.formato === 'json'
        ? { blob: new Blob([texto], { type: 'application/json' }), tipo: 'application/json' }
        : { blob: blobUtf16(texto), tipo: 'text/xml' };
}

async function nubeSubir(item) {
    const token = await nubeToken();
    const cuerpo = cuerpoDeItem(item);
    await nubeFetch('/storage/v1/object/' + NUBE.bucket + '/' + encodeURIComponent(item.nombre), {
        method: 'POST',
        headers: {
            apikey: NUBE.anonKey,
            Authorization: 'Bearer ' + token,
            'Content-Type': cuerpo.tipo,
            'x-upsert': 'true'          // re-exportar el mismo partido lo pisa, no lo duplica
        },
        body: cuerpo.blob
    });
}

async function nubeBajar(nombre) {
    const token = await nubeToken();
    const r = await nubeFetch('/storage/v1/object/' + NUBE.bucket + '/' + encodeURIComponent(nombre), {
        headers: { apikey: NUBE.anonKey, Authorization: 'Bearer ' + token },
        // respaldo.json se pisa siempre con el mismo nombre: sin esto el
        // navegador puede devolver la versión que ya tenía guardada, y el iPad
        // cree que la nube no tiene nada nuevo aunque la PC acabe de subir.
        cache: 'no-store'
    });
    return r.text();
}

// ── Cola de subida ──
// El XML va entero al localStorage. Es texto y pesa poco, y así sobrevive a
// que cierres la app antes de que haya señal.
function colaNube() {
    const raw = lsGet('tv_nube_cola');
    try { return raw ? JSON.parse(raw) : []; } catch (err) { return []; }
}
function guardarCola(cola) { lsSet('tv_nube_cola', JSON.stringify(cola)); }

function encolarArchivo(nombre, texto, formato, sinArrancar) {
    if (!nubeActiva()) return;
    let cola = colaNube();
    // El respaldo es "el último vale": si todavía hay uno sin subir, no tiene
    // sentido apilar otro del mismo archivo. Los XML sí se acumulan: cada uno
    // es un partido distinto.
    if (formato === 'json') cola = cola.filter(x => x.nombre !== nombre);
    cola.push({
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        nombre: nombre, texto: texto, formato: formato || 'xml', error: ''
    });
    guardarCola(cola);
    renderEstadoNube();
    // El botón "Subir a la nube" arranca la subida él mismo, para poder contar
    // cómo salió: si la largamos acá, el aviso queda en manos de esta llamada.
    if (!sinArrancar) sincronizarNube();
}

// ── Respaldo automático de plantillas y sesiones ──
// Actualizar la app no borra nada, pero Safari sí puede: a los 7 días sin
// abrirla le limpia el almacenamiento, y un "borrar datos de sitios" se lleva
// todo. Esto deja una copia siempre al día en la nube, de la que se puede
// volver desde cualquier dispositivo.
const ARCHIVO_RESPALDO = 'respaldo.json';

// Fecha del contenido que este dispositivo tiene ahora mismo. Sirve para saber
// si lo que hay en la nube es de otro lado y más nuevo: armás la botonera en la
// PC, abrís el iPad, y el iPad se da cuenta.
function fechaRespaldoLocal()  { return lsGet('tv_nube_fecha') || ''; }
function marcarRespaldo(fecha) { lsSet('tv_nube_fecha', fecha || ''); }

let _respaldoDemorado = null;
let _aplicandoRespaldo = false;

function respaldarEnNube() {
    // Al aplicar un respaldo que vino de la nube no hay nada nuevo que subir:
    // sin esto, traer los cambios de la PC devolvería el mismo contenido con
    // fecha nueva y el otro dispositivo creería que hay novedades.
    if (!nubeActiva() || _aplicandoRespaldo) return;
    // Restaurar toca plantillas y sesiones una detrás de otra: sin esta espera
    // se armarían dos respaldos para el mismo cambio.
    clearTimeout(_respaldoDemorado);
    _respaldoDemorado = setTimeout(() => {
        const payload = armarRespaldo();
        marcarRespaldo(payload.date);
        encolarArchivo(ARCHIVO_RESPALDO, JSON.stringify(payload), 'json');
    }, 1500);
}

// Al abrir la app: ¿hay en la nube algo más nuevo que lo de acá? Si sí, se
// ofrece traerlo. Calla la boca si no hay nada, no hay sesión o no hay red:
// esto no puede molestar a alguien que solo quiere codificar.
async function revisarRespaldoRemoto() {
    if (!nubeActiva() || !nubeSesion()) return;
    let data;
    try {
        data = JSON.parse(await nubeBajar(ARCHIVO_RESPALDO));
    } catch (err) {
        return;
    }
    // Las fechas son ISO, así que alcanza con compararlas como texto.
    if (!data || !data.date || data.date <= fechaRespaldoLocal()) return;
    await aplicarRespaldo(data, 'de la nube');
}

// La app instalada en el iPad queda abierta en segundo plano días enteros.
// Antes solo miraba la nube al arrancar, así que lo armado en la PC no
// aparecía nunca: ahora mira también cada vez que volvés a la app.
let _ultimaRevisionNube = 0;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Nunca en medio de un partido: un cartel ahí es lo último que querés.
    if (state.mode !== 'setup') return;
    if (Date.now() - _ultimaRevisionNube < 60000) return;
    _ultimaRevisionNube = Date.now();
    revisarRespaldoRemoto().then(() => sincronizarNube(false));
});

// Para que el aviso diga de dónde salió la copia. Sin eso, "¿reemplazar?"
// no deja distinguir lo de la PC de una copia vieja del mismo iPad.
function nombreDispositivo() {
    const ua = navigator.userAgent || '';
    if (ES_IOS)               return /iPhone/.test(ua) ? 'el iPhone' : 'el iPad';
    if (/Android/.test(ua))   return 'un Android';
    if (/Macintosh/.test(ua)) return 'la Mac';
    if (/Windows/.test(ua))   return 'la PC';
    return 'otro dispositivo';
}

function armarRespaldo() {
    return {
        app: 'tagview', kind: 'backup', version: 1,
        dispositivo: nombreDispositivo(),
        date: new Date().toISOString(),
        current:   { elements: state.elements, links: state.links, hojas: state.hojas },
        templates: getSavedTemplates(),
        sessions:  getSavedSessions()
    };
}

async function restaurarDesdeNube() {
    if (!nubeActiva())  { customAlert('La nube no está configurada.', 'Restaurar de la nube'); return; }
    if (!nubeSesion())  { dialogoEntrarNube(); return; }

    let data;
    try {
        data = JSON.parse(await nubeBajar(ARCHIVO_RESPALDO));
    } catch (err) {
        const motivo = (err && err.message) || String(err);
        customAlert(/not.?found|NoSuchKey|404/i.test(motivo)
            ? 'Todavía no hay ningún respaldo en la nube.'
            : 'No se pudo traer el respaldo: ' + motivo, 'Restaurar de la nube');
        return;
    }
    await aplicarRespaldo(data, 'de la nube');
}

let _sincronizaEnCurso = null;

// Si ya hay una subida andando, devuelve esa en vez de arrancar otra. Antes
// cortaba en seco: quien la esperaba creía que había terminado y avisaba de más.
function sincronizarNube(avisar) {
    if (_sincronizaEnCurso) return _sincronizaEnCurso;
    _sincronizaEnCurso = (async () => {
        try { await subirLaCola(avisar); }
        finally { _sincronizaEnCurso = null; renderEstadoNube(); }
    })();
    return _sincronizaEnCurso;
}

async function subirLaCola(avisar) {
    if (!nubeActiva()) return;
    if (!colaNube().length) { renderEstadoNube(); return; }

    if (!nubeSesion()) {
        if (avisar) dialogoEntrarNube();
        else renderEstadoNube();
        return;
    }

    renderEstadoNube();

    // Siempre el primero de la cola tal como está ahora, no una foto del
    // arranque: exportar un XML encola también el respaldo, y con una foto
    // ese segundo archivo se quedaba esperando al próximo arranque.
    for (;;) {
        const pendientes = colaNube();
        if (!pendientes.length) break;
        const item = pendientes[0];

        try {
            await nubeSubir(item);
        } catch (err) {
            const motivo = (err && err.message) || String(err);
            guardarCola(colaNube().map(x => x.id === item.id ? { ...x, error: motivo } : x));
            if (avisar) customAlert('No se pudo subir "' + item.nombre + '": ' + motivo, 'Nube');
            // Si falló uno, los que siguen van a fallar por lo mismo.
            break;
        }

        guardarCola(colaNube().filter(x => x.id !== item.id));
        // Red de seguridad contra el bucle infinito: lo que importa es que
        // este item salió, no que la cola haya achicado — mientras subía
        // puede haber entrado otro, y ahí el largo no baja.
        if (colaNube().some(x => x.id === item.id)) break;
        renderEstadoNube();
    }
}

// El botón "Subir a la nube": no espera la demora del respaldo automático ni
// el próximo arranque. Arma la copia al toque, la manda y avisa cómo fue.
async function subirAhoraALaNube() {
    if (!nubeActiva()) { customAlert('La nube no está configurada.', 'Subir a la nube'); return; }
    if (!nubeSesion()) { dialogoEntrarNube(); return; }

    clearTimeout(_respaldoDemorado);
    const payload = armarRespaldo();
    marcarRespaldo(payload.date);
    encolarArchivo(ARCHIVO_RESPALDO, JSON.stringify(payload), 'json', true);

    // En silencio: el aviso lo damos acá, mirando cómo quedó la cola. Así sale
    // uno solo y correcto, sin importar quién arrancó la subida.
    await sincronizarNube(false);

    const pendiente = colaNube()[0];
    if (!pendiente) {
        customAlert(`Subido: ${getSavedTemplates().length} plantillas y ${getSavedSessions().length} codificaciones.`,
                    'Subir a la nube');
    } else {
        customAlert('No se pudo subir: ' + (pendiente.error || 'quedó pendiente') +
                    '.\n\nNo se perdió nada: queda en la cola y se reintenta solo cuando haya señal.',
                    'Subir a la nube');
    }
}

function renderEstadoNube() {
    const barras = [el.nubeBar, el.nubeBarPlantillas].filter(Boolean);
    if (!barras.length) return;
    if (!nubeActiva()) { barras.forEach(b => b.classList.add('hidden')); return; }
    barras.forEach(b => b.classList.remove('hidden'));

    const cola = colaNube();
    const sesion = nubeSesion();
    const conError = cola.find(x => x.error);

    let texto, color = 'text-gray-500';
    if (_sincronizaEnCurso)  { texto = 'Subiendo…'; }
    else if (!cola.length)   { texto = sesion ? 'Nube: todo subido' : 'Nube: sin nada pendiente'; }
    else if (!sesion)        { texto = cola.length + ' sin subir · entrá a la nube'; color = 'text-[#007aff]'; }
    else if (conError)       { texto = cola.length + ' sin subir · ' + conError.error; color = 'text-red-500'; }
    else                     { texto = cola.length + ' sin subir'; color = 'text-[#007aff]'; }

    [el.nubeEstado, el.nubeEstadoPlantillas].filter(Boolean).forEach(n => {
        n.className = 'text-xs ' + color;
        n.textContent = texto;
    });
    if (el.btnNube)      el.btnNube.textContent = sesion ? 'Subir a la nube' : 'Entrar';
    if (el.btnSubirNube) el.btnSubirNube.textContent = sesion ? 'Subir a la nube' : 'Entrar';
}

// Card de login. Va aparte de customPrompt porque la contraseña necesita un
// campo que no la muestre en pantalla.
function dialogoEntrarNube() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:18px;padding:22px;width:100%;max-width:340px;' +
        'box-shadow:0 12px 44px rgba(0,0,0,.35);' +
        'font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;';

    const estiloCampo = 'width:100%;padding:10px 12px;border:1px solid #d1d1d6;border-radius:10px;' +
        'font-size:14px;margin-bottom:8px;box-sizing:border-box;-webkit-appearance:none;';
    const estiloBoton = 'display:block;width:100%;padding:11px 12px;border-radius:12px;font-size:13px;' +
        'font-weight:600;border:0;cursor:pointer;-webkit-appearance:none;box-sizing:border-box;';

    card.innerHTML = '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px;text-align:center;">Entrar a la nube</div>' +
        '<div style="font-size:11px;color:#8a8a8e;margin-bottom:14px;text-align:center;">Una sola vez por dispositivo.</div>';

    const email = document.createElement('input');
    email.type = 'email'; email.placeholder = 'Correo';
    email.autocomplete = 'username'; email.style.cssText = estiloCampo;

    const pass = document.createElement('input');
    pass.type = 'password'; pass.placeholder = 'Contraseña';
    pass.autocomplete = 'current-password'; pass.style.cssText = estiloCampo;

    const aviso = document.createElement('div');
    aviso.style.cssText = 'font-size:11px;color:#b91c1c;min-height:14px;margin-bottom:10px;line-height:1.4;';

    const btnEntrar = document.createElement('button');
    btnEntrar.type = 'button'; btnEntrar.textContent = 'Entrar';
    btnEntrar.style.cssText = estiloBoton + 'background:#007aff;color:#fff;margin-bottom:8px;';

    const btnCerrar = document.createElement('button');
    btnCerrar.type = 'button'; btnCerrar.textContent = 'Ahora no';
    btnCerrar.style.cssText = estiloBoton + 'background:transparent;color:#8a8a8e;';

    btnEntrar.onclick = async () => {
        aviso.textContent = '';
        btnEntrar.disabled = true;
        btnEntrar.textContent = 'Entrando…';
        try {
            await nubeEntrar(email.value.trim(), pass.value);
            overlay.remove();
            renderEstadoNube();
            // Entrar por primera vez en un dispositivo es justo el momento de
            // traer lo que ya hay, antes de mandar nada.
            revisarRespaldoRemoto().then(() => sincronizarNube(true));
        } catch (err) {
            aviso.textContent = (err && err.message) || String(err);
            btnEntrar.disabled = false;
            btnEntrar.textContent = 'Entrar';
        }
    };
    btnCerrar.onclick = () => overlay.remove();

    card.appendChild(email);
    card.appendChild(pass);
    card.appendChild(aviso);
    card.appendChild(btnEntrar);
    card.appendChild(btnCerrar);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    email.focus();
}

// Abre el selector de Archivos y devuelve { name, text } o null si se canceló
function pickTextFile(accept) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || 'application/json,.json';
        input.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(input);

        let done = false;
        const finish = value => {
            if (done) return;
            done = true;
            input.remove();
            resolve(value);
        };

        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (!f) return finish(null);
            const reader = new FileReader();
            reader.onload  = () => finish({ name: f.name, text: String(reader.result) });
            reader.onerror = () => finish(null);
            reader.readAsText(f);
        });

        // Si el usuario cancela no se dispara 'change': lo detectamos al volver el foco
        window.addEventListener('focus', () => {
            setTimeout(() => { if (!input.files || !input.files.length) finish(null); }, 800);
        }, { once: true });

        input.click();
    });
}

// Lee y valida un archivo de la app
async function readAppFile(kinds, etiqueta) {
    const picked = await pickTextFile();
    if (!picked) return null;
    let data;
    try {
        data = JSON.parse(picked.text);
    } catch (err) {
        customAlert(`"${picked.name}" no es un archivo JSON válido.`, 'Archivo ilegible');
        return null;
    }
    if (!data || data.app !== 'tagview' || !kinds.includes(data.kind)) {
        customAlert(`"${picked.name}" no es ${etiqueta} de Tag&View.`, 'Archivo incorrecto');
        return null;
    }
    return data;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
    setViewportHeight();
    if (el.appVersion) el.appVersion.textContent = APP_VERSION;
    // Evita que iOS purgue plantillas y sesiones por falta de uso
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    loadData();
    buildSvgDefs();
    bindEvents();
    setMode('setup');
    setPage('botonera');
    renderEstadoNube();
    // Mirar la nube ANTES de subir lo pendiente. Al revés, un respaldo local
    // que quedó en la cola pisaría lo que hiciste en la PC sin preguntar.
    revisarRespaldoRemoto().then(() => sincronizarNube(false));
    reportarFaltantes();
}

function buildSvgDefs() {
    el.svgArrows.innerHTML = `<defs>
        <marker id="arrowhead" markerWidth="9" markerHeight="7"
            refX="8" refY="3.5" orient="auto">
            <polygon points="0 0, 9 3.5, 0 7" fill="#34c759"/>
        </marker>
    </defs>`;
}

function loadData() {
    const e = lsGet('tv_elements');
    const l = lsGet('tv_links');
    const h = lsGet('tv_hojas');
    if (e) state.elements = JSON.parse(e);
    if (l) state.links    = JSON.parse(l);
    if (h) state.hojas    = JSON.parse(h);
}
function saveData() {
    lsSet('tv_elements', JSON.stringify(state.elements));
    lsSet('tv_links',    JSON.stringify(state.links));
    lsSet('tv_hojas',    JSON.stringify(state.hojas));
}

// ─────────────────────────────────────────────
// iPad: ALTO REAL DEL VIEWPORT
// window.innerHeight sí descuenta las barras de Safari; 100vh no.
// ─────────────────────────────────────────────
function setViewportHeight() {
    document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
}

// ─────────────────────────────────────────────
// iPad: PANTALLA ENCENDIDA MIENTRAS SE CODIFICA
// ─────────────────────────────────────────────
let _wakeLock = null;

async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || _wakeLock) return;
    try {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    } catch (err) {
        _wakeLock = null;   // iPadOS anterior a 16.4, o el sistema lo denegó
    }
}

function releaseWakeLock() {
    if (!_wakeLock) return;
    _wakeLock.release().catch(() => {});
    _wakeLock = null;
}

// ─────────────────────────────────────────────
// PÁGINAS
// La app son tres pantallas completas en vez de modales: la botonera, las
// plantillas y las codificaciones/XML. En un iPad un modal queda chico para
// listas largas.
// ─────────────────────────────────────────────
function setPage(page) {
    state.page = page;

    const paginas = {
        botonera:   el.pageBotonera,
        plantillas: el.pagePlantillas,
        xml:        el.pageXml
    };
    const nombres = { botonera: 'Botonera', plantillas: 'Plantillas', xml: 'XML' };

    Object.keys(paginas).forEach(k => {
        const activa = (k === page);
        if (paginas[k]) {
            paginas[k].classList.toggle('hidden', !activa);
            paginas[k].classList.toggle('flex', activa);
        }
    });

    if (el.menuPageName) el.menuPageName.textContent = nombres[page] || '';
    document.querySelectorAll('.menu-page').forEach(b => {
        b.classList.toggle('is-current', b.dataset.page === page);
    });

    // El menú Insertar y el Inspector son de la botonera
    closeMainMenu();
    closeInsertMenu();
    if (page !== 'botonera') el.inspectorPanel.classList.add('hidden');
    // Una plantilla cargada desde otra página se dibujó con el lienzo oculto,
    // sin poder medir. Para Safari sin ResizeObserver, se recalcula al volver.
    if (page === 'botonera') reajustarLienzo();

    if (page === 'plantillas') renderTemplatesList();
    if (page === 'xml')        renderSessionsList();
}

// ─────────────────────────────────────────────
// MODE
// ─────────────────────────────────────────────
function setMode(mode) {
    const isExitingLive = (state.mode === 'live' && mode === 'setup');
    state.mode = mode;
    state.selectedId = null;
    state.isLinking  = false;
    state.activePopupElementIds = [];
    state.tempPopupButtons = [];
    // Terminar la codificación con una plantilla de detalle abierta: se cierra.
    state.detalle = null;
    mostrarBarraDetalle();
    // Se codifica siempre desde la Principal, estés editando la pestaña que sea.
    if (mode === 'live') state.hojaActiva = null;
    renderHojasBar();

    // Al salir de live, cerrar cualquier turno abierto (acumulando su ToI)
    if (state.openEvents && state.openEvents.length > 0) {
        for (let i = state.openEvents.length - 1; i >= 0; i--) closeOpenEventAt(i, true);
    }
    // Y la posesión que esté corriendo: el último tramo también tiene que
    // llegar al XML, que se exporta justo después.
    Object.keys(state.posesion || {}).forEach(id => {
        const botonPos = state.elements.find(x => String(x.id) === id);
        if (botonPos) cerrarTramoPosesion(botonPos);
        else delete state.posesion[id];
    });

    closeInsertMenu();

    if (mode === 'setup') {
        el.titleLogo.classList.remove('hidden');
        el.timerDisplay.classList.add('hidden');
        el.btnExport.classList.add('hidden');
        el.inspectorPanel.classList.add('hidden');
        el.livePanel.classList.add('hidden');
        el.setupBar.classList.remove('hidden');
        el.liveBar.classList.add('hidden');
        if (state.isPlaying) pauseTimer();
        releaseWakeLock();

        // Al terminar de codificar, descargar automáticamente el archivo XML si hay eventos
        if (isExitingLive && state.events.length > 0) {
            exportXML();
        }
    } else {
        // El cronómetro vive en la barra de herramientas, justo debajo del
        // encabezado: mostrarlo también acá lo duplicaba.
        el.titleLogo.classList.remove('hidden');
        el.timerDisplay.classList.add('hidden');
        el.btnExport.classList.remove('hidden');
        el.inspectorPanel.classList.add('hidden');
        el.livePanel.classList.remove('hidden');
        el.setupBar.classList.add('hidden');
        el.liveBar.classList.remove('hidden');

        state.time = 0; state.isPlaying = false;
        state.events = []; state.counters = {}; state.toi = {};
        state.posesion = {};
        state.sessionStartedAt = null;
        setLiveTab('log');
        updateTimerUI();
        el.btnPlayPause.textContent = '▶ PLAY';
        el.btnPlayPause.classList.replace('bg-gray-500','bg-[#2ca038]');
        renderLivePanel();
    }
    renderAll();
}

// ─────────────────────────────────────────────
// BIND
// ─────────────────────────────────────────────
// Engancha un listener sin tumbar la app si el elemento no existe.
// Un index.html y un app.js desfasados (por caché del navegador o del service
// worker) dejaban la app muerta: la primera excepción cortaba bindEvents y no
// se enganchaba ningún botón.
function on(nodo, evento, fn, opts) {
    if (!nodo) return false;
    nodo.addEventListener(evento, fn, opts);
    return true;
}

function bindEvents() {
    on(el.btnMenu, 'click', e => { e.stopPropagation(); el.mainMenu.classList.toggle('hidden'); });
    document.querySelectorAll('.menu-page').forEach(b => {
        b.addEventListener('click', () => setPage(b.dataset.page));
    });
    on(el.btnStartCoding, 'click',() => setMode('live'));
    on(el.btnStartCodingMenu, 'click', () => { closeInsertMenu(); setMode('live'); });
    on(el.btnStopCoding, 'click', () => setMode('setup'));

    on(el.btnNube, 'click', subirAhoraALaNube);
    on(el.btnSubirNube, 'click', subirAhoraALaNube);
    on(el.btnRestoreNube, 'click', restaurarDesdeNube);
    // Volvió la señal: lo que quedó en la cola se va solo.
    window.addEventListener('online', () => sincronizarNube(false));

    on(el.btnInsertMenu, 'click', () => el.insertMenu.classList.toggle('hidden'));
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => { closeInsertMenu(); createElement(btn.dataset.type); });
    });

    on(el.btnPlayPause, 'click', toggleTimer);
    on(el.btnExport, 'click', exportXML);
    on(el.btnClearEvents, 'click', async () => {
        if (await customConfirm('¿Borrar todos los eventos y el tiempo acumulado?', 'Limpiar Eventos', true, 'Borrar')) {
            state.events = []; state.counters = {}; state.toi = {}; state.openEvents = [];
            state.posesion = {};
            renderLivePanel(); renderElements();
        }
    });

    on(el.propName, 'input', updateSelected);
    on(el.propType, 'change', updateSelected);
    on(el.propColor, 'input', updateSelected);

    on(el.btnSaveCurrentTemplate, 'click', saveCurrentTemplate);
    on(el.btnNewTemplate, 'click', createNewTemplate);


    on(el.btnSaveCurrentSession, 'click', saveCurrentSession);

    on(el.btnOpenExclusiveModal, 'click', openExclusiveModal);
    on(el.btnExportTemplateFile, 'click', () => exportTemplateToFile(null));
    on(el.btnImportTemplateFile, 'click', importTemplateFromFile);
    if (el.btnImportSessionFile)  on(el.btnImportSessionFile, 'click', importSessionFromFile);
    if (el.btnBackupAll)  on(el.btnBackupAll, 'click', backupAll);
    on(el.btnRestoreAll, 'click', restoreAll);
    if (el.btnOpenLineModal)  on(el.btnOpenLineModal, 'click', openLineModal);
    on(el.btnCloseLineModal, 'click', closeLineModal);
    on(el.propLineExclusive, 'change', updateSelected);
    on(el.tabLog, 'click', () => setLiveTab('log'));
    on(el.tabToi, 'click', () => setLiveTab('toi'));
    on(el.btnExportToi, 'click', exportToiCSV);
    on(el.btnCloseExclusiveModal, 'click', closeExclusiveModal);
    if (el.propTimeMode)  on(el.propTimeMode, 'change', updateSelected);
    on(el.propLead, 'input', updateSelected);
    on(el.propLag, 'input', updateSelected);
    on(el.propDescriptors, 'input', updateSelected);
    on(el.propPopupDescriptors, 'input', updateSelected);
    
    on(el.btnStartLink, 'click', startLinking);
    on(el.btnDeleteElement, 'click', deleteSelected);
    on(el.btnDuplicateElement, 'click', duplicateSelected);
    on(el.btnAjustar, 'click', alternarAjuste);
    on(el.propSubPlantilla, 'change', updateSelected);
    on(el.btnInsertHoja, 'click', insertarHoja);
    on(el.tabPos, 'click', () => setLiveTab('pos'));
    on(el.propEquipoA, 'input', updateSelected);
    on(el.propEquipoB, 'input', updateSelected);
    on(el.propEquipoEvento, 'change', updateSelected);
    // En la PC: Ctrl+D (Cmd+D en Mac). Sin el preventDefault, el navegador lo
    // toma para agregar la página a favoritos.
    document.addEventListener('keydown', ev => {
        if (!(ev.ctrlKey || ev.metaKey) || (ev.key !== 'd' && ev.key !== 'D')) return;
        const t = ev.target;
        // Escribiendo un nombre, Ctrl+D es del campo de texto, no nuestro.
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (state.mode !== 'setup' || (!state.selectedIds.length && !state.selectedId)) return;
        ev.preventDefault();
        duplicateSelected();
    });
    on(el.btnHideInspector, 'click', () => selectElement(null));

    on(el.canvasContainer, 'mousedown', onCanvasDown);
    document.addEventListener('mousemove', onGlobalMove);
    document.addEventListener('mouseup',   onGlobalUp);
    on(el.canvasContainer, 'touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);

    // En modo Formularios, el touchstart del lienzo puede llamar preventDefault,
    // y eso cancela el click en iOS: los menús se quedaban abiertos al tocar el
    // medio de la pantalla. Por eso escuchamos también touchstart.
    document.addEventListener('click', e => cerrarMenusSiEsAfuera(e.target));
    document.addEventListener('touchstart', e => {
        if (e.touches && e.touches.length) cerrarMenusSiEsAfuera(e.touches[0].target || e.target);
    }, { passive: true, capture: true });

    // Recalcular el alto cuando rota el iPad o Safari muestra/oculta sus barras
    window.addEventListener('resize', setViewportHeight);
    // Girar el iPad o cambiar el tamaño de la ventana cambia cuánto entra.
    window.addEventListener('resize', reajustarLienzo);
    window.addEventListener('orientationchange', () => setTimeout(reajustarLienzo, 300));
    // Lo que de verdad importa es el tamaño del lienzo, y cambia sin que la
    // ventana cambie: al volver de Plantillas (estaba oculto y no se podía
    // medir, así que el panel quedaba sin achicar), al abrir el registro en
    // vivo. ResizeObserver avisa en todos esos casos.
    if (window.ResizeObserver) new ResizeObserver(reajustarLienzo).observe(el.canvasContainer);
    window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', setViewportHeight);

    // iOS suelta el bloqueo de pantalla al pasar a segundo plano: lo repedimos al volver
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.mode === 'live' && state.isPlaying) {
            acquireWakeLock();
        }
    });
}

// Si el HTML y el JS no son de la misma versión (caché a medias), faltarán
// elementos. Antes eso tumbaba bindEvents en la primera excepción y la app
// quedaba muerta al tacto; ahora se avisa y el resto sigue funcionando.
function reportarFaltantes() {
    const faltan = Object.keys(el).filter(k => !el[k]);
    if (!faltan.length) return;
    console.warn('Tag&View: faltan estos elementos en el HTML:', faltan.join(', '));
    customAlert(
        'La app cargó a medias: el navegador está mezclando una versión vieja con una nueva.\n\n' +
        'Cerrala, volvé a abrirla y recargá dos veces.',
        'Versión desincronizada');
}

function closeInsertMenu() { if (el.insertMenu) el.insertMenu.classList.add('hidden'); }
function closeMainMenu()   { if (el.mainMenu) el.mainMenu.classList.add('hidden'); }

// ¿El toque cayó fuera de los dos menús? Entonces se cierran.
function cerrarMenusSiEsAfuera(target) {
    if (!target) return;
    const dentro = (btn, menu) =>
        (btn && btn.contains(target)) || (menu && menu.contains(target));
    if (!dentro(el.btnInsertMenu, el.insertMenu)) closeInsertMenu();
    if (!dentro(el.btnMenu, el.mainMenu)) closeMainMenu();
}

// ─────────────────────────────────────────────
// CANVAS POINTER
// ─────────────────────────────────────────────
function canvasPos(cx, cy) {
    const r = el.canvas.getBoundingClientRect();
    // El lienzo puede estar achicado para entrar en la pantalla: el toque llega
    // en píxeles de pantalla y el lienzo trabaja en coordenadas reales. Sin
    // dividir, cada toque caería corrido respecto de lo que se ve.
    return { x: (cx - r.left) / escalaLienzo, y: (cy - r.top) / escalaLienzo };
}
function onCanvasDown(e)  { if (state.mode !== 'setup') return; handleDown(e.clientX, e.clientY, e.target, e.shiftKey); }
function onGlobalMove(e)  { if (state.mode !== 'setup') return; handleMove(e.clientX, e.clientY); }
function onGlobalUp()     {
    if (state.isMarquee) {
        finishMarquee();
        state.isMarquee = false;
        removeMarqueeEl();
        renderElements(); renderLinks();
        return;
    }
    if (state.isDragging || state.isResizing) {
        state.isDragging = state.isResizing = false;
        saveData();
    }
}
// En el iPad, un dedo manipula el lienzo y dos dedos lo desplazan.
// Solo bloqueamos el gesto nativo cuando de verdad estamos moviendo algo:
// si no, los modales y el Inspector no se podrían scrollear.
function onTouchStart(e) {
    if (state.mode !== 'setup') return;
    if (e.touches.length > 1) return;                      // dos dedos → desplazar
    if (!el.canvasContainer.contains(e.target)) return;    // fuera del lienzo, no tocamos nada
    const t = e.touches[0];
    handleDown(t.clientX, t.clientY, e.target, false);
    if (state.isDragging || state.isResizing || state.isMarquee) e.preventDefault();
}
function onTouchMove(e) {
    if (state.mode !== 'setup') return;
    if (e.touches.length > 1) return;
    if (!(state.isDragging || state.isResizing || state.isMarquee)) return;
    e.preventDefault();
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
}
function onTouchEnd()     { onGlobalUp(); }

function handleDown(cx, cy, target, shiftKey) {
    // Los botones flotantes Duplicar / Eliminar están en el lienzo pero no son
    // elementos: sin esto el toque cuenta como tocar el vacío, deselecciona, y
    // los botones desaparecen antes de llegar a recibir el click.
    if (target.closest && target.closest('.acciones-flotantes')) return;

    const pos = canvasPos(cx, cy);

    if (target.classList.contains('resize-handle')) {
        state.isResizing = true;
        state.resizeDir  = target.dataset.dir;
        state.dragStart  = pos;
        const e = state.elements.find(e => e.id === state.selectedId);
        if (e) state.elStart = { x:e.x, y:e.y, w:e.w, h:e.h };
        return;
    }

    const div = target.closest('.canvas-element');
    if (div) {
        const id = parseInt(div.dataset.id);

        // Enlace
        if (state.isLinking && state.linkStartId) {
            if (id !== state.linkStartId) {
                if (!state.links.some(l => l.fromId === state.linkStartId && l.toId === id)) {
                    state.links.push({ id: 'lnk_'+Date.now(), fromId: state.linkStartId, toId: id });
                    saveData();
                }
            }
            state.isLinking = false; state.linkStartId = null; renderLinks(); return;
        }

        // Shift+click: toggle multi-selección
        if (shiftKey) {
            if (state.selectedIds.includes(id)) {
                state.selectedIds = state.selectedIds.filter(i => i !== id);
                if (state.selectedId === id) {
                    state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null;
                }
            } else {
                // Asegurar que el actual también esté incluido
                if (state.selectedId && !state.selectedIds.includes(state.selectedId)) {
                    state.selectedIds.push(state.selectedId);
                }
                state.selectedIds.push(id);
                state.selectedId = id;
            }
            updateSelectionClasses();
            updateInspectorForSelection();
            return;
        }

        // Click normal: selección simple
        if (!state.selectedIds.includes(id)) {
            // Click en elemento no seleccionado → selección simple
            state.selectedIds = [id];
            selectElement(id);
        }
        // Si el elemento ya estaba seleccionado (parte de multi-selección) → iniciar drag del grupo

        // Iniciar arrastre
        state.isDragging = true;
        state.dragStart  = pos;
        // Guardar posiciones iniciales de todos los seleccionados
        state.elStarts = state.selectedIds.map(sid => {
            const se = state.elements.find(e => e.id === sid);
            return se ? { id: sid, x: se.x, y: se.y } : null;
        }).filter(Boolean);
        // También guardar para resize (elemento principal)
        const mainEl = state.elements.find(e => e.id === (state.selectedId || id));
        if (mainEl) state.elStart = { x: mainEl.x, y: mainEl.y, w: mainEl.w, h: mainEl.h };
        return;
    }

    // Click en área vacía
    if (state.isLinking) { state.isLinking = false; state.linkStartId = null; renderLinks(); return; }

    if (!shiftKey) {
        // Iniciar marquee
        state.selectedId  = null;
        state.selectedIds = [];
        el.inspectorPanel.classList.add('hidden');
        state.isMarquee    = true;
        state.marqueeStart = pos;
        state.marqueeEnd   = pos;
        updateSelectionClasses();
    }
}

function handleMove(cx, cy) {
    const pos = canvasPos(cx, cy);
    state.mousePosCanvas = pos;
    if (state.isLinking) { renderLinks(); return; }

    if (state.isMarquee) {
        state.marqueeEnd = pos;
        drawMarqueeEl();
        return;
    }

    if (state.isDragging && state.selectedIds.length > 0) {
        const dx = pos.x - state.dragStart.x;
        const dy = pos.y - state.dragStart.y;
        state.elStarts.forEach(s => {
            const e = state.elements.find(e => e.id === s.id);
            if (e) {
                e.x = Math.max(0, snap(s.x + dx));
                e.y = Math.max(0, snap(s.y + dy));
            }
        });
        updateElementPositions(); renderLinks();
        return;
    }

    if (state.isResizing && state.selectedId) {
        const e = state.elements.find(e => e.id === state.selectedId);
        if (e) {
            const dx = pos.x - state.dragStart.x, dy = pos.y - state.dragStart.y;
            if (state.resizeDir.includes('e')) e.w = Math.max(40, snap(state.elStart.w + dx));
            if (state.resizeDir.includes('s')) e.h = Math.max(24, snap(state.elStart.h + dy));
            updateElementPositions(); renderLinks();
        }
    }
}

// ── Marquee helpers ──
let _marqueeDiv = null;
function drawMarqueeEl() {
    if (!_marqueeDiv) {
        _marqueeDiv = document.createElement('div');
        _marqueeDiv.id = 'marqueeRect';
        _marqueeDiv.style.cssText = 'position:absolute;border:2px dashed #007aff;background:rgba(0,122,255,0.06);pointer-events:none;z-index:50;border-radius:4px;';
        el.canvas.appendChild(_marqueeDiv);
    }
    const x1 = Math.min(state.marqueeStart.x, state.marqueeEnd.x);
    const y1 = Math.min(state.marqueeStart.y, state.marqueeEnd.y);
    const w  = Math.abs(state.marqueeEnd.x - state.marqueeStart.x);
    const h  = Math.abs(state.marqueeEnd.y - state.marqueeStart.y);
    _marqueeDiv.style.left   = x1 + 'px';
    _marqueeDiv.style.top    = y1 + 'px';
    _marqueeDiv.style.width  = w  + 'px';
    _marqueeDiv.style.height = h  + 'px';
}
function removeMarqueeEl() {
    if (_marqueeDiv) { _marqueeDiv.remove(); _marqueeDiv = null; }
}
function finishMarquee() {
    const x1 = Math.min(state.marqueeStart.x, state.marqueeEnd.x);
    const y1 = Math.min(state.marqueeStart.y, state.marqueeEnd.y);
    const x2 = Math.max(state.marqueeStart.x, state.marqueeEnd.x);
    const y2 = Math.max(state.marqueeStart.y, state.marqueeEnd.y);
    if (x2 - x1 < 4 && y2 - y1 < 4) return; // Click sin arrastrar → no seleccionar nada
    // Solo la pestaña a la vista: las otras ocupan las mismas coordenadas.
    state.selectedIds = elementosEnPantalla()
        .filter(e => e.x < x2 && e.x + e.w > x1 && e.y < y2 && e.y + e.h > y1)
        .map(e => e.id);
    state.selectedId = state.selectedIds[0] || null;
    updateInspectorForSelection();
}
function snap(v) { return Math.round(v/20)*20; }

// ─────────────────────────────────────────────
// CREATE / DELETE
// ─────────────────────────────────────────────
function createElement(type) {
    // El scroll viene en píxeles de pantalla; el lienzo, en coordenadas reales.
    const cx = el.canvasContainer.scrollLeft / escalaLienzo + 60;
    const cy = el.canvasContainer.scrollTop  / escalaLienzo + 60;

    const defaults = {
        event:       { name:'Evento',              w:DEFAULT_W, h:DEFAULT_H },
        descriptor:  { name:'Etiqueta',            w:DEFAULT_W, h:DEFAULT_H },
        popup_label: { name:'Etiqueta emergente',  w:DEFAULT_W, h:DEFAULT_H },
        counter:     { name:'0',                   w:80,        h:60        },
        container:   { name:'',                    w:200,       h:180       },
        line:        { name:'Línea 1',             w:140,       h:52        },
        possession:  { name:'Posesión',            w:260,       h:72        }
    };
    const d = defaults[type] || defaults.event;

    const newEl = {
        id: Date.now(), type,
        name: d.name,
        color: null,
        x: snap(cx), y: snap(cy),
        w: d.w, h: d.h,
        timeMode: 'fixed',
        exclusiveIds: [],
        isExclusive: false,
        lead: 0, lag: 1,
        popups: [],
        lineMemberIds: [],
        lineExclusive: true
    };
    if (state.hojaActiva) newEl.hoja = state.hojaActiva;   // nace en la pestaña que estás editando
    if (type === 'possession') { newEl.equipoA = 'Local'; newEl.equipoB = 'Visitante'; }
    state.elements.push(newEl);
    saveData();
    selectElement(newEl.id);
    renderAll();
}

function deleteSelected() {
    const idsToDelete = state.selectedIds.length > 0 ? state.selectedIds : (state.selectedId ? [state.selectedId] : []);
    if (!idsToDelete.length) return;
    idsToDelete.forEach(sid => {
        state.links    = state.links.filter(l => l.fromId !== sid && l.toId !== sid);
        state.elements = state.elements.filter(e => e.id !== sid);
        state.elements.forEach(e => {
            if (e.exclusiveIds)   e.exclusiveIds   = e.exclusiveIds.filter(id => id !== sid);
            if (e.lineMemberIds)  e.lineMemberIds  = e.lineMemberIds.filter(id => id !== sid);
        });
    });
    state.selectedId  = null;
    state.selectedIds = [];
    el.inspectorPanel.classList.add('hidden');
    saveData(); renderAll();
}

// Duplica lo seleccionado, uno o varios. Las copias aparecen corridas un
// casillero y quedan seleccionadas, listas para arrastrar o renombrar.
function duplicateSelected() {
    if (state.mode !== 'setup') return;
    const ids = state.selectedIds.length > 0 ? state.selectedIds : (state.selectedId ? [state.selectedId] : []);
    const originales = state.elements.filter(e => ids.includes(e.id));
    if (!originales.length) return;

    // IDs enteros: el lienzo los lee con parseInt. Date.now() solo no alcanza,
    // varias copias caen en el mismo milisegundo.
    let siguiente = Math.max(Date.now(), ...state.elements.map(e => Number(e.id) || 0)) + 1;
    const nuevoId = new Map();
    originales.forEach(o => nuevoId.set(o.id, siguiente++));
    // Lo que apunta adentro del grupo copiado pasa a apuntar a la copia; lo de
    // afuera queda igual. Así duplicar un evento con sus etiquetas trae un
    // juego nuevo que no se mezcla con el original.
    const remapear = id => nuevoId.has(id) ? nuevoId.get(id) : id;

    const copias = originales.map(o => {
        const c = JSON.parse(JSON.stringify(o));
        c.id = nuevoId.get(o.id);
        c.x = o.x + 20;
        c.y = o.y + 20;
        // Mismo nombre = mismo código en el XML, y los dos botones se fundirían
        // en uno en Sportscode. El contador muestra un número, ese no se toca.
        if (c.name && c.type !== 'counter') c.name = c.name + ' copia';
        c.exclusiveIds  = (o.exclusiveIds  || []).map(remapear);
        c.lineMemberIds = (o.lineMemberIds || []).map(remapear);
        return c;
    });

    // Los excluyentes van de a dos: si la copia excluye a un botón de afuera,
    // ese botón también tiene que excluir a la copia, igual que hace el modal.
    copias.forEach(c => c.exclusiveIds.forEach(xid => {
        const otro = state.elements.find(e => e.id === xid);
        if (!otro) return;
        if (!otro.exclusiveIds) otro.exclusiveIds = [];
        if (!otro.exclusiveIds.includes(c.id)) otro.exclusiveIds.push(c.id);
    }));

    // Los enlaces que SALEN de un botón copiado se copian: son parte de cómo se
    // comporta. Los que llegan desde afuera no, porque cambiarían lo que hace
    // un botón que no tocaste.
    const sello = Date.now();
    const enlaces = state.links
        .filter(l => nuevoId.has(l.fromId))
        .map((l, i) => ({ ...l, id: 'lnk_' + sello + '_' + i,
                          fromId: nuevoId.get(l.fromId), toId: remapear(l.toId) }));

    state.elements.push(...copias);
    state.links.push(...enlaces);
    state.selectedIds = copias.map(c => c.id);
    state.selectedId  = state.selectedIds[0];
    saveData();
    renderAll();
    updateSelectionClasses();
    updateInspectorForSelection();
}

// ─────────────────────────────────────────────
// INSPECTOR
// ─────────────────────────────────────────────
function updateInspectorForSelection() {
    if (state.selectedIds.length === 1) {
        selectElement(state.selectedIds[0]);
    } else if (state.selectedIds.length > 1) {
        // Multi-selección: ocultar inspector individual
        el.inspectorPanel.classList.add('hidden');
    } else {
        el.inspectorPanel.classList.add('hidden');
    }
}

function selectElement(id) {
    state.selectedId  = id;
    if (id) {
        state.selectedIds = [id];
    } else {
        state.selectedIds = [];
    }
    updateSelectionClasses();
    if (!id) {
        el.inspectorPanel.classList.add('hidden');
        return;
    }
    const e = state.elements.find(e => e.id === id);
    if (!e) { el.inspectorPanel.classList.add('hidden'); return; }
    el.inspectorPanel.classList.remove('hidden');

    el.propName.value  = e.name;
    el.propType.value  = e.type;
    el.propColor.value = e.color || defaultColor(e.type);
    
    if (el.propTimeMode)  el.propTimeMode.value = e.timeMode || 'fixed';
    if (el.exclusiveBadge) el.exclusiveBadge.textContent = (e.exclusiveIds || []).length;
    
    // Sin ?? : no existe antes de Safari 13.4 y rompe el parseo del archivo entero
    el.propLead.value  = (e.lead === undefined || e.lead === null) ? 0 : e.lead;
    el.propLag.value   = (e.lag  === undefined || e.lag  === null) ? 1 : e.lag;
    if (el.propDescriptors) el.propDescriptors.value = (e.popups || []).join(', ');
    llenarSelectorDetalle(e);
    if (el.propEquipoA) el.propEquipoA.value = e.equipoA || 'Local';
    if (el.propEquipoB) el.propEquipoB.value = e.equipoB || 'Visitante';
    if (el.propEquipoEvento) {
        // Con los nombres de los equipos del botón de posesión, si hay uno.
        const nombres = nombresEquipos();
        el.propEquipoEvento.innerHTML = '';
        [['', 'Ninguno'], ['A', nombres.A], ['B', nombres.B]].forEach(([valor, texto]) => {
            const o = document.createElement('option');
            o.value = valor;
            o.textContent = texto;
            el.propEquipoEvento.appendChild(o);
        });
        el.propEquipoEvento.value = (e.equipo === 'A' || e.equipo === 'B') ? e.equipo : '';
        // Los botones de una pestaña de detalle son etiquetas, no eventos.
        if (el.propEquipoEventoSection) el.propEquipoEventoSection.style.display = hojaDe(e) ? 'none' : '';
    }
    if (el.lineBadge) el.lineBadge.textContent = (e.lineMemberIds || []).length;
    if (el.propLineExclusive) el.propLineExclusive.checked = e.lineExclusive !== false;
    if (el.propPopupDescriptors) el.propPopupDescriptors.value = (e.popups || []).join(', ');
    syncSections(e.type);
}

function openExclusiveModal() {
    if (!state.selectedId) return;
    const current = state.elements.find(e => e.id === state.selectedId);
    if (!current || current.type !== 'event') return;

    if (!current.exclusiveIds) current.exclusiveIds = [];

    el.exclusiveModalTitle.textContent = `Excluyentes con "${current.name}"`;
    el.exclusiveEventsList.innerHTML = '';

    // Solo de la misma pestaña: excluir contra un botón de otra no tiene sentido.
    const otherEvents = state.elements.filter(item => item.type === 'event' && item.id !== current.id
                                                   && hojaDe(item) === hojaDe(current));

    if (otherEvents.length === 0) {
        el.exclusiveEventsList.innerHTML = `<div class="p-4 text-center text-sm text-gray-500">No hay otros eventos en la plantilla.</div>`;
    } else {
        otherEvents.forEach(other => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer';
            const isChecked = current.exclusiveIds.includes(other.id);
            row.innerHTML = `
                <span class="font-medium text-black text-base">${other.name}</span>
                <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-[#007aff]" ${isChecked ? 'checked' : ''}>
            `;
            const checkbox = row.querySelector('input');
            const toggle = () => {
                if (checkbox.checked) {
                    if (!current.exclusiveIds.includes(other.id)) current.exclusiveIds.push(other.id);
                    if (!other.exclusiveIds) other.exclusiveIds = [];
                    if (!other.exclusiveIds.includes(current.id)) other.exclusiveIds.push(current.id);
                } else {
                    current.exclusiveIds = current.exclusiveIds.filter(id => id !== other.id);
                    if (other.exclusiveIds) other.exclusiveIds = other.exclusiveIds.filter(id => id !== current.id);
                }
                if (el.exclusiveBadge) el.exclusiveBadge.textContent = current.exclusiveIds.length;
                saveData();
            };
            row.addEventListener('click', (ev) => {
                if (ev.target !== checkbox) { checkbox.checked = !checkbox.checked; toggle(); }
            });
            checkbox.addEventListener('change', toggle);
            el.exclusiveEventsList.appendChild(row);
        });
    }

    el.exclusiveModal.classList.remove('hidden');
    el.exclusiveModal.classList.add('flex');
}

function closeExclusiveModal() {
    el.exclusiveModal.classList.add('hidden');
    el.exclusiveModal.classList.remove('flex');
}

// ─────────────────────────────────────────────
// MODAL JUGADORES DE LA LÍNEA
// ─────────────────────────────────────────────
function openLineModal() {
    if (!state.selectedId) return;
    const current = state.elements.find(e => e.id === state.selectedId);
    if (!current || current.type !== 'line') return;

    if (!current.lineMemberIds) current.lineMemberIds = [];

    el.lineModalTitle.textContent = `Jugadores de "${current.name}"`;
    el.lineMembersList.innerHTML = '';

    // Solo de la misma pestaña: los botones de un detalle no son jugadores.
    const players = state.elements.filter(item => item.type === 'event' && hojaDe(item) === hojaDe(current));

    if (players.length === 0) {
        el.lineMembersList.innerHTML = `<div class="p-4 text-center text-sm text-gray-500">No hay botones de Evento todavía. Creá uno por jugador.</div>`;
    } else {
        players.forEach(pl => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer';
            const isChecked = current.lineMemberIds.includes(pl.id);
            row.innerHTML = `
                <span class="font-medium text-black text-base">${pl.name}</span>
                <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-[#007aff]" ${isChecked ? 'checked' : ''}>
            `;
            const checkbox = row.querySelector('input');
            const toggle = () => {
                if (checkbox.checked) {
                    if (!current.lineMemberIds.includes(pl.id)) current.lineMemberIds.push(pl.id);
                } else {
                    current.lineMemberIds = current.lineMemberIds.filter(id => id !== pl.id);
                }
                if (el.lineBadge) el.lineBadge.textContent = current.lineMemberIds.length;
                saveData();
                renderElements();
            };
            row.addEventListener('click', (ev) => {
                if (ev.target !== checkbox) { checkbox.checked = !checkbox.checked; toggle(); }
            });
            checkbox.addEventListener('change', toggle);
            el.lineMembersList.appendChild(row);
        });
    }

    el.lineModal.classList.remove('hidden');
    el.lineModal.classList.add('flex');
}

function closeLineModal() {
    el.lineModal.classList.add('hidden');
    el.lineModal.classList.remove('flex');
}

function syncSections(type) {
    el.propTimesSection.style.display = (type === 'event')       ? 'block' : 'none';
    el.propPopupSection.style.display = (type === 'popup_label') ? 'block' : 'none';
    if (el.propLineSection) el.propLineSection.style.display = (type === 'line') ? 'block' : 'none';
    if (el.propPosesionSection) el.propPosesionSection.style.display = (type === 'possession') ? 'block' : 'none';
    // Lead y Lag aplican tanto en modo fijo como manual → siempre visibles para tipo 'event'
    if (el.fixedTimesSubSection) {
        el.fixedTimesSubSection.style.display = (type === 'event') ? 'block' : 'none';
    }
}

function updateSelected() {
    if (!state.selectedId) return;
    const e = state.elements.find(e => e.id === state.selectedId);
    e.name   = el.propName.value;
    e.type   = el.propType.value;
    e.color  = el.propColor.value;
    
    if (el.propTimeMode)  e.timeMode = el.propTimeMode.value;
    if (el.propLineExclusive) e.lineExclusive = el.propLineExclusive.checked;

    e.lead   = parseInt(el.propLead.value)  || 0;
    e.lag    = parseInt(el.propLag.value)   || 1;
    
    if (e.type === 'popup_label' && el.propPopupDescriptors) {
        e.popups = el.propPopupDescriptors.value.split(',').map(s=>s.trim()).filter(s=>s);
    } else if (e.type === 'event' && el.propDescriptors) {
        e.popups = el.propDescriptors.value.split(',').map(s=>s.trim()).filter(s=>s);
    }
    if (e.type === 'event' && el.propEquipoEvento && !hojaDe(e)) {
        e.equipo = el.propEquipoEvento.value || null;
    }
    if (e.type === 'possession' && el.propEquipoA && el.propEquipoB) {
        e.equipoA = el.propEquipoA.value.trim() || 'Local';
        e.equipoB = el.propEquipoB.value.trim() || 'Visitante';
    }
    if (e.type === 'event' && el.propSubPlantilla && !hojaDe(e)) {
        const v = el.propSubPlantilla.value;
        e.subHojaId      = v.startsWith('h:') ? v.slice(2) : null;
        e.subPlantillaId = v.startsWith('t:') ? v.slice(2) : null;
    }
    
    syncSections(e.type);
    saveData(); renderElements();
}

function startLinking() {
    if (!state.selectedId) return;
    state.isLinking = true; state.linkStartId = state.selectedId;
    posicionarAccionesFlotantes();   // mientras enlazás, el flotante estorba: se va
    customAlert('Tocá otro elemento para crear el enlace.', 'Crear Enlace');
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderAll() { renderElements(); renderLinks(); }

// renderElements() vacía el lienzo y lo reconstruye. Durante un gesto táctil
// eso es fatal: iOS sigue mandando los touchmove al nodo original, y si ese
// nodo ya no está en el documento los eventos no llegan a document y el
// arrastre se corta. Por eso, mientras se toca, se actualiza en el lugar.
function updateSelectionClasses() {
    el.canvas.querySelectorAll('.canvas-element[data-id]').forEach(nodo => {
        const id = parseInt(nodo.dataset.id);
        nodo.classList.toggle('selected', id === state.selectedId);
    });
    posicionarAccionesFlotantes();
}

function updateElementPositions() {
    state.elements.forEach(e => {
        const nodo = el.canvas.querySelector('.canvas-element[data-id="' + e.id + '"]');
        if (!nodo) return;
        nodo.style.left   = e.x + 'px';
        nodo.style.top    = e.y + 'px';
        nodo.style.width  = e.w + 'px';
        nodo.style.height = e.h + 'px';
    });
    posicionarAccionesFlotantes();   // que acompañe al botón mientras lo arrastrás
}

// "Duplicar" y "Eliminar" flotando arriba del elemento seleccionado, donde
// está el dedo. Son el único lugar de la pantalla con estas acciones para una
// multi-selección (el Inspector se oculta con varios), así que aparecen en
// todos los tipos de elemento: si no, un grupo de contadores no se podría
// borrar. Van sueltos en el lienzo y no adentro del botón: .canvas-element
// tiene overflow: hidden y los cortaría.
function posicionarAccionesFlotantes() {
    const viejo = el.canvas.querySelector('.acciones-flotantes');
    const e = (state.mode === 'setup' && !state.isLinking && state.selectedId)
        ? state.elements.find(x => x.id === state.selectedId)
        : null;
    if (!e) {
        if (viejo) viejo.remove();
        return;
    }

    const barra = viejo || crearAccionesFlotantes();
    const n = state.selectedIds.length;
    // Con varios seleccionados, los dos actúan sobre todos: que se lea.
    barra.querySelector('.af-duplicar').textContent = n > 1 ? `Duplicar (${n})` : 'Duplicar';
    barra.querySelector('.af-eliminar').textContent = n > 1 ? `Eliminar (${n})` : 'Eliminar';

    // Con el lienzo achicado, la barrita se achicaría con él y quedaría chica
    // para un dedo: se contraescala. Por eso las distancias van divididas por
    // la escala: están pensadas en píxeles de pantalla.
    const k = escalaLienzo;
    const alto = barra.offsetHeight;
    // Pegado arriba. Contra el borde de arriba del lienzo va abajo: arriba
    // quedaría afuera y no se podría tocar.
    const arriba = e.y >= (alto + 14) / k;
    barra.style.transformOrigin = arriba ? 'center bottom' : 'center top';
    barra.style.transform = `translateX(-50%) scale(${1 / k})`;
    barra.style.top = (arriba ? e.y - 10 / k - alto : e.y + e.h + 10 / k) + 'px';
    // Centrado sobre el botón, pero sin salirse por la izquierda: con un botón
    // pegado al borde, media barra quedaría cortada.
    barra.style.left = Math.max(e.x + e.w / 2, (barra.offsetWidth / 2 + 4) / k) + 'px';
}

function crearAccionesFlotantes() {
    const barra = document.createElement('div');
    barra.className = 'acciones-flotantes';
    barra.innerHTML = '<button type="button" class="af-duplicar">Duplicar</button>' +
                      '<button type="button" class="af-eliminar">Eliminar</button>';
    barra.querySelector('.af-duplicar').addEventListener('click', ev => { ev.stopPropagation(); duplicateSelected(); });
    barra.querySelector('.af-eliminar').addEventListener('click', ev => { ev.stopPropagation(); deleteSelected(); });
    el.canvas.appendChild(barra);
    return barra;
}

function defaultColor(type) {
    return { event:'#3a8fd6', popup_label:'#f8d022', descriptor:'#fef08a', counter:null, container:null, line:'#4c51bf' }[type] || '#3a8fd6';
}
function brightness(hex) {
    hex = hex.replace('#','');
    if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
    return (r*299+g*587+b*114)/1000;
}

// ─────────────────────────────────────────────
// AJUSTAR A LA PANTALLA
// Una botonera armada en la compu no entra en el iPad: lo de la derecha y lo
// de abajo quedaba afuera, y había que desplazarse en pleno partido. Con esto
// el panel entero se achica para caber, con la misma disposición.
// Las coordenadas guardadas no cambian nunca: la escala es solo cómo se ve.
// Así la misma plantilla sirve igual en la compu y en el iPad.
// ─────────────────────────────────────────────
let escalaLienzo = 1;

const ajustarActivo = () => lsGet('tv_ajustar') !== '0';

// Cuánto hay que achicar para que entre todo. null si el lienzo no está a la
// vista (otra página): ahí no se puede medir, y se recalcula al volver.
function escalaParaEntrar() {
    // Solo lo que está en pantalla: cada pestaña se ajusta por su cuenta.
    const lista = elementosEnPantalla();
    if (!lista.length) return 1;
    // El Inspector se abre y se cierra al tocar botones: si restara ancho, el
    // panel cambiaría de tamaño cada vez que seleccionás algo.
    const inspector = (state.mode === 'setup' && !el.inspectorPanel.classList.contains('hidden'))
        ? el.inspectorPanel.offsetWidth : 0;
    const ancho = el.canvasContainer.clientWidth + inspector;
    const alto  = el.canvasContainer.clientHeight;
    if (!ancho || !alto) return null;

    const MARGEN = 24;
    const derecha = Math.max(...lista.map(e => e.x + e.w)) + MARGEN;
    const abajo   = Math.max(...lista.map(e => e.y + e.h)) + MARGEN;
    // Solo achica: donde ya entra, se ve a tamaño real. Y con piso, para que
    // un panel enorme no deje botones imposibles de tocar.
    return Math.max(0.35, Math.min(1, ancho / derecha, alto / abajo));
}

function aplicarEscalaLienzo() {
    const necesaria = escalaParaEntrar();
    if (necesaria === null) return;
    escalaLienzo = ajustarActivo() ? necesaria : 1;

    // Flechas y botones con la misma escala y el mismo origen, o los enlaces
    // dejarían de apuntar a sus botones.
    [el.canvas, el.svgArrows].forEach(nodo => {
        nodo.style.transformOrigin = '0 0';
        nodo.style.transform = escalaLienzo === 1 ? '' : `scale(${escalaLienzo})`;
    });

    if (el.btnAjustar) {
        // Si el panel ya entra, el botón no haría nada: mejor no mostrarlo.
        el.btnAjustar.classList.toggle('hidden', necesaria >= 1);
        el.btnAjustar.textContent = ajustarActivo() ? 'Tamaño real' : 'Ajustar a pantalla';
    }
}

function alternarAjuste() {
    lsSet('tv_ajustar', ajustarActivo() ? '0' : '1');
    aplicarEscalaLienzo();
    posicionarAccionesFlotantes();
}

function reajustarLienzo() {
    aplicarEscalaLienzo();
    posicionarAccionesFlotantes();
    mostrarBarraDetalle();   // girar el iPad cambia el centro del lienzo
}

function renderElements() {
    aplicarEscalaLienzo();
    el.canvas.innerHTML = '';

    // Solo la pestaña a la vista: en vivo la Principal (o el detalle abierto),
    // en el editor la pestaña elegida.
    const enDetalle = state.mode === 'live' && !!state.detalle;
    const fuente = elementosEnPantalla();

    const containers = fuente.filter(e => e.type === 'container');
    const others     = fuente.filter(e => e.type !== 'container');

    // En el detalle se ve todo: cada botón es una opción para elegir.
    const visible = (state.mode === 'live' && !enDetalle)
        ? others.filter(e => e.type !== 'popup_label' || state.activePopupElementIds.includes(e.id))
        : others;

    // En el detalle no se marca nada como grabando: los ids de otra plantilla
    // pueden coincidir con los de la principal y se encenderían sin motivo.
    const openButtonIds = enDetalle ? [] : (state.openEvents || []).map(o => o.buttonId);
    const isLineActive = e => e.type === 'line'
        && (e.lineMemberIds || []).length > 0
        && (e.lineMemberIds || []).every(id => openButtonIds.includes(id));

    [...containers, ...visible].forEach((e) => {
        const isContainer = e.type === 'container';
        const isRecording = state.mode === 'live' && openButtonIds.includes(e.id);

        const div = document.createElement('div');
        const lineOn = state.mode === 'live' && isLineActive(e);
        div.className = `canvas-element mode-${state.mode}${e.id === state.selectedId ? ' selected' : ''}${isContainer ? ' is-container' : ''}${isRecording ? ' is-recording' : ''}${lineOn ? ' is-line-active' : ''}`;
        div.dataset.eltype = e.type;
        div.dataset.id     = e.id;
        // Evento que suma posesión: franja del color de su equipo.
        if (e.type === 'event' && (e.equipo === 'A' || e.equipo === 'B')) div.classList.add('equipo-' + e.equipo);
        div.style.left   = e.x + 'px';
        div.style.top    = e.y + 'px';
        div.style.width  = e.w + 'px';
        div.style.height = e.h + 'px';
        div.style.zIndex = isContainer ? 1 : 10;

        if (e.color && e.color !== defaultColor(e.type)) {
            div.style.setProperty('--btn-color', e.color);
            div.classList.add('has-color');
            div.style.color = brightness(e.color) > 150 ? '#000' : '#fff';
        }

        if (isContainer) {
            div.innerHTML = '';
        } else if (enDetalle) {
            // En el detalle solo importa el nombre: es lo que se va a etiquetar.
            div.innerHTML = `<span>${e.name}</span>`;
            // Con varias etiquetas por elegir, las ya tocadas quedan marcadas.
            if (state.detalle.elegidas.includes(e.name)) div.classList.add('elegida');
        } else if (e.type === 'possession') {
            // Partido en dos: cada mitad es un equipo. En vivo muestra su %, y
            // la mitad del equipo que tiene la pelota se enciende.
            const activo = state.mode === 'live' ? equipoConPelota() : null;
            const lado = (eq, nombre) =>
                `<div class="pos-lado pos-${eq}${activo === eq ? ' activo' : ''}" data-equipo="${eq}">` +
                    `<span class="pos-nombre">${nombre}</span>` +
                    (state.mode === 'live' ? `<span class="pos-pct" data-pos-for="${e.id}" data-equipo="${eq}" data-campo="pct"></span>` : '') +
                `</div>`;
            div.innerHTML = lado('A', e.equipoA || 'Local') + lado('B', e.equipoB || 'Visitante');
        } else if (state.mode === 'live' && e.type === 'counter') {
            div.innerHTML = `<span>${state.counters[e.id] || 0}</span>`;
        } else if (state.mode === 'live' && e.type === 'event') {
            // Nombre + reloj del turno en curso + acumulado de tiempo en hielo
            div.innerHTML = `<span class="el-name">${e.name}</span>`
                          + `<span class="shift-clock" data-clock-for="${e.id}"></span>`
                          + `<span class="toi-total" data-toi-for="${e.id}"></span>`;
        } else if (e.type === 'line') {
            div.innerHTML = `<span class="el-name">${e.name}</span>`
                          + `<span class="line-sub">${(e.lineMemberIds || []).length} jug.</span>`;
        } else if (state.mode === 'setup' && e.type === 'event' && plantillaDeDetalle(e)) {
            // Marca en el editor: este evento abre otra plantilla en vivo.
            div.innerHTML = `<span class="el-name">${e.name}</span>`
                          + `<span class="line-sub">↗ ${plantillaDeDetalle(e).name}</span>`;
        } else {
            div.innerHTML = `<span>${e.name}</span>`;
        }

        if (state.mode === 'setup') {
            ['se','e','s'].forEach(dir => {
                const h = document.createElement('div');
                h.className = `resize-handle resize-${dir}`;
                h.dataset.dir = dir;
                div.appendChild(h);
            });
        }

        if (state.mode === 'live' && !isContainer) {
            if (enDetalle) {
                div.addEventListener('click', () => tocarEnDetalle(e.name));
            } else if (e.type === 'possession') {
                div.addEventListener('click', ev => {
                    const lado = ev.target.closest('.pos-lado');
                    if (lado) tocarPosesion(e, lado.dataset.equipo);
                });
            } else if (e.type === 'popup_label') {
                div.addEventListener('click', () => handlePopupLabelClick(e.name));
            } else if (e.type === 'line') {
                div.addEventListener('click', () => handleLineClick(e));
            } else {
                div.addEventListener('click', () => handleLiveClick(e));
            }
        }

        el.canvas.appendChild(div);
    });

    // Renderizar botones temporales dinámicos creados para eventos con popups directos en Live Mode
    if (state.mode === 'live' && state.tempPopupButtons.length > 0) {
        state.tempPopupButtons.forEach(btnInfo => {
            const div = document.createElement('div');
            div.className = `canvas-element mode-live animate-pop`;
            div.dataset.eltype = 'popup_label';
            div.style.left   = btnInfo.x + 'px';
            div.style.top    = btnInfo.y + 'px';
            div.style.width  = btnInfo.w + 'px';
            div.style.height = btnInfo.h + 'px';
            div.style.zIndex = 20;
            div.innerHTML = `<span>${btnInfo.name}</span>`;
            div.addEventListener('click', () => handlePopupLabelClick(btnInfo.name));
            el.canvas.appendChild(div);
        });
    }

    posicionarAccionesFlotantes();   // innerHTML = '' se lo llevó: se vuelve a poner
    updateLiveClocks();
}

function centerOf(id) {
    const e = state.elements.find(e => e.id === id);
    return e ? { x: e.x+e.w/2, y: e.y+e.h/2 } : { x:0, y:0 };
}

function renderLinks() {
    el.svgArrows.querySelectorAll('path, circle').forEach(n => n.remove());
    if (state.mode !== 'setup') return;

    // Solo los enlaces entre botones de la pestaña a la vista. Las pestañas
    // comparten las coordenadas del lienzo: sin este filtro, al abrir una
    // pestaña quedaban dibujadas encima las flechas de la Principal.
    const aLaVista = new Set(elementosEnPantalla().map(e => e.id));
    state.links.forEach(lnk => {
        if (!aLaVista.has(lnk.fromId) || !aLaVista.has(lnk.toId)) return;
        const p1 = centerOf(lnk.fromId), p2 = centerOf(lnk.toId);
        if (p1.x || p2.x) drawArrow(p1, p2, false, lnk.id);
    });
    if (state.isLinking && state.linkStartId) {
        drawArrow(centerOf(state.linkStartId), state.mousePosCanvas, true);
    }
}

function drawArrow(p1, p2, isTemp, id) {
    const ang = Math.atan2(p2.y-p1.y, p2.x-p1.x);
    const s  = { x: p1.x+Math.cos(ang)*22, y: p1.y+Math.sin(ang)*22 };
    const e2 = { x: p2.x-Math.cos(ang)*24, y: p2.y-Math.sin(ang)*24 };
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', `M ${s.x} ${s.y} L ${e2.x} ${e2.y}`);
    path.setAttribute('class', `link-arrow${isTemp?' is-temp':''}`);
    if (id) path.dataset.id = id;
    el.svgArrows.appendChild(path);
    if (!isTemp) {
        const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
        c.setAttribute('cx',s.x); c.setAttribute('cy',s.y); c.setAttribute('r',4);
        c.setAttribute('fill','white'); c.setAttribute('stroke','#34c759'); c.setAttribute('stroke-width','2');
        el.svgArrows.appendChild(c);
    }
}

// ─────────────────────────────────────────────
// CONTAINER HELPERS
// ─────────────────────────────────────────────
function getContainerSiblingPopups(eventEl) {
    // Se busca por posición: sin limitar a la pestaña del evento, un contenedor
    // de otra pestaña en el mismo lugar le sumaría emergentes ajenas.
    const mismos = elementosDeHoja(hojaDe(eventEl));
    const containers = mismos.filter(c => c.type === 'container');
    const results = [];
    for (const cont of containers) {
        const inside = mismos.filter(e =>
            e.id !== cont.id &&
            e.x >= cont.x && e.y >= cont.y &&
            e.x + e.w <= cont.x + cont.w &&
            e.y + e.h <= cont.y + cont.h
        );
        const hasEvent = inside.some(e => e.id === eventEl.id);
        if (hasEvent) {
            inside.filter(e => e.type === 'popup_label')
                  .forEach(pl => results.push(pl));
        }
    }
    return results;
}

// ─────────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────────
function toggleTimer() { state.isPlaying ? pauseTimer() : startTimer(); }
function startTimer() {
    acquireWakeLock();
    if (!state.sessionStartedAt) state.sessionStartedAt = new Date();
    state.isPlaying = true; state.lastTick = Date.now();
    state.timerInterval = setInterval(tick, 100);
    el.btnPlayPause.textContent = '⏸ PAUSE';
    el.btnPlayPause.classList.replace('bg-[#2ca038]','bg-gray-500');
}
function pauseTimer() {
    releaseWakeLock();
    state.isPlaying = false; clearInterval(state.timerInterval);
    el.btnPlayPause.textContent = '▶ PLAY';
    el.btnPlayPause.classList.replace('bg-gray-500','bg-[#2ca038]');
}
function tick() {
    const now = Date.now(); state.time += (now - state.lastTick)/1000; state.lastTick = now;
    updateTimerUI();
    updateLiveClocks();
}
function fmt(s) {
    const m = Math.floor(s/60), ss = Math.floor(s%60);
    return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function updateTimerUI() {
    const t = fmt(state.time);
    el.timerDisplay.textContent = t;
    el.timerLive.textContent    = t;
}

// ─────────────────────────────────────────────
// TIME ON ICE — TURNOS (SHIFTS)
// ─────────────────────────────────────────────
let _evSeq = 0;

// Largo total de una lista de tramos [inicio, fin], contando UNA sola vez lo
// que se superpone. Antes cada clip sumaba su duración entera, y lo marcado al
// mismo tiempo se contaba doble: dos toques seguidos de un evento de tiempo
// fijo se pisan por el tiempo previo y posterior, y el posterior de un turno
// se pisa con el previo del siguiente. Tramos que se tocan quedan como uno.
function unirTramos(tramos) {
    const ordenados = tramos
        .map(([a, b]) => [Math.max(0, a), b])
        .filter(([a, b]) => b > a)
        .sort((x, y) => x[0] - y[0]);
    let total = 0, cantidad = 0, ini = null, fin = null;
    ordenados.forEach(([a, b]) => {
        if (ini === null || a > fin) {
            if (ini !== null) { total += fin - ini; cantidad++; }
            ini = a;
            fin = b;
        } else if (b > fin) {
            fin = b;
        }
    });
    if (ini !== null) { total += fin - ini; cantidad++; }
    return { total: total, cantidad: cantidad };
}

// Tiempo de un botón: sus clips archivados más el que esté abierto, unidos.
// Los clips de posesión quedan afuera: tienen su propia cuenta por equipo.
function tiempoEnHielo(buttonId) {
    const tramos = state.events
        .filter(ev => ev.buttonId === buttonId && !ev.posesionDe && ev.end != null)
        .map(ev => [ev.start, ev.end]);
    (state.openEvents || []).forEach(o => {
        if (o.buttonId === buttonId) tramos.push([o.start, state.time]);
    });
    return unirTramos(tramos);
}

// Para guardar con la sesión: el tiempo por botón, ya unido.
function toiCalculado() {
    const mapa = {};
    state.elements.filter(e => e.type === 'event').forEach(e => {
        const t = tiempoEnHielo(e.id).total;
        if (t > 0) mapa[e.id] = t;
    });
    return mapa;
}

// Crea la instancia de evento a partir de un botón del lienzo
function makeEventInstance(e) {
    const isManual = (e.timeMode === 'manual');
    return {
        id: Date.now() + (++_evSeq),
        buttonId: e.id,
        name: e.name,
        start: Math.max(0, state.time - (e.lead || 0)),
        end: isManual ? null : (state.time + (e.lag || 1)),
        timestamp: fmt(state.time),
        lead: e.lead || 0,
        lag: e.lag || 0,
        exclusiveIds: e.exclusiveIds || [],
        isExclusive: !!e.isExclusive,
        timeMode: e.timeMode || 'fixed',
        line: null,
        descriptors: []
    };
}

// Cierra el turno abierto en la posición `index`, lo archiva y suma su ToI.
// `noLag` corta exactamente en el tiempo actual (al salir del modo live).
function closeOpenEventAt(index, noLag) {
    const openEv = state.openEvents[index];
    if (!openEv) return null;

    openEv.end = noLag ? state.time : state.time + (openEv.lag || 0);
    // Un evento se archiva y se cuenta una sola vez, lo cierre quien lo cierre.
    if (!state.events.some(e => e.id === openEv.id)) {
        state.events.unshift(openEv);
        state.counters[openEv.buttonId] = (state.counters[openEv.buttonId] || 0) + 1;

        // Disparar contadores enlazados
        state.links.filter(l => l.fromId === openEv.buttonId).forEach(l => {
            const target = state.elements.find(el => el.id === l.toId);
            if (target && target.type === 'counter') {
                state.counters[target.id] = (state.counters[target.id] || 0) + 1;
            }
        });
    }

    state.openEvents.splice(index, 1);
    return openEv;
}

// Abre el turno de un jugador (idempotente)
function openShift(playerEl, lineName) {
    if (state.openEvents.some(o => o.buttonId === playerEl.id)) return;
    const ev = makeEventInstance(playerEl);
    ev.end = null;               // un turno siempre se cierra a mano o por la línea
    ev.timeMode = 'manual';
    ev.line = lineName || null;
    state.openEvents.push(ev);
}

// Toque en un botón de LÍNEA: abre o cierra el turno de todos sus jugadores
function handleLineClick(lineEl) {
    if (!state.isPlaying) startTimer();

    const memberIds = lineEl.lineMemberIds || [];
    const members = memberIds.map(id => state.elements.find(e => e.id === id)).filter(Boolean);
    if (!members.length) {
        customAlert('Esta línea no tiene jugadores asignados. Abrí el Inspector y seleccioná los suyos.', 'Línea vacía');
        return;
    }

    const openIds = state.openEvents.map(o => o.buttonId);
    const anyOpen = members.some(m => openIds.includes(m.id));

    if (anyOpen) {
        // Segundo toque → baja la línea entera
        for (let i = state.openEvents.length - 1; i >= 0; i--) {
            if (memberIds.includes(state.openEvents[i].buttonId)) closeOpenEventAt(i);
        }
    } else {
        // Cambio de línea: bajar las otras líneas primero
        if (lineEl.lineExclusive !== false) {
            const otras = new Set();
            state.elements
                .filter(x => x.type === 'line' && x.id !== lineEl.id)
                .forEach(ol => (ol.lineMemberIds || []).forEach(id => otras.add(id)));
            for (let i = state.openEvents.length - 1; i >= 0; i--) {
                const bid = state.openEvents[i].buttonId;
                // Un jugador que también está en la línea entrante NO baja (doble turno)
                if (otras.has(bid) && !memberIds.includes(bid)) closeOpenEventAt(i);
            }
        }
        members.forEach(m => openShift(m, lineEl.name));
    }

    renderLivePanel();
    renderElements();
}

// Refresca relojes y acumulados sin volver a construir el DOM
function updateLiveClocks() {
    if (state.mode !== 'live') return;

    const openMap = {};
    (state.openEvents || []).forEach(o => { openMap[o.buttonId] = o; });
    const liveOf = id => openMap[id] ? Math.max(0, state.time - openMap[id].start) : 0;

    document.querySelectorAll('[data-clock-for]').forEach(node => {
        const id = parseInt(node.dataset.clockFor);
        node.textContent = openMap[id] ? fmt(liveOf(id)) : '';
    });
    // Tiempo en hielo con los tramos unidos, calculado una vez por botón por tick.
    const hieloDe = {};
    const hielo = id => hieloDe[id] || (hieloDe[id] = tiempoEnHielo(id));
    document.querySelectorAll('[data-toi-for]').forEach(node => {
        const total = hielo(parseInt(node.dataset.toiFor)).total;
        node.textContent = total > 0 ? 'Σ ' + fmt(total) : '';
    });
    document.querySelectorAll('[data-toirow-for]').forEach(node => {
        node.textContent = fmt(hielo(parseInt(node.dataset.toirowFor)).total);
    });

    // Posesión: el % y los tiempos corren con el reloj, sin redibujar nada.
    // Es un reparto único de toda la botonera: se calcula una vez por tick.
    let tPos = null;
    const tiempos = () => tPos || (tPos = tiemposPosesion());
    const lados = document.querySelectorAll('.pos-lado');
    if (lados.length) {
        // La mitad del equipo con la pelota se enciende, también cuando la
        // posesión viene de los eventos y no de tocar el botón.
        const conPelota = equipoConPelota();
        lados.forEach(n => n.classList.toggle('activo', n.dataset.equipo === conPelota));
    }
    document.querySelectorAll('[data-pos-for]').forEach(node => {
        const t = tiempos();
        const eq = node.dataset.equipo;
        if (node.dataset.campo === 'tiempo') {
            node.textContent = fmt(t[eq]);
        } else if (node.dataset.campo === 'barra') {
            node.style.width = (t.pctA === null ? 50 : t.pctA) + '%';
        } else {
            const pct = eq === 'A' ? t.pctA : t.pctB;
            node.textContent = pct === null ? '–' : pct + '%';
        }
    });
}

// ─────────────────────────────────────────────
// LIVE CLICK (MANUAL TOGGLE / EXCLUYENTES / POPUPS)
// ─────────────────────────────────────────────
function handleLiveClick(e) {
    if (!state.isPlaying) startTimer();

    if (e.type === 'event') {
        const existingOpenIndex = (state.openEvents || []).findIndex(o => o.buttonId === e.id);

        // CASO A: El evento ya está abierto grabando en modo manual → 2do toque lo CORTA
        if (existingOpenIndex !== -1) {
            closeOpenEventAt(existingOpenIndex);

            // Limpiar popups activos
            state.activePopupElementIds = [];
            state.tempPopupButtons = [];
            state.pendingEvent = null;

            renderLivePanel();
            renderElements();
            return;
        }

        // CASO B: Primer toque (iniciar evento)
        // 1. Manejo de EXCLUSIVIDAD ESPECÍFICA POR EVENTOS: Cortar eventos si sus IDs están seleccionados como excluyentes
        if (state.openEvents && state.openEvents.length > 0) {
            for (let i = state.openEvents.length - 1; i >= 0; i--) {
                const openEv = state.openEvents[i];
                const isExclusiveToThis =
                    (e.exclusiveIds && e.exclusiveIds.includes(openEv.buttonId)) ||
                    (openEv.exclusiveIds && openEv.exclusiveIds.includes(e.id)) ||
                    e.isExclusive || openEv.isExclusive;

                if (isExclusiveToThis) closeOpenEventAt(i);
            }
        }

        // 2. Crear nueva instancia de evento
        const isManual = (e.timeMode === 'manual');
        const newEv = makeEventInstance(e);

        state.pendingEvent = newEv;

        // Reset visible popups
        state.activePopupElementIds = [];
        state.tempPopupButtons = [];

        // 1. Popup labels en el mismo contenedor
        const containerPopups = getContainerSiblingPopups(e);
        containerPopups.forEach(pl => state.activePopupElementIds.push(pl.id));

        // 2. Popup labels enlazados con flecha
        state.links
            .filter(l => l.fromId === e.id)
            .map(l => state.elements.find(el => el.id === l.toId))
            .filter(el => el && el.type === 'popup_label')
            .forEach(pl => {
                if (!state.activePopupElementIds.includes(pl.id)) {
                    state.activePopupElementIds.push(pl.id);
                }
            });

        // 3. Etiquetas emergentes definidas directo en el evento (botones emergentes en pantalla)
        if (e.popups && e.popups.length > 0) {
            e.popups.forEach((labelName, idx) => {
                state.tempPopupButtons.push({
                    name: labelName,
                    x: e.x + (idx * (DEFAULT_W + 10)),
                    y: e.y + e.h + 12,
                    w: DEFAULT_W,
                    h: DEFAULT_H
                });
            });
        }

        // 4. Plantilla de detalle: si el evento tiene una asignada, se abre en
        //    lugar de las emergentes, y lo que se toque ahí va como etiqueta.
        const detalle = plantillaDeDetalle(e);
        if (detalle) {
            state.activePopupElementIds = [];
            state.tempPopupButtons = [];
            abrirDetalle(e, detalle);
        }

        if (isManual) {
            // Guardar en eventos abiertos activos
            state.openEvents.push(newEv);
            renderLivePanel();
            renderElements();
        } else {
            // Tiempo fijo sin nada que elegir → finalizar de inmediato. Con
            // plantilla de detalle NO: el evento espera la etiqueta, y si se
            // cerrara acá, lo que tocás en el detalle no tendría a qué pegarse.
            if (!detalle && state.activePopupElementIds.length === 0 && state.tempPopupButtons.length === 0) {
                finalizeEvent();
            } else {
                renderElements();
            }
        }

    } else if (e.type === 'descriptor') {
        // Asignar a evento pendiente o al último registrado / abierto
        if (state.pendingEvent) {
            if (!state.pendingEvent.descriptors.includes(e.name)) state.pendingEvent.descriptors.push(e.name);
        } else if (state.openEvents && state.openEvents.length > 0) {
            const lastOpen = state.openEvents[state.openEvents.length - 1];
            if (!lastOpen.descriptors.includes(e.name)) lastOpen.descriptors.push(e.name);
        } else if (state.events.length > 0) {
            const last = state.events[0];
            if (!last.descriptors.includes(e.name)) last.descriptors.push(e.name);
        }
        renderLivePanel();

    } else if (e.type === 'counter') {
        state.counters[e.id] = (state.counters[e.id]||0) + 1;
        renderElements();
    }
}

// Al hacer clic en una Etiqueta Emergente visible en pantalla
function handlePopupLabelClick(labelName) {
    if (state.pendingEvent) {
        if (!state.pendingEvent.descriptors.includes(labelName)) {
            state.pendingEvent.descriptors.push(labelName);
        }
        if (state.pendingEvent.timeMode !== 'manual') {
            finalizeEvent();
        } else {
            state.activePopupElementIds = [];
            state.tempPopupButtons = [];
            renderLivePanel();
            renderElements();
        }
    } else if (state.openEvents && state.openEvents.length > 0) {
        const lastOpen = state.openEvents[state.openEvents.length - 1];
        if (!lastOpen.descriptors.includes(labelName)) {
            lastOpen.descriptors.push(labelName);
        }
        state.activePopupElementIds = [];
        state.tempPopupButtons = [];
        renderLivePanel();
        renderElements();
    } else if (state.events.length > 0) {
        const last = state.events[0];
        if (!last.descriptors.includes(labelName)) {
            last.descriptors.push(labelName);
        }
        state.activePopupElementIds = [];
        state.tempPopupButtons = [];
        renderLivePanel();
        renderElements();
    }
}

function finalizeEvent() {
    const ev = state.pendingEvent;
    if (!ev) return;
    // Un evento manual sigue grabando en openEvents y lo archiva
    // closeOpenEventAt cuando se corta. Si además se archivara acá, quedaría
    // dos veces: dos clips en el XML y el contador sumando 2 por un toque.
    // Y uno ya archivado no se vuelve a agregar a la lista.
    const sigueAbierto = (state.openEvents || []).includes(ev);
    const isNew = !sigueAbierto && !state.events.some(e => e.id === ev.id);
    if (isNew) {
        state.events.unshift(ev);
        state.counters[ev.buttonId] = (state.counters[ev.buttonId]||0)+1;
        state.links.filter(l => l.fromId === ev.buttonId).forEach(l => {
            const t = state.elements.find(e => e.id === l.toId);
            if (t && t.type === 'counter') state.counters[t.id] = (state.counters[t.id]||0)+1;
        });
    }
    state.pendingEvent = null;
    state.activePopupElementIds = [];
    state.tempPopupButtons = [];
    renderLivePanel();
    renderElements();
}

// ─────────────────────────────────────────────
// PESTAÑAS
// Una botonera puede tener pestañas de detalle adentro: "Principal" más, por
// ejemplo, "Detalle tiro". Todo vive en la misma lista de botones, y cada uno
// sabe a qué pestaña pertenece (sin pestaña = Principal). Así una sola
// plantilla guarda, sube a la nube y trae la botonera entera.
// ─────────────────────────────────────────────
const hojaDe = e => e.hoja || null;

function elementosDeHoja(hojaId) {
    return state.elements.filter(e => hojaDe(e) === (hojaId || null));
}

// Lo que se ve en el lienzo ahora mismo. Todo lo que dibuja, mide o selecciona
// pasa por acá: con las pestañas en una sola lista, recorrer state.elements
// entero mezclaría botones de pestañas distintas.
function elementosEnPantalla() {
    if (state.mode === 'live') return state.detalle ? state.detalle.elements : elementosDeHoja(null);
    return elementosDeHoja(state.hojaActiva);
}

async function insertarHoja() {
    closeInsertMenu();
    // Con un evento de la Principal seleccionado, la pestaña nace conectada a
    // él: es lo que se quiere casi siempre, y ahorra ir al Inspector.
    const sel = (state.selectedId && state.selectedIds.length <= 1)
        ? state.elements.find(e => e.id === state.selectedId) : null;
    const evento = (sel && sel.type === 'event' && !hojaDe(sel)) ? sel : null;

    const nombre = await customPrompt('Nombre de la pestaña:',
        evento ? `Detalle ${evento.name}` : `Pestaña ${state.hojas.length + 1}`, 'Pestaña nueva');
    if (!nombre || !nombre.trim()) return;

    const hoja = { id: 'h' + Date.now(), name: nombre.trim(), etiquetas: 1 };
    state.hojas.push(hoja);
    if (evento) {
        evento.subHojaId = hoja.id;
        evento.subPlantillaId = null;
    }
    saveData();
    cambiarHoja(hoja.id);
}

function cambiarHoja(hojaId) {
    state.hojaActiva = hojaId || null;
    state.isLinking = false;
    state.linkStartId = null;
    selectElement(null);
    el.canvasContainer.scrollLeft = 0;
    el.canvasContainer.scrollTop  = 0;
    renderAll();
    renderHojasBar();
}

async function renombrarHoja(hojaId) {
    const hoja = state.hojas.find(h => h.id === hojaId);
    if (!hoja) return;
    const nombre = await customPrompt('Nuevo nombre de la pestaña:', hoja.name, 'Renombrar pestaña');
    if (!nombre || !nombre.trim()) return;
    hoja.name = nombre.trim();
    saveData();
    renderAll();        // la marca "↗" de los eventos muestra el nombre
    renderHojasBar();
}

async function eliminarHoja(hoja) {
    const ids = new Set(elementosDeHoja(hoja.id).map(e => e.id));
    const ok = await customConfirm(
        `¿Eliminar la pestaña "${hoja.name}"` + (ids.size ? ` y sus ${ids.size} botones?` : '?') +
        '\n\nLos eventos que la abrían vuelven a funcionar como eventos comunes.',
        'Eliminar pestaña', true);
    if (!ok) return;

    state.elements = state.elements.filter(e => !ids.has(e.id));
    state.links    = state.links.filter(l => !ids.has(l.fromId) && !ids.has(l.toId));
    state.elements.forEach(e => {
        if (e.subHojaId === hoja.id) e.subHojaId = null;
        if (e.exclusiveIds)  e.exclusiveIds  = e.exclusiveIds.filter(id => !ids.has(id));
        if (e.lineMemberIds) e.lineMemberIds = e.lineMemberIds.filter(id => !ids.has(id));
    });
    state.hojas = state.hojas.filter(h => h.id !== hoja.id);
    saveData();
    cambiarHoja(null);
}

// Barra de pestañas del editor. Solo aparece si hay pestañas: una botonera sin
// pestañas se ve exactamente igual que antes.
function renderHojasBar() {
    const barra = el.hojasBar;
    if (!barra) return;
    const visible = state.mode === 'setup' && state.hojas.length > 0;
    barra.classList.toggle('hidden', !visible);
    if (!visible) return;

    barra.innerHTML = '';
    const activa = state.hojaActiva || null;

    const pestana = (id, nombre) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hoja-tab' + (activa === id ? ' activa' : '');
        b.textContent = nombre;
        if (id && activa === id) b.title = 'Tocá de nuevo para renombrar';
        // Tocar la pestaña que ya está abierta la renombra: no hace falta otro botón.
        b.addEventListener('click', () => (id && activa === id) ? renombrarHoja(id) : cambiarHoja(id));
        barra.appendChild(b);
    };

    pestana(null, 'Principal');
    state.hojas.forEach(h => {
        pestana(h.id, h.name);
        if (activa === h.id) {
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'hoja-borrar';
            x.title = 'Eliminar pestaña';
            x.textContent = '✕';
            x.addEventListener('click', () => eliminarHoja(h));
            barra.appendChild(x);

            // Cuántas etiquetas se eligen en esta pestaña antes de volver sola:
            // un "Ingreso al área" puede llevar 2 y un "Tiro" solo 1.
            const cant = document.createElement('select');
            cant.className = 'hoja-etiquetas';
            cant.title = 'Etiquetas a elegir antes de volver';
            [1, 2, 3, 4, 5].forEach(n => {
                const o = document.createElement('option');
                o.value = String(n);
                o.textContent = n === 1 ? 'Elige 1 etiqueta' : `Elige ${n} etiquetas`;
                cant.appendChild(o);
            });
            cant.value = String(h.etiquetas || 1);
            cant.addEventListener('change', () => {
                h.etiquetas = parseInt(cant.value) || 1;
                saveData();
            });
            barra.appendChild(cant);
        }
    });

    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'hoja-mas';
    mas.textContent = '+ Pestaña';
    mas.addEventListener('click', insertarHoja);
    barra.appendChild(mas);
}

// ─────────────────────────────────────────────
// PLANTILLA DE DETALLE
// Un evento puede abrir otra plantilla al tocarlo en vivo: tocás "Tiro", se
// abre la botonera de detalle, tocás "Al arco", queda como etiqueta del Tiro
// y la pantalla vuelve sola a la principal. Es la idea de las etiquetas
// emergentes, pero con una botonera entera armada a gusto.
// ─────────────────────────────────────────────
// Lo que abre el evento, como { name, elements }: una pestaña de la misma
// botonera o, como en la versión anterior, otra plantilla guardada.
function plantillaDeDetalle(e) {
    if (!e) return null;
    if (e.subHojaId) {
        const hoja = state.hojas.find(h => h.id === e.subHojaId);
        if (hoja) return { name: hoja.name, elements: elementosDeHoja(hoja.id), etiquetas: hoja.etiquetas || 1 };
    }
    if (!e.subPlantillaId) return null;
    // Comparado como texto: los ids son números, pero una copia importada o
    // restaurada podría traerlos como string.
    return getSavedTemplates().find(t => String(t.id) === String(e.subPlantillaId)) || null;
}

function abrirDetalle(eventoEl, plantilla) {
    state.detalle = {
        evento:    eventoEl.name,
        plantilla: plantilla.name,
        elements:  JSON.parse(JSON.stringify(plantilla.elements || [])),
        // Cuántas etiquetas se eligen antes de volver, y cuáles van elegidas.
        max:       Math.max(1, parseInt(plantilla.etiquetas) || 1),
        elegidas:  [],
        // Para volver exactamente adonde estabas mirando en la principal.
        scroll:    { x: el.canvasContainer.scrollLeft, y: el.canvasContainer.scrollTop }
    };
    el.canvasContainer.scrollLeft = 0;
    el.canvasContainer.scrollTop  = 0;
    mostrarBarraDetalle();
}

function salirDeDetalle() {
    const d = state.detalle;
    state.detalle = null;
    mostrarBarraDetalle();
    return d;
}

function volverScroll(d) {
    if (!d) return;
    el.canvasContainer.scrollLeft = d.scroll.x;
    el.canvasContainer.scrollTop  = d.scroll.y;
}

// Botón tocado en la pestaña de detalle. Cada pestaña dice cuántas etiquetas
// se eligen (una por defecto): al llegar a esa cantidad se pegan todas al
// evento y la pantalla vuelve sola. Tocar una ya elegida la desmarca, así un
// toque de más no la cuenta dos veces.
function tocarEnDetalle(nombre) {
    const d = state.detalle;
    if (!d) return;
    const i = d.elegidas.indexOf(nombre);
    if (i >= 0) d.elegidas.splice(i, 1);
    else d.elegidas.push(nombre);

    if (d.elegidas.length >= d.max) {
        terminarDetalle();
        return;
    }
    mostrarBarraDetalle();
    renderElements();
}

// Pega lo elegido al evento y vuelve a la principal. Sin nada elegido es
// "volver sin elegir": el evento de tiempo fijo igual queda registrado, sin
// etiqueta, y el manual sigue grabando.
function terminarDetalle() {
    const d = salirDeDetalle();
    pegarEtiquetas(d ? d.elegidas : []);
    renderLivePanel();
    renderElements();
    volverScroll(d);
}

// El botón de la barra: "Volver sin elegir" o "Listo", según haya elegidas.
function cancelarDetalle() { terminarDetalle(); }

// Mismo destino que las etiquetas emergentes: el evento pendiente (el de
// tiempo fijo se cierra acá), si no el último que está grabando, si no el
// último registrado. Una etiqueta repetida no se agrega dos veces.
function pegarEtiquetas(nombres) {
    const abiertos = state.openEvents || [];
    const destino = state.pendingEvent || abiertos[abiertos.length - 1] || state.events[0];
    if (destino) {
        nombres.forEach(n => { if (!destino.descriptors.includes(n)) destino.descriptors.push(n); });
    }
    if (state.pendingEvent && state.pendingEvent.timeMode !== 'manual') finalizeEvent();
    state.activePopupElementIds = [];
    state.tempPopupButtons = [];
}

// Barra arriba del lienzo con qué se está detallando y la salida. Va fuera del
// lienzo para no achicarse con él cuando se ajusta a la pantalla.
function mostrarBarraDetalle() {
    const zona = el.canvasContainer && el.canvasContainer.parentElement;
    if (!zona) return;
    let barra = zona.querySelector('.barra-detalle');
    if (!state.detalle) {
        if (barra) barra.remove();
        return;
    }
    if (!barra) {
        barra = document.createElement('div');
        barra.className = 'barra-detalle';
        barra.innerHTML = '<span class="bd-texto"></span>' +
                          '<button type="button" class="bd-cancelar">Volver sin elegir</button>';
        barra.querySelector('.bd-cancelar').addEventListener('click', cancelarDetalle);
        zona.appendChild(barra);
    }
    const d = state.detalle;
    barra.querySelector('.bd-texto').textContent = d.evento + ' › ' + d.plantilla +
        (d.max > 1 ? ` · ${d.elegidas.length} de ${d.max}` : '');
    // Con algo elegido se puede terminar antes de completar la cantidad.
    barra.querySelector('.bd-cancelar').textContent = d.elegidas.length ? 'Listo' : 'Volver sin elegir';
    // Centrada sobre el lienzo, no sobre toda la zona: en vivo el panel de
    // registro ocupa la derecha, y centrada en el total le tapaba las pestañas.
    barra.style.left = (el.canvasContainer.offsetLeft + el.canvasContainer.clientWidth / 2) + 'px';
}

// Opciones del Inspector: las plantillas guardadas. Se arma cada vez que
// abrís el Inspector, porque las plantillas cambian (se guardan, se borran,
// llegan de la nube).
function llenarSelectorDetalle(e) {
    const sel = el.propSubPlantilla;
    if (!sel) return;
    // Un botón que ya vive dentro de una pestaña no abre otra: no se encadenan.
    if (el.propDetalleSection) el.propDetalleSection.style.display = hojaDe(e) ? 'none' : '';

    sel.innerHTML = '';
    const opcion = (padre, valor, texto) => {
        const o = document.createElement('option');
        o.value = valor;
        o.textContent = texto;
        padre.appendChild(o);
    };
    opcion(sel, '', 'Ninguna');
    // Prefijos h: / t: porque una pestaña y una plantilla podrían compartir id.
    if (state.hojas.length) {
        const g = document.createElement('optgroup');
        g.label = 'Pestañas de esta botonera';
        state.hojas.forEach(h => opcion(g, 'h:' + h.id, h.name));
        sel.appendChild(g);
    }
    const plantillas = getSavedTemplates();
    if (plantillas.length) {
        const g = document.createElement('optgroup');
        g.label = 'Otras plantillas';
        plantillas.forEach(t => opcion(g, 't:' + t.id, t.name));
        sel.appendChild(g);
    }
    const actual = e.subHojaId ? 'h:' + e.subHojaId
                 : e.subPlantillaId ? 't:' + e.subPlantillaId : '';
    // Si lo asignado se borró, se muestra Ninguna en vez de inventarlo.
    sel.value = [...sel.options].some(o => o.value === actual) ? actual : '';
}

// ─────────────────────────────────────────────
// PANEL LIVE: REGISTRO / TIEMPO EN HIELO
// ─────────────────────────────────────────────
function setLiveTab(tab) {
    state.liveTab = tab;
    if (el.tabLog) el.tabLog.classList.toggle('seg-active', tab === 'log');
    if (el.tabToi) el.tabToi.classList.toggle('seg-active', tab === 'toi');
    if (el.tabPos) el.tabPos.classList.toggle('seg-active', tab === 'pos');
    if (el.logView) el.logView.classList.toggle('hidden', tab !== 'log');
    if (el.toiView) {
        el.toiView.classList.toggle('hidden', tab !== 'toi');
        el.toiView.classList.toggle('flex',   tab === 'toi');
    }
    if (el.posView) {
        el.posView.classList.toggle('hidden', tab !== 'pos');
        el.posView.classList.toggle('flex',   tab === 'pos');
    }
    renderLivePanel();
}

function renderLivePanel() {
    if (state.liveTab === 'toi') renderToiList();
    else if (state.liveTab === 'pos') renderPosesionPanel();
    else renderEventList();
}

// ─────────────────────────────────────────────
// POSESIÓN
// Un botón partido en dos equipos. Tocás el lado del que tiene la pelota: se
// cierra el tramo del otro y empieza el suyo. Tocar el lado que ya la tiene
// corta la posesión (pelota muerta, lateral, tiempo muerto) y ese rato no
// cuenta para ninguno.
// Cada tramo es un clip más en state.events, así llega al XML y a la sesión
// guardada sin nada extra; los porcentajes salen de sumar esos clips.
// ─────────────────────────────────────────────
function nombreEquipo(e, equipo) {
    return equipo === 'A' ? (e.equipoA || 'Local') : (e.equipoB || 'Visitante');
}

function tocarPosesion(e, equipo) {
    if (!state.isPlaying) startTimer();
    const actual = state.posesion[e.id];
    if (actual) cerrarTramoPosesion(e);
    // El mismo lado otra vez: queda cortada. El otro lado: empieza su tramo.
    if (!actual || actual.equipo !== equipo) {
        state.posesion[e.id] = { equipo: equipo, desde: state.time };
    }
    renderLivePanel();
    renderElements();
}

function cerrarTramoPosesion(e) {
    const tramo = state.posesion[e.id];
    if (!tramo) return;
    delete state.posesion[e.id];
    const fin = state.time;
    // Un doble toque sin querer no deja un clip de medio segundo en el XML.
    if (fin - tramo.desde < 0.5) return;
    state.events.unshift({
        id: Date.now() + (++_evSeq),
        buttonId: e.id,
        name: 'Posesión ' + nombreEquipo(e, tramo.equipo),
        posesionDe: e.id,
        equipo: tramo.equipo,           // los totales van por equipo, no por nombre:
        start: tramo.desde,             // así renombrar un equipo no parte la cuenta
        end: fin,
        timestamp: fmt(tramo.desde),
        lead: 0, lag: 0,
        exclusiveIds: [], isExclusive: false,
        timeMode: 'manual',
        line: null,
        descriptors: []
    });
}

// La posesión sale de los eventos: cada botón de evento puede sumarle a un
// equipo (Inspector → "Suma a la posesión de"), y los lados del botón de
// posesión también cuentan. Todo entra en un mismo reparto.
function equipoDeBoton(buttonId) {
    const b = state.elements.find(x => x.id === buttonId);
    return (b && b.type === 'event' && (b.equipo === 'A' || b.equipo === 'B')) ? b.equipo : null;
}

function nombresEquipos() {
    const pos = state.elements.find(x => x.type === 'possession');
    return { A: (pos && pos.equipoA) || 'Local', B: (pos && pos.equipoB) || 'Visitante' };
}

// Reparte el tiempo entre los dos equipos sin contar nada dos veces:
//  - eventos del mismo equipo que se pisan cuentan una vez;
//  - si se pisan eventos de los DOS equipos, ese rato es del que se marcó
//    último: la pelota pasa a quien hizo algo. Así Local + Visitante nunca
//    supera el tiempo real.
// Recorre los cortes en orden con los tramos activos, en vez de comparar
// todos contra todos: se recalcula en cada tick y no puede ponerse lento con
// cientos de eventos en un iPad.
function tramosDePosesion(eventos, ahora, conAbiertos) {
    const marcas = [];
    eventos.forEach(ev => {
        const eq = ev.posesionDe ? ev.equipo : equipoDeBoton(ev.buttonId);
        if ((eq === 'A' || eq === 'B') && ev.end != null && ev.end > ev.start) {
            marcas.push({ a: Math.max(0, ev.start), b: ev.end, eq: eq });
        }
    });
    if (conAbiertos) {
        (state.openEvents || []).forEach(o => {
            const eq = equipoDeBoton(o.buttonId);
            if (eq && ahora > o.start) marcas.push({ a: Math.max(0, o.start), b: ahora, eq: eq });
        });
        Object.keys(state.posesion || {}).forEach(k => {
            const p = state.posesion[k];
            if (ahora > p.desde) marcas.push({ a: p.desde, b: ahora, eq: p.equipo });
        });
    }
    if (!marcas.length) return [];

    marcas.sort((x, y) => x.a - y.a);
    const cortes = Array.from(new Set(marcas.reduce((l, m) => { l.push(m.a, m.b); return l; }, [])))
        .sort((x, y) => x - y);

    const segmentos = [];
    let activos = [], p = 0;
    for (let i = 0; i < cortes.length - 1; i++) {
        const a = cortes[i], b = cortes[i + 1];
        while (p < marcas.length && marcas[p].a <= a) activos.push(marcas[p++]);
        activos = activos.filter(m => m.b > a);
        if (!activos.length) continue;
        let dueno = activos[0];
        activos.forEach(m => { if (m.a > dueno.a) dueno = m; });
        const ultimo = segmentos[segmentos.length - 1];
        if (ultimo && ultimo.eq === dueno.eq && ultimo.b === a) ultimo.b = b;
        else segmentos.push({ a: a, b: b, eq: dueno.eq });
    }
    return segmentos;
}

function tiemposPosesion() {
    const seg = tramosDePosesion(state.events, state.time, true);
    const t = { A: 0, B: 0, tramos: seg.length };
    seg.forEach(s => { t[s.eq] += s.b - s.a; });
    const total = t.A + t.B;
    t.pctA = total > 0 ? Math.round(t.A / total * 100) : null;
    t.pctB = total > 0 ? 100 - t.pctA : null;
    return t;
}

// Quién tiene la pelota ahora mismo, según el reparto.
function equipoConPelota() {
    const ahora = state.time;
    const seg = tramosDePosesion(state.events, ahora, true);
    for (let i = seg.length - 1; i >= 0; i--) {
        if (seg[i].a <= ahora && seg[i].b >= ahora) return seg[i].eq;
    }
    return null;
}

function renderPosesionPanel() {
    if (!el.posList) return;
    el.posList.innerHTML = '';
    // Alcanza con eventos que sumen a un equipo: el botón de posesión es opcional.
    const hayPosesion = state.elements.some(e =>
        e.type === 'possession' || (e.type === 'event' && (e.equipo === 'A' || e.equipo === 'B')));
    if (!hayPosesion) {
        el.posList.innerHTML = '<div class="p-6 text-center text-sm text-gray-500">Todavía nada suma posesión.<br>En el Inspector de cada evento elegí a qué equipo le suma, o agregá Insertar ▼ → Posesión.</div>';
        return;
    }
    const nombres = nombresEquipos();
    const t = tiemposPosesion();
    const fila = (eq) =>
        `<div class="pos-panel-fila">` +
            `<span class="pos-panel-punto pos-${eq}"></span>` +
            `<span class="pos-panel-nombre">${nombres[eq]}</span>` +
            `<span class="pos-panel-pct" data-pos-for="0" data-equipo="${eq}" data-campo="pct"></span>` +
            `<span class="pos-panel-tiempo" data-pos-for="0" data-equipo="${eq}" data-campo="tiempo"></span>` +
        `</div>`;
    const bloque = document.createElement('div');
    bloque.className = 'pos-panel';
    bloque.innerHTML =
        `<div class="pos-panel-barra"><div class="pos-A" data-pos-for="0" data-campo="barra"></div><div class="pos-B"></div></div>` +
        fila('A') + fila('B') +
        `<div class="pos-panel-pie">${t.tramos} ${t.tramos === 1 ? 'tramo' : 'tramos'} de posesión</div>`;
    el.posList.appendChild(bloque);
    updateLiveClocks();
}

// Filas de la tabla ToI: un renglón por jugador con tiempo o en hielo
function toiRows() {
    const openMap = {};
    (state.openEvents || []).forEach(o => { openMap[o.buttonId] = o; });

    const rows = state.elements
        .filter(e => e.type === 'event')
        .map(e => {
            const onIce = !!openMap[e.id];
            // Tramos unidos: lo que se pisa cuenta una vez, y dos toques que se
            // superponen son un solo turno, no dos.
            const hielo = tiempoEnHielo(e.id);
            return { id: e.id, name: e.name, onIce, shifts: hielo.cantidad, total: hielo.total };
        })
        .filter(r => r.total > 0 || r.onIce);

    rows.sort((a, b) => b.total - a.total);
    return rows;
}

function renderToiList() {
    if (!el.toiList) return;
    const rows = toiRows();
    el.toiList.innerHTML = '';

    if (!rows.length) {
        el.toiList.innerHTML = `<div class="p-6 text-center text-sm text-gray-500">Todavía no hay tiempo acumulado.<br>Tocá un jugador o una línea para abrir su turno.</div>`;
        return;
    }

    rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'toi-row' + (r.onIce ? ' on-ice' : '');
        row.innerHTML = `
            <div class="toi-name">${r.onIce ? '<span class="toi-dot"></span>' : ''}${r.name}</div>
            <div class="toi-shifts">${r.shifts}</div>
            <div class="toi-total-cell" data-toirow-for="${r.id}">${fmt(r.total)}</div>`;
        el.toiList.appendChild(row);
    });
}

function exportToiCSV() {
    const rows = toiRows();
    if (!rows.length) { customAlert('No hay tiempo acumulado todavía.', 'Exportar ToI'); return; }
    let csv = 'Jugador,Turnos,Total (s),Total (mm:ss)\n';
    rows.forEach(r => {
        csv += `"${String(r.name).replace(/"/g, '""')}",${r.shifts},${r.total.toFixed(1)},${fmt(r.total)}\n`;
    });
    saveBlobToFiles(`ToI_${new Date().toISOString().slice(0,10)}.csv`,
                    new Blob([csv], { type: 'text/csv' }));
}

// ─────────────────────────────────────────────
// EVENT LIST
// ─────────────────────────────────────────────
function renderEventList() {
    el.eventList.innerHTML = '';

    // Mostrar primero eventos abiertos (en curso)
    if (state.openEvents && state.openEvents.length > 0) {
        state.openEvents.forEach(ev => {
            const row = document.createElement('div');
            row.className = 'event-row bg-red-50 font-bold';
            const tags = (ev.descriptors||[]).map(d=>`<span class="ev-tag-chip bg-red-200 text-red-800">${d}</span>`).join('');
            row.innerHTML = `
                <div class="ev-name text-red-600 flex items-center"><span class="w-2 h-2 rounded-full bg-red-500 animate-ping mr-1.5 inline-block"></span>${ev.name}</div>
                <div class="ev-tags">${tags}</div>
                <div class="ev-time text-red-500 font-mono" data-clock-for="${ev.buttonId}"></div>`;
            el.eventList.appendChild(row);
        });
    }

    // Mostrar eventos finalizados
    state.events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'event-row';
        const tags = (ev.descriptors||[]).map(d=>`<span class="ev-tag-chip">${d}</span>`).join('');
        row.innerHTML = `
            <div class="ev-name">${ev.name}</div>
            <div class="ev-tags">${tags}</div>
            <div class="ev-time">${ev.start.toFixed(1)}-${(ev.end !== null && ev.end !== undefined) ? ev.end.toFixed(1) : ''}</div>`;
        el.eventList.appendChild(row);
    });
}

// ─────────────────────────────────────────────
// EXPORT XML
// ─────────────────────────────────────────────
// Sportscode escribe la fecha en UTC con este formato exacto
function fechaSportscode(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
         + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds())
         + ' +0000';
}

// Los colores de ROWS van en 16 bits (0-65535), no en 0-255
function a16bits(v) { return Math.round(v / 255 * 65535); }

function rgbDeEvento(nombre, buttonId, equipo) {
    let e = state.elements.find(x => x.id === buttonId);
    if (!e) e = state.elements.find(x => x.type === 'event' && x.name === nombre);
    let hex = (e && e.color) || defaultColor(e ? e.type : 'event') || '#3a8fd6';
    // Los dos equipos de la posesión comparten botón: sin esto sus filas
    // saldrían del mismo color. Cada una toma el de su mitad del botón.
    if (equipo === 'A') hex = '#3a8fd6';
    if (equipo === 'B') hex = '#dc2626';
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return {
        r: parseInt(hex.slice(0, 2), 16) || 0,
        g: parseInt(hex.slice(2, 4), 16) || 0,
        b: parseInt(hex.slice(4, 6), 16) || 0
    };
}

// Sportscode espera UTF-16 LE con BOM, no UTF-8
function blobUtf16(texto) {
    const buf = new ArrayBuffer(2 + texto.length * 2);
    const vista = new DataView(buf);
    vista.setUint16(0, 0xFEFF, true);
    for (let i = 0; i < texto.length; i++) {
        vista.setUint16(2 + i * 2, texto.charCodeAt(i), true);
    }
    return new Blob([buf], { type: 'text/xml' });
}

function xmlEsc(v) {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function exportXML() {
    try {
        exportCustomXML(state.events,
            `Tagging_${new Date().toISOString().slice(0,10)}`,
            state.sessionStartedAt);
    } catch (err) {
        customAlert('No se pudo generar el XML: ' + ((err && err.message) || err), 'Exportar XML');
    }
}

// ─────────────────────────────────────────────
// HISTORIAL DE PLANTILLAS
// ─────────────────────────────────────────────
function getSavedTemplates() {
    const raw = lsGet('tv_templates');
    return raw ? JSON.parse(raw) : [];
}
// Guardar, borrar, importar y restaurar pasan todas por acá, así que es el
// único lugar donde hace falta pedir el respaldo: ninguna vía se escapa.
function saveTemplates(arr) {
    lsSet('tv_templates', JSON.stringify(arr));
    respaldarEnNube();
}

function openTemplatesModal() { setPage('plantillas'); }

function renderTemplatesList() {
    const templates = getSavedTemplates();
    el.templatesList.innerHTML = '';

    if (templates.length === 0) {
        el.templatesList.innerHTML = `<div class="p-6 text-center text-sm text-gray-500">No hay plantillas guardadas aún.</div>`;
        return;
    }

    templates.forEach(t => {
        const row = document.createElement('div');
        row.className = 'p-3 flex items-center justify-between hover:bg-gray-50';
        row.innerHTML = `
            <div class="flex-1 pr-2">
                <div class="font-bold text-sm text-black">${t.name}</div>
                <div class="text-xs text-gray-400 font-mono">${t.date} · ${t.elements ? t.elements.length : 0} botones${(t.hojas && t.hojas.length) ? ` · ${t.hojas.length} pestaña${t.hojas.length === 1 ? '' : 's'}` : ''}</div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="btn-file-tmpl px-2 py-1 bg-gray-100 text-gray-600 font-bold text-xs rounded-lg" title="Guardar en Archivos">⤓</button>
                <button class="btn-load-tmpl px-3 py-1 bg-[#007aff]/10 text-[#007aff] font-bold text-xs rounded-lg">Cargar</button>
                <button class="btn-del-tmpl p-1 text-red-500 hover:bg-red-50 rounded">✕</button>
            </div>
        `;

        row.querySelector('.btn-load-tmpl').addEventListener('click', () => {
            state.elements = JSON.parse(JSON.stringify(t.elements || []));
            state.links    = JSON.parse(JSON.stringify(t.links || []));
            state.hojas    = JSON.parse(JSON.stringify(t.hojas || []));
            state.hojaActiva = null;
            selectElement(null);
            renderHojasBar();
            saveData();
            renderAll();
            setPage('botonera');
        });

        row.querySelector('.btn-file-tmpl').addEventListener('click', () => exportTemplateToFile(t));

        row.querySelector('.btn-del-tmpl').addEventListener('click', async () => {
            if (await customConfirm(`¿Eliminar la plantilla "${t.name}"?`, 'Eliminar Plantilla', true)) {
                const filtered = getSavedTemplates().filter(item => item.id !== t.id);
                saveTemplates(filtered);
                renderTemplatesList();
            }
        });

        el.templatesList.appendChild(row);
    });
}

async function saveCurrentTemplate() {
    if (!state.elements.length) {
        customAlert('El lienzo está vacío. Agregá botones antes de guardar.', 'Plantilla Vacía');
        return;
    }
    const name = await customPrompt('Nombre de la plantilla:', `Plantilla ${new Date().toLocaleDateString()}`, 'Guardar Plantilla');
    if (!name || !name.trim()) return;

    const templates = getSavedTemplates();
    const newTmpl = {
        id: Date.now(),
        name: name.trim(),
        date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        elements: JSON.parse(JSON.stringify(state.elements)),
        links: JSON.parse(JSON.stringify(state.links)),
        hojas: JSON.parse(JSON.stringify(state.hojas))
    };
    templates.unshift(newTmpl);
    saveTemplates(templates);
    renderTemplatesList();
}

async function createNewTemplate() {
    if (await customConfirm('¿Crear un lienzo en blanco? Se limpiará la pantalla actual.', 'Nuevo Lienzo', true, 'Limpiar')) {
        state.elements = [];
        state.links    = [];
        state.hojas    = [];
        state.hojaActiva = null;
        selectElement(null);
        renderHojasBar();
        saveData();
        renderAll();
        setPage('botonera');
    }
}

// ─────────────────────────────────────────────
// PLANTILLAS Y SESIONES COMO ARCHIVOS DEL iPad
// ─────────────────────────────────────────────
const FILE_STAMP = () => new Date().toISOString().slice(0,10);

async function exportTemplateToFile(tmpl) {
    const t = tmpl || {
        name: 'Lienzo actual',
        date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        elements: state.elements,
        links: state.links,
        hojas: state.hojas
    };
    if (!t.elements || !t.elements.length) {
        customAlert('El lienzo está vacío. Agregá botones antes de exportar.', 'Plantilla vacía');
        return;
    }
    const payload = {
        app: 'tagview', kind: 'template', version: 1,
        name: t.name, date: t.date,
        elements: t.elements, links: t.links || [], hojas: t.hojas || []
    };
    await saveToFiles(safeFileName(`Plantilla ${t.name}`, '.json'), JSON.stringify(payload, null, 2));
}

async function importTemplateFromFile() {
    const data = await readAppFile(['template'], 'una plantilla');
    if (!data) return;

    const cargar = await customConfirm(
        `"${data.name || 'Plantilla'}" · ${(data.elements || []).length} botones.\n\n¿Cargarla en el lienzo? Se reemplaza lo que haya ahora.`,
        'Importar plantilla');
    if (!cargar) return;

    state.elements = JSON.parse(JSON.stringify(data.elements || []));
    state.links    = JSON.parse(JSON.stringify(data.links || []));
    state.hojas    = JSON.parse(JSON.stringify(data.hojas || []));
    state.hojaActiva = null;
    selectElement(null);
    renderHojasBar();
    saveData();
    renderAll();

    // Además la dejamos en el historial local
    const templates = getSavedTemplates();
    templates.unshift({
        id: Date.now(),
        name: data.name || 'Plantilla importada',
        date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        elements: JSON.parse(JSON.stringify(state.elements)),
        links: JSON.parse(JSON.stringify(state.links)),
        hojas: JSON.parse(JSON.stringify(state.hojas))
    });
    saveTemplates(templates);
    renderTemplatesList();
    setPage('botonera');   // la plantilla importada ya está cargada en el lienzo
}

async function exportSessionToFile(sess) {
    const payload = {
        app: 'tagview', kind: 'session', version: 1,
        name: sess.name, date: sess.date, duration: sess.duration,
        events: sess.events || [], counters: sess.counters || {}, toi: sess.toi || {}
    };
    await saveToFiles(safeFileName(`Sesion ${sess.name}`, '.json'), JSON.stringify(payload, null, 2));
}

async function importSessionFromFile() {
    const data = await readAppFile(['session'], 'una sesión');
    if (!data) return;

    const sessions = getSavedSessions();
    sessions.unshift({
        id: Date.now(),
        name: data.name || 'Sesión importada',
        date: data.date || new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        duration: data.duration || '00:00',
        events: data.events || [],
        counters: data.counters || {},
        toi: data.toi || {}
    });
    saveSessions(sessions);
    renderSessionsList();
    customAlert(`"${data.name}" quedó en el historial con ${(data.events||[]).length} turnos.`, 'Sesión importada');
}

// Copia de seguridad completa: lienzo actual + todas las plantillas + todas las sesiones
async function backupAll() {
    await saveToFiles(`TagView_copia_${FILE_STAMP()}.json`,
                      JSON.stringify(armarRespaldo(), null, 2));
}

async function restoreAll() {
    const data = await readAppFile(['backup'], 'una copia de seguridad');
    if (!data) return;
    await aplicarRespaldo(data, 'del archivo');
}

// Lo usan la restauración desde Archivos y la de la nube: el paso peligroso
// —pisar todo lo guardado— tiene que ser uno solo y preguntar siempre.
async function aplicarRespaldo(data, origen) {
    const nT = (data.templates || []).length, nS = (data.sessions || []).length;
    const fecha = data.date ? new Date(data.date) : null;
    const cuando = fecha && !isNaN(fecha)
        ? ` del ${fecha.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
        : '';

    // Nombrar las plantillas y el dispositivo es lo que deja reconocer la copia
    // correcta antes de pisar nada: "hecha en la PC · Hockey 5v5, Fútbol".
    const donde = data.dispositivo ? `, hecha en ${data.dispositivo}` : '';
    const nombres = (data.templates || []).map(t => t.name).filter(Boolean);
    const lista = nombres.length
        ? ':\n' + nombres.slice(0, 6).map(n => '• ' + n).join('\n') +
          (nombres.length > 6 ? `\n• y ${nombres.length - 6} más` : '')
        : '.';
    const acaHay = getSavedTemplates().length;
    const cant = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`;

    const ok = await customConfirm(
        `La copia ${origen}${donde}${cuando} trae ${cant(nT, 'plantilla')} y ${cant(nS, 'sesión').replace('sesións', 'sesiones')}${lista}\n\n` +
        `Reemplaza lo que tenés en este dispositivo (${cant(acaHay, 'plantilla')}). ¿Seguir?`,
        'Restaurar copia', true, 'Reemplazar');
    if (!ok) return;

    // Lo que entra es exactamente lo que ya está en la nube: no hay que
    // devolverlo. La marca queda con la fecha del respaldo aplicado.
    _aplicandoRespaldo = true;
    try {
        saveTemplates(data.templates || []);
        saveSessions(data.sessions || []);
        if (data.current) {
            state.elements = JSON.parse(JSON.stringify(data.current.elements || []));
            state.links    = JSON.parse(JSON.stringify(data.current.links || []));
            state.hojas    = JSON.parse(JSON.stringify(data.current.hojas || []));
            state.hojaActiva = null;
            renderHojasBar();
            selectElement(null);
            saveData();
            renderAll();
        }
    } finally {
        _aplicandoRespaldo = false;
    }
    if (data.date) marcarRespaldo(data.date);
    // Si había un respaldo local esperando en la cola, quedó viejo: elegiste
    // esta copia. Subirlo igual sería pisar lo que acabás de traer.
    guardarCola(colaNube().filter(x => x.nombre !== ARCHIVO_RESPALDO));
    renderEstadoNube();
    renderTemplatesList();
    customAlert(`Restaurado: ${nT} plantillas y ${nS} sesiones.`, 'Copia restaurada');
}

// ─────────────────────────────────────────────
// HISTORIAL DE CODIFICACIONES / SESIONES
// ─────────────────────────────────────────────
function getSavedSessions() {
    const raw = lsGet('tv_sessions');
    return raw ? JSON.parse(raw) : [];
}
function saveSessions(arr) {
    lsSet('tv_sessions', JSON.stringify(arr));
    respaldarEnNube();
}

function openSessionsModal() { setPage('xml'); }

function renderSessionsList() {
    const sessions = getSavedSessions();
    el.sessionsList.innerHTML = '';

    if (sessions.length === 0) {
        el.sessionsList.innerHTML = `<div class="p-6 text-center text-sm text-gray-500">No hay codificaciones guardadas aún.</div>`;
        return;
    }

    sessions.forEach(s => {
        const row = document.createElement('div');
        row.className = 'p-3 flex items-center justify-between hover:bg-gray-50';
        row.innerHTML = `
            <div class="flex-1 pr-2">
                <div class="font-bold text-sm text-black">${s.name}</div>
                <div class="text-xs text-gray-400 font-mono">${s.date} · ${s.events ? s.events.length : 0} turnos · ${s.duration || '00:00'}</div>
            </div>
            <div class="flex items-center space-x-2">
                <button class="btn-export-sess px-3 py-1 bg-[#2ca038]/10 text-[#2ca038] font-bold text-xs rounded-lg">XML</button>
                <button class="btn-file-sess px-2 py-1 bg-gray-100 text-gray-600 font-bold text-xs rounded-lg" title="Guardar en Archivos">⤓</button>
                <button class="btn-load-sess px-3 py-1 bg-[#007aff]/10 text-[#007aff] font-bold text-xs rounded-lg">Ver</button>
                <button class="btn-del-sess p-1 text-red-500 hover:bg-red-50 rounded">✕</button>
            </div>
        `;

        row.querySelector('.btn-load-sess').addEventListener('click', () => {
            // setMode('live') resetea state.events, asi que hay que entrar al modo ANTES de cargar
            if (state.mode !== 'live') setMode('live');
            state.events   = JSON.parse(JSON.stringify(s.events || []));
            state.counters = JSON.parse(JSON.stringify(s.counters || {}));
            state.toi      = JSON.parse(JSON.stringify(s.toi || {}));
            renderLivePanel();
            renderElements();
            setPage('botonera');
        });

        row.querySelector('.btn-export-sess').addEventListener('click', () => {
            exportCustomXML(s.events, s.name, s.startedAt ? new Date(s.startedAt) : null);
        });

        row.querySelector('.btn-file-sess').addEventListener('click', () => exportSessionToFile(s));

        row.querySelector('.btn-del-sess').addEventListener('click', async () => {
            if (await customConfirm(`¿Eliminar la sesión "${s.name}"?`, 'Eliminar Sesión', true)) {
                const filtered = getSavedSessions().filter(item => item.id !== s.id);
                saveSessions(filtered);
                renderSessionsList();
            }
        });

        el.sessionsList.appendChild(row);
    });
}

async function saveCurrentSession() {
    if (!state.events.length) {
        customAlert('No hay eventos grabados en la sesión actual.', 'Sin Eventos');
        return;
    }
    const defaultName = `Partido ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    const name = await customPrompt('Nombre de la sesión de codificación:', defaultName, 'Guardar Sesión');
    if (!name || !name.trim()) return;

    const sessions = getSavedSessions();
    const newSession = {
        id: Date.now(),
        name: name.trim(),
        date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        duration: fmt(state.time),
        startedAt: state.sessionStartedAt ? state.sessionStartedAt.toISOString() : null,
        events: JSON.parse(JSON.stringify(state.events)),
        counters: JSON.parse(JSON.stringify(state.counters)),
        toi: toiCalculado()
    };
    sessions.unshift(newSession);
    saveSessions(sessions);
    renderSessionsList();
}

function exportCustomXML(eventsList, title, inicio) {
    if (!eventsList || !eventsList.length) { customAlert('No hay eventos para exportar.', 'Exportar XML'); return; }

    // Posesión: sus clips salen del reparto (eventos con equipo y lados del
    // botón), con la misma regla de no contar dos veces. Los tramos tocados en
    // el botón ya entran en ese reparto: se reemplazan para no ir repetidos.
    const reparto = tramosDePosesion(eventsList, 0, false);
    if (reparto.length) {
        const nombres = nombresEquipos();
        eventsList = eventsList.filter(ev => !ev.posesionDe).concat(reparto.map(s => ({
            name: 'Posesión ' + nombres[s.eq],
            start: s.a, end: s.b, equipo: s.eq,
            buttonId: null, descriptors: [], line: null
        })));
    }

    // Los IDs se numeran por orden cronologico, pero el archivo va agrupado
    // por codigo: asi lo escribe Sportscode.
    const porTiempo = [...eventsList].sort((a, b) => a.start - b.start);
    const idDe = new Map();
    porTiempo.forEach((ev, i) => idDe.set(ev, i + 1));

    const ordenado = [...eventsList].sort(
        (a, b) => a.name.localeCompare(b.name) || a.start - b.start);

    const T = '\t';
    let xml = '<file>\n';

    xml += T + '<SESSION_INFO>\n';
    xml += T + T + '<start_time>' + fechaSportscode(inicio || new Date()) + '</start_time>\n';
    xml += T + '</SESSION_INFO>\n';

    xml += T + '<ALL_INSTANCES>\n';
    ordenado.forEach(ev => {
        const fin = (ev.end !== null && ev.end !== undefined) ? ev.end : ev.start + 1;
        xml += T + T + '<instance>\n';
        xml += T + T + T + '<ID>' + idDe.get(ev) + '</ID>\n';
        xml += T + T + T + '<start>' + Number(ev.start).toFixed(2) + '</start>\n';
        xml += T + T + T + '<end>' + Number(fin).toFixed(2) + '</end>\n';
        xml += T + T + T + '<code>' + xmlEsc(ev.name) + '</code>\n';
        // Las etiquetas solo salen si de verdad se usaron
        if (ev.line) {
            xml += T + T + T + '<label>\n';
            xml += T + T + T + T + '<group>Linea</group>\n';
            xml += T + T + T + T + '<text>' + xmlEsc(ev.line) + '</text>\n';
            xml += T + T + T + '</label>\n';
        }
        (ev.descriptors || []).forEach(d => {
            xml += T + T + T + '<label>\n';
            xml += T + T + T + T + '<group>Etiqueta</group>\n';
            xml += T + T + T + T + '<text>' + xmlEsc(d) + '</text>\n';
            xml += T + T + T + '</label>\n';
        });
        xml += T + T + '</instance>\n';
    });
    xml += T + '</ALL_INSTANCES>\n';

    // Un renglon por codigo, en orden alfabetico, con su color
    const codigos = [...new Set(ordenado.map(e => e.name))].sort((a, b) => a.localeCompare(b));
    xml += T + '<ROWS>\n';
    codigos.forEach(c => {
        const ev = ordenado.find(e => e.name === c);
        const rgb = rgbDeEvento(c, ev && ev.buttonId, ev && ev.equipo);
        xml += T + T + '<row>\n';
        xml += T + T + T + '<code>' + xmlEsc(c) + '</code>\n';
        xml += T + T + T + '<R>' + a16bits(rgb.r) + '</R>\n';
        xml += T + T + T + '<G>' + a16bits(rgb.g) + '</G>\n';
        xml += T + T + T + '<B>' + a16bits(rgb.b) + '</B>\n';
        xml += T + T + '</row>\n';
    });
    xml += T + '</ROWS>\n';
    xml += '</file>\n';

    const nombre = String(title || 'Tagging').replace(/[^a-z0-9_\- ]/gi, '_') + '.xml';

    // La copia a la nube va primero y no bloquea: si no hay señal queda en la
    // cola, y el guardado local sigue su camino igual.
    encolarArchivo(nombre, xml, 'xml');

    // Si el guardado falla, que se vea: antes moría en silencio y parecía que
    // el botón no hacía nada.
    saveBlobToFiles(nombre, blobUtf16(xml)).catch(err => {
        customAlert('No se pudo guardar el XML: ' + ((err && err.message) || err), 'Exportar XML');
    });
}

init();

// Marca para la trampa de errores de index.html
window.__tagviewOk = true;
