# Prompts para armar Tag & View Pro Escritorio

Un archivo por agente. Cada uno se pega **entero** como prompt: ya trae el
contrato común (API, formatos, carpetas) y arranca con la lista de lo que
tiene que estar **sí o sí**.

Los 6 pueden correr a la vez: cada uno escribe solo en sus carpetas. Cuando
terminen, corré el 7 (macOS: toca archivos de todos, por eso va después) y
al final el 8 (integración).

| Archivo | Qué arma |
|---|---|
| `agente-1-plataforma-y-base.md` | Electron, base SQLite, API `window.tv`, grabación al disco, cortes con ffmpeg, instalador |
| `agente-2-menu-y-diseno.md` | Menú principal, barra lateral, diseño, Ajustes |
| `agente-3-base-de-datos.md` | Partidos con video y XML enlazados, clips, plantillas, playlists, exportar |
| `agente-4-captura-en-vivo.md` | Cámara/placa HDMI, codificar con tus plantillas del iPad, cortar en vivo, video + XML enlazados |
| `agente-5-captura-desde-ipad.md` | La compu graba, el iPad codifica por wifi |
| `agente-6-importar-video-y-archivo.md` | Importar un video + su XML o sesión del iPad a la base, y sincronizar |
| `agente-7-macos.md` | Después de los 6: la misma app en Mac (ventana, menú, ⌘, permisos de cámara, red local, `.dmg` arm64/x64, workflow de GitHub) sin cambiar Windows |
| `agente-8-integracion.md` | Al final: que todo encaje y ande, en Windows y en Mac |

Si cambiás algo del contrato común, cambialo en los 6 archivos: es el mismo
bloque en todos.
