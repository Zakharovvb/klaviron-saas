## 16.07.2026 — GAS v4-v8: filterModels + SberPay capture + payment_id fix

### Коммиты:
- `1e84746` — fix: заглавные С в quiz-engine + QUIZ_LOGIC_MAP
- `e37c026` — feat: GAS v4 — filterModels + 3 модели + url + fullName
- `6ec738b` — feat: renderModels — кликабельные ссылки
- `a7e6a7c` — feat: GAS v5 — stage+hammer=Сценическое пианино
- `1db3471` — feat: GAS v6 — createpayment работает! 12/13
- `1c30396` — feat: GAS v7 — SberPay capture
- `8a75a55` — fix: GAS v8 — payment_id fix + fallback

### Текущий GAS endpoint (v8):
```
https://script.google.com/macros/s/AKfycbx6z89grXttEeFwqU0mMJw_9qKBoZLEDhQ_8lMgooPQRBFQBIoHlsa2RFv5bnoegByT/exec
```

### Verify проверен — работает:
```json
{"ok":true,"token":"klv_dc79b6d47a914559","status":"succeeded"}
```

### Что осталось:
1. Обновить webhook в ЮKassa на v8 URL
2. Тест на klaviron.ru с Ctrl+F5
3. Проверить handlePaymentReturn() — order_id в URL