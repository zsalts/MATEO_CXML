// Pruebas del servidor wifi del iPad (main/remoto.js) con un cliente ws de
// verdad, en un puerto libre.
//   node --test escritorio/test/ipad*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const { crearServidorRemoto, ipsLocales, resolverRuta } = require('../main/remoto.js');
const WebSocket = require('ws');
const { crearCola } = await import('../remoto/cola.js');
const { crearReloj } = await import('../remoto/reloj.js');

// Raices de juguete: remoto/ y nucleo/ con un archivo cada una, y al lado
// cosas que NO se tienen que poder leer (incluida una carpeta hermana
// "nucleo2", la trampa del startsWith).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-ipad-'));
fs.mkdirSync(path.join(tmp, 'remoto'));
fs.mkdirSync(path.join(tmp, 'src', 'nucleo'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'src', 'nucleo2'));
fs.writeFileSync(path.join(tmp, 'remoto', 'index.html'), '<h1>iPad</h1>');
fs.writeFileSync(path.join(tmp, 'remoto', 'app.js'), 'export {}');
fs.writeFileSync(path.join(tmp, 'src', 'nucleo', 'plantilla.js'), 'export const x = 1;');
fs.writeFileSync(path.join(tmp, 'src', 'nucleo2', 'secreto.js'), 'secreto');
fs.writeFileSync(path.join(tmp, 'src', 'app.js'), 'secreto');
fs.writeFileSync(path.join(tmp, 'main.js'), 'secreto');

function nuevo(extra = {}) {
    const mensajes = [], clientes = [];
    let t = 1_000_000;
    const reloj = { ahora: () => t, pasar: ms => { t += ms; } };
    const srv = crearServidorRemoto({
        rutaRemoto: path.join(tmp, 'remoto'),
        rutaNucleo: path.join(tmp, 'src', 'nucleo'),
        alMensaje: m => mensajes.push(m),
        alCliente: e => clientes.push(e),
        // Nombres de adaptadores de Windows: se prueba el filtro de Windows
        // también cuando las pruebas corren en la Mac del workflow.
        plataforma: 'win32',
        interfaces: () => ({
            'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.50', internal: false }],
            'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }]
        }),
        ...(extra.relojFalso ? { ahora: reloj.ahora } : {})
    });
    return { srv, mensajes, clientes, reloj };
}

// Cliente de prueba: abre, manda y junta lo que llega.
function cliente(puerto, { origin } = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws`, origin ? { origin } : {});
    const llegados = [];
    const esperando = [];
    ws.on('message', d => {
        const m = JSON.parse(String(d));
        llegados.push(m);
        for (const e of [...esperando]) if (e.f(m)) { esperando.splice(esperando.indexOf(e), 1); e.ok(m); }
    });
    const abierto = new Promise((ok, mal) => { ws.once('open', ok); ws.once('error', mal); });
    const cerrado = new Promise(ok => ws.once('close', (codigo) => ok(codigo)));
    return {
        ws, llegados, abierto, cerrado,
        mandar: m => ws.send(JSON.stringify(m)),
        esperar(f, ms = 2000) {
            const ya = llegados.find(f);
            if (ya) return Promise.resolve(ya);
            return new Promise((ok, mal) => {
                const e = { f, ok };
                esperando.push(e);
                setTimeout(() => mal(new Error('no llego')), ms).unref();
            });
        }
    };
}

async function entrar(puerto, datos) {
    const c = cliente(puerto);
    await c.abierto;
    c.mandar({ tipo: 'hola', dispositivo: 'ipad-prueba-1', nombre: 'iPad', ...datos });
    const r = await c.esperar(m => m.tipo === 'bienvenida' || m.tipo === 'rechazo');
    return { c, r };
}

function pedir(puerto, ruta, metodo = 'GET') {
    return new Promise((ok, mal) => {
        // path crudo: http.request no normaliza los "..", asi llegan al servidor tal cual.
        const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo }, res => {
            let cuerpo = '';
            res.on('data', d => { cuerpo += d; });
            res.on('end', () => ok({ status: res.statusCode, cuerpo, tipo: res.headers['content-type'] }));
        });
        req.on('error', mal);
        req.end();
    });
}

test('PIN malo: rechaza, cuenta intentos y bloquea tras 5 por 1 minuto', async () => {
    const { srv, reloj } = nuevo({ relojFalso: true });
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });
    const malo = pin === '0000' ? '1111' : '0000';
    try {
        for (let i = 1; i <= 4; i++) {
            const { r } = await entrar(puerto, { pin: malo });
            assert.equal(r.tipo, 'rechazo');
            assert.equal(r.motivo, 'pin');
            assert.equal(r.quedan, 5 - i);
        }
        const quinto = await entrar(puerto, { pin: malo });
        assert.equal(quinto.r.motivo, 'bloqueado');
        // Bloqueado: ni con el PIN bueno.
        const bueno = await entrar(puerto, { pin });
        assert.equal(bueno.r.motivo, 'bloqueado');
        assert.ok(bueno.r.esperaMs > 0 && bueno.r.esperaMs <= 60000);
        // Pasado el minuto, entra.
        reloj.pasar(61_000);
        const despues = await entrar(puerto, { pin });
        assert.equal(despues.r.tipo, 'bienvenida');
        despues.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('sin PIN no se acepta nada: acciones antes del hola se ignoran', async () => {
    const { srv, mensajes } = nuevo();
    const { puerto } = await srv.iniciar({ puerto: 0 });
    try {
        const c = cliente(puerto);
        await c.abierto;
        c.mandar({ tipo: 'accion', n: 1, accion: { tipo: 'tocar', elementoId: 1, momento: 1 } });
        c.mandar({ tipo: 'hola', dispositivo: 'ipad-prueba-1' });   // sin pin ni token
        const codigo = await c.cerrado;
        assert.equal(codigo, 4005);
        assert.equal(mensajes.length, 0);
    } finally {
        await srv.detener();
    }
});

test('token: reconecta sin PIN mientras el servidor siga; con servidor nuevo, no', async () => {
    const { srv } = nuevo();
    let { puerto, pin } = await srv.iniciar({ puerto: 0 });
    try {
        const a = await entrar(puerto, { pin });
        assert.equal(a.r.tipo, 'bienvenida');
        assert.ok(a.r.token && a.r.token.length >= 20);
        a.c.ws.close();
        await a.c.cerrado;

        const b = await entrar(puerto, { token: a.r.token });
        assert.equal(b.r.tipo, 'bienvenida');
        assert.equal(b.r.token, a.r.token);
        assert.equal(b.r.sesion, a.r.sesion);
        b.c.ws.close();

        const falso = await entrar(puerto, { token: 'x'.repeat(24) });
        assert.equal(falso.r.motivo, 'token');

        // Servidor reiniciado: PIN y sesion nuevos, el token viejo no vale.
        ({ puerto, pin } = await srv.iniciar({ puerto: 0 }));
        const c = await entrar(puerto, { token: a.r.token });
        assert.equal(c.r.motivo, 'token');
        const d = await entrar(puerto, { pin });
        assert.notEqual(d.r.sesion, a.r.sesion);
        d.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('HTTP: sirve remoto/ y nucleo/, y 404 para todo lo demas', async () => {
    const { srv } = nuevo();
    const { puerto } = await srv.iniciar({ puerto: 0 });
    try {
        const idx = await pedir(puerto, '/');
        assert.equal(idx.status, 200);
        assert.match(idx.cuerpo, /iPad/);
        const js = await pedir(puerto, '/app.js');
        assert.equal(js.status, 200);
        assert.match(js.tipo, /javascript/);
        const nuc = await pedir(puerto, '/nucleo/plantilla.js');
        assert.equal(nuc.status, 200);
        assert.match(nuc.tipo, /javascript/);

        const prohibidas = [
            '/../main.js', '/%2e%2e/main.js', '/%2E%2E/%2e%2e/main.js',
            '/nucleo/../app.js', '/nucleo/%2e%2e/app.js', '/nucleo/%2e%2e/%2e%2e/main.js',
            '/nucleo2/secreto.js', '/nucleo/../nucleo2/secreto.js', '/nucleo/%2e%2e/nucleo2/secreto.js',
            '/..%5cmain.js', '/nucleo/..%5c..%5cmain.js', '/%5c..%5cmain.js',
            '/app.js%00.png', '/nucleo/', '/nucleo', '/main.js', '/src/app.js',
            '//etc/passwd', '/C:/Windows/win.ini', '/%2e/app.js'
        ];
        for (const r of prohibidas) {
            const res = await pedir(puerto, r);
            assert.equal(res.status, 404, `${r} tendria que ser 404 y fue ${res.status}`);
            assert.doesNotMatch(res.cuerpo, /secreto/);
        }
        assert.equal((await pedir(puerto, '/app.js', 'POST')).status, 405);
        assert.equal((await pedir(puerto, '/app.js', 'PUT')).status, 405);
    } finally {
        await srv.detener();
    }
});

test('resolverRuta: la misma regla, sin servidor', () => {
    const raices = { remoto: path.join(tmp, 'remoto'), nucleo: path.join(tmp, 'src', 'nucleo') };
    assert.equal(resolverRuta('/app.js', raices), path.join(tmp, 'remoto', 'app.js'));
    assert.equal(resolverRuta('/nucleo/plantilla.js', raices), path.join(tmp, 'src', 'nucleo', 'plantilla.js'));
    assert.equal(resolverRuta('/%2e%2e/main.js', raices), null);
    assert.equal(resolverRuta('/nucleo/%2e%2e%2fapp.js', raices), null);
    assert.equal(resolverRuta('/%E0%A4%A', raices), null);   // mal codificado
});

test('WebSocket: solo en /ws y desde la misma pagina', async () => {
    const { srv } = nuevo();
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });
    try {
        const otroPath = new WebSocket(`ws://127.0.0.1:${puerto}/otro`);
        await assert.rejects(new Promise((ok, mal) => { otroPath.once('open', ok); otroPath.once('error', mal); }));
        const ajeno = cliente(puerto, { origin: 'http://malo.example' });
        await assert.rejects(ajeno.abierto);
        const propio = cliente(puerto, { origin: `http://127.0.0.1:${puerto}` });
        await propio.abierto;
        propio.mandar({ tipo: 'hola', dispositivo: 'ipad-prueba-1', pin });
        assert.equal((await propio.esperar(m => m.tipo === 'bienvenida')).tipo, 'bienvenida');
        propio.ws.close();
    } finally {
        await srv.detener();
    }
});

test('cola: 20 toques, wifi cortado en el 8 → los 20 aplicados, ninguno dos veces', async () => {
    const { srv, mensajes } = nuevo();
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });
    // El iPad de mentira: la cola y el reloj de la pagina de verdad, con un
    // localStorage falso que sobrevive al "corte".
    const guardado = new Map();
    const almacen = { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) };
    const reloj = crearReloj();
    reloj.muestra(0, 0, 0);   // desfase 0: aca se prueba la cola, no el reloj
    let cola = crearCola({ almacen, reloj });
    try {
        const a = await entrar(puerto, { pin });
        cola.sesion(a.r.sesion);
        a.c.ws.on('message', d => { const m = JSON.parse(String(d)); if (m.tipo === 'ack') cola.confirmar(m.n); });

        for (let i = 1; i <= 8; i++) {
            const m = cola.agregar({ tipo: 'tocar', elementoId: 100 + i });
            a.c.mandar(m);
        }
        // Corte brusco apenas sale el 8: algunos acks no vuelven nunca.
        a.c.ws.terminate();
        await a.c.cerrado;

        // Sin wifi, se sigue tocando. Y la pagina se recarga (cola nueva
        // leida del localStorage) para que tambien eso quede probado.
        for (let i = 9; i <= 20; i++) cola.agregar({ tipo: 'tocar', elementoId: 100 + i });
        cola = crearCola({ almacen, reloj });
        assert.ok(cola.cantidad() >= 12, `quedaron ${cola.cantidad()} en la cola`);

        const b = await entrar(puerto, { token: a.r.token });
        cola.sesion(b.r.sesion);
        cola.confirmar(b.r.aplicado);
        b.c.ws.on('message', d => { const m = JSON.parse(String(d)); if (m.tipo === 'ack') cola.confirmar(m.n); });
        // Reenvia todo lo pendiente, incluidos los que quizas ya habian entrado.
        for (const m of cola.pendientes()) b.c.mandar(m);
        // Y un reenvio de mas, como si el iPad dudara: tampoco duplica.
        for (const m of [{ tipo: 'accion', n: 3, accion: { tipo: 'tocar', elementoId: 103, momento: 0 } }]) b.c.mandar(m);
        await b.c.esperar(m => m.tipo === 'ack' && m.n === 20);
        await new Promise(r => setTimeout(r, 50));

        const ns = mensajes.filter(m => m.tipo === 'accion').map(m => m.n);
        assert.deepEqual(ns, Array.from({ length: 20 }, (_, i) => i + 1));
        const ids = mensajes.filter(m => m.tipo === 'accion').map(m => m.accion.elementoId);
        assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => 101 + i));
        assert.equal(cola.cantidad(), 0);
        b.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('un iPad por vez: el segundo mira y pide el control; la compu lo da', async () => {
    const { srv, mensajes, clientes } = nuevo();
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });
    try {
        const a = await entrar(puerto, { pin });
        assert.equal(a.r.activo, true);
        const c2 = cliente(puerto);
        await c2.abierto;
        c2.mandar({ tipo: 'hola', dispositivo: 'ipad-prueba-2', nombre: 'iPad 2', pin });
        const b = await c2.esperar(m => m.tipo === 'bienvenida');
        assert.equal(b.activo, false);

        // El que mira no aplica acciones.
        c2.mandar({ tipo: 'accion', n: 1, accion: { tipo: 'tocar', elementoId: 9, momento: 1 } });
        c2.mandar({ tipo: 'pedirControl' });
        await new Promise(r => setTimeout(r, 50));
        assert.equal(mensajes.filter(m => m.tipo === 'accion').length, 0);
        assert.ok(clientes.some(e => e.evento === 'pideControl' && e.dispositivo === 'ipad-prueba-2'));

        srv.enviar({ tipo: 'darControl', dispositivo: 'ipad-prueba-2' });
        assert.equal((await c2.esperar(m => m.tipo === 'control')).activo, true);
        assert.equal((await a.c.esperar(m => m.tipo === 'control')).activo, false);
        c2.mandar({ tipo: 'accion', n: 1, accion: { tipo: 'tocar', elementoId: 9, momento: 1 } });
        await c2.esperar(m => m.tipo === 'ack' && m.n === 1);
        assert.equal(mensajes.filter(m => m.tipo === 'accion').length, 1);

        // Los mensajes de la rama llegan a los dos (el que mira tambien ve).
        srv.enviar({ tipo: 'estado', enCurso: true, reloj: 12 });
        await a.c.esperar(m => m.tipo === 'estado');
        await c2.esperar(m => m.tipo === 'estado');
        const est = srv.estado();
        assert.equal(est.clientes.length, 2);
        assert.equal(est.clientes.find(x => x.activo).dispositivo, 'ipad-prueba-2');
        a.c.ws.close(); c2.ws.close();
    } finally {
        await srv.detener();
    }
});

test('ping/pong: el iPad estima desfase y latencia; estado() informa latenciaMs', async () => {
    const { srv } = nuevo();
    const { puerto, pin } = await srv.iniciar({ puerto: 0 });
    try {
        const a = await entrar(puerto, { pin });
        // Reloj del iPad atrasado 5 s contra el de la compu.
        const relojIpad = () => Date.now() - 5000;
        const reloj = crearReloj();
        for (let i = 0; i < 8; i++) {
            const t0 = relojIpad();
            a.c.mandar({ tipo: 'ping', t0, latenciaMs: reloj.latencia() });
            const p = await a.c.esperar(m => m.tipo === 'pong' && m.t0 === t0);
            reloj.muestra(p.t0, p.tServidor, relojIpad());
        }
        assert.ok(Math.abs(reloj.desfase() - 5000) < 30, `desfase ${reloj.desfase()}`);
        const toque = relojIpad();
        assert.ok(Math.abs(reloj.aServidor(toque) - (toque + 5000)) < 30);
        a.c.mandar({ tipo: 'ping', t0: relojIpad(), latenciaMs: 17 });
        await a.c.esperar(m => m.tipo === 'pong' && m.t0 !== undefined);
        await new Promise(r => setTimeout(r, 30));
        assert.equal(srv.estado().latenciaMs, 17);
        a.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('iniciar: PIN de 4 digitos nuevo cada vez, IPs sin adaptadores virtuales, QR si hay qrcode', async () => {
    const { srv } = nuevo();
    try {
        const a = await srv.iniciar({ puerto: 0 });
        assert.match(a.pin, /^\d{4}$/);
        assert.deepEqual(a.ips, ['192.168.1.50']);
        assert.equal(a.url, `http://192.168.1.50:${a.puerto}/`);
        let hayQr = true;
        try { require.resolve('qrcode'); } catch (_) { hayQr = false; }
        if (hayQr) assert.match(a.qrSvg, /^<svg/);
        const pines = new Set([a.pin]);
        for (let i = 0; i < 5; i++) pines.add((await srv.iniciar({ puerto: 0 })).pin);
        assert.ok(pines.size >= 2, 'el PIN tendria que cambiar');
    } finally {
        await srv.detener();
    }
});

test('puerto ocupado: prueba los siguientes', async () => {
    const ocupa = http.createServer();
    await new Promise(ok => ocupa.listen(0, '0.0.0.0', ok));
    const p = ocupa.address().port;
    const { srv } = nuevo();
    try {
        const r = await srv.iniciar({ puerto: p });
        assert.notEqual(r.puerto, p);
        assert.ok(r.puerto > p && r.puerto <= p + 9);
    } finally {
        await srv.detener();
        ocupa.close();
    }
});

test('ipsLocales: privadas, sin virtuales ni loopback, la wifi primero', () => {
    const r = ipsLocales({
        'Ethernet': [{ family: 'IPv4', address: '10.0.0.5', internal: false }],
        'Wi-Fi': [{ family: 'IPv4', address: '192.168.0.20', internal: false },
                  { family: 'IPv6', address: 'fe80::1', internal: false }],
        'vEthernet (Default Switch)': [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
        'VirtualBox Host-Only Network': [{ family: 'IPv4', address: '192.168.56.1', internal: false }],
        'VMware Network Adapter VMnet8': [{ family: 'IPv4', address: '192.168.80.1', internal: false }],
        'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
        'Otra': [{ family: 'IPv4', address: '8.8.8.8', internal: false },
                 { family: 'IPv4', address: '169.254.3.3', internal: false }]
    }, 'win32');   // nombres de Windows: también en la Mac del workflow
    assert.deepEqual(r.map(x => x.ip), ['192.168.0.20', '10.0.0.5']);
});

// ── Clips en vivo para el iPad que mira ──
const dirClips = path.join(tmp, 'Trabajo', 'Clips');
fs.mkdirSync(dirClips, { recursive: true });
const rutaClip = path.join(dirClips, 'Tiro 12-30.mp4');
const bytesClip = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
fs.writeFileSync(rutaClip, bytesClip);

function pedirBytes(puerto, ruta, cabeceras = {}) {
    return new Promise((ok, mal) => {
        const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, headers: cabeceras }, res => {
            const partes = [];
            res.on('data', d => partes.push(d));
            res.on('end', () => ok({ status: res.statusCode, cuerpo: Buffer.concat(partes), h: res.headers }));
        });
        req.on('error', mal);
        req.end();
    });
}

test('clips: la rama publica, el iPad que mira los recibe y los baja con su token (con Range)', async () => {
    const { srv } = nuevo();
    // Como main: solo la carpeta de trabajo.
    const srv2 = crearServidorRemoto({
        rutaRemoto: srv._raices.remoto, rutaNucleo: srv._raices.nucleo,
        plataforma: 'win32', interfaces: () => ({}),
        permitirClip: r => path.resolve(r).startsWith(path.join(tmp, 'Trabajo') + path.sep)
    });
    const { puerto, pin } = await srv2.iniciar({ puerto: 0 });
    try {
        const a = await entrar(puerto, { pin });
        const c2 = cliente(puerto);
        await c2.abierto;
        c2.mandar({ tipo: 'hola', dispositivo: 'ipad-mira-1', nombre: 'iPad DT', pin });
        const b = await c2.esperar(m => m.tipo === 'bienvenida');
        assert.equal(b.activo, false);
        assert.deepEqual(b.clips, []);

        // Fuera de la carpeta de trabajo, o un id raro: no se publica.
        assert.equal(srv2.enviar({ tipo: 'clip', clip: { id: 'c1', ruta: path.join(tmp, 'main.js'), nombre: 'x' } }), false);
        assert.equal(srv2.enviar({ tipo: 'clip', clip: { id: '../c1', ruta: rutaClip, nombre: 'x' } }), false);

        assert.equal(srv2.enviar({ tipo: 'clip', clip: {
            id: 'c1', ruta: rutaClip, nombre: 'Tiro', etiquetas: ['Al arco'], equipo: 'Local', inicio: 750.5, duracion: 8
        } }), true);
        const llego = await c2.esperar(m => m.tipo === 'clip');
        assert.deepEqual(llego.clip, { id: 'c1', nombre: 'Tiro', etiquetas: ['Al arco'], equipo: 'Local', inicio: 750.5, duracion: 8 });
        assert.equal('ruta' in llego.clip, false, 'la ruta del disco nunca llega al iPad');
        await a.c.esperar(m => m.tipo === 'clip');

        const tok = b.token;
        const url = `/clip/c1?d=ipad-mira-1&t=${encodeURIComponent(tok)}`;
        const entero = await pedirBytes(puerto, url);
        assert.equal(entero.status, 200);
        assert.equal(entero.h['content-type'], 'video/mp4');
        assert.equal(entero.h['accept-ranges'], 'bytes');
        assert.ok(entero.cuerpo.equals(bytesClip));

        // Lo primero que pide Safari: bytes=0-1.
        const dos = await pedirBytes(puerto, url, { Range: 'bytes=0-1' });
        assert.equal(dos.status, 206);
        assert.equal(dos.h['content-range'], 'bytes 0-1/1000');
        assert.deepEqual([...dos.cuerpo], [0, 1]);
        const cola = await pedirBytes(puerto, url, { Range: 'bytes=990-' });
        assert.equal(cola.status, 206);
        assert.equal(cola.cuerpo.length, 10);
        assert.equal((await pedirBytes(puerto, url, { Range: 'bytes=5000-' })).status, 416);

        // Sin token, con el de otro, o un clip que no existe: 404.
        for (const r of ['/clip/c1', `/clip/c1?d=ipad-mira-1&t=malo`, `/clip/c1?d=ipad-prueba-1&t=${encodeURIComponent(tok)}`,
            `/clip/c9?d=ipad-mira-1&t=${encodeURIComponent(tok)}`, `/clip/..%2fmain.js?d=ipad-mira-1&t=${encodeURIComponent(tok)}`]) {
            assert.equal((await pedirBytes(puerto, r)).status, 404, r);
        }

        // Un iPad que entra despues recibe los que ya habia.
        c2.ws.close();
        await c2.cerrado;
        const c3 = cliente(puerto);
        await c3.abierto;
        c3.mandar({ tipo: 'hola', dispositivo: 'ipad-mira-1', token: tok });
        const b3 = await c3.esperar(m => m.tipo === 'bienvenida');
        assert.deepEqual(b3.clips.map(c => c.id), ['c1']);

        // Mismo id reemplaza; quitar avisa y deja de servirlo.
        srv2.enviar({ tipo: 'clip', clip: { id: 'c1', ruta: rutaClip, nombre: 'Tiro', etiquetas: ['Gol'], inicio: 750.5, duracion: 8 } });
        assert.deepEqual((await c3.esperar(m => m.tipo === 'clip')).clip.etiquetas, ['Gol']);
        assert.equal(srv2.enviar({ tipo: 'quitarClip', id: 'c1' }), true);
        assert.equal((await c3.esperar(m => m.tipo === 'quitarClip')).id, 'c1');
        assert.equal((await pedirBytes(puerto, url)).status, 404);
        a.c.ws.close(); c3.ws.close();
    } finally {
        await srv2.detener();
    }
});

test('/clips: el que entra a mirar nunca codifica, aunque llegue primero', async () => {
    const { srv, mensajes } = nuevo();
    const c = await srv.iniciar({ puerto: 0 });
    try {
        assert.match(c.urlClips, /^http:\/\/192\.168\.1\.50:\d+\/clips$/);
        assert.deepEqual(c.urlsClips, [c.urlClips]);
        assert.equal(c.soloMirar, false);
        // La pagina se sirve tambien en /clips.
        assert.match((await pedir(c.puerto, '/clips')).cuerpo, /iPad/);
        assert.match((await pedir(c.puerto, '/clips/')).cuerpo, /iPad/);

        // El que mira llega PRIMERO.
        const m = cliente(c.puerto);
        await m.abierto;
        m.mandar({ tipo: 'hola', dispositivo: 'ipad-mira-9', nombre: 'iPhone', pin: c.pin, rol: 'mirar' });
        const bm = await m.esperar(x => x.tipo === 'bienvenida');
        assert.equal(bm.activo, false);
        assert.equal(bm.rol, 'mirar');
        // Igual el que entra a codificar codifica.
        const a = await entrar(c.puerto, { pin: c.pin });
        assert.equal(a.r.activo, true);
        assert.equal(a.r.rol, 'codificar');

        // El que mira no toca, no pide el control y no se le puede dar.
        m.mandar({ tipo: 'accion', n: 1, accion: { tipo: 'tocar', elementoId: 1, momento: 1 } });
        m.mandar({ tipo: 'pedirControl' });
        srv.enviar({ tipo: 'darControl', dispositivo: 'ipad-mira-9' });
        await new Promise(r => setTimeout(r, 60));
        assert.equal(mensajes.filter(x => x.tipo === 'accion').length, 0);
        assert.equal(srv.estado().clientes.find(x => x.activo).dispositivo, 'ipad-prueba-1');
        assert.equal(srv.estado().clientes.find(x => x.dispositivo === 'ipad-mira-9').rol, 'mirar');
        m.ws.close(); a.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('soloMirar (la compu codifica sola): nadie codifica, entre por donde entre', async () => {
    const { srv } = nuevo();
    const c = await srv.iniciar({ puerto: 0, soloMirar: true });
    try {
        assert.equal(c.soloMirar, true);
        const a = await entrar(c.puerto, { pin: c.pin });
        assert.equal(a.r.activo, false);
        assert.equal(a.r.rol, 'mirar');
        a.c.ws.close();
    } finally {
        await srv.detener();
    }
});

test('clips: sin permitirClip no se publica ninguno', async () => {
    const { srv } = nuevo();
    await srv.iniciar({ puerto: 0 });
    try {
        assert.equal(srv.enviar({ tipo: 'clip', clip: { id: 'c1', ruta: rutaClip, nombre: 'x' } }), false);
    } finally {
        await srv.detener();
    }
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
void aqui;
