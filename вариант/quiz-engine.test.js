// =============================================================================
// Тесты для QuizEngine
// Прогон в Node.js: node quiz-engine.test.js
// =============================================================================

// Подключаем движок как в браузере
global.window = global;
require('./quiz-engine.js');
const { pickResult, getStepsForGoal } = global.QuizEngine;

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'}\n      expected: ${expected}\n      actual:   ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Тесты: getStepsForGoal (адаптивные шаги)
// ---------------------------------------------------------------------------

console.log('\n=== getStepsForGoal ===');

test('production: без format, speakers, accompaniment → 4 шага', () => {
  const steps = getStepsForGoal('production');
  assertEqual(steps.length, 4, 'должно быть 4 шага: goal, experience, needBuiltInSounds, budget');
  assert(!steps.includes('format'), 'format не должен показываться');
  assert(!steps.includes('speakers'), 'speakers не должен показываться');
  assert(!steps.includes('accompaniment'), 'accompaniment не должен показываться');
  assert(steps.includes('goal'), 'goal должен быть');
  assert(steps.includes('needBuiltInSounds'), 'needBuiltInSounds должен быть');
  assert(steps.includes('budget'), 'budget должен быть');
});

test('stage: без accompaniment, но с format', () => {
  const steps = getStepsForGoal('stage');
  assert(steps.includes('format'), 'format должен показываться для stage');
  assert(steps.includes('needBuiltInSounds'), 'needBuiltInSounds должен быть');
  assert(steps.includes('speakers'), 'speakers должен быть');
  assert(!steps.includes('accompaniment'), 'accompaniment НЕ должен показываться для stage');
});

test('learning: без needBuiltInSounds? ДА, должен быть (по v1.1)', () => {
  const steps = getStepsForGoal('learning');
  assert(steps.includes('needBuiltInSounds'), 'needBuiltInSounds должен быть для learning');
  assert(steps.includes('format'), 'format должен быть для learning');
  assert(!steps.includes('speakers') === false, 'speakers должен быть для learning');
  assert(steps.includes('accompaniment'), 'accompaniment должен быть для learning');
});

test('hobby: все 7 шагов', () => {
  const steps = getStepsForGoal('hobby');
  assertEqual(steps.length, 7, 'должно быть 7 шагов');
});

test('allinone: все 7 шагов', () => {
  const steps = getStepsForGoal('allinone');
  assertEqual(steps.length, 7, 'должно быть 7 шагов');
});

// ---------------------------------------------------------------------------
// Тесты: pickResult — базовые сценарии v2 (15 шт)
// ---------------------------------------------------------------------------

console.log('\n=== pickResult: базовые сценарии ===');

test('S1 hobby + beginner + synth + xlow', () => {
  const r = pickResult({ goal: 'hobby', experience: 'beginner', format: 'synth', needBuiltInSounds: 'no', speakers: 'yes', accompaniment: 'dontcare', budget: 'xlow' });
  assertEqual(r.id, 'hobby_synth_xlow', 'должен быть hobby_synth_xlow');
  assert(r.models.length > 0, 'должны быть модели');
});

test('S2 learning + hammer + low', () => {
  const r = pickResult({ goal: 'learning', experience: 'beginner', format: 'hammer', needBuiltInSounds: 'no', speakers: 'yes', accompaniment: 'no', budget: 'low' });
  assertEqual(r.id, 'learning_piano_basic', 'должен быть learning_piano_basic');
  assert(r.type.includes('Цифровое пианино'), 'тип должен содержать "Цифровое пианино"');
});

test('S3 production + MIDI + low', () => {
  const r = pickResult({ goal: 'production', experience: 'intermediate', format: 'hammer', needBuiltInSounds: 'no', speakers: 'no', accompaniment: 'no', budget: 'low' });
  assertEqual(r.id, 'production_midi_low');
});

test('S4 stage + hammer + high', () => {
  const r = pickResult({ goal: 'stage', experience: 'advanced', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'no', accompaniment: 'no', budget: 'high' });
  assertEqual(r.id, 'stage_piano_high', 'молоточковая сцена high должна дать stage_piano_high');
  assert(r.type.includes('пианино'), 'тип должен содержать "пианино"');
});

test('S5 allinone + synth + mid', () => {
  const r = pickResult({ goal: 'allinone', experience: 'intermediate', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'dontcare', budget: 'mid' });
  assertEqual(r.id, 'allinone_workstation_mid');
});

// ---------------------------------------------------------------------------
// Тесты: развилки
// ---------------------------------------------------------------------------

console.log('\n=== pickResult: развилки ===');

test('S6 learning + synth + xlow → compromise', () => {
  const r = pickResult({ goal: 'learning', experience: 'beginner', format: 'synth', needBuiltInSounds: 'no', speakers: 'yes', accompaniment: 'no', budget: 'xlow' });
  assertEqual(r.id, 'learning_piano_compromise');
});

test('S7 stage + synth + speakers=yes + low → synth_low (не warning)', () => {
  const r = pickResult({ goal: 'stage', experience: 'beginner', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'no', budget: 'low' });
  assertEqual(r.id, 'stage_synth_low', 'должен быть stage_synth_low, а не warning');
  assert(!r.contextWarnings || r.contextWarnings.length === 0, 'НЕ должно быть контекстных warning');
});

test('S8 stage + speakers=yes + high → piano high', () => {
  const r = pickResult({ goal: 'stage', experience: 'advanced', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accommodation: 'no', budget: 'high' });
  assertEqual(r.id, 'stage_synth_high', 'для high budget даётся stage_synth_high');
});

test('S9 allinone + hammer + mid → focus_piano (БЕЗ warning про цифровое пианино)', () => {
  const r = pickResult({ goal: 'allinone', experience: 'beginner', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'no', budget: 'mid' });
  assertEqual(r.id, 'allinone_focus_piano');
  assert(r.type === 'Цифровое пианино с расширенной комплектацией', 'тип должен быть честным');
  // B18 фикс: не должно быть warning "может, цифровое пианино?"
  assert(!r.contextWarnings.some(w => w.includes('цифровое пианино')), 'НЕ должно быть warning с упоминанием цифрового пианино');
});

test('S11 allinone + accompaniment=no + mid → workstation_no_accomp', () => {
  const r = pickResult({ goal: 'allinone', experience: 'intermediate', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'no', budget: 'mid' });
  assertEqual(r.id, 'allinone_workstation_no_accomp', 'без аккомпанемента должен быть workstation_no_accomp');
});

// ---------------------------------------------------------------------------
// Тесты: stage + format=hammer (важно по согласованию)
// ---------------------------------------------------------------------------

console.log('\n=== pickResult: stage + format ===');

test('stage + hammer + mid → stage_piano_mid', () => {
  const r = pickResult({ goal: 'stage', experience: 'intermediate', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'no', budget: 'mid' });
  assertEqual(r.id, 'stage_piano_mid', 'молоточковая сцена mid → stage_piano_mid');
  assert(r.type.includes('пианино'), 'тип должен быть пианинным');
});

test('stage + synth + high → stage_synth_high', () => {
  const r = pickResult({ goal: 'stage', experience: 'intermediate', format: 'synth', needBuiltInSounds: 'yes', speakers: 'no', budget: 'high' });
  assertEqual(r.id, 'stage_synth_high', 'синтезаторная сцена high → stage_synth_high');
});

// ---------------------------------------------------------------------------
// Тесты: experience-корректировка
// ---------------------------------------------------------------------------

console.log('\n=== pickResult: experience-корректировка ===');

test('advanced + hobby + mid → бюджет поднимается', () => {
  const r = pickResult({ goal: 'hobby', experience: 'advanced', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'yes', budget: 'mid' });
  assert(r.budgetAdjusted !== null, 'budgetAdjusted должен быть заполнен');
  assertEqual(r.budgetAdjusted.from, 'mid');
  assertEqual(r.budgetAdjusted.to, 'high');
});

test('beginner + production + high → бюджет опускается', () => {
  const r = pickResult({ goal: 'production', experience: 'beginner', format: 'synth', needBuiltInSounds: 'yes', speakers: 'no', budget: 'high' });
  assert(r.budgetAdjusted !== null, 'budgetAdjusted должен быть заполнен');
  assertEqual(r.budgetAdjusted.from, 'high');
  assertEqual(r.budgetAdjusted.to, 'mid');
});

test('beginner + hobby + high → НЕ корректируется (hobby не входит)', () => {
  const r = pickResult({ goal: 'hobby', experience: 'beginner', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', budget: 'high' });
  assertEqual(r.budgetAdjusted, null, 'budgetAdjusted должен быть null для hobby+beginner');
});

// ---------------------------------------------------------------------------
// Тесты: realPrice автоматический
// ---------------------------------------------------------------------------

console.log('\n=== pickResult: realPrice ===');

test('realPrice рассчитывается автоматически', () => {
  const r = pickResult({ goal: 'learning', experience: 'beginner', format: 'hammer', budget: 'low' });
  // CDP-S110 за 42 000 + Yamaha P-145 за 37 000
  // + педаль included, стойка separate (5000), блок питания included, пюпитр included
  // min = 37000 + 5000 = 42000; max = 42000 + 5000 = 47000
  assertEqual(r.realPriceMin, 42000);
  assertEqual(r.realPriceMax, 47000);
  // toLocaleString('ru-RU') даёт неразрывный пробел (U+00A0)
  const nbsp = String.fromCharCode(0xA0);
  assert(r.realPrice.includes('42' + nbsp + '000'), 'должен содержать 42 000 с NBSP');
  assert(r.realPrice.includes('47' + nbsp + '000'), 'должен содержать 47 000 с NBSP');
});

test('realPrice включает стоимость отсутствующих аксессуаров', () => {
  const r = pickResult({ goal: 'hobby', experience: 'beginner', format: 'synth', budget: 'xlow' });
  // Casio CT-S300 за 18 500 + Yamaha PSR-E373 за 32 990
  // Педаль missing (2500), стойка missing (5000), блок питания included, пюпитр included
  // min = 18500 + 7500 = 26000; max = 32990 + 7500 = 40490
  assertEqual(r.realPriceMin, 26000);
  assertEqual(r.realPriceMax, 40490);
});

// ---------------------------------------------------------------------------
// Тесты: баги v2 не воспроизводятся
// ---------------------------------------------------------------------------

console.log('\n=== Регресс: баги v2 ===');

test('B18 fix: warning "может, цифровое пианино?" НЕ появляется для уже выданного цифрового', () => {
  const r = pickResult({ goal: 'allinone', experience: 'intermediate', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'no', budget: 'mid' });
  assertEqual(r.type, 'Цифровое пианино с расширенной комплектацией');
  const allText = (r.contextWarnings || []).join(' ');
  assert(!allText.includes('цифровое пианино'), 'НЕ должно быть warning с упоминанием цифрового пианино');
});

test('B12 fix: realPrice соответствует моделям + accessories', () => {
  // stage_piano_low: 85 000 / 72 000 + стойка 5000
  const r = pickResult({ goal: 'stage', experience: 'intermediate', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'no', budget: 'low' });
  const modelPrices = r.models.map(m => parseInt(m.price.replace(/[^\d]/g, '')));
  const minModel = Math.min(...modelPrices);
  const maxModel = Math.max(...modelPrices);
  assert(r.realPriceMin >= minModel, 'realPriceMin должен быть >= минимальной цены модели');
  assert(r.realPriceMax >= maxModel, 'realPriceMax должен быть >= максимальной цены модели');
});

test('B10 fix: allinone + format=synth + mid даёт workstation_mid (не мёртвая ветка)', () => {
  const r = pickResult({ goal: 'allinone', experience: 'intermediate', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', budget: 'mid' });
  assertEqual(r.id, 'allinone_workstation_mid');
});

test('B3 fix: format не влияет на production', () => {
  const r1 = pickResult({ goal: 'production', format: 'hammer', needBuiltInSounds: 'no', budget: 'low' });
  const r2 = pickResult({ goal: 'production', format: 'synth', needBuiltInSounds: 'no', budget: 'low' });
  assertEqual(r1.id, r2.id, 'для production format не должен влиять на результат');
});

test('B20 fix: warning передаёт ИСХОДНЫЙ goal пользователя', () => {
  // Пользователь изначально сказал goal=stage, мы НЕ должны выдавать ему allinone
  const r = pickResult({ goal: 'stage', experience: 'advanced', format: 'synth', needBuiltInSounds: 'yes', speakers: 'no', budget: 'high' });
  assertEqual(r.id, 'stage_synth_high');
  assert(!r.type.includes('универсальный'), 'НЕ должно быть типа "универсальный" для stage');
});

// ---------------------------------------------------------------------------
// Итоги
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log(`ИТОГО: ${passed} прошло, ${failed} упало`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\nУпавшие тесты:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}

console.log('\nВсе тесты прошли успешно ✓');