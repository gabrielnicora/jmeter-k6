// Migracion 1:1 de jmx/PetersenCDP-LoginDesktop.jmx (Petersen CDP (Individuos)
// - Stress Login + Desktop). Alcance: Login (step1 usuario / step2 password /
// step3 selectEnvironment auto) + Desktop individuos + Logout, con las mismas
// variables, condicionales, timers y assertions que el plan original de
// JMeter. Ver docs/endpoints-stress-test.md para el detalle de endpoints.
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import {
  cfgString,
  cfgInt,
  uuidv4,
  sleepUniform,
  buildBaseUrl,
  jsonHeaders,
  parseCsv,
  safeJson,
  extract,
  checkStatus200,
  checkContainsCOR000I,
  checkDurationSla,
  buildOptions,
} from './lib/common.js';

// ---- Config: mismos nombres/defaults que las propiedades __P(...) del .jmx ----
const protocol = cfgString('PROTOCOL', 'http');
const host = cfgString('HOST', 'localhost');
const port = cfgString('PORT', '8080');
const apiURL = cfgString('API_URL', 'api/v1/execute');
const channel = 'frontend'; // valor fijo en el .jmx, no parametrizado
const xAppVersion = cfgString('X_APP_VERSION', '3.0.0');

const users = cfgInt('USERS', 1);
const rampUp = cfgInt('RAMPUP', 30);
const duration = cfgInt('DURATION', 300);
const loops = cfgInt('LOOPS', -1);
const startDelay = cfgInt('STARTDELAY', 0);

const smallTimerDelay = cfgInt('SMALL_TIMER_DELAY', 500);
const smallTimerDeviation = cfgInt('SMALL_TIMER_DEVIATION', 200);
const mediumTimerDelay = cfgInt('MEDIUM_TIMER_DELAY', 2000);
const mediumTimerDeviation = cfgInt('MEDIUM_TIMER_DEVIATION', 800);
const slaMaxDurationMs = cfgInt('SLA_MAX_DURATION_MS', 5000);
const slaAccountsDurationMs = cfgInt('SLA_ACCOUNTS_DURATION_MS', 8000);

const usersFilePath = cfgString('USERS_FILE', 'extras/jmeter/usuarios-cdp.csv');

// CSVDataSet "Usuarios CDP": ignoreFirstLine=true (tiene encabezado), columnas user,password
const csvRows = new SharedArray('cdp-users', () => parseCsv(open(usersFilePath), true));

export const options = buildOptions({ users, rampUp, duration, loops, startDelay });

const base = buildBaseUrl(protocol, host, port);

// CSVDataSet shareMode.thread + recycle=true: cada VU tiene su propio puntero,
// arranca en la fila 0 (independiente de los demas VUs) y recicla al llegar
// al final del archivo.
let csvIndex = 0;

function nextUser() {
  const row = csvRows[csvIndex % csvRows.length];
  csvIndex++;
  return { user: row[0], password: row[1] };
}

export default function () {
  const jar = http.cookieJar();
  const { user, password } = nextUser();

  let exchangeToken = 'NO_EXCHANGE_TOKEN';
  let accessToken = 'NO_ACCESS_TOKEN';

  // ---- Login ----
  {
    const res = http.post(
      `${base}/${apiURL}/session.login.step1`,
      JSON.stringify({
        _usuario: user,
        _captcha: '',
        lang: 'es',
        channel,
        ajax_uuid: uuidv4(),
        xAppVersion,
      }),
      { headers: jsonHeaders(), tags: { name: 'Login-Paso1' } }
    );
    checkStatus200(res, 'Login-Paso1');
    checkDurationSla(res, slaMaxDurationMs, 'Login-Paso1');
    checkContainsCOR000I(res, 'Login-Paso1');
    const body = safeJson(res);
    exchangeToken = extract(body, (b) => b.data._exchangeToken, 'NO_EXCHANGE_TOKEN');
  }

  {
    const res = http.post(
      `${base}/${apiURL}/session.login.step2`,
      JSON.stringify({
        _username: user,
        _password: password,
        _captcha: '',
        lang: 'es',
        channel,
        xAppVersion,
        ajax_uuid: uuidv4(),
      }),
      {
        headers: jsonHeaders({ Authorization: `exchange ${exchangeToken}` }),
        tags: { name: 'Login-Paso2' },
      }
    );
    checkStatus200(res, 'Login-Paso2');
    checkDurationSla(res, slaMaxDurationMs, 'Login-Paso2');
    checkContainsCOR000I(res, 'Login-Paso2');
    const body = safeJson(res);
    // Igual que en el .jmx (defaultValues=${exchangeToken}): si la extraccion
    // falla, se mantiene el exchangeToken previo en lugar de resetearlo.
    exchangeToken = extract(body, (b) => b.data._exchangeToken, exchangeToken);
  }

  {
    const res = http.post(
      `${base}/${apiURL}/session.login.step3`,
      JSON.stringify({
        forceSession: false,
        lang: 'es',
        channel,
        xAppVersion,
        _fingerprint: 'eyJmaW5nZXJwcmludCI6ImptZXRlci1jZHAtbG9hZHRlc3QifQ==',
        ajax_uuid: uuidv4(),
      }),
      {
        headers: jsonHeaders({ Authorization: `exchange ${exchangeToken}` }),
        tags: { name: 'Login-Paso3' },
      }
    );
    checkStatus200(res, 'Login-Paso3');
    checkDurationSla(res, slaMaxDurationMs, 'Login-Paso3');
    checkContainsCOR000I(res, 'Login-Paso3');
    const body = safeJson(res);
    accessToken = extract(body, (b) => b.data._accessToken, 'NO_ACCESS_TOKEN');
  }

  sleepUniform(smallTimerDelay, smallTimerDeviation);

  // ---- BankName (anonimo): siempre se ejecuta, no depende del login ----
  {
    const res = http.post(
      `${base}/${apiURL}/misc.getBankName`,
      JSON.stringify({ channel, ajax_uuid: uuidv4(), xAppVersion }),
      { headers: jsonHeaders(), tags: { name: 'BankName' } }
    );
    checkStatus200(res, 'BankName');
    checkDurationSla(res, slaMaxDurationMs, 'BankName');
    checkContainsCOR000I(res, 'BankName');
  }

  // ---- Escritorio + Logout: solo si el login fue exitoso (accessToken presente) ----
  // (IfController "Si Login OK" envuelve tambien el Logout en el .jmx)
  if (accessToken !== 'NO_ACCESS_TOKEN') {
    const authHeaders = jsonHeaders({ Authorization: `bearer ${accessToken}` });

    // Las 4 llamadas del escritorio corren en PARALELO en el .jmx (plugin bzm
    // Parallel Controller, MAXThreadNumber=6) -> http.batch() replica esa
    // concurrencia real en vez de ejecutarlas secuencialmente.
    const responses = http.batch([
      {
        method: 'POST',
        url: `${base}/${apiURL}/desktop.loadLayout`,
        body: JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        params: { headers: authHeaders, tags: { name: 'Escritorio-DesktopLayout' } },
      },
      {
        method: 'POST',
        url: `${base}/${apiURL}/communications.list`,
        body: JSON.stringify({ direction: 'BANK_TO_CUSTOMER', ajax_uuid: uuidv4(), xAppVersion }),
        params: { headers: authHeaders, tags: { name: 'Escritorio-Communications' } },
      },
      {
        method: 'POST',
        url: `${base}/${apiURL}/widgets.accounts`,
        body: JSON.stringify({ fromDesktop: true, ajax_uuid: uuidv4(), xAppVersion }),
        params: { headers: authHeaders, tags: { name: 'Escritorio-Widget-Cuentas' } },
      },
      {
        method: 'POST',
        url: `${base}/${apiURL}/widgets.creditCards`,
        body: JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        params: { headers: authHeaders, tags: { name: 'Escritorio-Widget-CreditCards' } },
      },
    ]);

    const [resLayout, resComms, resAccounts, resCards] = responses;

    checkStatus200(resLayout, 'Escritorio-DesktopLayout');
    checkDurationSla(resLayout, slaMaxDurationMs, 'Escritorio-DesktopLayout');
    checkContainsCOR000I(resLayout, 'Escritorio-DesktopLayout');

    checkStatus200(resComms, 'Escritorio-Communications');
    checkDurationSla(resComms, slaMaxDurationMs, 'Escritorio-Communications');
    checkContainsCOR000I(resComms, 'Escritorio-Communications');

    // Widget-Cuentas tiene su propio SLA (mas holgado: N consultas ISO de saldo)
    checkStatus200(resAccounts, 'Escritorio-Widget-Cuentas');
    checkDurationSla(resAccounts, slaAccountsDurationMs, 'Escritorio-Widget-Cuentas');
    checkContainsCOR000I(resAccounts, 'Escritorio-Widget-Cuentas');

    checkStatus200(resCards, 'Escritorio-Widget-CreditCards');
    checkDurationSla(resCards, slaMaxDurationMs, 'Escritorio-Widget-CreditCards');
    checkContainsCOR000I(resCards, 'Escritorio-Widget-CreditCards');

    sleepUniform(mediumTimerDelay, mediumTimerDeviation);

    {
      const res = http.post(
        `${base}/${apiURL}/session.logout`,
        JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Logout' } }
      );
      checkStatus200(res, 'Logout');
      checkDurationSla(res, slaMaxDurationMs, 'Logout');
      checkContainsCOR000I(res, 'Logout');
    }
  }

  // CookieManager.clearEachIteration=true
  jar.clear(base);
}
