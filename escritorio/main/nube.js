// Traer el respaldo.json que la app del iPad sube a la nube (Supabase Storage).
//
// Hace lo mismo que nubeEntrar() / nubeToken() / nubeBajar() de app.js, pero
// desde el proceso principal: la pantalla no ve ni la clave ni los tokens.
//
// La sesion se recuerda como en el iPad: se guarda el refresh token (cifrado
// con safeStorage si Windows lo permite) y con eso se entra solo la proxima.
// Sin sesion valida se rechaza con {necesitaLogin:true} y la pantalla vuelve a
// llamar con {correo, clave}.

const fs = require('fs');
const vm = require('vm');

const ARCHIVO_RESPALDO = 'respaldo.json';

// nube-config.js es un script de navegador (window.NUBE = {...}): se corre en
// una caja vacia y se toma lo que dejo en window. No hay require ni nada del
// sistema al alcance.
function leerConfigNube(ruta) {
    try {
        const codigo = fs.readFileSync(ruta, 'utf8');
        const caja = { window: {} };
        vm.runInNewContext(codigo, caja, { timeout: 200, filename: 'nube-config.js' });
        const n = caja.window.NUBE || {};
        if (!n.url || !n.anonKey) return null;
        return { url: String(n.url).replace(/\/+$/, ''), anonKey: String(n.anonKey), bucket: String(n.bucket || 'codificaciones') };
    } catch (_) {
        return null;
    }
}

function errorLogin(mensaje) {
    const e = new Error(mensaje || 'Hace falta entrar a la nube');
    e.necesitaLogin = true;
    return e;
}

function crearNube({ rutaConfig, guardarSesion, leerSesion }) {
    let sesion = null;   // {access, refresh, vence, email}

    async function pedir(cfg, ruta, opciones) {
        let r;
        try {
            r = await fetch(cfg.url + ruta, opciones);
        } catch (_) {
            throw new Error('Sin conexion a internet');
        }
        if (r.ok) return r;
        let detalle = '';
        try {
            const cuerpo = await r.json();
            detalle = cuerpo.error_description || cuerpo.msg || cuerpo.message || cuerpo.error || '';
        } catch (_) { /* sin cuerpo JSON */ }
        const e = new Error(detalle || ('HTTP ' + r.status));
        e.status = r.status;
        throw e;
    }

    function tomarTokens(data) {
        sesion = {
            access:  data.access_token,
            refresh: data.refresh_token,
            vence:   Date.now() + ((data.expires_in || 3600) - 60) * 1000,
            email:   (data.user && data.user.email) || ''
        };
        guardarSesion({ refresh: sesion.refresh, email: sesion.email });
    }

    async function token(cfg, credenciales) {
        if (credenciales && credenciales.correo && credenciales.clave) {
            try {
                const r = await pedir(cfg, '/auth/v1/token?grant_type=password', {
                    method: 'POST',
                    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: String(credenciales.correo), password: String(credenciales.clave) })
                });
                tomarTokens(await r.json());
                return sesion.access;
            } catch (err) {
                if (err.status === 400 || err.status === 401) throw errorLogin('Correo o contrasena incorrectos');
                throw err;
            }
        }
        if (sesion && Date.now() < sesion.vence) return sesion.access;

        const guardada = sesion || leerSesion();
        if (!guardada || !guardada.refresh) throw errorLogin();
        try {
            const r = await pedir(cfg, '/auth/v1/token?grant_type=refresh_token', {
                method: 'POST',
                headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: guardada.refresh })
            });
            tomarTokens(await r.json());
            return sesion.access;
        } catch (err) {
            if (err.status) {           // el servidor rechazo el refresh: hay que entrar de nuevo
                sesion = null;
                guardarSesion(null);
                throw errorLogin('La sesion de la nube vencio, entra de nuevo');
            }
            throw err;                  // sin red: la sesion sigue siendo buena
        }
    }

    async function bajarRespaldo(credenciales) {
        const cfg = leerConfigNube(rutaConfig());
        if (!cfg) throw new Error('La nube no esta configurada (falta nube-config.js)');
        const t = await token(cfg, credenciales);
        let r;
        try {
            r = await pedir(cfg, '/storage/v1/object/' + cfg.bucket + '/' + encodeURIComponent(ARCHIVO_RESPALDO), {
                headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + t },
                cache: 'no-store'
            });
        } catch (err) {
            if (/not.?found|NoSuchKey|404/i.test(err.message) || err.status === 404 || err.status === 400) {
                throw new Error('Todavia no hay ningun respaldo en la nube');
            }
            throw err;
        }
        const texto = await r.text();
        try { return JSON.parse(texto); } catch (_) { throw new Error('El respaldo de la nube esta danado'); }
    }

    function salir() { sesion = null; guardarSesion(null); }

    // ── Para la sincronizacion de plantillas (main/sincro.js) ──
    function config() {
        const cfg = leerConfigNube(rutaConfig());
        if (!cfg) throw new Error('La nube no esta configurada (falta nube-config.js)');
        return cfg;
    }

    // Un archivo del bucket como texto, o null si todavia no existe. Sin
    // sesion rechaza con {necesitaLogin:true}, igual que bajarRespaldo.
    async function bajar(nombre) {
        const cfg = config();
        const t = await token(cfg);
        try {
            const r = await pedir(cfg, '/storage/v1/object/' + cfg.bucket + '/' + encodeURIComponent(nombre), {
                headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + t },
                cache: 'no-store'
            });
            return await r.text();
        } catch (err) {
            // Supabase contesta 400 "Object not found" (o 404) si no esta.
            if (err.status === 404 || err.status === 400 || /not.?found|NoSuchKey/i.test(err.message)) return null;
            throw err;
        }
    }

    // Sube (o pisa) un archivo JSON del bucket.
    async function subir(nombre, texto) {
        const cfg = config();
        const t = await token(cfg);
        await pedir(cfg, '/storage/v1/object/' + cfg.bucket + '/' + encodeURIComponent(nombre), {
            method: 'POST',
            headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: texto
        });
    }

    // Entrar sin traer nada (para sincronizar). Rechaza con necesitaLogin si
    // el correo o la clave no van.
    async function entrar(credenciales) {
        await token(config(), credenciales);
        return estado();
    }

    function estado() {
        const guardada = sesion || leerSesion();
        return { configurada: !!leerConfigNube(rutaConfig()), conSesion: !!(guardada && guardada.refresh),
                 email: (guardada && guardada.email) || '' };
    }

    return { bajarRespaldo, salir, bajar, subir, entrar, estado };
}

module.exports = { crearNube, leerConfigNube };
