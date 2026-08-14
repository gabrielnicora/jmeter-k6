#!/usr/bin/env bash
set -euo pipefail

K6_VERSION="${K6_VERSION:?Debe definirse K6_VERSION}"
CACHE_DIR="${CI_PROJECT_DIR:-.}/.k6-cache"
K6_HOME="${CACHE_DIR}/k6-v${K6_VERSION}"

mkdir -p "${CACHE_DIR}"

if [ -x "${K6_HOME}/k6" ]; then
  echo ">>> k6 ${K6_VERSION} ya está en cache (${K6_HOME}), no se re-descarga."
else
  echo ">>> Descargando k6 ${K6_VERSION}..."
  curl -fsSL "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux-amd64.tar.gz" \
    -o /tmp/k6.tar.gz
  mkdir -p "${K6_HOME}"
  tar -xzf /tmp/k6.tar.gz -C "${K6_HOME}" --strip-components=1
  rm /tmp/k6.tar.gz
fi

INSTALLED_VERSION=$("${K6_HOME}/k6" version | grep -oP '(?<=v)\d+\.\d+\.\d+' | head -1)
echo ">>> Versión instalada: ${INSTALLED_VERSION}"

export K6_BIN="${K6_HOME}"
echo "K6_BIN=${K6_BIN}" >> k6.env
