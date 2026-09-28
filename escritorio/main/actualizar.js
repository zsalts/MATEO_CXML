// Actualización sola (Windows).
//
// Cada push a la rama app arma un instalador nuevo y lo publica en GitHub
// Releases (.github/workflows/escritorio-windows.yml). La app instalada mira
// ahí al arrancar y cada 4 horas; si hay una versión más nueva la baja en
// segundo plano y se instala sola la próxima vez que se cierra. La pantalla
// avisa y ofrece "Reiniciar ahora", que pasa por el mismo cierre de siempre:
// si se está grabando, pregunta antes.
//
// Solo empaquetada y solo en Windows: en desarrollo no hay nada que
// actualizar, y en Mac una app sin firma de Apple no se puede reemplazar sola.

const { manejar } = require('./ipc');

const CADA = 4 * 60 * 60 * 1000;

function crearActualizador({ app, ventana }) {
    let estado = { fase: 'nada' };        // nada | buscando | bajando | lista | error
    let updater = null;
    let reiniciar = false;               // se pidió "Reiniciar ahora"

    function avisar(nuevo) {
        estado = { ...estado, ...nuevo };
        const w = ventana();
        if (w && !w.isDestroyed()) w.webContents.send('actualizar:estado', estado);
    }

    function activo() {
        return app.isPackaged && process.platform === 'win32';
    }

    function arrancar() {
        if (!activo()) return;
        try {
            ({ autoUpdater: updater } = require('electron-updater'));
        } catch (err) {
            console.warn('Sin actualizaciones:', err.message);
            return;
        }
        updater.autoDownload = true;
        updater.autoInstallOnAppQuit = true;
        updater.on('checking-for-update', () => avisar({ fase: 'buscando' }));
        updater.on('update-not-available', () => avisar({ fase: 'nada' }));
        updater.on('update-available', i => avisar({ fase: 'bajando', version: i.version, porcentaje: 0 }));
        updater.on('download-progress', p => avisar({ fase: 'bajando', porcentaje: Math.round(p.percent || 0) }));
        updater.on('update-downloaded', i => avisar({ fase: 'lista', version: i.version }));
        // Sin internet o GitHub caído no es un problema de la app: se anota y
        // se reintenta en la próxima vuelta.
        updater.on('error', err => { console.warn('Actualizar:', err && err.message); avisar({ fase: 'error' }); });

        const buscar = () => updater.checkForUpdates().catch(err => console.warn('Actualizar:', err && err.message));
        setTimeout(buscar, 10000);
        const t = setInterval(buscar, CADA);
        if (t.unref) t.unref();
    }

    function registrar(ipcMain) {
        manejar(ipcMain, 'actualizar:estado', () => ({ ...estado, actual: app.getVersion(), activo: activo() }));
        manejar(ipcMain, 'actualizar:buscar', async () => {
            if (!updater) return false;
            await updater.checkForUpdates();
            return true;
        });
        // Reiniciar ahora: app.quit() pasa por before-quit, que cierra la
        // grabación y la base en orden y al final llama a alTerminarDeCerrar().
        // quitAndInstall no se llama acá: lanza el instalador en el acto, y el
        // instalador mata la app aunque esté a mitad de escribir la base.
        manejar(ipcMain, 'actualizar:instalar', () => {
            if (!updater || estado.fase !== 'lista') return false;
            reiniciar = true;
            app.quit();
            return true;
        });
    }

    // Lo llama main.js con todo ya cerrado. true = el actualizador se encarga
    // de salir (instala y vuelve a abrir la app). Si no se pidió reiniciar,
    // autoInstallOnAppQuit instala igual al salir, sin volver a abrir.
    function alTerminarDeCerrar() {
        if (!reiniciar || !updater || estado.fase !== 'lista') return false;
        updater.quitAndInstall(true, true);
        return true;
    }

    return { arrancar, registrar, alTerminarDeCerrar };
}

module.exports = { crearActualizador };
