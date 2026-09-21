const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../site/tools/build-blog.js');

const front = value => '---\ntitle: Mobile fixture\nslug: cheap-mining-power-quote\ndate: 2026-09-20\nsummary: Desktop summary unchanged.\n' + (value === undefined ? '' : 'mobileSummary: ' + value + '\n') + 'status: published\n---\n\nFull article body.';

test('mobile summaries are optional and leave desktop summary and body unchanged', () => {
  const original = B.parseFrontMatter('fixture.md', front());
  const mobile = B.parseFrontMatter('fixture.md', front('Short phone summary.'));
  assert.equal(mobile.meta.summary, original.meta.summary);
  assert.equal(mobile.body, original.body);
  assert.equal(mobile.meta.mobileSummary, 'Short phone summary.');
  assert.equal(B.mobileCopyAttr(original.meta.mobileSummary), '');
});

test('empty or overlong mobile summaries are rejected', () => {
  for (const bad of ['', 'x'.repeat(161)]) assert.throws(() => B.parseFrontMatter('fixture.md', front(bad)), /mobileSummary must contain/);
});

test('generated responsive attributes cannot promote frontmatter markup to active HTML', () => {
  const text = '<img src=x onerror="alert(1)"> & text';
  const attr = B.mobileCopyAttr(text);
  assert.equal(attr, ' data-mobile-copy="&amp;lt;img src=x onerror=&amp;quot;alert(1)&amp;quot;&amp;gt; &amp;amp; text"');
  assert.ok(!attr.includes('<img'));
  const post = B.parseFrontMatter('fixture.md', front(text));
  post.meta.href = './cheap-mining-power-quote.html';
  const card = B.indexCards([post]);
  assert.ok(card.includes(attr));
  assert.ok(card.includes('>Desktop summary unchanged.</p>'));
});

test('a mobile summary never promotes a held or draft post', () => {
  const held = B.parseFrontMatter('fixture.md', front('Short.'));
  held.meta.slug = 'unreviewed-example';
  held.meta.href = './unreviewed-example.html';
  assert.ok(!B.indexCards([held]).includes('Short.'));
  held.meta.slug = 'cheap-mining-power-quote';
  held.meta.status = 'draft';
  assert.ok(!B.indexCards([held]).includes('Short.'));
});
