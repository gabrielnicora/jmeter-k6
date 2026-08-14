#!/usr/bin/env bash
# Mapea FQDNs de QA a IPs internas: el runner suele no resolver DNS corporativo.
# Definir TARGET_HOST_OBE_IP / TARGET_HOST_CDP_IP en GitLab CI/CD Variables.
# Acepta una IP o varias separadas por coma (usa la primera).
set -euo pipefail

normalize_host() {
  local h="$1"
  h="${h#https://}"
  h="${h#http://}"
  h="${h%%/*}"
  h="${h%/}"
  printf '%s' "$h"
}

add_host_entry() {
  local ip_list="$1"
  local host="$2"

  [ -n "$ip_list" ] || return 0
  [ -n "$host" ] || return 0

  host="$(normalize_host "$host")"
  local ip="${ip_list%%,*}"
  ip="${ip// /}"

  if grep -qE "[[:space:]]${host}([[:space:]]|$)" /etc/hosts 2>/dev/null; then
    echo ">>> /etc/hosts: ${host} ya mapeado"
    return 0
  fi

  echo ">>> /etc/hosts += ${ip} ${host}"
  echo "${ip} ${host}" >> /etc/hosts
}

add_host_entry "${TARGET_HOST_OBE_IP:-}" "${TARGET_HOST_OBE:-}"
add_host_entry "${TARGET_HOST_CDP_IP:-}" "${TARGET_HOST_CDP:-}"

if [ -n "${TARGET_HOST:-}" ]; then
  case "${APP:-}" in
    obe) add_host_entry "${TARGET_HOST_OBE_IP:-${TARGET_HOST_IP:-}}" "${TARGET_HOST}" ;;
    cdp) add_host_entry "${TARGET_HOST_CDP_IP:-${TARGET_HOST_IP:-}}" "${TARGET_HOST}" ;;
    *)   add_host_entry "${TARGET_HOST_IP:-}" "${TARGET_HOST}" ;;
  esac
fi

echo ">>> /etc/hosts (targets):"
grep -E 'officebanking|onlinebanking|bancoune' /etc/hosts 2>/dev/null || echo "(sin entradas bancoune)"
