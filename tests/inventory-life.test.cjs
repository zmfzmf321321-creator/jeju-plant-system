const test = require('node:test');
const assert = require('node:assert/strict');
const { inferInventoryServiceLife } = require('../assets/js/inventory-life.js');

test('fixed replacement periods follow the supplied instrument table', () => {
  const cases = [
    ['PLC', '8년'], ['서버 컴퓨터', '6년'], ['운전원용 컴퓨터', '6년'],
    ['LCD 모니터', '6년'], ['LVDT', '10년'], ['포지셔너 (RVDT)', '6년'],
    ['릴레이', '6년'], ['로드셀', '15년']
  ];
  for (const [item_name, expected] of cases) {
    assert.equal(inferInventoryServiceLife({ item_name }).value, expected, item_name);
  }
});

test('manufacturer and conditional periods stay manual', () => {
  for (const item_name of ['제어카드 I/O', 'GPS 수신기', '네트워크 스위치',
    '압력 전송기', '유량 스위치', '솔레노이드', '서보 밸브', '알 수 없는 자재']) {
    assert.equal(inferInventoryServiceLife({ item_name }).value, null, item_name);
  }
});

test('item name takes precedence over a broad category or model description', () => {
  assert.equal(inferInventoryServiceLife({ item_name: 'LVDT', category: 'PLC 부품' }).value, '10년');
  assert.equal(inferInventoryServiceLife({ item_name: '제어카드 I/O', model_name: 'PLC' }).value, null);
  assert.equal(inferInventoryServiceLife({ item_name: '모듈', category: '로드셀' }).value, '15년');
});
