# Ver los resultados de k6 en Grafana (local, con Docker)

El banner de k6 dice "Grafana" porque k6 es un producto de Grafana Labs, pero
no manda nada a ningún dashboard automáticamente. Para verlo en Grafana hace
falta que k6 le escriba las métricas a algo que Grafana pueda leer mientras
corre — acá usamos **InfluxDB 1.8** (el output `--out influxdb=...` viene
incluido en el binario de k6, no requiere extensiones) + **Grafana**, con el
datasource y un dashboard ya provisionados automáticamente.

Todo corre local, sin mandar nada a ningún servicio externo/cloud — pensado
para no exponer tráfico/resultados de un ambiente bancario interno.

## 1. Levantar el stack

```powershell
cd observability
docker compose up -d
```

Esto levanta:
- **InfluxDB** en `localhost:8086` (base de datos `k6`)
- **Grafana** en `localhost:3000` (acceso anónimo habilitado como Viewer, no
  hace falta login) con el dashboard **"k6 Load Testing Results — Petersen
  (Empresas / CDP)"** ya cargado bajo la carpeta **k6**

Abrí `http://localhost:3000` y anda directo al dashboard (no hace falta
configurar nada).

## 2. Correr k6 apuntando a InfluxDB

La clave es agregar `--out influxdb=http://.../k6` al comando de k6, además
de (u opcionalmente en vez de) los outputs que ya venías usando.

### Si corrés k6 con el `.exe` nativo en Windows

`docker-compose` publica el puerto 8086 al host, así que desde el `.exe`
nativo apuntás directo a `localhost`:

```powershell
$env:HOST="apie.dev.bancoune.com"
$env:PORT="443"
$env:PROTOCOL="https"
$env:USERS="1"
$env:RAMPUP="1"
$env:DURATION="30"
$env:LOOPS="1"
$env:USERS_FILE="C:\ruta\a\usuarios-empresas.csv"

& "C:\ruta\a\k6.exe" run --out influxdb=http://localhost:8086/k6 k6/petersen-empresas-login-desktop.js
```

### Si corrés k6 con Docker (`grafana/k6`)

Tiene que estar en la misma red de Docker que InfluxDB (`k6-observability`,
la crea el `docker compose up` de arriba) para resolver el hostname
`influxdb`:

```powershell
docker run --rm `
  --network k6-observability `
  -v "${PWD}:/repo" -w /repo `
  --add-host apie.dev.bancoune.com:10.134.68.241 `
  -e HOST=apie.dev.bancoune.com -e PORT=443 -e PROTOCOL=https `
  -e USERS=1 -e RAMPUP=1 -e DURATION=30 -e LOOPS=1 `
  -e USERS_FILE=/repo/usuarios-empresas.csv `
  grafana/k6:0.54.0 run --out influxdb=http://influxdb:8086/k6 k6/petersen-empresas-login-desktop.js
```

Mientras la corrida está en curso, el dashboard se refresca solo cada 5s
(mirá `http://localhost:3000` en paralelo).

## 3. Qué muestra el dashboard

| Panel | Equivalente en JMeter |
|---|---|
| Usuarios virtuales (VUs) | Active Threads Over Time |
| Requests por intervalo | Transactions per Second |
| % Error (HTTP) | % de error del `statistics.json` que chequea `run-jmeter.sh` |
| % Checks OK | Resumen de las Response/Duration Assertions |
| Duración por sampler (avg/p95) | Aggregate Report / Response Times Over Time, desglosado por request (usa el tag `name` que cada script le pone a cada `http.post`/`http.batch`) |
| Tabla de latencia por sampler | Aggregate Report (tabla) |
| Tabla de checks por assertion | Assertion Results, desglosado por check (HTTP 200 / COR000I / SLA de cada request) |

## 4. Apagar

```powershell
docker compose down       # frena los contenedores, conserva los datos
docker compose down -v    # además borra los datos de InfluxDB/Grafana
```

## Nota

No se usó el dashboard oficial de la comunidad (`grafana.com/grafana/dashboards/2587`)
porque este entorno de desarrollo no tiene salida de red a `grafana.com`. El
dashboard incluido acá (`grafana/provisioning/dashboards/json/k6-load-testing.json`)
está armado a mano para este caso de uso puntual — está pensado como punto de
partida: es JSON de Grafana estándar, se puede editar libremente desde la UI
y volver a exportar.
