/* The blog pipeline: front matter, the markdown subset, and the draft gate.
 *
 * WHY THIS SUITE IS STRICTER THAN IT LOOKS
 * A post is the first content on this site that is not hand-written into markup, and once the
 * /post command exists it is the first content not written by a person at all. Three things
 * follow from that and each one is guarded below:
 *
 *   1. The body is untrusted text. It is escaped before any markup is applied, and a link href
 *      is checked against a scheme allowlist. An agent reading the open web will eventually
 *      paste something back, and "it came from a news site" is not a safety property.
 *   2. Validation must refuse rather than repair. A post with a rolled date or a slug that
 *      collides with hosting.html is a mistake, and quietly fixing it hides the mistake.
 *   3. The draft gate protects publication. It is the one thing standing between a generated
 *      file and an indexed page, so it gets the same treatment the payment guards get.
 */

const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const B = require(path.join(REPO_ROOT, 'site', 'tools', 'build-blog.js'));

const SITE = path.join(REPO_ROOT, 'site');
const POSTS = path.join(SITE, 'posts');
/* Written out by hand rather than renamed. This file is excluded from
   tools/rename-brand.js — it holds the list of tokens that must NOT appear anywhere, and a
   rename would rewrite that list to check for the current brand, leaving a guard that passes
   forever and guards nothing. The cost of the exclusion is that the file's own legitimate
   references are updated here instead. */
const BASE = 'https://protonminingco.com';

let pass = 0, fail = 0;
function ok(cond, label, note) {
    if (cond) { pass++; console.log('  ok    ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (note ? '   ' + note : '')); }
}
function eq(a, b, label) {
    ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
/* Asserts the validator refuses, and that it refuses for the stated reason rather than by
   happening to trip over something else on the way. */
function refuses(raw, because, label) {
    let msg = null;
    try { B.parseFrontMatter('t.md', raw); } catch (e) { msg = e.message; }
    ok(msg !== null && msg.toLowerCase().indexOf(because.toLowerCase()) >= 0, label,
       msg === null ? 'it was ACCEPTED' : 'refused, but for: ' + msg);
}

function fm(over) {
    const m = Object.assign({
        title: 'A title', slug: 'a-slug', date: '2026-08-23', summary: 'A summary.'
    }, over || {});
    const lines = ['---'];
    Object.keys(m).forEach((k) => { if (m[k] !== null) lines.push(k + ': ' + m[k]); });
    lines.push('---', '', 'Body text.');
    return lines.join('\n');
}

console.log('=== front matter refuses what it cannot trust ===');
{
    ok(B.parseFrontMatter('t.md', fm()).meta.title === 'A title', 'a good post parses');

    refuses('no fence at all', 'front-matter fence', 'a post with no front matter is refused');
    refuses('---\ntitle: x\n', 'never closed', 'unclosed front matter is refused');
    refuses(fm({ title: null }), 'missing "title"', 'a post with no title is refused');
    refuses(fm({ summary: null }), 'missing "summary"', 'and none with no summary');

    /* A typo in a key is an intention that would otherwise be silently dropped: "publised:
       true" must not leave a post quietly unpublished. */
    refuses(fm({ publised: 'true' }), 'unknown front-matter key',
            'a misspelled key is refused rather than ignored');
    refuses('---\ntitle: a\ntitle: b\nslug: s\ndate: 2026-01-01\nsummary: s\n---\n',
            'duplicate', 'a duplicated key is refused');

    refuses(fm({ date: '23/08/2026' }), 'YYYY-MM-DD', 'a date in the wrong format is refused');
    /* V8 rolls 2026-02-31 forward to 3 March and reports no error. A rolled date is a typo. */
    refuses(fm({ date: '2026-02-31' }), 'not a real day', 'and a date that does not exist');

    refuses(fm({ slug: 'Not A Slug' }), 'slug must be', 'a slug with spaces is refused');
    refuses(fm({ slug: '-leading' }), 'slug must be', 'and one with a leading hyphen');

    /* THE FLAT NAMESPACE. Posts live beside the hand-authored pages so that the stamper and the
       duplicate-id check cover them for free; the price is that a slug could overwrite a page. */
    refuses(fm({ slug: 'hosting' }), 'collides', 'a slug that would overwrite hosting.html');
    refuses(fm({ slug: 'index' }), 'collides', 'or the home page');

    refuses(fm({ status: 'live' }), 'status must be', 'an invented status is refused');
    refuses(fm({ summary: 'x'.repeat(161) }), 'under 160',
            'a summary too long for a search result is refused');
    refuses(fm({ sources: 'javascript:alert(1)' }), 'not an http', 'a non-http source is refused');

    eq(B.parseFrontMatter('t.md', fm()).meta.status, 'draft',
       'a post with no status is a draft, not published');
    const tagged = B.parseFrontMatter('t.md', fm({ tags: 'economics, hardware' })).meta;
    eq(tagged.tags.join('|'), 'economics|hardware', 'tags split on commas and trim');
}

console.log('\n=== the body is escaped before anything else touches it ===');
{
    /* This is the whole safety property. Every inline rule runs on already-escaped text, so
       there is no ordering in which a tag survives. */
    const evil = B.markdown('<script>alert(1)</script>', 't.md');
    ok(evil.indexOf('<script') < 0, 'a script tag in the body does not survive as a tag');
    ok(evil.indexOf('&lt;script&gt;') >= 0, 'it renders as text');

    ok(B.inline('a & b', 't.md').indexOf('&amp;') >= 0, 'an ampersand is escaped');
    ok(B.inline('say "hi"', 't.md').indexOf('&quot;') >= 0, 'a quote is escaped');
    ok(B.inline('<img onerror=x>', 't.md').indexOf('<img') < 0, 'so is an image tag');

    /* ESCAPED EXACTLY ONCE INSIDE A CODE SPAN, asserted as the exact string rather than as the
       absence of a tag.

       The earlier version of this test only checked that "<b>" did not appear — which
       DOUBLE-escaped output satisfies perfectly, and the code was double-escaping. Spans are cut
       out of text esc() has already been over, and esc() ran again on the way back, so `<b>`
       reached the page as the literal characters &lt;b&gt; and `a & b` as "a &amp; b". An
       assertion about what is missing cannot see a bug that adds something. */
    eq(B.inline('use `<b>bold</b>` here', 't.md'),
       'use <code>&lt;b&gt;bold&lt;/b&gt;</code> here',
       'a code span is escaped exactly once');
    eq(B.inline('`a & b`', 't.md'), '<code>a &amp; b</code>',
       'and an ampersand inside one is not double-escaped');

    /* A code span must not then be read as markup: `**not bold**` is a literal. */
    const lit = B.inline('`**x**`', 't.md');
    ok(lit.indexOf('<strong>') < 0, 'markup inside a code span is left alone');

    /* Fenced code is never inline-parsed at all. */
    const fence = B.markdown('```\n<b>x</b> **y**\n```', 't.md');
    ok(fence.indexOf('<pre') >= 0, 'a fence becomes a pre block');
    ok(fence.indexOf('<b>') < 0 && fence.indexOf('<strong>') < 0,
       'and nothing inside it is interpreted');
}

console.log('\n=== links are checked, not trusted ===');
{
    const ext = B.inline('[x](https://example.com/a)', 't.md');
    ok(ext.indexOf('rel="noopener nofollow"') >= 0, 'an external link gets rel="noopener nofollow"');
    ok(ext.indexOf('target="_blank"') >= 0, 'and opens in a new tab');

    const rel = B.inline('[x](calculator.html)', 't.md');
    ok(rel.indexOf('href="calculator.html"') >= 0, 'a relative link is kept as written');
    ok(rel.indexOf('nofollow') < 0, 'and is not nofollowed — it is our own page');

    /* javascript: in an href is a script tag with extra steps, and this text will eventually be
       written by an agent reading the open web. */
    let threw = false;
    try { B.inline('[x](javascript:alert(1))', 't.md'); } catch (e) { threw = e.postError; }
    ok(threw, 'a javascript: href is refused outright');
    threw = false;
    try { B.inline('[x](data:text/html;base64,PHN2Zz4=)', 't.md'); } catch (e) { threw = e.postError; }
    ok(threw, 'and a data: href');
}

console.log('\n=== the markdown subset renders what it claims to ===');
{
    ok(B.markdown('## Heading', 't.md').indexOf('<h2>Heading</h2>') >= 0, 'h2 renders');
    ok(B.markdown('### Deeper', 't.md').indexOf('<h3>') >= 0, 'and h3');

    /* The title in the front matter is the page h1. A second h1 in the body gives the page two
       competing headline signals, which is a real SEO defect rather than a style preference. */
    let threw = false;
    try { B.markdown('# Title', 't.md'); } catch (e) { threw = e.postError; }
    ok(threw, 'a body h1 is refused — the front-matter title is the page h1');

    ok(B.markdown('- a\n- b', 't.md').indexOf('<ul>') >= 0, 'a bullet list renders');
    ok(B.markdown('> quoted', 't.md').indexOf('<blockquote>') >= 0, 'a blockquote renders');
    ok(B.markdown('---', 't.md').indexOf('<hr>') >= 0, 'a rule renders');
    ok(B.markdown('**b**', 't.md').indexOf('<strong>b</strong>') >= 0, 'bold renders');
    ok(B.markdown('*i*', 't.md').indexOf('<em>i</em>') >= 0, 'italic renders');

    /* WRAPPED LIST ITEMS. This one is here because it shipped broken: a numbered item running
       onto a second line closed the list, emitted the remainder as a stray paragraph, then
       opened a FRESH <ol> that restarted the numbering. A three-item list rendered 1, 1, 2. */
    const wrapped = B.markdown('1. first line\n   continued here\n2. second\n3. third', 't.md');
    eq((wrapped.match(/<ol>/g) || []).length, 1, 'a wrapped item does not split the list in two');
    eq((wrapped.match(/<li>/g) || []).length, 3, 'and the list still has three items');
    ok(wrapped.indexOf('first line continued here') >= 0, 'the wrap is joined onto its item');
    const wrappedUl = B.markdown('- one\n  more\n- two', 't.md');
    eq((wrappedUl.match(/<li>/g) || []).length, 2, 'same for a bullet list');

    /* Unknown syntax is left as escaped text rather than half-rendered. A construct that
         renders 90% correctly is worse than one that renders not at all, because the 10% ships
         looking deliberate. */
    const table = B.markdown('| a | b |\n| - | - |', 't.md');
    ok(table.indexOf('<table') < 0, 'an unsupported table is not half-rendered');
    ok(table.indexOf('|') >= 0, 'its source shows as text instead');
}

console.log('\n=== reading time and dates ===');
{
    eq(B.longDate('2026-08-23'), '23 August 2026', 'a date reads as a person would say it');
    /* Parsed by hand: new Date("2026-08-23") is UTC midnight, which is the 22nd in New York. */
    eq(B.longDate('2026-01-01'), '1 January 2026', 'and does not slip a day west of Greenwich');
    eq(B.readingMinutes('word '.repeat(400)), 2, '400 words is a two minute read');
    eq(B.readingMinutes('short'), 1, 'and nothing is ever a zero minute read');
}

console.log('\n=== the draft gate ===');
{
    /* The integration test. A temp post is written, the generator run for real, and every path
       that could lead a reader or a crawler to the page is checked. */
    const SLUG = 'zz-suite-draft-fixture';
    const FILE = path.join(POSTS, '2099-01-01-' + SLUG + '.md');
    const PAGE = path.join(SITE, SLUG + '.html');

    function build() {
        execFileSync('node', [path.join(SITE, 'tools', 'build-blog.js')],
                     { cwd: REPO_ROOT, stdio: 'pipe' });
        execFileSync('node', [path.join(SITE, 'tools', 'build-seo.js')],
                     { cwd: REPO_ROOT, stdio: 'pipe' });
    }
    function write(status) {
        fs.writeFileSync(FILE, ['---', 'title: Suite fixture', 'slug: ' + SLUG,
            'date: 2099-01-01', 'summary: A fixture the blog suite writes and removes.',
            'status: ' + status, '---', '', 'Body.'].join('\n'));
        build();
    }
    function read(f) { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }

    try {
        write('draft');
        const dPage = read(PAGE);
        ok(dPage.length > 0, 'a draft still renders to its own file, so it can be read');
        ok(/<meta name="robots" content="noindex/.test(dPage), 'and asks not to be indexed');
        ok(dPage.indexOf('bp-draft') >= 0, 'and says on the page that it is a draft');
        ok(read(path.join(SITE, 'blog.html')).indexOf(SLUG) < 0,
           'a draft is absent from the blog index');
        ok(read(path.join(SITE, 'sitemap.xml')).indexOf(SLUG) < 0,
           'and absent from the sitemap');
        /* AND ABSENT FROM THE RAIL on the hub page, which is the third path that leads to a
           post. Checked here, inside the test that actually creates a draft: the version of
           this assertion that lived elsewhere looped over the drafts that happen to exist and
           passed by finding none — a test that cannot fail is not a test. */
        ok(read(path.join(SITE, 'why-mining.html')).indexOf(SLUG) < 0,
           'and absent from the notes rail');

        write('published');
        const pPage = read(PAGE);
        /* While the launch hold is on, EVERY page is noindex including published posts, so the
           draft gate cannot be observed through that tag. What still distinguishes them is the
           banner, the index and the sitemap, all checked below. */
        const LAUNCH = require(path.join(SITE, 'tools', 'launch.js'));
        if (LAUNCH.INDEXABLE) {
            ok(!/content="noindex/.test(pPage), 'published, it no longer refuses indexing');
        } else {
            ok(/content="noindex/.test(pPage),
               'published, it still carries the site-wide launch noindex');
        }
        ok(pPage.indexOf('bp-draft') < 0, 'and the draft banner is gone');
        ok(read(path.join(SITE, 'blog.html')).indexOf(SLUG) >= 0,
           'it appears in the blog index');
        ok(read(path.join(SITE, 'sitemap.xml')).indexOf(BASE + '/' + SLUG + '.html') >= 0,
           'and in the sitemap, at the generator origin');
        ok(/content="noindex/.test(read(path.join(SITE, SLUG + '.html'))) === !LAUNCH.INDEXABLE,
           'and its indexability follows the launch flag, not the draft flag');

        /* GENERATED PAGES CARRY THE SAME HEAD AS HAND-WRITTEN ONES. seo-suite.js only walks the
           pages named as literals in build-nav.js, so without this a post could ship with no
           canonical and nothing would say so. */
        ok(pPage.indexOf('rel="canonical" href="' + BASE + '/' + SLUG + '.html"') >= 0,
           'a post page carries a canonical on the generator origin');
        ok(pPage.indexOf('<title>Suite fixture — Proton Mining</title>') >= 0,
           'and a title');
        ok(/<meta name="description" content="A fixture/.test(pPage), 'and a description');
        ok(pPage.indexOf('og:type" content="article"') >= 0, 'and declares itself an article');

        const blocks = pPage.split('application/ld+json');
        ok(blocks.length === 3, 'it carries two JSON-LD blocks', blocks.length - 1 + ' found');
        const ld = JSON.parse(blocks[1].slice(blocks[1].indexOf('>') + 1,
                                              blocks[1].indexOf('</script>')));
        eq(ld['@type'], 'BlogPosting', 'the first is a BlogPosting');
        eq(ld.datePublished, '2099-01-01', 'dated from the front matter');
        eq(ld.url, BASE + '/' + SLUG + '.html', 'and self-referencing');
        ok(!('author' in ld), 'with no invented author — the site names none anywhere');

        /* Round-trip. The standing bar for every generator here. */
        const before = read(PAGE) + read(path.join(SITE, 'blog.html'));
        build();
        eq(read(PAGE) + read(path.join(SITE, 'blog.html')), before,
           'running the generator twice changes nothing');

        /* A deleted post takes its page with it, rather than leaving an orphan in the sitemap. */
        fs.unlinkSync(FILE);
        build();
        ok(!fs.existsSync(PAGE), 'removing the post removes its generated page');
        ok(read(path.join(SITE, 'sitemap.xml')).indexOf(SLUG) < 0, 'and its sitemap entry');
    } finally {
        if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
        if (fs.existsSync(PAGE)) fs.unlinkSync(PAGE);
        build();
    }
}

console.log('\n=== the two new pages are registered in both generators ===');
{
    /* seo-suite.js cross-checks these two lists against each other; this checks the pages are
       actually in them, which that test cannot tell from a pair of empty lists. */
    const nav = fs.readFileSync(path.join(SITE, 'tools', 'build-nav.js'), 'utf8');
    const seo = fs.readFileSync(path.join(SITE, 'tools', 'build-seo.js'), 'utf8');
    for (const p of ['blog.html', 'why-mining.html']) {
        ok(nav.indexOf("'" + p + "'") >= 0, p + ' is in the nav generator');
        ok(seo.indexOf("'" + p + "'") >= 0, p + ' is in the sitemap generator');
    }
    /* ONE NAV SLOT FOR BOTH, NOT TWO. The nav is already wide enough that its breakpoints had
       to be re-measured to stop the site scrolling sideways at 1280; a ninth item would put it
       back over. Sliced to the nav-links block, because the CTA table and the two footer
       columns further down this same file are full of hrefs that are not nav items. */
    const block = nav.slice(nav.indexOf('<div class="nav-links">'), nav.indexOf('</nav>'));
    const links = (block.match(/<a[\s]/g) || []).length;
    ok(links <= 11, 'the nav is no wider than it was measured to fit', links + ' anchors');
    ok(block.indexOf('./why-mining.html') >= 0, 'and Learn is one of them');
    ok(block.indexOf('./blog.html') < 0,
       'while the blog is reached from that page rather than taking its own slot');
    ok(seo.indexOf('build-blog.js') >= 0,
       'the sitemap reads posts from the blog generator rather than a second parser');
}

console.log('=== the post command ===');
{
    /* The command is what a person actually drives; the generator is what it drives. If this
       breaks, posting breaks, regardless of how correct build-blog.js is. */
    const TOOL = path.join(SITE, 'tools', 'post.js');
    const TITLE = 'Zz Suite Command Fixture';
    const SLUG = 'zz-suite-command-fixture';
    let made = null;

    function run(args) {
        try {
            return { ok: true, out: execFileSync('node', [TOOL].concat(args),
                                                 { cwd: REPO_ROOT, encoding: 'utf8' }) };
        } catch (e) {
            return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
        }
    }

    try {
        const created = run(['new', TITLE]);
        ok(created.ok, 'new scaffolds a post');
        /* Found by looking in the directory rather than by parsing the command's output. The
           filename carries today's date, and a test that reconstructs it is a test that fails
           at midnight. */
        const hits = fs.readdirSync(POSTS).filter((f) => f.indexOf(SLUG) >= 0);
        eq(hits.length, 1, 'exactly one file was created', hits.join(', '));
        if (hits.length === 1) made = path.join(POSTS, hits[0]);

        ok(created.out.indexOf(SLUG) >= 0, 'and the command says where it put it');
        ok(made && fs.existsSync(made), 'the file is on disk');
        const src = made ? fs.readFileSync(made, 'utf8') : '';

        /* A TITLE BECOMES A SLUG WITHOUT SURPRISES. Capitals down, spaces to hyphens. */
        ok(src.indexOf('slug:     ' + SLUG) >= 0, 'the title is slugified predictably');
        ok(src.indexOf('title:    ' + TITLE) >= 0, 'and the title is kept verbatim');

        /* SCAFFOLDED AS A DRAFT, ALWAYS. A convenience command is exactly where the
           publication gate would get skipped for convenience. */
        ok(src.indexOf('status:   draft') >= 0, 'and it is a draft, not published');

        /* The scaffold summary must not be able to become a meta description. */
        const early = run(['publish', SLUG]);
        ok(!early.ok, 'publishing refuses while the summary is still scaffold text');
        ok(/summary is still the scaffold/.test(early.out), 'and says why', early.out.trim());

        /* Give it a real summary and try again. */
        fs.writeFileSync(made, src.replace(
            /summary:  .*/, 'summary:  A real one-sentence summary written for the fixture.'));

        const pub = run(['publish', SLUG]);
        ok(pub.ok, 'with a real summary it publishes', pub.out.trim());
        const page = path.join(SITE, SLUG + '.html');
        ok(fs.existsSync(page), 'the page exists');
        ok(fs.readFileSync(path.join(SITE, 'blog.html'), 'utf8').indexOf(SLUG) >= 0,
           'and it is on the index');
        ok(fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').indexOf(SLUG) >= 0,
           'and in the sitemap');
        /* Indexability follows the launch flag here too, not the publish state. While the
           hold is on, publishing moves a post into the index and the sitemap but every page on
           the site still carries noindex — the two gates are independent and both real. */
        const LAUNCH2 = require(path.join(SITE, 'tools', 'launch.js'));
        eq(/content="noindex/.test(fs.readFileSync(page, 'utf8')), !LAUNCH2.INDEXABLE,
           'and its indexability follows the launch flag');

        /* PUBLISHING REBUILDS EVERYTHING, INCLUDING THE STAMP. A command that writes a page
           and leaves the cache-busting hash stale ships a page that loads yesterday's CSS. */
        const stamp = require(path.join(REPO_ROOT, 'tools', 'build-asset-stamp.js'));
        const area = stamp.AREAS.filter((a) => a.name === 'site')[0];
        eq(stamp.current(area).join(','), stamp.expected(area).stamp,
           'and the asset stamp is current, so the stamper ran last');

        /* And back. Somebody will publish something early. */
        const un = run(['unpublish', SLUG]);
        ok(un.ok, 'unpublish puts it back to a draft');
        ok(fs.readFileSync(path.join(SITE, 'blog.html'), 'utf8').indexOf(SLUG) < 0,
           'and it leaves the index');
        ok(fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').indexOf(SLUG) < 0,
           'and the sitemap');
        ok(/content="noindex/.test(fs.readFileSync(page, 'utf8')),
           'and asks not to be indexed again');

        const listed = run(['list']);
        ok(listed.ok && listed.out.indexOf(SLUG) >= 0, 'list shows it');
        ok(/DRAFT/.test(listed.out), 'and marks it as a draft');

        /* An unknown slug is refused rather than silently doing nothing. */
        const nope = run(['publish', 'no-such-post-anywhere']);
        ok(!nope.ok, 'an unknown slug is refused');
        ok(/no post with slug/.test(nope.out), 'and the message says which slugs exist');
    } finally {
        if (made && fs.existsSync(made)) fs.unlinkSync(made);
        const page = path.join(SITE, SLUG + '.html');
        if (fs.existsSync(page)) fs.unlinkSync(page);
        try { execFileSync('node', [TOOL, 'build'], { cwd: REPO_ROOT, stdio: 'pipe' }); }
        catch (e) { /* reported by the assertions above if it matters */ }
    }
}

console.log('=== the argument page is navigable, and still honest ===');
{
    const wm = fs.readFileSync(path.join(SITE, 'why-mining.html'), 'utf8');

    /* THE ANSWER BEFORE THE ARGUMENT. The page was 6.5 screens on desktop and 10.5 on a phone
       with no way in but scrolling. Both questions are now answered at the top with jumps to
       the detail. */
    ok(wm.indexOf('class="wm-tldr"') >= 0, 'the page opens with the answer, not a preamble');

    /* EVERY JUMP RESOLVES. A dead fragment link is invisible: the browser simply does not
       move, and the reader assumes they mis-tapped. */
    const jumps = (wm.match(/href="#([a-z-]+)"/g) || []).map(h => h.slice(7, -1));
    ok(jumps.length >= 5, 'there are jump links', jumps.length + ' found');
    jumps.forEach(id => {
        ok(new RegExp('id="' + id + '"').test(wm), 'the jump to #' + id + ' has a target');
    });

    /* ANCHORS CLEAR THE FIXED NAV. Without scroll-margin-top a jump puts the heading under
       the nav bar, so the reader lands on the paragraph after the one they asked for. */
    const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
    ok(/\.wm-body h2\[id\][^{]*\{[^}]*scroll-margin-top/.test(css),
       'anchored headings clear the fixed nav');

    /* THE STRUCTURED GRIDS GET THE WIDTH. .wm-mechs was a grid with no grid-template-columns
       inside a 760px cap, so three cards stacked in a narrow column while 440px of the wrap sat
       empty. That single omission was most of the desktop scrolling, and nothing would have
       said so if it came back — it is not a broken layout, just a tall one. */
    ok(/\.wm-mechs\s*\{[^}]*grid-template-columns/.test(css),
       'the mechanism grid declares its columns');
    ok(/\.wm-vs\s*\{[^}]*grid-template-columns/.test(css),
       'and so does the comparison grid');
    ok(/\.wm-body\s*\{\s*max-width:\s*none/.test(css),
       'and the body no longer caps them at prose width');
    ok(/\.wm-body > p[^{]*\{[^}]*max-width:\s*64ch/.test(css),
       'while the running text is still capped for reading');

    /* THE MECHANISMS COLLAPSE, BUT THE GATE STAYS VISIBLE. 1,606px of the mobile page was
       these three cards. Collapsing them is only allowed because the closed summary carries
       the condition — styles.css says conditions must carry the same weight as claims, and a
       benefit shown with its condition hidden is an advertisement. */
    const mechs = wm.slice(wm.indexOf('class="wm-mechs"'), wm.indexOf('id="gates"'));
    eq((mechs.match(/<details class="wm-mech">/g) || []).length, 3,
       'the three mechanisms are disclosures');
    ok(mechs.indexOf('<details class="wm-mech" open>') < 0,
       'and they start closed, which is where the height saving is');
    const gates = (mechs.match(/<span class="wm-mech-gate">([^<]*)</g) || []);
    eq(gates.length, 3, 'each states its gate while closed');

    /* AND NO CLOSED SUMMARY STATES A FIGURE. Those live in [PLACEHOLDER] spans that are now
       behind a click; a summary quoting a number would be quoting an unverified one. */
    gates.forEach(g => {
        ok(!/[0-9]/.test(g.replace('wm-mech-gate', '')),
           'no figure in: ' + g.replace(/<[^>]*>/g, '').slice(0, 46));
    });

    /* The page still tells the reader the figures are unfilled, which is the only reason it is
       acceptable for them to be one click away. */
    ok(wm.indexOf('Every figure below renders as an orange placeholder') >= 0,
       'and the page still says every figure is placeheld');
    ok((wm.match(/class="ph"/g) || []).length >= 5, 'the placeholders are still there');

    /* <details> IS NATIVE. If any of this needed JavaScript, the collapse would be a blank
       section for anyone without it. */
    ok(wm.indexOf('wm-mech') >= 0 && wm.indexOf('addEventListener') < 0,
       'and none of it needs JavaScript');
}

console.log('\n=== no page is blank without JavaScript ===');
{
    /* styles.css sets .reveal { opacity: 0 } and only site.js ever adds .in, so with scripting
       off every .reveal block stays invisible — which on most pages here is the whole body.
       It hid for a long time because the reduced-motion query at styles.css:2426 already forces
       .reveal visible, so anyone testing with reduced motion saw a correct page.

       Verified in a real browser with script execution disabled: 0 invisible blocks on the home
       page, the argument page and a generated post. Pinned here so the next page added cannot
       ship without it. */
    const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
    ok(/\.reveal\s*\{[^}]*opacity:\s*0/.test(css),
       'the reveal animation still starts invisible (so the fallback is still needed)');

    const NEEDS = fs.readdirSync(SITE)
        .filter(f => /\.html$/.test(f) && !f.startsWith('_'));
    ok(NEEDS.length >= 12, 'found the pages', NEEDS.length + ' html files');

    const missing = NEEDS.filter(f => {
        const h = fs.readFileSync(path.join(SITE, f), 'utf8');
        if (h.indexOf('class="reveal') < 0 && h.indexOf(' reveal"') < 0) return false;
        return !/<noscript><style>\.reveal \{ opacity: 1; transform: none; \}<\/style><\/noscript>/.test(h);
    });
    eq(missing.length, 0, 'every page carrying .reveal has the noscript fallback',
       'without it: ' + missing.join(', '));

    /* GENERATED, NOT PASTED, in both generators that write pages — otherwise the next page
       added is the one that ships blank. */
    const nav = fs.readFileSync(path.join(SITE, 'tools', 'build-nav.js'), 'utf8');
    const blog = fs.readFileSync(path.join(SITE, 'tools', 'build-blog.js'), 'utf8');
    /* THE CALL, NOT THE WORD. Both of these read indexOf('noscript') at first, which stayed
       true when the call was deleted and only the helper's definition remained — and because
       the fallback was already written into every page on disk, nothing else noticed either.
       A guard that survives its own feature being switched off is not a guard. */
    ok(/html = ensureNoscript\(html/.test(nav),
       'build-nav.js actually calls it on every page it writes');
    ok(blog.indexOf('<noscript><style>.reveal') >= 0,
       'build-blog.js emits it into the post template');
}

console.log('=== the hub links back to the posts ===');
{
    /* THE LINK DIRECTION THAT WAS MISSING. Every post linked why-mining.html; why-mining.html
       linked no post. A page with inbound links and no outbound ones is a dead end for a
       crawler and for a reader, and it is the cheapest ranking work available on this site. */
    const hub = fs.readFileSync(path.join(SITE, 'why-mining.html'), 'utf8');
    const rail = hub.slice(hub.indexOf('notesrail:begin'), hub.indexOf('notesrail:end'));
    ok(rail.length > 0, 'the rail exists on the hub page');

    const live = B.readPosts().filter(p => p.meta.status === 'published');
    live.slice(0, 4).forEach(p => {
        ok(rail.indexOf(p.meta.href) >= 0, 'the rail links ' + p.meta.slug);
    });
    ok(rail.indexOf('./blog.html') >= 0, 'and the index');

    /* Drafts are kept out of it too — asserted in the draft-gate test above, which creates
       one rather than hoping one exists. */
    ok(/railItems\(live\)/.test(
        fs.readFileSync(path.join(SITE, 'tools', 'build-blog.js'), 'utf8')),
       'the rail is built from published posts, not all of them');

    /* GENERATED, so it cannot list a post that was deleted or miss one that was added. */
    const gen = fs.readFileSync(path.join(SITE, 'tools', 'build-blog.js'), 'utf8');
    ok(gen.indexOf('notesrail:begin') >= 0, 'build-blog.js owns the rail');
    ok(gen.indexOf('railItems') >= 0, 'and builds it from the same post list as the index');

    /* An <aside>, so a screen reader can skip it and a crawler can tell it from the argument. */
    ok(/<aside class="wm-rail"[^>]*aria-label/.test(hub),
       'it is an aside with a label, not an unmarked column of links');
}

console.log('\n=== the rail does not squeeze the argument ===');
{
    /* THE CASCADE TRAP, PINNED. The rail takes 240px off the content column, so the mechanism
       grid needs a smaller minimum to still sit three across. That override lived in a
       @media block ABOVE the base rule — and a media query adds no specificity, so the plain
       later rule won and the override never applied. The rail appeared, the mechanisms silently
       became two rows, and nothing looked broken. The page was just taller.

       Verified in a browser at 1180-1600px: one row. Pinned here as source order, which is the
       thing that was actually wrong. */
    const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
    const base = css.indexOf('.wm-mechs {');
    const override = css.indexOf('@media (min-width: 1180px)');
    ok(base >= 0 && override >= 0, 'both rules are present');
    ok(override > base,
       'the rail breakpoint is declared AFTER the grid it overrides, so it wins the tie',
       'override at ' + override + ', base at ' + base);
    ok(/@media \(min-width: 1180px\)[\s\S]{0,600}?\.wm-mechs \{ grid-template-columns/.test(css),
       'and it does re-declare the mechanism columns');
}

console.log('\n=== posts link each other ===');
{
    /* Post to post is the signal that says these pages are about the same subject. Shared tags
       decide it, so a tag typo makes two islands rather than one topic. */
    const gen = fs.readFileSync(path.join(SITE, 'tools', 'build-blog.js'), 'utf8');
    ok(gen.indexOf('function relatedTo') >= 0, 'the generator picks related posts');
    ok(/shared: p\.meta\.tags\.filter/.test(gen), 'by shared tags, not just by date');

    /* A SHARED TAG IS REQUIRED, not merely preferred. Without the filter the sort ran and the
       top two were taken unconditionally, so a post with no relative still got two. That was
       invisible while every post served one audience and obvious the moment they did not: a gas
       owner reading about Alberta interconnection was handed a post about buying ASICs. */
    ok(/\.filter\(\(x\) => x\.shared > 0\)/.test(gen),
       'and a post with no shared tag is not linked at all');

    /* Proven on the real posts rather than asserted about the code: no read-next link may cross
       between the energy-owner audience and the buy-side one. */
    const byTag = B.readPosts().filter(p => p.meta.status === 'published');
    const isEnergy = (p) => p.meta.tags.indexOf('energy-owner') >= 0;
    byTag.forEach(p => {
        const page = fs.readFileSync(path.join(SITE, p.meta.slug + '.html'), 'utf8');
        const i = page.indexOf('bp-rel');
        if (i < 0) return;
        const block = page.slice(i, page.indexOf('bp-next'));
        byTag.filter(o => o.meta.slug !== p.meta.slug).forEach(o => {
            if (block.indexOf(o.meta.href) < 0) return;
            ok(isEnergy(p) === isEnergy(o),
               p.meta.slug.slice(0, 26) + ' -> ' + o.meta.slug.slice(0, 26) + ' is same-audience',
               'an energy post and a buy-side post were linked to each other');
        });
    });
    ok(/status === 'published'/.test(gen.slice(gen.indexOf('function relatedTo'),
                                               gen.indexOf('function relatedTo') + 700)),
       'and never links a draft');

    const live = B.readPosts().filter(p => p.meta.status === 'published');
    if (live.length >= 2) {
        live.forEach(p => {
            const page = fs.readFileSync(path.join(SITE, p.meta.slug + '.html'), 'utf8');
            ok(page.indexOf('bp-rel') >= 0, p.meta.slug + ' has a read-next block');
            ok(page.indexOf(p.meta.href) < 0 ||
               page.slice(page.indexOf('bp-rel')).indexOf(p.meta.href) < 0,
               'and it does not link back to itself');
        });
    } else {
        ok(true, 'only one published post, so nothing to relate it to');
    }

    /* THE SCHEMA CARRIES WHAT A SEARCH ENGINE CAN USE, and nothing it cannot verify. */
    if (live.length) {
        const page = fs.readFileSync(path.join(SITE, live[0].meta.slug + '.html'), 'utf8');
        const i = page.indexOf('application/ld+json');
        const ld = JSON.parse(page.slice(page.indexOf('>', i) + 1, page.indexOf('</script>', i)));
        ok(typeof ld.wordCount === 'number' && ld.wordCount > 0, 'BlogPosting carries a wordCount');
        eq(ld.inLanguage, 'en', 'and a language');
        if (live[0].meta.tags.length) {
            eq(ld.keywords, live[0].meta.tags.join(', '), 'and its tags as keywords');
        }
        ok(!('author' in ld), 'and still invents no author');
    }
}

console.log('\n=== the post command publishes, and can take it back ===');
{
    /* The owner asked for posts to go live when written rather than waiting on a draft gate.
       What has to stay true is that the lever back down is one command and actually works —
       that is the whole safety story now. */
    const skill = fs.readFileSync(
        path.join(REPO_ROOT, '.claude', 'skills', 'post', 'SKILL.md'), 'utf8');
    ok(/Posts go live/.test(skill), 'the skill publishes rather than drafting');
    ok(skill.indexOf('post.js publish') >= 0, 'and says how');
    ok(skill.indexOf('unpublish') >= 0, 'and how to reverse it');
    /* The sourcing rules are what replaced the draft gate, so they must still be in there. */
    ok(/cannot be sourced/i.test(skill), 'and still refuses to publish an unsourced claim');
    ok(/status: draft/.test(skill),
       'with one case where it holds: something it genuinely cannot check');
}

console.log('=== the calculator page says what it is ===');
{
    /* A calculator's whole SEO problem is that the valuable part is an interface, and an
       interface is not text. Stripped of scripts and SVGs this page was 778 words, nearly all
       of them form labels, under an h1 reading "Run the numbers on your own setup." — good
       writing that tells a search engine nothing about the subject of the page. */
    const c = fs.readFileSync(path.join(SITE, 'calculator.html'), 'utf8');

    const title = (/<title>([^<]*)<\/title>/.exec(c) || [])[1] || '';
    ok(/bitcoin mining calculator/i.test(title), 'the title names what the page is', title);
    ok(title.length <= 60, 'and fits a search result', title.length + ' chars');

    const desc = (/<meta name="description" content="([^"]*)"/.exec(c) || [])[1] || '';
    ok(desc.length > 0 && desc.length <= 160, 'the description is not truncated',
       desc.length + ' chars');

    const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(c) || [])[1] || '';
    ok(/bitcoin mining/i.test(h1.replace(/<[^>]*>/g, ' ')),
       'and the h1 names it too', h1.replace(/<[^>]*>/g, ' ').trim());

    /* THE READABLE PART. Everything a crawler actually gets, with the machinery removed. */
    const text = c
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/g, ' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    ok(words >= 1000, 'there is enough on the page for a crawler to read', words + ' words');

    /* EVERY CAPABILITY NAMED ON THE PAGE EXISTS IN THE ENGINE. A page listing features it does
       not have is worse than a page with no text at all, and this section was written to be
       read by a search engine, which is exactly the situation where that temptation appears. */
    const eng = fs.readFileSync(path.join(SITE, 'calc-engine.js'), 'utf8');
    const CLAIMED = [
        ['buy-and-hold comparison', 'buyHoldNetGain'],
        ['the crossover period', 'overtakePeriod'],
        ['halvings on projected dates', 'getBlockReward'],
        ['difficulty growth', 'diffChangePerPeriod'],
        ['salvage value', 'salvagePct'],
        ['machine lifespan', 'lifespanMonths'],
        ['automatic replacement', 'autoReplace'],
        ['mining income tax', 'miningIncomeTaxRate'],
        ['capital gains tax', 'capitalGainsTaxRate'],
    ];
    CLAIMED.forEach(([what, sym]) => {
        ok(eng.indexOf(sym) >= 0, 'the engine really does model ' + what, sym + ' not found');
    });
    /* Sizing from gas volume lives in the page's own script, not the engine. */
    ok(fs.readFileSync(path.join(SITE, 'calculator.js'), 'utf8').indexOf('gasMcfDayToKw') >= 0,
       'and really does size a fleet from mcf per day');
}

console.log('=== the brand is Proton Mining, everywhere ===');
{
    /* THE SPLIT WORDMARK IS WHY THIS EXISTS. The nav renders the name across two elements:
       `<span class="brand-name">Proton <span>Mining Corp</span></span>`. A rename driven by
       phrase rules cannot see that — "Ion Mining Group" never appears as one string — so
       the short-name rule matched "Ion" and "Mining Group" was left where it was. The largest
       text on all seventeen pages read "Proton Mining Group", a company that does not exist.

       Nothing failed. Every test passed. It simply said the wrong name. So this asserts the
       RENDERED RESULT rather than the rules that produce it. */
    /* Both discarded names, not just the first. An intermediate pass used "Proton Mining
       Corp" and protonminingcorp.com; either surviving anywhere is the same failure as the Ion
       name surviving, and the wordmark is exactly where it would hide. */
    /* THE WORDMARK TOKENS ARE THE MARKUP FORM, not the bare phrase, and that distinction is
       load-bearing. "Mining Corp" on its own matched "Green Block Mining Corp" — a real
       company named in the Alberta post's AUC enforcement example — so the guard failed a
       correct page for containing the correct name of somebody else. Third parties are allowed
       to be called Mining Corp. Only OUR wordmark is not. */
    const OLD_TOKENS = [
        'Ion Mining', 'ionmininggroup', 'IonAuth', 'IonTheme', 'protonminingcorp',
        'Proton Mining Corp',
        '<span>Mining Group</span>', '<span>Mining Corp</span>',
    ];
    const pages = fs.readdirSync(SITE).filter(f => /[.]html$/.test(f) && !f.startsWith('_'));
    ok(pages.length >= 15, 'found the pages', pages.length + ' html files');

    let dirty = 0;
    pages.forEach(f => {
        const h = fs.readFileSync(path.join(SITE, f), 'utf8');
        OLD_TOKENS.forEach(t => { if (h.indexOf(t) >= 0) dirty++; });
    });
    eq(dirty, 0, 'no page carries any token from the old brand',
       dirty + ' occurrence(s) across ' + pages.length + ' pages');

    /* The wordmark itself, as the exact rendered string across both spans. */
    const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    ok(home.indexOf('<span class="brand-name">Proton <span>Mining</span></span>') >= 0,
       'the wordmark reads Proton Mining across both spans');

    /* The origin is written in one place and everything regenerates from it. */
    const seo = fs.readFileSync(path.join(SITE, 'tools', 'build-seo.js'), 'utf8');
    ok(seo.indexOf("https://protonminingco.com") >= 0,
       'the generator origin is the new domain');
    ok(home.indexOf('protonminingco.com') >= 0, 'and the canonicals follow it');

    /* WHAT DELIBERATELY DID NOT MOVE. Renaming any of these breaks something real, and the
       reason each survives belongs in front of whoever reads this next. */
    const fb = fs.readFileSync(path.join(REPO_ROOT, 'firebase-config.js'), 'utf8');
    ok(fb.indexOf('projectId: "ion-mining"') >= 0,
       'the Firebase project id is untouched: renaming the string would not rename the '
       + 'project, it would point auth at one that does not exist');

    const stmt = fs.readFileSync(path.join(REPO_ROOT, 'worker-portal', 'statement.js'), 'utf8');
    ok(stmt.indexOf('ion_economic') >= 0 && stmt.indexOf('ion_maintenance') >= 0,
       'stored attribution values are untouched, so records already in KV still read');
}

console.log('=== the drawings are visible on a phone ===');
{
    /* They were display:none below 900px, with the ordered list standing in for them — so
       most visitors, who are on a phone, got a bullet list where everybody else got a cutaway.

       Unhiding alone was not the fix and this is the number that says why: the viewBox is
       1280x470, which fitted to a 390px screen renders at 348x128, a scale of 0.272. It now
       sits in its own horizontal scroller at 820px, a scale of 0.641. Measured in a real
       browser at 390x844 on all three pages that carry one. */
    const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
    const i = css.indexOf('@media (max-width: 900px)');
    ok(i > 0, 'the mobile diagram block exists');
    const block = css.slice(i, css.indexOf('\n}', i));

    ok(!/[.]dg-wrap \{ display: none/.test(block),
       'the drawings are no longer hidden on a phone');
    ok(/overflow-x:\s*auto/.test(block), 'they get their own horizontal scroller');
    ok(/[.]dg-wrap [.]site-diagram\s*\{[^}]*width:\s*820px/.test(block),
       'at a width where the drawing is legible rather than fitted to the screen');

    /* PANNING BELONGS TO THE BROWSER. Without this the engine's pointermove handler and the
       scroller fight over every horizontal swipe, and the drawing rotates when the reader
       meant to scroll it. */
    ok(/touch-action:\s*pan-x/.test(block),
       'and a swipe scrolls it rather than rotating it');

    /* The callouts come off and the list stays: the drawing is the picture, the <ol> is the
       labels. Losing the list too would leave the drawing unlabelled. */
    ok(/[.]dg-callout \{ display: none/.test(block), 'the pinned callout bubbles come off');
    ok(/[.]dg-list \{ display: block/.test(block), 'and the ordered list stays as the labels');

    /* Every page carrying a drawing carries the list for it, or the labels are simply gone. */
    ['index.html', 'energy.html', 'hosting.html'].forEach(f => {
        const h = fs.readFileSync(path.join(SITE, f), 'utf8');
        const wraps = (h.match(/class="dg-wrap/g) || []).length;
        const lists = (h.match(/class="dg-list/g) || []).length;
        ok(wraps > 0 && lists >= wraps,
           f + ': every drawing has a list to label it',
           wraps + ' drawings, ' + lists + ' lists');
    });
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('  blog-suite: ALL OK');
