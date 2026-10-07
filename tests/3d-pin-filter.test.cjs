const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

function setup() {
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.dataset = {}; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { this.removed = true; }
  }
  const select = new Element();
  const count = new Element();
  const viewer = new Element();
  viewer.querySelectorAll = () => viewer.children.filter(child => child.className === 'hotspot-pin');
  const photoLoads = [];
  const context = vm.createContext({
    document: {
      getElementById: id => ({ 'pin-floor-filter': select, 'pin-filter-count': count })[id],
      createElement: () => new Element()
    },
    viewer, selected3DPinFloor: '', selectedMajor: '기력', selectedSection: '보일러',
    selectedSubTab: '2호기', currentInstruments: [
      { id: 1, major_category: '기력', unit: '2호기', floor: '3층', model_position: '1 2 3', photo_url: 'photo-1', tag_no: 'A' },
      { id: 2, major_category: '기력', unit: '2호기', floor: '3층', model_position: '2 2 3', photo_url: 'photo-2', tag_no: 'B' },
      { id: 3, major_category: '기력', unit: '2호기', floor: '4층', model_position: '3 2 3', photo_url: 'photo-3', tag_no: 'C' },
      { id: 4, major_category: '기력', unit: '3호기', floor: '3층', model_position: '4 2 3', photo_url: 'photo-4', tag_no: 'D' }
    ],
    floor3DHeights: { '3층': 3, '4층': 4 }, engineFloor3DHeights: {},
    normalizeFloor: value => value, instrumentMajor: item => item.major_category,
    bindPhoto: (_element, url) => photoLoads.push(url), showDetail() {}
  });
  for (const name of ['render3DPinControls', 'render3DHotspots']) {
    const match = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\)[\\s\\S]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return { context, select, count, viewer, photoLoads };
}

test('3D starts without pins or photo loads and offers floors for the current unit', () => {
  const { context, select, count, viewer, photoLoads } = setup();
  context.render3DHotspots();
  assert.equal(viewer.children.length, 0);
  assert.equal(photoLoads.length, 0);
  assert.equal(count.textContent, '0/3대');
  assert.deepEqual(select.children.map(option => option.value), ['', 'ALL', '3층', '4층']);
});

test('3D floor choice creates only that floor pins; all is explicit', () => {
  const { context, viewer, photoLoads } = setup();
  context.selected3DPinFloor = '3층';
  context.render3DHotspots();
  assert.deepEqual(photoLoads, ['photo-1', 'photo-2']);
  assert.equal(viewer.children.filter(pin => !pin.removed).length, 2);
  assert.equal(viewer.children[0].attributes['aria-label'], '3층 A 상세 보기');
  context.selected3DPinFloor = 'ALL';
  context.render3DHotspots();
  assert.equal(viewer.children.filter(pin => !pin.removed).length, 3);
});
