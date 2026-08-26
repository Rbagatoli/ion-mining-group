// ===== PROTON MINING — the palette, JS side =====
//
// tokens.css is the source of truth. This is its mirror for everywhere var() cannot reach:
// <canvas> (Chart.js axis labels, tooltips, the tech-lines field), WebGL (the globe's atmosphere
// and point colours), and any string built by concatenation — map-sourcing.js's fade() being the
// sharpest example, since it returns its input UNCHANGED for anything that is not exactly six
// hex digits, so a var() reaching it fails silently at the WebGL layer with no console error.
//
// LITERALS, deliberately, not getComputedStyle(document.documentElement):
//   - it must work before the stylesheet has applied, and inside a canvas where there is no
//     element to compute against
//   - it must work in Node, so tests/theme.test.js can import it and assert it against
//     tokens.css. That test is what stops the two drifting, since nothing at runtime can.
//
// If you change a value here, change tokens.css to match. The test fails otherwise.

var ProtonTheme = (function() {

    // ---- the three materials -------------------------------------------------------------
    var black    = '#000000';
    var surface  = '#0a0a0a';
    var surface2 = '#0e0e0e';

    var plat000 = '#ffffff';
    var plat100 = '#efeeec';
    var plat200 = '#e5e4e2';
    var plat300 = '#cbcac7';
    var plat400 = '#a9a8a5';
    var plat500 = '#83827f';
    var plat600 = '#5c5b58';

    var btc100 = '#ffd9a0';
    var btc200 = '#ffb347';
    var btc300 = '#f7931a';
    var btc400 = '#c86f0a';
    var btc500 = '#8a4a05';

    // ---- roles ----------------------------------------------------------------------------
    var text    = '#e8e7e5';
    var textMid = plat400;
    var textDim = '#787773';

    var line    = 'rgba(229, 228, 226, 0.13)';
    var lineMid = 'rgba(229, 228, 226, 0.24)';

    // Data colours. The recorded exception to the three-material rule: the site has no numbers
    // in it, and the direction of a number is not a brand decision.
    /* Mirrors tokens.css:127-129 exactly. These are the SITE's --gain and
       --loss, not Tailwind's defaults; see the reasoning where they are defined.
       This file exists because canvas and Chart.js cannot resolve a CSS custom
       property, so it is a hand-kept copy — and a copy that drifts from its
       original is worse than no copy, which is what tests/theme.test.js's
       byte-identical assertion is for. */
    var pos  = '#3fb950';
    var neg  = '#e05252';
    var warn = '#fbbf24';

    // ---- chart series ---------------------------------------------------------------------
    // One ramp replacing five separate arrays. It alternates LIGHT and DARK within two hues
    // rather than cycling eight saturated ones, which separates the series by LUMINANCE — so a
    // doughnut of eight categories stays readable in greyscale and under every form of colour
    // blindness, which the old rainbow did not.
    var series = ['#f7931a', '#e5e4e2', '#a9a8a5', '#c86f0a',
                  '#5c5b58', '#ffc46b', '#cbcac7', '#8a4a05'];

    /* The persistence ramp, --persist-1..4 in tokens.css. Platinum through
       orange, for how many survey years a flare was seen in: the two metal
       ramps' own stops, so the scale separates by hue and not by lightness
       alone. Mirrored here because it is consumed by Leaflet path options and
       by globe.gl point colours -- neither of which resolves a custom property,
       and both of which are then handed to fade(), which needs six-digit hex.
       Index 0 is the faintest, matching --persist-1. */
    var persist = ['#6b6a67', '#c06a08', '#f7931a', '#ffd9a0'];

    /* The globe's own surfaces, --globe-* in tokens.css. globe.gl hands every one
       of these to three.js as a material colour, so they are values rather than
       var(). strokeDim replaces a #333 and a #222 that were the last neutral
       greys on the globe -- platinum at low alpha reads as the same material as
       everything else instead of as a different dark. */
    var globe = {
        atmos:     btc300,
        fillMax:   'rgba(247, 147, 26, 0.85)',
        fillMin:   'rgba(247, 147, 26, 0.03)',
        stroke:    'rgba(247, 147, 26, 0.40)',
        // Lifted from 0.10: a line that read against a black sphere vanishes against a lit one.
        strokeDim: 'rgba(229, 228, 226, 0.18)',

        /* THE BODY, per mode. --globe-body-* in tokens.css.
         *
         * The sphere had no material set at all, so three-globe's default left it pure black --
         * the one colour this palette does not contain. Machined platinum instead, lit by one
         * key light, with the warm halo coming from the atmosphere shader BEHIND the globe
         * rather than from any orange light in front of it. A second orange light was tried and
         * rejected: every directional light adds its own specular highlight, so a warm rim light
         * reads as an orange headlight on the front of the ball instead of a glow behind it.
         *
         * Shininess is deliberately low. At 90+ the highlight is a tight blown-out disc that
         * reads as glass or snooker ball; metal on a dark ground wants a broad soft sheen.
         *
         * Fleet runs bright because the choropleth is painted on the body and wants a light
         * ground. Prospects runs dark because the body is a backdrop for markers that were
         * colour-tuned against near-black. */
        body: {
            fleet:     { color: '#5c5b58', specular: '#cbcac7', shininess: 14,
                         emissive: '#111110', ambient: '#cbcac7', ambientI: 1.7,
                         keyI: 1.6, atmosphereAltitude: 0.24 },
            prospects: { color: '#2e2d2b', specular: '#83827f', shininess: 18,
                         emissive: '#0f0f0e', ambient: '#a9a8a5', ambientI: 1.15,
                         keyI: 1.6, atmosphereAltitude: 0.26 }
        },
        key: '#ffffff',
        // World space, so the highlight travels across the surface as the globe turns, the way
        // a sun would. Swung off the camera axis so it lands nearer the limb than the middle of
        // the disc, where it would otherwise sit on top of the densest marker cluster.
        keyPosition: [-0.75, 0.45, 0.25]
    };

    // Inactive slices in the fleet pie: present, but not competing for attention.
    var seriesMuted = ['#5c5b58', '#4e4d4a', '#414040', '#363535', '#2b2a2a', '#4a4947'];

    // Wraps, so no caller writes `% length` and none of them gets it subtly wrong.
    function seriesAt(i) { return series[((i % series.length) + series.length) % series.length]; }
    function mutedAt(i) { return seriesMuted[((i % seriesMuted.length) + seriesMuted.length) % seriesMuted.length]; }

    // ---- fonts ----------------------------------------------------------------------------
    // Canvas needs a resolved stack, not a var(). Kept in sync with --sans / --mono.
    var sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";
    var mono = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

    // ---- helpers --------------------------------------------------------------------------
    // Hex -> rgba, for the many places a colour needs an alpha applied at runtime. Unlike
    // map-sourcing.js's fade(), this ACCEPTS three-digit hex and expands it, and it throws
    // nothing on bad input -- it returns the original so a mistake is visible rather than
    // silently transparent.
    function alpha(hex, a) {
        var h = String(hex).replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length !== 6) return hex;
        return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' +
                         parseInt(h.slice(2, 4), 16) + ',' +
                         parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }

    return {
        black: black, surface: surface, surface2: surface2,
        plat000: plat000, plat100: plat100, plat200: plat200, plat300: plat300,
        plat400: plat400, plat500: plat500, plat600: plat600,
        btc100: btc100, btc200: btc200, btc300: btc300, btc400: btc400, btc500: btc500,
        btc: btc300,
        text: text, textMid: textMid, textDim: textDim,
        line: line, lineMid: lineMid,
        pos: pos, neg: neg, warn: warn,
        series: series, seriesMuted: seriesMuted, seriesAt: seriesAt, mutedAt: mutedAt,
        persist: persist,
        globe: globe,
        sans: sans, mono: mono,
        alpha: alpha
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProtonTheme;
