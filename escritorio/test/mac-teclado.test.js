// Teclado y mouse en Mac y Windows (src/ui/plataforma.js).
//   node --test escritorio/test/mac*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/ui/plataforma.js';

test('textoAtajo: ⌘ en Mac, Ctrl+ en Windows', () => {
    assert.equal(P.textoAtajo('Mod+K', 'mac'), '⌘K');
    assert.equal(P.textoAtajo('Mod+K', 'win'), 'Ctrl+K');
    assert.equal(P.textoAtajo('Mod+1', 'mac'), '⌘1');
    assert.equal(P.textoAtajo('Mod+Shift+Z', 'win'), 'Ctrl+Shift+Z');
});

test('textoAtajo: en Mac los modificadores van en el orden de Apple (⌃⌥⇧⌘)', () => {
    assert.equal(P.textoAtajo('Mod+Shift+Z', 'mac'), '⇧⌘Z');
    assert.equal(P.textoAtajo('Shift+Alt+Mod+I', 'mac'), '⌥⇧⌘I');
    assert.equal(P.textoAtajo('Esc', 'mac'), 'Esc');
});

test('teclaMod: metaKey en Mac, ctrlKey en Windows', () => {
    assert.equal(P.teclaMod({ metaKey: true, ctrlKey: false }, 'mac'), true);
    assert.equal(P.teclaMod({ metaKey: false, ctrlKey: true }, 'mac'), false);   // Ctrl+clic = clic derecho
    assert.equal(P.teclaMod({ metaKey: false, ctrlKey: true }, 'win'), true);
    assert.equal(P.teclaMod({ metaKey: true, ctrlKey: false }, 'win'), false);   // tecla Windows
    assert.equal(P.teclaMod(null, 'mac'), false);
});

test('sumaSeleccion: ⌘+clic en Mac, Ctrl+clic en Windows', () => {
    assert.equal(P.sumaSeleccion({ metaKey: true }, 'mac'), true);
    assert.equal(P.sumaSeleccion({ ctrlKey: true }, 'mac'), false);
    assert.equal(P.sumaSeleccion({ ctrlKey: true }, 'win'), true);
});

test('esZoomRueda: ⌘+rueda y pellizco en Mac, Ctrl+rueda en Windows', () => {
    assert.equal(P.esZoomRueda({ metaKey: true }, 'mac'), true);
    assert.equal(P.esZoomRueda({ ctrlKey: true }, 'mac'), true);     // pellizco del trackpad
    assert.equal(P.esZoomRueda({}, 'mac'), false);
    assert.equal(P.esZoomRueda({ ctrlKey: true }, 'win'), true);
    assert.equal(P.esZoomRueda({ metaKey: true }, 'win'), false);
});

test('letraDeTecla: ⌥+Q en Mac da "q", no "œ"', () => {
    assert.equal(P.letraDeTecla({ key: 'œ', code: 'KeyQ', altKey: true }), 'q');
    assert.equal(P.letraDeTecla({ key: '¡', code: 'Digit1', altKey: true }), '1');
    assert.equal(P.letraDeTecla({ key: 'Q', code: 'KeyQ', altKey: false }), 'q');
    // Sin ⌥ se respeta la distribucion del teclado (AZERTY: la A esta en KeyQ).
    assert.equal(P.letraDeTecla({ key: 'a', code: 'KeyQ', altKey: false }), 'a');
});

test('Finder en Mac, Explorador en Windows', () => {
    assert.equal(P.textoMostrarEnCarpeta('mac'), 'Mostrar en Finder');
    assert.equal(P.textoMostrarEnCarpeta('win'), 'Mostrar en el Explorador');
});

test('ponerPlataforma cambia esMac para los que ya lo importaron', () => {
    assert.equal(P.ponerPlataforma('darwin'), true);
    assert.equal(P.esMac, true);
    assert.equal(P.teclaMod({ metaKey: true }), true);           // sin parametro: usa la puesta
    assert.equal(P.textoAtajo('Mod+K'), '⌘K');
    assert.equal(P.ponerPlataforma('win32'), false);
    assert.equal(P.esMac, false);
    assert.equal(P.textoAtajo('Mod+K'), 'Ctrl+K');
});

test('alSoltarTodo avisa al soltar ⌘ y al perder el foco', () => {
    const oyentes = {};
    const destino = {
        addEventListener: (t, f) => { oyentes[t] = f; },
        removeEventListener: t => { delete oyentes[t]; }
    };
    const avisos = [];
    const quitar = P.alSoltarTodo(m => avisos.push(m), destino);
    oyentes.keyup({ key: 'q' });
    oyentes.keyup({ key: 'Meta' });
    oyentes.blur();
    assert.deepEqual(avisos, ['meta', 'blur']);
    quitar();
    assert.deepEqual(Object.keys(oyentes), []);
});
