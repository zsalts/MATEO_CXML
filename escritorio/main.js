// Proceso principal de Tag & View Pro para Windows.
//
// Arma la plataforma sobre la que corren las pantallas de escritorio/src:
//   - el esquema app://tagview (main/protocolo.js)
//   - la ventana (main/ventana.js)
//   - la API window.tv: cada tema registra sus handlers en main/*.js y
//     preload.js los expone
//   - la base SQLite (db.js)
//   - el servidor wifi para el iPad (main/remoto.js, si esta)
//
// Aca solo se enchufan las piezas y se ordena el arranque y la salida.

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, screen, Menu, safeStorage, systemPreferences, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

const bd = require('./db');
const { declararEsquema, servir, ORIGEN } = require('./main/protocolo');
const { crearConfig } = require('./main/config');
const { crearVentana } = require('./main/ventana');
const { crearVideo } = require('./main/video');
const { crearSistema } = require('./main/sistema');
const { registrarDatos } = require('./main/datos');
const { crearNube } = require('./main/nube');
const { crearActualizador } = require('./main/actualizar');
const { crearSincro } = require('./main/sincro');
// Lo de macOS (menu, permisos, semaforo, energia) vive en main/mac.js; aca
// solo se enchufa. En Windows: IPC de permisos que dicen "concedido" y el
// bloqueo de suspension mientras se graba, nada visible.
const mac = require('./main/mac');
const esMac = process.platform === 'darwin';

// Una sola instancia: abrir el acceso directo con la app abierta la trae al
// frente en vez de abrir otra que pelee por la misma base y la misma camara.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

declararEsquema(protocol);

const RUTA_SRC = path.join(__dirname, 'src');

// nube-config.js: en desarrollo, el de la web (un nivel arriba); empaquetada,
// la copia que build/preparar.js deja en build/.
const RUTA_NUBE = app.isPackaged
    ? [path.join(__dirname, 'build', 'nube-config.js')]
    : [path.join(__dirname, '..', 'nube-config.js'), path.join(__dirname, 'build', 'nube-config.js')];

const config = crearConfig(app.getPath('userData'), path.join(app.getPath('videos'), 'Tag & View Pro'));

let ventana = null;
const laVentana = () => ventana;

// Abre la base de la carpeta de trabajo actual (o la reusa). Si se cambio de
// carpeta, db.abrir cierra la vieja y abre la nueva.
function abrirBase() {
    return bd.abrir(path.join(config.carpeta(), 'tagview.sqlite'));
}

const video = crearVideo({ carpeta: config.carpeta, ventana: laVentana, dialog, origen: ORIGEN });
const sistema = crearSistema({ app, dialog, shell, config, ventana: laVentana, video, abrirBase });

// La sesion de la nube se guarda cifrada con la cuenta de Windows si se puede;
// si no, solo vive mientras la app esta abierta.
const nube = crearNube({
    rutaConfig: () => RUTA_NUBE.find(r => fs.existsSync(r)) || RUTA_NUBE[0],
    guardarSesion: s => config.cambiar(c => {
        if (!s || !safeStorage.isEncryptionAvailable()) { delete c.nubeSesion; return; }
        c.nubeSesion = safeStorage.encryptString(JSON.stringify(s)).toString('base64');
    }),
    leerSesion: () => {
        const cifrada = config.leer().nubeSesion;
        if (!cifrada || !safeStorage.isEncryptionAvailable()) return null;
        try { return JSON.parse(safeStorage.decryptString(Buffer.from(cifrada, 'base64'))); } catch (_) { return null; }
    }
});

video.registrar(ipcMain);
sistema.registrar(ipcMain);
// Plantillas sincronizadas con el iPad por la nube (main/sincro.js).
const sincro = crearSincro({ app, bd, nube, abrirBase, ventana: laVentana });
sincro.registrar(ipcMain);
registrarDatos(ipcMain, { abrirBase, video, dialog, ventana: laVentana, nube, alCambiarPlantillas: () => sincro.programar() });
mac.registrarIpc({ ipcMain, systemPreferences, shell, obtenerVentana: laVentana });

// Versiones nuevas desde GitHub Releases (main/actualizar.js).
const actualizador = crearActualizador({ app, ventana: laVentana });
actualizador.registrar(ipcMain);

// Mientras se graba o el iPad esta conectado, ni App Nap (Mac) ni el reposo
// pueden frenar la app. Se mira cada 2 s en vez de tocar video.js y remoto.js.
const energia = mac.crearEnergia(powerSaveBlocker);
function vigilarEnergia() {
    const t = setInterval(() => {
        if (video.enCurso()) energia.sostener('grabacion'); else energia.soltar('grabacion');
        let conIpad = false;
        try { conIpad = !!(servidorIpad && servidorIpad.estado().activo); } catch (_) { /* sin remoto */ }
        if (conIpad) energia.sostener('remoto'); else energia.soltar('remoto');
    }, 2000);
    if (t.unref) t.unref();
}

// ─────────────────────────────────────────────
// CAPTURA DESDE iPad (opcional)
// ─────────────────────────────────────────────
let remoto = null;
let servidorIpad = null;   // lo que devuelve remoto.registrar (para la energia)
function enchufarRemoto() {
    try {
        remoto = require('./main/remoto');
        // Para remoto.js la base tiene que estar abierta al leer: se le pasa
        // una version que la abre antes (la carpeta pudo haber cambiado).
        const bdRemoto = Object.assign(Object.create(bd), {
            leerPlantilla: async id => { await abrirBase(); return bd.leerPlantilla(id); },
            listarPlantillas: async () => { await abrirBase(); return bd.listarPlantillas(); }
        });
        servidorIpad = remoto.registrar({ ipcMain, ventana: laVentana, bd: bdRemoto, carpeta: config.carpeta, rutaSrc: RUTA_SRC });
    } catch (e) {
        remoto = null;
        console.warn('Sin captura desde iPad:', e.message);
    }
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────
// En Mac, ⌘, del menu va a Ajustes: la pagina escucha tv.ventana.onIrA.
function irA(rama) {
    const w = laVentana();
    if (w && !w.isDestroyed()) { mac.traerAlFrente(app, w); w.webContents.send('ventana:irA', rama); }
}

function abrirVentana() {
    ventana = crearVentana({
        BrowserWindow, screen, shell, app, config,
        origen: ORIGEN, preload: path.join(__dirname, 'preload.js')
    });
    ventana.on('closed', () => { ventana = null; });
    // Boton rojo / Alt+F4 grabando: se pregunta ANTES de cerrar (con la
    // ventana cerrada la grabacion ya no existe).
    ventana.on('close', e => {
        if (salidaConfirmada || !video.enCurso()) return;
        e.preventDefault();
        confirmarSalida().then(ok => { if (ok) app.quit(); });
    });
    mac.vigilarPantallaCompleta(ventana);
    return ventana;
}

app.whenReady().then(async () => {
    if (esMac) {
        // Sin menu, en Mac no andan ⌘C/⌘V/⌘Q/⌘H. ⌘Q pasa por app.quit() →
        // before-quit: el mismo cierre que en Windows.
        mac.instalar({
            electron: require('electron'),
            obtenerVentana: laVentana,
            acciones: { abrirAjustes: () => irA('ajustes'), salir: () => app.quit(), crearVentana: abrirVentana }
        });
    } else {
        Menu.setApplicationMenu(null);
    }
    servir(protocol, { rutaSrc: RUTA_SRC, video });

    try {
        await abrirBase();
    } catch (err) {
        // Sin base la app no sirve: mejor decirlo claro que abrir una ventana
        // donde nada guarda.
        dialog.showErrorBox('Tag & View Pro', 'No se pudo abrir la base de datos:\n\n' + err.message +
            '\n\nCarpeta: ' + config.carpeta());
        app.exit(1);
        return;
    }

    abrirVentana();

    enchufarRemoto();
    vigilarEnergia();
    actualizador.arrancar();
    sincro.arrancar();

    // La copia semanal no frena el arranque.
    setTimeout(() => sistema.respaldoSemanal().catch(e => console.warn('Respaldo semanal:', e.message)), 5000);
});

app.on('second-instance', () => {
    if (!ventana) return;
    // En Mac ademas roba el foco; si no, la ventana queda atras de todo.
    mac.traerAlFrente(app, ventana);
});

// ─────────────────────────────────────────────
// SALIDA
// ─────────────────────────────────────────────
// Un solo camino: cerrar la ventana llega a before-quit, y ahi, en orden,
// se cierra la grabacion (lo grabado queda reproducible), se apaga el
// servidor del iPad y al final se escribe y cierra la base.
// Tambien en Mac: hay una sola ventana, y dejar viva una grabacion o el
// servidor del iPad sin nada en pantalla es peligroso (ver main/mac.js).
app.on('window-all-closed', () => app.quit());

// Si hay algo grabando, preguntar antes de salir (⌘Q, menu, boton rojo o la
// X de Windows: todos terminan aca).
let salidaConfirmada = false;
async function confirmarSalida() {
    if (salidaConfirmada || !video.enCurso()) return true;
    const w = laVentana();
    const r = await dialog.showMessageBox(w && !w.isDestroyed() ? w : undefined, {
        type: 'warning',
        buttons: ['Seguir grabando', 'Salir'],
        defaultId: 0,
        cancelId: 0,
        message: 'Se está grabando un partido',
        detail: 'Si salís, la grabación se corta acá. Lo grabado hasta ahora queda guardado en el disco.'
    });
    salidaConfirmada = r.response === 1;
    return salidaConfirmada;
}

let saliendo = false, listoParaSalir = false;
app.on('before-quit', (e) => {
    if (listoParaSalir) return;
    e.preventDefault();
    if (saliendo) return;
    saliendo = true;
    (async () => {
        if (!(await confirmarSalida())) { saliendo = false; return; }
        energia.soltarTodo();
        try { await video.finalizar(); } catch (err) { console.error('Al cerrar la grabacion:', err); }
        try { if (remoto && typeof remoto.detener === 'function') await remoto.detener(); } catch (err) { console.error('Al detener el remoto:', err); }
        try { bd.cerrar(); } catch (err) { console.error('Al cerrar la base:', err); }
        listoParaSalir = true;
        // "Reiniciar ahora" de una actualización: instala y vuelve a abrir.
        if (actualizador.alTerminarDeCerrar()) return;
        app.quit();
    })();
});
