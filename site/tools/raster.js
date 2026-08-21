/* A very small software rasteriser, and a PNG encoder.

   Share cards have to be raster: og:image is read by LinkedIn, Slack, X and
   WhatsApp, and none of them render SVG. This site has no dependencies and is
   not about to acquire a headless browser to take four screenshots, so the
   drawings are rasterised here instead.

   That is only reasonable because of what the scenes actually emit. Every path
   in every diagram is M, L and Z — polylines and closed polygons, no curves at
   all — so a scanline fill covers the whole vocabulary. Verified before this was
   written rather than assumed.

   Anti-aliasing is supersampling: everything is drawn at SS times the final size
   and box-filtered down. Slower and far shorter than an analytic coverage
   rasteriser, and at these sizes the difference is milliseconds.

   Used only by build-og.js. Nothing here ships to a browser. */
const zlib = require('zlib');

const SS = 3;                       // supersample factor

/* ---------- canvas ---------- */

function Canvas(w, h) {
    this.w = w * SS;
    this.h = h * SS;
    this.outW = w;
    this.outH = h;
    /* RGB only; the cards are opaque, so there is no alpha channel to carry. */
    this.px = new Uint8ClampedArray(this.w * this.h * 3);
}

Canvas.prototype.fill = function (r, g, b) {
    for (let i = 0; i < this.px.length; i += 3) {
        this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b;
    }
};

Canvas.prototype.blend = function (x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    this.px[i]     = this.px[i]     * (1 - a) + r * a;
    this.px[i + 1] = this.px[i + 1] * (1 - a) + g * a;
    this.px[i + 2] = this.px[i + 2] * (1 - a) + b * a;
};

/* ---------- path parsing ----------
   Returns subpaths as flat point arrays, each flagged closed or open, because a
   closed one is filled and an open one is stroked. */
function parsePath(d) {
    const subs = [];
    let cur = null;
    let i = 0;
    const n = d.length;
    function readNum() {
        while (i < n && (d[i] === ' ' || d[i] === ',')) i++;
        const start = i;
        if (d[i] === '-' || d[i] === '+') i++;
        while (i < n && ((d[i] >= '0' && d[i] <= '9') || d[i] === '.')) i++;
        return parseFloat(d.slice(start, i));
    }
    while (i < n) {
        const c = d[i];
        if (c === 'M') {
            i++;
            const x = readNum(), y = readNum();
            cur = { pts: [x, y], closed: false };
            subs.push(cur);
        } else if (c === 'L') {
            i++;
            const x = readNum(), y = readNum();
            if (cur) cur.pts.push(x, y);
        } else if (c === 'Z' || c === 'z') {
            i++;
            if (cur) cur.closed = true;
            cur = null;
        } else {
            i++;                    // whitespace, or a command this does not speak
        }
    }
    return subs;
}

/* ---------- fills ----------
   Scanline with the nonzero winding rule, which is what SVG uses by default and
   what the diagram's interior polygons were wound for. */
/* Callers work in the card's own coordinates and never see the supersampled
   buffer. Scaling here rather than at every call site is what stops half the
   drawing landing in a corner — which is exactly what the first run did. */
Canvas.prototype.fillPoly = function (src, r, g, b, a) {
    const count = src.length / 2;
    if (count < 3) return;
    const pts = new Array(src.length);
    for (let k = 0; k < src.length; k++) pts[k] = src[k] * SS;
    let minY = Infinity, maxY = -Infinity;
    for (let k = 1; k < pts.length; k += 2) {
        if (pts[k] < minY) minY = pts[k];
        if (pts[k] > maxY) maxY = pts[k];
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
        const sy = y + 0.5;
        xs.length = 0;
        for (let e = 0; e < count; e++) {
            const ax = pts[e * 2], ay = pts[e * 2 + 1];
            const nx = pts[((e + 1) % count) * 2], ny = pts[((e + 1) % count) * 2 + 1];
            if ((ay <= sy && ny > sy) || (ny <= sy && ay > sy)) {
                const t = (sy - ay) / (ny - ay);
                xs.push({ x: ax + t * (nx - ax), dir: ny > ay ? 1 : -1 });
            }
        }
        if (!xs.length) continue;
        xs.sort((p, q) => p.x - q.x);
        let wind = 0;
        for (let s = 0; s < xs.length - 1; s++) {
            wind += xs[s].dir;
            if (wind === 0) continue;
            const from = Math.max(0, Math.ceil(xs[s].x - 0.5));
            const to = Math.min(this.w - 1, Math.floor(xs[s + 1].x - 0.5));
            for (let x = from; x <= to; x++) this.blend(x, y, r, g, b, a);
        }
    }
};

/* A stroke is just a quad per segment, filled the same way. Good enough for
   hairlines on a card; nobody is measuring the joins. */
Canvas.prototype.strokeLine = function (x0, y0, x1, y1, width, r, g, b, a) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return;
    const hx = (-dy / len) * width / 2, hy = (dx / len) * width / 2;
    this.fillPoly([x0 + hx, y0 + hy, x1 + hx, y1 + hy, x1 - hx, y1 - hy, x0 - hx, y0 - hy],
                  r, g, b, a);
};

/* circle and ring are built from logical points and go through fillPoly. */
Canvas.prototype.circle = function (cx, cy, rad, r, g, b, a) {
    const pts = [];
    const steps = Math.max(24, Math.round(rad));
    for (let k = 0; k < steps; k++) {
        const t = k / steps * Math.PI * 2;
        pts.push(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad);
    }
    this.fillPoly(pts, r, g, b, a);
};

Canvas.prototype.ring = function (cx, cy, rad, width, r, g, b, a) {
    const steps = Math.max(48, Math.round(rad));
    let px = cx + rad, py = cy;
    for (let k = 1; k <= steps; k++) {
        const t = k / steps * Math.PI * 2;
        const nx = cx + Math.cos(t) * rad, ny = cy + Math.sin(t) * rad;
        this.strokeLine(px, py, nx, ny, width, r, g, b, a);
        px = nx; py = ny;
    }
};

/* Draws one SVG path string: closed subpaths filled, open ones stroked. */
Canvas.prototype.drawPath = function (d, opts) {
    const subs = parsePath(d);
    subs.forEach(s => {
        if (s.closed && opts.fill) {
            this.fillPoly(s.pts, opts.fill[0], opts.fill[1], opts.fill[2], opts.fillAlpha);
        } else if (!s.closed && opts.stroke) {
            for (let k = 0; k + 3 < s.pts.length; k += 2) {
                this.strokeLine(s.pts[k], s.pts[k + 1], s.pts[k + 2], s.pts[k + 3],
                                opts.width || 1, opts.stroke[0], opts.stroke[1], opts.stroke[2],
                                opts.strokeAlpha);
            }
        }
    });
};

/* ---------- downsample and encode ---------- */

Canvas.prototype.resolve = function () {
    const out = Buffer.alloc(this.outW * this.outH * 3);
    const inv = 1 / (SS * SS);
    for (let y = 0; y < this.outH; y++) {
        for (let x = 0; x < this.outW; x++) {
            let r = 0, g = 0, b = 0;
            for (let sy = 0; sy < SS; sy++) {
                const row = (y * SS + sy) * this.w;
                for (let sx = 0; sx < SS; sx++) {
                    const i = (row + x * SS + sx) * 3;
                    r += this.px[i]; g += this.px[i + 1]; b += this.px[i + 2];
                }
            }
            const o = (y * this.outW + x) * 3;
            out[o] = r * inv; out[o + 1] = g * inv; out[o + 2] = b * inv;
        }
    }
    return out;
};

const CRC = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

Canvas.prototype.toPNG = function () {
    const rgb = this.resolve();
    const w = this.outW, h = this.outH;
    /* Filter byte 0 (None) on every scanline. The images are flat colour and
       long runs, which deflate handles well without a predictor. */
    const raw = Buffer.alloc(h * (w * 3 + 1));
    for (let y = 0; y < h; y++) {
        raw[y * (w * 3 + 1)] = 0;
        rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;        // bit depth
    ihdr[9] = 2;        // colour type 2 = truecolour RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};

module.exports = { Canvas, parsePath, SS };
