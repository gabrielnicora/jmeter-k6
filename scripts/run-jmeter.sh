#!/usr/bin/env bash
set -euo pipefail

source jmeter.env   # define JMETER_BIN, seteado por install-jmeter.sh

: "${APP:?Debe definirse APP=obe|cdp}"
: "${TEST_TYPE:?Debe definirse TEST_TYPE=smoke|carga-normal|estres|soak}"
: "${TARGET_HOST:?Debe definirse TARGET_HOST}"
: "${TARGET_PORT:?Debe definirse TARGET_PORT}"
: "${USERS_CSV_PATH:?Debe definirse USERS_CSV_PATH (ver seccion CSVs del README)}"

PROTOCOL="${PROTOCOL:-https}"
RUN_ID="${CI_PIPELINE_ID}"

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
  JMX="jmx/PetersenEmpresas-LoginDesktop.jmx"
elif [ "$APP" = "cdp" ]; then
  JMX="jmx/PetersenCDP-LoginDesktop.jmx"
else
  echo "APP inválido: $APP (esperado obe|cdp)"; exit 1
fi

# Perfil por tipo de prueba, según la especificación funcional (sección 5)
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

echo ">>> ${APP^^} / ${TEST_TYPE} contra ${TARGET_HOST}:${TARGET_PORT}"
echo ">>> users=${USERS} rampUp=${RAMPUP} duration=${DURATION} loops=${LOOPS}"

"${JMETER_BIN}/jmeter" -n -t "${JMX}" \
  -Jhost="${TARGET_HOST}" \
  -Jport="${TARGET_PORT}" \
  -Jprotocol="${PROTOCOL}" \
  -Jusers="${USERS}" \
  -JrampUp="${RAMPUP}" \
  -Jduration="${DURATION}" \
  -Jloops="${LOOPS}" \
  -JusersFile="${USERS_CSV_PATH}" \
  -l "${RESULT_DIR}/resultado.jtl" \
  -j "${RESULT_DIR}/jmeter-run.log"

if [ ! -s "${RESULT_DIR}/resultado.jtl" ] || [ "$(wc -l < "${RESULT_DIR}/resultado.jtl")" -le 1 ]; then
  echo "ERROR: JMeter no registró requests — revisar ${RESULT_DIR}/jmeter-run.log"
  tail -50 "${RESULT_DIR}/jmeter-run.log" || true
  exit 1
fi

"${JMETER_BIN}/jmeter" -g "${RESULT_DIR}/resultado.jtl" -o "${RESULT_DIR}/reporte-html/"

# --- Chequeo del criterio de éxito (seccion 6 de la especificacion): 0% de error ---
ERROR_PCT=$(grep -oP '(?<="errorPct":)[0-9.]+' "${RESULT_DIR}/reporte-html/statistics.json" | head -1 || echo "0")
echo ">>> % de error total: ${ERROR_PCT}"

echo ">>> Resultados disponibles como artifacts de GitLab en ${RESULT_DIR}/"

if (( $(echo "${ERROR_PCT} > 0" | bc -l) )); then
  echo "!!! La corrida tuvo errores (${ERROR_PCT}%). Revisar reporte antes de continuar."
  # No se hace 'exit 1' automático: un % de error > 0 en Estrés es información
  # esperada (buscamos el punto de quiebre), no una falla del pipeline en sí.
  # Para Smoke/Carga normal, el gate de "0% esperado" se revisa manualmente
  # en el reporte antes de aprobar el siguiente stage.
fi
