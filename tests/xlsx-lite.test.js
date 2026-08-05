// Regression tests for the minimal xlsx reader.
//
// These exist because of a bug that was silent, data-dependent, and corrupted a whole artifact
// before anything noticed. Every pipeline in this repo reads spreadsheets through this file, so a
// cell-alignment fault here becomes wrong numbers in committed data with no error anywhere.
var path = require('path');
var zlib = require('zlib');
var xlsx = require(path.join(__dirname, '..', 'tools', 'xlsx-lite.js'));

var pass = 0, fail = 0;
function ok(label, cond, extra) {
    if (cond) { pass++; return; }
    fail++;
    console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + JSON.stringify(extra)));
}
function eq(label, actual, expected) {
    ok(label + '  (expected ' + JSON.stringify(expected) + ')',
       JSON.stringify(actual) === JSON.stringify(expected), actual);
}

// ---- Build a real .xlsx in memory -------------------------------------------------------
// A hand-rolled zip so the test needs no fixture file and no dependencies. Stored (method 0)
// entries keep it simple; the reader handles both.
function crc32(buf) {
    var table = crc32.table;
    if (!table) {
        table = crc32.table = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeXlsx(files) {
    var names = Object.keys(files);
    var local = [], central = [], offset = 0;
    names.forEach(function (name) {
        var data = Buffer.from(files[name], 'utf8');
        var nameBuf = Buffer.from(name, 'utf8');
        var crc = crc32(data);
        var lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
        lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
        local.push(lh, nameBuf, data);

        var ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
        ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);
        offset += lh.length + nameBuf.length + data.length;
    });
    var localBuf = Buffer.concat(local), centralBuf = Buffer.concat(central);
    var eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(names.length, 8); eocd.writeUInt16LE(names.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(localBuf.length, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([localBuf, centralBuf, eocd]);
}

function workbook(sheetXml, sharedStringsXml) {
    var files = {
        'xl/workbook.xml': '<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': sheetXml
    };
    if (sharedStringsXml) files['xl/sharedStrings.xml'] = sharedStringsXml;
    return makeXlsx(files);
}

console.log('xlsx-lite');

// ---- THE BUG ----------------------------------------------------------------------------
// A self-closing empty cell followed immediately by a valued cell. The old pattern let the
// attribute group swallow the trailing slash, then ran forward to the NEXT cell's </c>, merging
// the two: the empty cell's column got the neighbour's value, and because the neighbour's t="s"
// was discarded along with its opening tag, a shared-string INDEX was emitted as a raw number.
//
// This is exactly the shape EPA's LMOP export produces, and it silently shifted columns in a
// committed artifact: a project's "shutdown date" became the number 79 (a string index), its
// type category went blank, and its megawatt rating moved a column.
(function () {
    var ss = '<sst><si><t>alpha</t></si><si><t>beta</t></si><si><t>gamma</t></si></sst>';
    var sheet =
        '<worksheet><sheetData>' +
        '<row r="1">' +
          '<c r="A1" t="s"><v>0</v></c>' +      // "alpha"
          '<c r="B1" s="8"/>' +                 // EMPTY, self-closing
          '<c r="C1" t="s"><v>1</v></c>' +      // "beta"  <- was being pulled into B
          '<c r="D1"><v>5.6</v></c>' +
        '</row>' +
        '<row r="2">' +
          '<c r="A2" s="1"/>' +                 // leading empty
          '<c r="B2" s="1"/>' +                 // two empties in a row
          '<c r="C2" t="s"><v>2</v></c>' +      // "gamma"
        '</row>' +
        '</sheetData></worksheet>';
    var rows = xlsx.read(workbook(sheet, ss)).sheet('Data');

    eq('a self-closing cell stays empty and does not steal its neighbour value',
       rows[0], ['alpha', '', 'beta', '5.6']);
    eq('consecutive empty cells keep every later column aligned',
       rows[1], ['', '', 'gamma']);
    ok('a shared-string index is never emitted as a raw number',
       rows[0].indexOf('1') < 0 && rows[0].indexOf(1) < 0, rows[0]);
})();

// ---- Column references ------------------------------------------------------------------
// Cells may be omitted entirely rather than written empty; the r= reference is what restores
// their position.
(function () {
    var sheet =
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1"><v>1</v></c><c r="E1"><v>5</v></c></row>' +
        '<row r="2"><c r="C2"><v>3</v></c></row>' +
        '<row r="3"><c r="AA3"><v>27</v></c></row>' +
        '</sheetData></worksheet>';
    var rows = xlsx.read(workbook(sheet)).sheet('Data');
    eq('omitted cells are restored as blanks from the column reference', rows[0], ['1', '', '', '', '5']);
    eq('a row starting mid-sheet is padded', rows[1], ['', '', '3']);
    eq('two-letter columns decode correctly (AA is index 26)', rows[2].length, 27);
    eq('and hold the right value', rows[2][26], '27');
})();

// ---- Types ------------------------------------------------------------------------------
(function () {
    var ss = '<sst><si><t>hello</t></si><si><t>a &amp; b</t></si><si><t>x</t><t>y</t></si></sst>';
    var sheet =
        '<worksheet><sheetData>' +
        '<row r="1">' +
          '<c r="A1" t="s"><v>0</v></c>' +
          '<c r="B1" t="s"><v>1</v></c>' +
          '<c r="C1" t="s"><v>2</v></c>' +
          '<c r="D1" t="inlineStr"><is><t>inline</t></is></c>' +
          '<c r="E1"><v>-3.25</v></c>' +
          '<c r="F1" t="s"><v>99</v></c>' +
        '</row>' +
        '</sheetData></worksheet>';
    var rows = xlsx.read(workbook(sheet, ss)).sheet('Data');
    eq('shared strings resolve', rows[0][0], 'hello');
    eq('entities are decoded', rows[0][1], 'a & b');
    eq('rich-text runs are concatenated', rows[0][2], 'xy');
    eq('inline strings are read', rows[0][3], 'inline');
    eq('numbers pass through as text', rows[0][4], '-3.25');
    eq('an out-of-range string index yields blank, not undefined', rows[0][5], '');
})();

// ---- Structure ---------------------------------------------------------------------------
(function () {
    var sheet = '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>';
    var wb = xlsx.read(workbook(sheet));
    eq('sheet names are listed', wb.sheetNames, ['Data']);
    ok('a sheet can be fetched by index', wb.sheet(0) !== null);
    ok('a sheet can be fetched by name, case-insensitively', wb.sheet('data') !== null);
    ok('an unknown sheet returns null', wb.sheet('nope') === null);
})();

// ---- eachRow shares the same cell parser ------------------------------------------------
// The streaming path exists for sheets too large to stringify. It had the identical bug, so it
// gets the identical test.
(function () {
    var ss = '<sst><si><t>alpha</t></si><si><t>beta</t></si></sst>';
    var sheet =
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="8"/><c r="C1" t="s"><v>1</v></c></row>' +
        '</sheetData></worksheet>';
    var got = [];
    xlsx.eachRow(workbook(sheet, ss), 'Data', function (cells) { got.push(cells); });
    ok('eachRow yielded a row', got.length === 1, got.length);
    if (got.length) {
        eq('eachRow handles self-closing cells identically', got[0], ['alpha', '', 'beta']);
    }
})();

console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions' : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
