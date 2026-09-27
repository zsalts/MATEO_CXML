// Lectores de archivos de marcas: XML de Sportscode (y los que exportan
// Nacsport y LongoMatch con el mismo esquema) y las sesiones del iPad.
//
// Puro a propósito: sin DOM, sin DOMParser, sin window.tv. Así corre igual en
// la app y en `node --test`, y un archivo raro se puede reproducir en una
// prueba sin abrir Electron.
//
// ─────────────────────────────────────────────
// EL FORMATO "SPORTSCODE XML" Y SUS PRIMOS
// ─────────────────────────────────────────────
// Lo que escribe app.js (exportCustomXML) y lo que escribe Sportscode:
//
//   <file>
//     <SESSION_INFO><start_time>2026-09-15 20:30:00 +0000</start_time></SESSION_INFO>
//     <ALL_INSTANCES>
//       <instance>
//         <ID>1</ID><start>12.40</start><end>18.40</end><code>Ataque</code>
//         <label><group>Linea</group><text>L1</text></label>
//       </instance>
//     </ALL_INSTANCES>
//     <ROWS><row><code>Ataque</code><R>14906</R><G>36751</G><B>54998</B></row></ROWS>
//   </file>
//
// El iPad lo guarda en UTF-16 LE con BOM (así lo pide Sportscode).
//
// Diferencias que aparecen en la práctica y que este lector tolera:
//  - Sportscode: agrega <free_text> a la instancia, <SORT_INFO> en el <file>
//    y a veces <label> con solo <text> (sin <group>) → grupo vacío.
//  - Nacsport: mismo esquema, pero suele exportar en UTF-8 o Windows-1252
//    según la versión, con <?xml encoding="..."?>; agrega <pos_x>/<pos_y> y
//    <sort_order> en los rows; en Windows con configuración regional
//    española algunas versiones escriben los segundos con coma ("12,5").
//    Las etiquetas pueden venir con varios <text> dentro del mismo <label>.
//  - LongoMatch: su "Export to Sportscode XML" escribe las etiquetas en
//    <label><group>Categoría</group><text>…</text></label> y los colores de
//    ROWS a veces en 0–255 en vez de 0–65535 (ver `colorDeFila`). Algunas
//    versiones escriben <start>/<end> como "hh:mm:ss.mmm".
//  - Todos: mayúsculas/minúsculas mezcladas en las etiquetas (<Instance>,
//    <CODE>), espacios y saltos de línea dentro de los valores, entidades
//    (&amp; &#233; &#xE9;) y CDATA.
// Lo desconocido (otras etiquetas) se ignora sin avisar: cada programa suma
// las suyas y no aportan nada a los clips.

// ─────────────────────────────────────────────
// TEXTO: CODIFICACIÓN
// ─────────────────────────────────────────────

// Recibe bytes (Uint8Array/ArrayBuffer) o un texto ya decodificado y
// devuelve un texto limpio. Con bytes decide la codificación: BOM, patrón de
// ceros de UTF-16, UTF-8 estricto, y si no, Windows-1252 (lo que usan
// Nacsport viejo y cualquier XML armado en el Bloc de notas de un Windows en
// español).
export function decodificarTexto(entrada) {
    if (entrada == null) return '';
    if (typeof entrada === 'string') return limpiarTexto(entrada);

    const b = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
    const dec = (cod, fatal) => new TextDecoder(cod, { fatal: !!fatal }).decode(b);

    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return limpiarTexto(dec('utf-8'));
    if (b[0] === 0xFF && b[1] === 0xFE) return limpiarTexto(dec('utf-16le'));
    if (b[0] === 0xFE && b[1] === 0xFF) return limpiarTexto(dec('utf-16be'));
    // UTF-16 sin BOM: "<\0f\0i\0l\0e\0" o "\0<\0f\0i\0l\0e"
    if (b.length >= 4 && b[1] === 0 && b[3] === 0 && b[0] !== 0) return limpiarTexto(dec('utf-16le'));
    if (b.length >= 4 && b[0] === 0 && b[2] === 0 && b[1] !== 0) return limpiarTexto(dec('utf-16be'));

    // La declaración manda si dice algo que no es UTF-8.
    const cabeza = String.fromCharCode(...b.subarray(0, 200));
    const decl = /encoding\s*=\s*["']([^"']+)["']/i.exec(cabeza);
    const nombre = decl ? decl[1].toLowerCase() : '';
    if (nombre && !/utf-?8/.test(nombre)) {
        try { return limpiarTexto(dec(nombre)); } catch (_) { /* codificación rara: seguimos adivinando */ }
    }
    try {
        return limpiarTexto(dec('utf-8', true));
    } catch (_) {
        // Para TextDecoder 'windows-1252' y 'latin1' son la misma tabla.
        return limpiarTexto(dec('windows-1252'));
    }
}

// Arreglos para un texto que ya llegó decodificado (tv.archivos.elegir):
// saca el BOM y, si un UTF-16 se leyó como si fuera de un byte, quedan
// ceros intercalados — se sacan, que si no ninguna etiqueta coincide.
function limpiarTexto(t) {
    let s = String(t);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    if (s.indexOf('\u0000') !== -1) {
        const ceros = (s.match(/\u0000/g) || []).length;
        if (ceros > s.length / 4) s = s.replace(/\u0000/g, '');
        // Queda la basura del BOM mal leído (ÿþ / þÿ / ï»¿) al principio.
        s = s.replace(/^(ÿþ|þÿ|ï»¿|�+)/, '');
    }
    return s;
}

// ─────────────────────────────────────────────
// TOKENIZADOR XML MÍNIMO
// ─────────────────────────────────────────────
// Error de lectura con el renglón donde se rompió: es lo que se muestra.
export class ErrorLectura extends Error {
    constructor(mensaje, renglon) {
        super(renglon ? `${mensaje} (renglón ${renglon})` : mensaje);
        this.name = 'ErrorLectura';
        this.renglon = renglon || null;
    }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function desEntidades(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e) => {
        if (e[0] === '#') {
            const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            try { return String.fromCodePoint(n); } catch (_) { return todo; }
        }
        const v = ENTIDADES[e.toLowerCase()];
        return v !== undefined ? v : todo;   // entidad desconocida: queda tal cual
    });
}

// Arma un árbol {nombre (en minúsculas), hijos, texto, renglon}. Lo que no es
// estructura (declaración, comentarios, DOCTYPE, instrucciones) se saltea.
// Si el archivo se corta a la mitad no tira: devuelve lo que alcanzó a leer y
// `cortadoEn` con el renglón, para que quien llama decida si alcanza.
export function arbolXml(texto) {
    const s = texto;
    const raiz = { nombre: '#raiz', hijos: [], texto: '', renglon: 1 };
    const pila = [raiz];
    let i = 0, renglon = 1;

    const avanzarHasta = (j) => {
        for (let k = i; k < j; k++) if (s.charCodeAt(k) === 10) renglon++;
        i = j;
    };

    while (i < s.length) {
        const lt = s.indexOf('<', i);
        if (lt === -1) {
            pila[pila.length - 1].texto += desEntidades(s.slice(i));
            avanzarHasta(s.length);
            break;
        }
        if (lt > i) pila[pila.length - 1].texto += desEntidades(s.slice(i, lt));
        avanzarHasta(lt);

        if (s.startsWith('<!--', i)) {
            const fin = s.indexOf('-->', i + 4);
            if (fin === -1) throw new ErrorLectura('Hay un comentario <!-- que nunca se cierra', renglon);
            avanzarHasta(fin + 3);
            continue;
        }
        if (s.startsWith('<![CDATA[', i)) {
            const fin = s.indexOf(']]>', i + 9);
            if (fin === -1) throw new ErrorLectura('Hay un bloque CDATA que nunca se cierra', renglon);
            pila[pila.length - 1].texto += s.slice(i + 9, fin);   // CDATA va literal, sin entidades
            avanzarHasta(fin + 3);
            continue;
        }
        if (s[i + 1] === '?' || s[i + 1] === '!') {
            const fin = s.indexOf('>', i + 2);
            if (fin === -1) throw new ErrorLectura('Hay una etiqueta "<' + s[i + 1] + '" sin cerrar', renglon);
            avanzarHasta(fin + 1);
            continue;
        }

        // Etiqueta normal. Los atributos no se usan en este formato, pero hay
        // que saltearlos bien: un ">" adentro de comillas no cierra la etiqueta.
        let j = i + 1, comilla = null;
        for (; j < s.length; j++) {
            const c = s[j];
            if (comilla) { if (c === comilla) comilla = null; }
            else if (c === '"' || c === "'") comilla = c;
            else if (c === '>') break;
            else if (c === '<') break;
        }
        // Sin ">" hasta el final: el archivo se cortó a mitad de una etiqueta
        // (se copió a medias, se llenó el disco). Se devuelve lo leído.
        if (j >= s.length) break;
        if (s[j] === '<') {
            throw new ErrorLectura('Hay una etiqueta que empieza con "<" y no se cierra con ">"', renglon);
        }
        const dentro = s.slice(i + 1, j).trim();
        const renglonEtiqueta = renglon;
        avanzarHasta(j + 1);

        if (dentro[0] === '/') {
            const nombre = dentro.slice(1).trim().toLowerCase();
            const arriba = pila[pila.length - 1];
            if (pila.length === 1 || arriba.nombre !== nombre) {
                const esperado = pila.length > 1 ? `</${arriba.nombre}>` : 'nada';
                throw new ErrorLectura(
                    `Se cierra </${nombre}> pero correspondía cerrar ${esperado}` +
                    (pila.length > 1 ? `, abierta en el renglón ${arriba.renglon}` : ''),
                    renglonEtiqueta);
            }
            pila.pop();
            continue;
        }
        const autocierre = dentro.endsWith('/');
        const nombre = (autocierre ? dentro.slice(0, -1) : dentro).trim().split(/\s+/)[0].toLowerCase();
        if (!nombre || !/^[a-z_][\w.\-:]*$/i.test(nombre)) {
            throw new ErrorLectura(`Etiqueta inválida "<${dentro.slice(0, 20)}>"`, renglonEtiqueta);
        }
        const nodo = { nombre, hijos: [], texto: '', renglon: renglonEtiqueta };
        pila[pila.length - 1].hijos.push(nodo);
        if (!autocierre) pila.push(nodo);
    }

    raiz.cortadoEn = pila.length > 1 ? { renglon, abierta: pila[pila.length - 1] } : null;
    return raiz;
}

const hijo  = (n, nombre) => n.hijos.find(h => h.nombre === nombre) || null;
const hijos = (n, nombre) => n.hijos.filter(h => h.nombre === nombre);
const valor = (n, nombre) => { const h = n && hijo(n, nombre); return h ? h.texto.trim() : ''; };

function buscar(n, nombre) {
    if (n.nombre === nombre) return n;
    for (const h of n.hijos) { const r = buscar(h, nombre); if (r) return r; }
    return null;
}

// ─────────────────────────────────────────────
// DETECTAR FORMATO
// ─────────────────────────────────────────────
export function detectarFormato(texto, nombreArchivo = '') {
    const s = decodificarTexto(texto).trimStart();
    const ext = String(nombreArchivo).toLowerCase().split('.').pop();

    if (s[0] === '{' || s[0] === '[' || ext === 'json') {
        let data;
        try { data = JSON.parse(s); } catch (_) { return 'desconocido'; }
        return formatoJson(data);
    }
    // No hace falta leerlo entero para saber qué es: alcanza con la etiqueta.
    if (/<\s*all_instances[\s>\/]/i.test(s)) return 'sportscode';
    return 'desconocido';
}

function formatoJson(data) {
    if (!data || typeof data !== 'object') return 'desconocido';
    // Lo que se guarda en localStorage (tv_sessions) es un array de sesiones:
    // se trata como un respaldo, hay que elegir cuál.
    if (Array.isArray(data)) return data.some(esSesion) ? 'ipad-respaldo' : 'desconocido';
    if (data.kind === 'backup' || Array.isArray(data.sessions)) return 'ipad-respaldo';
    if (data.kind === 'session' || esSesion(data)) return 'ipad-sesion';
    return 'desconocido';
}

const esSesion = (x) => !!x && typeof x === 'object' && Array.isArray(x.events);

// ─────────────────────────────────────────────
// NÚMEROS, TIEMPOS Y COLORES
// ─────────────────────────────────────────────
// "12.40", "12,4", "00:01:12.400", "1:12" → segundos. NaN si no se entiende.
export function segundos(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return NaN;
    if (s.includes(':')) {
        const partes = s.split(':').map(p => Number(p.replace(',', '.')));
        if (partes.some(p => !isFinite(p))) return NaN;
        return partes.reduce((acc, p) => acc * 60 + p, 0);
    }
    // Una sola coma y ningún punto: decimal con coma (Windows en español).
    const norm = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
    return norm === '' || !/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(norm) ? NaN : Number(norm);
}

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// Colores de ROWS: Sportscode usa 16 bits por canal. Si TODAS las filas del
// archivo tienen canales ≤ 255 se toma como 8 bits (LongoMatch): en 16 bits
// eso sería negro casi puro en todas, que nadie elige para todo.
function coloresDeFilas(crudos) {
    const canales = crudos.flatMap(c => c ? [c.r, c.g, c.b] : []);
    const ochoBits = canales.length > 0 && canales.every(v => v <= 255) && canales.some(v => v > 0);
    return crudos.map(c => {
        if (!c) return null;
        const f = ochoBits ? 1 : 255 / 65535;
        return '#' + hex2(c.r * f) + hex2(c.g * f) + hex2(c.b * f);
    });
}

// ─────────────────────────────────────────────
// LEER SPORTSCODE
// ─────────────────────────────────────────────
// Devuelve {eventos, filas, avisos, inicioReal}. Tira ErrorLectura solo si el
// archivo no se puede usar para nada (no es XML, está roto antes de la
// primera marca, no tiene ALL_INSTANCES). Un evento malo no tira: se saltea y
// se cuenta en `avisos`.
export function leerSportscode(entrada) {
    const texto = decodificarTexto(entrada);
    if (!texto.trim()) throw new ErrorLectura('El archivo está vacío');
    if (texto.trimStart()[0] !== '<') {
        throw new ErrorLectura('El archivo no es un XML: no empieza con "<"', 1);
    }

    let raiz, errorArbol = null;
    try {
        raiz = arbolXml(texto);
    } catch (err) {
        if (!(err instanceof ErrorLectura)) throw err;
        // Si el error está después de las marcas, igual se rescata lo que hay.
        errorArbol = err;
        raiz = arbolParcial(texto, err.renglon);
        if (!raiz) throw err;
    }

    const todas = buscar(raiz, 'all_instances');
    if (!todas) {
        if (errorArbol) throw errorArbol;
        throw new ErrorLectura('No es un XML de Sportscode: falta <ALL_INSTANCES>');
    }

    const avisos = [];
    if (errorArbol) {
        avisos.push(`El archivo está roto a partir del renglón ${errorArbol.renglon}: se leyó lo anterior. (${errorArbol.message})`);
    } else if (raiz.cortadoEn) {
        avisos.push(`El archivo termina sin cerrar <${raiz.cortadoEn.abierta.nombre}> (¿está cortado?): se leyó hasta el renglón ${raiz.cortadoEn.renglon}.`);
    }

    const eventos = [];
    const saltados = {};   // motivo → [renglones]
    const saltar = (motivo, renglon) => { (saltados[motivo] = saltados[motivo] || []).push(renglon); };

    for (const inst of hijos(todas, 'instance')) {
        const nombre = valor(inst, 'code').replace(/\s+/g, ' ');
        const tIni = segundos(valor(inst, 'start'));
        const tFin = segundos(valor(inst, 'end'));
        if (!nombre)            { saltar('sin código', inst.renglon); continue; }
        if (!isFinite(tIni))    { saltar('sin inicio o con un inicio que no es un número', inst.renglon); continue; }
        if (!isFinite(tFin))    { saltar('sin fin o con un fin que no es un número', inst.renglon); continue; }
        if (tFin < tIni)        { saltar('con el fin antes del inicio', inst.renglon); continue; }
        if (tFin < 0)           { saltar('con tiempos negativos', inst.renglon); continue; }

        const etiquetas = [];
        for (const lab of hijos(inst, 'label')) {
            const grupo = valor(lab, 'group');
            const textos = hijos(lab, 'text').map(t => t.texto.trim()).filter(Boolean);
            textos.forEach(t => etiquetas.push({ grupo, texto: t }));
        }
        const libre = valor(inst, 'free_text');
        if (libre) etiquetas.push({ grupo: 'Nota', texto: libre });

        const ev = { nombre, vInicio: Math.max(0, tIni), vFin: tFin, etiquetas };
        const id = valor(inst, 'id');
        if (id) ev.id = id;
        eventos.push(ev);
    }

    const motivos = Object.keys(saltados);
    if (motivos.length) {
        const total = motivos.reduce((a, m) => a + saltados[m].length, 0);
        const detalle = motivos.map(m => {
            const r = saltados[m];
            const lista = r.slice(0, 5).join(', ') + (r.length > 5 ? '…' : '');
            return `${r.length} ${m} (${r.length === 1 ? 'renglón' : 'renglones'} ${lista})`;
        }).join('; ');
        avisos.push(`Se ${total === 1 ? 'saltó 1 evento' : `saltaron ${total} eventos`}: ${detalle}.`);
    }

    eventos.sort((a, b) => a.vInicio - b.vInicio || a.nombre.localeCompare(b.nombre));

    // Filas: primero las de ROWS en su orden, después los códigos que no
    // tienen fila (sin color: la base les pone uno).
    const rows = buscar(raiz, 'rows');
    const crudas = rows ? hijos(rows, 'row').map(r => {
        const [R, G, B] = ['r', 'g', 'b'].map(c => segundos(valor(r, c)));
        return {
            nombre: valor(r, 'code').replace(/\s+/g, ' '),
            rgb: [R, G, B].every(isFinite) ? { r: R, g: G, b: B } : null
        };
    }).filter(r => r.nombre) : [];
    const colores = coloresDeFilas(crudas.map(r => r.rgb));
    const filas = [];
    const vistas = new Set();
    crudas.forEach((r, k) => {
        if (vistas.has(r.nombre)) return;
        vistas.add(r.nombre);
        filas.push({ nombre: r.nombre, color: colores[k] });
    });
    eventos.forEach(ev => {
        if (!vistas.has(ev.nombre)) { vistas.add(ev.nombre); filas.push({ nombre: ev.nombre, color: null }); }
    });

    if (!eventos.length && !motivos.length) avisos.push('El archivo no tiene ninguna marca.');

    return { eventos, filas, avisos, inicioReal: fechaDeSesion(valor(buscar(raiz, 'session_info') || raiz, 'start_time')) };
}

// Si el XML se rompe DESPUÉS de </ALL_INSTANCES> (ROWS mal armado, basura al
// final), las marcas se pueden usar igual: se vuelve a leer solo hasta ahí.
function arbolParcial(texto, renglonError) {
    const m = /<\/\s*all_instances\s*>/i.exec(texto);
    if (!m) return null;
    const hasta = m.index + m[0].length;
    const renglonCierre = texto.slice(0, hasta).split('\n').length;
    if (renglonError && renglonError <= renglonCierre) return null;
    try { return arbolXml(texto.slice(0, hasta)); } catch (_) { return null; }
}

// "2026-09-15 20:30:00 +0000" → ISO. null si no se entiende.
function fechaDeSesion(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/.exec(String(s).trim());
    if (!m) return null;
    let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (m[7]) t -= (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) * 60000;
    const d = new Date(t);
    return isNaN(d) ? null : d.toISOString();
}

// ─────────────────────────────────────────────
// SESIONES DEL iPad
// ─────────────────────────────────────────────
// Una sesión (kind:'session' o un elemento de `sessions` del respaldo) →
// PARTIDO sin video. Los tiempos del iPad son reloj de partido (se frena en
// PAUSE): vInicio = inicio + desfase. El desfase se conoce recién cuando se
// sincroniza contra el video; hasta entonces, 0.
//
// `opciones.plantilla` = datos {elements, links, hojas} de la botonera con la
// que se codificó, si se sabe (ver `plantillaDeSesion`): de ahí salen el
// equipo de cada evento y los colores.
export function leerSesionIpad(json, opciones = {}) {
    const s = typeof json === 'string' ? JSON.parse(decodificarTexto(json)) : json;
    if (!esSesion(s)) throw new ErrorLectura('No es una sesión del iPad: no tiene "events"');
    const desfase = Number(opciones.desfase) || 0;
    const plantilla = opciones.plantilla || null;
    const botones = new Map((plantilla && plantilla.elements || []).map(e => [String(e.id), e]));

    const avisos = [];
    let saltados = 0;
    const eventos = [];
    for (const ev of s.events) {
        // Los tramos de posesión de sesiones viejas venían como eventos: son
        // estadística, van a `posesion` (igual que en app.js).
        if (!ev || ev.posesionDe) continue;
        const inicio = Number(ev.start);
        let fin = ev.end == null ? null : Number(ev.end);
        const nombre = String(ev.name == null ? '' : ev.name).trim();
        if (!nombre || !isFinite(inicio) || (fin !== null && (!isFinite(fin) || fin < inicio))) {
            saltados++;
            continue;
        }
        // Un evento manual que quedó abierto: el XML de app.js le da 1 s.
        if (fin === null) fin = inicio + 1;
        const boton = botones.get(String(ev.buttonId));
        const equipo = ev.equipo || (boton && (boton.equipo === 'A' || boton.equipo === 'B') ? boton.equipo : null);
        eventos.push({
            nombre,
            botonId: ev.buttonId != null ? String(ev.buttonId) : null,
            equipo,
            linea: ev.line || null,
            inicio, fin,
            vInicio: inicio + desfase,
            vFin: fin + desfase,
            etiquetas: [
                ...(ev.line ? [{ grupo: 'Linea', texto: ev.line }] : []),
                ...(ev.descriptors || []).map(d => ({ grupo: 'Etiqueta', texto: String(d) }))
            ]
        });
    }
    if (saltados) avisos.push(`Se ${saltados === 1 ? 'saltó 1 evento roto' : `saltaron ${saltados} eventos rotos`} (sin nombre o con el fin antes del inicio).`);
    eventos.sort((a, b) => a.inicio - b.inicio);

    const tramos = (s.tramosPos && s.tramosPos.length)
        ? s.tramosPos
        : s.events.filter(ev => ev && ev.posesionDe).map(ev => ({ equipo: ev.equipo, start: ev.start, end: ev.end }));

    const durMarcas = eventos.reduce((m, ev) => Math.max(m, ev.fin), 0);
    return {
        nombre: String(s.name || 'Sesión del iPad'),
        inicioReal: s.startedAt || null,
        duracion: duracionDeTexto(s.duration) || durMarcas,
        videoRuta: null, videoMime: null, videoBytes: null,
        local: null, visitante: null,
        plantilla,
        origen: 'importado',
        desfase,
        eventos,
        posesion: tramos
            .filter(t => t && isFinite(t.start) && isFinite(t.end) && t.end > t.start)
            .map(t => ({ equipo: t.equipo, inicio: Number(t.start), fin: Number(t.end) })),
        avisos
    };
}

// "83:12" (fmt de app.js: minutos pueden pasar de 60) o "1:23:12" → segundos.
function duracionDeTexto(d) {
    if (typeof d === 'number') return d;
    const n = segundos(d);
    return isFinite(n) ? n : 0;
}

// Lista de sesiones de un respaldo (o del array crudo de tv_sessions).
export function sesionesDeRespaldo(json) {
    const data = typeof json === 'string' ? JSON.parse(decodificarTexto(json)) : json;
    const lista = Array.isArray(data) ? data : (data && data.sessions) || [];
    return lista.map((s, indice) => ({ s, indice }))
        .filter(({ s }) => esSesion(s))
        .map(({ s, indice }) => ({
            indice,
            nombre: String(s.name || `Sesión ${indice + 1}`),
            fecha: s.date || s.startedAt || '',
            eventos: s.events.filter(ev => ev && !ev.posesionDe).length
        }));
}

// La sesión del iPad no dice con qué botonera se codificó. En un respaldo
// vienen el lienzo actual y las plantillas guardadas: se elige la que tenga
// más botones de los que usa la sesión (los ids de botón son únicos: un
// Date.now() de cuando se creó cada uno).
export function plantillaDeSesion(sesion, respaldo) {
    if (!respaldo || typeof respaldo !== 'object' || Array.isArray(respaldo)) return null;
    const usados = new Set((sesion.events || []).map(ev => String(ev.buttonId)).filter(x => x !== 'undefined'));
    if (!usados.size) return null;
    const candidatas = [];
    if (respaldo.current) candidatas.push({ nombre: 'Lienzo del iPad', datos: respaldo.current });
    (respaldo.templates || []).forEach(t => candidatas.push({ nombre: t.name, datos: t }));
    let mejor = null, puntos = 0;
    for (const c of candidatas) {
        const ids = new Set((c.datos.elements || []).map(e => String(e.id)));
        let n = 0;
        usados.forEach(id => { if (ids.has(id)) n++; });
        if (n > puntos) { mejor = c; puntos = n; }
    }
    if (!mejor) return null;
    return {
        nombre: mejor.nombre,
        datos: { elements: mejor.datos.elements || [], links: mejor.datos.links || [], hojas: mejor.datos.hojas || [] }
    };
}

// ─────────────────────────────────────────────
// PLANTILLA MÍNIMA DESDE LAS FILAS
// ─────────────────────────────────────────────
// Un botón `event` por categoría, con su color, en una grilla de 6 columnas.
// No es para codificar (para eso están las del iPad): es para que la base
// pinte la matriz de clips con los colores del XML.
const PALETA = ['#3a8fd6', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];

export function plantillaDesdeFilas(filas) {
    const base = 1000;   // ids chicos y fijos: la misma lista da la misma plantilla
    const elements = (filas || []).map((f, k) => ({
        id: base + k,
        type: 'event',
        name: f.nombre,
        color: f.color || PALETA[k % PALETA.length],
        x: 20 + (k % 6) * 140,
        y: 20 + Math.floor(k / 6) * 72,
        w: 120, h: 52,
        timeMode: 'fixed',
        exclusiveIds: [],
        isExclusive: false,
        lead: 0, lag: 1,
        popups: [],
        lineMemberIds: [],
        lineExclusive: true
    }));
    return { elements, links: [], hojas: [] };
}

// Filas (categoría + color) de una plantilla del iPad, para el resumen.
export function filasDePlantilla(datos, nombres) {
    const porNombre = new Map();
    (datos && datos.elements || []).forEach(e => {
        if (e.type === 'event' && e.name && !porNombre.has(e.name)) porNombre.set(e.name, e.color || '#3a8fd6');
    });
    return [...new Set(nombres)].map(n => ({ nombre: n, color: porNombre.get(n) || null }));
}

// ─────────────────────────────────────────────
// DESFASE Y ARMADO DEL PARTIDO
// ─────────────────────────────────────────────
// Toda la rama trabaja con `inicio/fin` = el tiempo que trae el archivo (en
// un XML ya es del video; en una sesión del iPad es reloj de partido) y
// aplica `video = archivo + desfase` al final. Así mover el desfase nunca
// acumula errores de redondeo.
export function aplicarDesfase(eventos, desfase) {
    const d = Number(desfase) || 0;
    const r = (x) => Math.round(x * 1000) / 1000;
    return eventos.map(ev => ({
        ...ev,
        vInicio: r(Math.max(0, ev.inicio + d)),
        vFin: ev.fin == null ? null : r(Math.max(0, ev.fin + d))
    }));
}

// Eventos de un XML leído → formato PARTIDO (con inicio/fin = tiempo del XML).
export function eventosDesdeSportscode(leido) {
    return leido.eventos.map(ev => {
        const linea = (ev.etiquetas.find(e => /^l[ií]nea$/i.test(e.grupo)) || {}).texto || null;
        return {
            nombre: ev.nombre, botonId: null, equipo: null, linea,
            inicio: ev.vInicio, fin: ev.vFin,
            vInicio: ev.vInicio, vFin: ev.vFin,
            etiquetas: ev.etiquetas.map(e => ({ grupo: e.grupo, texto: e.texto }))
        };
    });
}

// Resumen para el paso 3: conteo por categoría y cómo encajan en el video.
export function resumir(eventos, desfase, duracionVideo) {
    const conDesfase = aplicarDesfase(eventos, desfase);
    const categorias = new Map();
    conDesfase.forEach(ev => categorias.set(ev.nombre, (categorias.get(ev.nombre) || 0) + 1));
    const fin = conDesfase.reduce((m, ev) => Math.max(m, ev.vFin == null ? ev.vInicio : ev.vFin), 0);
    const ini = conDesfase.reduce((m, ev) => Math.min(m, ev.vInicio), Infinity);
    const dur = Number(duracionVideo) || 0;
    return {
        eventos: conDesfase.length,
        categorias: [...categorias].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre)),
        desde: isFinite(ini) ? ini : 0,
        hasta: fin,
        despuesDelVideo: dur ? conDesfase.filter(ev => ev.vInicio >= dur).length : 0,
        cortadosPorElFinal: dur ? conDesfase.filter(ev => ev.vInicio < dur && ev.vFin > dur).length : 0,
        antesDelVideo: eventos.filter(ev => (ev.fin == null ? ev.inicio : ev.fin) + (Number(desfase) || 0) < 0).length
    };
}

// Tres clips de muestra: el primero, el del medio y el último.
export function clipsDeMuestra(eventos) {
    const orden = [...eventos].sort((a, b) => a.inicio - b.inicio);
    if (orden.length <= 3) return orden;
    return [orden[0], orden[Math.floor(orden.length / 2)], orden[orden.length - 1]];
}

// Nombre apto para Windows (carpeta y archivo): sin \ / : * ? " < > | ni
// puntos/espacios al final, que Windows se come y después no encuentra.
export function nombreLimpio(nombre) {
    const s = String(nombre || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    const r = s.slice(0, 120) || 'Partido';
    return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(r) ? r + '_' : r;
}

// ─────────────────────────────────────────────
// EL XML ORIGINAL, LISTO PARA GUARDAR AL LADO DEL VIDEO
// ─────────────────────────────────────────────
// Se guarda el archivo que vino, no uno rehecho: conserva todo lo que el
// otro programa escribió (free_text, SORT_INFO, sus colores). Dos arreglos:
//  - si se sincronizó con un desfase, sus <start>/<end> ya no coinciden con
//    el video: se corren, solo dentro de ALL_INSTANCES;
//  - la declaración pierde el `encoding`: el texto se vuelve a escribir en
//    otra codificación (la de tv.archivos.guardarTexto) y una declaración
//    que dijera "windows-1252" haría leer mal los acentos.
export function xmlParaGuardar(texto, desfase = 0) {
    let s = decodificarTexto(texto).replace(/(<\?xml[^?]*?)\s+encoding\s*=\s*["'][^"']*["']/i, '$1');
    const d = Number(desfase) || 0;
    if (!d) return s;
    const a = s.search(/<\s*all_instances[\s>]/i);
    const b = s.search(/<\/\s*all_instances\s*>/i);
    if (a === -1 || b === -1) return s;
    const medio = s.slice(a, b).replace(/(<\s*(start|end)\s*>)([^<]*)(<\/\s*\2\s*>)/gi, (todo, abre, _n, v, cierra) => {
        const t = segundos(v);
        return isFinite(t) ? abre + Math.max(0, t + d).toFixed(2) + cierra : todo;
    });
    return s.slice(0, a) + medio + s.slice(b);
}

// ─────────────────────────────────────────────
// DUPLICADOS
// ─────────────────────────────────────────────
// Partidos de la base (tv.partidos.listar) que parecen ser el mismo: el
// mismo archivo de video, o el mismo nombre con la misma cantidad de
// eventos (el mismo XML importado dos veces).
export function buscarDuplicados(partidos, { videoRuta, nombre, eventos }) {
    const norm = (r) => String(r || '').replace(/\//g, '\\').toLowerCase();
    const nom = (n) => String(n || '').trim().toLowerCase();
    return (partidos || []).filter(p =>
        (videoRuta && p.video_ruta && norm(p.video_ruta) === norm(videoRuta)) ||
        (nombre && nom(p.nombre) === nom(nombre) && Number(p.eventos) === Number(eventos)));
}
