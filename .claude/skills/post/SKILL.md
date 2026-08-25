---
name: post
description: Research current bitcoin, mining or energy news and write an SEO-optimised blog post for the Proton Mining marketing site. Use when the user types /post, optionally with a topic, or asks for a new blog post about current news.
---

# /post — research and write a blog post

Write one post into `site/posts/`, build it, and report back. `/post` on its own picks the
angle; `/post <topic>` is steered by the user.

**Posts go live.** Write it, set `status: published`, build, and it is on the site — the
index, the sitemap, the rail on the Learn page. The owner asked for this explicitly and it is
their call.

What that costs you is any margin for a wrong figure, so the sourcing rules below are not
style guidance. Everything you publish is on a company's website under their name within a
minute of you writing it. If a claim cannot be sourced, the sentence does not go in.

If something genuinely cannot be checked and the post needs it anyway, set `status: draft`,
publish nothing, and say why in your report. That is the one case where you hold.

## Steps

1. **Research.** `WebSearch` for recent news. Prefer the last 30 days. Search more than once
   with different angles — a single query returns a single narrative.
2. **Pick an angle that touches this business.** Proton builds mining sites on stranded energy
   (landfill gas, flared gas, curtailed power), sells machines, and hosts the machines it
   sells. **It does not host hardware a customer sourced elsewhere** — that offer was
   withdrawn, and every trace of it was taken off the site on 25 August 2026. A post that
   invites readers to send in a fleet they already own is selling something that does not
   exist, and blog-suite.mjs will fail the build for it.
   Good: hashprice, difficulty, energy markets, curtailment, hardware cycles, regulation
   affecting hosting, halving mechanics. Bad: price predictions, generic "bitcoin hits $X"
   coverage, anything that reads like a newsletter nobody asked for.
3. **Read the sources properly.** `WebFetch` the two or three that matter. Do not write from
   search-result snippets — they routinely strip the qualifier that changes the meaning.
4. **Scaffold and write.**
   ```
   node site/tools/post.js new "The title you chose"
   ```
   Creates `site/posts/YYYY-MM-DD-<slug>.md` with the front matter filled in. Edit it: the
   summary, the tags, the sources, the body.

   **Tags matter more than they look.** They decide which post is linked from the foot of
   which other post, so reuse existing tags rather than inventing a synonym — `economics` and
   `mining-economics` as two tags means two islands. Run `node site/tools/post.js list` and
   look at what is already in use.
5. **Publish.**
   ```
   node site/tools/post.js publish <slug>
   ```
   Sets it live and runs the three generators in the order that matters — the asset stamper
   last, or pages ship with a cache-busting hash that does not match what they load.
6. **Test.** `node tests/site/run.js` — must be green. If it is not, fix it before reporting;
   the post is already live.
7. **Report**: the title, the angle, every source used, the URL, and anything you decided to
   leave out and why. If you held it as a draft, lead with that.

## The file

```
---
title:    Sentence case, under about 65 characters so it is not cut in a search result
slug:     lowercase-words-joined-by-hyphens
date:     YYYY-MM-DD
summary:  One sentence, under 160 characters. Becomes the meta description and the card blurb.
tags:     economics, energy
status:   draft
sources:  https://…, https://…
---

Body in the markdown subset below.
```

The generator **refuses** a post rather than repairing it: unknown keys, a date that is not a
real day, a slug that collides with an existing page, a summary over 160 characters, and a
non-http source are all hard errors. If the build fails, read the message and fix the file.

### The markdown subset

`## ###` headings · `- ` and `1. ` lists · `> ` quote · ` ``` ` fence · `---` rule ·
`**bold**` `*italic*` `` `code` `` `[text](url)`

Not supported, and left as literal text if you use it: tables, images, footnotes, nested lists,
HTML. **Do not start a heading with `# `** — the front-matter title is the page's h1 and a
second one is refused.

A list item that wraps onto another line must be **indented**, or it becomes a new block.

## Rules that are not negotiable

These are the difference between a useful command and a slow-motion credibility problem. The
site's whole convention is that nothing unverified ships looking confident.

- **Every factual claim carries a source.** In `sources:` and linked inline where it is made.
  If you cannot source it, cut the sentence.
- **Date-stamp every figure in the prose** — "as of 12 March 2026", not "currently". A post is
  read six months later, and an undated number becomes a false one by sitting still.
- **Never invent** a quote, a statistic, an attributed opinion, or a company's position.
- **No tax claims.** Tax lives on `why-mining.html`, which is reviewed and carries a
  disclaimer. A tax assertion loose in a news post cannot be kept current and nobody signed
  off on it.
- **Never state Proton's own figures** — power prices, capacity, machine prices, discounts. They
  live in `site/facilities.js`, `site/price-list.js` and `site/prepay.js`, they change, and a
  post repeating one is a second copy that will drift. Link
  `calculator.html` or `hosting.html` instead.
- **No price predictions**, from you or presented as ours.
- **Link `why-mining.html` at least once.** Internal linking from posts to the evergreen page
  is the part of this that actually helps ranking.

## Writing it so it can be found

Ranking is mostly not a thing you do to a post; it is a thing the post is. But these are real
and they are cheap:

- **Title under 60 characters.** Longer gets cut in a search result and the cut lands wherever
  it lands. The build warns you with the count.
- **The summary IS the meta description.** One sentence, under 160 characters, that would make
  somebody click. Not a topic label — "Network difficulty is down about 15% since January" beats
  "A look at difficulty trends".
- **Say the thing in the first paragraph.** Not background, not a definition of bitcoin. If a
  reader has to scroll to find out what the post is claiming, so does everyone else.
- **Two to four `##` sections**, each one a real claim rather than a category. "Now the part
  that should temper it" is a section; "Analysis" is not.
- **Reuse a tag.** It decides which posts link to each other, and post-to-post links on a
  subject are the signal that those pages are about that subject.
- **Link `why-mining.html` at least once.** That page is the hub, and it links back from its
  rail automatically. That loop is worth more than anything else on this list.
- **Answer one question completely.** A post that half-answers three things ranks for none of
  them.

## What a good post looks like

800–1400 words. Opens with what happened and why it matters to somebody who owns machines —
not with a definition of bitcoin. Two to four `##` sections. Ends by pointing at the calculator
or the evergreen page rather than at a contact form.

Plain, declarative, lowercase-technical. No superlatives, no hype, no "game-changer", no
rhetorical questions as headings. Where something is uncertain, say it is uncertain: this site
would rather show a visible gap than a confident wrong number.

Read `site/posts/2026-08-23-three-questions-before-you-buy-a-miner.md` first — it is the
reference for register and structure.

## Checking your work

- Open the rendered `site/<slug>.html` and read it. The generator escapes everything, so
  markup you meant will show as text if you used a construct the parser does not know.
- `node tests/site/run.js` green.
- Drafts are absent from `site/blog.html` and `site/sitemap.xml` — that is correct, not a bug.

## Taking one back down

```
node site/tools/post.js unpublish <slug>
```

Out of the index, out of the sitemap, `noindex` back on the page, in one command. Say so when
you report, so the owner knows the lever exists.

`publish` refuses while the summary is still the scaffold text — not a review gate, just a
guard against a search result that reads "ONE SENTENCE, UNDER 160 CHARACTERS".
