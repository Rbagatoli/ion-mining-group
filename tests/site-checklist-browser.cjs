/* Standalone source-page check, including actual Letter/A4 PDF pagination.
 * Uses the existing local browser harness dependencies, never a production form. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const { PDFDocument } = require(process.env.PDF_LIB_PATH || 'C:/Users/rbaga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdf-lib');
const root = path.resolve(__dirname, '../site');
const out = path.resolve(__dirname, '../tools/.cache/checklist-qa');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pdfs: [], errors: [] };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end();
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
});
let browser;
(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(origin + '/site-screening-checklist.html');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.checklist-table tbody tr').count(), 12);
    const printButton = page.getByRole('button', { name: 'Print or save as PDF' });
    assert.ok(await printButton.isVisible());
    await printButton.focus();
    assert.notEqual(await printButton.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    await page.evaluate(() => { window.syntheticPrints = 0; window.print = () => window.syntheticPrints++; });
    await printButton.press('Enter');
    assert.equal(await page.evaluate(() => window.syntheticPrints), 1);
    report.checks.push('One H1, twelve accessible rows, visible keyboard focus and a working print action');
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await page.locator('.checklist-table tbody tr:visible').count(), 12);
        await page.screenshot({ path: path.join(out, 'mobile-' + width + '.png'), fullPage: true });
        report.checks.push(width + 'px: all rows visible without horizontal page overflow');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: 'print' });
    report.printFonts = await page.locator('.checklist-sheet').first().evaluate((el) => ({
        body: parseFloat(getComputedStyle(el).fontSize), table: parseFloat(getComputedStyle(el.querySelector('td')).fontSize),
    }));
    assert.ok(report.printFonts.body >= 14 && report.printFonts.table >= 14, 'print body/table text is at least 10.5pt');
    assert.equal(await page.locator('.nav').isVisible(), false);
    assert.equal(await page.locator('.checklist-tools').isVisible(), false);
    for (const format of ['Letter', 'A4']) {
        const pdf = await page.pdf({ path: path.join(out, 'screening-checklist-' + format + '.pdf'), format, scale: 1, printBackground: false, displayHeaderFooter: false });
        const pages = (await PDFDocument.load(pdf)).getPageCount();
        report.pdfs.push({ format, pages, scale: 1 });
        assert.equal(pages, 2, format + ' must fit exactly two pages at 100%');
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
})().catch((error) => { report.failure = error.message; console.error(error); process.exitCode = 1; })
    .finally(async () => {
        fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    });
