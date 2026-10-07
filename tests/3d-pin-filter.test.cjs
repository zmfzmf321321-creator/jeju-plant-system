const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

function setup() {
  class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.classList = { toggle: (name, active) => { if (active) this.active = name; } };
    }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this[name] = handler; }
    remove() { this.removed = true; }
  }
  const rail = new Element();
  const panel = new Element();
  const viewer = new Element();
  viewer.querySelectorAll = () => viewer.children.filter(child => child.className === 'hotspot-pin' && !child.removed);
  const photoLoads = [];
  const instruments = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1, major_category: '기력', unit: '2호기', floor: '3층',
    model_position: `${index} 2 3`, photo_url: `photo-${index + 1}`,
    tag_no: `A${index + 1}`, name: `설비 ${index + 1}`
  }));
  instruments.push({ id: 11, major_category: '기력', unit: '2호기', floor: '4층', model_position: '1 4 3', tag_no: 'B' });
  instruments.push({ id: 12, major_category: '기력', unit: '3호기', floor: '3층', model_position: '1 3 3', tag_no: 'C' });
  const context = vm.createContext({
    document: {
      getElementById: id => ({ 'model-floor-rail': rail, 'model-floor-panel': panel })[id],
      createElement: () => new Element()
    },
    viewer, selected3DPinFloor: '', selectedMajor: '기력', selectedSection: '보일러',
    selectedSubTab: '2호기', currentInstruments: instruments,
    floor3DHeights: { '3층': 3, '4층': 4 }, engineFloor3DHeights: {},
    normalizeFloor: value => value, instrumentMajor: item => item.major_category,
    bindPhoto: (_element, url) => photoLoads.push(url), showDetail() {}
  });
  for (const name of ['render3DPinControls', 'render3DHotspots']) {
    const match = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\)[\\s\\S]*?^  }`, 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return { context, rail, panel, viewer, photoLoads };
}

test('overview shows direct floor counts without loading pins', () => {
  const { context, rail, panel, viewer, photoLoads } = setup();
  context.render3DHotspots();
  assert.equal(viewer.children.length, 0);
  assert.equal(photoLoads.length, 0);
  assert.equal(panel.hidden, true);
  assert.deepEqual(rail.children.slice(1).map(button => [button.children[0].textContent, button.children[1].textContent]), [['4층', '1'], ['3층', '10']]);
});

test('selecting a floor shows its full list and at most eight model pins; second click clears it', () => {
  const { context, rail, panel, viewer } = setup();
  context.render3DHotspots();
  rail.children[2].click();
  assert.equal(context.selected3DPinFloor, '3층');
  assert.equal(panel.hidden, false);
  assert.equal(panel.children[2].children.length, 10);
  assert.equal(viewer.querySelectorAll().length, 8);
  rail.children[2].click();
  assert.equal(context.selected3DPinFloor, '');
  assert.equal(panel.hidden, true);
  assert.equal(viewer.querySelectorAll().length, 0);
});

