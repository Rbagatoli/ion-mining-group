/* A MODIFIER MUST STILL MODIFY.

   .grid--matrix { gap: 1px } is how the card grids share one hairline instead of
   floating apart. .band--tight { padding: 0 0 80px } exists to have no top
   padding. Both are (0,1,0) selectors, exactly like the base classes they modify
   - so a later `.grid { gap: 16px }` or `.band { padding: 40px 0 }` beats them on
   source order alone, and the modifier goes on sitting in the file looking like
   it works.

   Both of those happened, in one afternoon, while compressing mobile spacing.
   Neither threw, neither failed a test, and the only reason they were caught is
   that a before-and-after screenshot pass measured the grids. That is too thin a
   thread to hang a layout on.

   THE RULE THIS ENFORCES: if X--mod declares a property, no later rule for the
   bare X may declare the same property at a specificity that is not higher,
   inside a media context that also covers X--mod. A later rule is allowed to win
   as long as it says so explicitly - by naming the modifier in a :not(), by
   re-declaring the modifier after itself, or by being more specific.

   It reads the stylesheet as text on purpose. This is a question about the
   cascade, not about any one rendered page, and a rendered page can only ever
   show you the modifiers that happen to be on it. */

const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', '..', 'site', 'styles.css');
let fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}

const src = fs.readFileSync(CSS, 'utf8');

/* ---- read the sheet as a flat list of rules, in source order ---------------
   Comments go first so a selector mentioned in prose is not read as a rule.
   Media conditions are carried along because a rule inside @media (max-width:
   560px) cannot be overridden by one that only exists at 980px. */
function rules(text) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    let media = [];
    let i = 0, depth = 0;
    while (i < clean.length) {
        const brace = clean.indexOf('{', i);
        if (brace < 0) break;
        const head = clean.slice(i, brace).trim();
        if (head.startsWith('@')) {
            // at-rule with a block: push its condition and descend
            media.push({ cond: head, depth: depth });
            depth++;
            i = brace + 1;
            continue;
        }
        const close = clean.indexOf('}', brace);
        if (close < 0) break;
        const body = clean.slice(brace + 1, close);
        head.split(',').map(s => s.trim()).filter(Boolean).forEach(sel => {
            out.push({ sel: sel, body: body, media: media.map(m => m.cond).join(' && '), order: out.length });
        });
        i = close + 1;
        // close any at-rule blocks that end here
        while (depth > 0) {
            const nxt = clean.indexOf('}', i);
            const nextOpen = clean.indexOf('{', i);
            if (nxt >= 0 && (nextOpen < 0 || nxt < nextOpen)) {
                depth--; media.pop(); i = nxt + 1;
            } else break;
        }
    }
    return out;
}

const all = rules(src);
ok(all.length > 400, 'the stylesheet parses into rules', all.length + ' rules');

/* Specificity, borrowed in spirit from cascade.js: only the class/pseudo count
   matters here, because everything in question is a class selector. */
function spec(sel) {
    let a = 0, b = 0, c = 0;
    sel.replace(/\([^)]*\)/g, '()').split(/\s+|>|\+|~/).filter(Boolean).forEach(part => {
        (part.match(/#[A-Za-z0-9_-]+/g) || []).forEach(() => a++);
        (part.match(/\.[A-Za-z0-9_-]+/g) || []).forEach(() => b++);
        (part.match(/:[A-Za-z-]+/g) || []).forEach(() => b++);
        const tag = part.replace(/::?[A-Za-z-]+/g, '').replace(/[.#][A-Za-z0-9_-]+/g, '').replace(/\(\)/g, '');
        if (tag && tag !== '*') c++;
    });
    return a * 10000 + b * 100 + c;
}

function props(body) {
    return body.split(';').map(d => d.split(':')[0].trim().toLowerCase())
               .filter(p => p && !p.startsWith('--'));
}

/* Do these two rules ever apply at the same viewport?

   THE FIRST VERSION OF THIS ASKED THE WRONG QUESTION and let the exact bug that
   prompted the file walk straight through: it required the offender's media
   condition to be empty or identical, so an unconditional .grid--matrix stomped
   by a .grid inside @media (max-width: 560px) came back "no overlap". The
   mutation test caught a different modifier and looked like it had worked.

   Either side being unconditional means it applies everywhere, so it overlaps
   whatever the other one is. Two different conditions are treated as disjoint,
   which is conservative - a real media-query algebra would catch more, and would
   also be a great deal of machinery for a stylesheet with eleven breakpoints. */
function reaches(offenderMedia, modMedia) {
    return offenderMedia === '' || modMedia === '' || offenderMedia === modMedia;
}

/* ---- deliberate overrides -------------------------------------------------
 *
 * A responsive block that re-lays-out a component legitimately resets what the
 * old layout set. The rule this file enforces is that such a reset must be a
 * decision somebody wrote down, not source order nobody noticed - so it is
 * allowed here, by name, with the reason, rather than by loosening the check
 * until it stops asking.
 *
 * Keep this list short. Every entry is a place where reading .foo--bar in the
 * stylesheet tells you something that is not true at some viewport. */
const DELIBERATE = [
    {
        mod: '.dg-callout--l', prop: 'text-align',
        why: 'at <=900px or on touch the callouts stop flanking the drawing and ' +
             'become a two-column grid underneath it, where a right-aligned bubble ' +
             'would be aligned against nothing. The rule that does it says so.'
    },
];
function excused(modSel, prop) {
    return DELIBERATE.some(d => d.mod === modSel && d.prop === prop);
}

/* ---- the check ------------------------------------------------------------- */
const MOD = /^\.([A-Za-z0-9_-]+?)--[A-Za-z0-9_-]+$/;

const stomped = [];
all.forEach(mod => {
    const m = MOD.exec(mod.sel);
    if (!m) return;
    const base = '.' + m[1];
    const modProps = props(mod.body);
    if (!modProps.length) return;

    all.forEach(later => {
        if (later.order <= mod.order) return;
        // the bare base class, on its own, nothing else in the selector
        if (later.sel !== base) return;
        if (!reaches(later.media, mod.media)) return;
        if (spec(later.sel) > spec(mod.sel)) return;

        const clash = props(later.body)
            .filter(p => modProps.indexOf(p) >= 0)
            .filter(p => !excused(mod.sel, p));
        if (!clash.length) return;

        // an explicit re-statement of the modifier after the offender clears it
        const restated = all.some(r =>
            r.order > later.order &&
            r.sel === mod.sel &&
            reaches(later.media, r.media) &&
            clash.every(p => props(r.body).indexOf(p) >= 0));
        if (restated) return;

        stomped.push(mod.sel + ' { ' + clash.join(', ') + ' } lost to a later "' +
                     later.sel + '"' + (later.media ? ' in ' + later.media : ''));
    });
});

ok(stomped.length === 0,
   'no modifier has its own declarations silently overridden by its base class',
   stomped.join(' | '));

/* And the two that actually broke, named, so the specific regression is a
   specific failure rather than a number in a list. */
function declOf(sel, prop, media) {
    const r = all.filter(x => x.sel === sel && x.media === media &&
                              props(x.body).indexOf(prop) >= 0).pop();
    if (!r) return null;
    const d = r.body.split(';').map(x => x.trim())
               .filter(x => x.toLowerCase().indexOf(prop + ':') === 0).pop();
    return d ? d.split(':').slice(1).join(':').trim() : null;
}

const M560 = '@media (max-width: 560px)';
/* /^\.grid(?!--)/ so .grid--split, which is a modifier in its own right and owes
   the matrix nothing, is not asked to excuse it. */
const gridAt560 = all.filter(r => r.media === M560 && /^\.grid(?!--)/.test(r.sel) &&
                                  props(r.body).indexOf('gap') >= 0);
ok(gridAt560.every(r => r.sel.indexOf('grid--matrix') >= 0),
   'nothing at 560px sets .grid gap without excusing the matrix grid',
   gridAt560.map(r => r.sel).join(', ') || 'no rule found');

ok(declOf('.band--tight', 'padding', M560) !== null,
   '.band--tight restates its padding wherever .band changes at 560px',
   'the base rule would give it a top padding it exists to not have');

/* ---- the disc that stands in for the second O of PROTON --------------------
 *
 * Its margins are not the glyph's side bearings, and twice now somebody (me) has
 * "corrected" them back to the bearings because that is what they look like they
 * should be. They cannot be: an inline-block does not take the letter-spacing
 * that follows a real character, so the disc loses the tracking on its right and
 * has to carry it in the margin instead.
 *
 * The test is the asymmetry, not the two numbers. Measured with canvas
 * TextMetrics across eight installed faces - Segoe UI, Arial, Verdana, Tahoma,
 * Calibri, Trebuchet MS, Franklin Gothic Medium and Candara - the current pair
 * leaves the disc off-centre by at most 0.36px at 13px, against the 1.2px that
 * prompted the fix. Equal margins would put every one of those back to roughly
 * a full pixel out, which is what the eye actually caught. */
const bo = all.filter(r => /\.brand-o$/.test(r.sel) && props(r.body).indexOf('margin-left') >= 0).pop();
ok(!!bo, 'the brand disc has a margin rule', bo ? bo.sel : 'not found');
if (bo) {
    const val = n => {
        const d = bo.body.split(';').map(x => x.trim())
                    .filter(x => x.toLowerCase().indexOf(n + ':') === 0).pop();
        return d ? parseFloat(d.split(':')[1]) : NaN;
    };
    const ml = val('margin-left'), mr = val('margin-right');
    ok(isFinite(ml) && isFinite(mr) && mr - ml > 0.05,
       'the disc carries the letter-spacing an inline-block does not inherit',
       'margin-right - margin-left = ' + (mr - ml).toFixed(4) + 'em, needs > 0.05em');
}

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  modifier-suite: ALL OK');
process.exit(fail ? 1 : 0);
