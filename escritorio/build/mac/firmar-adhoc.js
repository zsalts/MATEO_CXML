// Hook afterPack de electron-builder (package.json → build.afterPack).
//
// Sin certificado de Apple la app sale sin firmar. En una Mac con chip Apple
// eso no alcanza para los binarios propios: macOS mata al arrancar cualquier
// ejecutable arm64 sin al menos una firma "ad-hoc". Electron ya viene firmado
// asi, pero ffmpeg y ffprobe (ffmpeg-static / ffprobe-static) no siempre:
// sin esto, cortar clips falla con "killed" y sin mas explicacion.
//
// Tambien revisa que el ffmpeg adentro de la .app sea de la misma
// arquitectura que el .dmg: ffmpeg-static baja UN binario, el de la maquina
// donde corrio npm install. Un .dmg x64 armado en una Mac M1 llevaria ffmpeg
// arm64 y cortaria clips solo en Macs nuevas. Mejor cortar el build aca.
//
// En Windows no hace nada.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// electron-builder: Arch.x64 = 1, Arch.arm64 = 3, Arch.universal = 4
const NOMBRE_ARQ = { 1: 'x86_64', 3: 'arm64', 4: 'universal' };

function buscar(dir, nombres, encontrados = []) {
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return encontrados; }
    for (const e of entradas) {
        const r = path.join(dir, e.name);
        if (e.isDirectory()) buscar(r, nombres, encontrados);
        else if (nombres.includes(e.name)) encontrados.push(r);
    }
    return encontrados;
}

function arquitecturas(archivo) {
    try {
        return execFileSync('lipo', ['-archs', archivo], { encoding: 'utf8' }).trim().split(/\s+/);
    } catch (_) {
        return [];
    }
}

function tieneFirma(archivo) {
    try {
        execFileSync('codesign', ['-dv', archivo], { stdio: 'ignore' });
        return true;
    } catch (_) {
        return false;
    }
}

exports.default = async function firmarAdhoc(contexto) {
    if (contexto.electronPlatformName !== 'darwin') return;

    const app = path.join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.app`);
    const recursos = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
    const esperada = NOMBRE_ARQ[contexto.arch];

    // ffprobe-static trae las dos arquitecturas de Mac (bin/darwin/x64 y
    // arm64), y "files" del package.json no puede decir "excluir la otra".
    // Se borra aca la que no corresponde: son decenas de MB de mas.
    if (esperada === 'x86_64' || esperada === 'arm64') {
        const otra = esperada === 'arm64' ? 'x64' : 'arm64';
        const sobra = path.join(recursos, 'ffprobe-static', 'bin', 'darwin', otra);
        if (fs.existsSync(sobra)) {
            fs.rmSync(sobra, { recursive: true, force: true });
            console.log(`  • [mac] ffprobe ${otra} quitado del .dmg ${esperada}`);
        }
    }

    const binarios = buscar(recursos, ['ffmpeg', 'ffprobe']);
    if (!binarios.length) {
        console.warn('  • [mac] no se encontro ffmpeg/ffprobe en app.asar.unpacked: los clips no van a andar');
        return;
    }

    for (const bin of binarios) {
        const archs = arquitecturas(bin);
        const rel = path.relative(app, bin);
        // ffprobe-static no trae ffprobe arm64 de verdad: su bin/darwin/arm64
        // es x86_64. En Apple Silicon corre con Rosetta 2, y la app solo lo usa
        // para tv.video.info (si falla, info() da null y la pantalla usa la
        // duracion del <video>). Se deja pasar con aviso; ffmpeg, que corta
        // los clips, tiene que ser de la arquitectura justa.
        const ffprobeConRosetta = esperada === 'arm64' && path.basename(bin) === 'ffprobe' &&
            archs.length === 1 && archs[0] === 'x86_64';
        if (ffprobeConRosetta) {
            console.warn(`  • [mac] ${rel} es x86_64: en Apple Silicon corre con Rosetta 2`);
        } else if (esperada && esperada !== 'universal' && archs.length && !archs.includes(esperada)) {
            throw new Error(`${rel} es ${archs.join('+')} y el .dmg es ${esperada}. ` +
                'Arma cada arquitectura en su propia Mac (el workflow de GitHub lo hace) ' +
                `o reinstala ffmpeg-static con npm_config_arch=${esperada === 'x86_64' ? 'x64' : 'arm64'}.`);
        }
        fs.chmodSync(bin, 0o755);
        if (!tieneFirma(bin)) {
            execFileSync('codesign', ['--force', '--sign', '-', bin], { stdio: 'inherit' });
            console.log(`  • [mac] firma ad-hoc: ${rel} (${archs.join('+') || '?'})`);
        } else {
            console.log(`  • [mac] ya firmado: ${rel} (${archs.join('+') || '?'})`);
        }
    }
};
