/* Moving a prospect through the pipeline.
 *
 * Both ways to do it already existed and worked, and both were missed by the person using the
 * app. The board's only mechanism is a drag with no affordance on screen, and clicking a card
 * there deliberately OPENS it; the detail view's picker is a <select> under a 10.5px uppercase
 * caption in the dimmest colour on the page, which is the styling of a label, not of an action.
 *
 * A feature nobody can find is not meaningfully different from one that was never wired, and
 * this workspace has now shipped both. So the assertions here are about REACHABILITY, and they
 * are behavioural rather than structural: the detail view is actually rendered, prospecting.js
 * is actually loaded, and the question asked is whether the control exists AND has a handler on
 * it. Every panel test in this repo reads source; none of them would have caught a control that
 * renders and is never wired, which is the failure mode three consecutive stages shipped with.
 *
 * THE ONE THAT MATTERS MOST is the loop at the bottom of section 2: for every stage the config
 * defines, if a button is offered then the model must accept the move it offers. A button whose
 * destination setStage() refuses returns null -- not { ok:false } -- and the old handler checked
 * only .ok, so it would have snapped back silently. That is the exact shape of "there is no way
 * to push a prospect forward".
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

var _store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    key: function (i) { return Object.keys(_store)[i] || null; }
};
Object.defineProperty(global.localStorage, 'length', { get: function () { return Object.keys(_store).length; } });

/* A DOM only as real as these assertions need: elements remember their innerHTML and record
   every listener attached to them, and querySelectorAll finds elements by class in the markup
   that was written. Enough to answer "was this control wired", which is the whole question. */
var LISTENERS = [];
var els = {};
function mkEl(id) {
    return {
        id: id, innerHTML: '', value: '', hidden: false, textContent: '', style: {},
        classList: { add: function () {}, remove: function () {} },
        _attrs: {},
        addEventListener: function (t) { LISTENERS.push({ id: id, type: t }); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute: function (k, v) { this._attrs[k] = v; },
        appendChild: function () {}, removeChild: function () {}, select: function () {},
        querySelectorAll: function (sel) { return matchIn(this.innerHTML, sel); }
    };
}
function matchIn(html, sel) {
    var cls = sel.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"', 'g');
    var out = [];
    while (re.exec(html) !== null) out.push(mkEl(sel + '#' + out.length));
    return out;
}
global.document = {
    getElementById: function (id) { if (!els[id]) els[id] = mkEl(id); return els[id]; },
    querySelectorAll: function (sel) {
        var all = [];
        Object.keys(els).forEach(function (k) { all = all.concat(matchIn(els[k].innerHTML, sel)); });
        return all;
    },
    createElement: function () { return mkEl('tmp'); },
    body: { appendChild: function () {}, removeChild: function () {} },
    addEventListener: function () {}
};
global.location = { hash: '#p/p1' };
global.window = {
    alert: function () {}, prompt: function () { return null; }, confirm: function () { return true; },
    addEventListener: function () {}, print: function () {}
};
global.navigator = {};
global.initNav = function () {};

function req(f) { return require(path.join(ROOT, f)); }
global.CrmConfig = req('crm-config.js');
global.CrmLog = req('crm-log.js');
global.CrmContacts = req('crm-contacts.js');
global.CrmInteractions = req('crm-interactions.js');
global.CrmFollowups = req('crm-followups.js');
global.CrmEnrichment = req('crm-enrichment.js');
global.CrmDocuments = req('crm-documents.js');
global.SiteData = req('site-model.js');
global.SiteCapex = req('site-capex.js');
global.SiteInfrastructure = req('site-infrastructure.js');
global.SiteOpportunity = req('site-opportunity.js');
global.SiteCapacity = req('site-capacity.js');
global.ProjectData = req('project-model.js');
global.ProjectGates = req('project-gates.js');
global.ProjectBudget = req('project-budget.js');
global.ProjectSizing = req('project-sizing.js');
global.ProjectProcurement = req('procurement.js');
global.ProjectContractors = req('project-contractors.js');
global.ProspectNav = req('prospect-nav.js');
global.ProspectBoard = req('prospect-board.js');
global.ProspectToday = req('prospect-today.js');
global.ProspectDetail = req('prospect-detail.js');
global.ProspectAnalytics = req('prospect-analytics.js');
global.ProspectSummary = req('prospect-summary.js');
var SiteData = global.SiteData, CrmConfig = global.CrmConfig, ProspectDetail = global.ProspectDetail;

var HTML = fs.readFileSync(path.join(ROOT, 'prospecting.html'), 'utf8');

SiteData.add(SiteData.normalize({ id: 'p1', name: 'Pinelands Park LF',
                                  development_stage: 'raw_resource' }));

function renderAt(stage) {
    SiteData.update('p1', { stage: stage });
    els['pdetail'] = mkEl('pdetail');
    ProspectDetail.render('p1', 'pdetail');
    return els['pdetail'].innerHTML;
}
function advanceIn(html) {
    var m = /<button[^>]*id="pdAdvance"[^>]*>([^<]*)<\/button>/.exec(html);
    if (!m) return null;
    var to = /data-to="([^"]*)"/.exec(m[0]);
    return { label: m[1], to: to ? to[1] : null };
}

console.log('\n=== the picker is still there, and it is not the only thing there ===');
{
    var html = renderAt('contacted');
    ok('the stage picker still renders', html.indexOf('id="pdStage"') >= 0);
    /* The button does NOT replace it: the picker is how a prospect goes backwards, sideways and
       to Dead, and all three are real moves.
     *
       Scoped to the picker's own <select>. Counted across the whole document this found 49 —
       the log form's type, direction and outcome menus, the contact list, the document kinds —
       and would have passed against any number at all. */
    var sel = html.slice(html.indexOf('id="pdStage"'));
    sel = sel.slice(0, sel.indexOf('</select>'));
    var opts = (sel.match(/<option value="[a-z_]*"/g) || []).length;
    eq('offering every configured stage', opts, CrmConfig.stageKeys().length);
    ok('and they are the configured keys, in order',
       CrmConfig.stageKeys().every(function (k) { return sel.indexOf('value="' + k + '"') >= 0; }),
       sel);
    /* Read through a default rather than off the match directly. A missing button is the exact
       failure this block exists to catch, and indexing into null would throw — abandoning the
       run and taking every assertion below it with it, which reads as "no failures" to anything
       parsing the summary line. */
    var a = advanceIn(html) || {};
    ok('and an advance button sits beside it', !!a.to);
    eq('naming the destination rather than saying "next"', a.label, 'Advance to In discussion');
    eq('and carrying it as data', a.to, 'in_discussion');
}

console.log('\n=== what it offers at every stage, and what it refuses to offer ===');
{
    eq('unreviewed advances to researching', (advanceIn(renderAt('unreviewed')) || {}).to, 'researching');
    eq('term_sheet advances to diligence', (advanceIn(renderAt('term_sheet')) || {}).to, 'diligence');
    eq('agreement advances to closed_won', (advanceIn(renderAt('agreement')) || {}).to, 'closed_won');

    /* DEAD IS NEVER AN ADVANCE. It is the stage after closed_won in the configured order, so a
       naive "next in the list" would offer it — and site-model.js:390 refuses it without a
       reason, so the button would open a prompt menu demanding a decision. That is not what a
       control labelled Advance should do. */
    eq('closed_won offers nothing, because the next stage is dead',
       advanceIn(renderAt('closed_won')), null);
    eq('and dead offers nothing, being the end', advanceIn(renderAt('dead')), null);

    /* THE ASSERTION THAT MAKES THE REST MEAN ANYTHING. If a button is offered, the model has to
       accept the move it offers. setStage() returns NULL for a stage it does not know — not
       { ok:false } — so a bad destination would fail the one way a handler is least likely to
       report. Driven for real against every configured stage rather than reasoned about. */
    var offered = 0, refused = [];
    CrmConfig.stageKeys().forEach(function (from) {
        var a = advanceIn(renderAt(from));
        if (!a) return;
        offered++;
        var res = SiteData.setStage('p1', a.to, {});
        if (res === null || (res && res.ok === false)) refused.push(from + ' -> ' + a.to);
        SiteData.update('p1', { stage: from });
    });
    ok('the loop actually offered buttons to check', offered >= 6, offered + ' stages offer one');
    ok('every advance the button offers is one the model accepts', refused.length === 0,
       'setStage refused: ' + refused.join(', '));
}

console.log('\n=== the control is WIRED, which no source-reading test would notice ===');
{
    /* prospecting.js self-executes and draws whatever the hash points at. Loading it here is the
       only assertion in this repo that a rendered control has a handler on it — the gap that let
       three stages ship with panels nothing could write to. */
    var threw = null;
    try { req('prospecting.js'); } catch (e) { threw = e; }
    ok('prospecting.js loads and draws without throwing', !threw,
       threw ? threw.message : '');
    function wired(id, type) {
        return LISTENERS.some(function (l) { return l.id === id && l.type === type; });
    }
    ok('#pdStage has a change handler', wired('pdStage', 'change'));
    ok('#pdAdvance has a click handler', wired('pdAdvance', 'click'));
    /* Both were added after ~145 lines of ledger wiring went into wireDetail() this session.
       Anything throwing in between leaves everything below it unwired, and the page still looks
       correct — so the forms are checked here too rather than assumed. */
    ['pdProcForm', 'pdCtForm', 'pdPaForm', 'pdCoForm', 'pdLog', 'pdPromote'].forEach(function (f) {
        ok(f + ' is still wired below the ledger handlers', wired(f, 'submit'));
    });
}

console.log('\n=== the board says what it can do ===');
{
    /* Its only mechanism is a drag with no affordance, and clicking a card opens it instead.
       Both halves have to be said: the second is what makes a reader conclude the board cannot
       move anything at all. */
    var hint = /<p class="pb-hint">([\s\S]*?)<\/p>/.exec(HTML);
    ok('the board carries a hint', !!hint);
    if (hint) {
        ok('it says cards drag between columns', /drag/i.test(hint[1]), hint[1]);
        ok('and that clicking opens instead', /click/i.test(hint[1]), hint[1]);
    }
    ok('the cards are actually draggable, so the hint is true',
       /draggable="true"/.test(fs.readFileSync(path.join(ROOT, 'prospect-board.js'), 'utf8')));
}

console.log('\n=== both new classes are styled ===');
/* A BOUNDARY, NOT A SUBSTRING. indexOf('.pd-advance') is satisfied by '.pd-advanceX', so
   renaming the rule and leaving the markup alone passed — the check confirmed that some string
   starting those characters exists, which is not what it claims. The class name has to be
   followed by something that ends a selector. */
['pd-advance', 'pb-hint'].forEach(function (c) {
    var re = new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![a-zA-Z0-9_-])');
    ok('"' + c + '" has a style rule', re.test(HTML));
});

console.log('\n=== an unknown stage is reported, not swallowed ===');
{
    /* setStage returns null rather than { ok:false } for a stage it does not know. The picker's
       handler used to check only .ok, so the dropdown snapped back with no message — a silent
       no-op, and the same shape as the bug this file is named for. */
    var PJS = fs.readFileSync(path.join(ROOT, 'prospecting.js'), 'utf8');
    var mv = PJS.slice(PJS.indexOf('function moveStage'), PJS.indexOf('function moveStage') + 500);
    ok('the shared mover exists', mv.length > 50);
    ok('it handles the refusal case', /r\.ok === false/.test(mv));
    ok('and the null case separately', /else if \(!r\)/.test(mv));
    ok('both the picker and the button go through it',
       (PJS.match(/moveStage\(to, opts\)/g) || []).length >= 2);
    eq('null is reported to the model as unknown-stage',
       SiteData.setStage('p1', 'not_a_stage', {}), null);
}

console.log('');
console.log(fail ? '  ' + fail + ' FAILED, ' + pass + ' passed' : '  all ' + pass + ' passed');
process.exitCode = fail ? 1 : 0;
