// Actualización sola en Mac, sin firma de Apple.
//
// electron-updater en Mac usa Squirrel.Mac, que exige que la app vieja y la
// nueva estén firmadas con el mismo certificado de Apple (Developer ID). Sin
// ese certificado (la app sale con firma ad-hoc, ver build/mac/firmar-adhoc.js)
// Squirrel rechaza toda actualización. Por eso acá se hace a mano:
//
//   1. buscar(): la última release de GitHub. Si es más nueva, baja el .zip
//      de esta arquitectura (Tag-View-Pro-<versión>-<arm64|x64>-mac.zip, lo
//      sube .github/workflows/escritorio-windows.yml), lo abre con ditto (que
//      respeta los enlaces y permisos de adentro de la .app), y revisa que la
//      .app nueva diga esa versión y tenga su firma entera.
//   2. Al cerrar la app, un script aparte espera a que el proceso termine,
//      cambia la .app vieja por la nueva y, si se pidió "Reiniciar", la abre.
//
// Lo que baja la app misma no queda en cuarentena (eso lo marcan Safari y
// compañía), así que macOS no vuelve a preguntar "¿Abrir igual?".
//
// Si la .app no se puede reemplazar (abierta desde el .dmg, o en una carpeta
// sin permiso, o macOS la "traslada" a una ruta de solo lectura), no se baja
// nada: se avisa que hay una versión nueva y el botón abre la descarga.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const REPO = 'zsalts/MATEO_CXML';
const PAGINA_RELEASES = `https://github.com/${REPO}/releases/latest`;

// "2.1.10" > "2.1.9". Sin letras raras: si algo no es número, cuenta 0.
function esMasNueva(nueva, actual) {
    const p = v => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const a = p(nueva), b = p(actual);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
}

const arquitectura = (arch = process.arch) => (arch === 'arm64' ? 'arm64' : 'x64');
const nombreZip = (version, arch) => `Tag-View-Pro-${String(version).replace(/^v/i, '')}-${arquitectura(arch)}-mac.zip`;

// La .app que está corriendo: .../Tag & View Pro.app/Contents/MacOS/<exe>.
function bundleActual(execPath = process.execPath) {
    const b = path.resolve(path.dirname(execPath), '..', '..');
    return /\.app$/i.test(b) ? b : null;
}

// ¿Se puede cambiar la .app de lugar? Abierta desde el .dmg (/Volumes) o
// trasladada por macOS (AppTranslocation) es de solo lectura.
function sePuedeReemplazar(bundle) {
    if (!bundle || /\/AppTranslocation\//.test(bundle) || /^\/Volumes\//.test(bundle)) return false;
    try {
        fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
        fs.accessSync(bundle, fs.constants.W_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function correr(bin, args) {
    return new Promise((ok, mal) => execFile(bin, args, { timeout: 5 * 60 * 1000 }, (err, out) => (err ? mal(err) : ok(String(out)))));
}

// El script que cambia la .app. Espera a que la app vieja cierre del todo:
// mientras corre, sus archivos están abiertos. Si mover la nueva falla, deja
// la vieja donde estaba: peor que no actualizar es quedarse sin app.
function scriptReemplazo() {
    return [
        '#!/bin/sh',
        'pid="$1"; viejo="$2"; nuevo="$3"; abrir="$4"',
        'i=0',
        'while kill -0 "$pid" 2>/dev/null && [ $i -lt 240 ]; do sleep 0.5; i=$((i+1)); done',
        'resguardo="$viejo.anterior"',
        'rm -rf "$resguardo"',
        'if mv "$viejo" "$resguardo"; then',
        '  if mv "$nuevo" "$viejo"; then rm -rf "$resguardo"; else mv "$resguardo" "$viejo"; fi',
        'fi',
        'xattr -dr com.apple.quarantine "$viejo" 2>/dev/null',
        'if [ "$abrir" = "1" ]; then open "$viejo"; fi',
        ''
    ].join('\n');
}

async function bajar(url, destino, alProgreso) {
    const r = await fetch(url, { headers: { 'User-Agent': 'TagViewPro-actualizar' } });
    if (!r.ok || !r.body) throw new Error(`GitHub contestó ${r.status}`);
    const total = Number(r.headers.get('content-length')) || 0;
    let hecho = 0, ultimo = -1;
    const archivo = fs.createWriteStream(destino);
    try {
        for await (const trozo of r.body) {
            hecho += trozo.length;
            if (!archivo.write(trozo)) await new Promise(ok => archivo.once('drain', ok));
            const pc = total ? Math.floor((hecho / total) * 100) : 0;
            if (pc !== ultimo) { ultimo = pc; alProgreso(pc); }
        }
    } finally {
        await new Promise(ok => archivo.end(ok));
    }
    if (total && hecho !== total) throw new Error('La descarga quedó cortada');
}

function crearActualizadorMac({ app, shell, avisar }) {
    let lista = null;       // {version, app: ruta de la .app nueva}
    let manual = null;      // {version} cuando no se puede reemplazar sola

    async function buscar() {
        if (lista) return;
        avisar({ fase: 'buscando' });
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { 'User-Agent': 'TagViewPro-actualizar', Accept: 'application/vnd.github+json' }
        });
        if (!r.ok) throw new Error(`GitHub contestó ${r.status}`);
        const rel = await r.json();
        const version = String(rel.tag_name || '').replace(/^v/i, '');
        if (!esMasNueva(version, app.getVersion())) { avisar({ fase: 'nada', buscadoEn: Date.now() }); return; }

        const bundle = bundleActual();
        if (!sePuedeReemplazar(bundle)) {
            manual = { version };
            avisar({ fase: 'manual', version });
            return;
        }
        const asset = (rel.assets || []).find(a => a.name === nombreZip(version));
        // Todavía se está subiendo (la de Mac llega después que la de
        // Windows): se prueba en la próxima vuelta.
        if (!asset) { avisar({ fase: 'nada', buscadoEn: Date.now() }); return; }

        avisar({ fase: 'bajando', version, porcentaje: 0 });
        const dir = path.join(os.tmpdir(), 'tagview-actualizacion', version);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const zip = path.join(dir, asset.name);
        await bajar(asset.browser_download_url, zip, porcentaje => avisar({ fase: 'bajando', version, porcentaje }));

        const abierta = path.join(dir, 'app');
        await correr('/usr/bin/ditto', ['-x', '-k', zip, abierta]);
        fs.rmSync(zip, { force: true });
        const nombre = fs.readdirSync(abierta).find(n => /\.app$/i.test(n));
        if (!nombre) throw new Error('El .zip no trae la app');
        const nueva = path.join(abierta, nombre);
        const dice = (await correr('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw',
            path.join(nueva, 'Contents', 'Info.plist')])).trim();
        if (dice !== version) throw new Error(`El .zip dice ${dice}, se esperaba ${version}`);
        // Una .app con la firma rota no abre en un Mac con chip Apple: mejor
        // no instalarla que dejar al usuario sin app.
        await correr('/usr/bin/codesign', ['--verify', '--deep', nueva]);
        lista = { version, app: nueva };
        avisar({ fase: 'lista', version });
    }

    // Con todo ya cerrado (main.js). Lanza el cambio y deja que la app
    // salga sola: el script espera a que el proceso termine.
    function alCerrar(reabrir) {
        if (!lista) return false;
        const bundle = bundleActual();
        if (!sePuedeReemplazar(bundle)) return false;
        const script = path.join(os.tmpdir(), 'tagview-actualizacion', 'reemplazar.sh');
        fs.writeFileSync(script, scriptReemplazo(), { mode: 0o755 });
        spawn('/bin/sh', [script, String(process.pid), bundle, lista.app, reabrir ? '1' : '0'],
            { detached: true, stdio: 'ignore' }).unref();
        lista = null;
        return true;
    }

    return {
        buscar,
        alCerrar,
        hayLista: () => !!lista,
        abrirDescarga: () => shell.openExternal(PAGINA_RELEASES),
        esManual: () => !!manual
    };
}

module.exports = { crearActualizadorMac, esMasNueva, nombreZip, bundleActual, sePuedeReemplazar, scriptReemplazo };
