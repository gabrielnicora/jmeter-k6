# Migración JMeter → k6

Migración 1:1 de los dos planes de JMeter (`jmx/PetersenEmpresas-LoginDesktop.jmx`
y `jmx/PetersenCDP-LoginDesktop.jmx`) a k6. Usan los mismos datos (mismos CSV
de usuarios, mismos hosts/paths, mismos bodies JSON) y replican el mismo
comportamiento: pasos de login, condicionales del flujo Desktop, timers de
"think time", y las assertions de HTTP 200 / `COR000I` / SLA de duración.

- `petersen-empresas-login-desktop.js` ← `jmx/PetersenEmpresas-LoginDesktop.jmx`
- `petersen-cdp-login-desktop.js` ← `jmx/PetersenCDP-LoginDesktop.jmx`
- `lib/common.js` — helpers compartidos (config, timers, CSV, checks)

Los `.jmx` originales **no se tocaron** — siguen siendo la fuente de verdad
del pipeline actual. Este directorio es la migración equivalente en k6, para
correr en paralelo hasta validar que el comportamiento es idéntico.

## Qué se preservó exactamente

| Elemento JMeter | Equivalente en k6 |
|---|---|
| `ThreadGroup` (num_threads/ramp_time/duration/scheduler) | `options.scenarios.login_desktop` (`ramping-vus` si `loops=-1`, `per-vu-iterations` si `loops>0`, igual que smoke con `LOOPS=1`) |
| `LoopController.continue_forever` | Cada VU repite el flujo en loop mientras el scenario esté activo (comportamiento nativo de `ramping-vus`) |
| `CSVDataSet` (`shareMode.thread`, `recycle=true`) | Cada VU mantiene su propio puntero de fila (arranca en la fila 0, recicla al llegar al final) — mismo comportamiento que "Current thread" en JMeter |
| `HTTP Cookie Manager` (`clearEachIteration=true`) | `http.cookieJar().clear(base)` al final de cada iteración |
| `HeaderManager` Content-Type / Authorization | `jsonHeaders(...)` por request |
| `${__UUID()}` | `uuidv4()` (nuevo en cada body que lo usa) |
| `${__P(prop,default)}` | Variables de entorno con los mismos nombres/defaults (ver tabla abajo) |
| `UniformRandomTimer` (delay + rango) | `sleepUniform(delayMs, deviationMs)` |
| `ResponseAssertion` HTTP 200 (global) | `check(...)` `HTTP 200` en cada request |
| `ResponseAssertion` `COR000I` (substring, por request) | `check(...)` `contiene COR000I` en cada request (no bloqueante, igual que en JMeter con `on_sample_error=continue`) |
| `DurationAssertion` (SLA de duración) | `check(...)` `duracion < Nms` (usa `sla_accounts_duration_ms` sólo en `widgets.accounts` de CDP, igual que el `.jmx`) |
| `IfController` (condicionales de login/ambiente/permisos) | `if (...)` normal en JS, mismas condiciones |
| `bzm Parallel Controller` (sólo en CDP, 4 llamadas del Escritorio) | `http.batch([...])` — dispara las 4 requests en paralelo real, igual que el plugin |
| `GenericController` "secuencial" (sólo en Empresas) | Requests secuenciales en el orden del `.jmx` |
| Assertion `assume_success=true` (loanQualification) | Igual: es un `check()`, no bloqueante — no aborta la iteración |

**Importante:** ningún request/condición del `.jmx` fue simplificado.
Incluye también las llamadas "extra" que no están en
`docs/endpoints-stress-test.md` pero sí en el `.jmx`: `approval.transactions`,
`widgets.expirationDates` y las dos `load.daily.notification.validation`
(Empresas), todas condicionadas igual que en JMeter.

## Variables de entorno (equivalentes a `-J...` de JMeter)

| Variable k6 | Prop. JMeter | Default Empresas | Default CDP |
|---|---|---|---|
| `HOST` | `host` | `localhost` | `localhost` |
| `PORT` | `port` | `8080` | `8080` |
| `PROTOCOL` | `protocol` | `http` | `http` |
| `API_URL` | `apiURL` | `api/v1/execute` | `api/v1/execute` |
| `X_APP_VERSION` | `xAppVersion` | `3.0.0` | `3.0.0` |
| `USERS` | `users` | `1` | `1` |
| `RAMPUP` | `rampUp` | `30` | `30` |
| `DURATION` | `duration` | `300` | `300` |
| `LOOPS` | `loops` | `-1` | `-1` |
| `STARTDELAY` | `startDelay` | `0` | `0` |
| `SMALL_TIMER_DELAY` / `SMALL_TIMER_DEVIATION` | `smallTimerDelay` / `smallTimerDeviation` | `500` / `200` | `500` / `200` |
| `MEDIUM_TIMER_DELAY` / `MEDIUM_TIMER_DEVIATION` | `mediumTimerDelay` / `mediumTimerDeviation` | `2000` / `800` | `2000` / `800` |
| `SLA_MAX_DURATION_MS` | `slaMaxDurationMs` | `12000` | `5000` |
| `SLA_ACCOUNTS_DURATION_MS` | `slaAccountsDurationMs` | n/a | `8000` |
| `USERS_FILE` | `usersFile` | `docs/jmeter/usuarios-empresas.csv` | `extras/jmeter/usuarios-cdp.csv` |

`channel` queda fijo en `"frontend"` porque en el `.jmx` no está parametrizado
(valor literal, no `${__P(...)}`).

### Formato del CSV (igual que hoy)

- Empresas (`usuarios-empresas.csv`): **sin** encabezado, columnas
  `user,password,document`.
- CDP (`usuarios-cdp.csv`): **con** encabezado (se descarta), columnas
  `user,password`.

Los CSV reales de usuarios siguen sin versionarse en el repo (ver README raíz,
sección de prerrequisitos) — se inyectan igual que hoy vía variable CI/CD de
tipo File.

## Cómo correrlo

### Local / manual

```bash
K6_VERSION=0.54.0 ./scripts/install-k6.sh   # descarga y cachea el binario de k6

HOST=apie.qa.bancoune.com PORT=443 PROTOCOL=https \
USERS=5 RAMPUP=10 DURATION=60 LOOPS=-1 \
USERS_FILE=/ruta/a/usuarios-empresas.csv \
"${K6_BIN}/k6" run k6/petersen-empresas-login-desktop.js
```

### Vía el wrapper equivalente a `run-jmeter.sh`

```bash
APP=obe TEST_TYPE=smoke \
TARGET_HOST=apie.qa.bancoune.com TARGET_PORT=443 \
USERS_CSV_PATH=/ruta/a/usuarios-empresas.csv \
./scripts/run-k6.sh
```

Usa los mismos `APP` / `TEST_TYPE` / `TARGET_HOST` / `TARGET_PORT` /
`USERS_CSV_PATH` que `run-jmeter.sh`, con los mismos perfiles por
`TEST_TYPE` (smoke / carga-normal / estrés / soak) y los mismos defaults de
usuarios/rampUp/duración. Los resultados quedan en
`results/${APP}/${TEST_TYPE}/${RUN_ID}/` (`resultado.jsonl` + `summary.json`
+ `k6-run.log`), igual que `run-jmeter.sh` deja el `.jtl` + reporte HTML.

**No se agregaron `thresholds` de k6.** Igual que hoy con JMeter (ver el
comentario en `run-jmeter.sh`), un % de error o una SLA incumplida en Estrés
es información esperada, no debe hacer fallar el job automáticamente — los
`checks` quedan sólo para reporte/métricas, no cambian el código de salida.
