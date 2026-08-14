# JMeter Stress Testing — GitLab CI nativo (Proyecto UNO)

Ejecuta las pruebas de estrés de OBE (Empresas) y CDP (Individuos) **dentro
del propio worker de GitLab**, sin desplegar pods ni Jobs de Kubernetes. El
worker corre en un runner registrado sobre un **cluster EKS separado** del
que se está estresando.

## Qué cambió respecto al enfoque anterior (K8s Job + ArgoCD + Kargo)

| Antes | Ahora |
|---|---|
| Imagen Docker custom con JMeter, push a ECR | JMeter se descarga en el propio job de CI (con cache) |
| `Job` de Kubernetes desplegado por ArgoCD | El job de GitLab CI **es** la ejecución, no hay nada que desplegar |
| Kargo como gate de aprobación antes de correr | `environment` protegido + `when: manual` nativo de GitLab |
| Cluster runner necesitaba ArgoCD + Kargo instalados | Cluster runner solo necesita el GitLab Runner (Kubernetes executor) registrado |

El cluster separado se sigue usando — pero ahora simplemente aloja los
runners de GitLab, en vez de alojar recursos gestionados por GitOps.

## Arquitectura

```
GitLab (SaaS o self-managed)
        │
        │ dispara pipeline
        ▼
Runner GitLab (Kubernetes executor) ── vive en el cluster EKS "runner",
   │                                    separado del cluster objetivo
   │
   ├─ install-jmeter.sh   → descarga/cachea JMeter 5.6+ y el plugin
   │                         BlazeMeter Parallel Controller
   │
   ├─ run-jmeter.sh       → ejecuta el .jmx contra TARGET_HOST
   │                         (endpoint del cluster que se estresa)
   │
   └─ aws s3 cp           → sube .jtl + reporte HTML a S3
```

## Prerrequisitos

- **GitLab Runner registrado en el cluster EKS separado**, con el Kubernetes
  executor, y tag `eks-runner-loadtest` (o el que se use en `default.tags`
  de `.gitlab-ci.yml`).
- **Rol IAM para GitLab OIDC** (`AWS_ROLE_ARN`, variable CI/CD) con permiso
  de escritura únicamente sobre el bucket `RESULTS_S3_BUCKET`.
- **Conectividad de red** entre el cluster runner y el `TARGET_HOST` del
  cluster objetivo — coordinar reglas de FortiNet/WAF/Seguridad Perimetral
  antes de la primera corrida, igual que en el enfoque anterior.
- **CSVs de usuarios reales, NO versionados en el repo.** Se cargan como
  variables CI/CD de tipo **File** (protegidas, scope por environment si es
  posible):
  - `OBE_USERS_CSV` → contenido de `usuarios-empresas.csv`
  - `CDP_USERS_CSV` → contenido de `usuarios-cdp.csv`

  GitLab expone las variables tipo File como un path a un archivo temporal;
  por eso `run-jmeter.sh` recibe `USERS_CSV_PATH="$OBE_USERS_CSV"` (o
  `$CDP_USERS_CSV`), no el contenido inline.
- **Variables CI/CD adicionales a definir** (Settings → CI/CD → Variables):
  - `TARGET_HOST_OBE`, `TARGET_HOST_CDP` — host del ambiente a probar.
  - `AWS_ROLE_ARN`
  - Opcional: distintas variables por ambiente (QA vs. equivalente
    productivo) usando **environment scope** de GitLab, para no mezclar el
    host de UAT con el de estrés/soak.

## Environments protegidos (gate de autorización)

Cada fase que no sea *smoke* corre contra un `environment` con nombre
`stress-test/<app>/<fase>` (ej. `stress-test/obe/estres`). Para que el gate
de aprobación sea real:

1. Crear esos environments en el proyecto (se crean solos la primera vez que
   corre el job, o se pueden precrear).
2. En **Settings → CI/CD → Protected environments**, restringir el deploy de
   `stress-test/*` a los roles/usuarios que están habilitados a autorizar la
   corrida (ej. el propio Victor + el responsable de infraestructura).
3. Solo esas personas van a poder tocar el botón ▶️ de los jobs manuales en
   fases posteriores a *smoke*.

Esto reemplaza al gate de aprobación de Kargo (`kargo approve`) del enfoque
anterior, con un mecanismo nativo de GitLab.

## Flujo operativo

1. `validate-jmx` corre siempre — valida que los `.jmx` en `jmx/` sean XML
   bien formado.
2. `smoke-obe` / `smoke-cdp` corren automáticamente (bajo riesgo: 1 usuario,
   1 minuto). **Si fallan, no tiene sentido avanzar** — ver sección 6 de la
   especificación funcional para diagnosticar (credenciales, conectividad,
   config de ambiente).
3. `carga-normal-*` requiere play manual de alguien con permiso sobre el
   environment protegido.
4. `estres-*` — para la corrida progresiva (50 → 100 → 200 usuarios) hay que
   re-disparar el job manual varias veces, sobreescribiendo la variable
   `USERS` desde "Run pipeline" o re-ejecutando el job individual con
   variables custom.
5. `soak-*` — timeout extendido a 6h (default del runner suele ser 1h).
   Conviene dispararlo a última hora del día para que corra overnight.

Todos los resultados (`.jtl` + reporte HTML) quedan como **artifacts de
GitLab** (30 días) y además se suben a S3 para conservación a más largo
plazo y como fuente de comparación con la segunda ronda de pruebas.

## Estructura del repo

```
.gitlab-ci.yml
scripts/
  install-jmeter.sh   # descarga JMeter + plugin BlazeMeter, con cache
  run-jmeter.sh        # ejecuta el .jmx parametrizado, sube a S3
jmx/
  PetersenEmpresas-LoginDesktop.jmx
  PetersenCDP-LoginDesktop.jmx
  (los CSV de usuarios NO van acá — se inyectan por variable CI/CD)
```
