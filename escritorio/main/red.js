// IPs de la red local para la Captura desde iPad. Funcion pura: la
// plataforma entra por parametro, asi las pruebas arman interfaces de Mac y
// de Windows en cualquier sistema (test/mac-red.test.js).
//
// Vive aparte de main/remoto.js porque en Mac los nombres no dicen nada
// ("en0" puede ser la wifi de una MacBook o el cable de un iMac) y la lista
// de adaptadores falsos es otra.

// Windows: adaptadores que no son la wifi ni el cable de verdad. Si se ofrece
// su IP, el iPad nunca llega y parece que la app no anda.
const VIRTUALES_WIN = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Bluetooth|docker|Npcap|TAP-|Tailscale|ZeroTier|VPN/i;

// Mac: utun = VPN e iCloud Private Relay, awdl/llw = AirDrop, bridge = compartir
// Internet y maquinas virtuales, vmnet = VMware/Parallels, anpi = el enlace
// interno de las Mac con chip Apple, ap = punto de acceso, lo = loopback.
// "bridge100" suele tener una 192.168.x: parece buena y no lo es.
const VIRTUALES_MAC = /^(utun|awdl|llw|bridge|vmnet|anpi|ap\d|lo\d|gif|stf|ipsec|ppp)/i;

function esPrivada(ip) {
    const p = String(ip).split('.').map(Number);
    if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return false;
    return p[0] === 10
        || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
        || (p[0] === 192 && p[1] === 168);
}

// Orden: primero lo que seguro es wifi, despues el cable, despues el resto.
// En Mac solo hay "enN": el numero mas bajo es la placa integrada, que es la
// que casi siempre esta en la red del iPad.
function peso(nombre, plataforma) {
    if (plataforma === 'darwin') {
        const m = /^en(\d+)$/.exec(nombre);
        return m ? Number(m[1]) : 100;
    }
    return /wi-?fi|wlan|inal/i.test(nombre) ? 0 : /ethernet|eth|lan/i.test(nombre) ? 1 : 2;
}

// interfaces = lo que devuelve os.networkInterfaces()
// → [{ip, adaptador}], el primero es el del QR.
function ipsLocales(interfaces, plataforma = process.platform) {
    const virtual = plataforma === 'darwin' ? VIRTUALES_MAC : VIRTUALES_WIN;
    const out = [];
    for (const [nombre, dirs] of Object.entries(interfaces || {})) {
        if (virtual.test(nombre)) continue;
        for (const d of dirs || []) {
            const v4 = d.family === 'IPv4' || d.family === 4;
            if (!v4 || d.internal || !esPrivada(d.address)) continue;
            out.push({ ip: d.address, adaptador: nombre });
        }
    }
    // sort es estable: dentro del mismo peso queda el orden del sistema.
    out.sort((a, b) => peso(a.adaptador, plataforma) - peso(b.adaptador, plataforma));
    return out;
}

module.exports = { ipsLocales, esPrivada };
