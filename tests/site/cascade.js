/* Which colour does an element ACTUALLY get?

   contrast.js passed twice on a nav button that was rendering at 1.04:1,
   because it measured the colour declared on .btn--primary. That rule never
   applied: the button is an <a> inside .nav-links, and ".nav-links a" is
   (0,1,1) against ".btn--primary" at (0,1,0), so the nav's own link colour won.

   Reading a declaration is not the same as reading what renders. This resolves
   a tiny cascade instead: every selector in the stylesheet that could match the
   element, ranked by specificity, last one wins. */

/* An element is described by its tag, its classes, its state, and the
   ancestors it sits inside. */
function specificity(sel) {
    let a = 0, b = 0, c = 0;
    sel.replace(/\[[^\]]*\]/g, '[]')
       .split(/\s+|>|\+|~/).filter(Boolean).forEach(part => {
        (part.match(/#[A-Za-z0-9_-]+/g) || []).forEach(() => a++);
        (part.match(/\.[A-Za-z0-9_-]+/g) || []).forEach(() => b++);
        (part.match(/\[\]/g) || []).forEach(() => b++);
        // pseudo-CLASSES count as classes; pseudo-ELEMENTS as elements
        (part.match(/::[A-Za-z-]+/g) || []).forEach(() => c++);
        const pc = part.replace(/::[A-Za-z-]+/g, '').match(/:[A-Za-z-]+/g) || [];
        pc.forEach(() => b++);
        const tag = part.replace(/::?[A-Za-z-]+/g, '').replace(/[.#][A-Za-z0-9_-]+/g, '').replace(/\[\]/g, '');
        if (tag && tag !== '*') c++;
    });
    return [a, b, c];
}
const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

/* Does one compound (e.g. "a.nav-cta:hover") match this element? */
function compoundMatches(part, el, state) {
    /* Attribute selectors are carried in `state` alongside pseudo-classes, so
       [hidden] is asked for as state ['hidden']. They used to fall through to
       the tag test — "[hidden]" is not a tag, so the rule never matched and
       [hidden] { display: none } was invisible to this resolver. */
    const attrs = (part.match(/\[[A-Za-z-]+\]/g) || []).map(s => s.slice(1, -1));
    if (!attrs.every(a => state.indexOf(a) >= 0)) return false;
    const tag = part.replace(/\[[^\]]*\]/g, '')
                    .replace(/::?[A-Za-z-]+/g, '').replace(/[.#][A-Za-z0-9_-]+/g, '');
    if (tag && tag !== '*' && tag !== el.tag) return false;
    const classes = (part.match(/\.[A-Za-z0-9_-]+/g) || []).map(s => s.slice(1));
    if (!classes.every(c => el.classes.indexOf(c) >= 0)) return false;
    /* Ids were stripped for the tag test and then never checked, so "#advPanel"
       reduced to an empty tag and matched every element handed in — and being
       (1,0,0) it then outranked whatever genuinely applied. A resolver that
       reports the wrong winner is worse than no resolver. */
    const ids = (part.match(/#[A-Za-z0-9_-]+/g) || []).map(s => s.slice(1));
    if (ids.length && !ids.every(i => i === el.id)) return false;
    if (part.indexOf('::') >= 0) return false;                 // pseudo-element, not this box
    const pseudo = (part.replace(/::[A-Za-z-]+/g, '').match(/:[A-Za-z-]+/g) || []).map(s => s.slice(1));
    return pseudo.every(p => state.indexOf(p) >= 0);
}

/* `el.ancestors` is nearest-first: ancestors[0] is the direct parent. */
function selectorMatches(sel, el, state) {
    if (/[>+~]/.test(sel)) {
        // Keep it honest: refuse rather than guess at combinators.
        const parts = sel.split('>').map(s => s.trim());
        if (parts.length !== 2) return false;
        /* A child combinator means the DIRECT parent, not any ancestor. This
           used to ask .some(), which made "A > B" match a B nested arbitrarily
           deep inside an A — the wrong direction for a checker to be wrong in,
           because it reports a rule as applying when it does not. It passed
           ".wrap > .dg-wrap" for wraps that sit inside .dg-views. */
        return compoundMatches(parts[1], el, state) &&
               el.ancestors.length > 0 &&
               compoundMatches(parts[0], el.ancestors[0], []);
    }
    const parts = sel.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (!compoundMatches(last, el, state)) return false;
    // every earlier compound must match some ancestor, in order
    let i = 0;
    for (const anc of el.ancestors) {
        if (i >= parts.length - 1) break;
        if (compoundMatches(parts[i], anc, [])) i++;
    }
    return i >= parts.length - 1;
}

/* Walk the stylesheet and return the winning declaration for one property. */
function resolve(source, el, state, prop) {
    /* Strip comments first. A comment sitting between rules otherwise becomes
       part of the next rule's selector prelude, and the real selector after it
       silently stops matching — which is exactly the kind of quiet failure
       this file exists to catch. */
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m, order = 0;
    while ((m = re.exec(css))) {
        const body = m[2];
        const sels = m[1].split(',').map(s => s.trim()).filter(Boolean);
        // skip at-rule preludes and keyframe stops
        if (sels.some(s => s.charAt(0) === '@' || /^\d/.test(s) || s === 'from' || s === 'to')) continue;
        const decl = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(body);
        if (!decl) continue;
        /* !important outranks specificity and order entirely. Without this the
           resolver reports whatever normal declaration happens to come last,
           which is the opposite of what renders — and this file exists to say
           what renders. [hidden] { display: none !important } is the live case:
           it is (0,1,0) and sits near the top, so every later class rule setting
           display would otherwise be reported as winning. */
        const raw = decl[1].trim();
        const important = /!\s*important$/i.test(raw);
        const value = raw.replace(/!\s*important$/i, '').trim();
        sels.forEach(s => {
            if (!selectorMatches(s, el, state)) return;
            out.push({ sel: s, spec: specificity(s), value: value, important: important, order: order++ });
        });
    }
    if (!out.length) return null;
    out.sort((x, y) => ((x.important ? 1 : 0) - (y.important ? 1 : 0)) ||
                       cmp(x.spec, y.spec) || (x.order - y.order));
    return out[out.length - 1];
}

module.exports = { resolve, specificity, selectorMatches };
