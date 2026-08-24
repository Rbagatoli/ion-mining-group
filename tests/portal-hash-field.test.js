/* Drive portal/hash-field.js against a stub DOM with a controllable clock.
 *
 * THIS HARNESS OUTLIVED THE FILE IT TESTS. The original hash-field.js was
 * deleted when a canvas hero replaced it on the marketing site, and it is in
 * neither the tree nor git history. This was left behind pointing at nothing —
 * and because it was, it was a complete specification of the thing: how many
 * cells, how many may move in one tick, that a solved row shows two leading
 * 0000 groups and then releases, and that the whole field stops dead on a
 * hidden tab or offscreen.
 *
 * The current portal/hash-field.js was written to satisfy it. So this is not a
 * test written after the code to describe what it happens to do; it is the
 * older half of the pair. */
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').join(__dirname, '..');
const src = fs.readFileSync(ROOT + '/portal/hash-field.js', 'utf8');
const html = fs.readFileSync(ROOT + '/portal/index.html', 'utf8');

const seeded = [...html.matchAll(/<span class="hf-cell">([0-9a-f]{4})<\/span>/g)].map(m => m[1]);

function makeCell(text) {
  const set = new Set();
  return {
    textContent: text,
    classList: {
      add: c => set.add(c), remove: c => set.delete(c),
      contains: c => set.has(c),
      toggle: (c, on) => { on ? set.add(c) : set.delete(c); },
      _set: set,
    },
  };
}

function run({ reduced = false } = {}) {
  const cells = seeded.map(makeCell);
  const foundTag = makeCell('');
  const field = { getElementsByClassName: () => cells };

  let now = 0;
  const timeouts = [], intervals = [];
  let ioCb = null, visCb = null;

  const sb = {
    console, Math, Set,
    document: {
      hidden: false,
      getElementById: id => id === 'hashField' ? field : (id === 'hashFound' ? foundTag : null),
      addEventListener: (e, cb) => { if (e === 'visibilitychange') visCb = cb; },
    },
    window: {
      matchMedia: () => ({ matches: reduced }),
      IntersectionObserver: function (cb) { ioCb = cb; return { observe() {} }; },
    },
    setTimeout: (fn, ms) => { const t = { fn, at: now + (ms || 0), dead: false }; timeouts.push(t); return t; },
    clearTimeout: t => { if (t) t.dead = true; },
    setInterval: (fn, ms) => { const i = { fn, every: ms, next: now + ms, dead: false }; intervals.push(i); return i; },
    clearInterval: i => { if (i) i.dead = true; },
  };
  sb.IntersectionObserver = sb.window.IntersectionObserver;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'portal/hash-field.js' });

  const advance = ms => {
    const end = now + ms;
    while (now < end) {
      const next = Math.min(end,
        ...timeouts.filter(t => !t.dead && t.at > now).map(t => t.at),
        ...intervals.filter(i => !i.dead && i.next > now).map(i => i.next));
      now = next === Infinity ? end : next;
      timeouts.filter(t => !t.dead && t.at <= now).forEach(t => { t.dead = true; t.fn(); });
      intervals.filter(i => !i.dead && i.next <= now).forEach(i => { i.next = now + i.every; i.fn(); });
    }
  };

  return { cells, foundTag, advance,
           live: () => intervals.filter(i => !i.dead).length,
           setHidden: v => { sb.document.hidden = v; visCb && visCb(); },
           intersect: v => ioCb && ioCb([{ isIntersecting: v }]) };
}

let bad = 0;
const fail = m => { console.error('FAIL: ' + m); bad = 1; };

// ---- markup sanity ----
if (seeded.length !== 96) fail(`expected 96 seeded cells, found ${seeded.length}`);
if (!seeded.every(s => /^[0-9a-f]{4}$/.test(s))) fail('a seeded cell is not 4 hex chars');
console.log(`markup: ${seeded.length} pre-filled cells, all valid hex  OK`);

// ---- churn ----
const a = run();
const before = a.cells.map(c => c.textContent);
a.advance(3000);   // 40 ticks x 12 cells
const changed = a.cells.filter((c, i) => c.textContent !== before[i]).length;
if (changed < 30) fail(`churn too slow: only ${changed}/96 cells changed in 3s`);
// Over seconds every cell gets touched — that is coupon-collector, not a bug.
// The property that makes it read as live rather than flicker is how many move
// in a SINGLE tick.
const snap = a.cells.map(c => c.textContent);
a.advance(80);
const perTick = a.cells.filter((c, i) => c.textContent !== snap[i]).length;
if (perTick > 12) fail(`${perTick} cells changed in one tick, cap is 12`);
if (perTick === 0) fail('no cells changed in a tick');
console.log(`per tick: ${perTick}/96 cells move (cap 12)  OK`);
if (!a.cells.every(c => /^[0-9a-f]{4}$/.test(c.textContent))) fail('churn produced a non-hex cell');
const hot = a.cells.filter(c => c.classList.contains('is-hot')).length;
if (hot === 0 || hot > 40) fail(`hot-cell count implausible: ${hot}`);
console.log(`churn: ${changed}/96 cells rerolled in 3s, ${hot} running hot  OK`);

// ---- solve ----
a.advance(20000);
let sawSolve = false, sawTag = false, sawZeros = false;
for (let i = 0; i < 400; i++) {
  a.advance(60);
  const solved = a.cells.filter(c => c.classList.contains('is-solved'));
  if (solved.length) {
    sawSolve = true;
    if (a.foundTag.classList.contains('is-on')) sawTag = true;
    if (solved.length === 6 && solved[0].textContent === '0000' && solved[1].textContent === '0000') sawZeros = true;
  }
}
if (!sawSolve) fail('no solve fired in ~44s');
if (!sawZeros) fail('solved row never showed two leading 0000 groups');
if (!sawTag) fail('Block found tag never turned on');
if (a.cells.some(c => c.classList.contains('is-solved'))) {
  // fine mid-solve, but confirm it releases
  a.advance(4000);
  if (a.cells.some(c => c.classList.contains('is-solved'))) fail('solved row never released');
}
console.log('solve: fires, locks 0000 0000 across a full row, tags, releases  OK');

// ---- lifecycle ----
const b = run();
if (b.live() !== 1) fail('ticker did not start');
b.setHidden(true);  if (b.live() !== 0) fail('ticker kept running while tab hidden');
b.setHidden(false); if (b.live() !== 1) fail('ticker did not resume');
b.intersect(false); if (b.live() !== 0) fail('ticker kept running offscreen');
b.intersect(true);  if (b.live() !== 1) fail('ticker did not resume on scroll back');
console.log('lifecycle: stops on hidden tab and offscreen, resumes on both  OK');

// ---- reduced motion ----
const c = run({ reduced: true });
if (c.live() !== 0) fail('reduced motion started a ticker');
const csolved = c.cells.filter(x => x.classList.contains('is-solved'));
if (csolved.length !== 6) fail(`reduced motion should pre-solve one row of 6, got ${csolved.length}`);
if (!c.foundTag.classList.contains('is-on')) fail('reduced motion did not show the found tag');
c.advance(30000);
if (c.live() !== 0) fail('reduced motion started a timer later');
console.log('reduced motion: static field, one row pre-solved, no timers  OK');

process.exitCode = bad;
console.log(bad ? 'FAILED' : 'ALL OK');
