// La ventana principal: sin menu, con la barra de titulo dibujada por la
// pagina (titleBarOverlay deja solo los botones de Windows), y recordando
// tamano, posicion y si estaba maximizada.

const path = require('path');
const fs = require('fs');
const mac = require('./mac');

const MIN_ANCHO = 1024, MIN_ALTO = 680;
const ALTO_BARRA = 36;

function rutaIcono() {
    const r = path.join(__dirname, '..', 'build', 'icon.png');
    return fs.existsSync(r) ? r : undefined;
}

// Una posicion guardada solo sirve si todavia cae en alguna pantalla: con un
// monitor menos, la ventana abriria afuera y parece que la app no arranco.
function limitesValidos(screen, b) {
    if (!b || !isFinite(b.width) || !isFinite(b.height)) return null;
    const ancho = Math.max(MIN_ANCHO, b.width), alto = Math.max(MIN_ALTO, b.height);
    if (!isFinite(b.x) || !isFinite(b.y)) return { width: ancho, height: alto };
    const visible = screen.getAllDisplays().some(d => {
        const a = d.workArea;
        return b.x + 100 > a.x && b.x < a.x + a.width - 100 && b.y >= a.y - 10 && b.y < a.y + a.height - 50;
    });
    return visible ? { x: b.x, y: b.y, width: ancho, height: alto } : { width: ancho, height: alto };
}

function crearVentana({ BrowserWindow, screen, shell, app, config, origen, preload }) {
    const guardado = config.leer().ventana || {};
    const limites = limitesValidos(screen, guardado) || { width: 1500, height: 950 };

    const oscuro = require('electron').nativeTheme.shouldUseDarkColors;
    const w = new BrowserWindow({
        ...limites,
        minWidth: MIN_ANCHO,
        minHeight: MIN_ALTO,
        show: false,
        title: 'Tag & View Pro',
        icon: rutaIcono(),
        backgroundColor: oscuro ? '#1c1c1e' : '#f2f2f7',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: oscuro ? '#1c1c1e' : '#f2f2f7',
            symbolColor: oscuro ? '#f2f2f7' : '#1c1c1e',
            height: ALTO_BARRA
        },
        // Mac: semaforo adentro de la barra y sin titleBarOverlay (es de
        // Windows). En Windows opcionesVentana() devuelve {} y no cambia nada.
        ...mac.opcionesVentana(),
        webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false,
            devTools: !app.isPackaged,
            backgroundThrottling: false   // la grabacion no se frena con la ventana atras
        }
    });

    if (guardado.maximizada) w.maximize();
    w.once('ready-to-show', () => w.show());

    // ── Recordar tamano y posicion ──
    // getNormalBounds: el tamano "restaurado" aunque ahora este maximizada.
    let pendiente = null;
    const recordar = () => {
        if (w.isDestroyed() || w.isMinimized()) return;
        const b = w.getNormalBounds();
        config.cambiar(c => { c.ventana = { ...b, maximizada: w.isMaximized() }; });
    };
    const programar = () => { clearTimeout(pendiente); pendiente = setTimeout(recordar, 400); };
    ['resize', 'move', 'maximize', 'unmaximize'].forEach(e => w.on(e, programar));
    w.on('close', () => { clearTimeout(pendiente); recordar(); });

    // ── Permisos ──
    // Camara y microfono se conceden sin preguntar, pero solo a la app propia:
    // no se carga nada de afuera.
    const ses = w.webContents.session;
    const permitidos = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'notifications']);
    ses.setPermissionRequestHandler((wc, permiso, cb) => {
        cb(wc.getURL().startsWith(origen) && permitidos.has(permiso));
    });
    ses.setPermissionCheckHandler((wc, permiso, desde) => {
        return (desde || '').startsWith(origen) && permitidos.has(permiso);
    });

    // Nada de navegar fuera de la app: los enlaces externos van al navegador.
    w.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    w.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(origen + '/')) {
            e.preventDefault();
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        }
    });

    // ── Teclas de desarrollo ──
    // Sin menu no hay atajos por defecto: F12 / Ctrl+Shift+I y Ctrl+R se
    // agregan a mano, y solo sin empaquetar.
    if (!app.isPackaged) {
        w.webContents.on('before-input-event', (e, input) => {
            if (input.type !== 'keyDown') return;
            const k = (input.key || '').toLowerCase();
            // En Mac, ⌘⌥I y ⌘R los da el menu de desarrollo (main/mac.js).
            if (k === 'f12' || (input.control && input.shift && k === 'i')) {
                w.webContents.toggleDevTools(); e.preventDefault();
            } else if ((input.control && k === 'r') || k === 'f5') {
                w.webContents.reloadIgnoringCache(); e.preventDefault();
            }
        });
    }

    w.loadURL(origen + '/index.html');
    return w;
}

module.exports = { crearVentana, rutaIcono, ALTO_BARRA };
