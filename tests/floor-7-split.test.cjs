const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('assets/js/app.js', 'utf8');
const start = source.indexOf('  function floorPlanBackground(');
const end = source.indexOf('  window.openFloorRoom =', start);
assert.ok(start >= 0 && end > start, '도면 분리 함수가 있어야 한다');

test('7층과 7.5층은 원본의 서로 다른 픽셀 영역을 왜곡 없이 사용한다', () => {
  const calls = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return { drawImage: (...args) => calls.push(args) };
        },
        toDataURL(type) {
          assert.equal(type, 'image/png');
          return 'data:image/png;base64,dGVzdA==';
        }
      };
    }
  };
  const crop = vm.runInNewContext(`${source.slice(start, end)}\nfloorPlanBackground`, { document });
  const image = { naturalWidth: 1198, naturalHeight: 716 };
  const file = 'assets/floor-plans/boiler/floor_7f.jpg';

  assert.match(crop(image, '7층', file), /^url\("data:image\/png/);
  assert.deepEqual(Array.from(calls[0].slice(1)), [0, 0, 620, 716, 0, 0, 620, 716]);
  assert.match(crop(image, '7.5층', file), /^url\("data:image\/png/);
  assert.deepEqual(Array.from(calls[1].slice(1)), [570, 0, 628, 716, 0, 0, 628, 716]);
  assert.equal(crop(image, '6층', 'assets/floor-plans/boiler/floor_6f.jpg'), "url('./assets/floor-plans/boiler/floor_6f.jpg')");
});

test('층 선택과 설비 바로가기에 7.5층이 연결된다', () => {
  assert.match(source, /openFloorRoom\('7\.5층', 'assets\/floor-plans\/boiler\/floor_7f\.jpg'/);
  assert.match(source, /'7\.5층': 'assets\/floor-plans\/boiler\/floor_7f\.jpg'/);
  assert.match(source, /'7\.5층': 44\.80/);
});
