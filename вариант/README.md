# QuizEngine v1.0 — эталонная реализация по ТЗ 1.1

## Что внутри

| Файл | Назначение |
|---|---|
| `quiz-engine.js` | Сам движок: логика выбора результата + адаптивные шаги |
| `quiz-engine.test.js` | 27 автотестов, прогоняются через `node quiz-engine.test.js` |

## Запуск тестов

```bash
cd klaviron-quiz-engine
node quiz-engine.test.js
```

Ожидаемый итог: `ИТОГО: 27 прошло, 0 упало`.

## Публичный API

```js
// Подключение (браузер):
// <script src="quiz-engine.js"></script>
// или в существующем <script>:</script>

const result = QuizEngine.pickResult({
  goal: 'hobby',
  experience: 'beginner',
  format: 'synth',
  needBuiltInSounds: 'yes',
  speakers: 'yes',
  accompaniment: 'dontcare',
  budget: 'low'
});

// result.id              — стабильный ключ ситуации, например "hobby_synth_low"
// result.type            — название типа ("Обучающий синтезатор")
// result.summary         — описание (1-2 предложения)
// result.tradeoff        — "X в ущерб Y" (если применимо)
// result.models          — [{ name, price }]
// result.accessories     — [{ name, status: 'included'|'separate'|'missing' }]
// result.realPrice       — "26 000–40 490 ₽" (рассчитано автоматически)
// result.realPriceMin/Max — числа для сортировки/фильтрации
// result.why             — массив строк, почему этот тип
// result.nextSteps       — что докупить / проверить
// result.upgradePath     — что брать следующим при росте бюджета
// result.budgetAdjusted  — { field, from, to, reason } | null
// result.contextWarnings — мягкие подсказки по выбранной комбинации

const steps = QuizEngine.getStepsForGoal('production');
// ['goal', 'experience', 'needBuiltInSounds', 'budget'] — только 4 шага
```

## Что починено относительно v2

| Bug v2 | Что было | Что стало |
|---|---|---|
| **B1** | Тип «Цифровое пианино / сценическое пианино» при портативных моделях | Тип = «Цифровое пианино с расширенной комплектацией», модели Yamaha P-225 + Roland FP-30X |
| **B2** | Stage+speakers=yes+low → warning в финале | Полноценный тип `stage_synth_low`, никаких warning |
| **B3** | `format` для production/stage задаётся, но игнорируется | Для production шаг `format` скрыт (4 шага вместо 7). Для stage — показывается и влияет (молоточковая vs синтезаторная сцена) |
| **B4** | `needBuiltInSounds` для learning не спрашивался | Теперь спрашивается (learner получит «кнопки MIDI» → это подсказка, что нужны базовые тембры) |
| **B5** | `accompaniment` мёртв | Активно влияет на тип в hobby/learning/allinone |
| **B6** | `accompaniment: yes` для stage даёт warning | Шаг `accompaniment` для stage не показывается вовсе |
| **B8** | Experience-warning не менял тип | `adjustBudgetByExperience` сдвигает `budget`, тип пересчитывается. Поле `budgetAdjusted` явно показывает, что было скорректировано |
| **B10** | Мёртвые ветки каталога | Каталог перестроен: каждая ситуация имеет свой ключ, нет «дыр» |
| **B12** | `realPrice` не бьётся с моделями | Рассчитывается автоматически как `min/max(моделей) + missing-аксессуары` |
| **B14** | `accompaniment: dontcare` нигде не учитывался | Контекстная интерпретация в `pickHobby` и `pickAllInOne` |
| **B18** | Warning «может, цифровое пианино?» при уже выданном цифровом | Убран: контекст теперь — часть самого `pickResult`, не отдельный warning |
| **B19** | `realPrice` одинаковый для mid/high в inline-ветке | Рассчитывается автоматически, диапазон реально разный |
| **B20** | Warning по перенаправленному goal | `pickResult` принимает исходный goal пользователя, никаких редиректов |

## Новые ситуации в каталоге

Раньше было 17 плоских записей в `localCatalog[goal][budget]`. Стало **22 ситуации** с явными ключами:

```
hobby_synth_xlow        hobby_synth_low        hobby_synth_mid
hobby_synth_high

learning_piano_compromise   learning_piano_basic  learning_piano_mid
learning_piano_high

production_midi_xlow   production_midi_low   production_midi_mid
production_workstation_entry   production_workstation_high

stage_synth_xlow       stage_synth_low       stage_synth_mid
stage_synth_high       stage_synth_premium
stage_piano_xlow       stage_piano_low       stage_piano_mid
stage_piano_high

allinone_universal_xlow  allinone_universal_low
allinone_focus_piano     allinone_workstation_mid
allinone_workstation_no_accomp  allinone_workstation_high
```

## Что НЕ менялось (out of scope)

- Визуал квиза, шаги в HTML, пейволл (`PAYMENT_ENABLED = false`)
- API контракт с GAS (только параметры — не поля результата)
- Каталог моделей как таковой (модели и цены перенесены as-is из v2, кроме нескольких моделей в stage/learning, которые ранее отсутствовали в каталоге, но логически нужны — например, Yamaha CP88/CP73 для молоточковой сцены)

## Как встроить в существующий `klaviron_v2.html`

1. Скопировать `quiz-engine.js` в репозиторий (например, `/js/quiz-engine.js`).
2. Подключить `<script src="/js/quiz-engine.js"></script>` перед основным `<script>`.
3. В `submitQuiz` заменить вызов `pickLocalResult(payload)` на `QuizEngine.pickResult(payload)`.
4. Изменить `renderResult` так, чтобы он читал новые поля: `result.tradeoff`, `result.nextSteps`, `result.upgradePath`, `result.budgetAdjusted`, `result.contextWarnings`. Старые поля (`type`, `summary`, `models`, `accessories`, `realPrice`, `why`) остались на месте.
5. При показе шагов использовать `QuizEngine.getStepsForGoal(currentGoal)` для расчёта актуального списка и счётчика «Шаг N из M».
6. Прогнать smoke-тест: `node quiz-engine.test.js` должно дать 27/27.

## Известные ограничения

- `format` сейчас в `pickHobby` для `mid/high` берёт `learning_piano_mid` — то есть хобби с молоточковой механикой = цифровое пианино. Это намеренное упрощение: можно завести отдельные `hobby_piano_mid` / `hobby_piano_high` ситуации с другими аксессуарами (фокус на «поиграть дома», а не «учиться»), если потребуется.
- `accompanying: dontcare` для hobby/allinone трактуется как `yes` (по умолчанию ожидаем ритмы). Это можно сделать конфигурируемым.
- `getStepsForGoal` пока не учитывает, что `needBuiltInSounds` мог бы быть пропущен для отдельных сценариев (например, если для learning пользователь явно выбрал `yes`, можно переспросить только если ответил `no`). Это — улучшение на следующую итерацию.
- Модели в `MODELS` частично дублируются между ситуациями (например, Korg Kross 2 фигурирует в `production_workstation_entry` и `allinone_workstation_mid`). Это нормально для каталога, но при правке цен нужно менять в нескольких местах — TODO: вынести модели в общий пул.