// Migracion 1:1 de jmx/PetersenEmpresas-LoginDesktop.jmx (Petersen Empresas -
// Stress Login + Desktop). Alcance: Login (3 pasos) + Desktop corporate +
// Logout, con las mismas variables, condicionales, timers y assertions que
// el plan original de JMeter. Ver docs/endpoints-stress-test.md para el
// detalle de endpoints.
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
const slaMaxDurationMs = cfgInt('SLA_MAX_DURATION_MS', 12000);

const usersFilePath = cfgString('USERS_FILE', 'docs/jmeter/usuarios-empresas.csv');

// CSVDataSet "Usuarios Empresas": ignoreFirstLine=false, columnas user,password,document
const csvRows = new SharedArray('empresas-users', () => parseCsv(open(usersFilePath), false));

export const options = buildOptions({ users, rampUp, duration, loops, startDelay });

const base = buildBaseUrl(protocol, host, port);

// CSVDataSet shareMode.thread + recycle=true: cada VU tiene su propio puntero,
// arranca en la fila 0 (independiente de los demas VUs) y recicla al llegar
// al final del archivo.
let csvIndex = 0;

function nextUser() {
  const row = csvRows[csvIndex % csvRows.length];
  csvIndex++;
  return { user: row[0], password: row[1], document: row[2] };
}

export default function () {
  const jar = http.cookieJar();
  const { user, password, document } = nextUser();

  let exchangeToken = 'NO_EXCHANGE_TOKEN';
  let environmentId = '-1';
  let firstEnvironmentId = 'NO_ENVIRONMENT';
  let accessToken = 'NO_ACCESS_TOKEN';
  let vEnvironmentType = 'unknown';
  let needDailyNotifValidation = 'false';
  let isAdministrator = 'false';
  let isSigner = 'false';
  let hasExpirationDatesWidget = '';

  // ---- Login ----
  {
    const res = http.post(
      `${base}/${apiURL}/session.login.step1`,
      JSON.stringify({
        _usuario: user,
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
        _password: password,
        _document: document,
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
    exchangeToken = extract(body, (b) => b.data._exchangeToken, 'NO_EXCHANGE_TOKEN');
    environmentId = extract(body, (b) => b.data.defaultEnvironmentId, '-1');
    firstEnvironmentId = extract(
      body,
      (b) => b.data.environments[0].idEnvironment,
      'NO_ENVIRONMENT'
    );
  }

  {
    // ${__groovy(vars.get('environmentId') == '-1' ? vars.get('firstEnvironmentId') : vars.get('environmentId'))}
    const environment = environmentId === '-1' ? firstEnvironmentId : environmentId;
    const res = http.post(
      `${base}/${apiURL}/session.login.step3`,
      JSON.stringify({
        environment,
        setAsDefault: false,
        lang: 'es',
        channel,
        _fingerprint: 'eyJmaW5nZXJwcmludCI6InN0cmVzcy10ZXN0LWptZXRlciJ9',
        xAppVersion,
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
    vEnvironmentType = extract(body, (b) => b.data.activeEnvironmentType, 'unknown');
    needDailyNotifValidation = extract(body, (b) => b.data.needDailyNotifValidation, 'false');
    isAdministrator = extract(body, (b) => b.data.isAdministrator, 'false');
    isSigner = extract(body, (b) => b.data.isSigner, 'false');
  }

  sleepUniform(smallTimerDelay, smallTimerDeviation);

  // ---- BankName (anonimo): siempre se ejecuta, no depende del login ----
  {
    const res = http.post(
      `${base}/${apiURL}/misc.getBankName`,
      JSON.stringify({ channel, lang: 'es', ajax_uuid: uuidv4(), xAppVersion }),
      { headers: jsonHeaders(), tags: { name: 'BankName' } }
    );
    checkStatus200(res, 'BankName');
    checkDurationSla(res, slaMaxDurationMs, 'BankName');
    checkContainsCOR000I(res, 'BankName');
  }

  // ---- Escritorio + Logout: solo si el login fue exitoso y el ambiente es corporate ----
  // (IfController "Si Login OK y ambiente corporate" envuelve tambien el Logout en el .jmx)
  if (vEnvironmentType === 'corporate' && accessToken !== 'NO_ACCESS_TOKEN') {
    const authHeaders = jsonHeaders({ Authorization: `bearer ${accessToken}` });

    // Llamadas secuenciales (GenericController "sin dependencia del plugin bzm
    // Parallel Controller" en el .jmx original).
    {
      const res = http.post(
        `${base}/${apiURL}/desktop.loadLayout`,
        JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-DesktopLayout' } }
      );
      checkStatus200(res, 'Escritorio-DesktopLayout');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-DesktopLayout');
      checkContainsCOR000I(res, 'Escritorio-DesktopLayout');
      const body = safeJson(res);
      hasExpirationDatesWidget = extract(
        body,
        (b) => b.data.widgets.find((w) => w.id === 'expirationDates').id,
        ''
      );
    }

    {
      const res = http.post(
        `${base}/${apiURL}/communications.list`,
        JSON.stringify({ direction: 'BANK_TO_CUSTOMER', ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Communications' } }
      );
      checkStatus200(res, 'Escritorio-Communications');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Communications');
      checkContainsCOR000I(res, 'Escritorio-Communications');
    }

    {
      const res = http.post(
        `${base}/${apiURL}/widgets.accounts`,
        JSON.stringify({ fromDesktop: true, ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-Cuentas' } }
      );
      checkStatus200(res, 'Escritorio-Widget-Cuentas');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-Cuentas');
      checkContainsCOR000I(res, 'Escritorio-Widget-Cuentas');
    }

    {
      const res = http.post(
        `${base}/${apiURL}/widgets.creditCards`,
        JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-CreditCards' } }
      );
      checkStatus200(res, 'Escritorio-Widget-CreditCards');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-CreditCards');
      checkContainsCOR000I(res, 'Escritorio-Widget-CreditCards');
    }

    {
      const res = http.post(
        `${base}/${apiURL}/widgets.list`,
        JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-QuickAccess' } }
      );
      checkStatus200(res, 'Escritorio-Widget-QuickAccess');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-QuickAccess');
      checkContainsCOR000I(res, 'Escritorio-Widget-QuickAccess');
    }

    {
      // Response Assertion no bloqueante en el .jmx (assume_success=true): puede
      // fallar fuera de horario habil o en bancos sin permiso corporate.loans.consult.
      const res = http.post(
        `${base}/${apiURL}/corporateFinancing.loanQualification.list`,
        JSON.stringify({ currency: 'ARS', ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-LoanQualification' } }
      );
      checkStatus200(res, 'Escritorio-Widget-LoanQualification');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-LoanQualification');
    }

    if (hasExpirationDatesWidget === 'expirationDates') {
      const res = http.post(
        `${base}/${apiURL}/widgets.expirationDates`,
        JSON.stringify({ ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-ExpirationDates' } }
      );
      checkStatus200(res, 'Escritorio-Widget-ExpirationDates');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-ExpirationDates');
      checkContainsCOR000I(res, 'Escritorio-Widget-ExpirationDates');
    }

    if (isAdministrator === 'true' || isSigner === 'true') {
      const res = http.post(
        `${base}/${apiURL}/approval.transactions`,
        JSON.stringify({
          fromWidget: true,
          isExport: false,
          searchByFilters: false,
          ajax_uuid: uuidv4(),
          xAppVersion,
        }),
        { headers: authHeaders, tags: { name: 'Escritorio-Widget-Approvals' } }
      );
      checkStatus200(res, 'Escritorio-Widget-Approvals');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-Widget-Approvals');
      checkContainsCOR000I(res, 'Escritorio-Widget-Approvals');
    }

    if (needDailyNotifValidation === 'true') {
      const res = http.post(
        `${base}/${apiURL}/load.daily.notification.validation`,
        JSON.stringify({ operationType: 'validation', ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-DailyNotification-validation' } }
      );
      checkStatus200(res, 'Escritorio-DailyNotification-validation');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-DailyNotification-validation');
      checkContainsCOR000I(res, 'Escritorio-DailyNotification-validation');
    }

    {
      const res = http.post(
        `${base}/${apiURL}/load.daily.notification.validation`,
        JSON.stringify({ operationType: 'newCcUsdValidation', ajax_uuid: uuidv4(), xAppVersion }),
        { headers: authHeaders, tags: { name: 'Escritorio-DailyNotification-newCcUsdValidation' } }
      );
      checkStatus200(res, 'Escritorio-DailyNotification-newCcUsdValidation');
      checkDurationSla(res, slaMaxDurationMs, 'Escritorio-DailyNotification-newCcUsdValidation');
      checkContainsCOR000I(res, 'Escritorio-DailyNotification-newCcUsdValidation');
    }

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
