// node --test test/plataforma-clips.test.js
//
// Corta de verdad con el ffmpeg que viene con la app. Incluye cortar sobre un
// MP4 fragmentado que se esta escribiendo en ese momento (como el de
// MediaRecorder): ffmpeg lo genera en tiempo real con -re.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ff = require('../main/ffmpeg');
const clips = require('../main/clips');
const { subcarpetaSegura } = require('../main/rutas');

const hayFfmpeg = !!ff.rutaFfmpeg() && !!ff.rutaFfprobe();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-clips-'));

// Video de prueba: contador de 30 fps, keyframe cada medio segundo, MP4
// fragmentado como el que escribe MediaRecorder.
function argsVideo(segundos, salida, tiempoReal) {
    return ['-hide_banner', '-loglevel', 'error', '-y', ...(tiempoReal ? ['-re'] : []),
        '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=30:duration=${segundos}`,
        '-f', 'lavfi', '-i', `sine=frequency=440:duration=${segundos}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '15', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-shortest',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '500000',
        salida];
}

const duracion = async r => (await ff.info(r)).duracion;

test('sin ffmpeg: disponible() dice que no', { skip: hayFfmpeg }, () => {
    assert.strictEqual(clips.disponible(), false);
});

test('corta sin recomprimir: un archivo por corte y todos en uno', { skip: !hayFfmpeg, timeout: 60000 }, async () => {
    const fuente = path.join(dir, 'partido.mp4');
    const r = await ff.correr(ff.rutaFfmpeg(), argsVideo(12, fuente, false));
    assert.strictEqual(r.codigo, 0, r.err);
    const inf = await ff.info(fuente);
    assert.ok(Math.abs(inf.duracion - 12) < 0.2, 'duracion ' + inf.duracion);
    assert.strictEqual(inf.ancho, 320);

    const opciones = { dirTrabajo: dir, subcarpetaSegura, enCurso: () => null };
    const a = await clips.exportar({
        ruta: fuente, subcarpeta: 'Partidos/Prueba',
        cortes: [{ desde: 2, hasta: 5, nombre: 'Tiro 1' }, { desde: 8, hasta: 9.5, nombre: 'Gol: el mejor' }]
    }, opciones);
    assert.deepStrictEqual(a.rutas.map(x => path.relative(dir, x)),
        [path.join('Partidos', 'Prueba', 'Clips', 'Tiro 1.mp4'), path.join('Partidos', 'Prueba', 'Clips', 'Gol_ el mejor.mp4')]);
    const d1 = await duracion(a.rutas[0]), d2 = await duracion(a.rutas[1]);
    console.log(`  clips: ${d1.toFixed(2)} s y ${d2.toFixed(2)} s (pedidos 3 y 1.5)`);
    // -c copy arranca en el keyframe anterior: hasta ~1 s de mas por corte, nunca de menos.
    assert.ok(d1 >= 2.9 && d1 <= 4.1, 'clip 1 dura ' + d1);
    assert.ok(d2 >= 1.4 && d2 <= 2.6, 'clip 2 dura ' + d2);
    // Sin recomprimir: mismo codec y tamano
    assert.strictEqual((await ff.info(a.rutas[0])).codec, 'h264');

    // Cortar lo mismo otra vez no pisa: "(2)"
    const b = await clips.exportar({ ruta: fuente, subcarpeta: 'Partidos/Prueba', cortes: [{ desde: 2, hasta: 5, nombre: 'Tiro 1' }] }, opciones);
    assert.strictEqual(path.basename(b.rutas[0]), 'Tiro 1 (2).mp4');

    const u = await clips.exportar({
        ruta: fuente, destino: 'uno', nombre: 'Resumen', subcarpeta: 'Partidos/Prueba',
        cortes: [{ desde: 1, hasta: 3 }, { desde: 6, hasta: 8 }, { desde: 10, hasta: 11 }]
    }, opciones);
    assert.strictEqual(u.rutas.length, 1);
    assert.strictEqual(path.basename(u.rutas[0]), 'Resumen.mp4');
    const du = await duracion(u.rutas[0]);
    console.log(`  resumen: ${du.toFixed(2)} s (pedidos 5)`);
    assert.ok(du >= 4.8 && du <= 8, 'resumen dura ' + du);

    await assert.rejects(clips.exportar({ ruta: fuente, cortes: [{ desde: 5, hasta: 2 }] }, opciones), /mayor/);
});

test('corta sobre un archivo que se esta grabando, esperando lo que falta', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
    const vivo = path.join(dir, 'en vivo.mp4');
    const t0 = Date.now();
    const grabadora = spawn(ff.rutaFfmpeg(), argsVideo(25, vivo, true), { windowsHide: true });
    let termino = false;
    grabadora.on('close', () => { termino = true; });
    // Lo que main/video.js informa de la grabacion activa.
    const enCurso = () => termino ? null : { ruta: vivo, segundosEscritos: () => (Date.now() - t0) / 1000 - 0.7 };
    const opciones = { dirTrabajo: dir, subcarpetaSegura, enCurso, espera: 20000 };

    try {
        while (!fs.existsSync(vivo) || fs.statSync(vivo).size < 50000) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 2500));

        // 1) Un tramo que ya esta en el disco: sale enseguida.
        let t = Date.now();
        const ya = await clips.exportar({ ruta: vivo, cortes: [{ desde: 0.5, hasta: 2, nombre: 'ya grabado' }] }, opciones);
        const dYa = await duracion(ya.rutas[0]);
        console.log(`  en vivo, tramo ya grabado: ${dYa.toFixed(2)} s, listo en ${Date.now() - t} ms (grabacion en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
        assert.ok(dYa >= 1.4, 'dura ' + dYa);

        // 2) Un tramo que todavia no llego: espera y lo corta cuando esta.
        const pedidoEn = (Date.now() - t0) / 1000;
        t = Date.now();
        const futuro = await clips.exportar({ ruta: vivo, cortes: [{ desde: pedidoEn + 1, hasta: pedidoEn + 4, nombre: 'todavia no' }] }, opciones);
        const dFut = await duracion(futuro.rutas[0]);
        console.log(`  en vivo, tramo ${(pedidoEn + 1).toFixed(1)}-${(pedidoEn + 4).toFixed(1)} s pedido a los ${pedidoEn.toFixed(1)} s: espero ${Date.now() - t} ms, clip de ${dFut.toFixed(2)} s`);
        assert.ok(Date.now() - t >= 3000, 'tenia que esperar');
        assert.ok(dFut >= 2.9, 'el clip quedo corto: ' + dFut);
        assert.ok(!termino, 'la grabacion tenia que seguir');

        // 3) Un tramo que no va a llegar a tiempo: error claro, no un clip roto.
        await assert.rejects(
            clips.exportar({ ruta: vivo, cortes: [{ desde: 200, hasta: 210 }] }, { ...opciones, espera: 1500 }),
            /todavia no se grabo/);
    } finally {
        grabadora.kill();
    }
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} });
