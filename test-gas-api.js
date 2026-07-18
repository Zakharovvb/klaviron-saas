#!/usr/bin/env node
// =============================================================================
// Тест связки GAS + Google Sheets (без оплаты)
// Запуск: node test-gas-api.js
// =============================================================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbw3SyAhlaCtMIxWQB9XtjXhwa_fNigrwFXL3WrHGuLX4l325BA4Lnv1LbQ9wIG3IeBi/exec';

let passed = 0;
let failed = 0;

function log(msg) { console.log(msg); }
function pass(name) { console.log('  ✓ ' + name); passed++; }
function fail(name, err) { console.log('  ✗ ' + name + ' — ' + err); failed++; }

async function fetchGAS(params) {
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function test(name, fn) {
  try { await fn(); pass(name); }
  catch (e) { fail(name, e.message); }
}

// Сценарии для тестирования
const SCENARIOS = [
  { name: 'Hobby + beginner + synth + low',
    params: { goal: 'hobby', experience: 'beginner', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'yes', budget: 'low' } },
  { name: 'Learning + hammer + low',
    params: { goal: 'learning', experience: 'beginner', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'no', budget: 'low' } },
  { name: 'Production + MIDI + mid',
    params: { goal: 'production', experience: 'intermediate', format: 'synth', needBuiltInSounds: 'no', speakers: 'no', accompaniment: 'dontcare', budget: 'mid' } },
  { name: 'Stage + hammer + high',
    params: { goal: 'stage', experience: 'advanced', format: 'hammer', needBuiltInSounds: 'yes', speakers: 'no', accompaniment: 'dontcare', budget: 'high' } },
  { name: 'All-in-one + synth + mid',
    params: { goal: 'allinone', experience: 'beginner', format: 'synth', needBuiltInSounds: 'yes', speakers: 'yes', accompaniment: 'yes', budget: 'mid' } }
];

async function main() {
  log('\n=== Тест связки GAS + Google Sheets ===\n');

  // 1. Config
  log('--- action=config ---');
  await test('config: отдаёт paymentProvider', async () => {
    const data = await fetchGAS({ action: 'config' });
    if (!data.ok) throw new Error('config not ok');
    if (data.paymentProvider !== 'yookassa') throw new Error('wrong provider: ' + data.paymentProvider);
    if (!data.paymentEnabled) throw new Error('payment not enabled');
    log('    provider=' + data.paymentProvider + ', price=' + data.priceLabel);
  });

  // 2. PreviewResult (5 сценариев)
  log('\n--- action=previewResult (5 сценариев) ---');
  for (const sc of SCENARIOS) {
    await test('preview: ' + sc.name, async () => {
      const data = await fetchGAS({ action: 'previewResult', ...sc.params });
      if (!data.ok) throw new Error('not ok');
      if (!data.type) throw new Error('no type');
      if (!data.summary) throw new Error('no summary');
      log('    type=' + data.type + ', why=' + (data.why?.length || 0) + ' пунктов');
    });
  }

  // 3. PaidResult (5 сценариев — проверка моделей из Google Sheets)
  log('\n--- action=paidResult (5 сценариев — модели из Sheets) ---');
  for (const sc of SCENARIOS) {
    await test('paid: ' + sc.name, async () => {
      const data = await fetchGAS({ action: 'paidResult', ...sc.params });
      if (!data.ok) throw new Error('not ok');
      const d = data.data;
      if (!d) throw new Error('no data');
      if (!d.type) throw new Error('no type');
      const modelCount = d.models?.length || 0;
      log('    type=' + d.type + ', models=' + modelCount + ', realPrice=' + (d.realPrice || 'нет'));
      if (modelCount > 0) {
        d.models.forEach(m => log('      • ' + m.name + ' — ' + (m.price || 'нет цены')));
      }
    });
  }

  // 4. Verify (DEV-режим)
  log('\n--- action=verify (DEV-режим) ---');
  await test('verify: фейковый order_id', async () => {
    const data = await fetchGAS({ action: 'verify', order_id: 'klv_test_verify_001' });
    if (!data.ok) throw new Error('verify not ok (expected DEV mode)');
    log('    status=' + data.status + ', token=' + data.token);
  });

  // 5. CreatePayment (создаёт реальный платёж, но не оплачивает)
  log('\n--- action=createpayment (создание платежа) ---');
  await test('createpayment: создаёт платёж 299 ₽', async () => {
    const data = await fetchGAS({ action: 'createpayment', goal: 'hobby', budget: 'low', amount: '29900' });
    if (!data.ok) throw new Error('createpayment not ok');
    if (!data.paymentUrl) throw new Error('no paymentUrl');
    if (!data.orderId) throw new Error('no orderId');
    log('    orderId=' + data.orderId);
    log('    paymentUrl=' + data.paymentUrl.substring(0, 60) + '...');
  });

  // Итог
  log('\n============================================================');
  log('ИТОГО: ' + passed + ' прошло, ' + failed + ' упало');
  log('============================================================');
  if (failed === 0) log('\nВсе тесты прошли успешно ✓');
  else log('\n⚠ Есть ошибки!');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });