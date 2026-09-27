// Reloj compartido entre el iPad y la compu.
//
// Cada toque tiene que entrar en el segundo en que el dedo toco la pantalla,
// no en el que llego el mensaje: por wifi eso son 20-200 ms, y con la red
// cortada pueden ser minutos. Por eso el iPad no manda "ahora", manda la hora
// del toque ya pasada al reloj de la COMPU.
//
// Cada 2 s: el iPad manda {ping, t0} con su reloj, la compu contesta con el
// suyo (tServidor), y al volver (t1) se estima, suponiendo ida = vuelta:
//     latencia = (t1 - t0) / 2
//     desfase  = tServidor - (t0 + latencia)      (compu = iPad + desfase)
// Se usa la mediana de las ultimas 8 muestras: una muestra que se demoro
// porque el wifi hipo no mueve el resultado, como si moveria un promedio.
//
// Puro: sin DOM ni red, lo prueba node --test.

const MUESTRAS = 8;

function mediana(xs) {
    const o = [...xs].sort((a, b) => a - b);
    const m = o.length >> 1;
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function crearReloj({ muestras = MUESTRAS } = {}) {
    const lista = [];   // {desfase, latencia}

    return {
        // t0 y t1 en el reloj del iPad; tServidor en el de la compu (ms).
        muestra(t0, tServidor, t1) {
            if (![t0, tServidor, t1].every(Number.isFinite) || t1 < t0) return false;
            const latencia = (t1 - t0) / 2;
            lista.push({ desfase: tServidor - (t0 + latencia), latencia });
            if (lista.length > muestras) lista.shift();
            return true;
        },
        listo() { return lista.length > 0; },
        desfase() { return lista.length ? mediana(lista.map(m => m.desfase)) : null; },
        latencia() { return lista.length ? mediana(lista.map(m => m.latencia)) : null; },
        // Hora de la compu que corresponde a una hora del iPad. Sin muestras
        // todavia (se toco antes del primer pong) devuelve null: la cola la
        // completa cuando llegue la primera, porque el reloj del iPad sigue
        // corriendo y la cuenta sale igual de bien despues.
        aServidor(tLocal) {
            const d = this.desfase();
            return d === null ? null : Math.round(tLocal + d);
        },
        olvidar() { lista.length = 0; }
    };
}
