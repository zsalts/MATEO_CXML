// Lo que cambia en macOS: menu nativo, permisos de camara y microfono,
// ventana con semaforo, y que la Mac no frene ni duerma la grabacion.
//
// main.js lo llama solo en darwin (salvo opcionesVentana/energia/IPC de
// permisos, que son inocuos en Windows), asi main.js casi no cambia. Las
// funciones puras reciben la plataforma y lo de Electron por parametro:
// test/mac-main.test.js las prueba con node --test en cualquier sistema.

const { manejar, v } = require('./ipc');

const TIPOS_PERMISO = ['camara', 'microfono'];
const PAGINAS_AJUSTES = ['camara', 'microfono', 'red-local', 'firewall'];

// ─────────────────────────────────────────────
// VENTANA
// ─────────────────────────────────────────────
// Se mezcla con las opciones de new BrowserWindow. En Mac el semaforo va
// adentro de la barra de 36 px que dibuja la pagina; titleBarOverlay es de
// Windows (los botones a la derecha) y en Mac no va.
const ALTO_BARRA = 36;
const ALTO_SEMAFORO = 14;

function opcionesVentana(plataforma = process.platform) {
    if (plataforma !== 'darwin') return {};
    return {
        titleBarStyle: 'hiddenInset',
        titleBarOverlay: undefined,
        // Centrado vertical en la barra. x = el margen que usa macOS.
        trafficLightPosition: { x: 14, y: Math.round((ALTO_BARRA - ALTO_SEMAFORO) / 2) }
    };
}

// Van en webPreferences en las dos plataformas. Con la ventana tapada o
// minimizada, Chromium estrangula los timers a 1 por segundo (y macOS, con
// App Nap, todavia mas): el reloj del partido y el envio de trozos al disco
// se atrasan. Una app que graba no puede dormirse por estar de fondo.
function preferenciasWeb() {
    return { backgroundThrottling: false };
}

// ─────────────────────────────────────────────
// MENU (solo Mac)
// ─────────────────────────────────────────────
// En Windows la app va sin menu (Menu.setApplicationMenu(null)). En Mac eso
// rompe ⌘C/⌘V/⌘X/⌘A en los campos, ⌘Q, ⌘H y ⌘M: esos atajos los da el menu,
// no la pagina. Por eso aca hay un menu minimo, con roles.
//
// acciones = { abrirAjustes(), salir() }. `salir` pasa por el cierre unico de
// main.js (confirma si graba), no por app.quit() directo.
function plantillaMenu({ nombreApp = 'Tag & View Pro', desarrollo = false, acciones = {} } = {}) {
    const menuApp = {
        label: nombreApp,
        submenu: [
            { role: 'about', label: `Acerca de ${nombreApp}` },
            { type: 'separator' },
            { label: 'Ajustes…', accelerator: 'Cmd+,', click: () => acciones.abrirAjustes && acciones.abrirAjustes() },
            { type: 'separator' },
            { role: 'services', label: 'Servicios' },
            { type: 'separator' },
            { role: 'hide', label: `Ocultar ${nombreApp}` },
            { role: 'hideOthers', label: 'Ocultar otros' },
            { role: 'unhide', label: 'Mostrar todo' },
            { type: 'separator' },
            // Sin role 'quit': ese llama a app.quit() y se saltea la
            // confirmacion de "estas grabando".
            { label: `Salir de ${nombreApp}`, accelerator: 'Cmd+Q', click: () => acciones.salir && acciones.salir() }
        ]
    };
    const edicion = {
        label: 'Edición',
        submenu: [
            { role: 'undo', label: 'Deshacer' },
            { role: 'redo', label: 'Rehacer' },
            { type: 'separator' },
            { role: 'cut', label: 'Cortar' },
            { role: 'copy', label: 'Copiar' },
            { role: 'paste', label: 'Pegar' },
            { role: 'pasteAndMatchStyle', label: 'Pegar con el mismo estilo' },
            { role: 'delete', label: 'Eliminar' },
            { role: 'selectAll', label: 'Seleccionar todo' }
        ]
    };
    const ver = {
        label: 'Visualización',
        submenu: [
            { role: 'togglefullscreen', label: 'Pantalla completa' },
            ...(desarrollo ? [
                { type: 'separator' },
                { role: 'reload', label: 'Recargar' },
                { role: 'toggleDevTools', label: 'Herramientas de desarrollo', accelerator: 'Alt+Cmd+I' }
            ] : [])
        ]
    };
    const ventana = {
        label: 'Ventana',
        role: 'window',
        submenu: [
            { role: 'minimize', label: 'Minimizar' },
            { role: 'zoom', label: 'Zoom' },
            { type: 'separator' },
            { role: 'front', label: 'Traer todo al frente' }
        ]
    };
    return [menuApp, edicion, ver, ventana];
}

// ─────────────────────────────────────────────
// PERMISOS DE CAMARA Y MICROFONO
// ─────────────────────────────────────────────
const ESTADOS = {
    granted: 'concedido',
    denied: 'denegado',
    'not-determined': 'no-determinado',
    restricted: 'restringido'
};
const TIPO_SISTEMA = { camara: 'camera', microfono: 'microphone' };

// En Windows siempre 'concedido': ahi no hay pedido previo, getUserMedia
// falla solo si el usuario lo apago en Configuracion, y la pantalla ya
// maneja ese error como cualquier otro.
function estadoPermiso(systemPreferences, tipo, plataforma = process.platform) {
    if (!TIPOS_PERMISO.includes(tipo)) throw new Error('tipo de permiso no valido');
    if (plataforma !== 'darwin' || !systemPreferences) return 'concedido';
    const e = systemPreferences.getMediaAccessStatus(TIPO_SISTEMA[tipo]);
    return ESTADOS[e] || 'concedido';
}

async function pedirPermiso(systemPreferences, tipo, plataforma = process.platform) {
    if (!TIPOS_PERMISO.includes(tipo)) throw new Error('tipo de permiso no valido');
    if (plataforma !== 'darwin' || !systemPreferences) return true;
    // Si ya se nego, macOS no vuelve a preguntar: askForMediaAccess devuelve
    // false al instante. La pantalla muestra el boton a Ajustes del Sistema.
    return !!(await systemPreferences.askForMediaAccess(TIPO_SISTEMA[tipo]));
}

// A que pagina de Ajustes del Sistema (o Configuracion de Windows) lleva
// cada boton. null = no hay equivalente y no se abre nada.
function urlAjustes(pagina, plataforma = process.platform) {
    if (!PAGINAS_AJUSTES.includes(pagina)) throw new Error('pagina de ajustes no valida');
    if (plataforma === 'darwin') {
        const priv = 'x-apple.systempreferences:com.apple.preference.security?';
        return {
            camara: priv + 'Privacy_Camera',
            microfono: priv + 'Privacy_Microphone',
            'red-local': priv + 'Privacy_LocalNetwork',
            // macOS 13+: el firewall esta en Red. En versiones anteriores
            // este enlace abre Ajustes del Sistema a secas, que igual sirve.
            firewall: 'x-apple.systempreferences:com.apple.Network-Settings.extension?Firewall'
        }[pagina];
    }
    if (plataforma === 'win32') {
        return {
            camara: 'ms-settings:privacy-webcam',
            microfono: 'ms-settings:privacy-microphone',
            'red-local': null,
            firewall: null
        }[pagina];
    }
    return null;
}

async function abrirAjustesSistema(shell, pagina, plataforma = process.platform) {
    const url = urlAjustes(pagina, plataforma);
    if (!url) return false;
    try {
        await shell.openExternal(url);
        return true;
    } catch (_) {
        // Un macOS que no conoce esa pagina: al menos Ajustes del Sistema.
        if (plataforma === 'darwin') {
            try { await shell.openExternal('x-apple.systempreferences:'); return true; } catch (__) { /* nada */ }
        }
        return false;
    }
}

// ─────────────────────────────────────────────
// ENERGIA
// ─────────────────────────────────────────────
// Mientras se graba o el iPad esta conectado, ni App Nap ni el reposo pueden
// frenar la app. Varios motivos pueden pedirlo a la vez ('grabacion',
// 'remoto'); el bloqueo se suelta cuando ya no queda ninguno.
// 'prevent-app-suspension' deja que la pantalla se apague (ahorra) pero no
// que el sistema suspenda la app. En Windows no cambia nada visible.
function crearEnergia(powerSaveBlocker) {
    const motivos = new Set();
    let id = null;
    function actualizar() {
        if (motivos.size && id == null) {
            id = powerSaveBlocker.start('prevent-app-suspension');
        } else if (!motivos.size && id != null) {
            if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id);
            id = null;
        }
    }
    return {
        sostener(motivo) { motivos.add(String(motivo)); actualizar(); },
        soltar(motivo) { motivos.delete(String(motivo)); actualizar(); },
        soltarTodo() { motivos.clear(); actualizar(); },
        activo() { return id != null; },
        motivos() { return [...motivos]; }
    };
}

// ─────────────────────────────────────────────
// IPC (las dos plataformas)
// ─────────────────────────────────────────────
// tv.sys.permiso / pedirPermiso / abrirAjustesSistema y
// tv.ventana.onPantallaCompleta. En Windows contestan "todo concedido" y no
// abren nada raro, asi las pantallas no preguntan en que sistema estan.
function registrarIpc({ ipcMain, systemPreferences, shell, obtenerVentana, plataforma = process.platform }) {
    manejar(ipcMain, 'sys:permiso', tipo =>
        estadoPermiso(systemPreferences, v.texto(tipo, 'tipo', { max: 20 }), plataforma));
    manejar(ipcMain, 'sys:pedirPermiso', tipo =>
        pedirPermiso(systemPreferences, v.texto(tipo, 'tipo', { max: 20 }), plataforma));
    manejar(ipcMain, 'sys:abrirAjustesSistema', pagina =>
        abrirAjustesSistema(shell, v.texto(pagina, 'pagina', { max: 20 }), plataforma));
    manejar(ipcMain, 'ventana:esPantallaCompleta', () => {
        const w = obtenerVentana();
        return !!(w && !w.isDestroyed() && w.isFullScreen());
    });
}

// Avisa a la pagina cuando entra o sale de pantalla completa: en Mac el
// semaforo desaparece y la barra deja de reservarle lugar.
function vigilarPantallaCompleta(ventana) {
    const avisar = valor => {
        if (!ventana.isDestroyed()) ventana.webContents.send('ventana:pantallaCompleta', valor);
    };
    ventana.on('enter-full-screen', () => avisar(true));
    ventana.on('leave-full-screen', () => avisar(false));
}

// ─────────────────────────────────────────────
// INSTALAR (solo Mac)
// ─────────────────────────────────────────────
// electron = require('electron'); obtenerVentana() = la ventana actual (o
// null); acciones = { abrirAjustes(), salir(), crearVentana() }.
function instalar({ electron, obtenerVentana, acciones }) {
    const { app, Menu } = electron;
    app.setAboutPanelOptions({
        applicationName: app.getName(),
        applicationVersion: app.getVersion(),
        copyright: 'Tag & View Pro'
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(plantillaMenu({
        nombreApp: app.getName(),
        desarrollo: !app.isPackaged,
        acciones
    })));
    // Cerrar la ventana cierra la app tambien en Mac (main.js sale en
    // 'window-all-closed' sin mirar la plataforma): hay una sola ventana, y
    // dejar viva una grabacion o el servidor del iPad sin nada en pantalla es
    // peligroso. Si igual macOS manda 'activate' sin ventana (clic en el Dock
    // mientras se esta cerrando), se vuelve a abrir en vez de quedar colgada.
    app.on('activate', () => {
        if (!obtenerVentana() && acciones.crearVentana) acciones.crearVentana();
    });
}

// Segunda instancia (doble clic en el icono con la app abierta): en Mac
// ademas hay que robar el foco, si no la ventana se ordena atras de todo.
function traerAlFrente(app, ventana, plataforma = process.platform) {
    if (!ventana || ventana.isDestroyed()) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
    if (plataforma === 'darwin') app.focus({ steal: true });
}

module.exports = {
    opcionesVentana, preferenciasWeb, plantillaMenu,
    estadoPermiso, pedirPermiso, urlAjustes, abrirAjustesSistema,
    crearEnergia, registrarIpc, vigilarPantallaCompleta, instalar, traerAlFrente,
    TIPOS_PERMISO, PAGINAS_AJUSTES
};
