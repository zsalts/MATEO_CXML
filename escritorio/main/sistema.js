// IPC de archivos, ajustes, sistema y ventana.

const fs = require('fs');
const path = require('path');
const bd = require('../db');
const { manejar, v } = require('./ipc');
const { nombreSeguro, nombreLibre, subcarpetaSegura, decodificarTexto, codificarTexto } = require('./rutas');
const ff = require('./ffmpeg');

const MAX_TEXTO = 20 * 1024 * 1024;
const SEMANA = 7 * 24 * 3600 * 1000;

// ¿Parece texto? Sin bytes nulos en el primer tramo (salvo UTF-16 con BOM).
function pareceTexto(buf) {
    if (buf.length >= 2 && ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF))) return true;
    const n = Math.min(buf.length, 8192);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return true;
}

function sello(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function crearSistema({ app, dialog, shell, config, ventana, video, abrirBase }) {
    const carpeta = () => config.carpeta();

    async function respaldarBase() {
        await abrirBase();
        bd.persistirYa();
        const dir = path.join(carpeta(), 'Respaldos');
        fs.mkdirSync(dir, { recursive: true });
        const destino = nombreLibre(dir, `tagview ${sello()}.sqlite`);
        fs.copyFileSync(bd.ruta(), destino);
        config.cambiar(c => { c.ultimoRespaldo = new Date().toISOString(); });
        return destino;
    }

    // Una copia por semana sola, al abrir. Se guardan las ultimas 8.
    async function respaldoSemanal() {
        const ultimo = Date.parse(config.leer().ultimoRespaldo || '') || 0;
        if (Date.now() - ultimo < SEMANA) return null;
        await abrirBase();
        if (!fs.existsSync(bd.ruta())) return null;
        const ruta = await respaldarBase();
        const dir = path.dirname(ruta);
        const viejos = fs.readdirSync(dir).filter(n => /^tagview .*\.sqlite$/.test(n)).sort().reverse().slice(8);
        viejos.forEach(n => { try { fs.unlinkSync(path.join(dir, n)); } catch (_) {} });
        return ruta;
    }

    function registrar(ipcMain) {
        // ─── Archivos ───
        manejar(ipcMain, 'archivos:elegir', async opciones => {
            const o = v.objeto(opciones, 'opciones', { opcional: true });
            const filtros = v.lista(o.filtros, 'filtros', { opcional: true, max: 20 }).map(f => ({
                name: v.texto(f && f.nombre, 'nombre del filtro', { max: 100 }),
                extensions: v.lista(f.extensiones, 'extensiones', { max: 50 })
                    .map(e => String(e).replace(/^\./, '').toLowerCase())
            }));
            const r = await dialog.showOpenDialog(ventana(), {
                title: v.texto(o.titulo, 'titulo', { opcional: true, max: 200 }) || 'Elegir archivo',
                properties: ['openFile'],
                filters: filtros.length ? filtros : undefined
            });
            if (r.canceled || !r.filePaths.length) return null;
            const ruta = r.filePaths[0];
            video.permitir(ruta);
            const st = fs.statSync(ruta);
            let contenido = null;
            if (st.size <= MAX_TEXTO) {
                const buf = fs.readFileSync(ruta);
                if (pareceTexto(buf)) contenido = decodificarTexto(buf);
            }
            return {
                ruta,
                nombre: path.basename(ruta),
                extension: path.extname(ruta).replace(/^\./, '').toLowerCase(),
                bytes: st.size,
                contenido
            };
        });

        // XML → UTF-16 con BOM (Sportscode), CSV → UTF-8 con BOM (Excel).
        // pisar:true reemplaza el archivo si ya existe (re-exportar el XML de
        // un partido); si no, "(2)".
        manejar(ipcMain, 'archivos:guardarTexto', o => {
            v.objeto(o, 'opciones');
            const ext = (v.texto(o.extension, 'extension', { max: 10 })).replace(/^\./, '').toLowerCase();
            if (!/^[a-z0-9]{1,10}$/.test(ext)) throw new Error('extension invalida');
            if (typeof o.contenido !== 'string') throw new Error('contenido tiene que ser texto');
            const dir = subcarpetaSegura(carpeta(), v.texto(o.subcarpeta, 'subcarpeta', { opcional: true, max: 400 }) || '');
            fs.mkdirSync(dir, { recursive: true });
            const nombre = nombreSeguro(v.texto(o.nombre, 'nombre', { max: 300 }), 'Archivo') + '.' + ext;
            const ruta = o.pisar ? path.join(dir, nombre) : nombreLibre(dir, nombre);
            const tmp = ruta + '.tmp';
            fs.writeFileSync(tmp, codificarTexto(o.contenido, ext, o.codificacion));
            fs.renameSync(tmp, ruta);
            return ruta;
        });

        manejar(ipcMain, 'archivos:mostrar', ruta => {
            v.texto(ruta, 'ruta', { max: 1000 });
            if (fs.existsSync(ruta)) shell.showItemInFolder(ruta);
            return true;
        });

        manejar(ipcMain, 'archivos:abrirCarpeta', async sub => {
            const dir = subcarpetaSegura(carpeta(), v.texto(sub, 'subcarpeta', { opcional: true, max: 400 }) || '');
            fs.mkdirSync(dir, { recursive: true });
            const err = await shell.openPath(dir);
            if (err) throw new Error(err);
            return true;
        });

        manejar(ipcMain, 'archivos:respaldarBase', () => respaldarBase());

        // ─── Ajustes ───
        manejar(ipcMain, 'ajustes:leer', () => config.ajustes());
        manejar(ipcMain, 'ajustes:guardar', parcial => config.guardarAjustes(parcial));

        // ─── Sistema ───
        manejar(ipcMain, 'sys:info', () => ({
            version: app.getVersion(),
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            carpeta: carpeta(),
            base: path.join(carpeta(), 'tagview.sqlite'),
            ffmpeg: !!ff.rutaFfmpeg(),
            empaquetada: app.isPackaged,
            // El router pone data-plataforma="mac"|"win" con esto (Agente 7).
            plataforma: process.platform,
            arquitectura: process.arch
        }));

        manejar(ipcMain, 'sys:elegirCarpeta', async () => {
            const r = await dialog.showOpenDialog(ventana(), {
                title: 'Donde guardar los partidos',
                defaultPath: carpeta(),
                properties: ['openDirectory', 'createDirectory']
            });
            if (r.canceled || !r.filePaths.length) return { carpeta: carpeta(), cambio: false };
            const nueva = config.ponerCarpeta(r.filePaths[0]);
            // La base de la carpeta nueva se abre (o se crea) ahora: mejor
            // enterarse aca si no se puede escribir ahi.
            await abrirBase();
            return { carpeta: nueva, cambio: true };
        });

        // ─── Ventana ───
        // La barra superior la dibuja la pagina; los botones de Windows
        // (minimizar, maximizar, cerrar) los pinta Electron con estos colores.
        manejar(ipcMain, 'ventana:tema', t => {
            v.objeto(t, 'tema');
            const color = x => (typeof x === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(x.trim())) ? x.trim() : null;
            const fondo = color(t.fondo), simbolos = color(t.simbolos);
            const w = ventana();
            if (!w || w.isDestroyed()) return false;
            try {
                w.setTitleBarOverlay({ ...(fondo ? { color: fondo } : {}), ...(simbolos ? { symbolColor: simbolos } : {}), height: 36 });
            } catch (_) { /* sin overlay (otro sistema) */ }
            if (fondo && fondo.startsWith('#')) w.setBackgroundColor(fondo);
            return true;
        });
    }

    return { registrar, respaldarBase, respaldoSemanal };
}

module.exports = { crearSistema, pareceTexto };
