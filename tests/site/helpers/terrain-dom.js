/* Minimal DOM/event fixture shared in style with the existing presentation tests. */
class Element {
    constructor(tag, attrs = {}) {
        this.tagName = tag.toLowerCase(); this.attrs = attrs; this.children = []; this.listeners = {}; this._text = '';
        this.style = {setProperty(k,v) { this[k] = v; }}; this.inert = false;
        this.classList = {contains:c => (this.attrs.class || '').split(/\s+/).includes(c),
            add:c => { this.attrs.class = (this.attrs.class || '')+' '+c; },
            remove:c => { this.attrs.class = (this.attrs.class || '').split(/\s+/).filter(x => x !== c).join(' '); },
            toggle:(c,on) => { if (on) this.classList.add(c); else this.classList.remove(c); }};
    }
    get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
    get name() { return this.attrs.name || ''; }
    get value() { return this.attrs.value ?? (this.tagName === 'select' ? this.children.find(c => c.tagName === 'option')?.value : '') ?? ''; } set value(v) { this.attrs.value = String(v); }
    get hidden() { return 'hidden' in this.attrs; } set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get clientWidth() { return this.closest('[hidden]') ? 0 : 1280; }
    get clientHeight() { return this.closest('[hidden]') ? 0 : 470; }
    get textContent() { return this._text+this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(v) { const fragment = parse(v); this.children = []; for (const c of fragment.children) this.appendChild(c); }
    getAttribute(k) { return this.attrs[k] ?? null; } setAttribute(k,v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    getRootNode() { let root = this; while (root.parentElement) root = root.parentElement; return root; }
    get ownerDocument() { return this.getRootNode(); }
    setPointerCapture() {} releasePointerCapture() {}
    getBoundingClientRect() { return {left:0,top:0,width:this.clientWidth,height:this.clientHeight}; }
    remove() { this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({fn,capture:!!(options === true || options?.capture)}); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(l => l.fn !== fn); }
    dispatchEvent(event) { return !this.fire(event.type,event).defaultPrevented; }
    fire(type, extra = {}) {
        const event = {type,target:this,deltaMode:0,ctrlKey:false,metaKey:false,...extra,
            preventDefault() { this.defaultPrevented = true; },stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.stopped = true; this.immediate = true; }};
        const path = []; for (let node = this; node; node = node.parentElement) path.push(node);
        const invoke = (node,capture) => {
            event.currentTarget = node;
            for (const l of [...(node.listeners[type] || [])]) if (l.capture === capture) {
                l.fn.call(node,event); if (event.immediate) break;
            }
        };
        for (const node of [...path].reverse()) { invoke(node,true); if (event.stopped) return event; }
        for (const node of path) { invoke(node,false); if (event.stopped) break; }
        return event;
    }
    matches(selector) {
        const attr = selector.match(/\[([^=\]^]+)(\^?=)?(?:"([^"]*)")?\]/);
        if (attr) {
            const value = this.getAttribute(attr[1]);
            if (value === null || (attr[2] === '=' && value !== attr[3]) || (attr[2] === '^=' && !value.startsWith(attr[3]))) return false;
        }
        const plain = selector.replace(/\[[^\]]+\]/g,'');
        if (!plain) return true;
        if (plain[0] === '.') return this.classList.contains(plain.slice(1));
        if (plain[0] === '#') return this.getAttribute('id') === plain.slice(1);
        return this.tagName === plain;
    }
    focus() { this.getRootNode().activeElement = this; this.fire('focus'); }
    closest(s) { for (let p = this; p; p = p.parentElement) if (p.matches(s)) return p; return null; }
    querySelectorAll(s) { const out = []; const visit = p => { for (const c of p.children) { if (c.matches(s)) out.push(c); visit(c); }}; visit(this); return out; }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
}
function parse(html) {
    const root = new Element('document'), stack = [root], voids = new Set(['input','link','meta','br','hr','img','source']);
    for (const token of html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g,'').match(/<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('</')) { const tag = token.match(/^<\/([\w-]+)/)?.[1]?.toLowerCase(); while (stack.length > 1) if (stack.pop().tagName === tag) break; }
        else if (token.startsWith('<!')) continue;
        else if (token.startsWith('<')) {
            const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
            const attrs = {}; for (const m of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[m[1]] = m[2] || '';
            const el = new Element(tag,attrs); stack.at(-1).appendChild(el); if (!voids.has(tag) && !token.endsWith('/>')) stack.push(el);
        } else stack.at(-1)._text += token;
    }
    return root;
}
module.exports = {Element,parse};
