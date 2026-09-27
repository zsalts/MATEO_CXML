// El partido en curso: motor de codificacion + reloj del partido + de donde
// vino cada evento (iPad o compu).
//
// El motor corre en la compu y es la unica fuente de verdad. Los toques del
// iPad llegan con `momento` en ms del reloj de la COMPU (el iPad ya corrigio
// el desfase y la demora del wifi); aca se pasan a segundo de PARTIDO con el
// reloj de tramos, y el motor los aplica en ese segundo aunque lleguen tarde
// (por ejemplo, 30 s despues, al volver el wifi).
//
// El reloj del partido lo lleva reloj-partido.js y el motor lo lee como
// "relojExterno": asi no hay dos cuentas que se puedan separar.
//
// Puro (sin DOM ni window.tv): lo prueba node --test con un reloj falso.

import { crearCodificacion } from '../../nucleo/codificacion.js';
import { crearRelojPartido } from './reloj-partido.js';

// Lo que el iPad puede pedir. Cualquier otra cosa se ignora: el motor tiene
// acciones (borrarEvento, terminar…) que desde el iPad no corresponden.
const DEL_IPAD = new Set(['tocar', 'elegirEmergente', 'cerrarDetalle', 'play', 'pausa']);

export function crearPartido(datos, { ahora = () => Date.now(), relojVideo = () => null, buscarPlantilla = null } = {}) {
    const rp = crearRelojPartido();
    const motor = crearCodificacion(datos, {
        ahora,
        relojExterno: () => rp.en(ahora()),
        relojVideo,
        buscarPlantilla
    });
    const origen = new Map();   // id de evento del motor → 'ipad' | 'compu'

    // El motor arranca el reloj solo cuando se toca un evento con el
    // partido parado (como el iPad). Si lo hizo, el reloj de tramos lo
    // acompaña en el mismo instante.
    function seguirAlMotor() {
        const andando = motor.estado().andando;
        if (andando && !rp.corriendo()) rp.play(ahora());
        else if (!andando && rp.corriendo()) rp.pausa(ahora());
    }

    function idsEventos() {
        const e = motor.estado();
        return new Set([...e.eventos, ...e.abiertos, ...(e.pendiente ? [e.pendiente] : [])].map(x => x.id));
    }

    function marcarNuevos(antes, quien) {
        const nuevos = [];
        for (const id of idsEventos()) {
            if (!antes.has(id) && !origen.has(id)) { origen.set(id, quien); nuevos.push(id); }
        }
        return nuevos;
    }

    function play() {
        // Primero el reloj de tramos: el motor lee la hora de ahi.
        rp.play(ahora());
        const r = motor.play();
        seguirAlMotor();
        return r;
    }

    function pausa() {
        rp.pausa(ahora());
        const r = motor.pausa();
        seguirAlMotor();
        return r;
    }

    // Una accion del iPad tal como la entrega main/remoto.js.
    function aplicarRemota(accion, quien = 'ipad') {
        if (!accion || !DEL_IPAD.has(accion.tipo)) return { ok: false, error: 'accion' };
        if (accion.tipo === 'play') return { ok: !!play(), nuevos: [] };
        if (accion.tipo === 'pausa') return { ok: !!pausa(), nuevos: [] };

        const a = { ...accion };
        if (a.tipo === 'tocar') {
            // ms de la compu → segundo de partido. Sin momento (no deberia
            // pasar) cae en "ahora", que es lo mismo que haria el motor.
            a.momento = Number.isFinite(Number(accion.momento)) ? rp.en(Number(accion.momento)) : undefined;
        } else {
            delete a.momento;
        }
        const antes = idsEventos();
        const r = motor.aplicar(a) || {};
        seguirAlMotor();
        return { ...r, nuevos: marcarNuevos(antes, quien) };
    }

    // Un toque en la compu (sin iPad, o la botonera chica): ya.
    function tocarLocal(elementoId, opciones = {}) {
        return aplicarRemota({ tipo: 'tocar', elementoId, momento: ahora(), ...opciones }, 'compu');
    }

    function terminar() {
        const e = motor.terminar();
        if (rp.corriendo()) rp.pausa(ahora());
        return e;
    }

    return {
        motor,
        reloj: rp,
        play,
        pausa,
        alternar: () => (rp.corriendo() ? pausa() : play()),
        aplicarRemota,
        tocarLocal,
        terminar,
        origenDe: id => origen.get(id) || null,
        tiempo: () => motor.tiempo()
    };
}
