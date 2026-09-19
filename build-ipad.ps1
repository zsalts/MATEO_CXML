# Empaqueta la app en un único TagView-iPad.html autocontenido.
#
# Es el mismo trabajo que build-ipad.py, para cuando no hay Python a mano
# (Windows trae PowerShell de fábrica). Volvé a correrlo cada vez que toques
# index.html, style.css, app.js o nube-config.js:
#
#     powershell -ExecutionPolicy Bypass -File build-ipad.ps1
#
# Opcional: -Salida <ruta> para escribir en otro lado (por ejemplo, para
# comparar sin pisar el archivo del repo).

param([string]$Salida = 'TagView-iPad.html')

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$utf8SinBom = New-Object System.Text.UTF8Encoding $false

function Leer([string]$nombre) {
    $ruta = Join-Path $raiz $nombre
    if (-not (Test-Path $ruta)) { throw "Falta $nombre - corré el script desde la carpeta del proyecto." }
    return [IO.File]::ReadAllText($ruta, [Text.Encoding]::UTF8)
}

# Evita que un </script> dentro del JS cierre el bloque antes de tiempo.
function Blindar([string]$js) { return $js.Replace('</script', '<\/script') }

# Reemplaza solo la primera aparición, igual que el str.replace(..., 1) del .py:
# después de inlinear app.js, un fragmento podría repetirse adentro del código.
function ReemplazarPrimero([string]$texto, [string]$viejo, [string]$nuevo) {
    $i = $texto.IndexOf($viejo, [StringComparison]::Ordinal)
    if ($i -lt 0) { throw "No encontré en index.html el fragmento:`n  $($viejo.Substring(0, [Math]::Min(70, $viejo.Length)))" }
    return $texto.Substring(0, $i) + $nuevo + $texto.Substring($i + $viejo.Length)
}

$html     = Leer 'index.html'
$css      = Leer 'style.css'
$app      = Leer 'app.js'
$tailwind = Leer 'tailwind.css'
$config   = Leer 'nube-config.js'
$sw       = Leer 'sw.js'

# El número que muestra la app tiene que ser el mismo que versiona el caché.
$vApp = [regex]::Match($app, "APP_VERSION\s*=\s*'([^']+)'").Groups[1].Value
$vSw  = [regex]::Match($sw,  "CACHE_VERSION\s*=\s*'tagview-([^']+)'").Groups[1].Value
if (-not $vApp) { throw 'No encontré el número de versión en app.js.' }
if (-not $vSw)  { throw 'No encontré el número de versión en sw.js.' }
if ($vApp -ne $vSw) { throw "Versiones desfasadas: app.js dice $vApp y sw.js dice $vSw." }

# Favicon embebido para que no pida un archivo externo
$icono = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $raiz 'icon-192.png')))

$reemplazos = @(
    # Tailwind y estilos, en línea
    @('<link rel="stylesheet" href="tailwind.css">', "<style>`n$tailwind`n</style>"),
    @('<link rel="stylesheet" href="style.css">',    "<style>`n$css`n</style>"),
    # Sin red no hay nube, pero la config tiene que existir: app.js la lee al arrancar.
    @('<script src="nube-config.js"></script>',      "<script>$(Blindar $config)</script>"),
    @('<script src="app.js"></script>',              "<script>$(Blindar $app)</script>"),
    # El manifest y los iconos sueltos no existen en el archivo único
    @('<link rel="manifest" href="manifest.json">',  ''),
    @('<link rel="apple-touch-icon" href="apple-touch-icon.png">',
      "<link rel=`"apple-touch-icon`" href=`"data:image/png;base64,$icono`">"),
    @('<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">',
      "<link rel=`"icon`" type=`"image/png`" href=`"data:image/png;base64,$icono`">")
)
foreach ($par in $reemplazos) { $html = ReemplazarPrimero $html $par[0] $par[1] }

# Sin servidor no hay service worker: sacamos su registro para no ensuciar la consola
$html = [regex]::Replace($html,
    "\n *<script>\s*//[^\n]*\n\s*if \('serviceWorker' in navigator.*?</script>",
    '', [Text.RegularExpressions.RegexOptions]::Singleline)
if ($html.Contains('serviceWorker')) { throw 'No pude quitar el registro del service worker.' }

$destino = if ([IO.Path]::IsPathRooted($Salida)) { $Salida } else { Join-Path $raiz $Salida }
[IO.File]::WriteAllText($destino, $html, $utf8SinBom)
$kb = [Math]::Round($utf8SinBom.GetByteCount($html) / 1024)
Write-Output ("{0}  -  {1} KB, autocontenido, {2}" -f (Split-Path $destino -Leaf), $kb, $vApp)
