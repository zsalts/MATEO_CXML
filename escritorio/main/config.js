// config.json en %APPDATA%\tagview-escritorio: donde esta la carpeta de
// trabajo, los ajustes, el tamano de la ventana y la sesion de la nube.
//
// No va en la carpeta de trabajo porque es lo que dice DONDE esta esa carpeta.

const path = require('path');
const fs = require('fs');

const AJUSTES_DEFECTO = {
    tema: 'sistema',              // 'sistema' | 'claro' | 'oscuro'
    calidad: 'alta',              // la usa la grabadora (Agente 4)
    margen: 2,                    // segundos antes/despues al ver o cortar un clip
    puertoRemoto: 8787,           // servidor wifi para el iPad
    copiarVideosImportados: true  // al importar, copiar el video a la carpeta del partido
};

// Claves que no son ajustes y no se tocan desde tv.ajustes.guardar().
const RESERVADAS = new Set(['ventana', 'nubeSesion', 'ultimoRespaldo', 'carpeta']);

function crearConfig(dirUsuario, carpetaPorDefecto) {
    const ruta = path.join(dirUsuario, 'config.json');
    let cache = null;

    function leer() {
        if (cache) return cache;
        try { cache = JSON.parse(fs.readFileSync(ruta, 'utf8')) || {}; }
        catch (_) { cache = {}; }
        return cache;
    }

    function escribir(cfg) {
        cache = cfg;
        fs.mkdirSync(path.dirname(ruta), { recursive: true });
        const tmp = ruta + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
        fs.renameSync(tmp, ruta);
    }

    function cambiar(fn) {
        const cfg = { ...leer() };
        fn(cfg);
        escribir(cfg);
        return cfg;
    }

    // Carpeta de trabajo: videos, XML, clips y la base. Todo junto, asi mover
    // la carpeta se lleva los partidos enteros.
    function carpeta() {
        const c = leer().carpeta || carpetaPorDefecto;
        fs.mkdirSync(c, { recursive: true });
        return c;
    }

    function ajustes() {
        const cfg = leer();
        const out = { ...AJUSTES_DEFECTO };
        Object.keys(cfg).forEach(k => { if (!RESERVADAS.has(k)) out[k] = cfg[k]; });
        out.carpeta = carpeta();
        return out;
    }

    // Solo valores simples: nada de funciones ni objetos enormes en el config.
    function guardarAjustes(parcial) {
        if (!parcial || typeof parcial !== 'object' || Array.isArray(parcial)) {
            throw new Error('ajustes.guardar espera un objeto');
        }
        cambiar(cfg => {
            Object.keys(parcial).forEach(k => {
                if (RESERVADAS.has(k) || k.startsWith('__')) return;
                const v = parcial[k];
                if (v === null || v === undefined) { delete cfg[k]; return; }
                if (!['string', 'number', 'boolean'].includes(typeof v) &&
                    !(typeof v === 'object' && JSON.stringify(v).length < 20000)) {
                    throw new Error(`Ajuste invalido: ${k}`);
                }
                if (k === 'puertoRemoto' && !(Number.isInteger(v) && v >= 1024 && v <= 65535)) {
                    throw new Error('El puerto tiene que ser un numero entre 1024 y 65535');
                }
                cfg[k] = v;
            });
        });
        return ajustes();
    }

    function ponerCarpeta(c) {
        fs.mkdirSync(c, { recursive: true });
        cambiar(cfg => { cfg.carpeta = c; });
        return carpeta();
    }

    return { ruta, leer, cambiar, carpeta, ajustes, guardarAjustes, ponerCarpeta };
}

module.exports = { crearConfig, AJUSTES_DEFECTO };
