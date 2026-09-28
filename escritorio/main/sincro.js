// Sincronizacion de plantillas con el iPad, por la nube.
//
// La regla (quien gana, borrados, primera vez) esta en sincro.js de la raiz:
// el mismo archivo que usa el iPad, asi los dos deciden lo mismo. Aca solo se
// baja plantillas.json, se une con la base, se aplica lo que gano afuera y se
// sube si gano algo de aca.
//
// Cuando: al arrancar, cada minuto, al volver a la ventana y unos segundos
// despues de guardar, borrar o importar una plantilla. Sin sesion de la nube
// no hace nada (la pantalla ofrece entrar); sin red, reintenta en la vuelta
// siguiente. Nunca pregunta nada: no puede molestar en medio de un partido.

const path = require('path');
const { manejar, v } = require('./ipc');

// En desarrollo, el de la raiz del repo; empaquetada, la copia que
// build/preparar.js deja en build/.
function cargarRegla() {
    for (const ruta of [path.join(__dirname, '..', '..', 'sincro.js'), path.join(__dirname, '..', 'build', 'sincro.js')]) {
        try { return require(ruta); } catch (_) { /* la otra */ }
    }
    return null;
}

const CADA = 60 * 1000;
const TRAS_CAMBIO = 3000;
const AL_VOLVER = 20 * 1000;

function crearSincro({ app, bd, nube, abrirBase, ventana }) {
    const regla = cargarRegla();
    let estado = { fase: regla ? 'nada' : 'sin-regla' };   // nada | sincronizando | ok | sin-sesion | error
    let enCurso = null, otraVez = false, demora = null, ultima = 0;

    function mandar(canal, dato) {
        const w = ventana();
        if (w && !w.isDestroyed()) w.webContents.send(canal, dato);
    }
    function avisar(nuevo) {
        estado = { ...estado, ...nuevo };
        mandar('sincro:estado', estado);
    }

    async function una() {
        ultima = Date.now();
        const n = nube.estado();
        if (!n.configurada) return avisar({ fase: 'nada' });
        if (!n.conSesion) return avisar({ fase: 'sin-sesion' });
        avisar({ fase: 'sincronizando' });
        await abrirBase();
        const texto = await nube.bajar(regla.ARCHIVO);
        const r = regla.fusionar(bd.plantillasParaSincro(), regla.leerArchivo(texto || ''));
        const cambios = bd.aplicarSincro(r);
        if (r.subir) await nube.subir(regla.ARCHIVO, regla.armarArchivo(r.plantillas, 'la compu'));
        bd.marcarSincronizadas(r.plantillas.filter(x => x.borrado).map(x => x.uid));
        if (cambios) mandar('plantillas:cambiaron', { cambios });
        avisar({ fase: 'ok', ultima: new Date().toISOString(), error: '', email: n.email });
    }

    // Una sola a la vez; lo que se pida mientras tanto hace una vuelta mas.
    function sincronizar() {
        if (!regla) return Promise.resolve(estado);
        if (enCurso) { otraVez = true; return enCurso; }
        enCurso = (async () => {
            try {
                do { otraVez = false; await una(); } while (otraVez);
            } catch (err) {
                if (err && err.necesitaLogin) avisar({ fase: 'sin-sesion' });
                else avisar({ fase: 'error', error: (err && err.message) || String(err) });
            } finally {
                enCurso = null;
            }
            return estado;
        })();
        return enCurso;
    }

    // Despues de guardar varias seguidas (el editor guarda a mano, importar
    // trae muchas) va una sola vuelta, unos segundos despues.
    function programar() {
        clearTimeout(demora);
        demora = setTimeout(() => { sincronizar(); }, TRAS_CAMBIO);
    }

    function arrancar() {
        if (!regla) { console.warn('Sin sincro.js: las plantillas no se sincronizan'); return; }
        setTimeout(sincronizar, 8000);
        const t = setInterval(sincronizar, CADA);
        if (t.unref) t.unref();
        app.on('browser-window-focus', () => { if (Date.now() - ultima > AL_VOLVER) sincronizar(); });
    }

    function registrar(ipcMain) {
        manejar(ipcMain, 'sincro:estado', () => ({ ...estado, nube: nube.estado() }));
        manejar(ipcMain, 'sincro:ahora', async () => ({ ...(await sincronizar()), nube: nube.estado() }));
        // Entrar a la nube desde la compu (el mismo correo que en el iPad) y
        // sincronizar enseguida.
        manejar(ipcMain, 'sincro:entrar', async credenciales => {
            v.objeto(credenciales, 'credenciales');
            await nube.entrar({ correo: v.texto(credenciales.correo, 'correo', { max: 300 }),
                                clave: v.texto(credenciales.clave, 'clave', { max: 300 }) });
            return { ...(await sincronizar()), nube: nube.estado() };
        });
        manejar(ipcMain, 'sincro:salir', () => { nube.salir(); avisar({ fase: 'sin-sesion' }); return { ...estado, nube: nube.estado() }; });
    }

    return { arrancar, registrar, programar, sincronizar };
}

module.exports = { crearSincro };
