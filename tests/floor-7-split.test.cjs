const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync('assets/js/app.js', 'utf8');

test('7층과 7.5층은 각각 독립된 공개용 모식도를 사용한다', () => {
  for (const [floor, image] of [
    ['7층', 'floor_7f.png'],
    ['7.5층', 'floor_7_5f.png']
  ]) {
    const asset = `assets/floor-plans/boiler/${image}`;
    assert.ok(source.includes(`openFloorRoom('${floor}', '${asset}'`));
    assert.ok(source.includes(`'${floor}': '${asset}'`));
    assert.deepEqual(fs.readFileSync(asset).subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  assert.ok(!source.includes('floorPlanBackground('));
});

test('도면 참조는 모두 배포된 PNG 파일을 가리킨다', () => {
  const paths = new Set(source.match(/assets\/floor-plans\/[\w\-/]+\.png/g) || []);
  assert.equal(paths.size, 24);
  for (const asset of paths) assert.ok(fs.existsSync(path.resolve(asset)), asset);
  const published = fs.readdirSync('assets/floor-plans', { recursive: true })
    .filter(file => /\.(?:jpg|jpeg|PNG)$/i.test(file));
  assert.equal(published.length, 24);
  assert.ok(published.every(file => file.endsWith('.png')));
});