// Del reloj de la compu (ms) al reloj del partido (segundos).
//
// El iPad manda cada toque con la hora de la COMPU en que ocurrio (ya
// corregida la demora del wifi, ver remoto/reloj.js). El motor necesita el
// segundo de PARTIDO, que se frena en cada PAUSE. Con la lista de tramos
// corridos se traduce cualquier hora, aunque el toque llegue un minuto tarde
// porque se corto el wifi y en el medio hubo una pausa.
//
//   tramo = { t0, t1, p0 }   corrio desde t0 hasta t1 (ms de la compu)
//                            y en t0 el partido estaba en p0 segundos
//
// Un toque dentro de una pausa cae en el segundo en que se paro el reloj
// (lo mismo que ve el iPad: el reloj quieto). Uno antes del primer PLAY cae
// en 0.
//
// Puro: lo prueba node --test.

export function crearRelojPartido() {
    const tramos = [];

    const abierto = () => {
        const u = tramos[tramos.length - 1];
        return u && u.t1 === Infinity ? u : null;
    };

    return {
        play(t) {
            if (abierto()) return false;
            const p0 = this.en(t);
            tramos.push({ t0: t, t1: Infinity, p0 });
            return true;
        },
        pausa(t) {
            const u = abierto();
            if (!u) return false;
            u.t1 = Math.max(u.t0, t);
            return true;
        },
        corriendo() { return !!abierto(); },
        // Segundos de partido a la hora t (ms de la compu).
        en(t) {
            if (!tramos.length) return 0;
            let p = 0;
            for (const tr of tramos) {
                if (t < tr.t0) return tr.p0;   // antes de este tramo: en pausa
                if (t <= tr.t1) return tr.p0 + (t - tr.t0) / 1000;
                p = tr.p0 + (tr.t1 - tr.t0) / 1000;
            }
            return p;   // despues del ultimo tramo cerrado: reloj quieto
        },
        // Para exportar/depurar: copia de los tramos.
        tramos() { return tramos.map(t => ({ ...t })); }
    };
}
