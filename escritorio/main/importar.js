// Importar lo que sale de la app del iPad: una plantilla suelta, una sesion
// suelta o una copia de seguridad entera (de un archivo o de la nube).
//
// Los formatos son los que escribe app.js de la web (seccion "PLANTILLAS Y
// SESIONES COMO ARCHIVOS DEL iPad" y armarRespaldo()):
//
//   plantilla  {app:'tagview', kind:'template', name, date, elements, links, hojas}
//   sesion     {app:'tagview', kind:'session', name, date, duration, startedAt?,
//               events, counters, toi, tramosPos?}
//   copia      {app:'tagview', kind:'backup', current:{elements,links,hojas},
//               templates:[{id,name,date,elements,links,hojas}], sessions:[...],
//               equipos:[{nombre,color}]}
//
// Nada se importa dos veces: cada plantilla y cada sesion lleva una huella
// (hash de sus datos normalizados). La misma huella ya en la base = se saltea.
// Mismo nombre con datos distintos = entra como "Nombre (iPad 26-09)".
//
// Sin Electron: lo usan main/ y las pruebas por igual.

const bd = require('../db');

function tipoDe(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.app === 'tagview' && ['backup', 'template', 'session'].includes(data.kind)) return data.kind;
    // Un respaldo.json de la nube viejo puede venir sin 'kind'.
    if (data.app === 'tagview' && (Array.isArray(data.templates) || Array.isArray(data.sessions))) return 'backup';
    return null;
}

function diaMes(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}`;
}

// ── Plantillas ──
function importarPlantilla(t, origen, cuenta) {
    const datos = bd.datosNormalizados(t);
    if (!datos.elements.length) return null;       // un lienzo vacio no es una plantilla
    const h = bd.huellaPlantilla(datos);
    if (bd.plantillaPorHuella(h)) return null;

    let nombre = String(t.name || t.nombre || 'Plantilla del iPad').trim() || 'Plantilla del iPad';
    if (bd.plantillaPorNombre(nombre)) {
        const base = `${nombre} (iPad ${diaMes()})`;
        nombre = base;
        for (let n = 2; bd.plantillaPorNombre(nombre); n++) nombre = `${base} (${n})`;
    }
    const id = bd.guardarPlantilla({ nombre, datos, origen });
    cuenta.plantillas++;
    return id;
}

// ── Equipos ──
function importarEquipos(lista, cuenta) {
    (lista || []).forEach(e => {
        const nombre = e && String(e.nombre || e.name || '').trim();
        if (!nombre) return;
        const ya = bd.equipoPorNombre(nombre);
        if (ya && (ya.color || null) === (e.color || null)) return;
        bd.guardarEquipo({ nombre, color: e.color || (ya && ya.color) || null });
        if (!ya) cuenta.equipos++;
    });
}

// ── Sesiones → partidos sin video ──

// "01:23:45" o "83:12" → segundos. El iPad guarda la duracion formateada.
function segundosDe(txt) {
    if (typeof txt === 'number') return txt;
    const partes = String(txt || '').split(':').map(Number);
    if (partes.some(isNaN)) return 0;
    return partes.reduce((acc, n) => acc * 60 + n, 0);
}

// El iPad arma el nombre como "LOMAS vs GEBA 15-09-2026 20h30".
function equiposDelNombre(nombre) {
    const m = /^(.+?)\s+vs\.?\s+(.+?)(?:\s+\d{1,2}-\d{1,2}-\d{4}.*)?$/i.exec(String(nombre || '').trim());
    return m ? { local: m[1].trim(), visitante: m[2].trim() } : { local: null, visitante: null };
}

// Lo que identifica a una sesion: si el iPad la exporta dos veces sale igual.
function huellaSesion(s) {
    return bd.huella({
        name: s.name || '', startedAt: s.startedAt || null, duration: s.duration || '',
        events: (s.events || []).map(e => [e.name, e.buttonId || null, e.start, e.end ?? null,
                                          e.line || null, e.descriptors || []])
    });
}

// Los tramos de posesion: las sesiones nuevas los traen en tramosPos; las
// viejas, como eventos marcados posesionDe (igual que tramosDeSesion() del iPad).
function tramosDe(s) {
    if (Array.isArray(s.tramosPos) && s.tramosPos.length) return s.tramosPos;
    return (s.events || []).filter(ev => ev.posesionDe)
        .map(ev => ({ buttonId: ev.posesionDe, equipo: ev.equipo, start: ev.start, end: ev.end }));
}

function partidoDeSesion(s) {
    const eqs = equiposDelNombre(s.name);
    const eventos = (s.events || [])
        .filter(ev => ev && !ev.posesionDe && ev.name)
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map(ev => ({
            nombre: ev.name,
            botonId: ev.buttonId != null ? String(ev.buttonId) : null,
            equipo: ev.equipo || null,
            linea: ev.line || null,
            inicio: Number(ev.start) || 0,
            // Igual que el XML del iPad: sin fin, dura un segundo.
            fin: ev.end != null ? Number(ev.end) : (Number(ev.start) || 0) + 1,
            vInicio: null,
            vFin: null,
            etiquetas: (ev.descriptors || []).map(d => ({ grupo: 'Etiqueta', texto: String(d) }))
        }));
    return {
        nombre: String(s.name || 'Sesion del iPad').trim() || 'Sesion del iPad',
        inicioReal: s.startedAt || null,
        duracion: segundosDe(s.duration),
        videoRuta: null,
        local: eqs.local,
        visitante: eqs.visitante,
        plantilla: null,
        origen: 'ipad-importado',
        desfase: 0,
        eventos,
        posesion: tramosDe(s).map(t => ({ equipo: t.equipo || null, inicio: t.start, fin: t.end })),
        huella: huellaSesion(s)
    };
}

function importarSesion(s, cuenta) {
    if (!s || typeof s !== 'object') return null;
    const p = partidoDeSesion(s);
    if (bd.partidoPorHuella(p.huella)) return null;
    const id = bd.guardarPartido(p);
    cuenta.partidos++;
    return id;
}

// ── Punto de entrada ──
// `origen` de las plantillas: 'ipad' si vino de un archivo, 'nube' si de la nube.
function importarDatos(data, origen = 'ipad') {
    const tipo = tipoDe(data);
    if (!tipo) throw new Error('El archivo no es una plantilla, una sesion ni una copia de seguridad de Tag & View.');
    const cuenta = { plantillas: 0, equipos: 0, partidos: 0 };

    if (tipo === 'template') {
        importarPlantilla(data, origen, cuenta);
    } else if (tipo === 'session') {
        importarSesion(data, cuenta);
    } else {
        importarEquipos(data.equipos, cuenta);
        (data.templates || []).forEach(t => importarPlantilla(t, origen, cuenta));
        // El lienzo que estaba abierto en el iPad casi siempre es una de sus
        // plantillas (la huella lo saltea); si no, entra como una mas.
        if (data.current && data.current.elements && data.current.elements.length) {
            importarPlantilla({ ...data.current, name: 'Lienzo del iPad' }, origen, cuenta);
        }
        (data.sessions || []).forEach(s => importarSesion(s, cuenta));
    }
    return { tipo, ...cuenta };
}

// Una plantilla de la base al formato de archivo del iPad (el mismo que
// exportTemplateToFile()): el iPad la importa sin enterarse de donde vino.
function plantillaComoArchivo(t) {
    const d = bd.datosNormalizados(t.datos);
    return {
        app: 'tagview', kind: 'template', version: 1,
        name: t.nombre,
        date: new Date(t.actualizado || Date.now()).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
        elements: d.elements, links: d.links, hojas: d.hojas
    };
}

module.exports = {
    tipoDe, importarDatos, partidoDeSesion, huellaSesion, equiposDelNombre, segundosDe,
    plantillaComoArchivo
};
