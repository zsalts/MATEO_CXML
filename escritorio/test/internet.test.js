// Compartir por internet: lo que llega por el túnel de Cloudflare (desde
// 127.0.0.1, con CF-Connecting-IP) necesita la llave del link, solo mira, se
// bloquea por su IP real y ve la imagen en calidad reducida.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const { crearServidorRemoto } = require('../main/remoto.js');
const { crearVivo } = require('../main/vivo.js');
const { BINARIOS, VERSION } = require('../main/tunel.js');
const WebSocket = require('ws');

const CLAVE = 'LlaveDePrueba_1234567890abc';
const HOST = 'palabras-de-prueba.trycloudflare.com';

function servidor(extra = {}) {
    return crearServidorRemoto({
        rutaRemoto: path.join(aqui, '..', 'remoto'), rutaNucleo: path.join(aqui, '..', 'src', 'nucleo'),
        plataforma: 'win32', interfaces: () => ({}), ...extra
    });
}

function pedir(puerto, ruta, cabeceras = {}) {
    return new Promise((ok, mal) => {
        http.get({ host: '127.0.0.1', port: puerto, path: ruta, headers: cabeceras }, res => {
            const partes = [];
            res.on('data', d => partes.push(d));
            res.on('end', () => ok({ status: res.statusCode, h: res.headers, cuerpo: Buffer.concat(partes) }));
        }).on('error', mal);
    });
}

// Como llega por el túnel: desde 127.0.0.1, con las cabeceras de Cloudflare.
const cf = (ip, extra = {}) => ({ 'CF-Connecting-IP': ip, 'CF-Ray': 'abc123-EZE', ...extra });

function socket(puerto, cabeceras) {
    return new Promise((ok, mal) => {
        const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws`, { headers: cabeceras });
        ws.on('open', () => ok(ws));
        ws.on('unexpected-response', (_q, res) => mal(new Error('HTTP ' + res.statusCode)));
        ws.on('error', mal);
    });
}
const siguiente = (ws, tipo) => new Promise(ok => ws.on('message', d => { const m = JSON.parse(d); if (m.tipo === tipo) ok(m); }));

test('internet: sin túnel prendido, lo que llega con cabeceras de Cloudflare no entra', async () => {
    const srv = servidor();
    const { puerto } = await srv.iniciar({ puerto: 0 });
    try {
        assert.equal((await pedir(puerto, '/clips', cf('200.1.1.1'))).status, 404);
        assert.equal((await pedir(puerto, '/clips')).status, 200, 'en la wifi sigue igual');
    } finally { await srv.detener(); }
});

test('internet: la llave del link deja una cookie; sin ella nada; la botonera nunca', async () => {
    const srv = servidor();
    const { puerto } = await srv.iniciar({ puerto: 0 });
    srv.ponerInternet({ clave: CLAVE, host: HOST, link: `https://${HOST}/clips?k=${CLAVE}` });
    try {
        assert.equal(srv.estado().internet.link, `https://${HOST}/clips?k=${CLAVE}`);
        assert.equal((await pedir(puerto, '/clips', cf('200.1.1.1'))).status, 404, 'sin llave');
        assert.equal((await pedir(puerto, '/clips?k=otra', cf('200.1.1.1'))).status, 404, 'llave mala');
        const r = await pedir(puerto, `/clips?k=${CLAVE}`, cf('200.1.1.1'));
        assert.equal(r.status, 200);
        const galleta = String(r.h['set-cookie']);
        assert.match(galleta, new RegExp(`tvk=${CLAVE}`));
        assert.match(galleta, /HttpOnly/);
        assert.match(galleta, /Secure/);
        const conGalleta = cf('200.1.1.1', { Cookie: `tvk=${CLAVE}` });
        assert.equal((await pedir(puerto, '/app.js', conGalleta)).status, 200);
        assert.equal((await pedir(puerto, '/vivo.js', conGalleta)).status, 200);
        assert.equal((await pedir(puerto, '/app.js', cf('200.1.1.1'))).status, 404, 'los archivos también piden la llave');
        assert.equal((await pedir(puerto, '/', conGalleta)).status, 404, 'la botonera no se sirve por internet');
        assert.equal((await pedir(puerto, '/index.html', conGalleta)).status, 404);

        srv.ponerInternet(null);
        assert.equal((await pedir(puerto, '/app.js', conGalleta)).status, 404, 'apagado, la cookie ya no sirve');
    } finally { await srv.detener(); }
});

test('internet: el socket pide la llave, entra solo a mirar y el PIN se bloquea por IP real', async () => {
    const srv = servidor();
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });   // sesión para codificar
    srv.ponerInternet({ clave: CLAVE, host: HOST, link: 'x' });
    const origen = { Origin: `https://${HOST}` };
    try {
        await assert.rejects(socket(puerto, cf('200.1.1.1', origen)), /403/, 'sin cookie');

        const ws = await socket(puerto, cf('200.1.1.1', { ...origen, Cookie: `tvk=${CLAVE}` }));
        const bien = siguiente(ws, 'bienvenida');
        ws.send(JSON.stringify({ tipo: 'hola', dispositivo: 'ipad-lejos-1', nombre: 'iPad', pin }));   // sin rol:'mirar'
        const b = await bien;
        assert.equal(b.activo, false, 'por internet nunca codifica');
        const cli = srv.estado().clientes.find(c => c.dispositivo === 'ipad-lejos-1');
        assert.equal(cli.rol, 'mirar');
        assert.equal(cli.lejos, true);
        ws.close();

        // 5 PIN malos desde una IP la bloquean a ella, no a las demás.
        const malo = pin === '0000' ? '1111' : '0000';
        let ultimo;
        for (let i = 0; i < 5; i++) {
            const w = await socket(puerto, cf('66.6.6.6', { ...origen, Cookie: `tvk=${CLAVE}` }));
            const r = siguiente(w, 'rechazo');
            w.send(JSON.stringify({ tipo: 'hola', dispositivo: 'ipad-malo-1', pin: malo }));
            ultimo = await r;
        }
        assert.equal(ultimo.motivo, 'bloqueado');
        const otro = await socket(puerto, cf('200.2.2.2', { ...origen, Cookie: `tvk=${CLAVE}` }));
        const bien2 = siguiente(otro, 'bienvenida');
        otro.send(JSON.stringify({ tipo: 'hola', dispositivo: 'ipad-lejos-2', pin }));
        await bien2;
        otro.close();
    } finally { await srv.detener(); }
});

test('internet: /vivo da la imagen reducida; la entera queda para la wifi', async () => {
    const vivo = crearVivo(), vivoBajo = crearVivo();
    const srv = servidor({ vivo, vivoBajo });
    const { puerto, pin } = await srv.iniciar({ puerto: 0, soloMirar: true });
    srv.ponerInternet({ clave: CLAVE, host: HOST, link: 'x' });
    const cab = cf('200.1.1.1', { Origin: `https://${HOST}`, Cookie: `tvk=${CLAVE}` });
    const ws = await socket(puerto, cab);
    const bien = siguiente(ws, 'bienvenida');
    ws.send(JSON.stringify({ tipo: 'hola', dispositivo: 'ipad-lejos-9', pin }));
    const { token } = await bien;
    const ruta = `/vivo?d=ipad-lejos-9&t=${encodeURIComponent(token)}`;
    // Un init mínimo: ftyp + moov vacío (sin pistas: todos los fragmentos cuentan como clave).
    const caja = (t, cuerpo = Buffer.alloc(0)) => Buffer.concat([Buffer.from([0, 0, 0, 8 + cuerpo.length]), Buffer.from(t), cuerpo]);
    const init = n => Buffer.concat([caja('ftyp', Buffer.from([n, 0, 0, 0])), caja('moov')]);
    try {
        vivo.iniciar('video/mp4');
        vivo.trozo(init(1));
        assert.equal((await pedir(puerto, ruta, cab)).status, 503, 'sin la reducida no se manda la entera');

        vivoBajo.iniciar('video/mp4');
        vivoBajo.trozo(init(2));
        const r = await new Promise((ok, mal) => {
            http.get({ host: '127.0.0.1', port: puerto, path: ruta, headers: cab }, res => {
                res.once('data', d => { ok({ status: res.statusCode, d }); res.destroy(); });
            }).on('error', mal);
        });
        assert.equal(r.status, 200);
        assert.ok(r.d.equals(init(2)), 'la reducida');
    } finally {
        ws.close();
        vivo.terminar(); vivoBajo.terminar();
        await srv.detener();
    }
});

test('tunel: versión fija y un SHA-256 por plataforma', () => {
    assert.match(VERSION, /^\d{4}\.\d+\.\d+$/);
    for (const [k, b] of Object.entries(BINARIOS)) {
        assert.match(b.sha256, /^[0-9a-f]{64}$/, k);
        assert.ok(b.archivo.startsWith('cloudflared-'), k);
    }
});
