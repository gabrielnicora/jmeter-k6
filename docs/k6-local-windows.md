# Correr k6 local en Windows (portable, sin instalador ni permisos de admin)

Guía paso a paso para correr los scripts de `k6/` desde una PC Windows sin
necesitar permisos de administrador ni instalar nada vía `winget`/`choco`
(útil si la política de la empresa no te deja instalar software). Al final
se explica cómo ver la corrida en vivo en Grafana.

## 1. Instalar el k6 portable

k6 se distribuye también como un `.zip` con un `.exe` suelto — no requiere
instalación, ni admin, ni tocar el registro de Windows.

Abrí PowerShell (no hace falta como administrador) y corré:

```powershell
Invoke-WebRequest -Uri "https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-windows-amd64.zip" -OutFile "$env:USERPROFILE\k6.zip"
Expand-Archive "$env:USERPROFILE\k6.zip" -DestinationPath "$env:USERPROFILE\k6-portable"
```

Esto deja el ejecutable en:

```
C:\Users\<tu-usuario>\k6-portable\k6-v0.54.0-windows-amd64\k6.exe
```

Verificá que funciona:

```powershell
& "$env:USERPROFILE\k6-portable\k6-v0.54.0-windows-amd64\k6.exe" version
```

> Esta carpeta es independiente del repo — es el **programa** k6 (como
> `python.exe` o `node.exe`), no hace falta que esté adentro de
> `jmeter-k6`. Los scripts que ejecuta sí están en el repo, en `k6/`.

## 2. Clonar el repo y pararte en esa carpeta

Todos los comandos siguientes asumen que estás parado en la raíz del repo
(para que las rutas relativas a los scripts y al CSV funcionen):

```powershell
cd C:\ruta\donde\clonaste\jmeter-k6
```

## 3. Setear las variables de entorno de la corrida

En PowerShell no se usa `VAR=valor comando` (eso es sintaxis de bash) — se
setea cada variable con `$env:`. Estas quedan activas mientras no cierres
esa ventana de PowerShell.

```powershell
$env:HOST     = "apie.dev.bancoune.com"
$env:PORT     = "443"
$env:PROTOCOL = "https"
$env:USERS    = "1"
$env:RAMPUP   = "1"
$env:DURATION = "30"
$env:LOOPS    = "1"
$env:USERS_FILE = "C:\ruta\donde\clonaste\jmeter-k6\usuarios-empresas.csv"
```

Notas:
- `HOST` es el ambiente contra el que querés pegarle (QA, dev, etc.).
- `USERS_FILE` apunta al CSV de usuarios de prueba. **No está versionado en
  el repo** (contiene credenciales) — armalo vos con el formato correcto:
  - Empresas (`usuarios-empresas.csv`): **sin** encabezado, columnas
    `user,password,document`.
  - CDP (`usuarios-cdp.csv`): **con** encabezado, columnas `user,password`.
  - Ya están en `.gitignore`, así que ponerlos en la raíz del repo es
    seguro (no se van a commitear por accidente).
- Para correr el script de **CDP** en vez de Empresas, usá el CSV de CDP acá.
- Hay más variables opcionales (timers, SLA, etc.) documentadas en
  [`k6/README.md`](../k6/README.md) — con estas alcanza para una corrida
  básica tipo smoke test.

## 4. Ejecutar el `.exe` para ver la corrida

Ejecutás el `.exe` de la carpeta donde lo instalaste, apuntando al script
del repo (ruta relativa porque ya estás parado en la raíz del repo):

```powershell
& "C:\Users\<tu-usuario>\k6-portable\k6-v0.54.0-windows-amd64\k6.exe" run k6/petersen-empresas-login-desktop.js
```

(para CDP: `k6/petersen-cdp-login-desktop.js`)

Vas a ver en la consola el detalle de cada check (`HTTP 200`, `contiene
COR000I`, `duracion < Nms`) y el resumen final de métricas.

> Tip: para no escribir la ruta larga del `.exe` cada vez, asignala a una
> variable una sola vez por sesión:
> ```powershell
> $k6 = "C:\Users\<tu-usuario>\k6-portable\k6-v0.54.0-windows-amd64\k6.exe"
> & $k6 run k6/petersen-empresas-login-desktop.js
> ```

## 5. Ver la corrida en Grafana (con Docker)

Este paso es opcional — sirve para ver VUs, throughput, latencia por
request y % de checks OK en un dashboard en vivo, en vez de leer solo la
consola. Requiere Docker Desktop instalado y corriendo.

### 5.1. Levantar el stack de Grafana + InfluxDB

```powershell
cd observability
docker compose up -d
cd ..
```

Esto expone Grafana en `http://localhost:3001` (acceso anónimo, sin login)
con el dashboard **"k6 Load Testing Results — Petersen"** ya cargado, e
InfluxDB en `localhost:8086` (donde k6 va a escribir las métricas).

> **Si el puerto 3001 (o 8086) ya está ocupado** por otra cosa en tu PC,
> pisalo antes de levantar el stack, sin tocar ningún archivo:
> ```powershell
> $env:GRAFANA_PORT="3002"
> docker compose up -d
> ```
> (y usá ese puerto al abrir Grafana en el paso siguiente)

### 5.2. Correr k6 apuntando las métricas a Grafana

Es el mismo comando del paso 4, agregando `--out influxdb=...`:

```powershell
& "C:\Users\<tu-usuario>\k6-portable\k6-v0.54.0-windows-amd64\k6.exe" run --out influxdb=http://localhost:8086/k6 k6/petersen-empresas-login-desktop.js
```

Sin ese flag, la corrida solo se ve en la consola — Grafana no se entera de
nada. Con el flag, mientras la corrida está en curso podés abrir
`http://localhost:3001` (o el puerto que hayas usado) → carpeta **k6** →
dashboard **"k6 Load Testing Results — Petersen"**, que se refresca solo
cada 5 segundos.

### 5.3. Apagar el stack cuando termines

```powershell
cd observability
docker compose down       # conserva los datos para la próxima
docker compose down -v    # además borra las métricas guardadas
cd ..
```

## Resumen del flujo completo

```powershell
cd C:\ruta\donde\clonaste\jmeter-k6

$env:HOST="apie.dev.bancoune.com"; $env:PORT="443"; $env:PROTOCOL="https"
$env:USERS="1"; $env:RAMPUP="1"; $env:DURATION="30"; $env:LOOPS="1"
$env:USERS_FILE="C:\ruta\donde\clonaste\jmeter-k6\usuarios-empresas.csv"

cd observability; docker compose up -d; cd ..

$k6 = "C:\Users\<tu-usuario>\k6-portable\k6-v0.54.0-windows-amd64\k6.exe"
& $k6 run --out influxdb=http://localhost:8086/k6 k6/petersen-empresas-login-desktop.js

# abrir http://localhost:3001 mientras corre
```

## Ver también

- [`k6/README.md`](../k6/README.md) — mapeo completo de variables y qué se
  preservó de la migración desde JMeter.
- [`observability/README.md`](../observability/README.md) — detalle del
  stack de Grafana (qué muestra cada panel, cómo correrlo también desde
  Docker en vez del `.exe` nativo).
