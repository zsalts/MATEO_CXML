// IPC de la base: plantillas, equipos, partidos, eventos, playlists e
// importacion desde el iPad.

const fs = require('fs');
const bd = require('../db');
const { manejar, v } = require('./ipc');
const importar = require('./importar');
const { nombreSeguro, decodificarTexto } = require('./rutas');

const ORIGENES = new Set(['captura', 'ipad-vivo', 'ipad-importado', 'importado']);

function registrarDatos(ipcMain, { abrirBase, video, dialog, ventana, nube, alCambiarPlantillas = () => {} }) {
    // Toda llamada abre (o reusa) la base de la carpeta de trabajo actual.
    const con = fn => async (...args) => { await abrirBase(); return fn(...args); };
    // Lo que cambia plantillas avisa, y main/sincro.js las lleva al iPad.
    const yAvisa = fn => async (...args) => { const r = await fn(...args); alCambiarPlantillas(); return r; };

    // Un video enlazado a un partido tiene que poder verse aunque este fuera
    // de la carpeta de trabajo (se importo sin copiar): la ruta entra en la
    // lista blanca cuando la base se la da a la pagina.
    const permitirVideos = filas => {
        (Array.isArray(filas) ? filas : [filas]).forEach(f => f && f.video_ruta && video.permitir(f.video_ruta));
        return filas;
    };

    // ─── Plantillas ───
    manejar(ipcMain, 'plantillas:listar', con(() => bd.listarPlantillas()));
    manejar(ipcMain, 'plantillas:leer', con(id => bd.leerPlantilla(v.id(id))));
    manejar(ipcMain, 'plantillas:guardar', yAvisa(con(t => {
        v.objeto(t, 'plantilla');
        v.texto(t.nombre, 'nombre', { max: 200 });
        if (t.datos === undefined || t.datos === null) throw new Error('Faltan los datos de la plantilla');
        if (t.id !== undefined && t.id !== null) v.id(t.id);
        return bd.guardarPlantilla({ id: t.id, nombre: t.nombre, datos: t.datos, origen: t.origen });
    })));
    manejar(ipcMain, 'plantillas:borrar', yAvisa(con(id => bd.borrarPlantilla(v.id(id)))));

    manejar(ipcMain, 'plantillas:importarArchivo', yAvisa(con(async () => {
        const r = await dialog.showOpenDialog(ventana(), {
            title: 'Importar del iPad (plantilla, sesion o copia de seguridad)',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Archivos de Tag & View', extensions: ['json'] }, { name: 'Todos', extensions: ['*'] }]
        });
        // Cancelar devuelve ceros (y cancelado) para que la pantalla no tenga
        // que preguntar por null antes de leer los numeros.
        if (r.canceled || !r.filePaths.length) return { plantillas: 0, equipos: 0, partidos: 0, cancelado: true };
        const total = { plantillas: 0, equipos: 0, partidos: 0 };
        for (const ruta of r.filePaths) {
            if (fs.statSync(ruta).size > 50 * 1024 * 1024) throw new Error('El archivo es demasiado grande');
            let data;
            try { data = JSON.parse(decodificarTexto(fs.readFileSync(ruta))); }
            catch (_) { throw new Error(`"${require('path').basename(ruta)}" no es un archivo JSON valido`); }
            const c = importar.importarDatos(data, 'ipad');
            total.plantillas += c.plantillas; total.equipos += c.equipos; total.partidos += c.partidos;
        }
        return total;
    })));

    // Con credenciales = reintento despues de {necesitaLogin:true}.
    manejar(ipcMain, 'plantillas:importarNube', yAvisa(con(async credenciales => {
        const cr = v.objeto(credenciales, 'credenciales', { opcional: true });
        const data = await nube.bajarRespaldo(cr.correo ? { correo: v.texto(cr.correo, 'correo', { max: 300 }),
                                                             clave: v.texto(cr.clave, 'clave', { max: 300 }) } : null);
        const c = importar.importarDatos(data, 'nube');
        return { plantillas: c.plantillas, equipos: c.equipos, partidos: c.partidos };
    })));

    manejar(ipcMain, 'plantillas:exportarArchivo', con(async id => {
        const t = bd.leerPlantilla(v.id(id));
        if (!t) throw new Error('No existe esa plantilla');
        const r = await dialog.showSaveDialog(ventana(), {
            title: 'Guardar plantilla para el iPad',
            defaultPath: nombreSeguro(`Plantilla ${t.nombre}`, 'Plantilla') + '.json',
            filters: [{ name: 'Plantilla de Tag & View', extensions: ['json'] }]
        });
        if (r.canceled || !r.filePath) return null;
        fs.writeFileSync(r.filePath, JSON.stringify(importar.plantillaComoArchivo(t), null, 2), 'utf8');
        return r.filePath;
    }));

    // ─── Equipos ───
    manejar(ipcMain, 'equipos:listar', con(() => bd.listarEquipos()));
    manejar(ipcMain, 'equipos:guardar', con(e => {
        v.objeto(e, 'equipo');
        v.texto(e.nombre, 'nombre', { max: 120 });
        v.texto(e.color, 'color', { opcional: true, max: 60 });
        return bd.guardarEquipo(e);
    }));
    manejar(ipcMain, 'equipos:borrar', con(id => bd.borrarEquipo(v.id(id))));

    // ─── Partidos ───
    manejar(ipcMain, 'partidos:guardar', con(p => {
        v.objeto(p, 'partido');
        v.texto(p.nombre, 'nombre', { max: 300 });
        v.lista(p.eventos, 'eventos', { opcional: true });
        v.lista(p.posesion, 'posesion', { opcional: true });
        if (p.origen && !ORIGENES.has(p.origen)) throw new Error('origen invalido: ' + p.origen);
        (p.eventos || []).forEach((ev, i) => {
            v.objeto(ev, `evento ${i + 1}`);
            v.texto(ev.nombre, `nombre del evento ${i + 1}`, { max: 300 });
            v.lista(ev.etiquetas, `etiquetas del evento ${i + 1}`, { opcional: true });
        });
        const ruta = p.videoRuta || p.video_ruta;
        if (ruta) video.permitir(ruta);
        return bd.guardarPartido(p);
    }));
    manejar(ipcMain, 'partidos:listar', con(filtro => permitirVideos(bd.listarPartidos(v.objeto(filtro, 'filtro', { opcional: true })))));
    manejar(ipcMain, 'partidos:leer', con(id => permitirVideos(bd.leerPartido(v.id(id)))));
    manejar(ipcMain, 'partidos:actualizar', con((id, cambios) => {
        v.objeto(cambios, 'cambios');
        if (cambios.origen && !ORIGENES.has(cambios.origen)) throw new Error('origen invalido');
        const ruta = cambios.video_ruta || cambios.videoRuta;
        if (ruta) { v.texto(ruta, 'video_ruta', { max: 1000 }); video.permitir(ruta); }
        return bd.actualizarPartido(v.id(id), cambios);
    }));
    manejar(ipcMain, 'partidos:borrar', con(id => bd.borrarPartido(v.id(id))));

    // ─── Eventos ───
    manejar(ipcMain, 'eventos:agregar', con((partidoId, ev) => {
        v.objeto(ev, 'evento');
        v.texto(ev.nombre, 'nombre', { max: 300 });
        v.lista(ev.etiquetas, 'etiquetas', { opcional: true });
        return bd.agregarEvento(v.id(partidoId, 'partidoId'), ev);
    }));
    manejar(ipcMain, 'eventos:actualizar', con((id, cambios) => {
        v.objeto(cambios, 'cambios');
        v.lista(cambios.etiquetas, 'etiquetas', { opcional: true });
        return bd.actualizarEvento(v.id(id), cambios);
    }));
    manejar(ipcMain, 'eventos:actualizarVarios', con(lista => bd.actualizarVarios(v.lista(lista, 'lista'))));
    manejar(ipcMain, 'eventos:borrar', con(id => bd.borrarEvento(v.id(id))));
    manejar(ipcMain, 'eventos:buscar', con(filtro => {
        const f = v.objeto(filtro, 'filtro', { opcional: true });
        v.lista(f.nombres, 'nombres', { opcional: true, max: 2000 });
        v.lista(f.etiquetas, 'etiquetas', { opcional: true, max: 2000 });
        v.lista(f.partidos, 'partidos', { opcional: true, max: 5000 });
        return permitirVideos(bd.buscarEventos(f));
    }));

    // ─── Playlists ───
    manejar(ipcMain, 'playlists:listar', con(() => bd.listarPlaylists()));
    manejar(ipcMain, 'playlists:leer', con(id => {
        const pl = bd.leerPlaylist(v.id(id));
        if (pl) permitirVideos(pl.items);
        return pl;
    }));
    manejar(ipcMain, 'playlists:guardar', con(pl => {
        v.objeto(pl, 'playlist');
        v.texto(pl.nombre, 'nombre', { max: 200 });
        v.lista(pl.items, 'items', { opcional: true });
        return bd.guardarPlaylist(pl);
    }));
    manejar(ipcMain, 'playlists:borrar', con(id => bd.borrarPlaylist(v.id(id))));
}

module.exports = { registrarDatos };
