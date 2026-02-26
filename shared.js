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
