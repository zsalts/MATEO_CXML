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
    openEvents: []             // Eventos en modo manual/excluyente actualmente abiertos (grabando)
};

const DEFAULT_W = 120;
const DEFAULT_H = 52;

// Se muestra al lado del logo para saber de un vistazo qué versión quedó
// servida. Tiene que coincidir con CACHE_VERSION de sw.js: build-ipad.py
// corta si se desfasan.
const APP_VERSION = 'v12';

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
    btnDeleteGlobal:D('btnDeleteGlobal'),
    btnPlayPause:   D('btnPlayPause'),
    timerLive:      D('timerLive'),
    btnStopCoding:  D('btnStopCoding')
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

function customConfirm(message, title = 'Confirmar', isDestructive = false) {
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
        confirmBtn.textContent = isDestructive ? 'Eliminar' : 'Aceptar';
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

async function saveBlobToFiles(filename, blob) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

    // En iPad esto abre la hoja de Compartir, con "Guardar en Archivos".
    // navigator.share solo existe en contexto seguro (https): desde http:// o
    // desde el archivo único en file:// no está, y hay que ir al plan B.
    if ((navigator.maxTouchPoints || 0) > 0 &&
        navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: filename });
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
    return dialogoGuardarArchivo(file, filename);
}

function descargaDirecta(file, filename) {
    const url = URL.createObjectURL(file);
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
function dialogoGuardarArchivo(file, filename) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
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
        ayuda.textContent = 'Tocá Guardar y elegí "Guardar en Archivos".';
        ayuda.style.cssText = 'font-size:12px;color:#555;line-height:1.45;margin-bottom:16px;';

        const botones = document.createElement('div');
        botones.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

        const estiloBoton = 'display:block;width:100%;padding:11px 12px;border-radius:12px;' +
            'font-size:13px;font-weight:600;text-decoration:none;border:0;cursor:pointer;' +
            '-webkit-appearance:none;appearance:none;box-sizing:border-box;';

        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = filename;
        enlace.rel = 'noopener';
        enlace.textContent = 'Guardar';
        enlace.style.cssText = estiloBoton + 'background:#007aff;color:#fff;';

        botones.appendChild(enlace);

        // Si hay hoja de Compartir, ofrecerla: disparada desde el toque conserva
        // el gesto que iOS exige.
        if (navigator.share) {
            const btnCompartir = document.createElement('button');
            btnCompartir.type = 'button';
            btnCompartir.textContent = 'Compartir…';
            btnCompartir.style.cssText = estiloBoton + 'background:#f2f2f7;color:#111;';
            btnCompartir.onclick = () => {
                const intento = (navigator.canShare && navigator.canShare({ files: [file] }))
                    ? navigator.share({ files: [file], title: filename })
                    : Promise.reject(new Error('sin soporte de archivos'));
                intento.then(cerrar).catch(() => {});
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
    if (e) state.elements = JSON.parse(e);
    if (l) state.links    = JSON.parse(l);
}
function saveData() {
    lsSet('tv_elements', JSON.stringify(state.elements));
    lsSet('tv_links',    JSON.stringify(state.links));
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

    // Al salir de live, cerrar cualquier turno abierto (acumulando su ToI)
    if (state.openEvents && state.openEvents.length > 0) {
        for (let i = state.openEvents.length - 1; i >= 0; i--) closeOpenEventAt(i, true);
    }

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

    on(el.btnInsertMenu, 'click', () => el.insertMenu.classList.toggle('hidden'));
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => { closeInsertMenu(); createElement(btn.dataset.type); });
    });

    on(el.btnPlayPause, 'click', toggleTimer);
    on(el.btnExport, 'click', exportXML);
    on(el.btnClearEvents, 'click', async () => {
        if (await customConfirm('¿Borrar todos los eventos y el tiempo acumulado?', 'Limpiar Eventos', true)) {
            state.events = []; state.counters = {}; state.toi = {}; state.openEvents = [];
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
    on(el.btnDeleteGlobal, 'click', deleteSelected);
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
    return { x: cx - r.left, y: cy - r.top };
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
    state.selectedIds = state.elements
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
    const cx = el.canvasContainer.scrollLeft + 60;
    const cy = el.canvasContainer.scrollTop  + 60;

    const defaults = {
        event:       { name:'Evento',              w:DEFAULT_W, h:DEFAULT_H },
        descriptor:  { name:'Etiqueta',            w:DEFAULT_W, h:DEFAULT_H },
        popup_label: { name:'Etiqueta emergente',  w:DEFAULT_W, h:DEFAULT_H },
        counter:     { name:'0',                   w:80,        h:60        },
        container:   { name:'',                    w:200,       h:180       },
        line:        { name:'Línea 1',             w:140,       h:52        }
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

    const otherEvents = state.elements.filter(item => item.type === 'event' && item.id !== current.id);

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

    const players = state.elements.filter(item => item.type === 'event');

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
    
    syncSections(e.type);
    saveData(); renderElements();
}

function startLinking() {
    if (!state.selectedId) return;
    state.isLinking = true; state.linkStartId = state.selectedId;
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

function renderElements() {
    el.canvas.innerHTML = '';

    const containers = state.elements.filter(e => e.type === 'container');
    const others     = state.elements.filter(e => e.type !== 'container');

    const visible = state.mode === 'live'
        ? others.filter(e => e.type !== 'popup_label' || state.activePopupElementIds.includes(e.id))
        : others;

    const openButtonIds = (state.openEvents || []).map(o => o.buttonId);
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
            if (e.type === 'popup_label') {
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

    updateLiveClocks();
}

function centerOf(id) {
    const e = state.elements.find(e => e.id === id);
    return e ? { x: e.x+e.w/2, y: e.y+e.h/2 } : { x:0, y:0 };
}

function renderLinks() {
    el.svgArrows.querySelectorAll('path, circle').forEach(n => n.remove());
    if (state.mode !== 'setup') return;

    state.links.forEach(lnk => {
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
    const containers = state.elements.filter(c => c.type === 'container');
    const results = [];
    for (const cont of containers) {
        const inside = state.elements.filter(e =>
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

// Acumula segundos en hielo para un botón
function addToi(buttonId, seconds) {
    if (!(seconds > 0)) return;
    state.toi[buttonId] = (state.toi[buttonId] || 0) + seconds;
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
    state.events.unshift(openEv);
    state.counters[openEv.buttonId] = (state.counters[openEv.buttonId] || 0) + 1;
    addToi(openEv.buttonId, openEv.end - openEv.start);

    // Disparar contadores enlazados
    state.links.filter(l => l.fromId === openEv.buttonId).forEach(l => {
        const target = state.elements.find(el => el.id === l.toId);
        if (target && target.type === 'counter') {
            state.counters[target.id] = (state.counters[target.id] || 0) + 1;
        }
    });

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
    document.querySelectorAll('[data-toi-for]').forEach(node => {
        const id = parseInt(node.dataset.toiFor);
        const total = (state.toi[id] || 0) + liveOf(id);
        node.textContent = total > 0 ? 'Σ ' + fmt(total) : '';
    });
    document.querySelectorAll('[data-toirow-for]').forEach(node => {
        const id = parseInt(node.dataset.toirowFor);
        node.textContent = fmt((state.toi[id] || 0) + liveOf(id));
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

        if (isManual) {
            // Guardar en eventos abiertos activos
            state.openEvents.push(newEv);
            renderLivePanel();
            renderElements();
        } else {
            // Si es tiempo fijo y no tiene popups → finalizar de inmediato
            if (state.activePopupElementIds.length === 0 && state.tempPopupButtons.length === 0) {
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
    const isNew = !state.events.some(e => e.id === ev.id);
    state.events.unshift(ev);
    if (isNew) {
        state.counters[ev.buttonId] = (state.counters[ev.buttonId]||0)+1;
        addToi(ev.buttonId, (ev.end != null ? ev.end : ev.start) - ev.start);
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
// PANEL LIVE: REGISTRO / TIEMPO EN HIELO
// ─────────────────────────────────────────────
function setLiveTab(tab) {
    state.liveTab = tab;
    if (el.tabLog) el.tabLog.classList.toggle('seg-active', tab === 'log');
    if (el.tabToi) el.tabToi.classList.toggle('seg-active', tab === 'toi');
    if (el.logView) el.logView.classList.toggle('hidden', tab !== 'log');
    if (el.toiView) {
        el.toiView.classList.toggle('hidden', tab !== 'toi');
        el.toiView.classList.toggle('flex',   tab === 'toi');
    }
    renderLivePanel();
}

function renderLivePanel() {
    if (state.liveTab === 'toi') renderToiList();
    else renderEventList();
}

// Filas de la tabla ToI: un renglón por jugador con tiempo o en hielo
function toiRows() {
    const openMap = {};
    (state.openEvents || []).forEach(o => { openMap[o.buttonId] = o; });

    const rows = state.elements
        .filter(e => e.type === 'event')
        .map(e => {
            const onIce = !!openMap[e.id];
            const live  = onIce ? Math.max(0, state.time - openMap[e.id].start) : 0;
            return {
                id: e.id,
                name: e.name,
                onIce,
                shifts: state.events.filter(ev => ev.buttonId === e.id).length + (onIce ? 1 : 0),
                total: (state.toi[e.id] || 0) + live
            };
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

function rgbDeEvento(nombre, buttonId) {
    let e = state.elements.find(x => x.id === buttonId);
    if (!e) e = state.elements.find(x => x.type === 'event' && x.name === nombre);
    let hex = (e && e.color) || defaultColor(e ? e.type : 'event') || '#3a8fd6';
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
function saveTemplates(arr) {
    lsSet('tv_templates', JSON.stringify(arr));
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
                <div class="text-xs text-gray-400 font-mono">${t.date} · ${t.elements ? t.elements.length : 0} botones</div>
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
        links: JSON.parse(JSON.stringify(state.links))
    };
    templates.unshift(newTmpl);
    saveTemplates(templates);
    renderTemplatesList();
}

async function createNewTemplate() {
    if (await customConfirm('¿Crear un lienzo en blanco? Se limpiará la pantalla actual.', 'Nuevo Lienzo', true)) {
        state.elements = [];
        state.links    = [];
        selectElement(null);
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
        links: state.links
    };
    if (!t.elements || !t.elements.length) {
        customAlert('El lienzo está vacío. Agregá botones antes de exportar.', 'Plantilla vacía');
        return;
    }
    const payload = {
        app: 'tagview', kind: 'template', version: 1,
        name: t.name, date: t.date,
        elements: t.elements, links: t.links || []
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
    selectElement(null);
    saveData();
    renderAll();

    // Además la dejamos en el historial local
    const templates = getSavedTemplates();
    templates.unshift({
        id: Date.now(),
        name: data.name || 'Plantilla importada',
        date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        elements: JSON.parse(JSON.stringify(state.elements)),
        links: JSON.parse(JSON.stringify(state.links))
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
    const payload = {
        app: 'tagview', kind: 'backup', version: 1,
        date: new Date().toISOString(),
        current:   { elements: state.elements, links: state.links },
        templates: getSavedTemplates(),
        sessions:  getSavedSessions()
    };
    await saveToFiles(`TagView_copia_${FILE_STAMP()}.json`, JSON.stringify(payload, null, 2));
}

async function restoreAll() {
    const data = await readAppFile(['backup'], 'una copia de seguridad');
    if (!data) return;

    const nT = (data.templates || []).length, nS = (data.sessions || []).length;
    const ok = await customConfirm(
        `La copia trae ${nT} plantillas y ${nS} sesiones.\n\nEsto reemplaza todo lo que tengas guardado ahora. ¿Seguir?`,
        'Restaurar copia', true);
    if (!ok) return;

    saveTemplates(data.templates || []);
    saveSessions(data.sessions || []);
    if (data.current) {
        state.elements = JSON.parse(JSON.stringify(data.current.elements || []));
        state.links    = JSON.parse(JSON.stringify(data.current.links || []));
        selectElement(null);
        saveData();
        renderAll();
    }
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
        toi: JSON.parse(JSON.stringify(state.toi))
    };
    sessions.unshift(newSession);
    saveSessions(sessions);
    renderSessionsList();
}

function exportCustomXML(eventsList, title, inicio) {
    if (!eventsList || !eventsList.length) { customAlert('No hay eventos para exportar.', 'Exportar XML'); return; }

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
        const rgb = rgbDeEvento(c, ev && ev.buttonId);
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
    // Si el guardado falla, que se vea: antes moría en silencio y parecía que
    // el botón no hacía nada.
    saveBlobToFiles(nombre, blobUtf16(xml)).catch(err => {
        customAlert('No se pudo guardar el XML: ' + ((err && err.message) || err), 'Exportar XML');
    });
}

init();

// Marca para la trampa de errores de index.html
window.__tagviewOk = true;
