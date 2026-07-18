# Cline Context — КлавирON
# Файл для восстановления состояния Cline на другой машине
# Последнее обновление: 18.07.2026, GAS v9

## ПРОМПТ ДЛЯ НОВОЙ СЕССИИ (скопируй в Cline на новой машине):

```
Открой проект klaviron-saas. Прочитай файл CLINE_CONTEXT.md — там полное состояние проекта.
Текущая задача: тест оплаты end-to-end на klaviron.ru (GAS v9 развёрнут, createpayment работает).
Если DNS error вернётся — добавить retry-логику или мигрировать на Yandex Cloud Functions.
Точка отката: git tag v1.0-stable (git reset --hard v1.0-stable).
```

---

## 1. ПРОЕКТ

- **Название:** КлавирON (klaviron-saas)
- **Папка:** `C:\Users\ф\Yandex.Disk\Документы\Код\VS cod\Cline\klaviron-saas`
- **GAS папка:** `C:\Users\ф\Desktop\klaviron-gas`
- **Домен:** https://klaviron.ru (GitHub Pages, custom domain)
- **Backup:** https://klaviron.github.io
- **Описание:** Лендинг + квиз для подбора клавишных инструментов. Платный результат 299 ₽ через ЮKassa.

## 2. ТЕКУЩЕЕ СОСТОЯНИЕ (GAS v11, коммит pending)

### Что готово:
- ✅ Stage 1: Адаптивные шаги квиза (production=4, stage=6, остальные=7)
- ✅ Stage 2: QuizEngine v1.0 интегрирован (22 ситуации, B1-B20 починены)
- ✅ Fix: learning + accompaniment=yes логика (29/29 тестов)
- ✅ GAS-бэкенд полный: getPreviewResult_ + getPaidResult_ + getHtml_
- ✅ Столбец J в Google Sheets переименован: «Автоаккомпанемент» (да/нет)
- ✅ Домен klaviron.ru делегирован (HTTP работает, HTTPS ждёт SSL)
- ✅ ЮKassa: ключи получены, бэкенд развёрнут, PAYMENT_ENABLED=true
- ✅ Security: XSS-1-6 + PAY-3 исправлены (аудит безопасности)
- ✅ GAS v9: API URL исправлен (api.yookassa.ru), try-catch для DNS error
- ✅ createpayment работает (платёж создаётся, redirect на ЮKassa)
- ✅ 3 модели из Google Sheets с ценами и ссылками
- ✅ renderModels: кликабельные ссылки + fullName
- ✅ stage+hammer = Сценическое пианино
- ✅ SberPay capture (waiting_for_capture → автоматически подтверждает)
- ✅ Fallback в verify: поиск по order_id через GET /payments?limit=20

### Что осталось:
- ⏳ Тест оплаты end-to-end на klaviron.ru
- ⏳ Обновить webhook в ЮKassa на v9 URL
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
├── yookassa_backend.gs      # GAS-бэкенд: платежи + превью + платный результат (v9)
├── terms.html              # Оферта (реквизиты, 299₽, yookassa)
├── privacy.html            # Политика конфиденциальности
├── ИСТОРИЯ_ПРОЕКТА.md      # Полная история коммитов и решений
├── PLAN_YOOKASSA.md         # План интеграции yookassa (9 шагов)
├── REKVIZITY.md            # Реквизиты самозанятого
├── CLINE_CONTEXT.md        # Этот файл
├── CNAME                   # klaviron.ru
├── README.md
├── test-gas-api.js         # Тесты GAS (13 тестов)
└── вариант/                # Эталонная реализация (источник)
    ├── quiz-engine.js      # Синхронизирован с корневым
    ├── quiz-engine.test.js # 29 тестов
    └── README.md           # Документация движка

klaviron-gas/ (Desktop)
├── Код.js                  # GAS-бэкенд (синхронизирован с yookassa_backend.gs)
├── appsscript.json         # Настройки Apps Script
└── .clasp.json             # Конфигурация clasp
```

## 4. АРХИТЕКТУРА

### Фронтенд (index.html):
- Tailwind CSS (CDN)
- `quiz-engine.js` — статический движок квиза (fallback)
- GAS API — `previewResult` для превью, fallback на `QuizEngine.pickResult()`
- `PAYMENT_ENABLED = true` — paywall активен
- Новые поля результата: `tradeoff`, `nextSteps`, `upgradePath`
- API_URL: `https://script.google.com/macros/s/AKfycbximr0HnMHTOULfVeYabOrSuduXZv8CwBrsHAfl6zi4w5ZoHX-WW6qRkpulXXwJvtk/exec` (v9)

### Бэкенд (yookassa_backend.gs / Код.js → Google Apps Script):
- `doGet` — роутинг: config, previewResult, paidResult, verify, createPayment
- `getPreviewResult_` — читает Google Sheets, фильтрует, возвращает type+summary+why+warnings
- `getPaidResult_` — возвращает модели+accessories+realPrice (после оплаты)
- `createPaymentFromQuiz_` — создание платежа yookassa
- `handleYookassaWebhook_` — webhook от yookassa
- `verifyPaymentServer_` — проверка оплаты (прямая + fallback по order_id)
- `readCatalogFromSheet_` — чтение Google Sheets (динамический поиск колонок)
- `yookassaCapturePayment_` — подтверждение платежа (SberPay)
- `yookassaFindPaymentByOrderId_` — поиск платежа по order_id в metadata
- **try-catch** во всех функциях с UrlFetchApp.fetch (DNS error protection)

### Google Sheets:
- **ID:** `1fBwrXb1DU-5iMjfEeiuzWBXA85XczWLXZM3Ag_LVCVE`
- **Лист:** gid=1303803798
- **Столбцы:** Модель, Цена, Клавиши, Динамики, Тип клавиатуры, Автоаккомпанемент (J)

### GAS API:
- **Endpoint (v9):** `https://script.google.com/macros/s/AKfycbximr0HnMHTOULfVeYabOrSuduXZv8CwBrsHAfl6zi4w5ZoHX-WW6qRkpulXXwJvtk/exec`
- **Actions:** previewResult, paidResult, createpayment, verify, config
- **Script ID:** `1pJq9E8g2E57pB9EG2XXQvmJfFrsbjQkJNncxH8duoY1Vm2LFM0I_a1xd`

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
```

### Теги:
- `v1.0-stable` — точка отката (коммит f6e68bf)

## 7. ТЕСТЫ

```bash
node вариант/quiz-engine.test.js
# Ожидаемый результат: ИТОГО: 29 прошло, 0 упало

node test-gas-api.js
# Тесты GAS (13 тестов)
```

## 8. GAS DEPLOYMENTS

| Version | Deployment ID | Status |
|---------|---------------|--------|
| HEAD | AKfycbzfF43... | Не работает как Web App |
| v1 | AKfycbzHinm... | Устарел (Tinkoff) |
| v2 | AKfycbyYL5C... | Устарел (без фикса цен) |
| v3 | AKfycbxvNFB... | Устарел |
| v8 | AKfycbx6z89gr... | Устарел (DNS error, yoomoney.ru) |
| **v9** | **AKfycbximr0HnMHTOULfVeYabOrSuduXZv8CwBrsHAfl6zi4w5ZoHX-WW6qRkpulXXwJvtk** | **Актуальный** |

## 9. СЛЕДУЮЩИЕ ШАГИ

1. Тест оплаты end-to-end на klaviron.ru:
   - Пройти квиз → оплатить 299 ₽ → проверить redirect
   - Если webhook не пришёл → проверить в логах GAS (Stackdriver)
   - Если verify возвращает `ok: false` → проверить orders в Google Sheets
2. Обновить webhook в ЮKassa на v9 URL
3. Если DNS error вернётся — миграция на Yandex Cloud Functions

## 10. ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ

- `quiz-engine.js`: `format` для hobby mid/high берёт `learning_piano_mid` — можно завести отдельные
- `accompaniment: dontcare` для hobby/allinone трактуется как `yes`
- `getStepsForGoal` не учитывает, что `needBuiltInSounds` можно пропустить
- Модели в `MODELS` дублируются между ситуациями — TODO: вынести в общий пул

## 11. НОВЫЕ ПОЛЯ РЕЗУЛЬТАТА КВИЗА

| Поле | Тип | Описание | HTML-блок |
|------|-----|----------|-----------|
| `type` | string | Тип инструмента | `#result-type` |
| `summary` | string | Описание (1-2 предложения) | `#result-summary` |
| `models` | array | [{name, fullName, price, url}] | `#result-models-wrap` |
| `accessories` | array | [{name, status}] | `#result-accessories-wrap` |
| `realPrice` | string | "26 000–40 490 ₽" | `#result-price-wrap` |
| `why` | array | Почему этот тип | `#result-why-wrap` |
| `warnings` | array | На что обратить внимание | `#result-warnings-wrap` |
| `tradeoff` | string | "X в ущерб Y" | `#result-tradeoff-wrap` (жёлтая плашка) |
| `nextSteps` | array | Что докупить | `#result-next-steps-wrap` |
| `upgradePath` | string | Что брать следующим | `#result-upgrade-wrap` (голубая плашка) |