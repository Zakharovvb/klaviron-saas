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
  // ЮKassa шлёт webhook как JSON
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

/**
 * === ЮKASSA — СОЗДАНИЕ ПЛАТЕЖА ===
 */

/**
 * Создаёт платёж в ЮKassa.
 * Вызывается с фронтенда: ?action=createpayment&goal=hobby&budget=low&amount=29900
 *
 * Возвращает: { ok: true, paymentUrl: 'https://...', orderId: '...' }
 */
function createPaymentFromQuiz_(params) {
  var goal = norm_(params.goal || 'hobby');
  var budget = norm_(params.budget || 'low');
  var amount = Number(params.amount || 29900); // в копейках! 299 ₽ = 29900
  var amountRub = (amount / 100).toFixed(2);   // ЮKassa ждёт рубли: "299.00"

  // Генерируем order_id
  var orderId = 'klv_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);

  // Сохраняем заказ в таблицу
  saveOrder_(orderId, goal, budget, amount, params);

  // Создаём платёж в ЮKassa
  var payment = yookassaCreatePayment_(orderId, amountRub, DESCRIPTION_, getSuccessUrl_(orderId));

  if (payment && payment.confirmation && payment.confirmation.confirmation_url) {
    // Сохраняем payment_id от ЮKassa
    updateOrderPaymentId_(orderId, payment.id);
    return { ok: true, orderId: orderId, paymentUrl: payment.confirmation.confirmation_url };
  }

  return { ok: false, error: (payment && payment.description) || 'Payment creation failed' };
}

var DESCRIPTION_ = 'Подбор клавишного инструмента — расширенный каталог';

/**
 * ЮKassa Create Payment API
 * https://yookassa.ru/developers/api#create_payment
 */
function yookassaCreatePayment_(orderId, amountRub, description, returnUrl) {
  var shopId = getProp_('YUKASSA_SHOP_ID');
  var secretKey = getProp_('YUKASSA_SECRET_KEY');

  if (!shopId || !secretKey) {
    // DEV-режим — без реального платежа
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
    amount: {
      value: amountRub,
      currency: 'RUB'
    },
    confirmation: {
      type: 'redirect',
      return_url: returnUrl
    },
    description: description,
    metadata: {
      order_id: orderId,
      source: 'klaviron'
    }
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

  var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments', options);
  return JSON.parse(resp.getContentText());
}

/**
 * === ЮKASSA WEBHOOK ===
 */

/**
 * Обработка webhook от ЮKassa
 * ЮKassa присылает: { event: "payment.succeeded", object: { id, status, metadata, ... } }
 */
function handleYookassaWebhook_(params) {
  var event = String(params.event || '');
  var paymentObj = params.object || {};
  var paymentId = String(paymentObj.id || '');
  var status = String(paymentObj.status || '');

  // Достаём order_id из metadata
  var orderId = String((paymentObj.metadata && paymentObj.metadata.order_id) || paymentId);

  log_('Webhook: event=' + event + ' order=' + orderId + ' status=' + status);

  if (event === 'payment.succeeded' || status === 'succeeded') {
    updateOrderStatus_(orderId, 'succeeded', paymentId);
  } else if (event === 'payment.canceled' || status === 'canceled') {
    updateOrderStatus_(orderId, 'canceled', paymentId);
  } else if (event === 'payment.waiting_for_capture' || status === 'waiting_for_capture') {
    updateOrderStatus_(orderId, 'waiting_for_capture', paymentId);
  }

  // Отвечаем 200 — ЮKassa требует HTTP 200
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * === ВЕРИФИКАЦИЯ ПЛАТЕЖА ===
 */

/**
 * Проверяет оплату по order_id.
 * Сначала смотрит в таблицу orders, потом спрашивает ЮKassa напрямую.
 */
function verifyPaymentServer_(orderId) {
  if (!orderId) return { ok: false };

  // 1. Проверяем в таблице
  var order = findOrder_(orderId);
  if (order && (order.status === 'succeeded')) {
    return { ok: true, token: orderId, status: order.status };
  }

  // 2. Если есть ключи — спрашиваем ЮKassa напрямую
  var shopId = getProp_('YUKASSA_SHOP_ID');
  var secretKey = getProp_('YUKASSA_SECRET_KEY');
  if (shopId && secretKey && order && order.paymentId) {
    var payment = yookassaGetPayment_(order.paymentId, shopId, secretKey);
    if (payment && payment.status === 'succeeded') {
      updateOrderStatus_(orderId, 'succeeded', payment.id);
      return { ok: true, token: orderId, status: 'succeeded' };
    }
  }

  // 3. DEV-режим (без ключей) — считаем оплаченным
  if (!shopId || !secretKey) {
    return { ok: true, token: orderId, status: 'DEV' };
  }

  return { ok: false };
}

/**
 * ЮKassa Get Payment API
 * https://yookassa.ru/developers/api#get_payment
 */
function yookassaGetPayment_(paymentId, shopId, secretKey) {
  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(shopId + ':' + secretKey)
    },
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(YUKASSA_API + 'payments/' + paymentId, options);
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

/**
 * === ВСПОМОГАТЕЛЬНЫЕ ===
 */

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
    price: 29900, // копейки
    priceLabel: '299 ₽',
    successUrl: 'https://klaviron.ru/?payment=ok',
    failUrl: 'https://klaviron.ru/?payment=fail'
  };
}

function log_(msg) {
  Logger.log(msg);
}

function norm_(s) { return String(s || '').trim().toLowerCase(); }
function normHeader_(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * === КВИЗ: ПРЕВЬЮ-РЕЗУЛЬТАТ (бесплатно) ===
 * Читает Google Sheets, фильтрует по ответам квиза, возвращает type+summary+why+warnings.
 * Модели НЕ возвращает (они в платной части).
 *
 * Вызов: ?action=previewResult&goal=learning&budget=low&format=hammer&...
 */

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

/**
 * === КВИЗ: ПЛАТНЫЙ РЕЗУЛЬТАТ (после оплаты) ===
 * Возвращает модели + accessories + realPrice.
 * Вызов: ?action=paidresult&goal=learning&budget=low&format=hammer&...&order_id=klv_xxx
 */
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
      return { name: m.name || '', price: m.price || '' };
    }),
    accessories: accessories,
    realPrice: realPrice,
    why: typeInfo.why,
    warnings: warnings
  };
}

/**
 * === HTML лендинга (заглушка) ===
 */
function getHtml_() {
  return '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=https://klaviron.ru/"></head><body>Redirecting to <a href="https://klaviron.ru/">klaviron.ru</a></body></html>';
}

/**
 * === Чтение каталога из Google Sheets ===
 */
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
  var colPrice = findColumn_(headers, ['цена', 'price']);
  var colKeys = findColumn_(headers, ['клавиши', 'количество клавиш']);
  var colSpeakers = findColumn_(headers, ['динамики', 'встроенные динамики']);
  var colKeyboardType = findColumn_(headers, ['тип клавиатуры', 'клавиатура']);
  var colAccompaniment = findColumn_(headers, ['автоаккомпанемент', 'аккомпанемент', 'ритмы']);
  var colType = findColumn_(headers, ['тип', 'категория']);
  var colGoal = findColumn_(headers, ['цель', 'назначение']);
  var colBudget = findColumn_(headers, ['бюджет', 'сегмент']);

  var models = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[colName] && !row[0]) continue;

    models.push({
      name: colName >= 0 ? String(row[colName] || '') : String(row[0] || ''),
      price: colPrice >= 0 ? String(row[colPrice] || '') : '',
      keys: colKeys >= 0 ? String(row[colKeys] || '') : '',
      speakers: colSpeakers >= 0 ? String(row[colSpeakers] || '') : '',
      keyboardType: colKeyboardType >= 0 ? String(row[colKeyboardType] || '') : '',
      accompaniment: colAccompaniment >= 0 ? String(row[colAccompaniment] || '') : '',
      type: colType >= 0 ? String(row[colType] || '') : '',
      goal: colGoal >= 0 ? String(row[colGoal] || '') : '',
      budget: colBudget >= 0 ? String(row[colBudget] || '') : ''
    });
  }

  return models;
}

function findColumn_(headers, possibleNames) {
  for (var i = 0; i < possibleNames.length; i++) {
    var idx = headers.indexOf(possibleNames[i].toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * === Фильтрация моделей ===
 */
function filterModels_(models, goal, budget, format, needBuiltInSounds, speakers, accompaniment) {
  var result = [];

  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var match = true;

    if (accompaniment === 'yes') {
      var hasAccomp = norm_(m.accompaniment).indexOf('да') !== -1 || norm_(m.accompaniment).indexOf('yes') !== -1;
      if (!hasAccomp) match = false;
    }

    if (format === 'hammer') {
      var isHammer = norm_(m.keyboardType).indexOf('молот') !== -1 || norm_(m.keyboardType).indexOf('88') !== -1;
      if (!isHammer && m.keyboardType) match = false;
    }

    if (match) result.push(m);
  }

  return result.slice(0, 2);
}

/**
 * === Корректировка бюджета ===
 */
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

/**
 * === Определение типа ===
 */
function determineTypeGAS_(goal, format, budget, accompaniment) {
  var types = {
    hobby: { type: 'Обучающий синтезатор', summary: 'Для домашнего старта и первых шагов.', why: ['Простота важнее студийных функций.', 'Встроенные динамики для дома.', 'Автоаккомпанемент полезен.'] },
    learning: { type: 'Цифровое пианино', summary: '88 клавиш, молоточковая механика для обучения.', why: ['Правильная механика.', '88 клавиш — полный диапазон.', 'Подходит для постановки техники.'] },
    production: { type: 'MIDI-клавиатура', summary: 'Контроллер для компьютера и цифровой студии.', why: ['Цифровая студия важнее встроенных звуков.', 'Дешевле и гибче.', 'Компактный формат.'] },
    stage: { type: 'Сценический синтезатор', summary: 'Тембры и удобство для выступлений.', why: ['Сценический сегмент.', 'Концертные тембры.', 'Внешняя акустика нормальна.'] },
    allinone: { type: 'Универсальный инструмент', summary: 'Один инструмент под разные задачи.', why: ['Понятный и гибкий.', 'Покрывает дом и творчество.', 'Баланс универсальности.'] }
  };

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

/**
 * === Warnings ===
 */
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

/**
 * === Accessories ===
 */
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

/**
 * === Расчёт realPrice ===
 */
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

/**
 * === ТЕСТОВЫЕ ФУНКЦИИ ===
 */

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