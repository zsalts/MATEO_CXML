// Antes de empaquetar: deja en build/ lo que la app necesita de afuera de
// escritorio/, asi el instalador no depende de "../".
//   - nube-config.js (url y clave publica de la nube, para importar del iPad)
//   - sincro.js (la regla para sincronizar plantillas: la misma que usa el iPad)
//   - icon.png (si falta)

const fs = require('fs');
const path = require('path');

const aca = __dirname;
const web = path.join(aca, '..', '..');

function copiar(desde, hacia, obligatorio) {
    if (!fs.existsSync(desde)) {
        if (obligatorio) throw new Error('Falta ' + desde);
        console.warn('No esta', desde, '- se sigue sin eso');
        return;
    }
    fs.copyFileSync(desde, hacia);
    console.log('Copiado', path.relative(path.join(aca, '..'), hacia));
}

copiar(path.join(web, 'nube-config.js'), path.join(aca, 'nube-config.js'), false);
copiar(path.join(web, 'sincro.js'), path.join(aca, 'sincro.js'), true);
if (!fs.existsSync(path.join(aca, 'icon.png'))) {
    copiar(path.join(web, 'icon-512.png'), path.join(aca, 'icon.png'), true);
}
