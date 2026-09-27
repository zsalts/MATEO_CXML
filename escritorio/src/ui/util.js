// Utilidades puras: no tocan el DOM ni window.tv, así se prueban con
// node --test (escritorio/test/menu*.test.js).

// Todo texto que venga del usuario o de la base y vaya a innerHTML pasa por
// acá. Un partido llamado "<img onerror=…>" no puede ejecutar nada.
export function escapar(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const dos = n => String(n).padStart(2, '0');

// Segundos → reloj. Por debajo de la hora va "m:ss" ("2:03", "42:10"), que
// es como se lee un reloj de partido; con horas, "1:02:03".
// { largo: true } fuerza "00:42:10" (el REC de la barra, que no tiene que
// cambiar de ancho al pasar la hora).
export function formatoTiempo(seg, { largo = false } = {}) {
    let s = Number(seg);
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (largo) return `${dos(h)}:${dos(m)}:${dos(r)}`;
    return h > 0 ? `${h}:${dos(m)}:${dos(r)}` : `${m}:${dos(r)}`;
}

// La base puede devolver la fecha como ISO, como milisegundos o como
// segundos Unix (SQLite no tiene tipo fecha). Todo termina en un Date, o null.
export function aFecha(valor) {
    if (valor == null || valor === '') return null;
    if (valor instanceof Date) return isNaN(valor) ? null : valor;
    if (typeof valor === 'number' || /^\d+(\.\d+)?$/.test(String(valor))) {
        let n = Number(valor);
        if (n < 1e11) n *= 1000;          // vino en segundos
        const d = new Date(n);
        return isNaN(d) ? null : d;
    }
    // "2026-09-26 18:30:00" (SQLite) no es ISO estricto: Chrome lo acepta,
    // Safari no. Se normaliza con la T.
    const d = new Date(String(valor).replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
    return isNaN(d) ? null : d;
}

// "hoy 18:30", "ayer 21:05", "12/09 20:00", "12/09/25" si es de otro año.
export function fechaCorta(valor, ahora = new Date()) {
    const d = aFecha(valor);
    if (!d) return '';
    const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
    const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (mismoDia(d, ahora)) return `hoy ${hora}`;
    const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
    if (mismoDia(d, ayer)) return `ayer ${hora}`;
    if (d.getFullYear() === ahora.getFullYear()) return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${hora}`;
    return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

// "1 plantilla", "3 plantillas". Para los resúmenes de importación.
export function plural(n, uno, varios) {
    return `${n} ${n === 1 ? uno : (varios || uno + 's')}`;
}

// Normaliza para buscar: sin mayúsculas ni tildes ("Análisis" = "analisis").
export function normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
