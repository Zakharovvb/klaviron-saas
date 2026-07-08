// =============================================================================
// KlavirON Quiz Engine v1.0
// Эталонная реализация по ТЗ 1.1
// Подмена: pickLocalResult + ситуации из localCatalog
// =============================================================================

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Утилиты
  // ---------------------------------------------------------------------------

  // "18 500 ₽" -> 18500
  function parsePrice(str) {
    if (typeof str !== 'string') return 0;
    return parseInt(str.replace(/[^\d]/g, ''), 10) || 0;
  }

  // 18500 -> "18 500 ₽"
  function formatPrice(num) {
    return num.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
  }

  function nextBudgetUp(budget) {
    const order = ['xlow', 'low', 'mid', 'high'];
    const i = order.indexOf(budget);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : budget;
  }

  function prevBudgetDown(budget) {
    const order = ['xlow', 'low', 'mid', 'high'];
    const i = order.indexOf(budget);
    return i > 0 ? order[i - 1] : budget;
  }

  // ---------------------------------------------------------------------------
  // 2. Каталог аксессуаров с ориентировочной стоимостью
  // ---------------------------------------------------------------------------

  const ACCESSORY_ESTIMATES = {
    'Блок питания': 1500,
    'Педаль': 2500,
    'Педаль (тройная)': 5000,
    'Стойка': 5000,
    'Подставка для нот (пюпитр)': 800,
    'USB-кабель': 500,
    'Пэды/фейдеры': 0,           // у MIDI-клав в комплекте
    'Пэды/энкодеры': 0,
    'Звуковая карта': 8000,
    'Чехол': 4000
  };

  function computeRealPrice(models, accessories) {
    const prices = models.map(m => parsePrice(m.price));
    const minModel = Math.min(...prices);
    const maxModel = Math.max(...prices);

    const missingCost = accessories
      .filter(a => a.status !== 'included')
      .reduce((sum, a) => sum + (ACCESSORY_ESTIMATES[a.name] || 0), 0);

    const min = minModel + missingCost;
    const max = maxModel + missingCost;
    return { min, max, formatted: formatPrice(min) + '–' + formatPrice(max) };
  }

  // ---------------------------------------------------------------------------
  // 3. Каталог моделей по бюджетам
  // ---------------------------------------------------------------------------

  const MODELS = {
    // --- Hobby ---
    hobby_synth_xlow: {
      type: 'Обучающий синтезатор',
      summary: 'Для домашнего старта и первых шагов без сложной настройки.',
      models: [
        { name: 'Casio CT-S300', price: '18 500 ₽' },
        { name: 'Yamaha PSR-E373', price: '32 990 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Стойка', status: 'missing' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Для хобби важнее простота, чем студийные функции.',
        'Встроенные динамики подходят для дома.',
        'Автоаккомпанемент полезен на старте.'
      ]
    },

    hobby_synth_low: {
      type: 'Обучающий синтезатор',
      summary: 'Хороший баланс для любителя: ритмы, аккомпанемент и более приятная клавиатура.',
      models: [
        { name: 'Yamaha PSR-SX600', price: '99 990 ₽' },
        { name: 'Casio CT-X700', price: '28 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Подставка для нот (пюпитр)', status: 'separate' }
      ],
      why: [
        'Вы хотите играть дома и получать быстрый результат.',
        'Этот класс даёт ритмы, тембры и простую навигацию.',
        'Для хобби он логичнее, чем студийные решения.'
      ]
    },

    hobby_synth_mid: {
      type: 'Обучающий синтезатор высокого класса',
      summary: 'Если нужен более богатый функционал, но без ухода в профессиональную рабочую станцию.',
      models: [
        { name: 'Yamaha PSR-SX700', price: '130 000 ₽' },
        { name: 'Casio CT-X5000', price: '57 900 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Вы остаетесь в домашнем и универсальном сценарии.',
        'Нужны более качественные звуки и расширенные функции.',
        'Это ещё не студийная рабочая станция, а понятный любительский класс.'
      ]
    },

    hobby_synth_high: {
      type: 'Синтезатор-аранжировщик высокого класса',
      summary: 'Для требовательного домашнего использования и расширенного набора функций.',
      models: [
        { name: 'Yamaha PSR-SX900', price: '200 000 ₽' },
        { name: 'Korg PA700', price: '120 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Нужен универсальный инструмент с серьёзным запасом функций.',
        'Есть интерес к богатому аккомпанементу и качественным звукам.',
        'На стыке полупрофессионального и профессионального сегментов.'
      ]
    },

    // --- Learning ---
    learning_piano_compromise: {
      type: 'Базовый клавишный старт',
      summary: 'В этом бюджете полноценного цифрового пианино нет — это компромисс для первых шагов. Для серьёзной техники стоит копить на mid-сегмент.',
      tradeoff: 'экономия сейчас vs риск потери интереса',
      models: [
        { name: 'Yamaha PSR-E373', price: '32 990 ₽' },
        { name: 'Casio CT-S300', price: '18 500 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Полноценная молоточковая механика обычно стоит дороже.',
        'Это временный старт для первых шагов.',
        'Лучше честно понимать ограничения бюджета.'
      ],
      upgradePath: 'Через 6–12 месяцев практики имеет смысл смотреть на цифровое пианино в сегменте 40 000–60 000 ₽ — Casio CDP-S110, Yamaha P-145.'
    },

    learning_piano_basic: {
      type: 'Цифровое пианино с базовым набором тембров',
      summary: 'Лучший вход в обучение: 88 клавиш, молоточковая механика и базовые тембры пианино. Встроенные звуки есть, чтобы можно было играть без компьютера.',
      tradeoff: 'меньше тембров и эффектов vs ниже цена',
      models: [
        { name: 'Casio CDP-S110', price: '42 000 ₽' },
        { name: 'Yamaha P-145', price: '37 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Для обучения важна правильная механика клавиш.',
        'Этот класс лучше подходит для постановки техники.',
        '88 клавиш дают полный диапазон.'
      ]
    },

    learning_piano_mid: {
      type: 'Цифровое пианино',
      summary: 'Комфортный выбор для регулярных занятий и более приятного ощущения игры.',
      models: [
        { name: 'Roland FP-10', price: '44 000 ₽' },
        { name: 'Yamaha P-225', price: '80 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'Вы выбираете именно обучение, а не просто домашнее хобби.',
        'Средний сегмент даёт более приятную механику и звук.',
        'Такой класс лучше для долгой практики.'
      ]
    },

    learning_piano_high: {
      type: 'Цифровое пианино высокого класса',
      summary: 'Сильный выбор для серьёзных занятий, где важны звук, механика и долгий срок использования.',
      models: [
        { name: 'Kawai ES120', price: '85 000 ₽' },
        { name: 'Roland FP-30X', price: '72 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Подставка для нот (пюпитр)', status: 'included' }
      ],
      why: [
        'В этом бюджете уже можно брать серьёзный инструмент надолго.',
        'Клавиатура и звук заметно лучше начального уровня.',
        'Подходит для регулярной практики и роста.'
      ]
    },

    // --- Production ---
    production_midi_xlow: {
      type: 'Компактная MIDI-клавиатура',
      summary: 'Самый логичный старт для работы с ноутбуком и виртуальными инструментами.',
      models: [
        { name: 'Arturia MiniLab 3', price: '13 500 ₽' },
        { name: 'M-Audio Keystation Mini 32', price: '7 500 ₽' }
      ],
      accessories: [
        { name: 'USB-кабель', status: 'included' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Звуковая карта', status: 'separate' }
      ],
      why: [
        'Для звукозаписи важнее цифровая студия и VST, чем встроенные звуки.',
        'Это дешевле и гибче для старта в музыке на компьютере.',
        'Компактный формат удобен для рабочего места.'
      ]
    },

    production_midi_low: {
      type: 'MIDI-клавиатура',
      summary: 'Оптимальный сегмент для домашней звукозаписи и уверенного старта в цифровой студии.',
      models: [
        { name: 'Novation Launchkey 49 MK3', price: '25 000 ₽' },
        { name: 'Arturia KeyLab Essential 49', price: '30 500 ₽' }
      ],
      accessories: [
        { name: 'USB-кабель', status: 'included' },
        { name: 'Пэды/фейдеры', status: 'included' },
        { name: 'Педаль', status: 'separate' }
      ],
      why: [
        'Есть интеграция с цифровой студией и удобное управление.',
        'Это лучше для звукозаписи, чем бытовой синтезатор.',
        'Уровень бюджета уже даёт хороший контроль.'
      ]
    },

    production_midi_mid: {
      type: 'Продвинутая MIDI-клавиатура',
      summary: 'Для серьёзной студийной работы, автоматизации и гибкого управления.',
      models: [
        { name: 'Native Instruments Komplete Kontrol S49', price: '59 990 ₽' },
        { name: 'Arturia KeyLab MKII 49', price: '62 990 ₽' }
      ],
      accessories: [
        { name: 'USB-кабель', status: 'included' },
        { name: 'Пэды/энкодеры', status: 'included' },
        { name: 'Педаль', status: 'separate' }
      ],
      why: [
        'Подходит для студийного контроля и удобной работы с софтом.',
        'Этот уровень даёт лучшее ощущение сборки и управления.',
        'Хорошо подходит для растущих задач в продакшене.'
      ]
    },

    production_workstation_entry: {
      type: 'Рабочая станция начального уровня',
      summary: 'Самостоятельный инструмент со встроенными звуками и возможностью подключения к DAW. Подходит, если вы хотите звуки без отдельного модуля семплов.',
      models: [
        { name: 'Korg Kross 2', price: '65 000 ₽' },
        { name: 'Roland Juno-DS61', price: '80 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' }
      ],
      why: [
        'Встроенные звуки не требуют отдельной инфраструктуры.',
        'Можно работать и без компьютера, и с DAW.',
        'Хороший сегмент для начинающего продакшна.'
      ]
    },

    production_workstation_high: {
      type: 'Рабочая станция',
      summary: 'Полупрофессиональная рабочая станция с серьёзным набором тембров и интеграцией с DAW.',
      models: [
        { name: 'Korg Krome EX', price: '124 000 ₽' },
        { name: 'Yamaha MODX6+', price: '120 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' }
      ],
      why: [
        'Подходит и для сцены, и для студии.',
        'Встроенные звуки высокого класса, не нужен отдельный модуль.',
        'Глубокая интеграция с DAW при подключении.'
      ]
    },

    // --- Stage ---
    stage_synth_xlow: {
      type: 'Компромиссный сценический старт',
      summary: 'Полноценный сценический инструмент в этом бюджете почти недоступен — это временный компромисс.',
      tradeoff: 'цена сейчас vs сценический запас потом',
      models: [
        { name: 'Casio CT-X700', price: '28 000 ₽' },
        { name: 'Yamaha PSR-EW310', price: '55 990 ₽' }
      ],
      accessories: [
        { name: 'Стойка', status: 'missing' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Блок питания', status: 'included' }
      ],
      why: [
        'Для настоящей сцены бюджет обычно должен быть выше.',
        'Это скорее временный вариант для репетиций.',
        'Можно начать, но с пониманием компромиссов.'
      ],
      upgradePath: 'Для регулярных выступлений имеет смысл копить на mid/high — Korg Kross 2 61, Roland Juno-DS61.'
    },

    stage_synth_low: {
      type: 'Сценический синтезатор базового уровня',
      summary: 'Базовый сценический сегмент: тембры, прочный корпус, базовый набор выходов.',
      models: [
        { name: 'Korg Kross 2 61', price: '65 000 ₽' },
        { name: 'Roland Juno-DS61', price: '80 000 ₽' }
      ],
      accessories: [
        { name: 'Стойка', status: 'separate' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Блок питания', status: 'included' }
      ],
      why: [
        'Ваш сценарий — сцена, а не просто дом.',
        'Этот класс даёт более подходящие концертные тембры.',
        'Внешняя акустика здесь нормальна.'
      ]
    },

    stage_synth_mid: {
      type: 'Сценический синтезатор',
      summary: 'Серьёзный сценический инструмент с хорошим набором тембров и удобным управлением.',
      models: [
        { name: 'Roland Juno-DS76', price: '95 000 ₽' },
        { name: 'Yamaha MODX7+', price: '130 000 ₽' }
      ],
      accessories: [
        { name: 'Стойка', status: 'separate' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Уверенный сценический сегмент для регулярных выступлений.',
        'Больше тембров и удобнее управление.',
        'Подходит для клавишника в группе.'
      ]
    },

    stage_synth_high: {
      type: 'Профессиональный сценический синтезатор',
      summary: 'Серьёзный сценический инструмент для опытных клавишников.',
      models: [
        { name: 'Yamaha MODX8+', price: '150 000 ₽' },
        { name: 'Korg Kronos', price: '220 000 ₽' }
      ],
      accessories: [
        { name: 'Стойка', status: 'separate' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Профессиональный сегмент с глубокими возможностями.',
        'Подходит для концертной работы в полном объёме.',
        'Интеграция с внешними модулями при необходимости.'
      ]
    },

    stage_synth_premium: {
      type: 'Сценический синтезатор премиум-класса',
      summary: 'Вы осознанно выбрали путь без встроенных тембров (вероятно, планируете внешние модули семплов) — рекомендуем топовый сегмент с фокусом на интеграцию и управление.',
      tradeoff: 'полная свобода настройки vs необходимость доп. оборудования',
      models: [
        { name: 'Yamaha MODX8+', price: '150 000 ₽' },
        { name: 'Korg Kronos', price: '220 000 ₽' }
      ],
      accessories: [
        { name: 'Стойка', status: 'separate' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Премиум-сегмент для серьёзной сценической работы.',
        'Гибкая интеграция с внешними модулями.',
        'Подходит для сложных сетапов с несколькими источниками звука.'
      ]
    },

    stage_piano_xlow: {
      type: 'Компромиссное сценическое пианино',
      summary: 'Молоточковое сценическое пианино в этом бюджете почти недоступно — компромисс.',
      tradeoff: 'пианинная механика сейчас vs качество звука',
      models: [
        { name: 'Yamaha P-145', price: '37 000 ₽' },
        { name: 'Roland FP-10', price: '44 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' }
      ],
      why: [
        'Для серьёзной сцены с молоточковой механикой нужен бюджет выше.',
        'Это рабочий вариант для небольших площадок.',
        'Можно использовать как основу с планами на апгрейд.'
      ],
      upgradePath: 'Для полноценной сцены — Roland RD-88, Yamaha CP88, Kawai MP11.'
    },

    stage_piano_low: {
      type: 'Сценическое пианино базового уровня',
      summary: 'Базовый молоточковый инструмент сценического класса.',
      models: [
        { name: 'Kawai ES120', price: '85 000 ₽' },
        { name: 'Roland FP-30X', price: '72 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' }
      ],
      why: [
        'Молоточковая механика для пианинного репертуара на сцене.',
        'Подходит для джаза, классики, камерных выступлений.',
        'В этом сегменте уже есть сценический запас.'
      ]
    },

    stage_piano_mid: {
      type: 'Сценическое пианино',
      summary: 'Серьёзный молоточковый инструмент для регулярных выступлений.',
      models: [
        { name: 'Roland RD-88', price: '96 990 ₽' },
        { name: 'Yamaha CP73', price: '140 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль (тройная)', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Профессиональная молоточковая механика.',
        'Сценический запас по звуку и управлению.',
        'Подходит для клавишника в оркестре/джаз-бэнде.'
      ]
    },

    stage_piano_high: {
      type: 'Профессиональное сценическое пианино',
      summary: 'Топовый молоточковый инструмент для серьёзной концертной работы.',
      models: [
        { name: 'Yamaha CP88', price: '180 000 ₽' },
        { name: 'Kawai MP11SE', price: '210 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль (тройная)', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Лучшая молоточковая механика в сценическом сегменте.',
        'Звук приближен к акустическому роялю.',
        'Подходит для профессиональных пианистов на сцене.'
      ]
    },

    // --- All-in-one ---
    allinone_universal_xlow: {
      type: 'Стартовый универсальный клавишный',
      summary: 'В этом бюджете «один инструмент на всё» означает компромисс и базовый домашний формат.',
      tradeoff: 'универсальность сейчас vs качество по каждой задаче',
      models: [
        { name: 'Casio CT-S300', price: '18 500 ₽' },
        { name: 'Yamaha PSR-E373', price: '32 990 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'missing' },
        { name: 'Стойка', status: 'missing' }
      ],
      why: [
        'Бюджет ограничивает глубину универсальности.',
        'На старте важнее взять понятный инструмент, чем всё сразу.',
        'Такой вариант покрывает базовые домашние задачи.'
      ],
      upgradePath: 'Через год — рассматривать mid-сегмент (Casio CT-X3000, Yamaha PSR-EW425).'
    },

    allinone_universal_low: {
      type: 'Универсальный домашний инструмент',
      summary: 'Хороший вариант, если хочется один инструмент для игры, обучения и простого творчества.',
      models: [
        { name: 'Casio CT-X3000', price: '40 000 ₽' },
        { name: 'Yamaha PSR-EW425', price: '75 500 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' }
      ],
      why: [
        'Один инструмент должен быть понятным и гибким.',
        'Этот сегмент покрывает дом, игру и лёгкий креатив.',
        'Баланс универсальности и простоты здесь лучше всего.'
      ]
    },

    allinone_focus_piano: {
      type: 'Цифровое пианино с расширенной комплектацией',
      summary: 'С молоточковой механикой «универсальность» означает приоритет на пианинное ощущение. Студийные функции, автоаккомпанемент и сценический запас здесь вторичны.',
      tradeoff: 'пианинная техника vs сценический запас',
      models: [
        { name: 'Yamaha P-225', price: '80 000 ₽' },
        { name: 'Roland FP-30X', price: '72 000 ₽' }
      ],
      accessories: [
        { name: 'Педаль', status: 'included' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Блок питания', status: 'included' }
      ],
      why: [
        'Вы хотите один инструмент, но именно с пианинным ощущением.',
        'Молоточковая клавиатура важнее синтезаторной универсальности.',
        'Такой выбор честнее отражает ваш сценарий.'
      ]
    },

    allinone_workstation_mid: {
      type: 'Рабочая станция начального уровня',
      summary: 'Один серьёзный инструмент под разные сценарии: звуки, ритмы, секвенсер.',
      models: [
        { name: 'Korg Kross 2', price: '59 990 ₽' },
        { name: 'Roland Juno-DS61', price: '80 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' }
      ],
      why: [
        'Вы ищете один инструмент под разные задачи.',
        'Этот сегмент уже ближе к реальной универсальности.',
        'Он логичнее, чем брать бытовой стартовый синтезатор.'
      ]
    },

    allinone_workstation_no_accomp: {
      type: 'Рабочая станция с фокусом на звук',
      summary: 'Без автоаккомпанемента «универсальность» сужается до «инструмент с расширенным набором тембров». Рекомендуем рабочую станцию с фокусом на звук и секвенсер, а не на ритмы.',
      tradeoff: 'глубина звука vs автоаккомпанемент',
      models: [
        { name: 'Yamaha MODX6+', price: '120 000 ₽' },
        { name: 'Korg Krome EX', price: '124 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'Сильный звуковой арсенал без ритм-машины.',
        'Подходит для самостоятельного творчества и студии.',
        'Не перегружен бытовыми функциями.'
      ]
    },

    allinone_workstation_high: {
      type: 'Рабочая станция',
      summary: 'Самый логичный выбор, если нужен один серьёзный инструмент с широкими возможностями.',
      models: [
        { name: 'Korg Krome EX', price: '124 000 ₽' },
        { name: 'Yamaha MODX6+', price: '120 000 ₽' }
      ],
      accessories: [
        { name: 'Блок питания', status: 'included' },
        { name: 'Педаль', status: 'separate' },
        { name: 'Стойка', status: 'separate' },
        { name: 'Чехол', status: 'separate' }
      ],
      why: [
        'У вас запрос на один главный инструмент, а не на узкую задачу.',
        'Такой класс реально перекрывает больше сценариев.',
        'Это лучший кандидат на универсальную роль.'
      ]
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Корректировка бюджета по опыту
  // ---------------------------------------------------------------------------

  function adjustBudgetByExperience(goal, experience, budget) {
    const reasons = [];

    if (experience === 'beginner' && (goal === 'production' || goal === 'stage') && budget === 'high') {
      reasons.push({
        field: 'budget',
        from: budget,
        to: 'mid',
        reason: 'Для начинающего в продакшн/сценическом сегменте high-уровень обычно избыточен.'
      });
      return { budget: 'mid', reasons };
    }

    if (experience === 'advanced' && budget !== 'high') {
      const upgraded = nextBudgetUp(budget);
      if (upgraded !== budget) {
        reasons.push({
          field: 'budget',
          from: budget,
          to: upgraded,
          reason: 'С вашим уровнем опыта стоит рассматривать сегмент повыше.'
        });
        return { budget: upgraded, reasons };
      }
    }

    return { budget, reasons: [] };
  }

  // ---------------------------------------------------------------------------
  // 5. Адаптивный список шагов по goal
  // ---------------------------------------------------------------------------

  const ALL_STEPS = ['goal', 'experience', 'format', 'needBuiltInSounds', 'speakers', 'accompaniment', 'budget'];

  function getStepsForGoal(goal) {
    const steps = ['goal', 'experience'];

    // format — для всех, кроме production
    if (goal !== 'production') steps.push('format');

    // needBuiltInSounds — для всех (с v1.1 ТЗ)
    steps.push('needBuiltInSounds');

    // speakers — для всех, кроме production
    if (goal !== 'production') steps.push('speakers');

    // accompaniment — только hobby, learning, allinone
    if (goal === 'hobby' || goal === 'learning' || goal === 'allinone') {
      steps.push('accompaniment');
    }

    steps.push('budget');
    return steps;
  }

  // ---------------------------------------------------------------------------
  // 6. Главная функция выбора результата
  // ---------------------------------------------------------------------------

  function pickResult(rawAnswers) {
    const answers = Object.assign({
      goal: 'hobby',
      experience: 'beginner',
      format: 'synth',
      needBuiltInSounds: 'yes',
      speakers: 'yes',
      accompaniment: 'dontcare',
      budget: 'low'
    }, rawAnswers || {});

    // 1. Корректировка бюджета по опыту
    const adj = adjustBudgetByExperience(answers.goal, answers.experience, answers.budget);
    const effectiveAnswers = Object.assign({}, answers, { budget: adj.budget });

    // 2. Ветвление по goal
    let situationKey;
    let contextWarnings = [];

    switch (effectiveAnswers.goal) {

      // ===== LEARNING =====
      case 'learning': {
        if (effectiveAnswers.format === 'synth' && effectiveAnswers.budget === 'xlow') {
          situationKey = 'learning_piano_compromise';
        } else if (effectiveAnswers.needBuiltInSounds === 'no') {
          // Базовый набор тембров всё равно будет — отличие в том, что пользователь
          // не предъявляет требований к разнообразию звуков.
          situationKey = 'learning_piano_basic';
          contextWarnings.push('Базовый набор тембров всё равно будет встроен — без них инструмент не сможет звучать самостоятельно.');
        } else {
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'learning_piano_compromise'; break;
            case 'low':  situationKey = 'learning_piano_basic'; break;
            case 'mid':  situationKey = 'learning_piano_mid'; break;
            case 'high': situationKey = 'learning_piano_high'; break;
            default:     situationKey = 'learning_piano_basic';
          }
        }
        break;
      }

      // ===== PRODUCTION =====
      case 'production': {
        if (effectiveAnswers.needBuiltInSounds === 'no') {
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'production_midi_xlow'; break;
            case 'low':  situationKey = 'production_midi_low'; break;
            case 'mid':  situationKey = 'production_midi_mid'; break;
            case 'high': situationKey = 'production_midi_mid'; break;
            default:     situationKey = 'production_midi_low';
          }
        } else {
          // needBuiltInSounds === 'yes'
          if (effectiveAnswers.budget === 'xlow' || effectiveAnswers.budget === 'low') {
            situationKey = 'production_workstation_entry';
          } else {
            situationKey = 'production_workstation_high';
          }
        }
        break;
      }

      // ===== STAGE =====
      case 'stage': {
        if (effectiveAnswers.format === 'hammer') {
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'stage_piano_xlow'; break;
            case 'low':  situationKey = 'stage_piano_low'; break;
            case 'mid':  situationKey = 'stage_piano_mid'; break;
            case 'high': situationKey = 'stage_piano_high'; break;
            default:     situationKey = 'stage_piano_low';
          }
        } else {
          // format === 'synth'
          if (effectiveAnswers.needBuiltInSounds === 'no') {
            // Осознанный выбор без встроенных тембров — премиум-сегмент
            switch (effectiveAnswers.budget) {
              case 'xlow': situationKey = 'stage_synth_xlow'; break;
              case 'low':  situationKey = 'stage_synth_low'; break;
              case 'mid':  situationKey = 'stage_synth_premium'; break;
              case 'high': situationKey = 'stage_synth_premium'; break;
              default:     situationKey = 'stage_synth_premium';
            }
          } else {
            switch (effectiveAnswers.budget) {
              case 'xlow': situationKey = 'stage_synth_xlow'; break;
              case 'low':  situationKey = 'stage_synth_low'; break;
              case 'mid':  situationKey = 'stage_synth_mid'; break;
              case 'high': situationKey = 'stage_synth_high'; break;
              default:     situationKey = 'stage_synth_low';
            }
          }
        }
        break;
      }

      // ===== HOBBY =====
      case 'hobby': {
        if (effectiveAnswers.format === 'hammer' && (effectiveAnswers.budget === 'mid' || effectiveAnswers.budget === 'high')) {
          situationKey = 'learning_piano_mid'; // хобби с молоточковой = цифровое пианино
        } else if (effectiveAnswers.accompaniment === 'no') {
          // Без автоаккомпанемента — проще синтезатор
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'hobby_synth_xlow'; break;
            case 'low':  situationKey = 'hobby_synth_low'; break;
            case 'mid':  situationKey = 'hobby_synth_mid'; break;
            case 'high': situationKey = 'hobby_synth_high'; break;
            default:     situationKey = 'hobby_synth_low';
          }
        } else {
          // accompaniment === 'yes' или 'dontcare' (считаем как yes для hobby)
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'hobby_synth_xlow'; break;
            case 'low':  situationKey = 'hobby_synth_low'; break;
            case 'mid':  situationKey = 'hobby_synth_mid'; break;
            case 'high': situationKey = 'hobby_synth_high'; break;
            default:     situationKey = 'hobby_synth_low';
          }
        }
        break;
      }

      // ===== ALL-IN-ONE =====
      case 'allinone': {
        if (effectiveAnswers.format === 'hammer' && (effectiveAnswers.budget === 'mid' || effectiveAnswers.budget === 'high')) {
          situationKey = 'allinone_focus_piano';
        } else if (effectiveAnswers.accompaniment === 'no') {
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'allinone_universal_xlow'; break;
            case 'low':  situationKey = 'allinone_universal_low'; break;
            case 'mid':  situationKey = 'allinone_workstation_no_accomp'; break;
            case 'high': situationKey = 'allinone_workstation_no_accomp'; break;
            default:     situationKey = 'allinone_universal_low';
          }
        } else {
          // accompaniment === 'yes' или 'dontcare'
          switch (effectiveAnswers.budget) {
            case 'xlow': situationKey = 'allinone_universal_xlow'; break;
            case 'low':  situationKey = 'allinone_universal_low'; break;
            case 'mid':  situationKey = 'allinone_workstation_mid'; break;
            case 'high': situationKey = 'allinone_workstation_high'; break;
            default:     situationKey = 'allinone_universal_low';
          }
        }
        break;
      }

      default: {
        situationKey = 'hobby_synth_low';
      }
    }

    // 3. Сборка результата
    const tpl = MODELS[situationKey];
    if (!tpl) {
      return {
        id: 'fallback',
        type: 'Подходящий инструмент',
        summary: 'Не удалось подобрать точную рекомендацию.',
        tradeoff: '',
        models: [],
        accessories: [],
        realPrice: '',
        why: [],
        nextSteps: [],
        upgradePath: '',
        budgetAdjusted: adj.reasons[0] || null
      };
    }

    const price = computeRealPrice(tpl.models, tpl.accessories);

    return {
      id: situationKey,
      type: tpl.type,
      summary: tpl.summary,
      tradeoff: tpl.tradeoff || '',
      models: tpl.models,
      accessories: tpl.accessories,
      realPrice: price.formatted,
      realPriceMin: price.min,
      realPriceMax: price.max,
      why: tpl.why || [],
      nextSteps: tpl.nextSteps || [],
      upgradePath: tpl.upgradePath || '',
      budgetAdjusted: adj.reasons[0] || null,
      contextWarnings: contextWarnings
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Экспорт
  // ---------------------------------------------------------------------------

  global.QuizEngine = {
    pickResult: pickResult,
    getStepsForGoal: getStepsForGoal,
    adjustBudgetByExperience: adjustBudgetByExperience,
    MODELS: MODELS,
    ACCESSORY_ESTIMATES: ACCESSORY_ESTIMATES
  };

})(typeof window !== 'undefined' ? window : globalThis);