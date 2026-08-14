#!/usr/bin/env bash
set -euo pipefail

JMETER_VERSION="${JMETER_VERSION:?Debe definirse JMETER_VERSION}"
CACHE_DIR="${CI_PROJECT_DIR}/.jmeter-cache"
JMETER_HOME="${CACHE_DIR}/apache-jmeter-${JMETER_VERSION}"

mkdir -p "${CACHE_DIR}"

if [ -x "${JMETER_HOME}/bin/jmeter" ]; then
  echo ">>> JMeter ${JMETER_VERSION} ya está en cache (${JMETER_HOME}), no se re-descarga."
else
  echo ">>> Descargando JMeter ${JMETER_VERSION}..."
  curl -fsSL "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" \
    -o /tmp/jmeter.tgz
  tar -xzf /tmp/jmeter.tgz -C "${CACHE_DIR}"
  rm /tmp/jmeter.tgz

  echo ">>> Instalando Plugins Manager + plugin BlazeMeter Parallel Controller..."
  curl -fsSL "https://repo1.maven.org/maven2/kg/apc/jmeter-plugins-manager/1.10/jmeter-plugins-manager-1.10.jar" \
    -o "${JMETER_HOME}/lib/ext/jmeter-plugins-manager-1.10.jar"
  curl -fsSL "https://repo1.maven.org/maven2/kg/apc/cmdrunner/2.3/cmdrunner-2.3.jar" \
    -o "${JMETER_HOME}/lib/cmdrunner-2.3.jar"

  java -cp "${JMETER_HOME}/lib/ext/jmeter-plugins-manager-1.10.jar" \
    org.jmeterplugins.repository.PluginManagerCMDInstaller

  "${JMETER_HOME}/bin/PluginsManagerCMD.sh" install jpgc-casutg,jpgc-json,bzm-parallel
fi

# Verificación mínima: falla rápido si la versión instalada no cumple >= 5.6
INSTALLED_VERSION=$("${JMETER_HOME}/bin/jmeter" --version 2>&1 | grep -oP '\d+\.\d+(\.\d+)?' | head -1)
echo ">>> Versión instalada: ${INSTALLED_VERSION}"

export JMETER_BIN="${JMETER_HOME}/bin"
echo "JMETER_BIN=${JMETER_BIN}" >> jmeter.env
