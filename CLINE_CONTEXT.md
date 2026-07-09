# Cline Context — КлавирON
# Файл для восстановления состояния Cline на другой машине
# Последнее обновление: 08.07.2026, коммит fc1aeb3

## ПРОМПТ ДЛЯ НОВОЙ СЕССИИ (скопируй в Cline на новой машине):

```
Открой проект klaviron-saas. Прочитай файл CLINE_CONTEXT.md — там полное состояние проекта.
Текущая задача: после получения ключей ЮKassa — скопировать код из yookassa_backend.gs
в Apps Script, переразвернуть Web App, вставить ключи в Script Properties,
включить PAYMENT_ENABLED=true в index.html и протестировать оплату.
Точка отката: git tag v1.0-stable (git reset --hard v1.0-stable).
```

---

## 1. ПРОЕКТ

- **Название:** КлавирON (klaviron-saas)
- **Папка:** `C:\Users\user\Yandex.Disk\Документы\Код\VS cod\Cline\klaviron-saas`
- **Домен:** https://klaviron.ru (GitHub Pages, custom domain)
- **Backup:** https://klaviron.github.io
- **Описание:** Лендинг + квиз для подбора клавишных инструментов. Платный результат 299 ₽ через ЮKassa.

## 2. ТЕКУЩЕЕ СОСТОЯНИЕ (коммит 245cdff)

### Что готово:
- ✅ Stage 1: Адаптивные шаги квиза (production=4, stage=6, остальные=7)
- ✅ Stage 2: QuizEngine v1.0 интегрирован (22 ситуации, B1-B20 починены)
- ✅ Fix: learning + accompaniment=yes логика (29/29 тестов)
- ✅ GAS-бэкенд полный: getPreviewResult_ + getPaidResult_ + getHtml_
- ✅ Столбец J в Google Sheets переименован: «Автоаккомпанемент» (да/нет)
- ✅ Домен klaviron.ru делегирован (HTTP работает, HTTPS ждёт SSL)
- ✅ ЮKassa: шаги 0-6 готовы (бэкенд, оферта, футер, paywall DEV-режим)
- ✅ Security: XSS-1-6 + PAY-3 исправлены (аудит безопасности)

### Что осталось:
- ⏳ Шаг 7: Регистрация в ЮKassa → получить Shop ID + Secret Key
- ❌ Шаг 8: Тестирование оплаты
- ❌ Шаг 9: Деплой в продакшен (PAYMENT_ENABLED=true)
- ⏳ HTTPS: дождаться SSL от GitHub, обновить canonical/og:url на https://klaviron.ru/

### Точка отката:
```bash
git tag v1.0-stable  # на коммите f6e68bf
git reset --hard v1.0-stable  # откат
```

## 3. СТРУКТУРА ФАЙЛОВ

```
klaviron-saas/
├── index.html              # Лендинг + квиз (основной файл)
├── quiz-engine.js          # Движок квиза (22 ситуации, 29 тестов)
├── yookassa_backend.gs      # GAS-бэкенд: платежи + превью + платный результат
├── terms.html              # Оферта (реквизиты, 299₽, yookassa)
├── privacy.html            # Политика конфиденциальности
├── ИСТОРИЯ_ПРОЕКТА.md      # Полная история коммитов и решений
├── PLAN_YOOKASSA.md         # План интеграции yookassa (9 шагов)
├── REKVIZITY.md            # Реквизиты самозанятого
├── CLINE_CONTEXT.md        # Этот файл
├── CNAME                   # klaviron.ru
├── README.md
└── вариант/                # Эталонная реализация (источник)
    ├── quiz-engine.js      # Синхронизирован с корневым
    ├── quiz-engine.test.js # 29 тестов
    └── README.md           # Документация движка
```

## 4. АРХИТЕКТУРА

### Фронтенд (index.html):
- Tailwind CSS (CDN)
- `quiz-engine.js` — статический движок квиза (fallback)
- GAS API — `previewResult` для превью, fallback на `QuizEngine.pickResult()`
- `PAYMENT_ENABLED = false` — paywall выключен (DEV-режим)
- Новые поля результата: `tradeoff`, `nextSteps`, `upgradePath`

### Бэкенд (yookassa_backend.gs → Google Apps Script):
- `doGet` — роутинг: config, previewResult, paidResult, verify, createPayment
- `getPreviewResult_` — читает Google Sheets, фильтрует по столбцу J, возвращает type+summary+why+warnings
- `getPaidResult_` — возвращает модели+accessories+realPrice (после оплаты)
- `createPaymentFromQuiz_` — создание платежа yookassa
- `handleyookassaWebhook_` — webhook от yookassa
- `verifyPaymentServer_` — проверка оплаты
- `readCatalogFromSheet_` — чтение Google Sheets (динамический поиск колонок)

### Google Sheets:
- **ID:** `1fBwrXb1DU-5iMjfEeiuzWBXA85XczWLXZM3Ag_LVCVE`
- **Лист:** gid=1303803798
- **Столбцы:** Модель, Цена, Клавиши, Динамики, Тип клавиатуры, Автоаккомпанемент (J)
- **Столбец J переименован:** «Ритмы» → «Автоаккомпанемент» (заполнен да/нет)

### GAS API:
- **Endpoint:** `https://script.google.com/macros/s/AKfycbyfFLVPQQXOVvhrQaXHSufbKr37WVW4fFArIVwHP3Hp_zEQRSskuIELHIHAQDLss5H1/exec`
- **Actions:** previewResult, paidResult, createpayment, verify, config

## 5. РЕКВИЗИТЫ

- **ФИО:** Захаров Василий Борисович
- **ИНН:** 272322019546
- **Регион:** Хабаровский край
- **E-mail:** zakharov0073@yandex.ru
- **Самозанятый (НПД)** — ООО не нужно
- **Цена:** 299 ₽ (29900 копеек)
- **Счёт в Т-Банке:** есть

## 6. GIT

### Remotes:
- `origin` → https://github.com/zakharovvb/klaviron-saas.git (backup)
- `org` → https://github.com/klaviron/klaviron.github.io.git (основной)

### Команды:
```bash
git push origin main  # backup
git push org main     # основной
git push origin v1.0-stable  # тег
git push org v1.0-stable
```

### Теги:
- `v1.0-stable` — точка отката (коммит f6e68bf)

## 7. ТЕСТЫ

```bash
node вариант/quiz-engine.test.js
# Ожидаемый результат: ИТОГО: 29 прошло, 0 упало
```

## 8. СЛЕДУЮЩИЕ ШАГИ (после ключей yookassa)

1. Зайти на https://www.yookassa.ru/kassa/
2. Авторизоваться по паспорту/Т-Банк ID
3. Указать: самозанятый, ИНН 272322019546
4. Указать сайт: https://klaviron.ru
5. Получить Shop ID + Secret Key
6. Вставить ключи в Script Properties (Apps Script):
   - `YUKASSA_SHOP_ID` = terminal_key
   - `YUKASSA_SECRET_KEY` = secret_key
7. Скопировать код из `yookassa_backend.gs` в редактор Apps Script
8. Переразвернуть Web App (Execute as: Me, Access: Anyone)
9. Настроить URLs в yookassa:
   - Success: `https://klaviron.ru/?payment=ok`
   - Fail: `https://klaviron.ru/?payment=fail`
   - Webhook: `https://script.google.com/macros/s/AKfycbyfFLVPQQXOVvhrQaXHSufbKr37WVW4fFArIVwHP3Hp_zEQRSskuIELHIHAQDLss5H1/exec`
10. Включить `PAYMENT_ENABLED = true` в `index.html`
11. Тестовая оплата 299 ₽
12. Git commit + push

## 9. ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ

- `quiz-engine.js`: `format` для hobby mid/high берёт `learning_piano_mid` — можно завести отдельные `hobby_piano_mid/high`
- `accompaniment: dontcare` для hobby/allinone трактуется как `yes`
- `getStepsForGoal` не учитывает, что `needBuiltInSounds` можно пропустить
- Модели в `MODELS` дублируются между ситуациями — TODO: вынести в общий пул
- GAS-функция `filterModels_` сейчас фильтрует только по accompaniment и format, без учёта budget/goal (нужно доработать после теста на реальных данных)

## 10. НОВЫЕ ПОЛЯ РЕЗУЛЬТАТА КВИЗА

| Поле | Тип | Описание | HTML-блок |
|------|-----|----------|-----------|
| `type` | string | Тип инструмента | `#result-type` |
| `summary` | string | Описание (1-2 предложения) | `#result-summary` |
| `models` | array | [{name, price}] | `#result-models-wrap` |
| `accessories` | array | [{name, status}] | `#result-accessories-wrap` |
| `realPrice` | string | "26 000–40 490 ₽" | `#result-price-wrap` |
| `why` | array | Почему этот тип | `#result-why-wrap` |
| `warnings` | array | На что обратить внимание | `#result-warnings-wrap` |
| `tradeoff` | string | "X в ущерб Y" | `#result-tradeoff-wrap` (жёлтая плашка) |
| `nextSteps` | array | Что докупить | `#result-next-steps-wrap` |
| `upgradePath` | string | Что брать следующим | `#result-upgrade-wrap` (голубая плашка) |
| `budgetAdjusted` | object/null | {from, to, reason} | В warnings |
| `contextWarnings` | array | Мягкие подсказки | В warnings |