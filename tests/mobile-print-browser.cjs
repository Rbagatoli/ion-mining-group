/* Responsive print regression: synthetic DOM, fresh Chrome, no network or submissions.
 * Run: node tests/mobile-print-browser.cjs
 * Optional: PLAYWRIGHT_CORE_PATH and CHROME_EXECUTABLE_PATH.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH ||
    'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');

const file = path.resolve(__dirname, '../site/site.js');
const script = fs.readFileSync(file, 'utf8');
const marker = '/* Compact supporting detail on phones;';
const start = script.indexOf(marker);
assert.ok(start >= 0, 'Shared responsive controller marker must exist');
const responsiveController = script.slice(start);

const cases = [
    { name: 'phone to desktop', from: 390, to: 1440, open: false, expectedOpen: true },
    { name: 'desktop to phone', from: 1440, to: 390, open: true, expectedOpen: false },
    { name: 'open phone unchanged', from: 390, to: 390, open: true, expectedOpen: true },
    { name: 'closed phone unchanged', from: 390, to: 390, open: false, expectedOpen: false },
];

const fixture = `<!doctype html><html><head><meta charset="utf-8">
<style>.mobile-details>summary{display:none}@media(max-width:640px){.mobile-details>summary{display:block}}</style>
</head><body>
<p data-mobile-copy="Phone copy">Desktop copy</p>
<details class="mobile-details" data-mobile-details open>
  <summary>Open section</summary><div id="full">Important full content</div>
</details>
</body></html>`;

async function settle(page) {
    // Allow real matchMedia and queued native toggle events to run.
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_EXECUTABLE_PATH ||
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    const requests = [];
    const errors = [];
    try {
        for (const scenario of cases) {
            const context = await browser.newContext({
                viewport: { width: scenario.from, height: 844 },
                serviceWorkers: 'block',
                reducedMotion: 'reduce',
            });
            try {
                await context.route('**/*', route => {
                    requests.push(route.request().url());
                    return route.abort();
                });
                const page = await context.newPage();
                page.on('pageerror', error => errors.push(error.message));
                await page.setContent(fixture);
                await page.addScriptTag({ content: responsiveController });

                // No await between the disclosure change and beforeprint: its native
                // toggle event can still be pending when the print state is captured.
                await page.evaluate(open => {
                    document.querySelector('details').open = open;
                    window.dispatchEvent(new Event('beforeprint'));
                }, scenario.open);
                const printed = await page.evaluate(() => ({
                    open: document.querySelector('details').open,
                    copy: document.querySelector('p').textContent,
                }));
                assert.equal(printed.open, true, scenario.name + ': full detail during print');
                assert.equal(printed.copy, 'Desktop copy', scenario.name + ': full copy during print');

                await page.setViewportSize({ width: scenario.to, height: 844 });
                await settle(page);
                await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
                await settle(page);

                const result = await page.evaluate(() => ({
                    mobile: matchMedia('(max-width:640px)').matches,
                    open: document.querySelector('details').open,
                    summaryDisplay: getComputedStyle(document.querySelector('summary')).display,
                    contentVisible: document.querySelector('#full').checkVisibility(),
                    copy: document.querySelector('p').textContent,
                }));
                const mobile = scenario.to <= 640;
                assert.equal(result.mobile, mobile, scenario.name + ': final breakpoint');
                assert.equal(result.open, scenario.expectedOpen, scenario.name + ': restored disclosure');
                assert.equal(result.copy, mobile ? 'Phone copy' : 'Desktop copy', scenario.name + ': restored copy');
                assert.equal(result.summaryDisplay, mobile ? 'block' : 'none', scenario.name + ': summary visibility');
                assert.equal(result.contentVisible, scenario.expectedOpen, scenario.name + ': content visibility');
                console.log('ok ' + scenario.name);
            } finally {
                await context.close();
            }
        }
        assert.deepEqual(requests, [], 'Synthetic print checks must make no network requests');
        assert.deepEqual(errors, [], 'Responsive print checks must have no browser errors');
        console.log('4 responsive print scenarios passed; no network requests or browser errors.');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
