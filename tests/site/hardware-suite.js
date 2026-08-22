/* Guards the hardware catalogue.

   Two things here are unlike the rest of the site. The specs are somebody
   else's facts, so the page must not restate them — it must read them from
   miner-db.js and be caught if it drifts. And the prices are a commercial
   number on a public page, so they must never read as firm: Ion brokers rather
   than holds stock, and a price binds only on the quote.

   Drives the real page through the DOM stub calc-live.js already carries. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
var fs = require('fs'), cp = require('child_process');
var S = REPO_ROOT + 'site/';
var SP = __dirname + '/';
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + detail));
    if (!cond) fail++;
}

var html = fs.readFileSync(S + 'hardware.html', 'utf8');
var js = fs.readFileSync(S + 'hardware.js', 'utf8');
var sheet = fs.readFileSync(S + 'styles.css', 'utf8');
var MinerDB = require(S + 'miner-db.js');
var PriceList = require(S + 'price-list.js');

/* ---- it parses ---- */

var vm = require('vm');
['hardware.js', 'price-list.js'].forEach(function (f) {
    try { new vm.Script(fs.readFileSync(S + f, 'utf8'), { filename: f }); ok(true, f + ' parses'); }
    catch (e) { ok(false, f + ' parses', e.message); }
});

/* ---- boot the page and read what it rendered ---- */

function boot(script) {
    var probeFile = SP + 'hw-probe.js';
    var stub = fs.readFileSync(SP + 'calc-live.js', 'utf8');
    var cut = stub.indexOf('function txt(id)');
    if (cut < 0) throw new Error('the DOM stub moved');
    var head = stub.slice(0, cut)
        .split('calculator.html').join('hardware.html')
        .split("['miner-db.js', 'calc-engine.js', 'calculator.js']")
        .join("['miner-db.js','calc-engine.js','price-list.js','cart.js','hardware.js']");
    fs.writeFileSync(probeFile, head +
        '\nfunction txt(id){return byId[id]?byId[id].textContent:"";}\n' +
        'function qty(model, n){\n' +
        '  var rows = byId.hwRows.innerHTML;\n' +
        '  var i = rows.indexOf(\'data-model="\' + model + \'"\');\n' +
        '  if (i < 0) throw new Error("no row for " + model);\n' +
        '  var seg = rows.slice(i, rows.indexOf("</tr>", i));\n' +
        '  var q = seg.indexOf(\'data-qty="\');\n' +
        '  var idx = seg.slice(q + 10, seg.indexOf(\'"\', q + 10));\n' +
        '  var input = { getAttribute: function (k) { return k === "data-qty" ? idx : null; },\n' +
        '                hasAttribute: function () { return true; }, value: String(n),\n' +
        '                attrs: {},\n' +
        '                setAttribute: function (k, v) { this.attrs[k] = v; } };\n' +
        '  stubbedQty[idx] = input;\n' +
        '  /* Typing means the field is FOCUSED, and syncInputs() deliberately\n' +
        '     skips the focused field so it does not normalise the value out from\n' +
        '     under the caret. Without modelling that, the sync writes the\n' +
        '     attribute for every input and the typing path cannot be told apart\n' +
        '     from the stepper path at all. */\n' +
        '  document.activeElement = input;\n' +
        '  byId.hwRows.fire("input", { target: input });\n' +
        '  document.activeElement = null;\n' +
        '}\n' +
        'var stubbedQty = {};\n' +
        '/* The stepper path: the handler finds its input through body.querySelector,\n' +
        '   and the cards live in an innerHTML string the stub never parses, so point\n' +
        '   that lookup at the stubbed inputs. */\n' +
        'byId.hwRows.querySelector = function (sel) {\n' +
        '  var m = sel.indexOf(\'data-qty="\');\n' +
        '  if (m < 0) return null;\n' +
        '  return stubbedQty[sel.slice(m + 10, sel.indexOf(\'"\', m + 10))] || null;\n' +
        '};\n' +
        'function step(model, dir) {\n' +
        '  var rows = byId.hwRows.innerHTML;\n' +
        '  var i = rows.indexOf(\'data-model="\' + model + \'"\');\n' +
        '  if (i < 0) throw new Error("no card for " + model);\n' +
        '  var seg = rows.slice(i, rows.indexOf("</tr>", i));\n' +
        '  var q = seg.indexOf(\'data-qty="\');\n' +
        '  var idx = seg.slice(q + 10, seg.indexOf(\'"\', q + 10));\n' +
        '  var btn = { getAttribute: function (k) {\n' +
        '        return k === "data-step" ? String(dir) : k === "data-for" ? idx : null; },\n' +
        '      closest: function (sel) { return sel === ".hw-step" ? btn : null; } };\n' +
        '  byId.hwRows.fire("click", { target: btn });\n' +
        '}\n' +
        '/* querySelectorAll("[data-qty]") has to return the stubbed inputs, since\n' +
        '   the rows themselves live in an innerHTML string the stub never parses. */\n' +
        'var realQSA = document.querySelectorAll;\n' +
        'document.querySelectorAll = function (sel) {\n' +
        '  if (sel === "[data-qty]") {\n' +
        '    var out = Object.keys(stubbedQty).sort(function(a,b){return a-b;})\n' +
        '      .map(function (k) { return stubbedQty[k]; });\n' +
        '    out.forEach = Array.prototype.forEach; return out;\n' +
        '  }\n' +
        '  return realQSA.call(document, sel);\n' +
        '};\n' +
        script + '\n');
    var out = cp.execSync('node "' + probeFile + '"', { encoding: 'utf8' });
    fs.unlinkSync(probeFile);
    var m = out.split('@@');
    if (m.length < 2) throw new Error('probe produced no dump:\n' + out);
    return JSON.parse(m[1]);
}

var base = boot(
    'setTimeout(function () {' +
    '  process.stdout.write("@@" + JSON.stringify({' +
    '    rows: (byId.hwRows.innerHTML.match(/<tr /g) || []).length,' +
    '    html: byId.hwRows.innerHTML,' +
    '    asOf: txt("hwAsOf"),' +
    '    units: txt("hwUnits"), cost: txt("hwCost"),' +
    '    preview: txt("hwOrderPreview")' +
    '  }) + "@@");' +
    '}, 40);');

/* ---------- the daily economics columns ----------

   Three columns were added so the catalogue answers "which of these is best for
   me" rather than only "what are they". The interesting cases are all about
   what is DELIBERATELY not shown: profit and payback stay blank until a power
   price is given, and payback stays blank on a machine that never earns itself
   back. An empty cell is a claim too, and these are the assertions that keep it
   an honest one. */

['Revenue', 'Profit', 'Payback'].forEach(function (h) {
    ok(html.indexOf(h) > 0, '  the catalogue has a ' + h + ' column');
});

/* THE MINING FORMULA MUST NOT LIVE ON THIS PAGE.

   calc-engine.js owns it, the calculator uses it, and it has been corrected
   more than once for things that were wrong in ways nobody noticed. A second
   copy here would be the same bug this codebase keeps finding in other
   clothes — two catalogues, two price fields, two of anything. So hardware.js
   may CALL the engine and must not contain the arithmetic.

   Comments are stripped first: the block above says "mining formula" and the
   one in hardware.js names the very constants this forbids, so a raw scan
   would fail on the explanation of the rule rather than on a breach of it.
   That exact trap has caught this project twice before. */
var econSrc = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok(econSrc.indexOf('CalcEngine.computeProjection') > 0,
   '  it asks calc-engine for the projection rather than doing the sums');

['4294967296', '86400', 'getBlockReward', 'blockReward'].forEach(function (bit) {
    ok(econSrc.indexOf(bit) < 0,
       '  and carries no piece of the mining formula itself (' + bit + ')');
});

/* Any outbound host must be one the calculator already uses — the privacy page
   names those two and only those two. A new third party appearing on a page
   nobody expected one on is exactly what ships unnoticed. */
var calcSrc = fs.readFileSync(S + 'calculator.js', 'utf8');
(econSrc.match(/https?:\/\/[a-z0-9.-]+/gi) || []).forEach(function (u) {
    var host = u.replace(/^https?:\/\//i, '');
    ok(calcSrc.indexOf(host) > 0,
       '  outbound host ' + host + ' is one the calculator already uses');
});

/* ---- what the cells actually hold, driven through the real page ---- */

function econStrip(td) { return td.replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim(); }

function econCells(elecValue) {
    var set = elecValue === null ? '' :
        '  var f = byId.hwElec; f.value = "' + elecValue + '";' +
        '  f.fire("input", { target: f });';
    var dump = boot(
        'setTimeout(function () {' + set +
        '  process.stdout.write("@@" + JSON.stringify({ html: byId.hwRows.innerHTML }) + "@@");' +
        '}, 40);');
    var row = dump.html.match(/<tr [^>]*>([\s\S]*?)<\/tr>/);
    if (!row) return null;
    return (row[1].match(/<td[^>]*>[\s\S]*?<\/td>/g) || []);
}

var blank = econCells(null);
ok(blank && /\$[0-9]/.test(blank[5]),
   '  revenue shows without being told a power price',
   blank ? econStrip(blank[5]) : 'no row');
ok(blank && econStrip(blank[6]) === '',
   '  profit is blank until one is given',
   blank ? '"' + econStrip(blank[6]) + '"' : 'no row');
ok(blank && econStrip(blank[7]) === '',
   '  and so is payback',
   blank ? '"' + econStrip(blank[7]) + '"' : 'no row');



/* ZERO IS AN ANSWER, NOT AN ABSENCE.

   A flared-gas site really does pay nothing for power, and that is the whole
   market this company sells into. A falsy check would fold it in with "not
   told" and blank the two columns for exactly the customer the page is for. */
var free = econCells('0');
ok(free && econStrip(free[6]) !== '',
   '  a power price of zero computes rather than reading as "not told"',
   free ? econStrip(free[6]) : 'no row');
ok(free && econStrip(free[6]) === econStrip(free[5]),
   '  and at zero the profit equals the revenue',
   free ? econStrip(free[5]) + ' vs ' + econStrip(free[6]) : 'no row');

/* AT A HIGH ENOUGH POWER PRICE A MACHINE NEVER PAYS BACK.

   The honest answer is an empty cell. A number would be a five-figure day
   count dressed up as a plan, and a customer reading "43 yr" has been told
   something worse than nothing. The loss is shown in the loss colour so the
   answer is visible rather than inferred from a minus sign. */
var dear = econCells('0.45');
ok(dear && econStrip(dear[6]).indexOf('−') === 0,
   '  a machine that loses money says so',
   dear ? econStrip(dear[6]) : 'no row');
ok(dear && dear[6].indexOf('hw-loss') > 0,
   '  and is marked as a loss rather than left to a minus sign',
   dear ? dear[6].slice(0, 40) : 'no row');
ok(dear && econStrip(dear[7]) === '',
   '  and its payback is blank, not a number of years nobody will wait',
   dear ? '"' + econStrip(dear[7]) + '"' : 'no row');

/* ---- every machine reaches the page ---- */

ok(base.rows === MinerDB.getAll().length,
   'every machine in the database reaches the catalogue',
   base.rows + ' rows for ' + MinerDB.getAll().length + ' models');

/* ---- and its specs are the database's, not the page's ---- */

/* The page must read the specs, never restate them. A catalogue that carries
   its own copy of a hashrate is a second source of truth that will drift. */
var wrong = [];
MinerDB.getAll().forEach(function (m) {
    var i = base.html.indexOf('data-model="' + m.model.replace(/"/g, '&quot;') + '"');
    if (i < 0) { wrong.push(m.model + ' (no row)'); return; }
    var seg = base.html.slice(i, base.html.indexOf('</tr>', i));
    if (seg.indexOf(m.hashrate.toLocaleString('en-US') + ' TH/s') < 0) wrong.push(m.model + ' hashrate');
    if (seg.indexOf(m.power.toFixed(3) + ' kW') < 0) wrong.push(m.model + ' power');
    if (seg.indexOf(m.efficiency.toFixed(1) + ' J/TH') < 0) wrong.push(m.model + ' efficiency');
});
ok(wrong.length === 0, 'every row states the specs the database holds',
   wrong.slice(0, 4).join(', '));

/* Best efficiency first — the number that decides a hosted machine's running
   cost. The catalogue is grouped by maker, so the sequence restarts at each
   heading and the invariant is per group rather than across the whole page.
   Checked that way rather than loosened, because "sorted somewhere" is not a
   property worth asserting. */
(function () {
    function effOf(name) {
        var m = MinerDB.getAll().filter(function (x) { return x.model === name; })[0];
        return m ? m.efficiency : 999;
    }
    /* One flat list again, so the invariant is global rather than per group.
       Best efficiency first: J/TH is what decides a hosted machine's running
       cost, and reading it down a column is the whole reason this is a table. */
    var names = [], i = 0;
    while ((i = base.html.indexOf('data-model="', i)) >= 0) {
        var j = base.html.indexOf('"', i + 12);
        names.push(base.html.slice(i + 12, j));
        i = j;
    }
    ok(names.length === MinerDB.getAll().length, 'every machine has a row and none is doubled',
       names.length + ' rows vs ' + MinerDB.getAll().length + ' in the database');

    var effs = names.map(effOf);
    var sorted = effs.every(function (e, k) { return k === 0 || e >= effs[k - 1]; });
    ok(sorted, 'and the list runs best efficiency first', effs.join(' '));
})();

/* ---- the order totals are arithmetic ---- */

var order = boot(
    'qty("Antminer S21 XP", 10);' +
    'setTimeout(function () {' +
    '  process.stdout.write("@@" + JSON.stringify({' +
    '    units: txt("hwUnits"), hash: txt("hwHash"), power: txt("hwPower"),' +
    '    cost: txt("hwCost"), preview: txt("hwOrderPreview"),' +
    '    runHref: byId.hwRunAll.attrs.href, runHidden: byId.hwRunAll.hidden' +
    '    ,qtyAttr: stubbedQty[Object.keys(stubbedQty)[0]].attrs.value' +
    '  }) + "@@");' +
    '}, 40);');

/* ---- the quantity control is the site's own input, not a new widget ---- */

/* The first version of this drew a bespoke stepper: its own bordered box with
   two internal dividers around a 4.5em number, glyphs at --plat-300. Measured
   against the card ground that is 12.08:1, where the affix chips the calculator
   uses sit at 5.15:1 — roughly three times the ink in a fifth of the area, which
   is what 'bright white' meant. The fix was not to darken it but to stop
   inventing a control: .field > label + .calc-unit > .cu-pre/.cu-post is the
   anatomy every other input on this site already has.

   Asserted structurally, because a redesign that quietly forks away from the
   shared parts is exactly how the two drift apart again. */
[['class="hw-qty"', 'sits in its own cell'],
 ['class="calc-unit"', 'and uses the calculator unit, not a private box'],
 ['cu-pre hw-step', 'with the minus as a real affix chip'],
 ['cu-post hw-step', 'and the plus as the other one'],
 ['aria-label="Quantity of ', 'and names the machine it belongs to']]
.forEach(function (p) {
    ok(base.html.indexOf(p[0]) >= 0, p[1], 'missing ' + p[0]);
});

/* No per-row label, because the column heading is the label — so it has to
   be there, and a header row that loses it would leave the column unnamed. */
ok(html.indexOf('<th>Quantity</th>') >= 0,
   'and the column heading labels it, once, instead of twenty-eight times',
   'no Quantity heading in hardware.html');

/* And it must stay as quiet as the chips it borrows. .hw-step sits after .cu-pre
   in the file at equal specificity, so a colour declared on it would win
   silently — resolve what actually renders rather than reading the rule. */
(function () {
    var C = require(SP + 'cascade.js');
    var el = { tag: 'button', classes: ['cu-pre', 'hw-step'], ancestors: [
        { tag: 'div', classes: ['calc-unit'] },
        { tag: 'td', classes: ['hw-qty'] },
        { tag: 'tr', classes: [] },
        { tag: 'table', classes: ['calc-table', 'hw-table'] }
    ] };
    var chip = { tag: 'span', classes: ['cu-pre'], ancestors: [
        { tag: 'div', classes: ['calc-unit'] },
        { tag: 'div', classes: ['field'] }
    ] };
    var mine = C.resolve(sheet, el, [], 'color');
    var theirs = C.resolve(sheet, chip, [], 'color');
    ok(mine && theirs && mine.value === theirs.value,
       'and renders in the same colour the calculator chips do',
       (mine ? mine.value + ' via ' + mine.sel : 'nothing') +
       ' vs ' + (theirs ? theirs.value : 'nothing'));

    /* The divider must survive too, and this is the one place cascade.js cannot
       be taken at its word: it resolves longhands, and never expands `border`.
       .hw-step sets `border: 0` to strip the button chrome, so asking only for
       border-right happily reports .cu-pre's hairline as the winner while a real
       browser has already wiped it with the shorthand. Resolve both and compare
       who actually outranks whom. */
    function beats(x, y) {
        if (!y) return true;
        var d = (x.spec[0] - y.spec[0]) || (x.spec[1] - y.spec[1]) || (x.spec[2] - y.spec[2]);
        return d !== 0 ? d > 0 : x.order > y.order;
    }
    var b = C.resolve(sheet, el, [], 'border-right');
    var shorthand = C.resolve(sheet, el, [], 'border');
    ok(b && b.value.indexOf('var(--line)') >= 0 && beats(b, shorthand),
       'and keeps the hairline divider the chip anatomy needs',
       !b ? 'nothing declares border-right'
          : b.value.indexOf('var(--line)') < 0 ? b.value + ' via ' + b.sel
          : 'wiped by ' + shorthand.sel + ' { border: ' + shorthand.value + ' }');
})();

/* A dark page must say so, or the browser draws carets, spinners, autofill and
   scrollbars from the light system palette. */
ok(sheet.indexOf('color-scheme: dark') >= 0,
   'and the stylesheet declares the page dark to the browser',
   'no color-scheme in styles.css');

/* ---- the stepper is a second code path, and gets its own drive ---- */

/* Typing and clicking + reach renderOrder() through different handlers. A
   version where the button writes only .value keeps every total right and
   silently kills the card highlight, so the button is driven here rather than
   assumed to behave like the input. */
var stepped = boot(
    'qty("Antminer S21 XP", 0);' +          /* register the input with the stub */
    'step("Antminer S21 XP", 1);' +
    'step("Antminer S21 XP", 1);' +
    'step("Antminer S21 XP", -1);' +
    'step("Antminer S21 XP", -1);' +
    'step("Antminer S21 XP", -1);' +        /* below zero, and must clamp */
    'setTimeout(function () {' +
    '  var input = stubbedQty[Object.keys(stubbedQty)[0]];' +
    '  process.stdout.write("@@" + JSON.stringify({' +
    '    value: input.value, attr: input.attrs.value, units: txt("hwUnits")' +
    '  }) + "@@");' +
    '}, 40);');

ok(stepped.value === '0', 'the stepper stops at zero rather than going negative',
   'value ' + JSON.stringify(stepped.value));
ok(stepped.attr === '0', 'and writes the clamped figure to the attribute too',
   'attribute ' + JSON.stringify(stepped.attr));

var up = boot(
    'qty("Antminer S21 XP", 0);' +
    'step("Antminer S21 XP", 1);' +
    'step("Antminer S21 XP", 1);' +
    'step("Antminer S21 XP", 1);' +
    'setTimeout(function () {' +
    '  var input = stubbedQty[Object.keys(stubbedQty)[0]];' +
    '  process.stdout.write("@@" + JSON.stringify({' +
    '    value: input.value, attr: input.attrs.value, units: txt("hwUnits")' +
    '  }) + "@@");' +
    '}, 40);');

ok(up.value === '3', 'three clicks of + is three machines', 'value ' + JSON.stringify(up.value));
ok(up.attr === '3', 'and the stylesheet can see it', 'attribute ' + JSON.stringify(up.attr));
ok(up.units === '3', 'and the order summary agrees', up.units);

/* ---- the card lights up, and can be seen to ---- */

/* The cue on a row holding machines is a :has() rule keyed on the
   value ATTRIBUTE. Setting input.value writes only the property, so a version
   that does that leaves every attribute reading "0" and the cue never fires —
   invisible in every other test, because the totals are still right. Assert the
   pair: if the stylesheet reads the attribute, the script must write it. */
(function () {
    var rule = sheet.indexOf('.hw-table tr:has(');
    ok(rule >= 0, 'a row holding machines is marked in the stylesheet');
    if (rule < 0) return;
    var sel = sheet.slice(rule, sheet.indexOf('{', rule));
    var readsAttr = sel.indexOf('[value=') >= 0;
    ok(readsAttr, 'and it is keyed on the value attribute', sel.trim());
    if (!readsAttr) return;

    /* Driven, not grepped: set a quantity through the page's own input handler
       and read back what it wrote onto the element. */
    ok(order.qtyAttr === '10',
       'so setting a quantity writes that attribute, not just the property',
       'attribute reads ' + JSON.stringify(order.qtyAttr) + ' after 10 were entered');

    /* And nothing sets .value on a quantity input behind the helper's back —
       the helper itself excepted, which is where the pairing lives. */
    var src = js.split(String.fromCharCode(10));
    var open = src.findIndex(function (l) { return l.indexOf('function setQty(') >= 0; });
    ok(open >= 0, 'and one helper owns the pairing', 'no setQty() in hardware.js');
    var close = open;
    while (close < src.length && src[close].indexOf('    }') !== 0) close++;
    var strays = [];
    src.forEach(function (line, n) {
        if (n >= open && n <= close) return;
        var i = line.indexOf('.value = ');
        if (i < 0) return;
        var name = line.slice(0, i).replace(/^[^A-Za-z_$]+/, '');
        if (name === 'input' || name === 'n') strays.push((n + 1) + ': ' + line.trim());
    });
    ok(strays.length === 0, 'and every quantity write goes through setQty',
       strays.join('; '));
})();


var xp = MinerDB.findByModel('Antminer S21 XP');
ok(order.units === '10', '10 machines counts as 10', order.units);
ok(order.hash === (xp.hashrate * 10).toLocaleString('en-US') + ' TH/s',
   'and 10 x ' + xp.hashrate + ' TH is ' + (xp.hashrate * 10) + ' TH/s', order.hash);
ok(order.power === (xp.power * 10).toFixed(2) + ' kW',
   'and 10 x ' + xp.power + ' kW is ' + (xp.power * 10).toFixed(2) + ' kW', order.power);
ok(order.cost === '$' + (PriceList.priceFor(xp.model) * 10).toLocaleString('en-US'),
   'and the indicative total is ten times the listed price', order.cost);

/* ---- the hand-off to the calculator ---- */

ok(!order.runHidden, 'a non-empty order offers to run the numbers', 'the link stayed hidden');
ok(order.runHref.indexOf('minerModel=') > 0 && order.runHref.indexOf('machineCount=10') > 0,
   'and the link carries the model and the count', order.runHref);
/* The scenario encoder on the calculator reads exactly these keys, so a link
   built here must decode there. calc-link.js proves the decode half. */
ok(order.runHref.indexOf(encodeURIComponent('Antminer S21 XP')) > 0,
   'with the model URL-encoded, since the names carry spaces', order.runHref);

/* ---- prices are never presented as firm ---- */

ok(PriceList.ASOF && /^\d{4}-\d{2}-\d{2}$/.test(PriceList.ASOF),
   'the price list carries an as-of date', String(PriceList.ASOF));
ok(base.asOf === PriceList.ASOF, 'and that date reaches the page', base.asOf);
ok(html.indexOf('indicative') >= 0, 'the page calls the prices indicative', 'it does not');
ok(html.indexOf('confirmed on quote') >= 0, 'and says they are confirmed on quote', 'it does not');
/* An unpriced machine must say so rather than show a zero, which reads as free. */
ok(js.indexOf("'on request'") >= 0 || js.indexOf('on request') >= 0,
   'a machine with no price says so rather than showing zero', 'no on-request path');

/* Prices live in one place. If hardware.js starts reading m.cost from the specs
   table again, the separation that made the price list datable is gone. */
ok(js.indexOf('.cost') < 0, 'the catalogue never reads a price from the specs table',
   'hardware.js is reading m.cost, which is the undated field');

/* ---- the form does not overpromise ---- */

var sendBlock = html.slice(html.indexOf('hw-send'));
ok(sendBlock.indexOf('nothing is sent until you send it') >= 0,
   'the form says it only opens a draft', 'it implies the order is sent');
ok(sendBlock.indexOf('mailto:hosting@ionmininggroup.com') >= 0,
   'and prints the address for when no mail client opens', 'no fallback address');
ok(html.indexOf('id="hwCopy"') >= 0, 'and offers the order for copying', 'no copy button');
/* Nothing should claim a send happened. */
ok(sendBlock.indexOf('Order sent') < 0 && sendBlock.indexOf('Thanks, we') < 0,
   'nothing on the page claims the order was sent', 'a success claim is present');

/* ---- registered with the generators ---- */

var nav = fs.readFileSync(S + 'tools/build-nav.js', 'utf8');
var seo = fs.readFileSync(S + 'tools/build-seo.js', 'utf8');
ok(nav.indexOf("'hardware.html'") >= 0, 'the nav generator knows the page', 'not in PAGES');
ok(seo.indexOf("'hardware.html'") >= 0, 'and so does the sitemap', 'not in the sitemap generator');
ok(fs.readFileSync(S + 'sitemap.xml', 'utf8').indexOf('/hardware.html') >= 0,
   'and it is in the written sitemap', 'missing');
ok(html.indexOf('<h4>Company</h4>') >= 0 && html.indexOf('<nav class="nav">') >= 0,
   'the generator markers are present', 'build-nav cannot splice this page');
ok(html.indexOf('border-radius') < 0, 'no inline radii', 'the no-radii rule was broken');

/* ---- the scripts load in an order that works ---- */

['./site.js', './miner-db.js', './price-list.js', './hardware.js'].forEach(function (src) {
    ok(html.indexOf('src="' + src + '"') >= 0, 'loads ' + src, 'missing');
});
ok(html.indexOf('src="./price-list.js"') < html.indexOf('src="./hardware.js"'),
   'the price list loads before the catalogue', 'PriceList would be undefined');
ok(html.indexOf('src="./miner-db.js"') < html.indexOf('src="./hardware.js"'),
   'and so does the database', 'MinerDB would be undefined');

/* ---- nothing measures the page ---- */

ok(js.indexOf('getBoundingClientRect') < 0 && js.indexOf('offsetWidth') < 0 &&
   js.indexOf('clientWidth') < 0 && js.indexOf('ResizeObserver') < 0,
   'nothing measures the page', 'a layout read crept in');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  hardware-suite: ALL OK');
process.exit(fail ? 1 : 0);
