// ===== ION MINING GROUP — Shared Module =====

// --- Nav Renderer ---
function initNav(activePage) {
    const nav = document.getElementById('ion-nav');
    if (!nav) return;
    nav.className = 'ion-nav';
    nav.innerHTML =
        '<a class="ion-nav-brand" href="./index.html">' +
            '<span class="icon">\u26A1</span>' +
            '<span class="name">Ion Mining Group</span>' +
        '</a>' +
        '<div class="ion-nav-tabs">' +
            '<a href="./index.html" class="' + (activePage === 'dashboard' ? 'active' : '') + '">Dashboard</a>' +
            '<a href="./calculator.html" class="' + (activePage === 'calculator' ? 'active' : '') + '">Calculator</a>' +
        '</div>';
}

// --- Format Helpers ---
function fmtUSD(v) {
    if (!isFinite(v)) return 'N/A';
    var neg = v < 0;
    var abs = Math.abs(v);
    var str;
    if (abs >= 1e6) str = '$' + (abs / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e4) str = '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    else str = '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return neg ? '-' + str : str;
}

function fmtBTC(v, decimals) {
    if (!isFinite(v)) return 'N/A';
    var d = decimals !== undefined ? decimals : 6;
    return v.toFixed(d);
}

function fmtUSDFull(v) {
    if (!isFinite(v)) return 'N/A';
    var neg = v < 0;
    var str = '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return neg ? '-' + str : str;
}

// --- Live Market Data ---
async function fetchLiveMarketData() {
    var result = { price: null, difficulty: null };
    try {
        var [priceRes, diffRes] = await Promise.all([
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'),
            fetch('https://mempool.space/api/v1/mining/hashrate/1d')
        ]);

        if (priceRes.ok) {
            var priceData = await priceRes.json();
            var price = priceData?.bitcoin?.usd;
            if (price && price > 0) result.price = Math.round(price);
        }

        if (diffRes.ok) {
            var diffData = await diffRes.json();
            var diffs = diffData?.difficulty;
            if (diffs && diffs.length > 0) {
                var latestDiff = diffs[diffs.length - 1].difficulty;
                if (latestDiff > 0) result.difficulty = parseFloat((latestDiff / 1e12).toFixed(2));
            }
        }
    } catch (e) {}
    return result;
}

// ===== TECH LINES BACKGROUND =====
(function() {
    var canvas = document.getElementById('techLinesCanvas');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var ctx = canvas.getContext('2d');
    var lines = [];
    var animId = null;
    var lastFrame = 0;
    var isMobile = window.innerWidth < 768;
    var FRAME_INTERVAL = isMobile ? 50 : 33;
    var LINE_COUNT = isMobile ? 12 : 20;

    function resize() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        generateLines();
    }

    function generateLines() {
        lines = [];
        var w = window.innerWidth;
        var h = window.innerHeight;
        for (var i = 0; i < LINE_COUNT; i++) {
            var isHorizontal = Math.random() > 0.5;
            lines.push({
                horizontal: isHorizontal,
                pos: Math.random() * (isHorizontal ? h : w),
                start: Math.random() * 0.3,
                end: 0.5 + Math.random() * 0.5,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.7,
                maxOpacity: 0.03 + Math.random() * 0.05
            });
        }
    }

    function draw(timestamp) {
        animId = requestAnimationFrame(draw);
        if (timestamp - lastFrame < FRAME_INTERVAL) return;
        lastFrame = timestamp;
        if (document.hidden) return;

        var w = window.innerWidth;
        var h = window.innerHeight;
        var t = timestamp / 1000;

        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 1;

        for (var i = 0; i < lines.length; i++) {
            var L = lines[i];
            var opacity = L.maxOpacity * (0.5 + 0.5 * Math.sin(t * L.speed + L.phase));
            ctx.strokeStyle = 'rgba(247, 147, 26, ' + opacity.toFixed(4) + ')';
            ctx.beginPath();
            if (L.horizontal) {
                ctx.moveTo(L.start * w, L.pos);
                ctx.lineTo(L.end * w, L.pos);
            } else {
                ctx.moveTo(L.pos, L.start * h);
                ctx.lineTo(L.pos, L.end * h);
            }
            ctx.stroke();
        }
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            isMobile = window.innerWidth < 768;
            FRAME_INTERVAL = isMobile ? 50 : 33;
            LINE_COUNT = isMobile ? 12 : 20;
            resize();
        }, 200);
    });

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && !animId) {
            animId = requestAnimationFrame(draw);
        }
    });

    resize();
    animId = requestAnimationFrame(draw);
})();
