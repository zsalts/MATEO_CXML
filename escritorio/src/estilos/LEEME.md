# Estilos — tokens y clases para todas las ramas

Todo lo visual de la app sale de esta carpeta. Si tu rama respeta estas
variables y clases, el tema claro anda solo y se ve igual que el resto.

| Archivo | Qué tiene |
|---|---|
| `tokens.css` | Las variables `--tv-*`, en oscuro (por defecto) y claro |
| `base.css` | Reset, foco con teclado, scrollbars y las clases base (`.tv-btn`, `.tv-panel`…) |
| `componentes.css` | Avisos, modales, elegir plantilla, buscador (los usa `src/ui/`) |
| `carcasa.css` | Barra superior, barra lateral y el hueco de la rama (`app.js`) |

Los cuatro los carga `index.html`. El CSS propio de una rama va en
`src/ramas/<id>/estilo.css` (lo carga el router la primera vez que se abre)
y sus clases llevan el prefijo `tv-<id>-`.

## Reglas

- **Nunca colores fijos.** Siempre `var(--tv-…)`. La única excepción son
  los colores de cada botón de la botonera, que vienen de la plantilla.
- **Es una app, no una página:** nada de scroll de página entera (el
  `body` no scrollea; scrollea la lista o el panel que lo necesite), el
  texto de interfaz no se selecciona y el cursor es la flecha. Lo que sí
  se tiene que poder copiar (una ruta, un mensaje de error) lleva
  `.tv-seleccionable`.
- **Tamaño mínimo:** 1024×680. Probá tu rama ahí.
- **Animaciones cortas** (≤ 200 ms). `base.css` las apaga todas con
  `prefers-reduced-motion`.

## Tema

El tema va en `<html>`: sin atributo = oscuro, `data-tema="claro"` = claro.
Las ramas no lo cambian a mano: Ajustes hace
`estadoGlobal.poner('tema', 'claro')` y la carcasa lo aplica y se lo avisa a
la ventana (`tv.ventana.tema`) para que los botones nativos combinen.

## Tokens (`tokens.css`)

### Superficies (de atrás hacia adelante)

| Token | Uso |
|---|---|
| `--tv-fondo` | Fondo de la ventana; también el de los campos |
| `--tv-panel` | Paneles, barras, modales |
| `--tv-panel-2` | Algo arriba de un panel: botones, cabeceras de tabla |
| `--tv-panel-3` | Hover de filas y botones |
| `--tv-borde` | Bordes y separadores |
| `--tv-borde-fuerte` | Borde en hover, scrollbars, teclas |

### Texto

| Token | Uso |
|---|---|
| `--tv-texto` | Texto normal (AA sobre fondo y paneles) |
| `--tv-texto-2` | Texto secundario: fechas, descripciones (AA) |
| `--tv-texto-3` | Solo deshabilitado o decorativo (no pasa AA: no lo uses para leer) |

### Acento y estados

| Token | Uso |
|---|---|
| `--tv-acento` | EL color de la app: selección, botón primario, foco, links |
| `--tv-acento-texto` | Texto arriba de `--tv-acento` |
| `--tv-acento-suave` | Fondo de una fila seleccionada, halo de un campo |
| `--tv-peligro` / `--tv-peligro-suave` | Borrar, errores |
| `--tv-ok` | Guardado, listo, tiene video |
| `--tv-aviso` | Atención sin ser error |
| `--tv-rec` | **Grabando.** Distinto de `--tv-peligro` a propósito: grabar no es un error |

### Forma, espacio, sombra

| Token | Valor |
|---|---|
| `--tv-radio` | 6px — botones, campos, paneles |
| `--tv-radio-2` | 10px — tarjetas grandes |
| `--tv-esp-1` … `--tv-esp-6` | 4, 8, 12, 16, 24, 32 px |
| `--tv-sombra` | Modales y menús flotantes |
| `--tv-foco` | El anillo de foco (`box-shadow`) |

### Tipografía

| Token | Valor |
|---|---|
| `--tv-fuente` | Segoe UI Variable / Segoe UI / system-ui |
| `--tv-fuente-mono` | Cascadia Mono / Consolas |
| `--tv-letra` | 13px, la de toda la interfaz |
| `--tv-letra-chica` | 12px |
| `--tv-letra-grande` | 15px, títulos de barra y de estados vacíos |

### Carcasa

`--tv-barra-alto` (36px), `--tv-lateral-ancho` (52px),
`--tv-lateral-ancho-abierta` (196px). Para calcular alturas si hace falta;
la rama recibe un contenedor que ya ocupa todo el hueco.

```css
.tv-captura-reloj {
    padding: var(--tv-esp-2) var(--tv-esp-3);
    background: var(--tv-panel-2);
    border: 1px solid var(--tv-borde);
    border-radius: var(--tv-radio);
    color: var(--tv-rec);
    font-family: var(--tv-fuente-mono);
}
```

## Clases base (`base.css`)

### Botones

```html
<button class="tv-btn">Cancelar</button>
<button class="tv-btn tv-btn--primario">Guardar</button>
<button class="tv-btn tv-btn--peligro">Borrar</button>
<button class="tv-btn tv-btn--fantasma">Ver todos</button>      <!-- sin borde hasta el hover -->
<button class="tv-btn tv-btn--icono" title="Cerrar"><svg class="tv-icono">…</svg></button>
<button class="tv-btn tv-btn--chico">Importar</button>           <!-- 26px de alto -->
```

Un botón con ícono y texto: `boton.innerHTML = \`${crearIcono('play')} Reproducir\``.
`disabled` o `aria-disabled="true"` los apaga.

### Panel y barra de herramientas

```html
<section class="tv-panel">…</section>

<div class="tv-barra">
    <span class="tv-barra__titulo">Partidos</span>
    <span class="tv-barra__separador"></span>
    <button class="tv-btn tv-btn--fantasma">…</button>
    <span class="tv-barra__espacio"></span>        <!-- empuja lo que sigue a la derecha -->
    <button class="tv-btn tv-btn--primario">Nuevo</button>
</div>
```

### Listas

```html
<div class="tv-lista">                               <!-- scrollea sola -->
    <button class="tv-lista__fila">Norte vs Sur</button>
    <button class="tv-lista__fila es-activa">Seleccionada</button>
    <div class="tv-lista__fila" aria-selected="true">También seleccionada</div>
</div>
```

### Campos

```html
<label class="tv-etiqueta" for="nombre">Nombre</label>
<input class="tv-campo" id="nombre">
<select class="tv-campo">…</select>
<textarea class="tv-campo"></textarea>
<input class="tv-campo" type="color">
```

`.tv-campo.es-invalido` lo marca en rojo y lo sacude. `.tv-form` apila
campos con separación pareja (lo usan los modales).

### Estado vacío

```html
<div class="tv-vacio">
    <svg class="tv-icono">…</svg>
    <div class="tv-vacio__titulo">Todavía no hay clips</div>
    <div>Cortá uno desde la línea de tiempo.</div>
    <button class="tv-btn tv-btn--primario">Importar</button>
</div>
```

### Utilidades

| Clase | Qué hace |
|---|---|
| `.tv-icono` | La que traen los íconos de `crearIcono()` (18px, trazo) |
| `.tv-texto-2` | Color secundario |
| `.tv-chica` | Letra chica |
| `.tv-mono` | Fuente mono |
| `.tv-numeros` | Números tabulares: **para todo reloj o contador** |
| `.tv-recortar` | Una línea con "…" (el padre flex necesita `min-width: 0`) |
| `.tv-seleccionable` | Texto que se puede seleccionar y copiar |
| `.tv-chip`, `--acento`, `--ok`, `--rec` | Etiqueta chica redondeada: "3", "Con video", "● REC" |
| `.tv-tecla` | Un atajo: `<span class="tv-tecla">Ctrl 1</span>` |

## Desde JavaScript (`src/ui/index.js`)

```js
import { crearIcono, iconoHTML, escapar, formatoTiempo, fechaCorta,
         elegirPlantilla, estadoGlobal } from '../../ui/index.js';

crearIcono('tijera')            // <svg class="tv-icono"> (sirve en append y en `${}`)
escapar(partido.nombre)         // siempre, antes de innerHTML
formatoTiempo(3723)             // "1:02:03"; {largo: true} → "01:02:03"
fechaCorta(p.creado)            // "hoy 18:05", "ayer 21:00", "03/02 09:07"
await elegirPlantilla(ctx)      // id o null
estadoGlobal.poner('grabando', { desde: Date.now() })   // ● REC en la barra
estadoGlobal.poner('grabando', null)
```

Íconos disponibles: `nombresDeIconos()`. Entre otros: play, pausa, stop,
grabar, camara, ipad, wifi, base, importar, carpeta, lista, filtro, tijera,
descargar, subir, mas, menos, basura, lapiz, ajustes, casa, botonera, cerrar,
flecha-izq/der/arriba/abajo, chevron-izq/der/abajo, buscar, nube, video,
documento, check, alerta, info, reloj, equipo, enlace, teclado, copia.
