// IPs de la red local en Mac y en Windows (main/red.js).
//   node --test escritorio/test/mac*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import red from '../main/red.js';

const { ipsLocales } = red;

const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal });
const v6 = address => ({ address, family: 'IPv6', internal: false });

// Lo que devuelve os.networkInterfaces() en una MacBook con VPN, AirDrop,
// Internet compartido y Parallels.
const MAC = {
    lo0: [v4('127.0.0.1', true), v6('::1')],
    anpi0: [v6('fe80::1')],
    en0: [v6('fe80::1c2a'), v4('192.168.1.34')],
    en5: [v4('10.0.0.8')],
    awdl0: [v6('fe80::aa')],
    llw0: [v6('fe80::bb')],
    utun3: [v4('10.8.0.2')],
    bridge100: [v4('192.168.2.1')],
    vmnet8: [v4('172.16.40.1')],
    ap1: [v4('192.168.3.1')]
};

const WIN = {
    'Ethernet': [v4('10.0.0.5')],
    'Wi-Fi': [v4('192.168.1.20')],
    'vEthernet (WSL)': [v4('172.20.0.1')],
    'VirtualBox Host-Only Network': [v4('192.168.56.1')],
    'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)]
};

test('Mac: solo en0/en5, sin VPN, AirDrop, bridge, vmnet ni loopback', () => {
    const ips = ipsLocales(MAC, 'darwin');
    assert.deepEqual(ips, [
        { ip: '192.168.1.34', adaptador: 'en0' },
        { ip: '10.0.0.8', adaptador: 'en5' }
    ]);
});

test('Mac: sin wifi ni cable, lista vacia (la pantalla lo explica)', () => {
    const { en0, en5, ...resto } = MAC;
    assert.deepEqual(ipsLocales(resto, 'darwin'), []);
});

test('Mac: numero mas bajo primero aunque el sistema los de al reves', () => {
    const ips = ipsLocales({ en7: [v4('10.1.1.1')], en1: [v4('192.168.0.9')] }, 'darwin');
    assert.deepEqual(ips.map(i => i.adaptador), ['en1', 'en7']);
});

test('Windows: igual que antes (wifi, despues cable, sin virtuales)', () => {
    const ips = ipsLocales(WIN, 'win32');
    assert.deepEqual(ips, [
        { ip: '192.168.1.20', adaptador: 'Wi-Fi' },
        { ip: '10.0.0.5', adaptador: 'Ethernet' }
    ]);
});

test('family numerica (Node 18.0) tambien cuenta como IPv4', () => {
    const ips = ipsLocales({ en0: [{ address: '192.168.1.2', family: 4, internal: false }] }, 'darwin');
    assert.equal(ips.length, 1);
});
