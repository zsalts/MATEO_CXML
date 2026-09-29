// Compartir por internet: un túnel de Cloudflare hasta el servidor del iPad.
//
// En la wifi de la cancha el iPad entra directo a la compu. Desde otra red
// (otra wifi, datos del celular) no la encuentra: cloudflared abre una
// conexión SALIENTE desde la compu hasta Cloudflare y da una dirección
// https://<palabras>.trycloudflare.com que llega al servidor local. No hace
// falta abrir puertos en el router ni tocar el firewall.
//
// El túnel "rápido" de Cloudflare no pide cuenta. Es gratis y sin garantía:
// si un día no anda, se prueba de nuevo o se vuelve a la wifi.
//
// cloudflared no viene con la app (pesaría 20 a 55 MB más): se baja la
// primera vez que se comparte, una versión fija, y se revisa su SHA-256
// antes de usarlo. Queda en la carpeta de datos de la app.
//
// Quién puede entrar lo decide main/remoto.js (link con clave + PIN, y por
// el túnel solo se mira).

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const VERSION = '2026.9.3';
const BINARIOS = {
    'win32-x64':    { archivo: 'cloudflared-windows-amd64.exe', sha256: 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2' },
    // Windows en ARM corre el de x64 emulado.
    'win32-arm64':  { archivo: 'cloudflared-windows-amd64.exe', sha256: 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2' },
    'darwin-arm64': { archivo: 'cloudflared-darwin-arm64.tgz',  sha256: '587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095' },
    'darwin-x64':   { archivo: 'cloudflared-darwin-amd64.tgz',  sha256: 'd1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977' }
};
const URL_BASE = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/`;
const ESPERA_URL_MS = 45000;

// GET con redirecciones (GitHub manda al CDN). Al disco, sin juntar en memoria.
function bajar(url, destino, alProgreso, saltos = 0) {
    return new Promise((ok, mal) => {
        const req = https.get(url, { headers: { 'User-Agent': 'TagViewPro' } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && saltos < 6) {
                res.resume();
                return bajar(new URL(res.headers.location, url).toString(), destino, alProgreso, saltos + 1).then(ok, mal);
            }
            if (res.statusCode !== 200) { res.resume(); return mal(new Error(`No se pudo bajar cloudflared (HTTP ${res.statusCode})`)); }
            const total = Number(res.headers['content-length']) || 0;
            let llevo = 0;
            const hash = crypto.createHash('sha256');
            const out = fs.createWriteStream(destino);
            res.on('data', d => {
                llevo += d.length;
                hash.update(d);
                if (alProgreso && total) alProgreso(Math.round(llevo * 100 / total));
            });
            res.pipe(out);
            out.on('finish', () => ok(hash.digest('hex')));
            out.on('error', mal);
            res.on('error', mal);
        });
        req.setTimeout(60000, () => req.destroy(new Error('Se cortó la descarga de cloudflared')));
        req.on('error', mal);
    });
}

function crearTunel({ carpetaDatos, plataforma = process.platform, arquitectura = process.arch } = {}) {
    let proceso = null;
    let actual = null;          // {url, puerto}
    let abriendo = null;
    const alCaer = new Set();

    const esWin = plataforma === 'win32';
    const dir = () => path.join(carpetaDatos(), 'cloudflared', VERSION);
    const binario = () => path.join(dir(), esWin ? 'cloudflared.exe' : 'cloudflared');

    async function asegurarBinario(alProgreso) {
        const b = binario();
        if (fs.existsSync(b)) return b;
        const info = BINARIOS[`${plataforma}-${arquitectura}`];
        if (!info) throw new Error('Compartir por internet no está disponible en esta compu');
        fs.mkdirSync(dir(), { recursive: true });
        const tmp = path.join(dir(), info.archivo + '.bajando');
        const hash = await bajar(URL_BASE + info.archivo, tmp, alProgreso);
        if (hash !== info.sha256) {
            try { fs.unlinkSync(tmp); } catch (_) {}
            throw new Error('La descarga de cloudflared no es la esperada (no coincide la firma). No se usó.');
        }
        if (info.archivo.endsWith('.tgz')) {
            await new Promise((ok, mal) => execFile('tar', ['-xzf', tmp, '-C', dir()], err => (err ? mal(err) : ok())));
            fs.unlinkSync(tmp);
            if (!fs.existsSync(b)) throw new Error('El paquete de cloudflared no trajo el programa');
        } else {
            fs.renameSync(tmp, b);
        }
        if (!esWin) fs.chmodSync(b, 0o755);
        return b;
    }

    // Abre el túnel hacia http://127.0.0.1:<puerto>. Devuelve {url}.
    async function abrir(puerto, alProgreso) {
        if (actual && actual.puerto === puerto && proceso) return { url: actual.url };
        if (abriendo) return abriendo;
        abriendo = (async () => {
            cerrar();
            const b = await asegurarBinario(p => alProgreso && alProgreso({ fase: 'bajando', porcentaje: p }));
            if (alProgreso) alProgreso({ fase: 'conectando' });
            const p = spawn(b, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${puerto}`], { windowsHide: true });
            proceso = p;
            const url = await new Promise((ok, mal) => {
                let texto = '', listo = null;
                const t = setTimeout(() => fin(new Error('Cloudflare no contestó. Revisá que la compu tenga internet.')), ESPERA_URL_MS);
                function fin(err, u) {
                    clearTimeout(t);
                    p.stderr.off('data', leer);
                    p.stdout.off('data', leer);
                    if (err) { try { p.kill(); } catch (_) {} mal(err); } else ok(u);
                }
                // La dirección aparece primero; se espera a que haya al menos
                // una conexión con Cloudflare antes de mostrarla.
                function leer(d) {
                    texto = (texto + d.toString()).slice(-20000);
                    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(texto);
                    if (m) listo = m[0];
                    if (listo && /Registered tunnel connection/.test(texto)) fin(null, listo);
                }
                p.stderr.on('data', leer);
                p.stdout.on('data', leer);
                p.once('error', err => fin(err));
                p.once('exit', c => fin(new Error('cloudflared se cerró (código ' + c + ')')));
            });
            p.on('exit', () => {
                if (proceso !== p) return;
                proceso = null;
                actual = null;
                for (const f of alCaer) { try { f(); } catch (_) {} }
            });
            actual = { url, puerto };
            return { url };
        })();
        try { return await abriendo; } finally { abriendo = null; }
    }

    function cerrar() {
        const p = proceso;
        proceso = null;
        actual = null;
        if (p) { try { p.kill(); } catch (_) {} }
    }

    return {
        abrir,
        cerrar,
        estado: () => (actual ? { url: actual.url } : null),
        alCaer: f => { alCaer.add(f); return () => alCaer.delete(f); }
    };
}

module.exports = { crearTunel, VERSION, BINARIOS };
