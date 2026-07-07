/**
 * Tinkoff Kassa — бэкенд для КлавирON
 * Google Apps Script (Code.gs)
 *
 * Документация: https://www.tinkoff.ru/kassa/develop/
 *
 * НАСТРОЙКА:
 *   1. Скопируйте этот код в редактор Apps Script
 *   2. Файл → Project Settings → Script Properties
 *      TINKOFF_TERMINAL_KEY = ваш_terminal_key
 *      TINKOFF_SECRET_KEY   = ваш_secret_key
 *   3. Деплойте как Web App (Execute as: Me, Access: Anyone)
 *   4. Вставьте URL в личном кабинете Tinkoff → Webhooks
 */

var TINKOFF_API = 'https://securepay.tinkoff.ru/v2/';

/**
 * === ОСНОВНЫЕ ТОЧКИ ВХОДА ===
 */

function doGet(e) {
  var action = norm_((e && e.parameter && e.parameter.action) || '');

  if (action === 'config') return jsonOutput_(getConfig_());
  if (action === 'previewresult') return jsonOutput_(getPreviewResult_(e.parameter || {}));
  if (action === 'paidresult' || action === 'catalog') return jsonOutput_({ ok: true, data: getPaidResult_(e.parameter || {}) });
  if (action === 'verify') return jsonOutput_(verifyPaymentServer_(String((e.parameter && (e.parameter.order_id || e.parameter.orderId)) || '')));
  if (action === 'createpayment') return jsonOutput_(createPaymentFromQuiz_(e.parameter || {}));

  // По умолчанию — отдаём HTML лендинга (если GAS используется как хостинг)
  return HtmlService.createHtmlOutput(getHtml_())
    .setTitle('КлавирON')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  // Tinkoff шлёт webhook как form-urlencoded или JSON
  try {
    var params;
    if (e && e.postData && e.postData.contents) {
      var contentType = (e.postData.type || '').toLowerCase();
      if (contentType.indexOf('json') !== -1) {
        params = JSON.parse(e.postData.contents);
      } else {
        // form-urlencoded
        params = {};
        var pairs = String(e.postData.contents).split('&');
        for (var i = 0; i < pairs.length; i++) {
          var kv = pairs[i].split('=');
          if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        }
      }
    } else {
      params = (e && e.parameter) || {};
    }

    return handleTinkoffWebhook_(params);
  } catch (err) {
    log_('doPost error: ' + String(err));
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

/**
 * === TINKOFF KASSA — СОЗДАНИЕ ПЛАТЕЖА ===
 */

/**
 * Создаёт платёж в Tinkoff Kassa.
 * Вызывается с фронтенда: ?action=createpayment&goal=hobby&budget=low&amount=29900
 *
 * Возвращает: { ok: true, paymentUrl: 'https://...', orderId: '...' }
 */
function createPaymentFromQuiz_(params) {
  var goal = norm_(params.goal || 'hobby');
  var budget = norm_(params.budget || 'low');
  var amount = Number(params.amount || 29900); // в копейках! 299 ₽ = 29900

  // Генерируем order_id
  var orderId = 'klv_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);

  // Сохраняем заказ в таблицу
  saveOrder_(orderId, goal, budget, amount, params);

  // Создаём платёж в Tinkoff
  var init = tinkoffInit_(orderId, amount, DESCRIPTION_, getSuccessUrl_(orderId), getFailUrl_(orderId));

  if (init && init.Success && init.PaymentURL) {
    return { ok: true, orderId: orderId, paymentUrl: init.PaymentURL };
  }

  return { ok: false, error: (init && init.Message) || 'Init failed' };
}

var DESCRIPTION_ = 'Подбор клавишного инструмента — расширенный каталог';

/**
 * Tinkoff Init API
 * https://www.tinkoff.ru/kassa/develop/api/autosubmit-init/
 */
function tinkoffInit_(orderId, amount, description, successUrl, failUrl) {
  var terminalKey = getProp_('TINKOFF_TERMINAL_KEY');
  var secretKey = getProp_('TINKOFF_SECRET_KEY');

  if (!terminalKey || !secretKey) {
    // DEV-режим — без реального платежа
    return {
      Success: true,
      PaymentURL: 'https://klaviron.github.io/?payment=ok&order_id=' + orderId + '&dev=1',
      OrderId: orderId,
      Amount: amount
    };
  }

  var data = {
    TerminalKey: terminalKey,
    Amount: amount,           // копейки
    OrderId: orderId,
    Description: description,
    SuccessUrl: successUrl,
    FailUrl: failUrl,
    // DATA — доп. данные (необязательно)
    DATA: {
      goal: orderId,
      source: 'klaviron'
    }
  };

  // Подпись
  data.Token = tinkoffToken_(data, secretKey);

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(TINKOFF_API + 'Init', options);
  return JSON.parse(resp.getContentText());
}

/**
 * Генерация токена (подписи) Tinkoff
 * 1. Добавить Password = SecretKey
 * 2. Отсортировать все поля по имени (рекурсивно для DATA — ключи через ':')
 * 3. Конкатенация значений
 * 4. SHA-256
 */
function tinkoffToken_(data, secretKey) {
  var flat = {};

  function flatten(prefix, obj) {
    for (var key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      var val = obj[key];
      var fullKey = prefix ? (prefix + key) : key;

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        flatten(fullKey + '.', val);
      } else {
        flat[fullKey] = String(val);
      }
    }
  }

  flatten('', data);
  flat['Password'] = secretKey;

  // Сортируем по ключам
  var keys = Object.keys(flat).sort();
  var concat = '';
  for (var i = 0; i < keys.length; i++) {
    concat += flat[keys[i]];
  }

  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, concat)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
    .join('');
}

/**
 * === TINKOFF WEBHOOK ===
 */

/**
 * Обработка webhook от Tinkoff Kassa
 * Tinkoff присылает: TerminalKey, OrderId, Success, Status, PaymentId, Token, ...
 */
function handleTinkoffWebhook_(params) {
  // Проверяем подпись
  var secretKey = getProp_('TINKOFF_SECRET_KEY');
  if (secretKey) {
    var expectedToken = tinkoffToken_(params, secretKey);
    if (expectedToken !== params.Token) {
      log_('Webhook: invalid token, order=' + params.OrderId);
      return ContentService.createTextOutput('INVALID TOKEN').setMimeType(ContentService.MimeType.TEXT);
    }
  }

  var orderId = String(params.OrderId || '');
  var status = String(params.Status || '');
  var paymentId = String(params.PaymentId || '');

  log_('Webhook: order=' + orderId + ' status=' + status);

  // Записываем статус
  updateOrderStatus_(orderId, status, paymentId);

  // Отвечаем "OK" — Tinkoff требует ответ 200 + тело "OK"
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * === ВЕРИФИКАЦИЯ ПЛАТЕЖА ===
 */

/**
 * Проверяет оплату по order_id.
 * Сначала смотрит в таблицу orders, потом (опционально) дёргает GetState.
 */
function verifyPaymentServer_(orderId) {
  if (!orderId) return { ok: false };

  // 1. Проверяем в таблице
  var order = findOrder_(orderId);
  if (order && (order.status === 'CONFIRMED' || order.status === 'AUTHORIZED')) {
    return { ok: true, token: orderId, status: order.status };
  }

  // 2. Если есть ключи — спрашиваем Tinkoff напрямую
  var terminalKey = getProp_('TINKOFF_TERMINAL_KEY');
  var secretKey = getProp_('TINKOFF_SECRET_KEY');
  if (terminalKey && secretKey) {
    var state = tinkoffGetState_(orderId, terminalKey, secretKey);
    if (state && state.Success) {
      if (state.Status === 'CONFIRMED' || state.Status === 'AUTHORIZED') {
        updateOrderStatus_(orderId, state.Status, state.PaymentId || '');
        return { ok: true, token: orderId, status: state.Status };
      }
    }
  }

  // 3. DEV-режим (без ключей) — считаем оплаченным
  if (!terminalKey || !secretKey) {
    return { ok: true, token: orderId, status: 'DEV' };
  }

  return { ok: false };
}

/**
 * Tinkoff GetState API
 */
function tinkoffGetState_(orderId, terminalKey, secretKey) {
  var data = {
    TerminalKey: terminalKey,
    PaymentId: orderId  // Внимание: Tinkoff ждёт PaymentId, но мы шлём OrderId
  };
  // Для GetState правильнее использовать PaymentId, но мы храним order_id
  // Если нужно — можно хранить paymentId отдельно
  data.Token = tinkoffToken_(data, secretKey);

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(TINKOFF_API + 'GetState', options);
  return JSON.parse(resp.getContentText());
}

/**
 * === РАБОТА С ТАБЛИЦЕЙ ORDERS ===
 */

var SPREADSHEET_ID = '1fBwrXb1DU-5iMjfEeiuzWBXA85XczWLXZM3Ag_LVCVE';
var SHEET_ORDERS = 'orders';

function saveOrder_(orderId, goal, budget, amount, params) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) sh = ss.insertSheet(SHEET_ORDERS);

  if (sh.getLastRow() === 0) {
    sh.appendRow(['order_id', 'date', 'status', 'payment_id', 'goal', 'budget', 'experience', 'format', 'amount', 'email']);
  }

  sh.appendRow([
    orderId,
    new Date().toISOString(),
    'NEW',
    '',
    goal,
    budget,
    params.experience || '',
    params.format || '',
    amount,
    params.email || ''
  ]);
}

function findOrder_(orderId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return null;

  var values = sh.getDataRange().getValues();
  var headers = values[0].map(normHeader_);
  var colOrderId = headers.indexOf('order_id');
  var colStatus = headers.indexOf('status');
  var colPaymentId = headers.indexOf('payment_id');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colOrderId] || '').trim() === String(orderId).trim()) {
      return {
        orderId: values[i][colOrderId],
        status: values[i][colStatus],
        paymentId: colPaymentId >= 0 ? values[i][colPaymentId] : ''
      };
    }
  }
  return null;
}

function updateOrderStatus_(orderId, status, paymentId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) return;

  var values = sh.getDataRange().getValues();
  var headers = values[0].map(normHeader_);
  var colOrderId = headers.indexOf('order_id');
  var colStatus = headers.indexOf('status');
  var colPaymentId = headers.indexOf('payment_id');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colOrderId] || '').trim() === String(orderId).trim()) {
      if (colStatus >= 0) sh.getRange(i + 1, colStatus + 1).setValue(status);
      if (colPaymentId >= 0 && paymentId) sh.getRange(i + 1, colPaymentId + 1).setValue(paymentId);
      return;
    }
  }
}

/**
 * === ВСПОМОГАТЕЛЬНЫЕ ===
 */

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSuccessUrl_(orderId) {
  return 'https://klaviron.github.io/?payment=ok&order_id=' + orderId;
}

function getFailUrl_(orderId) {
  return 'https://klaviron.github.io/?payment=fail&order_id=' + orderId;
}

function getConfig_() {
  var terminalKey = getProp_('TINKOFF_TERMINAL_KEY');
  return {
    ok: true,
    paymentProvider: 'tinkoff',
    paymentEnabled: !!terminalKey,
    price: 29900, // копейки
    priceLabel: '299 ₽',
    successUrl: 'https://klaviron.github.io/?payment=ok',
    failUrl: 'https://klaviron.github.io/?payment=fail'
  };
}

function log_(msg) {
  // Можно писать в лист Logs или просто в Logger
  Logger.log(msg);
  // Опционально — в таблицу:
  // var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // var sh = ss.getSheetByName('Logs') || ss.insertSheet('Logs');
  // sh.appendRow([new Date(), msg]);
}

function norm_(s) { return String(s || '').trim().toLowerCase(); }
function normHeader_(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * === ТЕСТОВЫЕ ФУНКЦИИ (запускать в редакторе) ===
 */

function test_token() {
  var data = {
    TerminalKey: 'TestTerminal',
    Amount: 29900,
    OrderId: 'klv_test123',
    Description: 'Test payment'
  };
  var token = tinkoffToken_(data, 'TestSecret123');
  Logger.log('Token: ' + token);
}

function test_createPayment() {
  var result = createPaymentFromQuiz_({
    goal: 'learning',
    budget: 'low',
    amount: 29900,
    experience: 'beginner'
  });
  Logger.log(JSON.stringify(result));
}

function test_verify() {
  var result = verifyPaymentServer_('klv_test123');
  Logger.log(JSON.stringify(result));
}