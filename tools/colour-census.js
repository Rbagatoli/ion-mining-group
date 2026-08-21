// Colour census -- a REPORTER, never a rewriter.
//
// The reskin moves ~1,900 hardcoded colour literals onto tokens. Nobody can review a diff that
// size, so this prints the population instead: every literal, where it lives, which token it
// should become, and which side of the CSS/JS line it sits on. Run it before and after each step
// and the delta IS the review artifact -- "#888 x176 -> var(--text-mid), 0 exceptions" is a
// sentence a person can actually check.
//
// The CSS/JS distinction is the load-bearing part. var() only works in CSS. A literal that ends
// up in ctx.fillStyle, in a three.js call, or in map-sourcing.js's fade() must become an
// IonTheme constant instead -- and fade() returns its input UNCHANGED for anything that is not
// six hex digits, so getting this wrong fails silently at the WebGL layer with no console error.
//
//   node tools/colour-census.js            summary
//   node tools/colour-census.js --full     every occurrence, file:line
//   node tools/colour-census.js --unmapped only literals with no token yet

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'colour-allowlist.json'), 'utf8'));

// Hex, rgb() and rgba(). Deliberately NOT matching named colours ('white', 'transparent'):
// 'transparent' and 'currentColor' are correct answers in this design system, not defects.
// (?<!&) keeps HTML numeric entities out: &#9656; is a caret glyph and &#9733; a star. Without
// it the census reports them as four-digit hex colours and the count can never reach zero.
var RE = /(?<!&)#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

// Where a literal is going. Everything not listed here reports as UNMAPPED, which is the point --
// the census must never quietly accept a colour nobody has decided about.
var MAP = {
    '#f7931a': '--btc-300 / IonTheme.btc',
    '#e8e8e8': '--text',
    '#888':    '--text-mid',
    '#555':    '--text-dim',
    '#4ade80': '--pos',
    '#ef4444': '--neg',
    '#f55':    '--neg  (VERIFY: error text vs negative P&L -- not obviously the same migration)',
    '#fbbf24': '--warn',
    '#060606': '--black',
    '#0a0a0a': '--surface',
    '#1a1a1a': 'DELETE (light-theme text)',
    '#8b5cf6': '--plat-300  (Strike purple demoted)',
    '#a78bfa': '--plat-300  (Strike purple demoted)',
    '#7c3aed': '--plat-400  (Strike purple demoted)'
};

function walk(dir, out) {
    out = out || [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === '.cache') return;
        // Generated data artifacts, not styling. '#200' in an EIA mailing address is a
        // suite number; scanning data/ finds only false positives.
        if (dir === ROOT && (e.name === 'data' || e.name === 'worker' || e.name === 'worker-strike')) return;
        // The census's own mapping table and the allowlist are full of colour literals by
        // necessity. Counting them would have this tool reporting itself as the problem.
        if (e.name === 'colour-census.js' || e.name === 'colour-allowlist.json') return;
        // tokens.css is where colours are DEFINED. Counting it is counting the cure as the
        // disease -- the number that matters is literals living anywhere else.
        if (e.name === 'tokens.css') return;
        if (e.name === 'theme.test.js') return;
        var p = path.join(dir, e.name);
        if (e.isDirectory()) return walk(p, out);
        if (/\.(js|css|html|json)$/.test(e.name)) out.push(p);
    });
    return out;
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function fileAllowed(r) {
    var f = ALLOW.files;
    for (var k in f) {
        if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
        if (k.indexOf('**') >= 0 ? r.indexOf(k.replace('/**', '/')) === 0 : r === k) return f[k].why;
    }
    return null;
}

// Matched on file + a distinctive context substring + the literal. Context rather than line
// number: an earlier version keyed on line numbers and went stale the first time anything was
// inserted above an entry. An entry that matches nothing is reported STALE rather than ignored --
// a drifted allowlist is exactly how a forbidden colour walks back in unnoticed.
var lineHits = {};
function lineAllowed(r, text, lit) {
    for (var i = 0; i < ALLOW.lines.length; i++) {
        var e = ALLOW.lines[i];
        if (e.file === r && text.indexOf(e.contains) >= 0 && e.literals.indexOf(lit) >= 0) {
            lineHits[i] = true;
            return e.why;
        }
    }
    return null;
}

// Does this literal end up somewhere var() cannot reach?
function sideOf(r, text) {
    if (/\.css$/.test(r)) return 'CSS';
    if (/\.json$/.test(r)) return 'JSON';
    if (/(fillStyle|strokeStyle|createLinearGradient|addColorStop|atmosphereColor|pointColor|ringColor|polygon\w*Color|fillColor|tileLayer)/.test(text)) return 'JS-canvas/gl';
    if (/\.html$/.test(r)) return 'HTML';
    return 'JS';
}

var full = process.argv.indexOf('--full') >= 0;
var unmappedOnly = process.argv.indexOf('--unmapped') >= 0;

var counts = {}, sides = {}, occurrences = [], allowed = 0, total = 0;

walk(ROOT).forEach(function(p) {
    var r = rel(p);
    var why = fileAllowed(r);
    var lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    lines.forEach(function(text, i) {
        var m; RE.lastIndex = 0;
        while ((m = RE.exec(text)) !== null) {
            var lit = m[0];
            // Same colour, two spellings. Collapse whitespace and pad a bare leading dot so
            // rgba(255,255,255,.06) and rgba(255, 255, 255, 0.06) count as one literal.
            var norm = lit.toLowerCase().replace(/\s+/g, '').replace(/\(\./g, '(0.').replace(/,\./g, ',0.');
            total++;
            if (why || lineAllowed(r, text, lit)) { allowed++; continue; }
            counts[norm] = (counts[norm] || 0) + 1;
            var side = sideOf(r, text);
            (sides[norm] = sides[norm] || {})[side] = (sides[norm][side] || 0) + 1;
            occurrences.push({ file: r, line: i + 1, lit: norm, side: side });
        }
    });
});

var keys = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
var live = keys.reduce(function(n, k) { return n + counts[k]; }, 0);
var unmapped = keys.filter(function(k) { return !MAP[k]; });
var unmappedN = unmapped.reduce(function(n, k) { return n + counts[k]; }, 0);

if (full || unmappedOnly) {
    occurrences
        .filter(function(o) { return !unmappedOnly || !MAP[o.lit]; })
        .forEach(function(o) {
            console.log('  ' + (o.file + ':' + o.line).padEnd(38) + o.lit.padEnd(24) +
                        o.side.padEnd(14) + (MAP[o.lit] || 'UNMAPPED'));
        });
    console.log('');
}

console.log('literal            count  where                              -> token');
console.log('-----------------  -----  ---------------------------------  ------------------------');
keys.slice(0, unmappedOnly ? keys.length : 30).forEach(function(k) {
    if (unmappedOnly && MAP[k]) return;
    var s = Object.keys(sides[k]).map(function(x) { return x + ':' + sides[k][x]; }).join(' ');
    console.log('  ' + k.padEnd(17) + String(counts[k]).padStart(5) + '  ' + s.padEnd(33) + '  ' +
                (MAP[k] || 'UNMAPPED'));
});

var stale = ALLOW.lines.filter(function(e, i) { return !lineHits[i]; });

console.log('');
console.log('  distinct literals   ' + keys.length);
console.log('  live occurrences    ' + live);
console.log('  allowlisted         ' + allowed + '  (Google mark, QR quiet zones, vendor, site/)');
console.log('  scanned             ' + total);
console.log('  UNMAPPED            ' + unmappedN + ' occurrences across ' + unmapped.length + ' literals');
if (stale.length) {
    console.log('');
    console.log('  STALE ALLOWLIST ENTRIES (line moved, or literal already gone):');
    stale.forEach(function(e) { console.log('    ' + e.file + '  "' + e.contains + '"  ' + e.literals.join(', ')); });
}
console.log('');
console.log(live === 0 ? '  CENSUS CLEAR' : '  ' + live + ' literals still to migrate');
