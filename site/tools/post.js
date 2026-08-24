/* Blog posts from the command line.
 *
 *     node site/tools/post.js list                    what exists, and what is still a draft
 *     node site/tools/post.js new "A title here"      scaffold a draft
 *     node site/tools/post.js publish <slug>          draft -> published, and rebuild
 *     node site/tools/post.js unpublish <slug>        published -> draft, and rebuild
 *     node site/tools/post.js build                   rebuild everything in the right order
 *
 * WHY THIS EXISTS SEPARATELY FROM build-blog.js
 * build-blog.js is a generator: it reads posts and writes pages, and running it must never do
 * anything else. This is the thing a person drives. Keeping them apart means the generator
 * stays safe to run from a script, a test, or another generator, and this file can be as
 * chatty and as opinionated as it likes.
 *
 * THE BUILD ORDER IS THE POINT. Three generators have to run and the stamper has to be last,
 * or pages ship with a cache-busting hash that does not match what they load. Getting that
 * wrong is invisible until somebody's browser serves them yesterday's stylesheet, so it is
 * encoded here once rather than remembered each time.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = path.join(__dirname, '..');
const ROOT = path.join(SITE, '..');
const POSTS = path.join(SITE, 'posts');

const blog = require('./build-blog.js');

function say(s) { console.log(s); }
function die(s) { console.error('\n  ' + s + '\n'); process.exit(1); }

/* ---------- build ---------- */

const CHAIN = [
    ['site/tools/build-blog.js', 'pages and the index'],
    ['site/tools/build-seo.js', 'sitemap and robots'],
    /* LAST. It hashes every local asset and writes ?v= into every page, so anything that
       rewrites a page has to have already run. */
    ['tools/build-asset-stamp.js', 'cache-busting stamp'],
];

function build(quiet) {
    for (const [script, what] of CHAIN) {
        try {
            const out = execFileSync('node', [script], { cwd: ROOT, encoding: 'utf8' });
            if (!quiet) say('  ' + what.padEnd(24) + out.trim().split('\n').pop());
        } catch (e) {
            die('build failed at ' + script + '\n\n' + (e.stdout || '') + (e.stderr || ''));
        }
    }
}

/* ---------- helpers ---------- */

function load() {
    try { return blog.readPosts(); }
    catch (e) { die(e.postError ? e.message : String(e)); }
}

function find(slug) {
    if (!slug) die('which post? Run "node site/tools/post.js list" to see them.');
    const posts = load();
    const hit = posts.filter((p) => p.meta.slug === slug);
    if (!hit.length) {
        die('no post with slug "' + slug + '".\n  Have: ' +
            posts.map((p) => p.meta.slug).join(', '));
    }
    return hit[0];
}

/* The status line is rewritten in place rather than the file being regenerated, so nothing a
   person wrote can be lost to a round-trip through a parser that only keeps what it knows. */
function setStatus(post, status) {
    const file = path.join(POSTS, post.meta.file);
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split(/\r?\n/);
    let end = -1;
    for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === '---') { end = i; break; } }
    let found = false;
    for (let i = 1; i < end; i++) {
        if (/^status\s*:/.test(lines[i])) { lines[i] = 'status:   ' + status; found = true; break; }
    }
    if (!found) lines.splice(end, 0, 'status:   ' + status);
    fs.writeFileSync(file, lines.join('\n'));
}

function slugify(title) {
    return title.toLowerCase()
        .replace(/[‘’']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '');
}

/* Today, from the system clock, formatted as the front matter wants it. */
function today() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------- commands ---------- */

const CMD = {
    list() {
        const posts = load();
        if (!posts.length) return say('\n  No posts yet. Try: node site/tools/post.js new "A title"\n');
        say('');
        posts.forEach((p) => {
            const m = p.meta;
            const mark = m.status === 'published' ? '  live ' : '  DRAFT';
            say(mark + '  ' + m.date + '  ' + m.slug);
            say('          ' + m.title);
        });
        const drafts = posts.filter((p) => p.meta.status === 'draft').length;
        say('\n  ' + posts.length + ' post(s), ' + drafts + ' draft(s).');
        if (drafts) say('  Publish one with: node site/tools/post.js publish <slug>');
        say('');
    },

    new(title) {
        if (!title) die('give it a title:  node site/tools/post.js new "A title here"');
        const slug = slugify(title);
        if (!slug) die('that title has no usable characters in it');

        const date = today();
        const file = path.join(POSTS, date + '-' + slug + '.md');
        if (fs.existsSync(file)) die('already exists: posts/' + path.basename(file));

        if (!fs.existsSync(POSTS)) fs.mkdirSync(POSTS, { recursive: true });

        /* Written as a draft, always. The one-word gate is what keeps an unreviewed page off
           an indexed site, and a scaffolding command is exactly where it would get skipped. */
        fs.writeFileSync(file, [
            '---',
            'title:    ' + title,
            'slug:     ' + slug,
            'date:     ' + date,
            'summary:  ONE SENTENCE, UNDER 160 CHARACTERS. Becomes the meta description.',
            'tags:     ',
            'status:   draft',
            'sources:  ',
            '---',
            '',
            'Open with what happened and why it matters to somebody who owns machines.',
            '',
            '## A section',
            '',
            'Body. Supported: ## headings, - and 1. lists, > quotes, ``` fences, --- rules,',
            '**bold**, *italic*, `code`, [links](calculator.html). Not supported: tables,',
            'images, footnotes, nested lists, raw HTML. Do not start a heading with a single #.',
            '',
            'Every factual claim needs a source in the front matter and a link where it is made.',
            'Date-stamp every figure in the prose.',
            '',
        ].join('\n'));

        say('\n  posts/' + path.basename(file));
        say('  Edit it, then:  node site/tools/post.js publish ' + slug + '\n');
    },

    publish(slug) {
        const post = find(slug);
        if (post.meta.status === 'published') return say('\n  ' + slug + ' is already live.\n');
        if (/UNDER 160 CHARACTERS/.test(post.meta.summary)) {
            die('the summary is still the scaffold text. Write one before publishing.');
        }
        setStatus(post, 'published');
        say('\n  publishing ' + slug);
        build();
        say('\n  live at /' + slug + '.html, in the index and the sitemap.\n');
    },

    unpublish(slug) {
        const post = find(slug);
        if (post.meta.status === 'draft') return say('\n  ' + slug + ' is already a draft.\n');
        setStatus(post, 'draft');
        say('\n  unpublishing ' + slug);
        build();
        say('\n  it is a draft again: noindex, and out of the index and the sitemap.\n');
    },

    build() { say(''); build(); say(''); },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !CMD[cmd]) {
    say('\n  node site/tools/post.js list');
    say('  node site/tools/post.js new "A title here"');
    say('  node site/tools/post.js publish <slug>');
    say('  node site/tools/post.js unpublish <slug>');
    say('  node site/tools/post.js build\n');
    process.exit(cmd ? 1 : 0);
}
CMD[cmd](rest.join(' '));
