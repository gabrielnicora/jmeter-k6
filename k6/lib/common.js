// Helpers compartidos por los dos scripts k6 (Empresas y CDP), migrados desde
// jmx/PetersenEmpresas-LoginDesktop.jmx y jmx/PetersenCDP-LoginDesktop.jmx.
// Mantiene equivalentes 1:1 de: propiedades __P(...), CSVDataSet, timers
// UniformRandomTimer, y las assertions (HTTP 200 / COR000I / duracion SLA).

import http from 'k6/http';
import { check, sleep } from 'k6';

export function cfgString(name, def) {
  const v = __ENV[name];
  return v === undefined || v === '' ? def : v;
}

export function cfgInt(name, def) {
  const v = __ENV[name];
  if (v === undefined || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

// Equivalente a ${__UUID()} de JMeter: un UUID v4 nuevo en cada llamada.
export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// UniformRandomTimer de JMeter: delay = constante + uniform(0, deviation), en ms.
export function sleepUniform(delayMs, deviationMs) {
  const totalMs = delayMs + Math.random() * deviationMs;
  sleep(totalMs / 1000);
}

export function buildBaseUrl(protocol, host, port) {
  return `${protocol}://${host}:${port}`;
}

export function jsonHeaders(extra) {
  return Object.assign({ 'Content-Type': 'application/json' }, extra || {});
}

// Equivalente a CSVDataSet con quotedData=false: split simple por coma, sin
// soporte de comillas (igual que el .jmx original).
export function parseCsv(content, skipHeader) {
  const lines = content
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);
  const rows = skipHeader ? lines.slice(1) : lines;
  return rows.map((line) => line.split(','));
}

export function safeJson(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

// Equivalente a JSONPostProcessor: si el path no existe o el body no es JSON
// valido, devuelve el valor default (igual que JSONPostProcessor.defaultValues).
export function extract(obj, getter, defaultVal) {
  if (obj === null || obj === undefined) return defaultVal;
  try {
    const v = getter(obj);
    return v === undefined || v === null ? defaultVal : String(v);
  } catch (e) {
    return defaultVal;
  }
}

// ResponseAssertion "... HTTP 200" (Assertion.response_code, EQUALS).
export function checkStatus200(res, label) {
  return check(res, { [`${label}: HTTP 200`]: (r) => r.status === 200 });
}

// ResponseAssertion "... COR000I" (Assertion.response_data, SUBSTRING).
export function checkContainsCOR000I(res, label) {
  return check(res, {
    [`${label}: contiene COR000I`]: (r) =>
      typeof r.body === 'string' && r.body.indexOf('COR000I') !== -1,
  });
}

// DurationAssertion (falla el check pero no aborta la iteracion, igual que
// ThreadGroup.on_sample_error=continue en el .jmx).
export function checkDurationSla(res, maxMs, label) {
  return check(res, {
    [`${label}: duracion < ${maxMs}ms`]: (r) => r.timings.duration < maxMs,
  });
}

// Traduce ThreadGroup (num_threads/ramp_time/duration/scheduler/LoopController)
// a un scenario de k6. loops=-1 (continue_forever) -> ramping-vus, que hace que
// cada VU repita el flujo en loop durante todo el tiempo que este vivo.
// loops>0 (ej. smoke con LOOPS=1) -> per-vu-iterations con esa cantidad exacta.
export function buildOptions({ users, rampUp, duration, loops, startDelay }) {
  const startTime = `${startDelay}s`;
  let scenario;

  if (loops === -1) {
    const holdSeconds = Math.max(duration - rampUp, 0);
    scenario = {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime,
      gracefulRampDown: '0s',
      gracefulStop: '5s',
      stages: [
        { duration: `${rampUp}s`, target: users },
        { duration: `${holdSeconds}s`, target: users },
      ],
    };
  } else {
    scenario = {
      executor: 'per-vu-iterations',
      vus: users,
      iterations: loops,
      startTime,
      maxDuration: `${Math.max(duration, 60) * 10}s`,
    };
  }

  return {
    scenarios: { login_desktop: scenario },
  };
}
