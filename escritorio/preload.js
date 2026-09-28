// Puente entre las pantallas y el proceso principal: window.tv.
//
// La pagina no tiene Node: solo ve estas funciones, y nada mas. Los nombres
// son el contrato comun de los agentes (ver escritorio/README.md); cambiarlos
// rompe pantallas.
//
// Todas devuelven Promise. Los errores llegan como Error con su mensaje limpio
// y sus propiedades (por ejemplo necesitaLogin), no como "Error invoking
// remote method...".

const { contextBridge, ipcRenderer } = require('electron');

async function llamar(canal, ...args) {
    const r = await ipcRenderer.invoke(canal, ...args);
    if (r && typeof r === 'object' && r.__tvError) {
        const { message, ...extra } = r.__tvError;
        throw Object.assign(new Error(message), extra);
    }
    return r;
}

// Suscripcion a un evento de main. Devuelve la funcion para desuscribirse.
function escuchar(canal) {
    return (cb) => {
        if (typeof cb !== 'function') throw new Error('Hace falta una funcion');
        const f = (_e, dato) => cb(dato);
        ipcRenderer.on(canal, f);
        return () => ipcRenderer.removeListener(canal, f);
    };
}

const tv = {
    plantillas: {
        listar:          ()   => llamar('plantillas:listar'),
        leer:            (id) => llamar('plantillas:leer', id),
        guardar:         (t)  => llamar('plantillas:guardar', t),
        borrar:          (id) => llamar('plantillas:borrar', id),
        importarArchivo: ()   => llamar('plantillas:importarArchivo'),
        // Sin sesion rechaza con {necesitaLogin:true}; reintentar con {correo, clave}.
        importarNube:    (credenciales) => llamar('plantillas:importarNube', credenciales),
        exportarArchivo: (id) => llamar('plantillas:exportarArchivo', id)
    },

    equipos: {
        listar:  ()   => llamar('equipos:listar'),
        guardar: (e)  => llamar('equipos:guardar', e),
        borrar:  (id) => llamar('equipos:borrar', id)
    },

    partidos: {
        guardar:    (p)          => llamar('partidos:guardar', p),
        listar:     (filtro)     => llamar('partidos:listar', filtro),
        leer:       (id)         => llamar('partidos:leer', id),
        actualizar: (id, campos) => llamar('partidos:actualizar', id, campos),
        borrar:     (id)         => llamar('partidos:borrar', id)
    },

    eventos: {
        agregar:          (partidoId, ev) => llamar('eventos:agregar', partidoId, ev),
        actualizar:       (id, campos)    => llamar('eventos:actualizar', id, campos),
        actualizarVarios: (lista)         => llamar('eventos:actualizarVarios', lista),
        borrar:           (id)            => llamar('eventos:borrar', id),
        buscar:           (filtro)        => llamar('eventos:buscar', filtro)
    },

    playlists: {
        listar:  ()   => llamar('playlists:listar'),
        leer:    (id) => llamar('playlists:leer', id),
        guardar: (pl) => llamar('playlists:guardar', pl),
        borrar:  (id) => llamar('playlists:borrar', id)
    },

    video: {
        iniciar:        (nombre, mime)   => llamar('video:iniciar', nombre, mime),
        trozo:          (datos)          => llamar('video:trozo', datos),
        finalizar:      ()               => llamar('video:finalizar'),
        descartar:      ()               => llamar('video:descartar'),
        ubicar:         (ruta, opciones) => llamar('video:ubicar', ruta, opciones),
        url:            (ruta)           => llamar('video:url', ruta),
        elegirArchivo:  ()               => llamar('video:elegirArchivo'),
        copiarACarpeta: (ruta, opciones) => llamar('video:copiarACarpeta', ruta, opciones),
        // Corta la copia en curso y borra lo copiado (Importar → Cancelar).
        cancelarCopia:  ()               => llamar('video:cancelarCopia'),
        info:           (ruta)           => llamar('video:info', ruta),
        onError:        escuchar('video:error'),
        onProgreso:     escuchar('video:progreso')
    },

    clips: {
        disponible: ()        => llamar('clips:disponible'),
        exportar:   (opciones) => llamar('clips:exportar', opciones)
    },

    archivos: {
        elegir:        (opciones) => llamar('archivos:elegir', opciones),
        guardarTexto:  (opciones) => llamar('archivos:guardarTexto', opciones),
        mostrar:       (ruta)     => llamar('archivos:mostrar', ruta),
        abrirCarpeta:  (sub)      => llamar('archivos:abrirCarpeta', sub),
        respaldarBase: ()         => llamar('archivos:respaldarBase')
    },

    // Los handlers son de main/remoto.js (Agente 5). Si ese archivo no esta,
    // estas llamadas rechazan y el resto de la app sigue.
    remoto: {
        iniciar:   (opciones) => ipcRenderer.invoke('remoto:iniciar', opciones),
        detener:   ()         => ipcRenderer.invoke('remoto:detener'),
        estado:    ()         => ipcRenderer.invoke('remoto:estado'),
        enviar:    (mensaje)  => ipcRenderer.invoke('remoto:enviar', mensaje),
        onMensaje: escuchar('remoto:mensaje'),
        onCliente: escuchar('remoto:cliente')
    },

    ajustes: {
        leer:    ()        => llamar('ajustes:leer'),
        guardar: (parcial) => llamar('ajustes:guardar', parcial)
    },

    sys: {
        info:          () => llamar('sys:info'),
        elegirCarpeta: () => llamar('sys:elegirCarpeta'),
        // Permisos de macOS (main/mac.js). En Windows: siempre 'concedido'.
        //   tipo = 'camara' | 'microfono'
        //   → 'concedido' | 'denegado' | 'no-determinado' | 'restringido'
        permiso:            (tipo)   => llamar('sys:permiso', tipo),
        pedirPermiso:       (tipo)   => llamar('sys:pedirPermiso', tipo),
        // pagina = 'camara' | 'microfono' | 'red-local' | 'firewall'
        abrirAjustesSistema: (pagina) => llamar('sys:abrirAjustesSistema', pagina)
    },

    // Versiones nuevas (main/actualizar.js). estado = { fase: 'nada' |
    // 'buscando' | 'bajando' | 'lista' | 'error', version, porcentaje, actual, activo }
    actualizar: {
        estado:    () => llamar('actualizar:estado'),
        buscar:    () => llamar('actualizar:buscar'),
        // Cierra (preguntando si se graba), instala y vuelve a abrir.
        instalar:  () => llamar('actualizar:instalar'),
        onEstado:  escuchar('actualizar:estado')
    },

    ventana: {
        tema: (colores) => llamar('ventana:tema', colores),
        // cb(boolean). En Mac el semaforo desaparece en pantalla completa.
        onPantallaCompleta: escuchar('ventana:pantallaCompleta'),
        esPantallaCompleta: () => llamar('ventana:esPantallaCompleta'),
        // cb(idRama): el menu de Mac (⌘,) pide ir a una rama.
        onIrA: escuchar('ventana:irA')
    }
};

contextBridge.exposeInMainWorld('tv', tv);
