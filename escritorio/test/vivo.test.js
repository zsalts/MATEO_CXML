// La imagen en vivo para el iPad que mira: main/vivo.js (partir el MP4 de
// MediaRecorder) y /vivo en main/remoto.js (repartirlo).

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const { crearVivo } = require('../main/vivo.js');
const { crearServidorRemoto } = require('../main/remoto.js');
const WebSocket = require('ws');

// ── Un MP4 fragmentado chico, armado a mano como el de Chromium ──
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const caja = (tipo, ...partes) => {
    const cuerpo = Buffer.concat(partes);
    return Buffer.concat([u32(8 + cuerpo.length), Buffer.from(tipo, 'latin1'), cuerpo]);
};
const full = (tipo, version, flags, ...partes) => caja(tipo, Buffer.from([version, flags >> 16 & 255, flags >> 8 & 255, flags & 255]), ...partes);

function trak(id, manejo, entrada) {
    const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(id), Buffer.alloc(68));
    const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from(manejo, 'latin1'), Buffer.alloc(13));
    const stsd = full('stsd', 0, 0, u32(1), entrada);
    return caja('trak', tkhd, caja('mdia', hdlr, caja('minf', caja('stbl', stsd))));
}
const avc1 = caja('avc1', Buffer.alloc(78), caja('avcC', Buffer.from([1, 0x64, 0x00, 0x28, 0xff])));
const mp4a = caja('mp4a', Buffer.alloc(28));
const NO_SYNC = 0x10000;
const trex = id => full('trex', 0, 0, u32(id), u32(1), u32(0), u32(0), u32(NO_SYNC));
const INIT = Buffer.concat([
    caja('ftyp', Buffer.from('isom'), u32(0)),
    caja('moov', trak(1, 'vide', avc1), trak(2, 'soun', mp4a), caja('mvex', trex(1), trex(2)))
]);
// Clave: first_sample_flags del trun sin "no sync". Si no, vale el trex (no sync).
function fragmento(n, clave) {
    const tfhd = full('tfhd', 0, 0x020000, u32(1));
    const trun = clave ? full('trun', 0, 0x05, u32(1), u32(0), u32(0)) : full('trun', 0, 0x01, u32(1), u32(0));
    return Buffer.concat([caja('moof', caja('traf', tfhd, trun)), caja('mdat', Buffer.from([n, n, n]))]);
}

test('vivo: parte el init y los fragmentos aunque los trozos corten cajas por la mitad', () => {
    const v = crearVivo();
    v.iniciar('video/mp4;codecs=avc1.640028,mp4a.40.2');
    const todo = Buffer.concat([INIT, fragmento(1, true), fragmento(2, false), fragmento(3, true), fragmento(4, false)]);
    assert.equal(v.suscribir({}), null, 'sin init todavía no hay nada que mirar');
    // De a 7 bytes: ningún trozo coincide con una caja.
    for (let i = 0; i < INIT.length + 10; i += 7) v.trozo(todo.subarray(i, Math.min(i + 7, INIT.length + 10)));
    const llegan = [];
    const s = v.suscribir({ fragmento: (f, c) => llegan.push([f[f.length - 1], c]), fin: () => llegan.push('fin') });
    assert.ok(s);
    assert.ok(s.init.equals(INIT));
    assert.equal(s.codecs, 'avc1.640028,mp4a.40.2');
    v.trozo(todo.subarray(INIT.length + 10));
    assert.deepEqual(llegan, [[1, true], [2, false], [3, true], [4, false]]);

    // El que entra tarde arranca en el último cuadro clave.
    const tarde = v.suscribir({ fragmento() {}, fin() {} });
    assert.deepEqual(tarde.gop.map(f => f[f.length - 1]), [3, 4]);

    v.terminar();
    assert.equal(llegan[llegan.length - 1], 'fin');
    assert.equal(v.hay(), false);
});

test('vivo: con WebM no hay imagen en vivo', () => {
    const v = crearVivo();
    v.iniciar('video/webm;codecs=vp9,opus');
    v.trozo(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    assert.equal(v.hay(), false);
});

// ── /vivo en el servidor ──
function entrar(puerto, pin) {
    return new Promise((ok, mal) => {
        const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws`);
        ws.on('open', () => ws.send(JSON.stringify({ tipo: 'hola', dispositivo: 'ipad-mira-9', nombre: 'iPad', pin, rol: 'mirar' })));
        ws.on('message', d => { const m = JSON.parse(d); if (m.tipo === 'bienvenida') ok({ ws, token: m.token }); });
        ws.on('error', mal);
    });
}

test('/vivo: 503 sin grabación; con grabación manda init + desde el último clave y lo que sigue; sin token, 404', async () => {
    const vivo = crearVivo();
    const srv = crearServidorRemoto({
        rutaRemoto: path.join(aqui, '..', 'remoto'), rutaNucleo: path.join(aqui, '..', 'src', 'nucleo'),
        plataforma: 'win32', interfaces: () => ({}), vivo
    });
    const { puerto, pin } = await srv.iniciar({ puerto: 0, soloMirar: true });
    const { ws, token } = await entrar(puerto, pin);
    const url = `/vivo?d=ipad-mira-9&t=${encodeURIComponent(token)}`;
    const pedir = (ruta, alRecibir) => new Promise((ok, mal) => {
        http.get({ host: '127.0.0.1', port: puerto, path: ruta }, res => {
            const partes = [];
            res.on('data', d => { partes.push(d); if (alRecibir) alRecibir(Buffer.concat(partes)); });
            res.on('end', () => ok({ status: res.statusCode, h: res.headers, cuerpo: Buffer.concat(partes) }));
        }).on('error', mal);
    });
    try {
        assert.equal((await pedir(url)).status, 503);
        assert.equal((await pedir('/vivo?d=ipad-mira-9&t=malo')).status, 404);

        vivo.iniciar('video/mp4');
        vivo.trozo(Buffer.concat([INIT, fragmento(1, true), fragmento(2, false), fragmento(3, true)]));
        let pedido = false;
        const r = await pedir(url, cuerpo => {
            // Llegó el init y el GOP: se graba uno más y se termina.
            if (!pedido && cuerpo.length >= INIT.length + fragmento(3, true).length) {
                pedido = true;
                vivo.trozo(fragmento(4, false));
                vivo.terminar();
            }
        });
        assert.equal(r.status, 200);
        assert.equal(r.h['x-codecs'], 'avc1.640028,mp4a.40.2');
        assert.ok(r.cuerpo.equals(Buffer.concat([INIT, fragmento(3, true), fragmento(4, false)])));
    } finally {
        ws.close();
        await srv.detener();
    }
});

test('clips pendientes: aparecen sin archivo y /clip no los sirve hasta que llega la ruta', async () => {
    const srv = crearServidorRemoto({
        rutaRemoto: path.join(aqui, '..', 'remoto'), rutaNucleo: path.join(aqui, '..', 'src', 'nucleo'),
        plataforma: 'win32', interfaces: () => ({}), permitirClip: () => true
    });
    const { puerto, pin } = await srv.iniciar({ puerto: 0, soloMirar: true });
    const { ws, token } = await entrar(puerto, pin);
    try {
        const llega = new Promise(ok => ws.on('message', d => { const m = JSON.parse(d); if (m.tipo === 'clip') ok(m); }));
        assert.equal(srv.enviar({ tipo: 'clip', clip: { id: 'c1', pendiente: true, nombre: 'Tiro', inicio: 5, duracion: 4 } }), true);
        const m = await llega;
        assert.equal(m.clip.pendiente, true);
        const st = await new Promise(ok => http.get({ host: '127.0.0.1', port: puerto, path: `/clip/c1?d=ipad-mira-9&t=${encodeURIComponent(token)}` },
            res => { res.resume(); ok(res.statusCode); }));
        assert.equal(st, 404);
    } finally {
        ws.close();
        await srv.detener();
    }
});
