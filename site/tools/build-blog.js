/* Turns site/posts/*.md into the blog index and one page per post.
 *
 *     node site/tools/build-blog.js
 *
 * The eighth generator, and it follows the same rules as the other seven: idempotent, no
 * dependencies, and a second run must report nothing changed. Run it AFTER build-nav.js (post
 * pages are generated whole, so they pick up a nav change on the next run of this) and BEFORE
 * build-seo.js, which reads the same posts to build the sitemap. The asset stamper still runs
 * last, as it always does.
 *
 * WHY POSTS SIT FLAT IN site/ AND NOT IN site/blog/
 * Every tool that walks this site globs site/*.html one level deep: the asset stamper, the
 * duplicate-id check, the contrast walk. A subdirectory would be invisible to all three, so
 * post pages would ship unstamped and unchecked and nothing would say so. Flat means every
 * existing guard covers a post the day it is written, for free. The cost is that a slug shares
 * a namespace with the hand-authored pages, so a collision is a hard error below rather than a
 * post quietly overwriting hosting.html.
 *
 * WHAT THIS FILE IS CAREFUL ABOUT
 * A post is the first content on this site not hand-written into markup, and once /post exists
 * it is the first content not written by a person at all. So the body is escaped before any
 * markup is applied, link hrefs are checked against a scheme allowlist, and a post is a draft
 * until somebody says otherwise.
 */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const POSTS = path.join(SITE, 'posts');
const INDEX_PAGE = path.join(SITE, 'blog.html');

const { nav, CTA, PAGES: NAV_PAGES } = require('./build-nav.js');
const LAUNCH = require('./launch.js');

/* Kept in step with build-seo.js by blog-suite.mjs: two origins for one page is the classic way
   to split its ranking between two addresses. */
const BASE = 'https://protonminingco.com';

const BEGIN = '<!-- blog:begin -->';
const END = '<!-- blog:end -->';

/* The rail on why-mining.html. Same posts, different shape, one source. */
const HUB_PAGE = path.join(SITE, 'why-mining.html');
const RAIL_BEGIN = '<!-- notesrail:begin -->';
const RAIL_END = '<!-- notesrail:end -->';
const RAIL_MAX = 4;

/* ---------- front matter ----------

   A fixed, tiny key list rather than YAML. Every key is known, so an unknown one is a typo
   worth failing on instead of a silently ignored intention -- "publised: true" should not
   quietly leave a post as a draft. */

const KEYS = ['title', 'slug', 'date', 'summary', 'tags', 'status', 'sources'];
const REQUIRED = ['title', 'slug', 'date', 'summary'];
const STATUSES = ['draft', 'published'];

/* THROWS RATHER THAN EXITING, so the suite can assert that a bad post is refused. A validator
   that can only be tested by killing the test process is a validator nobody tests, and these
   are the checks standing between an agent-written file and a published page. The CLI below
   catches and exits, so the behaviour on the command line is unchanged. */
function fail(file, msg) {
    const e = new Error('posts/' + file + ': ' + msg);
    e.postError = true;
    throw e;
}

function parseFrontMatter(file, raw) {
    const lines = raw.split(/\r?\n/);
    if (lines[0].trim() !== '---') fail(file, 'must start with a --- front-matter fence');
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { end = i; break; }
    }
    if (end < 0) fail(file, 'front matter is never closed with ---');

    const meta = {};
    for (let i = 1; i < end; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const c = line.indexOf(':');
        if (c < 0) fail(file, 'front-matter line ' + (i + 1) + ' has no colon: ' + line.trim());
        const key = line.slice(0, c).trim();
        const val = line.slice(c + 1).trim();
        if (KEYS.indexOf(key) < 0) {
            fail(file, 'unknown front-matter key "' + key + '". Known: ' + KEYS.join(', '));
        }
        if (meta[key] !== undefined) fail(file, 'duplicate front-matter key "' + key + '"');
        meta[key] = val;
    }

    REQUIRED.forEach((k) => {
        if (!meta[k]) fail(file, 'front matter is missing "' + k + '"');
    });

    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(meta.date)) {
        fail(file, 'date must be YYYY-MM-DD, got "' + meta.date + '"');
    }
    /* A rolled date is a typo, not a date. Date accepts 2026-02-31 and hands back 3 March. */
    const d = new Date(meta.date + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== meta.date) {
        fail(file, 'date "' + meta.date + '" is not a real day');
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug)) {
        fail(file, 'slug must be lowercase words joined by hyphens, got "' + meta.slug + '"');
    }

    /* THE FLAT NAMESPACE, GUARDED. A post slugged "hosting" would overwrite the hosting page on
       the next run, and the only symptom would be the marketing site quietly losing a page. */
    const reserved = Object.keys(NAV_PAGES).map((p) => p.replace(/\.html$/, ''));
    if (reserved.indexOf(meta.slug) >= 0) {
        fail(file, 'slug "' + meta.slug + '" collides with the page ' + meta.slug + '.html');
    }

    meta.status = meta.status || 'draft';
    if (STATUSES.indexOf(meta.status) < 0) {
        fail(file, 'status must be one of ' + STATUSES.join(', ') + ', got "' + meta.status + '"');
    }

    /* A title over about 60 characters is cut in a search result, and the cut lands wherever
       it lands. Warned rather than refused: a good title at 64 characters is better than a bad
       one at 58, and this is a judgement the writer should make with the number in front of
       them rather than have made for them. */
    if (meta.title.length > 60) {
        console.warn('posts/' + file + ': title is ' + meta.title.length + ' characters; '
                   + 'search results cut around 60, so the end may not show');
    }

    /* The description a search engine shows. Google truncates around 160 characters and a cut
       sentence reads as a broken page. */
    if (meta.summary.length > 160) {
        fail(file, 'summary is ' + meta.summary.length + ' characters; keep it under 160 so it '
                 + 'is not truncated in a search result');
    }

    meta.tags = (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    meta.sources = (meta.sources || '').split(',').map((t) => t.trim()).filter(Boolean);
    meta.sources.forEach((u) => {
        if (!/^https?:\/\//.test(u)) fail(file, 'source "' + u + '" is not an http(s) url');
    });

    return { meta: meta, body: lines.slice(end + 1).join('\n') };
}

/* ---------- markdown ----------

   A DELIBERATELY SMALL SUBSET: headings, paragraphs, lists, blockquotes, code, rules, and four
   inline forms. Anything else is left as escaped text rather than half-rendered. A full
   CommonMark implementation is a dependency this project does not take and an unbounded amount
   of edge case; a parser that renders 90% of a construct is worse than one that renders none of
   it, because the 10% ships looking deliberate. */

/* THE CODE-SPAN SENTINEL.

   `<0>`, and it is collision-proof by construction rather than by luck: esc() has already
   turned every `<` in the post into `&lt;` before a sentinel is inserted, so any `<` in the
   working text is one this function put there. The restore pattern below wants digits between
   the brackets, and the tags the later passes insert (`<a `, `<strong>`, `<em>`) begin with
   letters, so those cannot match it either.

   It was a literal NUL first. That worked, and it made this file report as BINARY to grep and
   every other tool that reads source — a real cost for no benefit, since the sentinel is
   provably unique without needing a byte nobody can type. */
function sentinel(i) { return '<' + i + '>'; }
var SPAN_BACK = /<([0-9]+)>/g;

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ESCAPED FIRST, ALWAYS. Every inline rule below runs on already-escaped text, so a post
   containing <script> is text no matter which rule touches it. Getting this order wrong is the
   whole vulnerability, so it is one function and there is no other path to inline markup. */
function inline(src, file) {
    let s = esc(src);

    /* Code spans first: their contents must not then be read as bold or a link. A placeholder
       keeps them out of the way of the later passes. */
    const spans = [];
    s = s.replace(/`([^`]+)`/g, (m, code) => {
        spans.push(code);
        return sentinel(spans.length - 1);
    });

    /* Links. THE SCHEME IS CHECKED, not assumed: javascript: in an href is a script tag with
       extra steps, and this text will eventually be written by an agent reading the open web. */
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
        const ok = /^https?:\/\//.test(href) || /^\.{0,2}\//.test(href) ||
                   /^[a-z0-9-]+\.html(?:#[\w-]+)?$/.test(href) || /^#[\w-]+$/.test(href);
        if (!ok) fail(file, 'link "' + href + '" is not an http(s), relative or in-page url');
        const ext = /^https?:\/\//.test(href);
        return '<a href="' + href + '"' +
               (ext ? ' rel="noopener nofollow" target="_blank"' : '') + '>' + text + '</a>';
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');

    /* NOT esc(spans[i]). The spans were cut out of `s`, which esc() had ALREADY run over, so
       escaping again turned `<b>` into &amp;lt;b&amp;gt; and rendered the entity source on screen
       instead of the characters. It read as safety and it was a display bug — and the test that
       was supposed to cover it only asserted that a raw tag was ABSENT, which double-escaped
       output satisfies perfectly. */
    return s.replace(SPAN_BACK, (m, i) => '<code>' + spans[+i] + '</code>');
}

function markdown(src, file) {
    const lines = src.split(/\r?\n/);
    const out = [];
    let i = 0;

    function flushList(tag, items) {
        out.push('<' + tag + '>');
        items.forEach((it) => out.push('  <li>' + inline(it, file) + '</li>'));
        out.push('</' + tag + '>');
    }

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        /* Fenced code. Never inline-parsed: a code sample is shown, not interpreted. */
        if (/^```/.test(line)) {
            const buf = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
            i++;
            out.push('<pre class="bp-code"><code>' + esc(buf.join('\n')) + '</code></pre>');
            continue;
        }

        if (/^(?:---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

        const h = /^(#{1,6})\s+(.*)$/.exec(line);
        if (h) {
            /* h1 is the post title, written by the page rather than the body. A second h1 in
               the body would give the page two competing headline signals. */
            const level = Math.max(2, h[1].length);
            if (h[1].length === 1) {
                fail(file, 'body uses "# " for a heading; the title in the front matter is the '
                         + 'page h1, so start body headings at "## "');
            }
            out.push('<h' + level + '>' + inline(h[2], file) + '</h' + level + '>');
            i++;
            continue;
        }

        if (/^>\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }
            out.push('<blockquote>' + inline(buf.join(' '), file) + '</blockquote>');
            continue;
        }

        /* Lists, with WRAPPED ITEMS SUPPORTED. An item that runs onto a second line is
           ordinary writing, and treating the wrap as a new block did real damage rather than
           just looking wrong: it closed the list, emitted the remainder as a stray paragraph,
           then opened a fresh <ol> that RESTARTED THE NUMBERING AT 1. A three-item list
           rendered 1, 1, 2.

           THE CONTINUATION RULE IS INDENTATION, deliberately. Markdown's lazy continuation
           also absorbs an unindented following line, which means a paragraph written straight
           after a list silently becomes part of its last bullet. An explicit rule is worth
           more here than compatibility with a spec this parser does not claim to implement. */
        const bullet = /^[-*]\s+/;
        const number = /^[0-9]+\.\s+/;
        for (const [re, tag] of [[bullet, 'ul'], [number, 'ol']]) {
            if (!re.test(line)) continue;
            const items = [];
            while (i < lines.length) {
                if (re.test(lines[i])) {
                    items.push(lines[i].replace(re, ''));
                    i++;
                } else if (items.length && /^\s+\S/.test(lines[i])) {
                    items[items.length - 1] += ' ' + lines[i].trim();
                    i++;
                } else {
                    break;
                }
            }
            flushList(tag, items);
            break;
        }
        if (bullet.test(line) || number.test(line)) continue;

        const buf = [];
        while (i < lines.length && lines[i].trim() &&
               !/^(?:#{1,6}\s|>\s?|[-*]\s|[0-9]+\.\s|```|---\s*$)/.test(lines[i])) {
            buf.push(lines[i]);
            i++;
        }
        out.push('<p>' + inline(buf.join(' '), file) + '</p>');
    }

    return out.join('\n');
}

/* ---------- reading ---------- */

function readPosts() {
    if (!fs.existsSync(POSTS)) return [];
    const files = fs.readdirSync(POSTS).filter((f) => /\.md$/.test(f)).sort();
    const seen = {};
    const posts = files.map((f) => {
        const parsed = parseFrontMatter(f, fs.readFileSync(path.join(POSTS, f), 'utf8'));
        if (seen[parsed.meta.slug]) {
            fail(f, 'slug "' + parsed.meta.slug + '" is already used by ' + seen[parsed.meta.slug]);
        }
        seen[parsed.meta.slug] = f;
        parsed.meta.file = f;
        parsed.meta.href = './' + parsed.meta.slug + '.html';
        parsed.meta.url = BASE + '/' + parsed.meta.slug + '.html';
        return parsed;
    });
    /* Newest first, which is what a reader expects and what the index renders. */
    posts.sort((a, b) => (a.meta.date < b.meta.date ? 1 : a.meta.date > b.meta.date ? -1 : 0));
    return posts;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

/* Parsed by hand rather than through Date, which would apply a timezone to a date that has
   none and can render 23 August as the 22nd west of Greenwich. */
function longDate(iso) {
    const p = iso.split('-');
    return String(+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
}

/* Words over 200 a minute. A computed figure, not a claim about the world, so it needs no
   source -- but it is rounded up, because "0 min read" is not a thing. */
function readingMinutes(body) {
    const words = body.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

module.exports = { parseFrontMatter, markdown, inline, esc, readPosts, longDate, readingMinutes };

if (require.main !== module) return;

/* Which other posts to point at from the foot of this one.
 *
 * SHARED TAGS FIRST, then most recent. A reader who got to the end of a post about difficulty
 * is more likely to want the other economics post than whatever happened to be published last,
 * and a crawler reads the same signal: links between posts on a subject say those posts are
 * about that subject.
 *
 * Drafts are never linked. Linking one would put an unpublished URL in front of a reader, and
 * a noindex page in front of a crawler that was told to follow it. */
function relatedTo(post, all) {
    const mine = post.meta.tags;
    return all
        .filter((p) => p.meta.slug !== post.meta.slug && p.meta.status === 'published')
        .map((p) => ({
            post: p,
            shared: p.meta.tags.filter((t) => mine.indexOf(t) >= 0).length
        }))
        /* SHARED TAGS OR NOTHING. This used to sort by shared count and then take the top
           two unconditionally, which meant a post with no relative at all still got two — and
           the moment the blog served a second audience, that showed. A gas owner reading about
           Alberta interconnection was handed "Three questions before you buy a miner", which is
           written for somebody with capital deciding between machines and coins. Two audiences,
           one link, no relationship.

           A post with nothing genuinely related now shows no read-next block. That is the
           correct outcome: an empty space is better than a confident wrong handoff. */
        .filter((x) => x.shared > 0)
        .sort((a, b) => (b.shared - a.shared) ||
                        (a.post.meta.date < b.post.meta.date ? 1 : -1))
        .slice(0, 2)
        .map((x) => x.post);
}

/* ---------- the pages ---------- */

function postPage(post, stamp, all) {
    const m = post.meta;
    const body = markdown(post.body, m.file);
    const mins = readingMinutes(post.body);
    const words = post.body.split(/\s+/).filter(Boolean).length;
    const related = relatedTo(post, all || []);

    /* BlogPosting, so a search result can show the date and the headline rather than guessing
       them. Only fields that are true: no author object, because the site names no author
       anywhere and inventing one would put a false claim in machine-readable form -- the same
       rule build-seo.js follows for the Organization block. */
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: m.title,
        description: m.summary,
        datePublished: m.date,
        dateModified: m.date,
        url: m.url,
        /* Real properties of this post, not decoration. wordCount and articleSection are
           things a search engine can use; anything it cannot verify is left out, the same rule
           build-seo.js follows for the Organization block. */
        wordCount: words,
        inLanguage: 'en',
        image: BASE + '/og/home.png',
        publisher: { '@type': 'Organization', name: 'Proton Mining', url: BASE + '/' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': m.url }
    };
    if (m.tags.length) {
        ld.keywords = m.tags.join(', ');
        ld.articleSection = m.tags[0];
    }
    const crumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE + '/blog.html' },
            { '@type': 'ListItem', position: 3, name: m.title, item: m.url }
        ]
    };

    const sources = m.sources.length
        ? ['      <div class="bp-sources">',
           '        <h2>Sources</h2>',
           '        <ol>',
           ...m.sources.map((u) =>
               '          <li><a href="' + esc(u) + '" rel="noopener nofollow" target="_blank">' +
               esc(u) + '</a></li>'),
           '        </ol>',
           '      </div>'].join('\n')
        : '';

    const tags = m.tags.length
        ? '        <div class="bp-tags">' +
          m.tags.map((t) => '<span class="bp-tag">' + esc(t) + '</span>').join('') + '</div>'
        : '';

    /* A draft is noindex AND says so on the page. Two mechanisms because they fail differently:
       the meta tag is for a crawler that finds the file, the banner is for the person who was
       sent the link and would otherwise have no way to know it is not live. */
    /* A post is noindexed when it is a draft, and ALSO while the whole site is on the
       launch hold. Two independent reasons, one tag, and it must not be emitted twice. */
    const draftMeta = (m.status === 'draft' || !LAUNCH.INDEXABLE)
        ? '<meta name="robots" content="noindex, nofollow">\n' : '';
    const draftBanner = m.status === 'draft'
        ? '      <div class="bp-draft"><strong>Draft.</strong> This post is not published: it is ' +
          'absent from the blog index and the sitemap, and asks not to be indexed. Set ' +
          '<code>status: published</code> in ' + esc('posts/' + m.file) + ' to publish it.</div>\n'
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)} — Proton Mining</title>
<meta name="description" content="${esc(m.summary)}">
${draftMeta}<link rel="canonical" href="${m.url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.summary)}">
<meta property="og:url" content="${m.url}">
<meta property="og:image" content="${BASE}/og/home.png">
<meta name="theme-color" content="#000000">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="./styles.css${stamp}">
<!-- .reveal is opacity:0 until site.js adds .in, so without this the post is a blank page
     between a nav and a footer. build-nav.js does the same for the hand-authored pages; a
     generated page is not in its registry, so it is done here too. -->
<noscript><style>.reveal { opacity: 1; transform: none; }</style></noscript>
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(crumbs, null, 2)}
</script>
</head>
<body>

${nav('', CTA['index.html'])}

<main>
  <article class="bp reveal">
    <div class="wrap wrap--narrow">
${draftBanner}      <div class="bp-meta">
        <a class="bp-back" href="./blog.html">All posts</a>
        <span class="bp-date">${longDate(m.date)}</span>
        <span class="bp-read">${mins} min read</span>
      </div>
      <h1>${esc(m.title)}</h1>
      <p class="lede">${esc(m.summary)}</p>
${tags}
      <div class="bp-body">
${body.split('\n').map((l) => (l ? '        ' + l : l)).join('\n')}
      </div>
${sources}
${related.length ? `      <nav class="bp-rel" aria-label="Related notes">
        <div class="bp-rel-head">Read next</div>
${related.map((r) => '        <a class="bp-rel-item" href="' + r.meta.href + '">' +
    '<span class="bp-rel-title">' + esc(r.meta.title) + '</span>' +
    '<span class="bp-rel-sum">' + esc(r.meta.summary) + '</span></a>').join('\n')}
      </nav>
` : ''}      <div class="bp-next">
        <h2>Working out whether machines beat buying the coin?</h2>
        <p>The comparison depends entirely on your assumptions, so we do not print one number
           and call it the answer. Put yours in and see where the crossover lands.</p>
        <div class="bp-next-links">
          <a class="btn btn--primary" href="./calculator.html">Run your own numbers</a>
          <a class="btn btn--ghost" href="./why-mining.html">Why own machines</a>
        </div>
      </div>
    </div>
  </article>
</main>

<!-- ===== FOOTER ===== -->
${footerFor()}

<script src="./site.js${stamp}"></script>
<script src="./cart.js${stamp}"></script>
</body>
</html>
`;
}

/* The footer, lifted from a page that already has one rather than written a second time here.
   privacy.html is the reference because it is the plainest page on the site: no page-specific
   markup to accidentally carry across. build-nav.js owns two of its columns and will keep
   rewriting them there, so this copy follows along on the next run of this generator. */
function footerFor() {
    const ref = fs.readFileSync(path.join(SITE, 'privacy.html'), 'utf8');
    const a = ref.indexOf('<footer');
    const b = ref.indexOf('</footer>');
    if (a < 0 || b < 0) {
        console.error('privacy.html: no footer to copy'); process.exit(1);
    }
    return ref.slice(a, b + '</footer>'.length)
              .replace(/\?v=[0-9a-f]+/g, '');   // the stamper puts these back
}

function indexCards(posts) {
    if (!posts.length) {
        return '      <p class="calc-hint">No posts yet.</p>';
    }
    return posts.map((p) => {
        const m = p.meta;
        return [
            '      <a class="bc" href="' + m.href + '">',
            '        <div class="bc-top">',
            '          <span class="bc-date">' + longDate(m.date) + '</span>',
            '          <span class="bc-read">' + readingMinutes(p.body) + ' min</span>',
            '        </div>',
            '        <h3 class="bc-title">' + esc(m.title) + '</h3>',
            '        <p class="bc-sum">' + esc(m.summary) + '</p>',
            m.tags.length
                ? '        <div class="bc-tags">' +
                  m.tags.map((t) => '<span class="bp-tag">' + esc(t) + '</span>').join('') +
                  '</div>'
                : '',
            '        <span class="bc-go">Read<span aria-hidden="true"> &rarr;</span></span>',
            '      </a>'
        ].filter(Boolean).join('\n');
    }).join('\n');
}

/* The rail's contents. Titles and dates only — a summary in a 240px gutter is a wall, and
   the card on blog.html is where a summary belongs. */
function railItems(posts) {
    if (!posts.length) {
        return '        <p class="wm-rail-empty">No notes yet.</p>';
    }
    return posts.slice(0, RAIL_MAX).map((p) => {
        const m = p.meta;
        return [
            '        <a class="wm-rail-item" href="' + m.href + '">',
            '          <span class="wm-rail-date">' + longDate(m.date) + '</span>',
            '          <span class="wm-rail-title">' + esc(m.title) + '</span>',
            '        </a>'
        ].join('\n');
    }).join('\n');
}

/* ---------- write ---------- */

/* Whatever stamp the pages already carry, so this generator does not fight the stamper. It
   writes ?v= back on its next run either way; matching here just means one fewer file churned. */
function currentStamp() {
    const ref = fs.readFileSync(path.join(SITE, 'privacy.html'), 'utf8');
    const m = /styles\.css(\?v=[0-9a-f]+)/.exec(ref);
    return m ? m[1] : '';
}

let posts;
try {
    posts = readPosts();
} catch (e) {
    if (!e.postError) throw e;
    console.error(e.message);
    process.exit(1);
}
const live = posts.filter((p) => p.meta.status === 'published');
const stamp = currentStamp();

let wrote = 0;

for (const post of posts) {
    const p = path.join(SITE, post.meta.slug + '.html');
    let next;
    try {
        next = postPage(post, stamp, posts);
    } catch (e) {
        if (!e.postError) throw e;
        console.error(e.message);
        process.exit(1);
    }
    const before = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (before !== next) { fs.writeFileSync(p, next); wrote++; }
}

/* A post file that was deleted or renamed leaves its page behind, still linked from nowhere and
   still in the sitemap. Generated pages are removed when their source goes, which is only safe
   because this generator owns the whole file rather than a block inside it. */
const owned = new Set(posts.map((p) => p.meta.slug + '.html'));
const stale = fs.readdirSync(SITE)
    .filter((f) => /\.html$/.test(f) && !NAV_PAGES[f] && !owned.has(f) && f !== 'blog.html');
for (const f of stale) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    if (src.indexOf('"@type": "BlogPosting"') < 0) continue;   // not ours; leave it alone
    fs.unlinkSync(path.join(SITE, f));
    console.log('  removed ' + f + ' (its post is gone)');
    wrote++;
}

if (fs.existsSync(INDEX_PAGE)) {
    const html = fs.readFileSync(INDEX_PAGE, 'utf8');
    const a = html.indexOf(BEGIN);
    const b = html.indexOf(END);
    if (a < 0 || b < 0 || b < a) {
        console.error('blog.html: blog markers missing or out of order');
        process.exit(1);
    }
    /* ONLY PUBLISHED POSTS. A draft renders to its own page so it can be read and sent, and is
       absent from every path that leads to it. */
    const next = html.slice(0, a) + BEGIN + '\n' + indexCards(live) + '\n    ' +
                 html.slice(b);
    if (next !== html) { fs.writeFileSync(INDEX_PAGE, next); wrote++; }
} else {
    console.log('  blog.html does not exist yet; skipping the index');
}

/* The rail, in the same pass as the index. Both come from the same list, and writing them
   together means the site cannot hold one that was regenerated and one that was not. */
if (fs.existsSync(HUB_PAGE)) {
    const hub = fs.readFileSync(HUB_PAGE, 'utf8');
    const ra = hub.indexOf(RAIL_BEGIN);
    const rb = hub.indexOf(RAIL_END);
    if (ra < 0 || rb < 0 || rb < ra) {
        console.error('why-mining.html: notes rail markers missing or out of order');
        process.exit(1);
    }
    const nextHub = hub.slice(0, ra) + RAIL_BEGIN + '\n' +
        '        <div class="wm-rail-head">Notes</div>\n' +
        railItems(live) + '\n' +
        '        <a class="wm-rail-all" href="./blog.html">All notes</a>\n        ' +
        hub.slice(rb);
    if (nextHub !== hub) { fs.writeFileSync(HUB_PAGE, nextHub); wrote++; }
}

const drafts = posts.length - live.length;
console.log('blog: ' + posts.length + ' post' + (posts.length === 1 ? '' : 's') +
            ' (' + live.length + ' published, ' + drafts + ' draft' + (drafts === 1 ? '' : 's') +
            ') — ' + (wrote ? wrote + ' file(s) rewritten' : 'unchanged'));
