/**
 * ЮKassa — бэкенд для КлавирON
 * Google Apps Script (Code.gs)
 *
 * Документация: https://yookassa.ru/developers/api
 *
 * НАСТРОЙКА:
 *   1. Скопируйте этот код в редактор Apps Script
 *   2. Файл → Project Settings → Script Properties
 *      YUKASSA_SHOP_ID   = ваш_shop_id
 *      YUKASSA_SECRET_KEY = ваш_secret_key
 *   3. Деплойте как Web App (Execute as: Me, Access: Anyone)
 *   4. Вставьте URL в личном кабинете ЮKassa → Webhooks
 *      Событие: payment.succeeded, payment.canceled
 */

var YUKASSA_API = 'https://api.yookassa.ru/v3/';

function doGet(e) {
  var action = norm_((e && e.parameter && e.parameter.action) || '');
  if (action === 'config') return jsonOutput_(getConfig_());
  if (action === 'previewresult') return jsonOutput_(getPreviewResult_(e.parameter || {}));
  if (action === 'paidresult' || action === 'catalog') return jsonOutput_({ ok: true, data: getPaidResult_(e.parameter || {}) });
  if (action === 'verify') return jsonOutput_(verifyPaymentServer_(String((e.parameter && (e.parameter.order_id || e.parameter.orderId)) || '')));
  if (action === 'createpayment') return jsonOutput_(createPaymentFromQuiz_(e.parameter || {}));
  if (action === 'debug') return jsonOutput_(debugCatalog_());
  return HtmlService.createHtmlOutput(getHtml_()).setTitle('КлавирON').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function debugCatalog_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var sheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === SHEET_CATALOG_GID) { sheet = sheets[i]; break; }
  }
  if (!sheet) sheet = sheets[0];
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  var colKeyboardType = findColumn_(headers, ['тип клавиатуры', 'клавиатура']);
  var colCategory = findColumn_(headers, ['категория']);
  var colType = findColumn_(headers, ['тип инструмента', 'тип']);
  // Собираем ВСЕ уникальные значения типа клавиатуры
  var ktUnique = {};
  var ktValues = [];
  if (colKeyboardType >= 0) {
    for (var i = 1; i < values.length; i++) {
      var kt = String(values[i][colKeyboardType] || '');
      if (!ktUnique[kt]) { ktUnique[kt] = 0; ktValues.push(kt); }
      ktUnique[kt]++;
    }
  }
  // Тест filterModels_ с format=hammer
  var allModels = readCatalogFromSheet_();
  var filtered = filterModels_(allModels, 'hobby', 'low', 'hammer', 'yes', 'yes', 'yes');
  // Показываем детали отфильтрованных моделей
  var filteredDetails = filtered.map(function(m) {
    return { name: m.name, keyboardType: m.keyboardType, category: m.category, priceNum: m.priceNum };
  });
  return {
    colKeyboardType: colKeyboardType,
    colCategory: colCategory,
    colType: colType,
    keyboardTypeUnique: ktUnique,
    keyboardTypeValues: ktValues,
    totalRows: values.length - 1,
    filteredCount: filtered.length,
    filteredDetails: filteredDetails
  };
}

function doPost(e) {
  try {
    var params;
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      params = (e && e.parameter) || {};
    }
    return handleYookassaWebhook_(params);
  } catch (err) {
    log_('doPost error: ' + String(err));
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function createPaymentFromQuiz_(params) {
  var goal = norm_(params.goal || 'hobby');
  var budget = norm_(params.budget || 'low');
  var amount = Number(params.amount || 29900);
  var amountRub = (amount / 100).toFixed(2);
  var orderId = 'klv_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var payment = yookassaCreatePayment_(orderId, amountRub, DESCRIPTION_, getSuccessUrl_(orderId));
  if (payment && payment.confirmation && payment.confirmation.confirmation_url) {
    saveOrder_(orderId, goal, budget, amount, params, payment.id);
    return { ok: true, orderId: orderId, paymentUrl: payment.confirmation.confirmation_url };
  }
  saveOrder_(orderId, goal, budget, amount, params, '');
  return { ok: false, error: (payment && payment.description) || 'Payment creation failed' };
}

var DESCRIPTION_ = 'Подбор клавишного инструмента — расширенный каталог';

function yookassaCreatePayment_(orderId, amountRub, description, returnUrl) {
  var shopId = getProp_('YUKASSA_SHOP_ID');
  var secretKey = getProp_('YUKASSA_SECRET_KEY');
  if (!shopId || !secretKey) {
    return {
      id: 'dev_' + orderId,
      status: 'pending',
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://klaviron.ru/?payment=ok&order_id=' + orderId + '&dev=1'
      }
    };
  }
  var data = {
    amount: { value: amountRub, currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: description,
    metadata: { order_id: orderId, source: 'klaviron' }
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(shopId + ':' + secretKey),
      'Idempotence-Key': Utilities.getUuid()
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments', options);
    return JSON.parse(resp.getContentText());
  } catch (err) {
    log_('yookassaCreatePayment_ error: ' + String(err));
    return { id: '', status: 'error', description: 'Сервис платежей временно недоступен (DNS). Попробуйте позже.' };
  }
}

function handleYookassaWebhook_(params) {
  var event = String(params.event || '');
  var paymentObj = params.object || {};
  var paymentId = String(paymentObj.id || '');
  var status = String(paymentObj.status || '');
  var orderId = String((paymentObj.metadata && paymentObj.metadata.order_id) || paymentId);
  log_('Webhook: event=' + event + ' order=' + orderId + ' status=' + status);
  if (event === 'payment.succeeded' || status === 'succeeded') {
    updateOrderStatus_(orderId, 'succeeded', paymentId);
  } else if (event === 'payment.canceled' || status === 'canceled') {
    updateOrderStatus_(orderId, 'canceled', paymentId);
  } else if (event === 'payment.waiting_for_capture' || status === 'waiting_for_capture') {
    updateOrderStatus_(orderId, 'waiting_for_capture', paymentId);
    var captured = yookassaCapturePayment_(paymentId);
    if (captured && captured.status === 'succeeded') {
      updateOrderStatus_(orderId, 'succeeded', paymentId);
    }
  }
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function verifyPaymentServer_(orderId) {
  if (!orderId) return { ok: false };
  var order = findOrder_(orderId);
  if (order && (order.status === 'succeeded')) {
    return { ok: true, token: orderId, status: order.status };
  }
  var shopId = getProp_('YUKASSA_SHOP_ID');
  var secretKey = getProp_('YUKASSA_SECRET_KEY');
  if (shopId && secretKey) {
    // Если есть payment_id — запрашиваем напрямую
    if (order && order.paymentId) {
      var payment = yookassaGetPayment_(order.paymentId, shopId, secretKey);
      if (payment && payment.status === 'succeeded') {
        updateOrderStatus_(orderId, 'succeeded', payment.id);
        return { ok: true, token: orderId, status: 'succeeded' };
      }
      // SberPay: если waiting_for_capture — подтверждаем автоматически
      if (payment && payment.status === 'waiting_for_capture') {
        var captured = yookassaCapturePayment_(order.paymentId);
        if (captured && captured.status === 'succeeded') {
          updateOrderStatus_(orderId, 'succeeded', payment.id);
          return { ok: true, token: orderId, status: 'succeeded' };
        }
      }
    }
    // Fallback: payment_id пустой — ищем платёж по order_id в metadata
    if (!order || !order.paymentId) {
      var found = yookassaFindPaymentByOrderId_(orderId, shopId, secretKey);
      if (found) {
        updateOrderPaymentId_(orderId, found.id);
        if (found.status === 'succeeded') {
          updateOrderStatus_(orderId, 'succeeded', found.id);
          return { ok: true, token: orderId, status: 'succeeded' };
        }
        if (found.status === 'waiting_for_capture') {
          var cap = yookassaCapturePayment_(found.id);
          if (cap && cap.status === 'succeeded') {
            updateOrderStatus_(orderId, 'succeeded', found.id);
            return { ok: true, token: orderId, status: 'succeeded' };
          }
        }
      }
    }
  }
  if (!shopId || !secretKey) {
    return { ok: true, token: orderId, status: 'DEV' };
  }
  return { ok: false };
}

function yookassaCapturePayment_(paymentId) {
  var shopId = getProp_('YUKASSA_SHOP_ID');
  var secretKey = getProp_('YUKASSA_SECRET_KEY');
  if (!shopId || !secretKey) return null;
  var data = { amount: { value: '299.00', currency: 'RUB' } };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(shopId + ':' + secretKey),
      'Idempotence-Key': Utilities.getUuid()
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments/' + paymentId + '/capture', options);
    return JSON.parse(resp.getContentText());
  } catch (err) {
    log_('yookassaCapturePayment_ error: ' + String(err));
    return null;
  }
}

function yookassaFindPaymentByOrderId_(orderId, shopId, secretKey) {
  var options = {
    method: 'get',
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(shopId + ':' + secretKey) },
    muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments?limit=20', options);
    var data = JSON.parse(resp.getContentText());
    if (data && data.items) {
      for (var i = 0; i < data.items.length; i++) {
        var p = data.items[i];
        if (p.metadata && p.metadata.order_id === orderId) return p;
      }
    }
  } catch (err) {
    log_('yookassaFindPaymentByOrderId_ error: ' + String(err));
  }
  return null;
}

function yookassaGetPayment_(paymentId, shopId, secretKey) {
  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(shopId + ':' + secretKey)
    },
    muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments/' + paymentId, options);
    return JSON.parse(resp.getContentText());
  } catch (err) {
    log_('yookassaGetPayment_ error: ' + String(err));
    return null;
  }
}

var SPREADSHEET_ID = '1fBwrXb1DU-5iMjfEeiuzWBXA85XczWLXZM3Ag_LVCVE';
var SHEET_ORDERS = 'orders';

function saveOrder_(orderId, goal, budget, amount, params, paymentId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) sh = ss.insertSheet(SHEET_ORDERS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['order_id', 'date', 'status', 'payment_id', 'goal', 'budget', 'experience', 'format', 'amount', 'email']);
  }
  sh.appendRow([
    orderId, new Date().toISOString(), 'NEW', paymentId || '', goal, budget,
    params.experience || '', params.format || '', amount, params.email || ''
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

function updateOrderPaymentId_(orderId, paymentId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) return;
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(normHeader_);
  var colOrderId = headers.indexOf('order_id');
  var colPaymentId = headers.indexOf('payment_id');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colOrderId] || '').trim() === String(orderId).trim()) {
      if (colPaymentId >= 0 && paymentId) sh.getRange(i + 1, colPaymentId + 1).setValue(paymentId);
      return;
    }
  }
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSuccessUrl_(orderId) {
  return 'https://klaviron.ru/?payment=ok&order_id=' + orderId;
}

function getFailUrl_(orderId) {
  return 'https://klaviron.ru/?payment=fail&order_id=' + orderId;
}

function getConfig_() {
  var shopId = getProp_('YUKASSA_SHOP_ID');
  return {
    ok: true,
    paymentProvider: 'yookassa',
    paymentEnabled: !!shopId,
    price: 29900,
    priceLabel: '299 ₽',
    successUrl: 'https://klaviron.ru/?payment=ok',
    failUrl: 'https://klaviron.ru/?payment=fail'
  };
}

function log_(msg) { Logger.log(msg); }
function norm_(s) { return String(s || '').trim().toLowerCase(); }
function normHeader_(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var SHEET_CATALOG_GID = '1303803798';

function getPreviewResult_(params) {
  var goal = norm_(params.goal || 'hobby');
  var budget = norm_(params.budget || 'low');
  var experience = norm_(params.experience || 'beginner');
  var format = norm_(params.format || 'synth');
  var needBuiltInSounds = norm_(params.needBuiltInSounds || 'yes');
  var speakers = norm_(params.speakers || 'yes');
  var accompaniment = norm_(params.accompaniment || 'dontcare');
  var adjustedBudget = adjustBudgetGAS_(goal, experience, budget);
  var allModels = readCatalogFromSheet_();
  var filtered = filterModels_(allModels, goal, adjustedBudget, format, needBuiltInSounds, speakers, accompaniment);
  if (filtered.length === 0) {
    return {
      ok: true,
      type: 'Подходящий инструмент',
      summary: 'Не удалось подобрать точную рекомендацию по вашим параметрам.',
      why: ['Попробуйте изменить бюджет или формат клавиатуры.'],
      warnings: []
    };
  }
  var typeInfo = determineTypeGAS_(goal, format, adjustedBudget, accompaniment);
  var warnings = buildWarningsGAS_(goal, experience, adjustedBudget, accompaniment, format);
  return {
    ok: true,
    type: typeInfo.type,
    summary: typeInfo.summary,
    why: typeInfo.why,
    warnings: warnings
  };
}

function getPaidResult_(params) {
  var goal = norm_(params.goal || 'hobby');
  var budget = norm_(params.budget || 'low');
  var experience = norm_(params.experience || 'beginner');
  var format = norm_(params.format || 'synth');
  var needBuiltInSounds = norm_(params.needBuiltInSounds || 'yes');
  var speakers = norm_(params.speakers || 'yes');
  var accompaniment = norm_(params.accompaniment || 'dontcare');
  var adjustedBudget = adjustBudgetGAS_(goal, experience, budget);
  var allModels = readCatalogFromSheet_();
  var filtered = filterModels_(allModels, goal, adjustedBudget, format, needBuiltInSounds, speakers, accompaniment);
  var accessories = buildAccessoriesGAS_(goal, format, adjustedBudget);
  var realPrice = computeRealPriceGAS_(filtered, accessories);
  var typeInfo = determineTypeGAS_(goal, format, adjustedBudget, accompaniment);
  var warnings = buildWarningsGAS_(goal, experience, adjustedBudget, accompaniment, format);
  return {
    type: typeInfo.type,
    summary: typeInfo.summary,
    models: filtered.map(function(m) {
      return {
        name: m.name || '',
        fullName: m.fullName || m.name || '',
        price: m.price || '',
        url: m.url || ''
      };
    }),
    accessories: accessories,
    realPrice: realPrice,
    why: typeInfo.why,
    warnings: warnings
  };
}

function getHtml_() {
  return '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=https://klaviron.ru/"></head><body>Redirecting to <a href="https://klaviron.ru/">klaviron.ru</a></body></html>';
}

function readCatalogFromSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var sheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === SHEET_CATALOG_GID) {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) sheet = sheets[0];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  var colName = findColumn_(headers, ['модель', 'название', 'наименование']);
  var colFullName = findColumn_(headers, ['название (полное)', 'полное название']);
  var colPrice = findColumn_(headers, ['цена', 'price']);
  var colKeys = findColumn_(headers, ['клавиши', 'количество клавиш']);
  var colSpeakers = findColumn_(headers, ['динамики', 'встроенные динамики']);
  var colKeyboardType = findColumn_(headers, ['тип клавиатуры', 'клавиатура']);
  var colAccompaniment = findColumn_(headers, ['автоаккомпанемент', 'аккомпанемент', 'ритмы']);
  var colCategory = findColumn_(headers, ['категория']);
  var colType = findColumn_(headers, ['тип инструмента', 'тип']);
  var colUrl = findColumn_(headers, ['ссылка поиска на яндекс маркет', 'яндекс маркет', 'url инструмента', 'url', 'ссылка']);
  var models = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[colName] && !row[0]) continue;
    models.push({
      name: colName >= 0 ? String(row[colName] || '') : String(row[0] || ''),
      fullName: colFullName >= 0 ? String(row[colFullName] || '') : '',
      price: colPrice >= 0 ? String(row[colPrice] || '') : '',
      priceNum: colPrice >= 0 ? (parseInt(String(row[colPrice] || '0').replace(/[^\d]/g, ''), 10) || 0) : 0,
      keys: colKeys >= 0 ? String(row[colKeys] || '') : '',
      speakers: colSpeakers >= 0 ? String(row[colSpeakers] || '') : '',
      keyboardType: colKeyboardType >= 0 ? String(row[colKeyboardType] || '') : '',
      accompaniment: colAccompaniment >= 0 ? String(row[colAccompaniment] || '') : '',
      category: colCategory >= 0 ? String(row[colCategory] || '') : '',
      type: colType >= 0 ? String(row[colType] || '') : '',
      url: colUrl >= 0 ? String(row[colUrl] || '') : ''
    });
  }
  return models;
}

function findColumn_(headers, possibleNames) {
  for (var i = 0; i < possibleNames.length; i++) {
    var needle = possibleNames[i].toLowerCase();
    var idx = headers.indexOf(needle);
    if (idx >= 0) return idx;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] && headers[j].indexOf(needle) !== -1) return j;
    }
  }
  return -1;
}

function filterModels_(models, goal, budget, format, needBuiltInSounds, speakers, accompaniment) {
  var budgetRanges = {
    'xlow': [0, 20000], 'low': [20000, 50000], 'mid': [50000, 90000], 'high': [90000, 99999999]
  };
  var goalCategories = {
    'hobby': ['синтезатор'],
    'learning': ['цифровое пианино'],
    'production': ['midi-клавиатура', 'midi', 'рабочая станция'],
    'stage': ['сценический синтезатор', 'сценическое пианино', 'синтезатор'],
    'allinone': ['синтезатор', 'рабочая станция', 'цифровое пианино']
  };
  var formatMatch = {
    'hammer': ['молот', '88', 'фортепианн', 'рояльн'],
    'synth': ['синт', 'органн', 'полувзвеш', 'невзвеш']
  };
  var range = budgetRanges[budget] || budgetRanges['low'];
  var categories = goalCategories[goal] || goalCategories['hobby'];
  // FIX: при format=hammer добавляем 'цифровое пианино' к категориям,
  // т.к. молоточковая клавиатура = цифровое пианино, даже если goal=hobby
  if (format === 'hammer' && categories.indexOf('цифровое пианино') === -1) {
    categories = categories.concat(['цифровое пианино']);
  }
  var formatKeys = formatMatch[format] || [];
  var result = [];
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var match = true;
    if (m.priceNum > 0 && (m.priceNum < range[0] || m.priceNum > range[1])) match = false;
    if (match && m.category) {
      var catLower = norm_(m.category);
      var catMatch = false;
      for (var c = 0; c < categories.length; c++) {
        if (catLower.indexOf(categories[c]) !== -1) { catMatch = true; break; }
      }
      if (!catMatch) match = false;
    }
    if (match && formatKeys.length > 0) {
      var ktLower2 = norm_(m.keyboardType);
      // При format=hammer: если тип клавиатуры пустой, проверяем категорию
      // Если категория "Синтезатор" — это не молоточковая, отбраковываем
      if (ktLower2.length === 0) {
        var catForKt = norm_(m.category);
        var nameForKt = norm_(m.fullName + ' ' + m.name);
        if (format === 'hammer') {
          // Отбраковываем синтезаторы по категории, но ИСКЛЮЧАЕМ DGX-640/650
          // (синтезаторы с молоточковой клавиатурой и автоаккомпанементом)
          if (catForKt.indexOf('синтезатор') !== -1 && catForKt.indexOf('цифровое пианино') === -1) {
            if (nameForKt.indexOf('dgx') === -1) match = false;
          }
        }
        if (format === 'synth') {
          if (catForKt.indexOf('цифровое пианино') !== -1) match = false;
        }
      } else {
        var ktMatch2 = false;
        for (var k2 = 0; k2 < formatKeys.length; k2++) {
          if (ktLower2.indexOf(formatKeys[k2]) !== -1) { ktMatch2 = true; break; }
        }
        if (!ktMatch2) match = false;
      }
    }
    if (match && accompaniment === 'yes' && m.accompaniment) {
      var hasAccomp = norm_(m.accompaniment).indexOf('да') !== -1;
      if (!hasAccomp) match = false;
    }
    // FIX: при accompaniment=no — исключаем модели С автоаккомпанементом
    if (match && accompaniment === 'no' && m.accompaniment) {
      var hasAccompNo = norm_(m.accompaniment).indexOf('да') !== -1;
      if (hasAccompNo) match = false;
    }
    if (match) result.push(m);
  }
  // Прогрессивная релаксация: если мало моделей, ослабляем фильтры по очереди
  if (result.length < 3) {
    // Уровень 1: снимаем бюджетный фильтр, оставляем категорию + тип клавиатуры
    var relaxed1 = [];
    for (var j = 0; j < models.length; j++) {
      var rm = models[j];
      var rMatch = true;
      if (rm.category) {
        var rCatLower = norm_(rm.category);
        var rCatMatch = false;
        for (var rc = 0; rc < categories.length; rc++) {
          if (rCatLower.indexOf(categories[rc]) !== -1) { rCatMatch = true; break; }
        }
        if (!rCatMatch) rMatch = false;
      }
      // FIX: применяем ту же логику типа клавиатуры что и в основном фильтре
      if (rMatch && formatKeys.length > 0) {
        var rKtLower = norm_(rm.keyboardType);
        if (rKtLower.length === 0) {
          var rCatForKt = norm_(rm.category);
          if (format === 'hammer' && rCatForKt.indexOf('синтезатор') !== -1 && rCatForKt.indexOf('цифровое пианино') === -1) rMatch = false;
          if (format === 'synth' && rCatForKt.indexOf('цифровое пианино') !== -1) rMatch = false;
        } else {
          var rKtMatch = false;
          for (var rk = 0; rk < formatKeys.length; rk++) {
            if (rKtLower.indexOf(formatKeys[rk]) !== -1) { rKtMatch = true; break; }
          }
          if (!rKtMatch) rMatch = false;
        }
      }
      if (rMatch) relaxed1.push(rm);
    }
    if (relaxed1.length > result.length) result = relaxed1;
  }
  // Уровень 2: снимаем фильтр типа клавиатуры, НО при format=hammer
  // всё равно отбраковываем модели с явным типом "синтезаторная"
  if (result.length < 3) {
    var relaxed2 = [];
    for (var j2 = 0; j2 < models.length; j2++) {
      var rm2 = models[j2];
      var rMatch2 = true;
      if (rm2.category) {
        var rCatLower2 = norm_(rm2.category);
        var rCatMatch2 = false;
        for (var rc2 = 0; rc2 < categories.length; rc2++) {
          if (rCatLower2.indexOf(categories[rc2]) !== -1) { rCatMatch2 = true; break; }
        }
        if (!rCatMatch2) rMatch2 = false;
      }
      // При format=hammer: отбраковываем синтезаторы по типу, категории ИЛИ fullName
      if (rMatch2 && format === 'hammer') {
        var rKtFinal = norm_(rm2.keyboardType);
        var rCatFinal = norm_(rm2.category);
        var rNameFinal = norm_(rm2.fullName + ' ' + rm2.name);
        if (rKtFinal.indexOf('синт') !== -1) rMatch2 = false;
        if (rCatFinal.indexOf('синтезатор') !== -1 && rCatFinal.indexOf('цифровое пианино') === -1) rMatch2 = false;
        // Если в названии есть "синтезатор" — это не молоточковая
        if (rNameFinal.indexOf('синтезатор') !== -1 && rNameFinal.indexOf('пианино') === -1) rMatch2 = false;
      }
      // При format=synth: отбраковываем молоточковые по типу, категории ИЛИ fullName
      if (rMatch2 && format === 'synth') {
        var rKtFinal2 = norm_(rm2.keyboardType);
        var rCatFinal2 = norm_(rm2.category);
        var rNameFinal2 = norm_(rm2.fullName + ' ' + rm2.name);
        if (rKtFinal2.indexOf('молот') !== -1) rMatch2 = false;
        if (rCatFinal2.indexOf('цифровое пианино') !== -1) rMatch2 = false;
        if (rNameFinal2.indexOf('цифровое пианино') !== -1 || rNameFinal2.indexOf('молоточковая') !== -1) rMatch2 = false;
      }
      if (rMatch2) relaxed2.push(rm2);
    }
    if (relaxed2.length > result.length) result = relaxed2;
  }
  return result.slice(0, 3);
}

function adjustBudgetGAS_(goal, experience, budget) {
  if (experience === 'beginner' && (goal === 'production' || goal === 'stage') && budget === 'high') {
    return 'mid';
  }
  if (experience === 'advanced' && budget !== 'high') {
    var order = ['xlow', 'low', 'mid', 'high'];
    var i = order.indexOf(budget);
    if (i >= 0 && i < order.length - 1) return order[i + 1];
  }
  return budget;
}

function determineTypeGAS_(goal, format, budget, accompaniment) {
  var types = {
    hobby: { type: 'Обучающий синтезатор', summary: 'Для домашнего старта и первых шагов.', why: ['Простота важнее студийных функций.', 'Встроенные динамики для дома.', 'Автоаккомпанемент полезен.'] },
    learning: { type: 'Цифровое пианино', summary: '88 клавиш, молоточковая механика для обучения.', why: ['Правильная механика.', '88 клавиш — полный диапазон.', 'Подходит для постановки техники.'] },
    production: { type: 'MIDI-клавиатура', summary: 'Контроллер для компьютера и цифровой студии.', why: ['Цифровая студия важнее встроенных звуков.', 'Дешевле и гибче.', 'Компактный формат.'] },
    stage: { type: 'Сценический синтезатор', summary: 'Тембры и удобство для выступлений.', why: ['Сценический сегмент.', 'Концертные тембры.', 'Внешняя акустика нормальна.'] },
    allinone: { type: 'Универсальный инструмент', summary: 'Один инструмент под разные задачи.', why: ['Понятный и гибкий.', 'Покрывает дом и творчество.', 'Баланс универсальности.'] }
  };
  // FIX: hobby + hammer (mid/high) = цифровое пианино (как в quiz-engine.js)
  if (goal === 'hobby' && format === 'hammer') {
    return {
      type: 'Цифровое пианино',
      summary: 'Молоточковая механика для домашних занятий.',
      why: ['Молоточковая механика для фортепианной техники.', '88 клавиш — полный диапазон.', 'Подходит для домашних занятий.']
    };
  }
  if (goal === 'stage' && format === 'hammer') {
    return {
      type: 'Сценическое пианино',
      summary: 'Молоточковая клавиатура и качественные тембры рояля для выступлений.',
      why: ['Молоточковая механика для пианистического репертуара.', 'Сценический запас по звуку.', 'Подходит для джаза, классики, камерных выступлений.']
    };
  }
  if (goal === 'learning' && format === 'synth' && accompaniment === 'yes') {
    return {
      type: 'Обучающий синтезатор',
      summary: 'Синтезаторная клавиатура с ритмами и аккомпанементом для освоения музыки.',
      why: ['Для аккомпанемента нужен синтезатор, не цифровое пианино.', 'Ритмы и тембры для творческого старта.', 'Автоаккомпанемент — оркестр под руками.']
    };
  }
  if (goal === 'production') {
    return {
      type: 'Рабочая станция',
      summary: 'Самостоятельный инструмент со встроенными звуками для продакшена.',
      why: ['Встроенные звуки без отдельного модуля.', 'Работа и без компьютера, и с DAW.', 'Сегмент для начинающего продакшна.']
    };
  }
  var t = types[goal] || types.hobby;
  return t;
}

function buildWarningsGAS_(goal, experience, budget, accompaniment, format) {
  var warnings = [];
  if (experience === 'advanced' && budget !== 'high') {
    warnings.push('Для вашего уровня может быть интересен более высокий сегмент.');
  }
  if (experience === 'beginner' && (goal === 'production' || goal === 'stage') && budget === 'high') {
    warnings.push('Для начинающего этот сегмент может быть избыточным.');
  }
  if (goal === 'learning' && format === 'synth' && accompaniment === 'yes') {
    warnings.push('Для обучения фортепианной технике нужна молоточковая клавиатура. Этот синтезатор лучше подходит для базового освоения и первых шагов в изучении музыки.');
  }
  if (goal === 'learning' && format === 'hammer' && accompaniment === 'yes') {
    warnings.push('Для обучения игре на фортепиано автоаккомпанемент — вторичная функция. Главное: молоточковая механика и 88 клавиш. Не все цифровые пианино имеют ритмы.');
  }
  return warnings;
}

function buildAccessoriesGAS_(goal, format, budget) {
  var accessories = [
    { name: 'Блок питания', status: 'included' },
    { name: 'Педаль', status: goal === 'learning' || goal === 'stage' ? 'included' : 'separate' },
    { name: 'Стойка', status: 'separate' },
    { name: 'Подставка для нот (пюпитр)', status: 'included' }
  ];
  if (goal === 'production') {
    accessories = [
      { name: 'USB-кабель', status: 'included' },
      { name: 'Педаль', status: 'separate' },
      { name: 'Звуковая карта', status: 'separate' }
    ];
  }
  return accessories;
}

function computeRealPriceGAS_(models, accessories) {
  if (!models || models.length === 0) return '';
  var prices = models.map(function(m) {
    return parseInt(String(m.price || '0').replace(/[^\d]/g, ''), 10) || 0;
  });
  var minModel = Math.min.apply(null, prices);
  var maxModel = Math.max.apply(null, prices);
  var missingCost = 0;
  var estimates = {
    'Блок питания': 1500, 'Педаль': 2500, 'Педаль (тройная)': 5000,
    'Стойка': 5000, 'Подставка для нот (пюпитр)': 800, 'USB-кабель': 500,
    'Звуковая карта': 8000, 'Чехол': 4000
  };
  for (var i = 0; i < accessories.length; i++) {
    if (accessories[i].status !== 'included') {
      missingCost += estimates[accessories[i].name] || 0;
    }
  }
  var min = minModel + missingCost;
  var max = maxModel + missingCost;
  return formatPriceGAS_(min) + '–' + formatPriceGAS_(max);
}

function formatPriceGAS_(num) {
  return num.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
}

function test_createPayment() {
  var result = createPaymentFromQuiz_({
    goal: 'learning', budget: 'low', amount: 29900, experience: 'beginner'
  });
  Logger.log(JSON.stringify(result));
}

function test_verify() {
  var result = verifyPaymentServer_('klv_test123');
  Logger.log(JSON.stringify(result));
}