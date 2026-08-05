// ===== Minimal XLSX reader — pure Node, zero dependencies =====
// The repo has no build step and no npm. An .xlsx is a ZIP of XML, and node ships zlib, so a
// reader is ~150 lines rather than a dependency tree.
//
// Only what the flare catalog needs: sheet names, shared strings, and cell values as strings.
// No formulas, no styles, no dates, no streaming.

var zlib = require('zlib');

// ---- ZIP ---------------------------------------------------------------------------
// Read via the central directory rather than scanning for local headers: local headers can
// carry a zeroed compressed-size with the real value in a trailing data descriptor, which is
// exactly the case that makes naive scanners silently truncate an entry.
function unzip(buf) {
    var eocd = -1;
    // EOCD is at the end, but a trailing comment can push it back up to 64 KB.
    for (var i = buf.length - 22; i >= 0 && i >= buf.length - 66000; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');

    var count = buf.readUInt16LE(eocd + 10);
    var cdOffset = buf.readUInt32LE(eocd + 16);

    var files = {};
    var p = cdOffset;
    for (var n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        var method   = buf.readUInt16LE(p + 10);
        var compSize = buf.readUInt32LE(p + 20);
        var nameLen  = buf.readUInt16LE(p + 28);
        var extraLen = buf.readUInt16LE(p + 30);
        var cmtLen   = buf.readUInt16LE(p + 32);
        var localOff = buf.readUInt32LE(p + 42);
        var name     = buf.toString('utf8', p + 46, p + 46 + nameLen);

        // Jump to the local header to find where the data actually starts — its extra field
        // length often differs from the central directory's.
        var lNameLen  = buf.readUInt16LE(localOff + 26);
        var lExtraLen = buf.readUInt16LE(localOff + 28);
        var dataStart = localOff + 30 + lNameLen + lExtraLen;
        var raw = buf.slice(dataStart, dataStart + compSize);

        files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
        p += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
}

// ---- XML ---------------------------------------------------------------------------
function decodeEntities(s) {
    return s.replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(+d); })
            .replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');            // last, so &amp;lt; survives as &lt;
}

function sharedStrings(xml) {
    if (!xml) return [];
    // Each <si> may hold several <t> runs (rich text); concatenate them.
    return (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map(function(si) {
        var parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        return decodeEntities(parts.map(function(t) {
            return t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '');
        }).join(''));
    });
}

// The SELF-CLOSING alternative must come FIRST.
//
// The previous order was `<c ...>body</c>` first, and its attribute group `([^>]*)` happily
// swallowed the trailing slash of an empty cell like `<c r="Y2" s="8"/>`. The pattern then ran
// lazily forward to the NEXT cell's `</c>`, merging two cells into one: attributes came from the
// empty cell, the value came from its neighbour, and because the neighbour's `t="s"` was left
// behind in the discarded text, shared-string INDICES were emitted as raw numbers.
//
// Observed in the LMOP export: `<c r="Y2" s="8"/><c r="Z2" s="6" t="s"><v>79</v></c>` produced
// the number 79 in Y's column instead of an empty Y and the string "Direct" in Z. Every later
// column in such a row shifted, silently.
//
// With self-closing tried first, `[^>]*` cannot reach past the slash, so an empty cell matches as
// an empty cell. Capture groups: 1 = self-closing attrs, 2 = open-tag attrs, 3 = body.
var CELL_RE = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;

function parseSheet(xml, strings) {
    var rows = [];
    var rowMatches = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    for (var r = 0; r < rowMatches.length; r++) {
        var cells = [];
        CELL_RE.lastIndex = 0;
        var m;
        while ((m = CELL_RE.exec(rowMatches[r])) !== null) {
            var attrs = m[1] !== undefined ? m[1] : m[2];
            var body = m[3] === undefined ? '' : m[3];

            // Honour the column reference so a sparse row keeps its alignment. Without this a
            // blank cell shifts every later column left by one and the whole row is garbage.
            var ref = /r="([A-Z]+)\d+"/.exec(attrs);
            if (ref) {
                var col = 0, letters = ref[1];
                for (var i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
                col -= 1;
                while (cells.length < col) cells.push('');
            }

            var type = /t="([^"]+)"/.exec(attrs);
            type = type ? type[1] : null;

            if (type === 'inlineStr') {
                var its = body.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
                cells.push(decodeEntities(its.map(function(t) {
                    return t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '');
                }).join('')));
                continue;
            }
            var v = /<v>([\s\S]*?)<\/v>/.exec(body);
            if (!v) { cells.push(''); continue; }
            if (type === 's') {
                var idx = parseInt(v[1], 10);
                cells.push(strings[idx] === undefined ? '' : strings[idx]);
            } else {
                cells.push(decodeEntities(v[1]));
            }
        }
        rows.push(cells);
    }
    return rows;
}

// ---- Public ------------------------------------------------------------------------
// Returns { sheetNames: [...], sheet(nameOrIndex) -> rows[][] }
function read(buf) {
    var files = unzip(buf);
    var wbXml = (files['xl/workbook.xml'] || Buffer.alloc(0)).toString('utf8');
    var strings = sharedStrings(files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : null);

    // Sheet order in workbook.xml is the display order; the file it maps to comes from the
    // relationship id, NOT the position. Resolve properly via _rels — several of these
    // workbooks have sheetN.xml in a different order than the tabs.
    var rels = {};
    var relXml = files['xl/_rels/workbook.xml.rels'] ? files['xl/_rels/workbook.xml.rels'].toString('utf8') : '';
    var relRe = /<Relationship([^>]*)\/>/g, rm;
    while ((rm = relRe.exec(relXml)) !== null) {
        var idm = /Id="([^"]+)"/.exec(rm[1]);
        var tgm = /Target="([^"]+)"/.exec(rm[1]);
        if (idm && tgm) rels[idm[1]] = tgm[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    }

    var sheets = [];
    var shRe = /<sheet\b([^>]*)\/?>/g, sm;
    while ((sm = shRe.exec(wbXml)) !== null) {
        var nm = /name="([^"]*)"/.exec(sm[1]);
        var rid = /r:id="([^"]+)"/.exec(sm[1]);
        if (!nm) continue;
        sheets.push({ name: decodeEntities(nm[1]), target: rid && rels[rid[1]] ? rels[rid[1]] : null });
    }

    function sheet(which) {
        var s = null;
        if (typeof which === 'number') s = sheets[which];
        else {
            var want = String(which).toLowerCase();
            for (var i = 0; i < sheets.length; i++) {
                if (sheets[i].name.toLowerCase() === want) { s = sheets[i]; break; }
            }
            if (!s) {
                for (var j = 0; j < sheets.length; j++) {
                    if (sheets[j].name.toLowerCase().indexOf(want) >= 0) { s = sheets[j]; break; }
                }
            }
        }
        if (!s) return null;
        var path = s.target ? 'xl/' + s.target : null;
        var buf2 = path && files[path] ? files[path] : null;
        if (!buf2) {
            var idx = sheets.indexOf(s) + 1;
            buf2 = files['xl/worksheets/sheet' + idx + '.xml'];
        }
        if (!buf2) return null;
        return parseSheet(buf2.toString('utf8'), strings);
    }

    return { sheetNames: sheets.map(function(s) { return s.name; }), sheet: sheet };
}

// ---- Large sheets -------------------------------------------------------------------
// The AER ST37 surface-hole workbook has a 211 MB sheet1.xml. read() would turn that into a
// single 211 MB JavaScript string and run regexes over it — near Node's string ceiling and
// pointlessly slow. This walks the inflated BUFFER for row boundaries and decodes only one row
// at a time, so peak memory is the inflated sheet plus a few KB.
//
// Calls onRow(cells, rowIndex). Return false from onRow to stop early.
function eachRow(buf, sheetMatch, onRow) {
    var files = unzip(buf);
    var strings = sharedStrings(files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : null);

    // Resolve the sheet the same way read() does, then fall back to sheet1.
    var target = null;
    var wbXml = (files['xl/workbook.xml'] || Buffer.alloc(0)).toString('utf8');
    var rels = {};
    var relXml = files['xl/_rels/workbook.xml.rels'] ? files['xl/_rels/workbook.xml.rels'].toString('utf8') : '';
    var relRe = /<Relationship([^>]*)\/>/g, rm;
    while ((rm = relRe.exec(relXml)) !== null) {
        var idm = /Id="([^"]+)"/.exec(rm[1]), tgm = /Target="([^"]+)"/.exec(rm[1]);
        if (idm && tgm) rels[idm[1]] = tgm[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    }
    var shRe = /<sheet\b([^>]*)\/?>/g, sm, idx = 0;
    while ((sm = shRe.exec(wbXml)) !== null) {
        idx++;
        var nm = /name="([^"]*)"/.exec(sm[1]);
        if (!nm) continue;
        var match = sheetMatch === undefined || sheetMatch === null ||
            (typeof sheetMatch === 'number' ? (idx - 1) === sheetMatch
                : nm[1].toLowerCase().indexOf(String(sheetMatch).toLowerCase()) >= 0);
        if (!match) continue;
        var rid = /r:id="([^"]+)"/.exec(sm[1]);
        var p = rid && rels[rid[1]] ? 'xl/' + rels[rid[1]] : 'xl/worksheets/sheet' + idx + '.xml';
        target = files[p] || files['xl/worksheets/sheet' + idx + '.xml'];
        break;
    }
    if (!target) target = files['xl/worksheets/sheet1.xml'];
    if (!target) throw new Error('no sheet found');

    var pos = 0, n = 0;
    for (;;) {
        var start = target.indexOf('<row', pos);
        if (start < 0) break;
        var end = target.indexOf('</row>', start);
        // A row with no cells is written self-closing (<row .../>), which has no </row>.
        var selfClose = target.indexOf('/>', start);
        if (end < 0 || (selfClose >= 0 && selfClose < end && selfClose < target.indexOf('>', start) + 1)) {
            pos = start + 4;
            continue;
        }
        if (end < 0) break;
        var chunk = target.toString('utf8', start, end);
        if (onRow(parseRowCells(chunk, strings), n++) === false) return n;
        pos = end + 6;
    }
    return n;
}

// Same cell semantics as parseSheet, for a single row's markup.
function parseRowCells(rowXml, strings) {
    var cells = [];
    CELL_RE.lastIndex = 0;
    var m;
    while ((m = CELL_RE.exec(rowXml)) !== null) {
        var attrs = m[1] !== undefined ? m[1] : m[2];
        var body = m[3] === undefined ? '' : m[3];
        var ref = /r="([A-Z]+)\d+"/.exec(attrs);
        if (ref) {
            var col = 0, letters = ref[1];
            for (var i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
            col -= 1;
            while (cells.length < col) cells.push('');
        }
        var type = /t="([^"]+)"/.exec(attrs);
        type = type ? type[1] : null;
        if (type === 'inlineStr') {
            var its = body.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
            cells.push(decodeEntities(its.map(function(t) {
                return t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '');
            }).join('')));
            continue;
        }
        var v = /<v>([\s\S]*?)<\/v>/.exec(body);
        if (!v) { cells.push(''); continue; }
        if (type === 's') {
            var si = parseInt(v[1], 10);
            cells.push(strings[si] === undefined ? '' : strings[si]);
        } else {
            cells.push(decodeEntities(v[1]));
        }
    }
    return cells;
}

module.exports = { read: read, unzip: unzip, eachRow: eachRow };
