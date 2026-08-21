// ===== ION MINING GROUP — Chart.js defaults =====
//
// Before this file, there were ZERO Chart.defaults anywhere in the repo and 24 `new Chart(...)`
// calls each repeating its own legend colour, tooltip colours, tick colours and grid colours —
// roughly 290 colour literals saying the same thing 24 times, and 72 isLightMode() ternaries
// carrying a dark/light pair that no longer has two sides.
//
// LOAD ORDER MATTERS. This must come after chart.min.js and after theme.js, and it must NOT
// depend on shared.js, which loads at the end of <body> while chart.min.js is in <head>. The
// guard below makes the ordering failure loud in the console instead of silently leaving every
// chart on Chart.js's own defaults, which are light-themed.
//
// Everything here is a DEFAULT. A chart that genuinely needs something else still overrides it
// at the call site; the point is that none of them has to restate the palette.

(function() {
    if (typeof Chart === 'undefined') {
        // Not an error on pages with no charts. Only worth saying something where one is expected.
        return;
    }
    if (typeof IonTheme === 'undefined') {
        console.warn('[chart-theme] theme.js must load before this file — charts will fall back ' +
                     'to Chart.js light defaults.');
        return;
    }
    var T = IonTheme;

    // ---- type ---------------------------------------------------------------------------
    // Mono at 11px, matching the site's treatment of labels: uppercase-ish, technical, and
    // narrow enough that a dense axis does not collide with itself.
    Chart.defaults.font.family = T.mono;
    Chart.defaults.font.size = 11;
    Chart.defaults.color = T.plat400;
    Chart.defaults.borderColor = T.line;

    // ---- legend -------------------------------------------------------------------------
    Chart.defaults.plugins.legend.labels.color = T.plat300;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;

    // ---- tooltip ------------------------------------------------------------------------
    // cornerRadius 0 is the one everybody forgets, and it is exactly the square rule. Chart.js
    // ships 6.
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10, 10, 10, 0.94)';
    Chart.defaults.plugins.tooltip.titleColor = T.plat200;
    Chart.defaults.plugins.tooltip.bodyColor = T.plat300;
    Chart.defaults.plugins.tooltip.borderColor = T.lineMid;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 0;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.plugins.tooltip.titleFont = { family: T.mono, size: 11, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyFont = { family: T.mono, size: 11 };

    // ---- scales -------------------------------------------------------------------------
    // Chart.defaults.scale applies to every scale type, so this covers linear, time and
    // category without naming each.
    Chart.defaults.scale.grid.color = T.line;
    Chart.defaults.scale.grid.tickColor = 'transparent';
    Chart.defaults.scale.grid.drawBorder = false;
    Chart.defaults.scale.ticks.color = T.plat400;
    Chart.defaults.scale.border = Chart.defaults.scale.border || {};
    Chart.defaults.scale.border.color = T.lineMid;

    // ---- elements -----------------------------------------------------------------------
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.line.tension = 0.25;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.point.hoverRadius = 4;
    Chart.defaults.elements.point.backgroundColor = T.btc;
    Chart.defaults.elements.point.borderColor = T.black;
    Chart.defaults.elements.bar.borderRadius = 0;
    // Chart.js separates doughnut segments with WHITE. A white hairline is the one thing this
    // palette never has, and on a black ground it reads as a gap rather than as a divider.
    Chart.defaults.elements.arc.borderColor = T.black;
    Chart.defaults.elements.arc.borderWidth = 2;

    Chart.defaults.maintainAspectRatio = false;

    // ---- shared plugins ------------------------------------------------------------------
    // centerText existed byte-identically in accounting.js and banking.js. One of those files is
    // now deleted; this is the surviving copy, retinted and shared.
    //
    // This is also the ONE place canvas text may carry a gradient: it draws once per render, the
    // type is large, and a createLinearGradient per text run is affordable here in a way it is
    // not for axis labels redrawn on every tick.
    Chart.register({
        id: 'ionCenterText',
        beforeDraw: function(chart) {
            var o = chart.config.options && chart.config.options.plugins &&
                    chart.config.options.plugins.ionCenterText;
            if (!o || !o.text) return;
            var ctx = chart.ctx;
            var area = chart.chartArea;
            if (!area) return;
            var cx = (area.left + area.right) / 2;
            var cy = (area.top + area.bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '600 ' + (o.size || 20) + 'px ' + T.mono;
            ctx.fillStyle = o.color || T.plat200;
            ctx.fillText(o.text, cx, cy - (o.sub ? 9 : 0));
            if (o.sub) {
                ctx.font = '11px ' + T.mono;
                ctx.fillStyle = T.plat400;
                ctx.fillText(o.sub, cx, cy + 12);
            }
            ctx.restore();
        }
    });
})();
