// Run with: node tests/BatchXISFCleaner.test.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path').posix;
const source = fs.readFileSync('src/scripts/Fluorine7/BatchXISFCleaner.js', 'utf8')
  .replace(/^#.*$/gm, '').replace(/main\(\);\s*$/, '');
new vm.Script(source); // Parse the complete script, including UI.
const ImageType = Object.fromEntries(['Unknown', 'Bias', 'Dark', 'Flat', 'Light', 'MasterBias',
  'MasterDark', 'MasterFlat', 'MasterLight', 'DefectMap', 'RejectionMapHigh', 'RejectionMapLow',
  'BinaryRejectionMapHigh', 'BinaryRejectionMapLow', 'SlopeMap', 'WeightMap'].map((k, i) => [k, i]));
function setup(options = {}) {
  const files = new Map([['/in/a.xisf', [[1, 2], [3, 4]]]]);
  const events = [];
  let opened = 0, closed = 0, modified = 1;
  function image(samples) {
    return {width: 2, height: 1, numberOfChannels: 1, bitsPerSample: 32,
      isReal: true, isColor: false, isComplex: false,
      samples, getSamples: a => a.set(samples)};
  }
  const ctx = {
    CoreApplication: {ensureMinimumVersion() {}}, Dialog: class {},
    Float64Array, Date, isNaN, ImageType, console: {writeln() {}},
    FileInfo: class {
      constructor(p) {
        if (!files.has(p)) throw Error('missing');
        this.size = JSON.stringify(files.get(p)).length;
        this.lastModified = new Date(modified);
        this.isSymbolicLink = !!options.symlink;
      }
    },
    File: {
      directoryExists: p => p === options.directoryCollision,
      exists: p => files.has(p), extractDrive: () => '',
      extractDirectory: path.dirname, extractName: p => path.basename(p, '.xisf'),
      move(a, b) {if (options.moveFail) throw Error('move failed'); events.push('move'); assert(!files.has(b)); files.set(b, files.get(a)); files.delete(a);},
      remove(p) {if (options.cleanupFail && p.includes('.xisf_clean_')) throw Error('cleanup failed'); events.push('remove:' + p); if (options.deleteFail && p === '/in/a.xisf') throw Error('denied'); files.delete(p);}
    },
    ImageWindow: {open(p, id, hints, copy) {
      assert.equal(copy, true);
      if (options.reopenFail && p !== '/in/a.xisf') throw Error('reopen failed');
      return files.get(p).map((samples, i) => {
        ++opened;
        return {isNull: false, imageType: options.types ? options.types[i] : ImageType.Unknown, mainView: {id: (options.ids || ['integration', 'rejection_high'])[i], image: image(samples)},
          forceClose() { assert(!this.isNull); this.isNull = true; ++closed; },
          saveAs(out) {
            if (options.sourceChanged) ++modified;
            if (options.lateCollision) files.set('/in/a_clean.xisf', [[7, 8]]);
            files.set(out, [options.corrupt ? [9, 9] : samples.slice()]);
            return !options.saveFail;
          }};
      });
    }}
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return {files, events, run: (index = 0, del = false, suffix) => ctx.cleanXISF('/in/a.xisf', '', index, del, suffix),
    assertClosed: () => assert.equal(opened, closed)};
}
for (const flag of ['saveFail', 'corrupt', 'reopenFail']) {
  const t = setup({[flag]: true});
  assert.throws(() => t.run(0, true));
  assert(t.files.has('/in/a.xisf'));
  assert.equal(t.files.size, 1);
  t.assertClosed();
}
{
  const t = setup(); t.run();
  assert(t.files.has('/in/a.xisf'));
  assert.deepEqual(t.files.get('/in/a_clean.xisf'), [[1, 2]]);
  t.assertClosed();
}
{
  const t = setup(); t.run(1, true);
  assert(!t.files.has('/in/a.xisf'));
  assert.deepEqual(t.files.get('/in/a_clean.xisf'), [[3, 4]]);
  assert.deepEqual(t.events, ['move', 'remove:/in/a.xisf']);
  t.assertClosed();
}
{
  const t = setup(); t.files.set('/in/a_clean.xisf', [[8, 8]]); t.run();
  assert.deepEqual(t.files.get('/in/a_clean.xisf'), [[8, 8]]);
  assert(t.files.has('/in/a_clean_1.xisf'));
  t.assertClosed();
}
{
  const t = setup({deleteFail: true});
  assert.match(t.run(0, true), /ORIGINAL NOT DELETED/);
  assert(t.files.has('/in/a.xisf')); assert(t.files.has('/in/a_clean.xisf'));
  t.assertClosed();
}
{
  const t = setup(); assert.throws(() => t.run(3, true));
  assert.equal(t.files.size, 1); t.assertClosed();
}
{
  const t = setup(); t.files.set('/in/a.xisf', [[1, 2]]);
  assert.match(t.run(0, true), /Skipped/);
  assert.equal(t.files.size, 1); t.assertClosed();
}
console.log('Passed: syntax, retained image selection, deletion ordering, collisions, single-image skip, invalid index, save/reopen/pixel/deletion failures, window cleanup.');

// Native V8 UI constructors require new; exercise the full dialog constructor.
{
  class Control {
    setHeaderText() {}
    setColumnWidth() {}
    setScaledFixedSize() {}
    setScaledFixedWidth() {}
    setFixedWidth() {}
    clear() {}
    scaledResource(p) { return p; }
    logicalPixelsToPhysical(n) { return n; }
    setScaledMinSize() {}
    add() {}
    addStretch() {}
    adjustToContents() {}
  }
  class NativeDialog extends Control {
    constructor() { super(); this.dialogInitialized = true; this.font = {width: s => s.length * 7}; }
  }
  const ctx = {CoreApplication: {ensureMinimumVersion() {}}, Dialog: NativeDialog,
    FrameStyle: {Box: 1}, TextAlignment: {Right: 1, VertCenter: 2}};
  for (const name of ['Label', 'TreeBox', 'PushButton', 'SpinBox', 'Edit',
                      'CheckBox', 'VerticalSizer', 'HorizontalSizer', 'ToolButton', 'GroupBox'])
    ctx[name] = class extends Control {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const dialog = vm.runInContext('new CleanerDialog()', ctx);
  assert(dialog instanceof NativeDialog);
  assert.equal(dialog.dialogInitialized, true);
  assert.equal(dialog.keep.value, 1);
  assert.equal(dialog.deleteOriginal.checked, false);
  console.log('Passed: dialog construction with class-only V8 UI constructors.');
}

{
  const t = setup({ids: ['crop_mask', 'integration_autocrop']});
  t.run(null, true);
  assert.deepEqual(t.files.get('/in/a_clean.xisf'), [[3, 4]]);
  assert(!t.files.has('/in/a.xisf'));
  t.assertClosed();
}
for (const ids of [['integration', 'unknown'], ['clip_low', 'crop_mask']]) {
  const t = setup({ids});
  assert.throws(() => t.run(null, true), /unique main image/);
  assert.equal(t.files.size, 1);
  assert(t.files.has('/in/a.xisf'));
  t.assertClosed();
}
{
  const ctx = {CoreApplication: {ensureMinimumVersion() {}}, Dialog: class {}};
  vm.createContext(ctx); vm.runInContext(source, ctx);
  for (const id of ['rejection_low', 'clip_high', 'clipping_low', 'drizzle_weights',
                   'crop_mask', 'weightImage', 'slope', 'target_rejection_high_2', 'drizzle_map'])
    assert(ctx.cleanIsCompanion(id), id);
  for (const id of ['integration', 'drizzle_integration', 'integration_autocrop',
                   'target_drizzle_1x_autocrop', 'unknown', ''])
    assert(!ctx.cleanIsCompanion(id), id);
}
console.log('Passed: automatic selection, map identifiers, ambiguous/all-map rejection and original retention.');

for (const [suffix, expected] of [['_main', '/in/a_main.xisf'], ['', '/in/a_1.xisf']]) {
  const t = setup(); t.run(0, false, suffix);
  assert(t.files.has(expected)); assert(t.files.has('/in/a.xisf')); t.assertClosed();
}
for (const suffix of ['/bad', '\\bad', ':bad', 'bad.']) {
  const t = setup(); assert.throws(() => t.run(0, true, suffix), /suffix/);
  assert.equal(t.files.size, 1); t.assertClosed();
}
console.log('Passed: custom/empty suffixes and invalid filename rejection.');

{
  const t = setup({sourceChanged: true});
  assert.match(t.run(0, true), /ORIGINAL NOT DELETED/);
  assert(t.files.has('/in/a.xisf')); assert(t.files.has('/in/a_clean.xisf')); t.assertClosed();
}
for (const option of ['symlink', 'moveFail', 'lateCollision']) {
  const t = setup({[option]: true});
  assert.throws(() => t.run(0, true));
  assert(t.files.has('/in/a.xisf'));
  assert(![...t.files.keys()].some(p => p.includes('.xisf_clean_')));
  t.assertClosed();
}
{
  const t = setup({directoryCollision: '/in/a_clean.xisf'}); t.run();
  assert(t.files.has('/in/a_clean_1.xisf')); t.assertClosed();
}
console.log('Passed: source modification, symlink deletion refusal, move failure, late collision and directory collision.');

{
  const t = setup({ids: ['unusual', 'crop_mask'], types: [ImageType.WeightMap, ImageType.MasterLight]});
  t.run(null, true);
  assert.deepEqual(t.files.get('/in/a_clean.xisf'), [[3, 4]]); t.assertClosed();
}
{
  const t = setup({types: [ImageType.Light, ImageType.Light]});
  assert.throws(() => t.run(null, true), /unique main image/); assert.equal(t.files.size, 1);
}
{
  const ctx = {CoreApplication: {ensureMinimumVersion() {}}, Dialog: class {}};
  vm.createContext(ctx); vm.runInContext(source, ctx);
  assert.equal(ctx.cleanErrorText('native failure'), 'native failure');
  assert.equal(ctx.cleanErrorText(new Error('test')), 'test');
  assert.match(ctx.cleanErrorText(undefined), /Unknown error/);
}
console.log('Passed: type precedence and native string exception reporting.');

{
  const t = setup({corrupt: true, cleanupFail: true});
  assert.throws(() => t.run(0, true), /pixel verification failed/);
  assert(t.files.has('/in/a.xisf')); t.assertClosed();
}
{
  const t = setup({ids: ['crop_mask']}); t.files.set('/in/a.xisf', [[1,2]]);
  assert.match(t.run(null, true), /Skipped/); assert.equal(t.files.size, 1); t.assertClosed();
}
{
  const ctx = {CoreApplication: {ensureMinimumVersion() {}}, Dialog: class {}, console: {writeln() {}}};
  vm.createContext(ctx); vm.runInContext(source, ctx);
  let secondClosed = false;
  const windows = [{isNull: false, forceClose() {throw Error('first failed');}},
    {isNull: false, forceClose() {secondClosed = true;}}];
  assert.throws(() => ctx.cleanClose(windows), /first failed/);
  assert(secondClosed);
  ctx.cleanClose(windows, true);
}
console.log('Passed: cleanup errors preserve original diagnostics, remaining windows close, single companion image skipped.');
