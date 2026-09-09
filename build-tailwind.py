#!/usr/bin/env python3
"""
Regenera tailwind.css a partir de las clases que realmente usa la app.

Solo hace falta correrlo si agregás clases de Tailwind nuevas en index.html
o en app.js. Imprime la lista de clases y arma una sonda; el CSS se compila
abriendo probe.html con el Play CDN (tailwind.js) y volcando la hoja que
inyecta. Ver el README para el procedimiento completo.
"""
import io, json, re, sys, os

RAIZ = os.path.dirname(os.path.abspath(__file__))

def clases():
    html = io.open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    app  = io.open(os.path.join(RAIZ, 'app.js'), encoding='utf-8').read()
    t = set()
    for src in (html, app):
        for m in re.findall(r'class="([^"]*)"', src):
            t.update(x for x in m.split() if '${' not in x)
    for m in re.findall(r'className\s*=\s*[`\'"]([^`\'"]*)', app):
        t.update(x for x in m.split() if '${' not in x)
    for m in re.findall(r"classList\.(?:add|remove|toggle)\(\s*'([^']+)'", app):
        t.add(m)
    for a, b in re.findall(r"classList\.replace\(\s*'([^']+)'\s*,\s*'([^']+)'", app):
        t.add(a); t.add(b)
    return sorted(x for x in t if re.match(r'^[a-z0-9\[]', x))

def main():
    cs = clases()
    html = io.open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    if 'tailwind.js' not in html:
        html = html.replace('<link rel="stylesheet" href="tailwind.css">',
                            '<script src="tailwind.js"></script>')
    sonda = '<div id="__probe" style="display:none" class="%s"></div>' % ' '.join(cs)
    html = html.replace('</body>', sonda + '\n</body>')
    io.open(os.path.join(RAIZ, 'probe.html'), 'w', encoding='utf-8').write(html)
    print('%d clases -> probe.html' % len(cs))
    print('Abrila con tailwind.js presente y volcá document.styleSheets a tailwind.css.')

if __name__ == '__main__':
    main()
