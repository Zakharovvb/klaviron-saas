# Карта логики квиза КлавирON

## Шаги квиза по целям (goal)

| Goal | Шаги | Кол-во |
|------|------|--------|
| **hobby** | goal → experience → format → needBuiltInSounds → speakers → accompaniment → budget | 7 |
| **learning** | goal → experience → format → needBuiltInSounds → speakers → accompaniment → budget | 7 |
| **production** | goal → experience → needBuiltInSounds → budget | 4 |
| **stage** | goal → experience → format → needBuiltInSounds → speakers → budget | 6 |
| **allinone** | goal → experience → format → needBuiltInSounds → speakers → accompaniment → budget | 7 |

## Корректировка бюджета по опыту (experience)

| Experience | Goal | Budget | → Effective | Причина |
|------------|------|--------|-------------|---------|
| beginner | production/stage | high | **mid** | Для начинающего high избыточен |
| advanced | любой | xlow | **low** | С вашим уровнем — сегмент повыше |
| advanced | любой | low | **mid** | С вашим уровнем — сегмент повыше |
| advanced | любой | mid | **high** | С вашим уровнем — сегмент повыше |
| beginner | hobby/learning/allinone | high | high | Не корректируется |
| intermediate | любой | любой | без изменений | — |

---

## HOBBY (Хобби и домашняя игра) — 7 шагов

### Ветвление:
```
format=hammer + budget=mid/high → ЦИФРОВОЕ ПИАНИНО
format=synth (или hammer+xlow/low) → ОБУЧАЮЩИЙ СИНТЕЗАТОР
```

| # | format | accompaniment | budget | → Ситуация | Тип | Модели |
|---|--------|---------------|--------|------------|-----|--------|
| H1 | synth | * | xlow | `hobby_synth_xlow` | Обучающий синтезатор | Casio CT-S300 (18 500 ₽), Yamaha PSR-E373 (32 990 ₽) |
| H2 | synth | * | low | `hobby_synth_low` | Обучающий синтезатор | Yamaha PSR-SX600 (99 990 ₽), Casio CT-X700 (28 000 ₽) |
| H3 | synth | * | mid | `hobby_synth_mid` | Обучающий синтезатор высокого класса | Yamaha PSR-SX700 (130 000 ₽), Casio CT-X5000 (57 900 ₽) |
| H4 | synth | * | high | `hobby_synth_high` | Синтезатор-аранжировщик высокого класса | Yamaha PSR-SX900 (200 000 ₽), Korg PA700 (120 000 ₽) |
| H5 | hammer | * | mid | `learning_piano_mid` ⚡ | Цифровое пианино | Roland FP-10 (44 000 ₽), Yamaha P-225 (80 000 ₽) |
| H6 | hammer | * | high | `learning_piano_mid` ⚡ | Цифровое пианино | Roland FP-10 (44 000 ₽), Yamaha P-225 (80 000 ₽) |
| H7 | hammer | * | xlow | `hobby_synth_xlow` | Обучающий синтезатор | Casio CT-S300 (18 500 ₽), Yamaha PSR-E373 (32 990 ₽) |
| H8 | hammer | * | low | `hobby_synth_low` | Обучающий синтезатор | Yamaha PSR-SX600 (99 990 ₽), Casio CT-X700 (28 000 ₽) |

> ⚡ = берёт ситуацию из learning (молоточковая механика = цифровое пианино)
> `accompaniment` для hobby не меняет результат (yes/dontcare = yes)

---

## LEARNING (Обучение) — 7 шагов

### Ветвление:
```
format=synth + budget=xlow → КОМПРОМИСС (синтезатор как старт)
format=synth + accompaniment=yes → СИНТЕЗАТОР (не цифровое пианино!) + warning
format=hammer + accompaniment=yes → ЦИФРОВОЕ ПИАНИНО + warning про аккомпанемент
needBuiltInSounds=no → ЦИФРОВОЕ ПИАНИНО (базовый) + warning
иначе → ЦИФРОВОЕ ПИАНИНО по бюджету
```

| # | format | accompaniment | needSounds | budget | → Ситуация | Тип | Модели |
|---|--------|---------------|------------|--------|------------|-----|--------|
| L1 | synth | * | * | xlow | `learning_piano_compromise` | Базовый клавишный старт | Yamaha PSR-E373 (32 990 ₽), Casio CT-S300 (18 500 ₽) |
| L2 | synth | yes | * | low | `hobby_synth_low` ⚡ + ⚠️ | Обучающий синтезатор | Yamaha PSR-SX600 (99 990 ₽), Casio CT-X700 (28 000 ₽) |
| L3 | synth | yes | * | mid | `hobby_synth_mid` ⚡ + ⚠️ | Обучающий синтезатор высокого класса | Yamaha PSR-SX700 (130 000 ₽), Casio CT-X5000 (57 900 ₽) |
| L4 | synth | yes | * | high | `hobby_synth_high` ⚡ + ⚠️ | Синтезатор-аранжировщик | Yamaha PSR-SX900 (200 000 ₽), Korg PA700 (120 000 ₽) |
| L5 | hammer | yes | * | xlow | `learning_piano_compromise` + ⚠️ | Базовый клавишный старт | Yamaha PSR-E373 (32 990 ₽), Casio CT-S300 (18 500 ₽) |
| L6 | hammer | yes | * | low | `learning_piano_basic` + ⚠️ | Цифровое пианино (базовый) | Casio CDP-S110 (42 000 ₽), Yamaha P-145 (37 000 ₽) |
| L7 | hammer | yes | * | mid | `learning_piano_mid` + ⚠️ | Цифровое пианино | Roland FP-10 (44 000 ₽), Yamaha P-225 (80 000 ₽) |
| L8 | hammer | yes | * | high | `learning_piano_high` + ⚠️ | Цифровое пианино высокого класса | Kawai ES120 (85 000 ₽), Roland FP-30X (72 000 ₽) |
| L9 | hammer | no/dontcare | no | * | `learning_piano_basic` + ⚠️ | Цифровое пианино (базовый) | Casio CDP-S110 (42 000 ₽), Yamaha P-145 (37 000 ₽) |
| L10 | hammer | no/dontcare | yes | xlow | `learning_piano_compromise` | Базовый клавишный старт | Yamaha PSR-E373 (32 990 ₽), Casio CT-S300 (18 500 ₽) |
| L11 | hammer | no/dontcare | yes | low | `learning_piano_basic` | Цифровое пианино (базовый) | Casio CDP-S110 (42 000 ₽), Yamaha P-145 (37 000 ₽) |
| L12 | hammer | no/dontcare | yes | mid | `learning_piano_mid` | Цифровое пианино | Roland FP-10 (44 000 ₽), Yamaha P-225 (80 000 ₽) |
| L13 | hammer | no/dontcare | yes | high | `learning_piano_high` | Цифровое пианино высокого класса | Kawai ES120 (85 000 ₽), Roland FP-30X (72 000 ₽) |

> ⚡ = берёт ситуацию из hobby (синтезатор с аккомпанементом ≠ цифровое пианино)
> ⚠️ = warning: «Для обучения фортепианной технике нужна молоточковая клавиатура...»
> ⚠️ = warning: «Для обучения игре на фортепиано автоаккомпанемент — вторичная функция...»

---

## PRODUCTION (Создание музыки / звукозапись) — 4 шага

### Ветвление:
```
needBuiltInSounds=no → MIDI-КЛАВИАТУРА
needBuiltInSounds=yes + xlow/low → РАБОЧАЯ СТАНЦИЯ (начального уровня)
needBuiltInSounds=yes + mid/high → РАБОЧАЯ СТАНЦИЯ (высокого уровня)
```

| # | needSounds | budget | → Ситуация | Тип | Модели |
|---|------------|--------|------------|-----|--------|
| P1 | no | xlow | `production_midi_xlow` | Компактная MIDI-клавиатура | Arturia MiniLab 3 (13 500 ₽), M-Audio Keystation Mini 32 (7 500 ₽) |
| P2 | no | low | `production_midi_low` | MIDI-клавиатура | Novation Launchkey 49 MK3 (25 000 ₽), Arturia KeyLab Essential 49 (30 500 ₽) |
| P3 | no | mid | `production_midi_mid` | Продвинутая MIDI-клавиатура | Native Instruments Komplete Kontrol S49 (59 990 ₽), Arturia KeyLab MKII 49 (62 990 ₽) |
| P4 | no | high | `production_midi_mid` ⚡ | Продвинутая MIDI-клавиатура | Native Instruments Komplete Kontrol S49 (59 990 ₽), Arturia KeyLab MKII 49 (62 990 ₽) |
| P5 | yes | xlow | `production_workstation_entry` | Рабочая станция начального уровня | Korg Kross 2 (65 000 ₽), Roland Juno-DS61 (80 000 ₽) |
| P6 | yes | low | `production_workstation_entry` | Рабочая станция начального уровня | Korg Kross 2 (65 000 ₽), Roland Juno-DS61 (80 000 ₽) |
| P7 | yes | mid | `production_workstation_high` | Рабочая станция | Korg Krome EX (124 000 ₽), Yamaha MODX6+ (120 000 ₽) |
| P8 | yes | high | `production_workstation_high` | Рабочая станция | Korg Krome EX (124 000 ₽), Yamaha MODX6+ (120 000 ₽) |

> ⚡ = high → mid для MIDI (нет отдельного high-сегмента)

---

## STAGE (Выступления) — 6 шагов

### Ветвление:
```
format=hammer → СЦЕНИЧЕСКОЕ ПИАНИНО (по бюджету)
format=synth + needBuiltInSounds=no → ПРЕМИУМ (mid/high) или базовый (xlow/low)
format=synth + needBuiltInSounds=yes → СЦЕНИЧЕСКИЙ СИНТЕЗАТОР (по бюджету)
```

| # | format | needSounds | budget | → Ситуация | Тип | Модели |
|---|--------|------------|--------|------------|-----|--------|
| S1 | hammer | * | xlow | `stage_piano_xlow` | Компромиссное сценическое пианино | Yamaha P-145 (37 000 ₽), Roland FP-10 (44 000 ₽) |
| S2 | hammer | * | low | `stage_piano_low` | Сценическое пианино (базовый) | Kawai ES120 (85 000 ₽), Roland FP-30X (72 000 ₽) |
| S3 | hammer | * | mid | `stage_piano_mid` | Сценическое пианино | Roland RD-88 (96 990 ₽), Yamaha CP73 (140 000 ₽) |
| S4 | hammer | * | high | `stage_piano_high` | Профессиональное сценическое пианино | Yamaha CP88 (180 000 ₽), Kawai MP11SE (210 000 ₽) |
| S5 | synth | no | xlow | `stage_synth_xlow` | Компромиссный сценический старт | Casio CT-X700 (28 000 ₽), Yamaha PSR-EW310 (55 990 ₽) |
| S6 | synth | no | low | `stage_synth_low` | Сценический синтезатор (базовый) | Korg Kross 2 61 (65 000 ₽), Roland Juno-DS61 (80 000 ₽) |
| S7 | synth | no | mid | `stage_synth_premium` | Сценический синтезатор премиум | Yamaha MODX8+ (150 000 ₽), Korg Kronos (220 000 ₽) |
| S8 | synth | no | high | `stage_synth_premium` | Сценический синтезатор премиум | Yamaha MODX8+ (150 000 ₽), Korg Kronos (220 000 ₽) |
| S9 | synth | yes | xlow | `stage_synth_xlow` | Компромиссный сценический старт | Casio CT-X700 (28 000 ₽), Yamaha PSR-EW310 (55 990 ₽) |
| S10 | synth | yes | low | `stage_synth_low` | Сценический синтезатор (базовый) | Korg Kross 2 61 (65 000 ₽), Roland Juno-DS61 (80 000 ₽) |
| S11 | synth | yes | mid | `stage_synth_mid` | Сценический синтезатор | Roland Juno-DS76 (95 000 ₽), Yamaha MODX7+ (130 000 ₽) |
| S12 | synth | yes | high | `stage_synth_high` | Профессиональный сценический синтезатор | Yamaha MODX8+ (150 000 ₽), Korg Kronos (220 000 ₽) |

---

## ALL-IN-ONE (Один инструмент на всё) — 7 шагов

### Ветвление:
```
format=hammer + budget=mid/high → ЦИФРОВОЕ ПИАНИНО (фокус на фортепиано)
accompaniment=no → УНИВЕРСАЛЬНЫЙ (xlow/low) или РАБОЧАЯ СТАНЦИЯ без аккомпанемента (mid/high)
accompaniment=yes/dontcare → УНИВЕРСАЛЬНЫЙ (xlow/low) или РАБОЧАЯ СТАНЦИЯ (mid/high)
```

| # | format | accompaniment | budget | → Ситуация | Тип | Модели |
|---|--------|---------------|--------|------------|-----|--------|
| A1 | hammer | * | mid | `allinone_focus_piano` | Цифровое пианино (расширенная комплектация) | Yamaha P-225 (80 000 ₽), Roland FP-30X (72 000 ₽) |
| A2 | hammer | * | high | `allinone_focus_piano` | Цифровое пианино (расширенная комплектация) | Yamaha P-225 (80 000 ₽), Roland FP-30X (72 000 ₽) |
| A3 | synth | no | xlow | `allinone_universal_xlow` | Стартовый универсальный клавишный | Casio CT-S300 (18 500 ₽), Yamaha PSR-E373 (32 990 ₽) |
| A4 | synth | no | low | `allinone_universal_low` | Универсальный домашний инструмент | Casio CT-X3000 (40 000 ₽), Yamaha PSR-EW425 (75 500 ₽) |
| A5 | synth | no | mid | `allinone_workstation_no_accomp` | Рабочая станция с фокусом на звук | Yamaha MODX6+ (120 000 ₽), Korg Krome EX (124 000 ₽) |
| A6 | synth | no | high | `allinone_workstation_no_accomp` | Рабочая станция с фокусом на звук | Yamaha MODX6+ (120 000 ₽), Korg Krome EX (124 000 ₽) |
| A7 | synth | yes/dontcare | xlow | `allinone_universal_xlow` | Стартовый универсальный клавишный | Casio CT-S300 (18 500 ₽), Yamaha PSR-E373 (32 990 ₽) |
| A8 | synth | yes/dontcare | low | `allinone_universal_low` | Универсальный домашний инструмент | Casio CT-X3000 (40 000 ₽), Yamaha PSR-EW425 (75 500 ₽) |
| A9 | synth | yes/dontcare | mid | `allinone_workstation_mid` | Рабочая станция начального уровня | Korg Kross 2 (59 990 ₽), Roland Juno-DS61 (80 000 ₽) |
| A10 | synth | yes/dontcare | high | `allinone_workstation_high` | Рабочая станция | Korg Krome EX (124 000 ₽), Yamaha MODX6+ (120 000 ₽) |

---

## Сводка: 22 уникальные ситуации

| Goal | Ситуаций | Типы инструментов |
|------|----------|-------------------|
| hobby | 4 (×2 с hammer) | Обучающий синтезатор, Цифровое пианино |
| learning | 8 | Базовый старт, Синтезатор, Цифровое пианино |
| production | 4 | MIDI-клавиатура, Рабочая станция |
| stage | 8 | Сценическое пианино, Сценический синтезатор |
| allinone | 6 | Универсальный, Цифровое пианино, Рабочая станция |
| **Итого** | **22** | **6 типов** |

## Поля с доп. данными

| Поле | Что содержит | Пример |
|------|-------------|--------|
| `tradeoff` | Компромисс (не у всех) | «экономия сейчас vs риск потери интереса» |
| `upgradePath` | Путь развития (не у всех) | «Через 6-12 месяцев — Casio CDP-S110, Yamaha P-145» |
| `nextSteps` | Что делать дальше (массив) | — |
| `budgetAdjusted` | Изменение бюджета | `{from: 'high', to: 'mid', reason: '...'}` |
| `contextWarnings` | Контекстные предупреждения | «Для обучения нужна молоточковая...» |

## Тесты: 29/29 ✅