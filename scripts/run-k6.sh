#!/usr/bin/env bash
set -euo pipefail

source k6.env   # define K6_BIN, seteado por install-k6.sh

: "${APP:?Debe definirse APP=obe|cdp}"
: "${TEST_TYPE:?Debe definirse TEST_TYPE=smoke|carga-normal|estres|soak}"
: "${TARGET_HOST:?Debe definirse TARGET_HOST}"
: "${TARGET_PORT:?Debe definirse TARGET_PORT}"
: "${USERS_CSV_PATH:?Debe definirse USERS_CSV_PATH (ver seccion CSVs del README)}"

PROTOCOL="${PROTOCOL:-https}"
RUN_ID="${CI_PIPELINE_ID:-local}"

# Normalizar host: solo dominio, sin protocolo ni path final
TARGET_HOST="${TARGET_HOST#https://}"
TARGET_HOST="${TARGET_HOST#http://}"
TARGET_HOST="${TARGET_HOST%%/*}"
TARGET_HOST="${TARGET_HOST%/}"

./scripts/configure-hosts.sh

if [ ! -f "${USERS_CSV_PATH}" ]; then
  echo "ERROR: CSV de usuarios no encontrado: ${USERS_CSV_PATH}"
  echo "Verificar variable tipo File (OBE_USERS_CSV / CDP_USERS_CSV) y scope Protected."
  exit 1
fi
echo ">>> CSV usuarios: ${USERS_CSV_PATH} ($(wc -l < "${USERS_CSV_PATH}") lineas)"

if [ "$APP" = "obe" ]; then
  SCRIPT="k6/petersen-empresas-login-desktop.js"
elif [ "$APP" = "cdp" ]; then
  SCRIPT="k6/petersen-cdp-login-desktop.js"
else
  echo "APP inválido: $APP (esperado obe|cdp)"; exit 1
fi

# Mismos perfiles/defaults que run-jmeter.sh, según la especificación funcional (sección 5)
case "$TEST_TYPE" in
  smoke)
    USERS=1; RAMPUP=1; DURATION=60; LOOPS=1 ;;
  carga-normal)
    USERS="${USERS:?USERS requerido para carga-normal, según uso real esperado}"
    RAMPUP="${RAMPUP:-60}"; DURATION="${DURATION:-600}"; LOOPS=-1 ;;
  estres)
    USERS="${USERS:?USERS requerido para estres (progresivo: 50 -> 100 -> 200...)}"
    RAMPUP="${RAMPUP:-60}"; DURATION="${DURATION:-300}"; LOOPS=-1 ;;
  soak)
    USERS="${USERS:?USERS requerido para soak (similar a carga normal)}"
    RAMPUP="${RAMPUP:-120}"; DURATION="${DURATION:-14400}"; LOOPS=-1 ;;
  *)
    echo "TEST_TYPE inválido: $TEST_TYPE"; exit 1 ;;
esac

RESULT_DIR="results/${APP}/${TEST_TYPE}/${RUN_ID}"
mkdir -p "${RESULT_DIR}"

echo ">>> ${APP^^} / ${TEST_TYPE} contra ${TARGET_HOST}:${TARGET_PORT} (k6)"
echo ">>> users=${USERS} rampUp=${RAMPUP} duration=${DURATION} loops=${LOOPS}"

set +e
HOST="${TARGET_HOST}" \
PORT="${TARGET_PORT}" \
PROTOCOL="${PROTOCOL}" \
USERS="${USERS}" \
RAMPUP="${RAMPUP}" \
DURATION="${DURATION}" \
LOOPS="${LOOPS}" \
USERS_FILE="${USERS_CSV_PATH}" \
"${K6_BIN}/k6" run "${SCRIPT}" \
  --out "json=${RESULT_DIR}/resultado.jsonl" \
  --summary-export="${RESULT_DIR}/summary.json" \
  2>&1 | tee "${RESULT_DIR}/k6-run.log"
K6_EXIT=${PIPESTATUS[0]}
set -e

if [ ! -s "${RESULT_DIR}/resultado.jsonl" ]; then
  echo "ERROR: k6 no registró requests — revisar ${RESULT_DIR}/k6-run.log"
  exit 1
fi

echo ">>> Resultados disponibles en ${RESULT_DIR}/"

# Igual que run-jmeter.sh: no se hace 'exit 1' automático por errores/SLA — el
# script k6 no define thresholds, así que k6 solo devuelve != 0 si el propio
# proceso falló (no por tasa de error), igual que hoy con JMeter.
exit "${K6_EXIT}"
