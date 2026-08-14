# Endpoints consumidos por los Tests de Stress

## Test OBE — Empresas (Office Banking Empresas)

| # | Nombre del Request | Método | Path Completo | Host | Autenticación | Validación |
|---|---|---|---|---|---|---|
| 1 | Login-Paso1 | POST | /api/v1/execute/session.login.step1 | apie.qa.bancoune.com | Ninguna | HTTP 200 + COR000I |
| 2 | Login-Paso2 | POST | /api/v1/execute/session.login.step2 | apie.qa.bancoune.com | exchange {exchangeToken} | HTTP 200 + COR000I |
| 3 | Login-Paso3 (SelectEnvironment) | POST | /api/v1/execute/session.login.step3 | apie.qa.bancoune.com | exchange {exchangeToken} | HTTP 200 + COR000I |
| 4 | BankName (anónimo) | POST | /api/v1/execute/misc.getBankName | apie.qa.bancoune.com | Ninguna | HTTP 200 + COR000I |
| 5 | Escritorio-DesktopLayout | POST | /api/v1/execute/desktop.loadLayout | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 6 | Escritorio-Communications | POST | /api/v1/execute/communications.list | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 7 | Escritorio-Widget-Cuentas | POST | /api/v1/execute/widgets.accounts | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 8 | Escritorio-Widget-CreditCards | POST | /api/v1/execute/widgets.creditCards | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 9 | Escritorio-Widget-QuickAccess | POST | /api/v1/execute/widgets.list | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 10 | Escritorio-Widget-LoanQualification | POST | /api/v1/execute/corporateFinancing.loanQualification.list | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 11 | Logout | POST | /api/v1/execute/session.logout | apie.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |

---

## Test CDP — Individuos (Canal Digital Personas)

| # | Nombre del Request | Método | Path Completo | Host | Autenticación | Validación |
|---|---|---|---|---|---|---|
| 1 | Login-Paso1 | POST | /api/v1/execute/session.login.step1 | apii.qa.bancoune.com | Ninguna | HTTP 200 + COR000I |
| 2 | Login-Paso2 | POST | /api/v1/execute/session.login.step2 | apii.qa.bancoune.com | exchange {exchangeToken} | HTTP 200 + COR000I |
| 3 | Login-Paso3 (SelectEnvironment - auto) | POST | /api/v1/execute/session.login.step3 | apii.qa.bancoune.com | exchange {exchangeToken} | HTTP 200 + COR000I |
| 4 | BankName (anónimo) | POST | /api/v1/execute/misc.getBankName | apii.qa.bancoune.com | Ninguna | HTTP 200 + COR000I |
| 5 | Escritorio-DesktopLayout | POST | /api/v1/execute/desktop.loadLayout | apii.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 6 | Escritorio-Communications | POST | /api/v1/execute/communications.list | apii.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 7 | Escritorio-Widget-Cuentas | POST | /api/v1/execute/widgets.accounts | apii.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 8 | Escritorio-Widget-CreditCards | POST | /api/v1/execute/widgets.creditCards | apii.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |
| 9 | Logout | POST | /api/v1/execute/session.logout | apii.qa.bancoune.com | bearer {accessToken} | HTTP 200 + COR000I |

---

## Resumen de URLs completas

### OBE (Empresas) — Base: https://apie.qa.bancoune.com:443

| URL Completa |
|---|
| https://apie.qa.bancoune.com/api/v1/execute/session.login.step1 |
| https://apie.qa.bancoune.com/api/v1/execute/session.login.step2 |
| https://apie.qa.bancoune.com/api/v1/execute/session.login.step3 |
| https://apie.qa.bancoune.com/api/v1/execute/misc.getBankName |
| https://apie.qa.bancoune.com/api/v1/execute/desktop.loadLayout |
| https://apie.qa.bancoune.com/api/v1/execute/communications.list |
| https://apie.qa.bancoune.com/api/v1/execute/widgets.accounts |
| https://apie.qa.bancoune.com/api/v1/execute/widgets.creditCards |
| https://apie.qa.bancoune.com/api/v1/execute/widgets.list |
| https://apie.qa.bancoune.com/api/v1/execute/corporateFinancing.loanQualification.list |
| https://apie.qa.bancoune.com/api/v1/execute/session.logout |

### CDP (Individuos) — Base: https://apii.qa.bancoune.com:443

| URL Completa |
|---|
| https://apii.qa.bancoune.com/api/v1/execute/session.login.step1 |
| https://apii.qa.bancoune.com/api/v1/execute/session.login.step2 |
| https://apii.qa.bancoune.com/api/v1/execute/session.login.step3 |
| https://apii.qa.bancoune.com/api/v1/execute/misc.getBankName |
| https://apii.qa.bancoune.com/api/v1/execute/desktop.loadLayout |
| https://apii.qa.bancoune.com/api/v1/execute/communications.list |
| https://apii.qa.bancoune.com/api/v1/execute/widgets.accounts |
| https://apii.qa.bancoune.com/api/v1/execute/widgets.creditCards |
| https://apii.qa.bancoune.com/api/v1/execute/session.logout |
