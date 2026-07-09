# План интеграции ЮKassa

## Почему ЮKassa вместо Tinkoff
- ✅ Работает с самозанятыми **без ИП** (Tinkoff требует ИП/ООО)
- ✅ Приём карт, СБП, ЮMoney
- ✅ Простая авторизация: HTTP Basic Auth (shopId:secretKey)
- ✅ Webhook с JSON

## Ключевые отличия от Tinkoff

| Параметр | Tinkoff | ЮKassa |
|----------|---------|--------|
| Авторизация | TerminalKey + SHA-256 подпись | Shop ID + Secret Key (Basic Auth) |
| Создание платежа | POST /v2/Init | POST /v3/payments |
| Сумма | Копейки (29900) | Рубли ("299.00") |
| Webhook | form-urlencoded, ответ "OK" | JSON, ответ 200 |
| Проверка | POST /v2/GetState | GET /v3/payments/{id} |
| Статус успеха | CONFIRMED | succeeded |
| Idempotency | Нет | Idempotence-Key header |

## Файлы

| Файл | Статус |
|------|--------|
| `yookassa_backend.gs` | ✅ Создан (полная замена tinkoff_backend.gs) |
| `index.html` | ✅ Обновлён (3 упоминания Tinkoff → ЮKassa) |
| `terms.html` | ✅ Обновлён (пункт 4.3) |
| `tinkoff_backend.gs` | Оставлен как архив (не используется) |

## Script Properties (Apps Script)

Удалить старые:
- ~~`TINKOFF_TERMINAL_KEY`~~
- ~~`TINKOFF_SECRET_KEY`~~

Добавить новые:
- `YUKASSA_SHOP_ID` = ваш_shop_id
- `YUKASSA_SECRET_KEY` = ваш_secret_key

## Шаги развёртывания

1. Зарегистрироваться на https://yookassa.ru
   - Самозанятый, ИНН 272322019546
   - Сайт: https://klaviron.ru
2. Получить Shop ID и Secret Key
3. Скопировать код из `yookassa_backend.gs` в редактор Apps Script
4. Переразвернуть Web App (Execute as: Me, Access: Anyone)
5. Вставить ключи в Script Properties:
   - `YUKASSA_SHOP_ID` = shop_id
   - `YUKASSA_SECRET_KEY` = secret_key
6. Настроить webhook в личном кабинете ЮKassa:
   - URL: `https://script.google.com/macros/s/AKfycbyfFLVPQQXOVvhrQaXHSufbKr37WVW4fFArIVwHP3Hp_zEQRSskuIELHIHAQDLss5H1/exec`
   - События: `payment.succeeded`, `payment.canceled`
7. Включить `PAYMENT_ENABLED = true` в `index.html`
8. Тестовая оплата 299 ₽
9. Git commit + push

## Точка отката
```bash
git tag v1.0-stable  # на коммите f6e68bf
git reset --hard v1.0-stable