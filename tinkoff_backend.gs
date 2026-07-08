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

  // Корректировка бюджета по опыту
  var adjustedBudget = adjustBudgetGAS_(goal, experience, budget);

  // Получаем все модели из таблицы
  var allModels = readCatalogFromSheet_();

  // Фильтруем по критериям
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

  // Берём первую подходящую модель для определения типа
  var firstModel = filtered[0];

  // Определяем тип по goal + format
  var typeInfo = determineTypeGAS_(goal, format, adjustedBudget, accompaniment);

  // Формируем warnings
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

  // Корректировка бюджета
  var adjustedBudget = adjustBudgetGAS_(goal, experience, budget);

  // Читаем и фильтруем модели
  var allModels = readCatalogFromSheet_();
  var filtered = filterModels_(allModels, goal, adjustedBudget, format, needBuiltInSounds, speakers, accompaniment);

  // Формируем accessories на основе goal
  var accessories = buildAccessoriesGAS_(goal, format, adjustedBudget);

  // Считаем realPrice
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
 * === HTML лендинга (заглушка — лендинг на GitHub Pages) ===
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

  // Ищем лист по gid или по имени
  var sheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === SHEET_CATALOG_GID) {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) sheet = sheets[0]; // fallback на первый лист

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });

  // Определяем колонки по заголовкам
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
 * === Фильтрация моделей по критериям квиза ===
 */
function filterModels_(models, goal, budget, format, needBuiltInSounds, speakers, accompaniment) {
  var result = [];

  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var match = true;

    // Фильтр по аккомпанементу (столбец J — «Автоаккомпанемент»)
    if (accompaniment === 'yes') {
      var hasAccomp = norm_(m.accompaniment).indexOf('да') !== -1 || norm_(m.accompaniment).indexOf('yes') !== -1;
      if (!hasAccomp) match = false;
    } else if (accompaniment === 'no') {
      // Для "no" — не фильтруем строго, оставляем все
      // (логика "no" обрабатывается на уровне выбора типа)
    }

    // Фильтр по типу клавиатуры (если указан)
    if (format === 'hammer') {
      var isHammer = norm_(m.keyboardType).indexOf('молот') !== -1 || norm_(m.keyboardType).indexOf('88') !== -1;
      if (!isHammer && m.keyboardType) match = false;
    } else if (format === 'synth') {
      var isSynth = norm_(m.keyboardType).indexOf('синт') !== -1 || norm_(m.keyboardType).indexOf('орган') !== -1;
      // Не фильтруем строго — синтезаторная может быть не указана
    }

    if (match) result.push(m);
  }

  // Ограничиваем до 2 моделей (как в quiz-engine.js)
  return result.slice(0, 2);
}

/**
 * === Корректировка бюджета по опыту (GAS-версия) ===
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
 * === Определение типа инструмента (GAS-версия) ===
 */
function determineTypeGAS_(goal, format, budget, accompaniment) {
  // Базовые типы по goal
  var types = {
    hobby: { type: 'Обучающий синтезатор', summary: 'Для домашнего старта и первых шагов.', why: ['Простота важнее студийных функций.', 'Встроенные динамики для дома.', 'Автоаккомпанемент полезен.'] },
    learning: { type: 'Цифровое пианино', summary: '88 клавиш, молоточковая механика для обучения.', why: ['Правильная механика.', '88 клавиш — полный диапазон.', 'Подходит для постановки техники.'] },
    production: { type: 'MIDI-клавиатура', summary: 'Контроллер для компьютера и цифровой студии.', why: ['Цифровая студия важнее встроенных звуков.', 'Дешевле и гибче.', 'Компактный формат.'] },
    stage: { type: 'Сценический синтезатор', summary: 'Тембры и удобство для выступлений.', why: ['Сценический сегмент.', 'Концертные тембры.', 'Внешняя акустика нормальна.'] },
    allinone: { type: 'Универсальный инструмент', summary: 'Один инструмент под разные задачи.', why: ['Понятный и гибкий.', 'Покрывает дом и творчество.', 'Баланс универсальности.'] }
  };

  // Особый случай: learning + synth + accompaniment=yes → синтезатор
  if (goal === 'learning' && format === 'synth' && accompaniment === 'yes') {
    return {
      type: 'Обучающий синтезатор',
      summary: 'Синтезаторная клавиатура с ритмами и аккомпанементом для освоения музыки.',
      why: ['Для аккомпанемента нужен синтезатор, не цифровое пианино.', 'Ритмы и тембры для творческого старта.', 'Автоаккомпанемент — оркестр под руками.']
    };
  }

  // Особый случай: production + needBuiltInSounds=yes → рабочая станция
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
 * === Формирование warnings (GAS-версия) ===
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
    warnings.push('Для обучения фортепианной технике нужна молоточковая клавиатура. Этот синтезатор лучше подходит для освоения ритмов и аккомпанемента.');
  }
  if (goal === 'learning' && format === 'hammer' && accompaniment === 'yes') {
    warnings.push('Для обучения автоаккомпанемент — вторичная функция. Главное: молоточковая механика и 88 клавиш. Не все цифровые пианино имеют ритмы.');
  }

  return warnings;
}

/**
 * === Формирование accessories (GAS-версия) ===
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
 * === Расчёт realPrice (GAS-версия) ===
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