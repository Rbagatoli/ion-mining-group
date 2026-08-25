// ===== PROTON MINING — Banking (Wallet + Income + Accounting) =====

// Strike proxy URL - hardcoded infrastructure configuration
var STRIKE_PROXY_URL = 'https://proton-strike-proxy.proton-mining.workers.dev';

// ===== SECTION 0: UNIFIED STATE =====
var liveBtcPrice = null;
var acctBtcPrice = null;
var refreshInterval = null;
var strikeConnected = false;
var strikeBalances = null;
var strikeTransactions = [];
var strikeOnchainAddress = null;
var selectedTransactionTab = 'all'; // 'all' | 'strike' | address string

// Income tab state
var payoutChart = null;
var revCostChart = null;

// Accounting tab state
var qboData = { accounts: [], expenses: [], invoices: [] };
var qboConnected = false;
var acctStrikeConnected = false;
var strikeAcctData = { deposits: [], payouts: [], receives: [] };
var acctPeriod = { start: '', end: '' };
var pnlChart = null;
var expenseDoughnutChart = null;

// Tab state
var bankingActiveTab = 'wallet';
var incomeChartsInited = false;
var accountingChartsInited = false;

// ===== TAB SWITCHING =====
function switchBankingTab(tabName) {
    bankingActiveTab = tabName;

    // Close all open slide panels
    var panels = document.querySelectorAll('.slide-panel.open');
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove('open');

    // Update tab buttons
    var tabs = document.querySelectorAll('#bankingTabs .banking-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
    }

    // Show/hide tab content
    document.getElementById('tabWallet').style.display = tabName === 'wallet' ? '' : 'none';
    document.getElementById('tabIncome').style.display = tabName === 'income' ? '' : 'none';
    document.getElementById('tabAccounting').style.display = tabName === 'accounting' ? '' : 'none';

    // Lazy-init charts (Chart.js needs visible canvas)
    if (tabName === 'income' && !incomeChartsInited) {
        incomeChartsInited = true;
        initPayoutChart();
        initRevCostChart();
    }
    if (tabName === 'accounting') {
        if (!accountingChartsInited) {
            accountingChartsInited = true;
        }
        // Refresh Strike data and re-render when switching to Accounting tab
        if (acctStrikeConnected && StrikeAuth.isLoggedIn()) {
            fetchStrikeAccountingData().then(function() {
                renderAccounting();
            }).catch(function(e) {
                console.warn('[Accounting] Refresh on tab switch failed:', e);
                renderAccounting(); // Still render with existing data
            });
        } else {
            renderAccounting();
        }
    }

    // Re-init widget drag handles for the newly visible tab
    if (typeof window.initBankingTabWidgets === 'function') {
        window.initBankingTabWidgets();
    }
}
window.switchBankingTab = switchBankingTab;

// Tab bar click handler
document.getElementById('bankingTabs').addEventListener('click', function(e) {
    var btn = e.target.closest('.banking-tab');
    if (!btn) return;
    switchBankingTab(btn.getAttribute('data-tab'));
});

// Hash-based tab selection (early)
(function() {
    var hash = location.hash.replace('#', '');
    if (hash === 'income' || hash === 'wallet' || hash === 'accounting') {
        switchBankingTab(hash);
    }
})();

// ===== SHARED HELPERS =====
function escapeHtml(str) {
    if (str === null || str === undefined) return '';   // keep 0 / false, don't blank them
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function copyToClipboard(text, btnEl) {
    navigator.clipboard.writeText(text).then(function() {
        var orig = btnEl.textContent;
        btnEl.textContent = 'Copied!';
        btnEl.style.color = 'var(--pos)';
        setTimeout(function() { btnEl.textContent = orig; btnEl.style.color = ''; }, 1500);
    }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        var orig = btnEl.textContent;
        btnEl.textContent = 'Copied!';
        btnEl.style.color = 'var(--pos)';
        setTimeout(function() { btnEl.textContent = orig; btnEl.style.color = ''; }, 1500);
    });
}

function validateBtcAddress(addr) {
    if (!addr || addr.length < 26 || addr.length > 62) return false;
    // Charset matters as well as the prefix: addresses are interpolated into markup and into
    // an explorer URL, so anything outside base58/bech32 must be rejected outright.
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,61}$/.test(addr)) return true;   // legacy / P2SH
    if (/^bc1[02-9ac-hj-np-z]{23,59}$/.test(addr)) return true;        // bech32 / bech32m
    return false;
}

// ===== SECTION 1: SHARED DATA MODULES =====

// ===== WALLET DATA MODULE =====
var WalletData = (function() {
    var KEY = 'protonMiningWallet';

    function getData() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return defaultData();
            var parsed = JSON.parse(raw);
            if (!parsed || !parsed.addresses) return defaultData();
            return parsed;
        } catch(e) { return defaultData(); }
    }

    function defaultData() {
        return { _v: 1, addresses: [] };
    }

    function saveData(data) {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e) {}
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('wallet', data);
    }

    function addAddress(address, label) {
        var data = getData();
        var entry = {
            id: 'addr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            address: address,
            label: label || address.substring(0, 12) + '...',
            dateAdded: new Date().toISOString(),
            lastBalance: 0,
            lastTxCount: 0,
            lastFetched: null
        };
        data.addresses.push(entry);
        saveData(data);
        return entry;
    }

    function removeAddress(id) {
        var data = getData();
        data.addresses = data.addresses.filter(function(a) { return a.id !== id; });
        saveData(data);
    }

    function updateAddressData(id, balance, txCount) {
        var data = getData();
        for (var i = 0; i < data.addresses.length; i++) {
            if (data.addresses[i].id === id) {
                data.addresses[i].lastBalance = balance;
                data.addresses[i].lastTxCount = txCount;
                data.addresses[i].lastFetched = new Date().toISOString();
                break;
            }
        }
        saveData(data);
    }

    return {
        getData: getData,
        addAddress: addAddress,
        removeAddress: removeAddress,
        updateAddressData: updateAddressData
    };
})();

// ===== PAYOUT DATA MODULE =====
var PayoutData = (function() {
    var PAYOUT_KEY = 'protonMiningPayouts';

    function getData() {
        try {
            var raw = localStorage.getItem(PAYOUT_KEY);
            if (!raw) return defaultData();
            var parsed = JSON.parse(raw);
            if (!parsed || !parsed.payouts) return defaultData();
            return parsed;
        } catch(e) { return defaultData(); }
    }

    function defaultData() {
        return { _v: 1, snapshots: [], payouts: [], lastSnapshotDate: null };
    }

    function saveData(data) {
        try { localStorage.setItem(PAYOUT_KEY, JSON.stringify(data)); } catch(e) {}
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('payouts', data);
    }

    function addSnapshot(snapshot) {
        var data = getData();
        data.snapshots.push(snapshot);
        data.lastSnapshotDate = snapshot.date;
        saveData(data);
    }

    function addPayout(payout) {
        var data = getData();
        payout.id = 'payout_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        data.payouts.push(payout);
        saveData(data);
        return payout;
    }

    function removePayout(id) {
        var data = getData();
        var filtered = [];
        for (var i = 0; i < data.payouts.length; i++) {
            if (data.payouts[i].id !== id) filtered.push(data.payouts[i]);
        }
        data.payouts = filtered;
        saveData(data);
    }

    // One-off repair for rows written before payouts were priced from their own date.
    //
    // Those rows carry the spot price at SYNC time. The date and the BTC amount are correct, so
    // re-pricing is deterministic wherever price history reaches — and where it does not reach,
    // the row is marked unpriced rather than left wearing a wrong number.
    //
    // Rows already carrying priceBasis are left alone: they were written by the corrected path.
    // Hand-entered rows (notes without 'auto-sync') are also left alone — a figure somebody typed
    // deliberately is not ours to overwrite.
    function repriceFromHistory() {
        var report = { examined: 0, repriced: 0, unpriced: 0, skipped: 0, changedUsd: 0 };
        if (typeof PriceHistory === 'undefined' || !PriceHistory.priceOnDate) return report;
        var data = getData();
        for (var i = 0; i < data.payouts.length; i++) {
            var p = data.payouts[i];
            report.examined++;
            if (p.priceBasis) { report.skipped++; continue; }
            if (!/auto-sync/.test(String(p.notes || ''))) { report.skipped++; continue; }
            var correct = PriceHistory.priceOnDate(p.date);
            var wasUsd = (typeof p.usdValue === 'number') ? p.usdValue : 0;
            if (correct === null) {
                p.btcPrice = null;
                p.usdValue = null;
                p.priceBasis = 'unpriced';
                report.unpriced++;
            } else {
                p.btcPrice = correct;
                p.usdValue = (typeof p.btcAmount === 'number') ? p.btcAmount * correct : null;
                p.priceBasis = 'close_on_payout_date';
                report.repriced++;
                if (typeof p.usdValue === 'number') report.changedUsd += (p.usdValue - wasUsd);
            }
        }
        if (report.repriced || report.unpriced) saveData(data);
        return report;
    }

    function hasPayoutWithTxHash(txHash) {
        if (!txHash) return false;
        var data = getData();
        for (var i = 0; i < data.payouts.length; i++) {
            if (data.payouts[i].txHash === txHash) return true;
        }
        return false;
    }

    return {
        getData: getData,
        saveData: saveData,
        addSnapshot: addSnapshot,
        addPayout: addPayout,
        removePayout: removePayout,
        repriceFromHistory: repriceFromHistory,
        hasPayoutWithTxHash: hasPayoutWithTxHash
    };
})();

// ===== ELECTRICITY DATA MODULE =====
var ElectricityData = (function() {
    var ELEC_KEY = 'protonMiningElectricity';

    function getData() {
        try {
            var raw = localStorage.getItem(ELEC_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) { return []; }
    }

    function saveData(entries) {
        try { localStorage.setItem(ELEC_KEY, JSON.stringify(entries)); } catch(e) {}
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('electricity', entries);
    }

    function addEntry(entry) {
        var entries = getData();
        entry.id = 'elec_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        entry.effectiveRate = entry.kwhUsed > 0 ? entry.costUSD / entry.kwhUsed : 0;
        entries.push(entry);
        saveData(entries);
        return entry;
    }

    function removeEntry(id) {
        var entries = getData();
        var filtered = [];
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].id !== id) filtered.push(entries[i]);
        }
        saveData(filtered);
    }

    function getSummary() {
        var entries = getData();
        var totalCost = 0, totalKWh = 0;
        for (var i = 0; i < entries.length; i++) {
            totalCost += entries[i].costUSD;
            totalKWh += entries[i].kwhUsed;
        }
        var months = entries.length || 1;
        return {
            totalCost: totalCost,
            totalKWh: totalKWh,
            avgMonthly: totalCost / months,
            effectiveRate: totalKWh > 0 ? totalCost / totalKWh : 0,
            count: entries.length
        };
    }

    return {
        getData: getData,
        addEntry: addEntry,
        removeEntry: removeEntry,
        getSummary: getSummary
    };
})();

// ===== SECTION 2: STRIKE AUTH & API MODULES (from wallet.js) =====

// ===== STRIKE AUTH MODULE =====
var StrikeAuth = (function() {
    var SESSION_KEY = 'protonStrikeSession';
    var USER_KEY = 'protonStrikeUser';

    function getToken() {
        return localStorage.getItem(SESSION_KEY) || '';
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch(e) { return null; }
    }

    function isLoggedIn() {
        return !!getToken();
    }

    function saveSession(token, user) {
        localStorage.setItem(SESSION_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function hasStrike() {
        var u = getUser();
        return u && u.strikeConnected;
    }

    return {
        getToken: getToken,
        getUser: getUser,
        isLoggedIn: isLoggedIn,
        hasStrike: hasStrike,
        saveSession: saveSession,
        clearSession: clearSession
    };
})();

// ===== FIREBASE AUTO-LOGIN =====
var _walletAuthResolved = false;

async function autoLoginWithFirebase() {
    // Already have a valid worker session? Just use it.
    if (StrikeAuth.isLoggedIn()) {
        showAuthenticatedUI();
        var user = StrikeAuth.getUser();

        // Set global Strike connection flag if user has API key
        if (user && user.strikeConnected && user.hasOwnKey) {
            strikeConnected = true;
            updateStrikeStatus('Connected');
            updateSendButton();
            update2FAButton();
            hideConnectStrikePrompt();
        } else {
            showConnectStrikePrompt();
        }
        await loadAndRefreshWallet();
        if (acctStrikeConnected) await fetchStrikeAccountingData();
        await checkQboConnectionStatus();  // Check QB status after Strike auth
        return;
    }

    // Need Firebase user to get an ID token
    var fbUser = (typeof ProtonAuth !== 'undefined') ? ProtonAuth.getUser() : null;
    if (!fbUser) {
        showSignInPrompt();
        return;
    }

    // Exchange Firebase ID token for worker session
    try {
        var idToken = await fbUser.getIdToken(true); // force refresh
        var data = null;

        // Try Strike worker first (needed for wallet functionality)
        try {
            data = await StrikeAPI.firebaseLogin(idToken);
            console.log('[Wallet] Strike worker auth:', data && data.ok ? 'success' : 'failed');
        } catch (strikeErr) {
            console.warn('[Wallet] Strike worker auth failed:', strikeErr);
        }

        // Also auth with QB worker (if Strike succeeded, this creates parallel session for QB)
        if (data && data.ok) {
            try {
                var authUrl = 'https://proton-quickbooks.proton-mining.workers.dev';
                var qbRes = await fetch(authUrl + '/auth/firebase-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: idToken })
                });
                var qbData = await qbRes.json();
                console.log('[Wallet] QB worker auth:', qbData && qbData.ok ? 'success' : 'failed');
            } catch (qbErr) {
                console.warn('[Wallet] QB worker auth failed (non-critical):', qbErr);
            }
        }

        if (data && data.ok) {
            StrikeAuth.saveSession(data.token, data.user);
            showAuthenticatedUI();

            // Set global Strike connection flag if user has API key
            if (data.user.strikeConnected && data.user.hasOwnKey) {
                strikeConnected = true;
                updateStrikeStatus('Connected');
                updateSendButton();
                update2FAButton();
                hideConnectStrikePrompt();
            } else {
                showConnectStrikePrompt();
            }

            await loadAndRefreshWallet();
            if (acctStrikeConnected) await fetchStrikeAccountingData();
            await checkQboConnectionStatus();  // Check QB status after Strike auth
        } else {
            console.warn('[Wallet] Firebase login failed:', data);
            showSignInPrompt(data && data.error ? data.error + (data.message ? ': ' + data.message : '') : 'Login failed');
        }
    } catch(e) {
        console.warn('[Wallet] Firebase auto-login error:', e);
        showSignInPrompt('Auto-login error: ' + (e.message || e));
    }
}

// ===== WALLET INIT STUB =====
// (actual init is at bottom in unified init)

// Listen for sync engine wallet updates (cross-device)
window.ionWalletSyncRefresh = function() {
    loadAndRefreshWallet();
    if (acctStrikeConnected) fetchStrikeAccountingData();
};

// ===== STRIKE API MODULE (via Cloudflare Worker proxy) =====
var StrikeAPI = (function() {
    function getProxyUrl() {
        // Use hardcoded proxy URL - users don't need to configure infrastructure
        return STRIKE_PROXY_URL;
    }

    function authHeaders() {
        var hdrs = { 'Content-Type': 'application/json' };
        var token = StrikeAuth.getToken();
        if (token) hdrs['Authorization'] = 'Bearer ' + token;
        return hdrs;
    }

    function handleAuthError(res) {
        if (res.status === 401) {
            StrikeAuth.clearSession();
            // Try to re-auth with Firebase, or show sign-in prompt
            if (typeof ProtonAuth !== 'undefined' && ProtonAuth.isSignedIn()) {
                autoLoginWithFirebase();
            } else {
                showSignInPrompt();
            }
            return true;
        }
        return false;
    }

    async function apiFetch(route) {
        var proxy = getProxyUrl();
        if (!proxy) return { error: 'No proxy URL configured' };
        try {
            var res = await fetch(proxy.replace(/\/$/, '') + route, {
                headers: authHeaders()
            });
            if (handleAuthError(res)) return { error: 'Session expired', loginRequired: true };
            if (res.status === 403) {
                var errData = await res.json().catch(function() { return {}; });
                if (errData.strikeNotConnected) {
                    showConnectStrikePrompt();
                    return { error: 'Strike not connected', strikeNotConnected: true };
                }
                return { error: errData.error || 'Access denied' };
            }
            if (!res.ok) return { error: 'HTTP ' + res.status };
            return await res.json();
        } catch(e) {
            return { error: e.message || 'Network error' };
        }
    }

    async function apiPost(route, body) {
        var proxy = getProxyUrl();
        if (!proxy) return { error: 'No proxy URL configured' };
        try {
            var res = await fetch(proxy.replace(/\/$/, '') + route, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(body)
            });
            if (handleAuthError(res)) return { error: 'Session expired', loginRequired: true };
            var data = await res.json();
            if (!res.ok) {
                if (data.strikeNotConnected) {
                    showConnectStrikePrompt();
                    return { error: 'Strike not connected', strikeNotConnected: true };
                }
                var errMsg = data.error || data.message || data.title || '';
                if (data.data && data.data.validationErrors) errMsg += ' ' + JSON.stringify(data.data.validationErrors);
                if (!errMsg) errMsg = JSON.stringify(data);
                return { error: errMsg, totpRequired: data.totpRequired, pinRequired: data.pinRequired };
            }
            return data;
        } catch(e) {
            return { error: e.message || 'Network error' };
        }
    }

    async function apiPatch(route, body, totpCode, pinCode) {
        var proxy = getProxyUrl();
        if (!proxy) return { error: 'No proxy URL configured' };
        try {
            var hdrs = authHeaders();
            if (totpCode) hdrs['X-Dashboard-TOTP'] = totpCode;
            if (pinCode) hdrs['X-Dashboard-Pin'] = pinCode;
            var res = await fetch(proxy.replace(/\/$/, '') + route, {
                method: 'PATCH',
                headers: hdrs,
                body: JSON.stringify(body || {})
            });
            if (handleAuthError(res)) return { error: 'Session expired', loginRequired: true };
            var data = await res.json();
            if (!res.ok) {
                if (data.strikeNotConnected) {
                    showConnectStrikePrompt();
                    return { error: 'Strike not connected', strikeNotConnected: true };
                }
                return { error: data.error || data.message || 'HTTP ' + res.status, totpRequired: data.totpRequired, pinRequired: data.pinRequired };
            }
            return data;
        } catch(e) {
            return { error: e.message || 'Network error' };
        }
    }

    // Public no-auth fetch (for testing connection before login)
    async function apiPublicFetch(route) {
        var proxy = getProxyUrl();
        if (!proxy) return { error: 'No proxy URL configured' };
        try {
            var res = await fetch(proxy.replace(/\/$/, '') + route);
            if (!res.ok) return { error: 'HTTP ' + res.status };
            return await res.json();
        } catch(e) {
            return { error: e.message || 'Network error' };
        }
    }

    // Firebase login — exchange Firebase ID token for worker session
    async function firebaseLogin(idToken) {
        var proxy = getProxyUrl();
        if (!proxy) return { error: 'No proxy URL configured' };
        try {
            var res = await fetch(proxy.replace(/\/$/, '') + '/auth/firebase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: idToken })
            });
            var data = await res.json();
            if (data.ok && data.token) {
                StrikeAuth.saveSession(data.token, data.user);
            }
            return data;
        } catch(e) {
            return { error: e.message || 'Network error' };
        }
    }

    async function logout() {
        var proxy = getProxyUrl();
        if (proxy) {
            try {
                await fetch(proxy.replace(/\/$/, '') + '/auth/logout', {
                    method: 'POST',
                    headers: authHeaders()
                });
            } catch(e) {}
        }
        StrikeAuth.clearSession();
    }

    async function getBalances() { return await apiFetch('/balances'); }
    async function getDeposits() { return await apiFetch('/deposits'); }
    async function getPayouts() { return await apiFetch('/payouts'); }
    async function getReceives() { return await apiFetch('/receives'); }
    async function getInvoices() { return await apiFetch('/invoices'); }
    async function getPayments() { return await apiFetch('/payments'); }

    async function testConnection() {
        return await apiPublicFetch('/ping');
    }

    async function sendQuoteLightning(body) { return await apiPost('/send/quote/lightning', body); }
    async function sendQuoteOnchain(body) { return await apiPost('/send/quote/onchain', body); }
    async function getOnchainTiers(body) { return await apiPost('/send/onchain-tiers', body); }

    async function executeSend(quoteId, totpCode, pinCode) {
        return await apiPatch('/send/execute/' + quoteId, {}, totpCode, pinCode);
    }

    async function createInvoice(body) { return await apiPost('/invoice/create', body); }
    async function createInvoiceQuote(invoiceId) { return await apiPost('/invoice/' + invoiceId + '/quote', {}); }
    async function getInvoice(invoiceId) { return await apiFetch('/invoice/' + invoiceId); }
    async function shareInvoice(body) { return await apiPost('/invoice/share', body); }

    async function setPin(pin) { return await apiPost('/auth/set-pin', { pin: pin }); }

    async function getOnchainAddress() { return await apiPost('/receive/onchain-address', {}); }
    async function getSendStatus(paymentId) { return await apiFetch('/send/status/' + paymentId); }

    // Strike connection
    async function connectStrike(apiKey) { return await apiPost('/auth/connect-strike', { apiKey: apiKey }); }
    async function disconnectStrikeAccount() { return await apiPost('/auth/disconnect-strike', {}); }
    async function updateSettings(settings) { return await apiPatch('/auth/settings', settings); }

    return {
        getProxyUrl: getProxyUrl,
        getBalances: getBalances,
        getDeposits: getDeposits,
        getPayouts: getPayouts,
        getReceives: getReceives,
        getInvoices: getInvoices,
        getPayments: getPayments,
        testConnection: testConnection,
        sendQuoteLightning: sendQuoteLightning,
        sendQuoteOnchain: sendQuoteOnchain,
        getOnchainTiers: getOnchainTiers,
        executeSend: executeSend,
        createInvoice: createInvoice,
        createInvoiceQuote: createInvoiceQuote,
        getInvoice: getInvoice,
        shareInvoice: shareInvoice,
        setPin: setPin,
        getOnchainAddress: getOnchainAddress,
        getSendStatus: getSendStatus,
        firebaseLogin: firebaseLogin,
        logout: logout,
        apiPost: apiPost,
        connectStrike: connectStrike,
        disconnectStrikeAccount: disconnectStrikeAccount,
        updateSettings: updateSettings
    };
})();

// ===== SECTION 3: WALLET TAB LOGIC (from wallet.js) =====

// ===== SIGN-IN PROMPT UI =====
function showSignInPrompt(errorMsg) {
    var prompt = document.getElementById('signInPrompt');
    if (prompt) prompt.style.display = '';
    var errEl = document.getElementById('signInError');
    if (errEl) errEl.textContent = errorMsg || '';
    var authBar = document.getElementById('userAuthBar');
    if (authBar) authBar.style.display = 'none';
    var content = document.getElementById('walletContent');
    if (content) content.style.display = 'none';
    hideConnectStrikePrompt();
    updateSendButton();
    update2FAButton();
    updateAccountButtons();
}

function hideSignInPrompt() {
    var prompt = document.getElementById('signInPrompt');
    if (prompt) prompt.style.display = 'none';
}

function showAuthenticatedUI() {
    hideSignInPrompt();
    var content = document.getElementById('walletContent');
    if (content) content.style.display = '';
    var authBar = document.getElementById('userAuthBar');
    if (authBar) {
        authBar.style.display = '';
        var nameEl = document.getElementById('authUsername');
        if (nameEl) {
            // Show Firebase display name or email
            var fbUser = (typeof ProtonAuth !== 'undefined') ? ProtonAuth.getUser() : null;
            if (fbUser) {
                nameEl.textContent = fbUser.displayName || fbUser.email || 'User';
            } else {
                var user = StrikeAuth.getUser();
                nameEl.textContent = (user && user.email) || 'User';
            }
        }
    }
    updateSendButton();
    update2FAButton();
    updateAccountButtons();
}

function updateAccountButtons() {
    var settingsBtn = document.getElementById('btnAccountSettings');
    var loggedIn = strikeConnected && StrikeAuth.isLoggedIn();
    if (settingsBtn) settingsBtn.style.display = loggedIn ? '' : 'none';
}

// Clear all wallet state (on sign-out)
function clearAllWalletState() {
    StrikeAPI.logout();
    strikeBalances = null;
    strikeTransactions = [];
    activeSendQuote = null;
    totpEnabled = false;
    clearQuoteExpiry();

    // Clear accounting data (QB and Strike)
    qboConnected = false;
    qboData = { accounts: [], expenses: [], invoices: [] };
    acctStrikeConnected = false;
    strikeAcctData = { deposits: [], payouts: [], receives: [] };
    acctPeriod = { start: '', end: '' };
    updateQboStatus(null);  // Clear QB connection UI badge

    // Close all open slide panels
    var panels = document.querySelectorAll('.slide-panel.open');
    for (var i = 0; i < panels.length; i++) {
        panels[i].classList.remove('open');
    }
    hideConnectStrikePrompt();
    showSignInPrompt();
    renderWallet();
    renderTransactionHistory();
    renderAccounting();  // Clear displayed accounting data
}

// ===== CONNECT STRIKE PROMPT =====
function showConnectStrikePrompt() {
    var prompt = document.getElementById('connectStrikePrompt');
    if (prompt) prompt.style.display = '';
}

function hideConnectStrikePrompt() {
    var prompt = document.getElementById('connectStrikePrompt');
    if (prompt) prompt.style.display = 'none';
}

function updateStrikeCardVisibility() {
    var user = StrikeAuth.getUser();
    var hasOwnKey = user && user.hasOwnKey;
    var apiKeyPrompt = document.getElementById('connectStrikePrompt');

    // Proxy is always available (hardcoded), only check API key
    if (hasOwnKey) {
        // User has API key connected - hide card
        if (apiKeyPrompt) apiKeyPrompt.style.display = 'none';
    } else {
        // No API key yet - show prompt
        if (apiKeyPrompt) apiKeyPrompt.style.display = '';
    }
}

// ===== STRIKE SETTINGS =====
function loadStrikeSettings() {
    var settings = FleetData.getSettings();
    if (settings.strike && settings.strike.proxyUrl && settings.strike.enabled) {
        document.getElementById('walletStrikeProxyUrl').value = settings.strike.proxyUrl;
        // Don't auto-mark as connected based on proxy URL alone
        // strikeConnected = true;  // REMOVED - wait for user to connect with API key
        // updateStrikeStatus('Connected');  // REMOVED
    }
    updateSendButton();
    update2FAButton();
    updateAccountButtons();
}

function updateStrikeStatus(label) {
    var badge = document.getElementById('strikeStatusBadge');
    if (label) {
        if (badge) {
            badge.textContent = 'Strike: ' + label;
            badge.className = 'status-badge status-connected';
        }
        // Update global nav bar
        var btnConnect = document.getElementById('btnConnectStrikeGlobal');
        var badgeConnected = document.getElementById('strikeConnectedBadge');
        if (btnConnect) btnConnect.style.display = 'none';
        if (badgeConnected) badgeConnected.style.display = 'flex';
    } else {
        if (badge) {
            badge.textContent = 'Strike: Not Connected';
            badge.className = 'status-badge status-disconnected';
        }
        // Update global nav bar
        var btnConnect = document.getElementById('btnConnectStrikeGlobal');
        var badgeConnected = document.getElementById('strikeConnectedBadge');
        if (btnConnect) btnConnect.style.display = 'block';
        if (badgeConnected) badgeConnected.style.display = 'none';
    }
}

// ===== STRIKE DATA FETCH =====
async function fetchStrikeData() {
    if (!strikeConnected) return;
    if (!StrikeAuth.isLoggedIn()) return;

    var balResult = await StrikeAPI.getBalances();
    if (balResult && !balResult.error) {
        strikeBalances = balResult;
        var settings = FleetData.getSettings();
        if (!settings.strike) settings.strike = {};
        settings.strike.lastSync = new Date().toISOString();
        FleetData.saveSettings(settings);
    } else if (balResult && balResult.loginRequired) {
        return;
    } else if (balResult && balResult.strikeNotConnected) {
        // User hasn't connected their own API key - show prompt
        showConnectStrikePrompt();
        return;
    } else {
        console.warn('[Wallet] Strike balance fetch error:', balResult.error);
    }

    var strikeTxs = [];
    try {
        var [deposits, payouts, receives, payments] = await Promise.all([
            StrikeAPI.getDeposits(),
            StrikeAPI.getPayouts(),
            StrikeAPI.getReceives(),
            StrikeAPI.getPayments()
        ]);

        if (deposits && !deposits.error && Array.isArray(deposits.items || deposits)) {
            var depItems = deposits.items || deposits;
            for (var d = 0; d < depItems.length; d++) {
                var dep = depItems[d];
                strikeTxs.push({
                    source: 'Strike',
                    sourceType: 'Deposit',
                    timestamp: new Date(dep.created || dep.completedAt || dep.createdAt).getTime() / 1000,
                    amount: parseStrikeAmount(dep.amount || dep.amountReceived || dep),
                    status: dep.state || dep.status || 'completed',
                    id: dep.depositId || dep.id || ''
                });
            }
        }

        if (payouts && !payouts.error && Array.isArray(payouts.items || payouts)) {
            var payItems = payouts.items || payouts;
            for (var p = 0; p < payItems.length; p++) {
                var pay = payItems[p];

                var payoutAmount = -parseStrikeAmount(pay.amount || pay.amountPaid || pay.amountSent || pay.total || pay);
                if (isNaN(payoutAmount)) {
                    console.warn('[Wallet] Could not parse payout amount for payout #' + p);
                    payoutAmount = 0;
                }

                var payoutTimestamp = new Date(
                    pay.created ||
                    pay.completedAt ||
                    pay.createdAt ||
                    pay.timestamp ||
                    pay.date ||
                    pay.updatedAt ||
                    Date.now()
                ).getTime() / 1000;

                if (isNaN(payoutTimestamp)) {
                    console.warn('[Wallet] Could not parse payout timestamp for payout #' + p);
                    payoutTimestamp = Math.floor(Date.now() / 1000);
                }

                strikeTxs.push({
                    source: 'Strike',
                    sourceType: 'Payout',
                    timestamp: payoutTimestamp,
                    amount: payoutAmount,
                    status: (pay.state || pay.status || 'completed').toLowerCase(),
                    id: pay.payoutId || pay.id || pay.paymentId || 'payout-' + p
                });
            }
        }

        if (receives && !receives.error && Array.isArray(receives.items || receives)) {
            var recItems = receives.items || receives;
            for (var r = 0; r < recItems.length; r++) {
                var rec = recItems[r];
                strikeTxs.push({
                    source: 'Strike',
                    sourceType: 'Receive',
                    timestamp: new Date(rec.created || rec.completedAt || rec.createdAt).getTime() / 1000,
                    amount: parseStrikeAmount(rec.amountReceived || rec.amountCredited || rec.amount || rec),
                    status: rec.state || rec.status || 'completed',
                    id: rec.receiveId || rec.id || ''
                });
            }
        }

        // Process payments (Bitcoin sends, Lightning sends)
        if (payments && !payments.error && Array.isArray(payments.items || payments)) {
            var payItems = payments.items || payments;
            for (var pm = 0; pm < payItems.length; pm++) {
                var payment = payItems[pm];

                // Determine payment type and amount
                var isOutbound = payment.direction === 'out' || payment.amount < 0;
                var paymentAmount = parseStrikeAmount(payment.amount || payment.total || payment);

                // Make outbound payments negative
                if (isOutbound && paymentAmount > 0) {
                    paymentAmount = -paymentAmount;
                }

                strikeTxs.push({
                    source: 'Strike',
                    sourceType: isOutbound ? 'Send' : 'Payment',
                    timestamp: new Date(payment.created || payment.completedAt || payment.createdAt).getTime() / 1000,
                    amount: paymentAmount,
                    status: (payment.state || payment.status || 'completed').toLowerCase(),
                    id: payment.paymentId || payment.id || ''
                });
            }
        }
    } catch(e) {
        console.warn('[Wallet] Strike transaction fetch error:', e);
    }

    strikeTransactions = strikeTxs;

    // Also refresh Accounting tab Strike data if connected
    if (acctStrikeConnected) {
        fetchStrikeAccountingData().catch(function(e) {
            console.warn('[Accounting] Auto-refresh failed:', e);
        });
    }
}

function parseStrikeAmount(amountObj) {
    if (!amountObj) return 0;
    if (typeof amountObj === 'object') {
        var val = parseFloat(amountObj.amount) || 0;
        var cur = (amountObj.currency || '').toUpperCase();
        if (cur === 'BTC') return val;
        if (cur === 'USD' && liveBtcPrice > 0) return val / liveBtcPrice;
        return val;
    }
    return parseFloat(amountObj) || 0;
}

function getStrikeBtcBalance() {
    if (!strikeBalances) return 0;
    var balArr = Array.isArray(strikeBalances) ? strikeBalances : (strikeBalances.items || [strikeBalances]);
    for (var i = 0; i < balArr.length; i++) {
        if (balArr[i].currency === 'BTC') {
            return parseFloat(balArr[i].amount || balArr[i].available || 0);
        }
    }
    return 0;
}

function getStrikeUsdBalance() {
    if (!strikeBalances) return 0;
    var balArr = Array.isArray(strikeBalances) ? strikeBalances : (strikeBalances.items || [strikeBalances]);
    for (var i = 0; i < balArr.length; i++) {
        if (balArr[i].currency === 'USD') {
            return parseFloat(balArr[i].amount || balArr[i].available || 0);
        }
    }
    return 0;
}

// ===== MEMPOOL.SPACE API =====
async function fetchAddressData(address) {
    try {
        var res = await fetch('https://mempool.space/api/address/' + address);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var funded = (data.chain_stats && data.chain_stats.funded_txo_sum) || 0;
        var spent = (data.chain_stats && data.chain_stats.spent_txo_sum) || 0;
        var mFunded = (data.mempool_stats && data.mempool_stats.funded_txo_sum) || 0;
        var mSpent = (data.mempool_stats && data.mempool_stats.spent_txo_sum) || 0;
        var balance = (funded - spent + mFunded - mSpent) / 100000000;
        var txCount = ((data.chain_stats && data.chain_stats.tx_count) || 0) +
                      ((data.mempool_stats && data.mempool_stats.tx_count) || 0);
        return { balance: balance, txCount: txCount };
    } catch(e) {
        console.warn('Wallet: failed to fetch address data for', address, e);
        return { balance: 0, txCount: 0, error: true };
    }
}

async function fetchAddressTxs(address) {
    try {
        var res = await fetch('https://mempool.space/api/address/' + address + '/txs');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } catch(e) {
        console.warn('Wallet: failed to fetch TXs for', address, e);
        return [];
    }
}

// ===== LOAD & REFRESH =====
async function loadAndRefreshWallet() {
    var data = WalletData.getData();

    if (strikeConnected) {
        await fetchStrikeData();
    }

    if (data.addresses.length === 0 && !strikeConnected) {
        renderWallet();
        renderEmptyTxTable();
        return;
    }

    if (data.addresses.length > 0) {
        var promises = [];
        for (var i = 0; i < data.addresses.length; i++) {
            promises.push(fetchAddressData(data.addresses[i].address));
        }
        var results = await Promise.all(promises);

        for (var j = 0; j < data.addresses.length; j++) {
            if (!results[j].error) {
                WalletData.updateAddressData(data.addresses[j].id, results[j].balance, results[j].txCount);
            }
        }
    }

    renderWallet();
    await renderTransactionHistory();
}

// ===== RENDER SUMMARY + ADDRESS CARDS =====
function renderWallet() {
    var data = WalletData.getData();

    var totalBTC = 0;
    var totalTxCount = 0;
    for (var i = 0; i < data.addresses.length; i++) {
        totalBTC += data.addresses[i].lastBalance;
        totalTxCount += data.addresses[i].lastTxCount;
    }

    if (strikeConnected && strikeBalances) {
        var strikeBtc = getStrikeBtcBalance();
        totalBTC += strikeBtc;
        totalTxCount += strikeTransactions.length;

        // Store Strike BTC balance in localStorage for calculator access
        try {
            localStorage.setItem('protonMiningStrikeBtcBalance', strikeBtc.toString());
        } catch(e) {
            console.warn('[Banking] Could not store Strike balance:', e);
        }
    }

    document.getElementById('walletTotalBTC').textContent = fmtBTC(totalBTC, 8);
    document.getElementById('walletTotalUSD').textContent = fmtUSD(totalBTC * liveBtcPrice + (strikeConnected ? getStrikeUsdBalance() : 0));
    document.getElementById('walletPriceLabel').textContent = 'at ' + fmtUSD(liveBtcPrice);
    document.getElementById('walletAddressCount').textContent = data.addresses.length + (strikeConnected ? ' + Strike' : '');
    document.getElementById('walletTotalTxCount').textContent = totalTxCount;

    var now = new Date();
    document.getElementById('walletLastUpdate').textContent =
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');

    renderAddressCards(data);
}

function renderAddressCards(data) {
    var container = document.getElementById('addressCardsGrid');
    var html = '';

    if (strikeConnected && strikeBalances) {
        var strikeBtc = getStrikeBtcBalance();
        var strikeUsd = getStrikeUsdBalance();
        var settings = FleetData.getSettings();
        var lastSync = settings.strike && settings.strike.lastSync;
        var syncLabel = lastSync ? new Date(lastSync).toLocaleTimeString() : 'just now';

        html += '<div class="miner-card strike-card">' +
            '<div class="miner-card-header">' +
                '<div class="miner-card-model"><span class="strike-icon">&#9889;</span> Strike Account</div>' +
                '<span class="status-badge status-connected" style="font-size:10px; padding:2px 8px;">Connected</span>' +
            '</div>' +
            '<div class="miner-card-stats">' +
                '<div class="miner-card-stat"><div class="stat-label">BTC Balance</div><div class="stat-value" style="color:var(--btc-300);">' + fmtBTC(strikeBtc, 8) + ' BTC</div></div>' +
                '<div class="miner-card-stat"><div class="stat-label">USD Balance</div><div class="stat-value">' + fmtUSD(strikeUsd) + '</div></div>' +
                '<div class="miner-card-stat"><div class="stat-label">BTC in USD</div><div class="stat-value">' + fmtUSD(strikeBtc * liveBtcPrice) + '</div></div>' +
                '<div class="miner-card-stat"><div class="stat-label">Last Synced</div><div class="stat-value" style="font-size:11px;">' + syncLabel + '</div></div>' +
                (function() {
                    var strikeAddr = '';
                    for (var sd = 0; sd < data.addresses.length; sd++) {
                        if (data.addresses[sd].label && data.addresses[sd].label.toLowerCase().indexOf('strike') !== -1) {
                            strikeAddr = data.addresses[sd].address; break;
                        }
                    }
                    if (strikeAddr) {
                        return '<div class="miner-card-stat" style="grid-column:1/-1;">' +
                            '<div class="stat-label">Deposit Address</div>' +
                            '<div style="display:flex; align-items:center; gap:6px;">' +
                                '<div class="stat-value" style="font-family:monospace; font-size:10px; word-break:break-all; line-height:1.4;">' + escapeHtml(strikeAddr) + '</div>' +
                                '<button class="copy-addr-btn" data-addr="' + escapeHtml(strikeAddr) + '" style="flex-shrink:0; background:var(--panel-hover); border:1px solid var(--line-mid); color:var(--plat-300); border-radius:var(--radius); padding:3px 8px; font-size:10px; cursor:pointer;">Copy</button>' +
                            '</div>' +
                        '</div>';
                    }
                    return '<div class="miner-card-stat" style="grid-column:1/-1;">' +
                        '<div class="stat-label">Deposit Address</div>' +
                        '<div class="stat-value" style="font-size:10px; color:var(--text-dim);">Add via + Add Address (label it &quot;Strike&quot;)</div>' +
                    '</div>';
                })() +
            '</div>' +
            '<div class="miner-card-actions">' +
                '<button onclick="fetchStrikeData().then(function(){renderWallet();})">Sync</button>' +
                '<button class="delete" onclick="disconnectStrike()">Disconnect</button>' +
            '</div>' +
        '</div>';
    }

    if (data.addresses.length === 0 && !html) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;"><p>No addresses added yet</p><div class="hint">Click "+ Add Address" or connect Strike to start monitoring</div></div>';
        return;
    }

    for (var i = 0; i < data.addresses.length; i++) {
        var a = data.addresses[i];
        html += '<div class="miner-card">' +
            '<div class="miner-card-header">' +
                '<div class="miner-card-model">' + escapeHtml(a.label) + '</div>' +
                '<span class="status-badge" style="font-size:10px; padding:2px 8px; background:var(--btc-wash); color:var(--btc-300);">On-chain</span>' +
            '</div>' +
            '<div class="miner-card-stats">' +
                '<div class="miner-card-stat" style="grid-column:1/-1;">' +
                    '<div class="stat-label">Address</div>' +
                    '<div style="display:flex; align-items:center; gap:6px;">' +
                        '<div class="stat-value" style="font-family:monospace; font-size:10px; word-break:break-all; line-height:1.4;">' + escapeHtml(a.address) + '</div>' +
                        '<button class="copy-addr-btn" data-addr="' + escapeHtml(a.address) + '" style="flex-shrink:0; background:var(--btc-wash); border:1px solid var(--line-btc); color:var(--btc-300); border-radius:var(--radius); padding:3px 8px; font-size:10px; cursor:pointer;">Copy</button>' +
                    '</div>' +
                '</div>' +
                '<div class="miner-card-stat"><div class="stat-label">Balance</div><div class="stat-value" style="color:var(--btc-300);">' + fmtBTC(a.lastBalance, 8) + ' BTC</div></div>' +
                '<div class="miner-card-stat"><div class="stat-label">USD Value</div><div class="stat-value">' + fmtUSD(a.lastBalance * liveBtcPrice) + '</div></div>' +
                '<div class="miner-card-stat"><div class="stat-label">Transactions</div><div class="stat-value">' + a.lastTxCount + '</div></div>' +
            '</div>' +
            '<div class="miner-card-actions">' +
                '<button class="explorer-link" data-addr="' + escapeHtml(a.address) + '">Explorer</button>' +
                '<button class="delete" data-id="' + escapeHtml(a.id) + '">Remove</button>' +
            '</div>' +
        '</div>';
    }
    container.innerHTML = html;

    var copyBtns = container.querySelectorAll('.copy-addr-btn');
    for (var c = 0; c < copyBtns.length; c++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                copyToClipboard(btn.getAttribute('data-addr'), btn);
            });
        })(copyBtns[c]);
    }

    // Bound as a listener rather than an inline onclick so the address is never spliced
    // into a JS string literal
    var explorerBtns = container.querySelectorAll('.explorer-link');
    for (var x = 0; x < explorerBtns.length; x++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                window.open('https://mempool.space/address/' + encodeURIComponent(btn.getAttribute('data-addr')), '_blank', 'noopener');
            });
        })(explorerBtns[x]);
    }

    var btns = container.querySelectorAll('.delete[data-id]');
    for (var j = 0; j < btns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                if (confirm('Remove this address from watch list?')) {
                    WalletData.removeAddress(btn.getAttribute('data-id'));
                    loadAndRefreshWallet();
                }
            });
        })(btns[j]);
    }
}

// ===== RENDER TRANSACTION HISTORY =====
function renderEmptyTxTable() {
    document.getElementById('txHistoryBody').innerHTML =
        '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--plat-600);">No addresses added yet</td></tr>';
}

// Helper function to find address label by address
function findAddressLabel(address) {
    var data = WalletData.getData();
    for (var i = 0; i < data.addresses.length; i++) {
        if (data.addresses[i].address === address) {
            return data.addresses[i].label;
        }
    }
    return '';
}

// Render transaction filter tabs
function renderTransactionTabs() {
    var data = WalletData.getData();
    var tabs = [];

    // Always add "All" tab
    tabs.push({ label: 'All', value: 'all' });

    // Add Strike tab if connected
    if (strikeConnected) {
        tabs.push({ label: '⚡ Strike', value: 'strike' });
    }

    // Add tabs for each on-chain address
    for (var i = 0; i < data.addresses.length; i++) {
        tabs.push({
            label: data.addresses[i].label || 'Address ' + (i + 1),
            value: data.addresses[i].address
        });
    }

    // Build tab HTML
    var html = '<div class="tx-tabs">';
    for (var t = 0; t < tabs.length; t++) {
        var tab = tabs[t];
        var active = selectedTransactionTab === tab.value ? ' active' : '';
        html += '<button class="tx-tab' + active + '" data-tab-value="' +
                escapeHtml(tab.value) + '">' + escapeHtml(tab.label) + '</button>';
    }
    html += '</div>';
    return html;
}

async function renderTransactionHistory() {
    // Render tabs first
    var tabsHtml = renderTransactionTabs();
    var tabContainer = document.getElementById('txTabsContainer');

    if (tabContainer) {
        tabContainer.innerHTML = tabsHtml;

        // Add click handlers to tabs
        var tabButtons = tabContainer.querySelectorAll('.tx-tab');
        for (var b = 0; b < tabButtons.length; b++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    selectedTransactionTab = btn.getAttribute('data-tab-value');
                    renderTransactionHistory(); // Re-render with new filter
                });
            })(tabButtons[b]);
        }
    }

    var data = WalletData.getData();
    var tbody = document.getElementById('txHistoryBody');

    if (data.addresses.length === 0 && strikeTransactions.length === 0) {
        renderEmptyTxTable();
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--plat-600);">Loading transactions...</td></tr>';

    var allTxs = [];

    for (var i = 0; i < data.addresses.length; i++) {
        var addr = data.addresses[i];
        var txs = await fetchAddressTxs(addr.address);
        var limited = txs.slice(0, 10);

        for (var j = 0; j < limited.length; j++) {
            var tx = limited[j];
            var voutSum = 0;
            var vinSum = 0;

            for (var v = 0; v < (tx.vout || []).length; v++) {
                if (tx.vout[v].scriptpubkey_address === addr.address) {
                    voutSum += tx.vout[v].value;
                }
            }
            for (var n = 0; n < (tx.vin || []).length; n++) {
                if (tx.vin[n].prevout && tx.vin[n].prevout.scriptpubkey_address === addr.address) {
                    vinSum += tx.vin[n].prevout.value;
                }
            }

            var change = (voutSum - vinSum) / 100000000;

            var receivingAddr = '';
            if (change < 0) {
                for (var ra = 0; ra < (tx.vout || []).length; ra++) {
                    var voutAddr = tx.vout[ra].scriptpubkey_address;
                    if (voutAddr && voutAddr !== addr.address) { receivingAddr = voutAddr; break; }
                }
            } else {
                receivingAddr = addr.address;
            }

            allTxs.push({
                source: 'On-chain',
                sourceLabel: addr.label,
                txid: tx.txid,
                timestamp: (tx.status && tx.status.block_time) || Math.floor(Date.now() / 1000),
                confirmed: tx.status && tx.status.confirmed,
                change: change,
                type: 'on-chain',
                receivingAddr: receivingAddr
            });
        }
    }

    for (var s = 0; s < strikeTransactions.length; s++) {
        var st = strikeTransactions[s];
        allTxs.push({
            source: 'Strike',
            sourceLabel: 'Strike',
            txid: st.id,
            timestamp: st.timestamp || Math.floor(Date.now() / 1000),
            confirmed: st.status === 'COMPLETED' || st.status === 'completed',
            change: st.amount,
            type: 'strike',
            strikeType: st.sourceType,
            strikeStatus: st.status
        });
    }

    allTxs.sort(function(a, b) { return b.timestamp - a.timestamp; });

    // Filter transactions based on selectedTransactionTab
    var filteredTxs = allTxs;
    if (selectedTransactionTab !== 'all') {
        filteredTxs = allTxs.filter(function(t) {
            if (selectedTransactionTab === 'strike') {
                return t.type === 'strike';
            } else {
                return t.type === 'on-chain' &&
                       (t.receivingAddr === selectedTransactionTab ||
                        t.sourceLabel === findAddressLabel(selectedTransactionTab));
            }
        });
    }

    var html = '';
    var limit = Math.min(30, filteredTxs.length);
    for (var k = 0; k < limit; k++) {
        var t = filteredTxs[k];
        var date = new Date(t.timestamp * 1000);
        var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear() + ' ' +
            String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
        var changeColor = t.change >= 0 ? 'var(--pos)' : 'var(--neg)';
        var changePrefix = t.change >= 0 ? '+' : '';

        var sourceBadge;
        if (t.type === 'strike') {
            sourceBadge = '<span class="strike-source-badge">' + escapeHtml(t.sourceLabel) + '</span>';
        } else {
            sourceBadge = '<span class="onchain-source-badge">' + escapeHtml(t.sourceLabel) + '</span>';
        }

        var typeCol;
        if (t.type === 'strike') {
            typeCol = '<span style="font-size:11px; color:var(--plat-500);">' + (t.strikeType || 'Transfer') + '</span>';
        } else {
            var txShort = t.txid.substring(0, 10) + '...';
            typeCol = '<a href="https://mempool.space/tx/' + t.txid + '" target="_blank" rel="noopener" style="color:var(--btc-300); text-decoration:none; font-family:monospace; font-size:11px;" title="' + t.txid + '">' + txShort + '</a>';
        }

        var statusText, statusColor;
        if (t.type === 'strike') {
            var st2 = (t.strikeStatus || '').toUpperCase();
            statusText = st2 === 'COMPLETED' ? 'Completed' : st2 === 'PENDING' ? 'Pending' : t.strikeStatus || 'Unknown';
            statusColor = st2 === 'COMPLETED' ? 'var(--pos)' : 'var(--btc-300)';
        } else {
            statusText = t.confirmed ? 'Confirmed' : 'Unconfirmed';
            statusColor = t.confirmed ? 'var(--pos)' : 'var(--btc-300)';
        }

        var toCol;
        if (t.type === 'on-chain' && t.receivingAddr) {
            var addrShort = t.receivingAddr.substring(0, 8) + '...' + t.receivingAddr.substring(t.receivingAddr.length - 4);
            toCol = '<span style="font-family:monospace; font-size:10px; color:var(--plat-400);" title="' + t.receivingAddr + '">' + addrShort + '</span>';
        } else if (t.type === 'strike') {
            toCol = '<span style="font-size:11px; color:var(--plat-500);">' + (t.strikeType || '-') + '</span>';
        } else {
            toCol = '<span style="color:var(--plat-600);">-</span>';
        }

        html += '<tr>' +
            '<td>' + dateStr + '</td>' +
            '<td>' + sourceBadge + '</td>' +
            '<td>' + toCol + '</td>' +
            '<td style="color:' + changeColor + '; font-weight:500;">' + changePrefix + fmtBTC(Math.abs(t.change), 8) + '</td>' +
            '<td>' + typeCol + '</td>' +
            '<td style="color:' + statusColor + ';">' + statusText + '</td>' +
        '</tr>';
    }

    if (!html) {
        var emptyMsg = selectedTransactionTab !== 'all'
            ? 'No transactions found for this filter'
            : 'No transactions found';
        html = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--plat-600);">' + emptyMsg + '</td></tr>';
    }
    tbody.innerHTML = html;
}

// ===== AUTO REFRESH =====
function startAutoRefresh() {
    refreshInterval = setInterval(function() {
        loadAndRefreshWallet();
    }, 60000);
}

window.addEventListener('beforeunload', function() {
    if (refreshInterval) clearInterval(refreshInterval);
});

// ===== LOGOUT HANDLER =====
(function() {
    var logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Sign out of Firebase — the onAuthChange listener will clear wallet state
            if (typeof ProtonAuth !== 'undefined') {
                ProtonAuth.signOut();
            } else {
                clearAllWalletState();
            }
        });
    }
})();

// ===== ADDRESS PANEL HANDLERS =====
var addAddressPanel = document.getElementById('addAddressPanel');

document.getElementById('btnAddAddress').addEventListener('click', function() {
    document.getElementById('faAddress').value = '';
    document.getElementById('faLabel').value = '';
    var warning = document.getElementById('strikeAddressWarning');
    if (warning) warning.style.display = strikeConnected ? 'block' : 'none';
    addAddressPanel.classList.add('open');
});

document.getElementById('cancelAddress').addEventListener('click', function() {
    addAddressPanel.classList.remove('open');
});

document.getElementById('saveAddress').addEventListener('click', async function() {
    var address = document.getElementById('faAddress').value.trim();
    var label = document.getElementById('faLabel').value.trim();

    if (!validateBtcAddress(address)) {
        alert('Please enter a valid Bitcoin address (starts with 1, 3, or bc1)');
        return;
    }

    var data = WalletData.getData();
    for (var i = 0; i < data.addresses.length; i++) {
        if (data.addresses[i].address === address) {
            alert('This address is already being tracked');
            return;
        }
    }

    WalletData.addAddress(address, label);
    addAddressPanel.classList.remove('open');
    await loadAndRefreshWallet();
});

document.getElementById('btnRefreshBalances').addEventListener('click', function() {
    loadAndRefreshWallet();
});

// ===== STRIKE PANEL HANDLERS =====
// Old button removed - now using btnConnectStrikeGlobal
var oldStrikeBtn = document.getElementById('btnConnectStrike');
if (oldStrikeBtn) {
    oldStrikeBtn.addEventListener('click', function() {
        var settings = FleetData.getSettings();
        if (settings.strike && settings.strike.proxyUrl) {
            document.getElementById('walletStrikeProxyUrl').value = settings.strike.proxyUrl;
        }
        document.getElementById('walletStrikeTestResult').innerHTML = '';
        document.getElementById('strikeConnectPanel').classList.toggle('open');
    });
}

document.getElementById('cancelWalletStrike').addEventListener('click', function() {
    document.getElementById('strikeConnectPanel').classList.remove('open');
});

document.getElementById('testWalletStrike').addEventListener('click', async function() {
    var url = document.getElementById('walletStrikeProxyUrl').value.trim();
    var result = document.getElementById('walletStrikeTestResult');
    if (!url) { result.innerHTML = '<span style="color:var(--neg);">Enter a proxy URL</span>'; return; }

    result.innerHTML = '<span style="color:var(--plat-500);">Testing connection...</span>';

    var settings = FleetData.getSettings();
    if (!settings.strike) settings.strike = {};
    var oldUrl = settings.strike.proxyUrl;
    settings.strike.proxyUrl = url;
    FleetData.saveSettings(settings);

    var data = await StrikeAPI.testConnection();

    settings.strike.proxyUrl = oldUrl;
    FleetData.saveSettings(settings);

    if (data && !data.error) {
        var balances = data.balances || data;
        var balArr = Array.isArray(balances) ? balances : (balances.items || [balances]);
        var info = [];
        for (var i = 0; i < balArr.length; i++) {
            info.push(balArr[i].currency + ': ' + (balArr[i].available || balArr[i].total || '0'));
        }
        result.innerHTML = '<span style="color:var(--pos);">Connected! Balances: ' + info.join(', ') + '</span>';
    } else {
        result.innerHTML = '<span style="color:var(--neg);">Failed: ' + (data.error || 'Unknown error') + '</span>';
    }
});

document.getElementById('saveWalletStrike').addEventListener('click', async function() {
    var url = document.getElementById('walletStrikeProxyUrl').value.trim();
    var settings = FleetData.getSettings();

    if (!url) {
        disconnectStrike();
        document.getElementById('strikeConnectPanel').classList.remove('open');
        return;
    }

    settings.strike = { proxyUrl: url, enabled: true, lastSync: null };
    FleetData.saveSettings(settings);
    strikeConnected = true;
    acctStrikeConnected = true;  // Enable accounting Strike data
    updateStrikeStatus('Connected');
    updateSendButton();
    update2FAButton();
    updateAccountButtons();
    document.getElementById('strikeConnectPanel').classList.remove('open');

    // Auto-login with Firebase if signed in
    await autoLoginWithFirebase();

    // Fetch wallet and accounting data
    await fetchStrikeData();
    await fetchStrikeAccountingData();  // Has its own auth guard
    renderAccounting();
});

// NOTE: disconnectStrike() lives in the Accounting section below. A second, earlier copy used
// to be defined here — function hoisting meant the later one always won, so this one was
// unreachable and its extra cleanup steps never ran. They have been folded into the survivor.

// ===== SEND BTC PANEL =====
var activeSendQuote = null;
var quoteExpiryInterval = null;
var totpEnabled = false;
var pinEnabled = false;

function updateSendButton() {
    var btn = document.getElementById('btnSendBtc');
    var rbtn = document.getElementById('btnReceiveBtc');
    var show = (strikeConnected && StrikeAuth.isLoggedIn()) ? '' : 'none';
    if (btn) btn.style.display = show;
    if (rbtn) rbtn.style.display = show;
}

function updateTotpVisibility() {
    var grp = document.getElementById('totpGroup');
    if (grp) grp.style.display = totpEnabled ? '' : 'none';
}

function updatePinVisibility() {
    var grp = document.getElementById('pinGroup');
    if (grp) grp.style.display = pinEnabled ? '' : 'none';
}

document.getElementById('btnSendBtc').addEventListener('click', function() {
    // Block send if no PIN is set up
    var user = StrikeAuth.getUser();
    if (!user || !user.hasPin) {
        var pinSection = document.getElementById('strikeKeyPinSection');
        var keyPanel = document.getElementById('strikeApiKeyPanel');
        if (pinSection && keyPanel) {
            pinSection.style.display = '';
            keyPanel.classList.add('open');
            var resultEl = document.getElementById('strikeKeyResult');
            if (resultEl) resultEl.innerHTML = '<span style="color:var(--btc-300);">You must create a send PIN before you can send BTC.</span>';
        }
        return;
    }
    document.getElementById('sendStep1').style.display = '';
    document.getElementById('sendStep2').style.display = 'none';
    document.getElementById('sendResult').innerHTML = '';
    document.getElementById('sendTotpCode').value = '';
    document.getElementById('sendPinCode').value = '';
    document.getElementById('sendDest').value = '';
    document.getElementById('sendAmount').value = '';
    activeSendQuote = null;
    // Check if user has 2FA and/or PIN enabled
    if (user && user.has2FA) {
        totpEnabled = true;
    }
    pinEnabled = true; // PIN is always required now
    updateSendTypeUI();
    updateTotpVisibility();
    updatePinVisibility();
    document.getElementById('sendBtcPanel').classList.toggle('open');
});

document.getElementById('cancelSend').addEventListener('click', function() {
    document.getElementById('sendBtcPanel').classList.remove('open');
    clearQuoteExpiry();
});

document.getElementById('cancelQuote').addEventListener('click', function() {
    document.getElementById('sendStep1').style.display = '';
    document.getElementById('sendStep2').style.display = 'none';
    document.getElementById('sendResult').innerHTML = '';
    clearQuoteExpiry();
});

document.getElementById('sendType').addEventListener('change', updateSendTypeUI);

function updateSendTypeUI() {
    var type = document.getElementById('sendType').value;
    var destLabel = document.getElementById('sendDestLabel');
    var dest = document.getElementById('sendDest');
    var amountGroup = document.getElementById('sendAmountGroup');
    var tierGroup = document.getElementById('sendTierGroup');

    if (type === 'lightning') {
        destLabel.textContent = 'Lightning Invoice';
        dest.placeholder = 'lnbc...';
        amountGroup.style.display = '';
        tierGroup.style.display = 'none';
    } else {
        destLabel.textContent = 'BTC Address';
        dest.placeholder = 'bc1q... or 1... or 3...';
        amountGroup.style.display = '';
        tierGroup.style.display = '';
        loadOnchainTiers();
    }
}

// Real-time USD <-> BTC conversion display in send form
(function() {
    var amountInput = document.getElementById('sendAmount');
    var currencySelect = document.getElementById('sendCurrency');
    var conversionEl = document.getElementById('sendConversion');

    function updateConversion() {
        if (!conversionEl) return;
        var amt = parseFloat(amountInput.value);
        if (!amt || !isFinite(amt) || amt <= 0 || !liveBtcPrice || liveBtcPrice <= 0) {
            conversionEl.textContent = '';
            return;
        }
        var cur = currencySelect.value;
        if (cur === 'USD') {
            var btcEquiv = amt / liveBtcPrice;
            conversionEl.textContent = '\u2248 ' + fmtBTC(btcEquiv, 8) + ' BTC';
        } else {
            var usdEquiv = amt * liveBtcPrice;
            conversionEl.textContent = '\u2248 ' + fmtUSD(usdEquiv);
        }
    }

    if (amountInput) amountInput.addEventListener('input', updateConversion);
    if (currencySelect) currencySelect.addEventListener('change', updateConversion);
})();

// Auto-load on-chain fee tiers when address + amount are both filled
(function() {
    var addrInput = document.getElementById('sendDest');
    var amtInput = document.getElementById('sendAmount');
    function tryLoadTiers() {
        if (document.getElementById('sendType').value !== 'onchain') return;
        if (addrInput.value.trim() && amtInput.value.trim()) {
            loadOnchainTiers();
        }
    }
    if (addrInput) addrInput.addEventListener('blur', tryLoadTiers);
    if (amtInput) amtInput.addEventListener('blur', tryLoadTiers);
    if (amtInput) amtInput.addEventListener('change', tryLoadTiers);
})();

async function loadOnchainTiers() {
    var tierSelect = document.getElementById('sendTier');
    tierSelect.innerHTML = '<option value="">Loading tiers...</option>';

    var addr = document.getElementById('sendDest').value.trim();
    var amt = document.getElementById('sendAmount').value.trim();
    var cur = document.getElementById('sendCurrency').value;
    if (!addr || !amt) {
        tierSelect.innerHTML = '<option value="">Enter address & amount first</option>';
        return;
    }

    var body = { btcAddress: addr, amount: { amount: amt, currency: cur } };
    var data = await StrikeAPI.getOnchainTiers(body);
    var tiers = Array.isArray(data) ? data : (data && data.items ? data.items : (data && data.tiers ? data.tiers : null));
    if (tiers && tiers.length > 0) {
        tierSelect.innerHTML = '';
        for (var i = 0; i < tiers.length; i++) {
            var t = tiers[i];
            var fee = t.estimatedFee ? t.estimatedFee.amount + ' ' + t.estimatedFee.currency : 'free';
            var mins = t.estimatedDeliveryDurationInMin || '?';
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.setAttribute('data-fee', t.estimatedFee ? t.estimatedFee.amount : '0');
            opt.textContent = t.id.replace('tier_', '') + ' (~' + mins + ' min, fee: ' + fee + ')';
            tierSelect.appendChild(opt);
        }
    } else {
        var tierErr = (data && data.error) ? data.error : (data ? JSON.stringify(data) : 'Could not load tiers');
        tierSelect.innerHTML = '<option value="">' + tierErr + '</option>';
    }
}

// Get Quote
document.getElementById('btnGetQuote').addEventListener('click', async function() {
    var type = document.getElementById('sendType').value;
    var dest = document.getElementById('sendDest').value.trim();
    var amt = document.getElementById('sendAmount').value.trim();
    var cur = document.getElementById('sendCurrency').value;
    var result = document.getElementById('sendResult');

    if (!dest) { result.innerHTML = '<span style="color:var(--neg);">Enter a destination</span>'; return; }
    if (!amt) { result.innerHTML = '<span style="color:var(--neg);">Enter an amount</span>'; return; }

    result.innerHTML = '<span style="color:var(--plat-500);">Getting quote...</span>';

    var quoteData;
    if (type === 'lightning') {
        quoteData = await StrikeAPI.sendQuoteLightning({
            lnInvoice: dest,
            sourceCurrency: cur,
            amount: { amount: amt, currency: cur }
        });
    } else {
        var tierSelect = document.getElementById('sendTier');
        var tier = tierSelect.value;
        if (!tier) {
            result.innerHTML = '<span style="color:var(--plat-500);">Loading fee tiers...</span>';
            await loadOnchainTiers();
            tier = tierSelect.value;
            if (tier) {
                result.innerHTML = '<span style="color:var(--warn);">Select a fee speed, then tap Get Quote again</span>';
            } else {
                result.innerHTML = '<span style="color:var(--neg);">Could not load fee tiers</span>';
            }
            return;
        }
        var selectedOpt = tierSelect.options[tierSelect.selectedIndex];
        var tierFee = selectedOpt ? parseFloat(selectedOpt.getAttribute('data-fee') || '0') : 0;
        var amountObj = { amount: amt, currency: cur };
        if (tierFee > 0) amountObj.feePolicy = 'EXCLUSIVE';
        var body = {
            btcAddress: dest,
            sourceCurrency: cur,
            amount: amountObj
        };
        body.onchainTierId = tier;
        quoteData = await StrikeAPI.sendQuoteOnchain(body);
    }

    if (quoteData && !quoteData.error && quoteData.paymentQuoteId) {
        activeSendQuote = quoteData;
        showQuoteConfirmation(quoteData, type, dest);
        result.innerHTML = '';
    } else {
        var errMsg = quoteData.error || quoteData.message || quoteData.title || JSON.stringify(quoteData);
        result.innerHTML = '<span style="color:var(--neg);">' + errMsg + '</span>';
    }
});

function showQuoteConfirmation(quote, type, dest) {
    document.getElementById('sendStep1').style.display = 'none';
    document.getElementById('sendStep2').style.display = '';

    var totalAmt = quote.totalAmount ? quote.totalAmount.amount + ' ' + quote.totalAmount.currency : '?';
    var totalFee = quote.totalFee ? quote.totalFee.amount + ' ' + quote.totalFee.currency : '0';
    var destShort = dest.length > 30 ? dest.substring(0, 15) + '...' + dest.substring(dest.length - 15) : dest;

    var html = '<div><strong>Type:</strong> ' + (type === 'lightning' ? 'Lightning' : 'On-chain') + '</div>';
    html += '<div><strong>To:</strong> <span style="word-break:break-all; color:var(--plat-400);">' + destShort + '</span></div>';
    html += '<div><strong>Total:</strong> <span style="color:var(--btc-300);">' + totalAmt + '</span></div>';
    html += '<div><strong>Fee:</strong> ' + totalFee + '</div>';
    if (quote.conversionRate) {
        html += '<div><strong>Rate:</strong> 1 BTC = ' + (1 / parseFloat(quote.conversionRate.amount || 1)).toFixed(2) + ' ' + quote.conversionRate.sourceCurrency + '</div>';
    }

    document.getElementById('quoteDetails').innerHTML = html;

    clearQuoteExpiry();
    if (quote.validUntil) {
        var expiry = new Date(quote.validUntil).getTime();
        quoteExpiryInterval = setInterval(function() {
            var remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
            document.getElementById('quoteExpiry').textContent = remaining > 0 ? 'Quote expires in ' + remaining + 's' : 'Quote expired — go back and get a new one';
            if (remaining <= 0) clearInterval(quoteExpiryInterval);
        }, 1000);
    }
}

function clearQuoteExpiry() {
    if (quoteExpiryInterval) { clearInterval(quoteExpiryInterval); quoteExpiryInterval = null; }
}

// Confirm & Send
document.getElementById('btnConfirmSend').addEventListener('click', async function() {
    var totpCode = (document.getElementById('sendTotpCode').value || '').replace(/\s/g, '');
    var pinCode = (document.getElementById('sendPinCode').value || '').replace(/\s/g, '');
    var result = document.getElementById('sendResult');
    if (pinEnabled && (!pinCode || pinCode.length < 4)) {
        result.innerHTML = '<span style="color:var(--neg);">Enter your 4-digit send PIN</span>'; return;
    }
    if (totpEnabled && (!totpCode || totpCode.length !== 6)) {
        result.innerHTML = '<span style="color:var(--neg);">Enter the 6-digit code from Google Authenticator</span>'; return;
    }
    if (!activeSendQuote || !activeSendQuote.paymentQuoteId) { result.innerHTML = '<span style="color:var(--neg);">No active quote</span>'; return; }

    if (activeSendQuote.validUntil && new Date(activeSendQuote.validUntil).getTime() < Date.now()) {
        result.innerHTML = '<span style="color:var(--neg);">Quote expired. Go back and get a new one.</span>';
        return;
    }

    result.innerHTML = '<span style="color:var(--btc-300);">Sending...</span>';
    document.getElementById('btnConfirmSend').disabled = true;

    var sendResult = await StrikeAPI.executeSend(activeSendQuote.paymentQuoteId, totpCode || undefined, pinCode || undefined);

    document.getElementById('btnConfirmSend').disabled = false;
    document.getElementById('sendTotpCode').value = '';
    document.getElementById('sendPinCode').value = '';
    clearQuoteExpiry();

    if (sendResult && !sendResult.error) {
        var state = sendResult.state || 'COMPLETED';
        result.innerHTML = '<span style="color:var(--pos);">Payment ' + state + '!</span>';
        activeSendQuote = null;
        setTimeout(function() {
            document.getElementById('sendBtcPanel').classList.remove('open');
            window.scrollTo(0, 0);
            loadAndRefreshWallet();
        }, 2000);
    } else {
        if (sendResult.totpRequired) {
            totpEnabled = true;
            updateTotpVisibility();
        }
        if (sendResult.pinNotSet) {
            // No PIN configured — redirect to PIN setup
            document.getElementById('sendBtcPanel').classList.remove('open');
            var pinSection = document.getElementById('strikeKeyPinSection');
            var keyPanel = document.getElementById('strikeApiKeyPanel');
            if (pinSection && keyPanel) {
                pinSection.style.display = '';
                keyPanel.classList.add('open');
                keyPanel.dataset.pinRequired = 'true';
                var kr = document.getElementById('strikeKeyResult');
                if (kr) kr.innerHTML = '<span style="color:var(--btc-300);">You must create a send PIN before you can send BTC.</span>';
            }
        } else if (sendResult.pinRequired) {
            pinEnabled = true;
            updatePinVisibility();
        }
        result.innerHTML = '<span style="color:var(--neg);">' + (sendResult.error || 'Send failed') + '</span>';
    }
});

// ===== 2FA SETUP =====
var BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(len) {
    var arr = new Uint8Array(len || 20);
    crypto.getRandomValues(arr);
    var out = '';
    for (var i = 0; i < arr.length; i++) {
        out += BASE32_CHARS[arr[i] % 32];
    }
    return out;
}

function update2FAButton() {
    var btn = document.getElementById('btnSetup2FA');
    if (btn) btn.style.display = (strikeConnected && StrikeAuth.isLoggedIn()) ? '' : 'none';
}

var btn2FA = document.getElementById('btnSetup2FA');
if (btn2FA) {
    btn2FA.addEventListener('click', function() {
        document.getElementById('twofa-setup-content').style.display = '';
        document.getElementById('twofa-setup-result').style.display = 'none';
        document.getElementById('setup2FAPanel').classList.toggle('open');
    });
}

var cancel2FA = document.getElementById('cancel2FA');
if (cancel2FA) {
    cancel2FA.addEventListener('click', function() {
        document.getElementById('setup2FAPanel').classList.remove('open');
    });
}

document.getElementById('btnGenerate2FA').addEventListener('click', function() {
    var secret = generateBase32Secret(16);
    // Use Firebase email for 2FA label
    var fbUser = (typeof ProtonAuth !== 'undefined') ? ProtonAuth.getUser() : null;
    var label = fbUser ? (fbUser.email || fbUser.displayName || 'user') : 'user';
    var otpauthUri = 'otpauth://totp/ProtonMining:' + label + '?secret=' + secret + '&issuer=ProtonMining';

    document.getElementById('twofa-secret-display').textContent = secret;
    document.getElementById('twofa-setup-content').style.display = 'none';
    document.getElementById('twofa-setup-result').style.display = '';

    var qrEl = document.getElementById('twofa-qr');
    qrEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=M&data=' + encodeURIComponent(otpauthUri);

    window._pending2FASecret = secret;

    var verifyInput = document.getElementById('twofa-verify-code');
    var saveBtn = document.getElementById('btnSave2FAToWorker');
    var resultEl = document.getElementById('twofa-save-result');
    if (verifyInput) verifyInput.value = '';
    if (resultEl) resultEl.innerHTML = '';
    if (saveBtn) saveBtn.disabled = false;
});

document.getElementById('btnSave2FAToWorker').addEventListener('click', async function() {
    var secret = window._pending2FASecret;
    var code = (document.getElementById('twofa-verify-code').value || '').replace(/\s/g, '');
    var resultEl = document.getElementById('twofa-save-result');

    if (!secret) { resultEl.innerHTML = '<span style="color:var(--neg);">Generate a secret first.</span>'; return; }
    if (!code || code.length !== 6) { resultEl.innerHTML = '<span style="color:var(--neg);">Enter the 6-digit code from your authenticator.</span>'; return; }

    resultEl.innerHTML = '<span style="color:var(--plat-500);">Saving...</span>';
    this.disabled = true;

    var data = await StrikeAPI.apiPost('/auth/setup-totp', { secret: secret, code: code });

    this.disabled = false;
    if (data && data.ok) {
        resultEl.innerHTML = '<span style="color:var(--pos);">2FA activated! All sends now require an authenticator code.</span>';
        totpEnabled = true;
        updateTotpVisibility();
        window._pending2FASecret = null;
        // Update local user record
        var user = StrikeAuth.getUser();
        if (user) {
            user.has2FA = true;
            StrikeAuth.saveSession(StrikeAuth.getToken(), user);
        }
    } else {
        resultEl.innerHTML = '<span style="color:var(--neg);">' + (data.error || data.message || 'Failed to save') + '</span>';
    }
});

// ===== RECEIVE BTC PANEL =====
document.getElementById('btnReceiveBtc').addEventListener('click', function() {
    document.getElementById('invoiceResult').style.display = 'none';
    document.getElementById('receiveAmount').value = '';
    document.getElementById('receiveDescription').value = '';
    document.getElementById('receiveResult').innerHTML = '';
    document.getElementById('receiveConversion').textContent = '';
    document.getElementById('receiveBtcPanel').classList.toggle('open');
});

document.getElementById('cancelReceive').addEventListener('click', function() {
    document.getElementById('receiveBtcPanel').classList.remove('open');
    if (window._invoicePollInterval) clearInterval(window._invoicePollInterval);
});

// Receive tab switching
(function() {
    var tabs = document.querySelectorAll('#receiveTabs .map-toggle-btn');
    for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
            tab.addEventListener('click', function() {
                for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
                tab.classList.add('active');
                var target = tab.getAttribute('data-tab');
                document.getElementById('receiveTabLightning').style.display = target === 'lightning' ? '' : 'none';
                document.getElementById('receiveTabOnchain').style.display = target === 'onchain' ? '' : 'none';
                if (target === 'onchain') renderOnchainReceiveTab();
            });
        })(tabs[i]);
    }
})();

// Receive amount conversion display
(function() {
    var amtInput = document.getElementById('receiveAmount');
    var curSelect = document.getElementById('receiveCurrency');
    var convEl = document.getElementById('receiveConversion');
    function updateConv() {
        if (!convEl) return;
        var amt = parseFloat(amtInput.value);
        if (!amt || !isFinite(amt) || amt <= 0 || !liveBtcPrice || liveBtcPrice <= 0) { convEl.textContent = ''; return; }
        if (curSelect.value === 'USD') {
            convEl.textContent = '\u2248 ' + fmtBTC(amt / liveBtcPrice, 8) + ' BTC';
        } else {
            convEl.textContent = '\u2248 ' + fmtUSD(amt * liveBtcPrice);
        }
    }
    if (amtInput) amtInput.addEventListener('input', updateConv);
    if (curSelect) curSelect.addEventListener('change', updateConv);
})();

// Create Lightning Invoice
document.getElementById('btnCreateInvoice').addEventListener('click', async function() {
    var amt = document.getElementById('receiveAmount').value.trim();
    var cur = document.getElementById('receiveCurrency').value;
    var desc = document.getElementById('receiveDescription').value.trim();
    var resultEl = document.getElementById('receiveResult');

    if (!amt || parseFloat(amt) <= 0) {
        resultEl.innerHTML = '<span style="color:var(--neg);">Enter an amount</span>';
        return;
    }

    resultEl.innerHTML = '<span style="color:var(--plat-500);">Creating invoice...</span>';
    this.disabled = true;

    var body = { correlationId: 'inv_' + Date.now().toString(36), description: desc || 'Payment', amount: { amount: amt, currency: cur } };
    var data = await StrikeAPI.createInvoice(body);

    if (!data || data.error || !data.invoiceId) {
        this.disabled = false;
        resultEl.innerHTML = '<span style="color:var(--neg);">' + (data && data.error || 'Failed to create invoice') + '</span>';
        return;
    }

    // Step 2: Generate quote to get the bolt11 payment request
    resultEl.innerHTML = '<span style="color:var(--plat-500);">Generating Lightning invoice...</span>';
    var quote = await StrikeAPI.createInvoiceQuote(data.invoiceId);
    this.disabled = false;

    var bolt11 = (quote && quote.lnInvoice) || '';
    if (!bolt11) {
        resultEl.innerHTML = '<span style="color:var(--neg);">' + (quote && quote.error || 'Could not generate Lightning invoice') + '</span>';
        return;
    }

    resultEl.innerHTML = '';
    document.getElementById('lnInvoiceText').textContent = bolt11;

    var qrImg = document.getElementById('lnInvoiceQR');
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent('lightning:' + bolt11);

    document.getElementById('invoiceResult').style.display = '';
    startInvoicePoll(data.invoiceId);

    // Create shareable invoice link (served from worker at /pay?id=xxx)
    var shareLinkEl = document.getElementById('invoiceShareLink');
    var shareStatusEl = document.getElementById('invoiceStatus');
    if (shareLinkEl) {
        shareLinkEl.style.display = 'none';
        shareStatusEl.innerHTML = '<span style="color:var(--plat-500);">Generating share link...</span>';
        try {
            var shareData = await StrikeAPI.shareInvoice({ amount: amt, currency: cur, description: desc || 'Payment' });
            if (shareData && shareData.shareId) {
                var shareUrl = StrikeAPI.getProxyUrl().replace(/\/$/, '') + '/pay?id=' + shareData.shareId;
                document.getElementById('shareUrlText').textContent = shareUrl;
                shareLinkEl.style.display = '';
                shareStatusEl.innerHTML = '<span style="color:var(--pos);">Share link ready!</span>';
            } else {
                shareStatusEl.innerHTML = '<span style="color:var(--neg);">Share failed: ' + (shareData && shareData.error || 'Unknown error') + '</span>';
            }
        } catch(e) {
            shareStatusEl.innerHTML = '<span style="color:var(--neg);">Share error: ' + e.message + '</span>';
        }
    } else {
    }
});

// Copy invoice
document.getElementById('btnCopyInvoice').addEventListener('click', function() {
    var bolt11 = document.getElementById('lnInvoiceText').textContent;
    copyToClipboard(bolt11, this);
});

// Copy share link
document.getElementById('btnCopyShareLink').addEventListener('click', function() {
    var url = document.getElementById('shareUrlText').textContent;
    copyToClipboard(url, this);
});

// Poll invoice for payment
function startInvoicePoll(invoiceId) {
    if (window._invoicePollInterval) clearInterval(window._invoicePollInterval);
    var statusEl = document.getElementById('invoiceStatus');
    statusEl.innerHTML = '<span style="color:var(--btc-300);">Waiting for payment...</span>';

    window._invoicePollInterval = setInterval(async function() {
        var inv = await StrikeAPI.getInvoice(invoiceId);
        if (inv && inv.state === 'PAID') {
            clearInterval(window._invoicePollInterval);
            statusEl.innerHTML = '<span style="color:var(--pos);">Payment received!</span>';
            setTimeout(function() { loadAndRefreshWallet(); }, 2000);
        } else if (inv && (inv.state === 'CANCELLED' || inv.state === 'EXPIRED')) {
            clearInterval(window._invoicePollInterval);
            statusEl.innerHTML = '<span style="color:var(--neg);">Invoice expired</span>';
        }
    }, 5000);
}

// Fetch Strike on-chain deposit address with 2-tier caching
async function fetchStrikeOnchainAddress() {
    if (strikeOnchainAddress) return strikeOnchainAddress;
    try {
        var cached = JSON.parse(localStorage.getItem('protonStrikeOnchainAddr') || 'null');
        if (cached && cached.address && cached.ts && (Date.now() - cached.ts < 86400000)) {
            strikeOnchainAddress = cached.address;
            return cached.address;
        }
    } catch(e) {}
    try {
        var data = await StrikeAPI.getOnchainAddress();
        if (data && data.ok && data.address) {
            strikeOnchainAddress = data.address;
            try { localStorage.setItem('protonStrikeOnchainAddr', JSON.stringify({ address: data.address, ts: Date.now() })); } catch(e) {}
            return data.address;
        }
    } catch(e) {}
    return null;
}

function updateOnchainBadge(type) {
    var badge = document.getElementById('onchainAddrBadge');
    if (!badge) return;
    if (type === 'strike') {
        badge.innerHTML = '<span style="font-size:11px; padding:3px 10px; border-radius:var(--radius); background:var(--panel-hover); border:1px solid var(--line-mid); color:var(--plat-300);">Strike Custodial &mdash; funds appear in your Strike balance</span>';
    } else {
        badge.innerHTML = '<span style="font-size:11px; padding:3px 10px; border-radius:var(--radius); background:var(--btc-wash); border:1px solid var(--line-btc); color:var(--btc-300);">Self-Custody Address</span>';
    }
}

// On-chain receive tab
async function renderOnchainReceiveTab() {
    var container = document.getElementById('onchainReceiveContent');
    var data = WalletData.getData();
    var isStrikeLoggedIn = strikeConnected && StrikeAuth.isLoggedIn();

    // Build unified address list
    var allAddresses = [];
    for (var i = 0; i < data.addresses.length; i++) {
        allAddresses.push({ address: data.addresses[i].address, label: data.addresses[i].label, type: 'manual' });
    }

    // Fetch Strike on-chain address if connected
    if (isStrikeLoggedIn) {
        if (strikeOnchainAddress) {
            allAddresses.unshift({ address: strikeOnchainAddress, label: 'Strike Wallet', type: 'strike' });
        } else {
            container.innerHTML = '<div style="padding:20px; color:var(--btc-300); font-size:13px;">Fetching Strike deposit address...</div>';
            var addr = await fetchStrikeOnchainAddress();
            if (addr) {
                allAddresses.unshift({ address: addr, label: 'Strike Wallet', type: 'strike' });
            }
        }
    }

    if (allAddresses.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:var(--plat-500); font-size:13px;">' +
            'No on-chain addresses available.<br><br>' +
            '<button class="btn btn-primary" onclick="document.getElementById(\'btnAddAddress\').click(); document.getElementById(\'receiveBtcPanel\').classList.remove(\'open\');">+ Add Address</button>' +
            '</div>';
        return;
    }

    // Always show selector
    var html = '<div class="input-group" style="margin-bottom:12px; text-align:left;">' +
        '<label>Select Address</label><div class="input-wrapper"><select id="receiveAddrSelect">';
    for (var i = 0; i < allAddresses.length; i++) {
        var a = allAddresses[i];
        var lbl = a.type === 'strike' ? '\u26a1 ' + escapeHtml(a.label) : escapeHtml(a.label);
        html += '<option value="' + escapeHtml(a.address) + '">' + lbl + '</option>';
    }
    html += '</select></div></div>';
    html += '<div id="onchainAddrBadge" style="margin-bottom:8px; text-align:center;"></div>';
    html += '<div style="margin:12px 0;"><img id="onchainAddrQR" width="200" height="200" style="border-radius:var(--radius); background:#fff; padding:8px;"></div>';
    html += '<div style="font-size:12px; color:var(--plat-400); margin-bottom:6px;">Bitcoin Address:</div>';
    html += '<div style="position:relative;">' +
        '<div id="onchainAddrText" style="background:var(--panel-hover); padding:10px 40px 10px 14px; border-radius:var(--radius); font-family:monospace; font-size:11px; word-break:break-all; color:var(--btc-300);"></div>' +
        '<button class="btn btn-secondary" id="btnCopyOnchainAddr" style="position:absolute; top:6px; right:6px; padding:4px 10px; font-size:11px;">Copy</button>' +
    '</div>';

    container.innerHTML = html;
    showOnchainAddress(allAddresses[0].address);
    updateOnchainBadge(allAddresses[0].type);

    var select = document.getElementById('receiveAddrSelect');
    if (select) {
        select.addEventListener('change', function() {
            showOnchainAddress(this.value);
            for (var j = 0; j < allAddresses.length; j++) {
                if (allAddresses[j].address === this.value) { updateOnchainBadge(allAddresses[j].type); break; }
            }
        });
    }

    document.getElementById('btnCopyOnchainAddr').addEventListener('click', function() {
        copyToClipboard(document.getElementById('onchainAddrText').textContent, this);
    });
}

function showOnchainAddress(address) {
    document.getElementById('onchainAddrText').textContent = address;
    var qrImg = document.getElementById('onchainAddrQR');
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent('bitcoin:' + address);
}

// ===== STRIKE API KEY PANEL =====
(function() {
    var promptConnectBtn = document.getElementById('btnConnectStrikeFromPrompt');

    function openStrikeKeyPanel() {
        document.getElementById('strikeApiKeyInput').value = '';
        document.getElementById('strikeKeyResult').innerHTML = '';
        document.getElementById('strikeApiKeyPanel').classList.add('open');
    }

    if (promptConnectBtn) promptConnectBtn.addEventListener('click', openStrikeKeyPanel);

    var cancelBtn = document.getElementById('cancelStrikeKey');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            var panel = document.getElementById('strikeApiKeyPanel');
            if (panel.dataset.pinRequired === 'true') {
                var resultEl = document.getElementById('strikeKeyResult');
                if (resultEl) resultEl.innerHTML = '<span style="color:var(--btc-300);">You must create a send PIN before continuing.</span>';
                return; // Block close
            }
            panel.classList.remove('open');
        });
    }

    var saveBtn = document.getElementById('saveStrikeKey');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            var apiKey = document.getElementById('strikeApiKeyInput').value.trim();
            var resultEl = document.getElementById('strikeKeyResult');

            if (!apiKey) { resultEl.innerHTML = '<span style="color:var(--neg);">Enter your Strike API key</span>'; return; }

            resultEl.innerHTML = '<span style="color:var(--plat-500);">Connecting to Strike...</span>';
            saveBtn.disabled = true;

            var data = await StrikeAPI.connectStrike(apiKey);
            saveBtn.disabled = false;

            if (data && data.ok) {
                // Update local user - create new if doesn't exist
                var user = StrikeAuth.getUser() || { email: '', maxSendUsd: 1000, maxSendsPerHour: 5 };
                user.strikeConnected = true;
                user.hasOwnKey = true;
                user.hasPin = user.hasPin || false;
                user.has2FA = user.has2FA || false;

                // Get token from current session or response
                var token = StrikeAuth.getToken() || data.token || '';
                StrikeAuth.saveSession(token, user);

                // Set global Strike connection flag
                strikeConnected = true;
                updateStrikeStatus('Connected');
                updateSendButton();
                update2FAButton();

                hideConnectStrikePrompt();
                updateAccountButtons();
                // Show PIN creation UI — PIN is mandatory, cannot skip
                var pinSection = document.getElementById('strikeKeyPinSection');
                if (pinSection && !(user && user.hasPin)) {
                    resultEl.innerHTML = '<span style="color:var(--pos);">Strike connected! Now create a send PIN below.</span>';
                    pinSection.style.display = '';
                    // Mark panel as requiring PIN before close
                    document.getElementById('strikeApiKeyPanel').dataset.pinRequired = 'true';
                } else {
                    resultEl.innerHTML = '<span style="color:var(--pos);">Strike account connected!</span>';
                    setTimeout(function() {
                        document.getElementById('strikeApiKeyPanel').classList.remove('open');
                        loadAndRefreshWallet();
                    }, 1000);
                }
            } else {
                resultEl.innerHTML = '<span style="color:var(--neg);">' + (data.error || 'Failed to connect') + '</span>';
            }
        });
    }
})();

// ===== PIN SAVE HANDLER =====
(function() {
    var pinBtn = document.getElementById('btnSavePin');
    if (pinBtn) {
        pinBtn.addEventListener('click', async function() {
            var pin = (document.getElementById('newPinInput').value || '').trim();
            var confirm = (document.getElementById('confirmPinInput').value || '').trim();
            var resultEl = document.getElementById('pinSaveResult');

            if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
                resultEl.innerHTML = '<span style="color:var(--neg);">PIN must be 4-6 digits.</span>'; return;
            }
            if (pin !== confirm) {
                resultEl.innerHTML = '<span style="color:var(--neg);">PINs do not match.</span>'; return;
            }

            resultEl.innerHTML = '<span style="color:var(--plat-500);">Saving PIN...</span>';
            pinBtn.disabled = true;

            var data = await StrikeAPI.setPin(pin);
            pinBtn.disabled = false;

            if (data && data.ok) {
                resultEl.innerHTML = '<span style="color:var(--pos);">Send PIN saved!</span>';
                pinEnabled = true;
                var user = StrikeAuth.getUser();
                if (user) {
                    user.hasPin = true;
                    StrikeAuth.saveSession(StrikeAuth.getToken(), user);
                }
                setTimeout(function() {
                    document.getElementById('strikeApiKeyPanel').classList.remove('open');
                    loadAndRefreshWallet();
                }, 1500);
            } else {
                resultEl.innerHTML = '<span style="color:var(--neg);">' + (data.error || data.message || 'Failed to save PIN') + '</span>';
            }
        });
    }
})();

// ===== ACCOUNT SETTINGS PANEL =====
(function() {
    var settingsBtn = document.getElementById('btnAccountSettings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            var user = StrikeAuth.getUser();
            if (user) {
                document.getElementById('settingsMaxSend').value = user.maxSendUsd || 1000;
                document.getElementById('settingsSendsPerHour').value = user.maxSendsPerHour || 5;
            }
            document.getElementById('settingsResult').innerHTML = '';
            document.getElementById('accountSettingsPanel').classList.add('open');
        });
    }

    var cancelBtn = document.getElementById('cancelAccountSettings');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            document.getElementById('accountSettingsPanel').classList.remove('open');
        });
    }

    var saveBtn = document.getElementById('saveAccountSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            var maxSend = parseFloat(document.getElementById('settingsMaxSend').value) || 0;
            var sendsPerHour = parseInt(document.getElementById('settingsSendsPerHour').value) || 5;
            var resultEl = document.getElementById('settingsResult');

            resultEl.innerHTML = '<span style="color:var(--plat-500);">Saving...</span>';
            saveBtn.disabled = true;

            var data = await StrikeAPI.updateSettings({ maxSendUsd: maxSend, maxSendsPerHour: sendsPerHour });
            saveBtn.disabled = false;

            if (data && data.ok) {
                resultEl.innerHTML = '<span style="color:var(--pos);">Settings saved!</span>';
                // Update local user
                var user = StrikeAuth.getUser();
                if (user) {
                    user.maxSendUsd = data.maxSendUsd;
                    user.maxSendsPerHour = data.maxSendsPerHour;
                    StrikeAuth.saveSession(StrikeAuth.getToken(), user);
                }
            } else {
                resultEl.innerHTML = '<span style="color:var(--neg);">' + (data.error || 'Failed to save') + '</span>';
            }
        });
    }

    var disconnectBtn = document.getElementById('btnDisconnectStrikeKey');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', async function() {
            if (!confirm('Disconnect your Strike API key? You can reconnect anytime.')) return;

            var data = await StrikeAPI.disconnectStrikeAccount();
            if (data && data.ok) {
                // Update local user
                var user = StrikeAuth.getUser();
                if (user) {
                    user.strikeConnected = data.strikeConnected;
                    user.hasOwnKey = false;
                    StrikeAuth.saveSession(StrikeAuth.getToken(), user);
                }
                strikeBalances = null;
                strikeTransactions = [];
                updateAccountButtons();
                document.getElementById('accountSettingsPanel').classList.remove('open');
                if (!data.strikeConnected) {
                    showConnectStrikePrompt();
                }
                renderWallet();
                renderTransactionHistory();
            }
        });
    }
})();


// ===== SECTION 4: INCOME TAB LOGIC (from payouts.js) =====

// ===== AUTO-LOG DAILY SNAPSHOT =====
function checkAndLogDailySnapshot() {
    try {
        var settings = FleetData.getSettings();
        var pools = settings.pools || [];
        var hasEnabled = false;
        for (var p = 0; p < pools.length; p++) {
            if (pools[p].enabled) { hasEnabled = true; break; }
        }
        if (!hasEnabled) return;

        // Aggregate earnings from all pools
        var poolEarnings = window.poolEarnings || {};
        var agg = { yesterdayIncome: 0, balance: 0, totalIncome: 0 };
        var hasAny = false;
        var types = Object.keys(poolEarnings);
        for (var k = 0; k < types.length; k++) {
            var pe = poolEarnings[types[k]];
            if (pe) {
                hasAny = true;
                agg.yesterdayIncome += pe.yesterdayIncome || 0;
                agg.balance += pe.balance || 0;
                agg.totalIncome += pe.totalIncome || 0;
            }
        }
        // Backward compat: also check legacy f2poolEarnings
        if (!hasAny && window.f2poolEarnings) {
            agg.yesterdayIncome = window.f2poolEarnings.yesterdayIncome || 0;
            agg.balance = window.f2poolEarnings.balance || 0;
            agg.totalIncome = window.f2poolEarnings.totalIncome || 0;
            hasAny = true;
        }
        if (!hasAny) return;

        var today = new Date().toISOString().split('T')[0];
        var data = PayoutData.getData();
        if (data.lastSnapshotDate === today) return;

        PayoutData.addSnapshot({
            date: today,
            btcEarned: agg.yesterdayIncome,
            btcPrice: liveBtcPrice,
            balance: agg.balance,
            totalIncome: agg.totalIncome
        });
    } catch(e) {}
}

// ===== ALL-POOL PAYOUT SYNC =====
async function syncAllPoolPayouts() {
    var statusEl = document.getElementById('f2poolSyncStatus');
    try {
        var settings = FleetData.getSettings();
        var pools = settings.pools || [];
        var totalAdded = 0;
        var syncedPools = [];

        for (var p = 0; p < pools.length; p++) {
            var pool = pools[p];
            if (!pool.enabled || !pool.workerUrl) continue;

            try {
                var fetchUrl = pool.workerUrl + '/payouts';
                if (pool.username) fetchUrl += '?user=' + encodeURIComponent(pool.username);

                if (statusEl) statusEl.textContent = 'Syncing payouts from ' + pool.name + '...';

                var res = await fetch(fetchUrl);
                if (!res.ok) continue;
                var json = await res.json();

                var transactions = (json.data && json.data.transactions) || json.transactions || [];
                var added = 0;

                for (var i = 0; i < transactions.length; i++) {
                    var tx = transactions[i];
                    var extra = tx.payout_extra;
                    if (!extra || !extra.tx_id) continue;

                    if (PayoutData.hasPayoutWithTxHash(extra.tx_id)) continue;

                    var ts = extra.paid_time || tx.created_at;
                    var d = new Date(ts * 1000);
                    var dateStr = d.getFullYear() + '-' +
                        String(d.getMonth() + 1).padStart(2, '0') + '-' +
                        String(d.getDate()).padStart(2, '0');

                    var btcAmount = parseFloat(extra.value) || Math.abs(parseFloat(tx.changed_balance)) || 0;
                    if (btcAmount <= 0) continue;

                    // Price the payout from ITS OWN DATE, not from now.
                    //
                    // This used to write `btcPrice: liveBtcPrice` — the spot price at sync time —
                    // beside a date it had just correctly derived from the pool's paid_time. A
                    // first sync back-fills the pool's whole history at once, so every one of
                    // those payouts got a single day's price. It is the cost-basis record that
                    // reaches the tax export, and nothing about it looked wrong: the date and the
                    // BTC amount were right.
                    //
                    // Where history does not cover the date the price is NULL and the row is
                    // marked unpriced. A payout priced from the wrong day is worse than one
                    // visibly missing a price.
                    var histPrice = (typeof PriceHistory !== 'undefined' && PriceHistory.priceOnDate)
                        ? PriceHistory.priceOnDate(dateStr) : null;
                    PayoutData.addPayout({
                        date: dateStr,
                        btcAmount: btcAmount,
                        btcPrice: histPrice,
                        usdValue: histPrice === null ? null : btcAmount * histPrice,
                        priceBasis: histPrice === null ? 'unpriced' : 'close_on_payout_date',
                        txHash: extra.tx_id,
                        notes: pool.name + ' auto-sync'
                    });
                    added++;
                }
                totalAdded += added;
                if (added > 0) syncedPools.push(pool.name);
            } catch(poolErr) {}
        }

        if (totalAdded > 0) {
            renderPayoutPage();
            updatePayoutChart();
        }

        if (statusEl) {
            if (totalAdded > 0) {
                statusEl.textContent = 'Synced ' + totalAdded + ' new payout' + (totalAdded > 1 ? 's' : '') + ' from ' + syncedPools.join(', ');
            } else if (pools.length > 0) {
                statusEl.textContent = 'All pool payouts up to date';
            }
            setTimeout(function() { statusEl.textContent = ''; }, 5000);
        }
    } catch(e) {
        if (statusEl) {
            statusEl.textContent = 'Pool sync failed';
            setTimeout(function() { statusEl.textContent = ''; }, 5000);
        }
    }
}

// ===== RENDER PAYOUT PAGE =====
function renderPayoutPage() {
    var data = PayoutData.getData();

    // Calculate totals from payouts
    var totalPayoutBTC = 0;
    var totalPayoutUSD = 0;
    for (var p = 0; p < data.payouts.length; p++) {
        totalPayoutBTC += data.payouts[p].btcAmount;
        totalPayoutUSD += data.payouts[p].usdValue;
    }

    // Calculate totals from snapshots
    var totalSnapshotBTC = 0;
    for (var s = 0; s < data.snapshots.length; s++) {
        totalSnapshotBTC += data.snapshots[s].btcEarned;
    }

    var totalBTC = totalPayoutBTC + totalSnapshotBTC;
    var avgDaily = data.snapshots.length > 0 ? totalSnapshotBTC / data.snapshots.length : 0;
    var avgPrice = totalPayoutBTC > 0 ? totalPayoutUSD / totalPayoutBTC : liveBtcPrice;

    // Update summary cards
    document.getElementById('sumTotalEarned').textContent = fmtBTC(totalBTC, 8);
    document.getElementById('sumTotalUSD').textContent = fmtUSD(totalBTC * liveBtcPrice);
    document.getElementById('sumAvgPrice').textContent = 'at current price';
    document.getElementById('sumAvgDaily').textContent = fmtBTC(avgDaily, 8);
    document.getElementById('sumTotalPayouts').textContent = data.payouts.length;
    document.getElementById('sumPayoutBTC').textContent = fmtBTC(totalPayoutBTC, 6) + ' BTC';

    if (data.lastSnapshotDate && data.snapshots.length > 0) {
        var lastSnap = data.snapshots[data.snapshots.length - 1];
        document.getElementById('sumLastSnapshot').textContent = fmtBTC(lastSnap.btcEarned, 8);
        document.getElementById('sumSnapshotDate').textContent = lastSnap.date;
    } else {
        document.getElementById('sumLastSnapshot').textContent = '--';
        document.getElementById('sumSnapshotDate').textContent = 'Connect F2Pool for auto-logging';
    }

    renderPayoutTable();
    renderElectricitySummary();
    renderElectricityTable();
}

// ===== AUTO-ESTIMATE ELECTRICITY FROM FLEET =====
function autoEstimateElectricity() {
    var summary = FleetData.getFleetSummary();
    if (summary.totalPower <= 0) {
        alert('No online miners in fleet. Add miners on the Dashboard page first.');
        return false;
    }

    // Get electricity rate and uptime from calculator settings or fleet defaults
    var calcSettings = null;
    try {
        var raw = localStorage.getItem('btcMinerCalcSettings');
        if (raw) calcSettings = JSON.parse(raw);
    } catch(e) {}

    var elecCost = (calcSettings && calcSettings.elecCost) ? parseFloat(calcSettings.elecCost) : summary.defaults.elecCost;
    var uptime = (calcSettings && calcSettings.uptime !== undefined) ? parseFloat(calcSettings.uptime) : 100;

    // Calculate for current month
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthLabel = now.toLocaleString('default', { month: 'long' }) + ' ' + year;
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    // Check if fleet estimate already exists for this month
    var entries = ElectricityData.getData();
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].notes && entries[i].notes.indexOf('Fleet estimate') === 0 &&
            entries[i].date.substring(0, 7) === dateStr.substring(0, 7)) {
            alert('Fleet estimate for ' + monthLabel + ' already exists. Delete it first to re-estimate.');
            return false;
        }
    }

    var totalKWh = summary.totalPower * 24 * daysInMonth * (uptime / 100);
    var totalCost = totalKWh * elecCost;

    ElectricityData.addEntry({
        date: dateStr,
        kwhUsed: Math.round(totalKWh),
        costUSD: Math.round(totalCost * 100) / 100,
        notes: 'Fleet estimate — ' + monthLabel + ' (' + summary.totalPower.toFixed(2) + ' kW \u00d7 ' + daysInMonth + 'd @ $' + elecCost.toFixed(4) + '/kWh)'
    });

    renderPayoutPage();
    updateRevCostChart();
    return true;
}

// ===== ELECTRICITY RENDER =====
function renderElectricitySummary() {
    var sum = ElectricityData.getSummary();
    document.getElementById('elecTotalCost').textContent = fmtUSD(sum.totalCost);
    document.getElementById('elecAvgMonthly').textContent = fmtUSD(sum.avgMonthly);
    document.getElementById('elecTotalKWh').textContent = sum.totalKWh.toLocaleString() + ' kWh';
    document.getElementById('elecEffRate').textContent = '$' + sum.effectiveRate.toFixed(4) + '/kWh';
}

function renderElectricityTable() {
    var entries = ElectricityData.getData();
    var tbody = document.getElementById('elecTableBody');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--plat-600);">No electricity bills logged yet</td></tr>';
        return;
    }

    var sorted = entries.slice().sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var e = sorted[i];
        html += '<tr>' +
            '<td>' + escapeHtml(e.date) + '</td>' +
            '<td>' + e.kwhUsed.toLocaleString() + '</td>' +
            '<td style="color:var(--neg)">' + fmtUSD(e.costUSD) + '</td>' +
            '<td>$' + e.effectiveRate.toFixed(4) + '</td>' +
            '<td>' + escapeHtml(e.notes || '--') + '</td>' +
            '<td><button class="delete-elec" data-id="' + escapeHtml(e.id) + '">&times;</button></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;

    var btns = tbody.querySelectorAll('.delete-elec');
    for (var j = 0; j < btns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                if (confirm('Delete this electricity entry?')) {
                    ElectricityData.removeEntry(btn.getAttribute('data-id'));
                    renderPayoutPage();
                    updateRevCostChart();
                }
            });
        })(btns[j]);
    }
}

function renderPayoutTable() {
    var data = PayoutData.getData();
    var tbody = document.getElementById('payoutTableBody');

    if (data.payouts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--plat-600);">No payouts logged yet</td></tr>';
        return;
    }

    // Sort by date descending
    var sorted = data.payouts.slice().sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        // notes and txHash are free-text user input — escape before interpolating
        var safeHash = encodeURIComponent(p.txHash || '');
        var txDisplay = p.txHash
            ? '<a href="https://mempool.space/tx/' + safeHash + '" target="_blank" rel="noopener" style="color:var(--btc-300); text-decoration:none;" title="' + escapeHtml(p.txHash) + '">' + escapeHtml(p.txHash.substring(0, 12)) + '...</a>'
            : '--';
        html += '<tr>' +
            '<td>' + escapeHtml(p.date) + '</td>' +
            '<td style="color:var(--btc-300)">' + fmtBTC(p.btcAmount, 8) + '</td>' +
            '<td>' + fmtUSD(p.btcPrice) + '</td>' +
            '<td>' + fmtUSD(p.usdValue) + '</td>' +
            '<td style="font-family:monospace; font-size:11px;">' + txDisplay + '</td>' +
            '<td>' + escapeHtml(p.notes || '--') + '</td>' +
            '<td><button class="delete-payout" data-id="' + p.id + '">&times;</button></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;

    // Attach delete handlers
    var btns = tbody.querySelectorAll('.delete-payout');
    for (var j = 0; j < btns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                if (confirm('Delete this payout entry?')) {
                    PayoutData.removePayout(btn.getAttribute('data-id'));
                    renderPayoutPage();
                    updatePayoutChart();
                }
            });
        })(btns[j]);
    }
}

// ===== PANEL HANDLERS =====
var addPayoutPanel = document.getElementById('addPayoutPanel');
var addBillPanel = document.getElementById('addBillPanel');

// -- Add Bill panel --
document.getElementById('btnAddBill').addEventListener('click', function() {
    document.getElementById('fbDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fbKwh').value = '';
    document.getElementById('fbCost').value = '';
    document.getElementById('fbNotes').value = '';
    addPayoutPanel.classList.remove('open');
    addBillPanel.classList.toggle('open');
});

document.getElementById('cancelBill').addEventListener('click', function() {
    addBillPanel.classList.remove('open');
});

// -- Estimate from Fleet button --
document.getElementById('btnEstimateFleet').addEventListener('click', function() {
    addPayoutPanel.classList.remove('open');
    addBillPanel.classList.remove('open');
    autoEstimateElectricity();
});

document.getElementById('saveBill').addEventListener('click', function() {
    var date = document.getElementById('fbDate').value;
    var kwhUsed = parseFloat(document.getElementById('fbKwh').value);
    var costUSD = parseFloat(document.getElementById('fbCost').value);
    var notes = document.getElementById('fbNotes').value.trim();

    if (!date || !kwhUsed || kwhUsed <= 0 || !costUSD || costUSD <= 0) return;

    ElectricityData.addEntry({
        date: date,
        kwhUsed: kwhUsed,
        costUSD: costUSD,
        notes: notes
    });

    addBillPanel.classList.remove('open');
    renderPayoutPage();
    updateRevCostChart();
});

document.getElementById('btnAddPayout').addEventListener('click', function() {
    document.getElementById('fpDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fpBtcAmount').value = '';
    document.getElementById('fpBtcPrice').value = '';
    document.getElementById('fpTxHash').value = '';
    document.getElementById('fpNotes').value = '';
    addBillPanel.classList.remove('open');
    addPayoutPanel.classList.toggle('open');
});

document.getElementById('cancelPayout').addEventListener('click', function() {
    addPayoutPanel.classList.remove('open');
});

document.getElementById('savePayout').addEventListener('click', function() {
    var date = document.getElementById('fpDate').value;
    var btcAmount = parseFloat(document.getElementById('fpBtcAmount').value);
    var btcPrice = parseFloat(document.getElementById('fpBtcPrice').value) || liveBtcPrice;
    var txHash = document.getElementById('fpTxHash').value.trim();
    var notes = document.getElementById('fpNotes').value.trim();

    if (!date || !btcAmount || btcAmount <= 0) return;

    PayoutData.addPayout({
        date: date,
        btcAmount: btcAmount,
        btcPrice: btcPrice,
        usdValue: btcAmount * btcPrice,
        txHash: txHash,
        notes: notes
    });

    addPayoutPanel.classList.remove('open');
    renderPayoutPage();
    updatePayoutChart();
});

// ===== EARNINGS CHART =====
function initPayoutChart() {
    var ctx = document.getElementById('earningsOverTimeChart');
    var chartData = generatePayoutChartData();

    payoutChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'Cumulative BTC',
                    data: chartData.btcValues,
                    borderColor: ProtonTheme.btc,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.btc, 0.1),
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'y',
                    pointRadius: 3,
                    tension: 0.3
                },
                {
                    label: 'USD Value',
                    data: chartData.usdValues,
                    borderColor: ProtonTheme.pos,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.pos, 0.1),
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    pointRadius: 3,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: {} },
                tooltip: {
                }
            },
            scales: {
                x: {
                    ticks: {},
                    grid: {}
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        color: ProtonTheme.btc,
                        font: { size: 11 },
                        callback: function(v) { return v.toFixed(4) + ' BTC'; }
                    },
                    grid: {}
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    ticks: {
                        color: ProtonTheme.pos,
                        font: { size: 11 },
                        callback: function(v) { return '$' + v.toFixed(0); }
                    },
                    grid: { display: false }
                }
            }
        }
    });

    var emptyMsg = document.getElementById('chartEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = chartData.labels.length === 0 ? 'flex' : 'none';
}

function generatePayoutChartData() {
    var data = PayoutData.getData();
    var labels = [];
    var btcValues = [];
    var usdValues = [];

    // Merge snapshots and payouts, sort by date
    var entries = [];
    for (var i = 0; i < data.snapshots.length; i++) {
        var s = data.snapshots[i];
        entries.push({ date: s.date, btc: s.btcEarned, price: s.btcPrice });
    }
    for (var p = 0; p < data.payouts.length; p++) {
        var pay = data.payouts[p];
        entries.push({ date: pay.date, btc: pay.btcAmount, price: pay.btcPrice });
    }
    entries.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var cumBTC = 0;
    for (var j = 0; j < entries.length; j++) {
        cumBTC += entries[j].btc;
        labels.push(entries[j].date);
        btcValues.push(cumBTC);
        usdValues.push(cumBTC * entries[j].price);
    }

    return { labels: labels, btcValues: btcValues, usdValues: usdValues };
}

function updatePayoutChart() {
    if (!payoutChart) return;
    var chartData = generatePayoutChartData();
    payoutChart.data.labels = chartData.labels;
    payoutChart.data.datasets[0].data = chartData.btcValues;
    payoutChart.data.datasets[1].data = chartData.usdValues;
    payoutChart.update();
    var emptyMsg = document.getElementById('chartEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = chartData.labels.length === 0 ? 'flex' : 'none';
}

// ===== REVENUE VS COSTS CHART =====
// NOTE: revCostChart is declared once at the top of the file. A second `var revCostChart = null`
// used to sit here — because the #income hash handler runs switchBankingTab() near the top of
// the file, the chart was built and then this line nulled the reference on the way past,
// so updateRevCostChart() bailed out forever and the chart never refreshed.

function initRevCostChart() {
    var ctx = document.getElementById('revVsCostChart');
    if (!ctx) return;
    var chartData = generateRevCostData();

    revCostChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'Cumulative Revenue',
                    data: chartData.revenue,
                    borderColor: ProtonTheme.pos,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.pos, 0.1),
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3
                },
                {
                    label: 'Cumulative Electricity Cost',
                    data: chartData.costs,
                    borderColor: ProtonTheme.neg,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.neg, 0.1),
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: {} },
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.dataset.label + ': ' + fmtUSD(ctx.parsed.y); }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {},
                    grid: {}
                },
                y: {
                    ticks: { callback: function(v) { return '$' + v.toLocaleString(); } },
                    grid: {}
                }
            }
        }
    });

    var emptyMsg = document.getElementById('revCostEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = chartData.labels.length === 0 ? 'flex' : 'none';
}

function generateRevCostData() {
    var payoutData = PayoutData.getData();
    var elecEntries = ElectricityData.getData();

    // Build date-keyed map of all events
    var dateMap = {};
    for (var i = 0; i < payoutData.payouts.length; i++) {
        var p = payoutData.payouts[i];
        if (!dateMap[p.date]) dateMap[p.date] = { revenue: 0, cost: 0 };
        dateMap[p.date].revenue += p.usdValue;
    }
    for (var s = 0; s < payoutData.snapshots.length; s++) {
        var snap = payoutData.snapshots[s];
        if (!dateMap[snap.date]) dateMap[snap.date] = { revenue: 0, cost: 0 };
        dateMap[snap.date].revenue += snap.btcEarned * snap.btcPrice;
    }
    for (var e = 0; e < elecEntries.length; e++) {
        var bill = elecEntries[e];
        if (!dateMap[bill.date]) dateMap[bill.date] = { revenue: 0, cost: 0 };
        dateMap[bill.date].cost += bill.costUSD;
    }

    // Sort dates
    var dates = Object.keys(dateMap).sort();
    var labels = [];
    var revenue = [];
    var costs = [];
    var cumRev = 0, cumCost = 0;

    for (var d = 0; d < dates.length; d++) {
        cumRev += dateMap[dates[d]].revenue;
        cumCost += dateMap[dates[d]].cost;
        labels.push(dates[d]);
        revenue.push(Math.round(cumRev * 100) / 100);
        costs.push(Math.round(cumCost * 100) / 100);
    }

    return { labels: labels, revenue: revenue, costs: costs };
}

function updateRevCostChart() {
    if (!revCostChart) return;
    var chartData = generateRevCostData();
    revCostChart.data.labels = chartData.labels;
    revCostChart.data.datasets[0].data = chartData.revenue;
    revCostChart.data.datasets[1].data = chartData.costs;
    revCostChart.update();
    var emptyMsg = document.getElementById('revCostEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = chartData.labels.length === 0 ? 'flex' : 'none';
}


// ===== SECTION 5: ACCOUNTING TAB LOGIC (from accounting.js) =====

// ===== PERIOD MANAGEMENT =====
function setPeriod(type) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    if (type === 'month') {
        acctPeriod.start = y + '-' + String(m + 1).padStart(2, '0') + '-01';
        var lastDay = new Date(y, m + 1, 0).getDate();
        acctPeriod.end = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    } else if (type === 'quarter') {
        var qStart = Math.floor(m / 3) * 3;
        acctPeriod.start = y + '-' + String(qStart + 1).padStart(2, '0') + '-01';
        var qEndMonth = qStart + 3;
        var qEndYear = y;
        if (qEndMonth > 12) { qEndMonth = 12; }
        var qLastDay = new Date(qEndYear, qEndMonth, 0).getDate();
        acctPeriod.end = qEndYear + '-' + String(qEndMonth).padStart(2, '0') + '-' + String(qLastDay).padStart(2, '0');
    } else if (type === 'year') {
        acctPeriod.start = y + '-01-01';
        acctPeriod.end = y + '-12-31';
    }
}

// Period selector buttons
document.getElementById('periodSelector').addEventListener('click', function(e) {
    var btn = e.target.closest('.range-btn');
    if (!btn) return;
    var period = btn.getAttribute('data-period');

    // Update active state
    var all = document.querySelectorAll('#periodSelector .range-btn');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    btn.classList.add('active');

    var customRange = document.getElementById('customDateRange');
    if (period === 'custom') {
        customRange.style.display = 'flex';
        return;
    }
    customRange.style.display = 'none';
    setPeriod(period);
    renderAccounting();
});

document.getElementById('btnApplyCustom').addEventListener('click', function() {
    var s = document.getElementById('acctStartDate').value;
    var e = document.getElementById('acctEndDate').value;
    if (s && e) {
        acctPeriod.start = s;
        acctPeriod.end = e;
        renderAccounting();
    }
});

// ===== QBO CONNECTION (OAUTH) =====
function getQboProxyUrl() {
    return 'https://proton-quickbooks.proton-mining.workers.dev';
}

async function connectQuickBooks() {
    var result = document.getElementById('qboTestResult');
    if (result) result.innerHTML = '<span style="color:var(--plat-500);">Authenticating...</span>';

    // Check if we have a session token
    var token = StrikeAuth.getToken();
    if (!token) {
        // No session - try to create one using Firebase
        var fbUser = (typeof ProtonAuth !== 'undefined') ? ProtonAuth.getUser() : null;
        if (!fbUser) {
            alert('Please sign in with Google first (top right corner)');
            return;
        }

        try {
            // Exchange Firebase ID token for session token
            var idToken = await fbUser.getIdToken(true);
            var authUrl = 'https://proton-quickbooks.proton-mining.workers.dev';
            var authRes = await fetch(authUrl + '/auth/firebase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: idToken })
            });
            var authData = await authRes.json();

            if (authData && authData.ok) {
                console.log('[QB] QB worker auth succeeded');
                StrikeAuth.saveSession(authData.token, authData.user);
                token = authData.token;
            } else {
                // Don't log the response body — it carries a session token on success
                console.log('[QB] QB worker auth failed, trying Strike fallback:', (authData && authData.error) || 'unknown error');
                // Fallback to Strike worker
                try {
                    var strikeData = await StrikeAPI.firebaseLogin(idToken);
                    if (strikeData && strikeData.ok) {
                        StrikeAuth.saveSession(strikeData.token, strikeData.user);
                        token = strikeData.token;
                    } else {
                        console.error('[QB] Strike worker auth failed:', (strikeData && strikeData.error) || 'unknown error');
                        alert('Authentication failed. Please try signing out and back in.');
                        return;
                    }
                } catch (strikeErr) {
                    console.error('[QB] Strike worker error:', strikeErr);
                    alert('Authentication failed: ' + strikeErr.message);
                    return;
                }
            }
        } catch (err) {
            console.error('Auth error:', err);
            alert('Authentication failed. Please try signing out and back in.');
            return;
        }
    }

    var proxyUrl = getQboProxyUrl();
    if (result) result.innerHTML = '<span style="color:var(--plat-500);">Starting OAuth...</span>';

    try {
        var initRes = await fetch(proxyUrl + '/auth/qbo/initiate', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + StrikeAuth.getToken(),
                'Content-Type': 'application/json'
            }
        });

        var initData = await initRes.json();
        if (!initData.authUrl) throw new Error('No auth URL');

        var width = 600, height = 700;
        var left = (screen.width - width) / 2;
        var top = (screen.height - height) / 2;
        var popup = window.open(initData.authUrl, 'QuickBooks OAuth',
            'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);

        if (!popup) throw new Error('Popup blocked');
        if (result) result.innerHTML = '<span style="color:var(--plat-500);">Authorize in popup...</span>';

        var handler = function(event) {
            if (event.data && event.data.type === 'qbo-oauth-success') {
                window.removeEventListener('message', handler);
                onQuickBooksConnected(event.data.companyName);
            }
        };
        window.addEventListener('message', handler);

        var interval = setInterval(function() {
            if (popup.closed) {
                clearInterval(interval);
                window.removeEventListener('message', handler);
                checkQboConnectionStatus();
            }
        }, 500);

    } catch (e) {
        if (result) result.innerHTML = '<span style="color:var(--neg);">Error: ' + e.message + '</span>';
    }
}

async function disconnectQuickBooks() {
    if (!confirm('Disconnect QuickBooks?')) return;

    try {
        var proxyUrl = getQboProxyUrl();
        var res = await fetch(proxyUrl + '/auth/qbo/disconnect', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + StrikeAuth.getToken() }
        });

        if (res.ok) {
            qboConnected = false;
            qboData = { accounts: [], expenses: [], invoices: [] };
            updateQboStatus(null);
            renderAccounting();
        } else {
            alert('Failed to disconnect QuickBooks (HTTP ' + res.status + ')');
        }
    } catch (e) {
        alert('Failed to disconnect QuickBooks: ' + e.message);
    }
}

async function disconnectStrike() {
    if (!confirm('Disconnect Strike? You will need to reconnect to view wallet data.')) {
        return;
    }

    try {
        // Clear Strike session
        StrikeAuth.clearSession();

        // Clear Strike settings
        var settings = FleetData.getSettings();
        settings.strike = { proxyUrl: '', enabled: false, lastSync: null };
        FleetData.saveSettings(settings);
        strikeConnected = false;
        acctStrikeConnected = false;  // Clear accounting flag

        // Update global UI
        var btnConnect = document.getElementById('btnConnectStrikeGlobal');
        var badge = document.getElementById('strikeConnectedBadge');
        if (btnConnect) btnConnect.style.display = 'block';
        if (badge) badge.style.display = 'none';

        // Update status
        updateStrikeStatus(null);
        updateSendButton();
        update2FAButton();
        updateAccountButtons();
        hideConnectStrikePrompt();

        // Clear Strike wallet data
        strikeBalances = null;
        strikeTransactions = [];
        strikeOnchainAddress = null;
        try { localStorage.removeItem('protonStrikeOnchainAddr'); } catch(e) {}
        try { localStorage.removeItem('protonMiningStrikeBtcBalance'); } catch(e) {}

        // Clear Strike accounting data
        strikeAcctData = { deposits: [], payouts: [], receives: [] };

        // Refresh both tabs
        renderWallet();
        renderTransactionHistory();
        renderAccounting();

        alert('Strike disconnected successfully');
    } catch (err) {
        console.error('Strike disconnect error:', err);
        alert('Failed to disconnect Strike: ' + err.message);
    }
}
window.disconnectStrike = disconnectStrike;

async function checkQboConnectionStatus() {
    if (!StrikeAuth.isLoggedIn()) return;

    // Awaited from autoLoginWithFirebase() — an unguarded network failure here rejected the
    // whole sign-in chain and left the wallet half-initialised.
    try {
        var proxyUrl = getQboProxyUrl();
        var res = await fetch(proxyUrl + '/auth/qbo/status', {
            headers: { 'Authorization': 'Bearer ' + StrikeAuth.getToken() }
        });

        if (res.ok) {
            var data = await res.json();
            if (data.connected) {
                await onQuickBooksConnected(data.companyName);
            } else {
                qboConnected = false;
                updateQboStatus(null);
            }
        }
    } catch (e) {
        console.warn('[QB] Status check failed:', e.message);
    }
}

async function onQuickBooksConnected(companyName) {
    qboConnected = true;
    updateQboStatus(companyName || 'Connected');
    var result = document.getElementById('qboTestResult');
    if (result) result.innerHTML = '<span style="color:var(--pos);">Connected: ' + companyName + '</span>';
    document.getElementById('qboConnectPanel').classList.remove('open');
    await loadAccountingData();  // Wait for data to load
    renderAccounting();  // Then render immediately
}

function updateQboStatus(companyName) {
    var badge = document.getElementById('qboStatusBadge');
    var notConnected = document.getElementById('qboNotConnected');
    var connected = document.getElementById('qboConnected');
    var companyNameEl = document.getElementById('qboCompanyName');

    // Update global nav bar badges
    var btnConnectGlobal = document.getElementById('btnConnectQbGlobal');
    var badgeConnected = document.getElementById('qbConnectedBadge');
    var badgeName = document.getElementById('qbConnectedName');

    if (companyName) {
        if (badge) {
            badge.textContent = 'QuickBooks: ' + companyName;
            badge.className = 'status-badge status-connected';
        }
        if (notConnected) notConnected.style.display = 'none';
        if (connected) connected.style.display = '';
        if (companyNameEl) companyNameEl.textContent = companyName;

        // Update global nav bar
        if (btnConnectGlobal) btnConnectGlobal.style.display = 'none';
        if (badgeConnected) badgeConnected.style.display = 'flex';
        if (badgeName) badgeName.textContent = companyName;
    } else {
        if (badge) {
            badge.textContent = 'QuickBooks: Not Connected';
            badge.className = 'status-badge status-disconnected';
        }
        if (notConnected) notConnected.style.display = '';
        if (connected) connected.style.display = 'none';

        // Update global nav bar
        if (btnConnectGlobal) btnConnectGlobal.style.display = 'block';
        if (badgeConnected) badgeConnected.style.display = 'none';
    }
}

// Old button removed - now using btnConnectQbGlobal
var oldQboBtn = document.getElementById('btnConnectQbo');
if (oldQboBtn) {
    oldQboBtn.addEventListener('click', function() {
        document.getElementById('qboConnectPanel').classList.toggle('open');
    });
}

var connectBtn = document.getElementById('connectQbo');
if (connectBtn) connectBtn.addEventListener('click', connectQuickBooks);

var disconnectBtn = document.getElementById('disconnectQbo');
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectQuickBooks);

if (typeof StrikeAuth !== 'undefined' && StrikeAuth.isLoggedIn()) {
    checkQboConnectionStatus();
}

// ===== STRIKE CONNECTION =====
function loadStrikeAcctSettings() {
    // Proxy URL is now hardcoded infrastructure - always available
    acctStrikeConnected = true;
    if (StrikeAuth.isLoggedIn()) {
        updateStrikeAcctStatus('Connected & Authenticated');
    } else {
        updateStrikeAcctStatus('Connected (Not Authenticated)');
    }
}

function updateStrikeAcctStatus(label) {
    var badge = document.getElementById('strikeStatusBadgeAcct');
    if (!badge) return;  // Element doesn't exist - accounting tab has no status badge UI
    if (label) {
        badge.textContent = 'Strike: ' + label;
        badge.className = 'status-badge status-connected';
    } else {
        badge.textContent = 'Strike: Not Connected';
        badge.className = 'status-badge status-disconnected';
    }
}

async function fetchStrikeAccountingData() {
    if (!acctStrikeConnected) {
        console.warn('[Accounting] Strike accounting not enabled (proxy URL not configured)');
        return;
    }
    if (!StrikeAuth.isLoggedIn()) {
        console.warn('[Accounting] Strike not authenticated - need to sign in with Google first');
        return;
    }
    try {
        var [deposits, payouts, receives] = await Promise.all([
            StrikeAPI.getDeposits(),
            StrikeAPI.getPayouts(),
            StrikeAPI.getReceives()
        ]);

        // Extract .items from API response (format: { items: [...] } or just [...])
        strikeAcctData.deposits = (deposits && !deposits.error && Array.isArray(deposits.items || deposits))
            ? (deposits.items || deposits) : [];
        strikeAcctData.payouts = (payouts && !payouts.error && Array.isArray(payouts.items || payouts))
            ? (payouts.items || payouts) : [];
        strikeAcctData.receives = (receives && !receives.error && Array.isArray(receives.items || receives))
            ? (receives.items || receives) : [];
    } catch(e) {
        console.error('[Accounting] Strike fetch error:', e);
    }
}

function parseStrikeAmountAcct(amountObj) {
    if (!amountObj) return { btc: 0, usd: 0, currency: 'BTC' };
    if (typeof amountObj === 'object') {
        var val = parseFloat(amountObj.amount) || 0;
        var cur = (amountObj.currency || '').toUpperCase();
        if (cur === 'BTC') return { btc: val, usd: val * (acctBtcPrice || 0), currency: 'BTC' };
        if (cur === 'USD') return { btc: (acctBtcPrice > 0 ? val / acctBtcPrice : 0), usd: val, currency: 'USD' };
        return { btc: 0, usd: val, currency: cur };
    }
    return { btc: 0, usd: 0, currency: 'BTC' };
}

function strikeItemDate(item) {
    var d = item.completed || item.completedAt || item.created || item.createdAt || '';
    if (!d) return '';
    return d.substring(0, 10); // YYYY-MM-DD
}

// Strike panel handlers (old accounting button removed - now using global)
var oldStrikeAcctBtn = document.getElementById('btnConnectStrikeAcct');
if (oldStrikeAcctBtn) {
    oldStrikeAcctBtn.addEventListener('click', function() {
        var settings = FleetData.getSettings();
        if (settings.strike && settings.strike.proxyUrl) {
            var urlInput = document.getElementById('strikeProxyUrlAcct');
            if (urlInput) urlInput.value = settings.strike.proxyUrl;
        }
        var result = document.getElementById('strikeTestResultAcct');
        if (result) result.innerHTML = '';
        var panel = document.getElementById('acctStrikeConnectPanel');
        if (panel) panel.classList.toggle('open');
    });
}

// Old accounting Strike buttons (removed)
var cancelStrikeAcct = document.getElementById('cancelStrikeAcct');
if (cancelStrikeAcct) {
    cancelStrikeAcct.addEventListener('click', function() {
        var panel = document.getElementById('acctStrikeConnectPanel');
        if (panel) panel.classList.remove('open');
    });
}

var testStrikeAcct = document.getElementById('testStrikeAcct');
if (testStrikeAcct) {
    testStrikeAcct.addEventListener('click', async function() {
        var urlInput = document.getElementById('strikeProxyUrlAcct');
        var result = document.getElementById('strikeTestResultAcct');
        if (!urlInput || !result) return;

        var url = urlInput.value.trim();
        if (!url) { result.innerHTML = '<span style="color:var(--neg);">Enter a proxy URL</span>'; return; }
        result.innerHTML = '<span style="color:var(--plat-500);">Testing...</span>';
        var settings = FleetData.getSettings();
        if (!settings.strike) settings.strike = {};
        var oldUrl = settings.strike.proxyUrl;
        settings.strike.proxyUrl = url;
        FleetData.saveSettings(settings);
        var data = await strikeApiFetch('/ping');
        settings.strike.proxyUrl = oldUrl;
        FleetData.saveSettings(settings);
        if (data && !data.error && data.ok) {
            var balances = data.balances || data;
            var balArr = Array.isArray(balances) ? balances : (balances.items || [balances]);
            var info = [];
            for (var i = 0; i < balArr.length; i++) info.push(balArr[i].currency + ': ' + (balArr[i].available || balArr[i].total || balArr[i].amount || '0'));
            result.innerHTML = '<span style="color:var(--pos);">Connected! Balances: ' + info.join(', ') + '</span>';
        } else {
            result.innerHTML = '<span style="color:var(--neg);">Failed: ' + ((data && data.error) || 'Unknown') + '</span>';
        }
    });
}

var saveStrikeAcct = document.getElementById('saveStrikeAcct');
if (saveStrikeAcct) {
    saveStrikeAcct.addEventListener('click', async function() {
        var urlInput = document.getElementById('strikeProxyUrlAcct');
        if (!urlInput) return;

        var url = urlInput.value.trim();
        var settings = FleetData.getSettings();
        if (!url) {
            settings.strike = { proxyUrl: '', enabled: false, lastSync: null };
            FleetData.saveSettings(settings);
            acctStrikeConnected = false;
            strikeAcctData = { deposits: [], payouts: [], receives: [] };
            updateStrikeAcctStatus(null);
            var panel = document.getElementById('acctStrikeConnectPanel');
            if (panel) panel.classList.remove('open');
            renderAccounting();
            return;
        }
        settings.strike = { proxyUrl: url, enabled: true, lastSync: new Date().toISOString() };
        FleetData.saveSettings(settings);
        acctStrikeConnected = true;
        updateStrikeAcctStatus('Connected');
        var panel = document.getElementById('acctStrikeConnectPanel');
        if (panel) panel.classList.remove('open');
        await fetchStrikeAccountingData();
        renderAccounting();
    });
}

// ===== DATA LOADING =====
async function loadAccountingData() {
    if (!qboConnected || !StrikeAuth.isLoggedIn()) return;

    var proxyUrl = getQboProxyUrl();
    var headers = { 'Authorization': 'Bearer ' + StrikeAuth.getToken() };

    try {
        var [accountsRes, expensesRes, invoicesRes] = await Promise.all([
            fetch(proxyUrl + '/accounts', { headers: headers }).then(function(r) { return r.json(); }).catch(function() { return { accounts: [] }; }),
            fetch(proxyUrl + '/expenses?start=' + acctPeriod.start + '&end=' + acctPeriod.end, { headers: headers }).then(function(r) { return r.json(); }).catch(function() { return { expenses: [] }; }),
            fetch(proxyUrl + '/invoices', { headers: headers }).then(function(r) { return r.json(); }).catch(function() { return { invoices: [] }; })
        ]);
        qboData.accounts = accountsRes.accounts || [];
        qboData.expenses = expensesRes.expenses || [];
        qboData.invoices = invoicesRes.invoices || [];
    } catch (e) {
        console.warn('[Accounting] QBO fetch error:', e.message);
    }
}

// ===== UNIFIED P&L CALCULATION =====
function buildUnifiedPnL() {
    var payoutData = PayoutData.getData();
    var elecData = ElectricityData.getData();
    var fleet = FleetData.getFleet();
    var mult = getCurrencyMultiplier();

    var totalRevenueBtc = 0;
    var totalRevenueUsd = 0;
    var totalExpenses = 0;
    var totalCapex = 0;
    var revenueEntries = [];

    // BTC Revenue: payouts
    for (var i = 0; i < payoutData.payouts.length; i++) {
        var p = payoutData.payouts[i];
        if (p.date >= acctPeriod.start && p.date <= acctPeriod.end) {
            var usd = p.usdValue || (p.btcAmount * p.btcPrice);
            totalRevenueBtc += p.btcAmount;
            totalRevenueUsd += usd;
            revenueEntries.push({
                date: p.date,
                source: p.notes || 'Payout',
                btcAmount: p.btcAmount,
                btcPrice: p.btcPrice,
                usdValue: usd,
                category: 'Payout'
            });
        }
    }

    // BTC Revenue: snapshots
    for (var s = 0; s < payoutData.snapshots.length; s++) {
        var snap = payoutData.snapshots[s];
        if (snap.date >= acctPeriod.start && snap.date <= acctPeriod.end) {
            var snapUsd = snap.btcEarned * snap.btcPrice;
            totalRevenueBtc += snap.btcEarned;
            totalRevenueUsd += snapUsd;
            revenueEntries.push({
                date: snap.date,
                source: 'Daily Snapshot',
                btcAmount: snap.btcEarned,
                btcPrice: snap.btcPrice,
                usdValue: snapUsd,
                category: 'Mining'
            });
        }
    }

    revenueEntries.sort(function(a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });

    // Expenses: QBO expenses or local electricity bills
    var expenseEntries = [];
    if (qboConnected && qboData.expenses.length > 0) {
        for (var e = 0; e < qboData.expenses.length; e++) {
            var exp = qboData.expenses[e];
            totalExpenses += exp.amount;
            expenseEntries.push({
                date: exp.date,
                vendor: exp.vendor,
                category: exp.category,
                amount: exp.amount,
                account: exp.accountName
            });
        }
    } else {
        // Fallback to local electricity data
        for (var b = 0; b < elecData.length; b++) {
            var bill = elecData[b];
            if (bill.date >= acctPeriod.start && bill.date <= acctPeriod.end) {
                totalExpenses += bill.costUSD;
                expenseEntries.push({
                    date: bill.date,
                    vendor: 'Electric Utility',
                    category: 'Electricity (' + bill.kwhUsed + ' kWh)',
                    amount: bill.costUSD,
                    account: 'Local Data'
                });
            }
        }
    }

    // Strike payouts as expenses
    if (acctStrikeConnected) {
        for (var sp = 0; sp < strikeAcctData.payouts.length; sp++) {
            var sPay = strikeAcctData.payouts[sp];
            var spDate = strikeItemDate(sPay);
            if (spDate >= acctPeriod.start && spDate <= acctPeriod.end) {
                var spAmt = parseStrikeAmountAcct(sPay.amount || sPay.amountPaid);
                totalExpenses += spAmt.usd;
                expenseEntries.push({
                    date: spDate,
                    vendor: 'Strike Payout',
                    category: 'Strike Transfer',
                    amount: spAmt.usd,
                    account: 'Strike'
                });
            }
        }
    }

    // Equipment CAPEX
    var capexCount = 0;
    for (var mi = 0; mi < fleet.miners.length; mi++) {
        var m = fleet.miners[mi];
        var pDate = m.purchaseDate || m.dateAdded.split('T')[0];
        if (pDate >= acctPeriod.start && pDate <= acctPeriod.end) {
            var minerCost = m.cost * m.quantity;
            totalCapex += minerCost;
            capexCount += m.quantity;
        }
    }

    // Unpaid balance from pool earnings
    var unpaidBtc = 0;
    if (window.poolEarnings) {
        for (var poolId in window.poolEarnings) {
            var pe = window.poolEarnings[poolId];
            if (pe && pe.balance) unpaidBtc += pe.balance;
        }
    }

    return {
        revenueBtc: totalRevenueBtc,
        revenueUsd: totalRevenueUsd * mult,
        expenses: totalExpenses * mult,
        capex: totalCapex * mult,
        net: (totalRevenueUsd - totalExpenses - totalCapex) * mult,
        unpaidBtc: unpaidBtc,
        unpaidUsd: unpaidBtc * (acctBtcPrice || 0) * mult,
        revenueEntries: revenueEntries,
        expenseEntries: expenseEntries,
        capexCount: capexCount,
        expenseSource: (function() {
            var sources = [];
            if (qboConnected && qboData.expenses.length > 0) sources.push('QuickBooks');
            if (acctStrikeConnected && strikeAcctData.payouts.length > 0) sources.push('Strike');
            return sources.length > 0 ? 'from ' + sources.join(' + ') : 'from local data';
        })()
    };
}

// ===== RENDERING =====
function renderAccounting() {
    var pnl = buildUnifiedPnL();
    renderPnLSummary(pnl);
    updatePnLChart(pnl);
    updateExpenseDoughnut(pnl);
    renderBankAccounts();
    renderRevenueTable(pnl.revenueEntries);
    renderExpenseTable(pnl.expenseEntries);
    renderInvoiceTable();
    renderAssetsOverview();
}

function renderAssetsOverview() {
    var html = '';
    var totalUSD = 0;
    var totalBTC = 0;

    // 1. Cold Wallets
    var walletData = WalletData.getData();
    var coldWalletBTC = 0;
    for (var i = 0; i < walletData.addresses.length; i++) {
        coldWalletBTC += walletData.addresses[i].lastBalance;
    }
    var coldWalletUSD = coldWalletBTC * liveBtcPrice;
    totalBTC += coldWalletBTC;
    totalUSD += coldWalletUSD;

    html += '<div class="metric-card">';
    html += '<div class="label">Cold Wallets</div>';
    html += '<div class="value btc-orange">' + fmtBTC(coldWalletBTC, 8) + '</div>';
    html += '<div class="sub">' + fmtUSD(coldWalletUSD) + '</div>';
    html += '</div>';

    // 2. Strike BTC
    var strikeBTC = 0;
    var strikeUSD = 0;
    if (acctStrikeConnected && StrikeAuth.isLoggedIn()) {
        strikeBTC = getStrikeBtcBalance();
        var strikeBTCUsd = strikeBTC * liveBtcPrice;
        totalBTC += strikeBTC;
        totalUSD += strikeBTCUsd;

        html += '<div class="metric-card">';
        html += '<div class="label">Strike (BTC)</div>';
        html += '<div class="value btc-orange">' + fmtBTC(strikeBTC, 8) + '</div>';
        html += '<div class="sub">' + fmtUSD(strikeBTCUsd) + '</div>';
        html += '</div>';

        // 3. Strike USD
        strikeUSD = getStrikeUsdBalance();
        totalUSD += strikeUSD;

        html += '<div class="metric-card">';
        html += '<div class="label">Strike (USD)</div>';
        html += '<div class="value positive">' + fmtUSD(strikeUSD) + '</div>';
        html += '<div class="sub">Fiat balance</div>';
        html += '</div>';
    }

    // 4. Pool Unpaid
    var pnl = buildUnifiedPnL();
    var unpaidBTC = pnl.unpaidBtc || 0;
    var unpaidUSD = unpaidBTC * liveBtcPrice;
    totalBTC += unpaidBTC;
    totalUSD += unpaidUSD;

    html += '<div class="metric-card">';
    html += '<div class="label">Pool Unpaid</div>';
    html += '<div class="value btc-orange">' + fmtBTC(unpaidBTC, 8) + '</div>';
    html += '<div class="sub">' + fmtUSD(unpaidUSD) + '</div>';
    html += '</div>';

    // 5. QBO Bank Accounts (if connected)
    var qboTotal = 0;
    if (qboConnected && qboData.accounts && qboData.accounts.length > 0) {
        for (var i = 0; i < qboData.accounts.length; i++) {
            var acct = qboData.accounts[i];
            var balance = acct.balance || 0;
            qboTotal += balance;
            html += '<div class="metric-card">';
            html += '<div class="label">' + escapeHtml(acct.name || 'Bank Account') + '</div>';
            html += '<div class="value neutral">' + fmtUSD(balance) + '</div>';
            html += '<div class="sub">QuickBooks</div>';
            html += '</div>';
        }
    }
    totalUSD += qboTotal;

    // Update total display
    var displayMode = localStorage.getItem('assetsDisplayMode') || 'USD';
    var totalDisplay = document.getElementById('assetsTotalDisplay');
    var toggleBtn = document.getElementById('assetsToggleBtn');

    if (displayMode === 'BTC') {
        totalDisplay.textContent = fmtBTC(totalBTC, 8);
        totalDisplay.className = 'value btc-orange';
        toggleBtn.textContent = 'BTC';
    } else {
        totalDisplay.textContent = fmtUSD(totalUSD);
        totalDisplay.className = 'value positive';
        toggleBtn.textContent = 'USD';
    }

    document.getElementById('assetsGrid').innerHTML = html;
    // Reveal the section, but never override a user who hid it via the widget settings gear —
    // this used to force it back on every render.
    var assetsWidget = document.querySelector('[data-widget="assets-overview"]');
    if (assetsWidget && !isWidgetHidden('assets-overview')) assetsWidget.style.display = '';
}

// Widget visibility is owned by widget-settings.js (localStorage: protonMiningWidgets_banking)
function isWidgetHidden(key) {
    try {
        var cfg = JSON.parse(localStorage.getItem('protonMiningWidgets_banking') || '{}');
        return !!(cfg.hidden && cfg.hidden.indexOf(key) >= 0);
    } catch (e) { return false; }
}

function toggleAssetsDisplay() {
    var currentMode = localStorage.getItem('assetsDisplayMode') || 'USD';
    var newMode = currentMode === 'USD' ? 'BTC' : 'USD';
    localStorage.setItem('assetsDisplayMode', newMode);
    renderAssetsOverview();
}

function renderPnLSummary(pnl) {
    document.getElementById('pnlRevenue').textContent = fmtUSD(pnl.revenueUsd);
    document.getElementById('pnlRevenueBtc').textContent = fmtBTC(pnl.revenueBtc, 6) + ' BTC';
    document.getElementById('pnlExpenses').textContent = '-' + fmtUSD(pnl.expenses);
    document.getElementById('pnlExpensesSrc').textContent = pnl.expenseSource;
    document.getElementById('pnlCapex').textContent = '-' + fmtUSD(pnl.capex);
    document.getElementById('pnlCapexCount').textContent = pnl.capexCount + ' units purchased';

    var netEl = document.getElementById('pnlNet');
    netEl.textContent = fmtUSD(pnl.net);
    netEl.className = 'value ' + (pnl.net >= 0 ? 'positive' : 'negative');

    document.getElementById('pnlUnpaid').textContent = fmtBTC(pnl.unpaidBtc, 6) + ' BTC';
}

function renderBankAccounts() {
    var section = document.getElementById('bankAccountsSection');
    var grid = document.getElementById('bankAccountsGrid');
    if (!qboConnected || qboData.accounts.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';
    var html = '';
    for (var i = 0; i < qboData.accounts.length; i++) {
        var a = qboData.accounts[i];
        var colorClass = a.type === 'Credit Card' ? 'negative' : 'positive';
        html += '<div class="metric-card">' +
            '<div class="label">' + escapeHtml(a.name) + '</div>' +
            '<div class="value ' + colorClass + '">' + fmtUSD(a.balance) + '</div>' +
            '<div class="sub">' + escapeHtml(a.type + (a.subType ? ' — ' + a.subType : '')) + '</div>' +
        '</div>';
    }
    grid.innerHTML = html;
}

function renderRevenueTable(entries) {
    var tbody = document.getElementById('revenueTableBody');
    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--plat-600);">No revenue in this period</td></tr>';
        return;
    }
    var mult = getCurrencyMultiplier();
    var html = '';
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];

        // Determine source badge color
        var sourceLower = e.source.toLowerCase();
        var sourceBadgeStyle = '';
        if (sourceLower.indexOf('strike') !== -1) {
            sourceBadgeStyle = 'background:var(--panel-hover); border:1px solid var(--line-mid); color:var(--plat-300);';
        } else {
            sourceBadgeStyle = 'background:var(--btc-wash); border:1px solid var(--line-btc); color:var(--btc-300);';
        }

        // Determine category badge color
        var categoryLower = e.category.toLowerCase();
        var categoryBadgeStyle = '';
        if (categoryLower.indexOf('mining') !== -1 || categoryLower.indexOf('payout') !== -1) {
            categoryBadgeStyle = 'background:var(--pos-wash); border:1px solid var(--pos-line); color:var(--pos);';
        } else if (categoryLower.indexOf('payment') !== -1 || categoryLower.indexOf('receive') !== -1) {
            categoryBadgeStyle = 'background:var(--panel-hover); border:1px solid var(--line-mid); color:var(--plat-400);';
        } else {
            categoryBadgeStyle = 'background:var(--panel-hover); border:1px solid var(--line-mid); color:var(--plat-400);';
        }

        html += '<tr>' +
            '<td>' + e.date + '</td>' +
            '<td><span style="font-size:11px; padding:3px 8px; border-radius:var(--radius); display:inline-block; ' + sourceBadgeStyle + '">' + escapeHtml(e.source) + '</span></td>' +
            '<td class="btc-orange">' + fmtBTC(e.btcAmount, 8) + '</td>' +
            '<td>' + fmtUSD(e.btcPrice * mult) + '</td>' +
            '<td class="positive">' + fmtUSD(e.usdValue * mult) + '</td>' +
            '<td><span style="font-size:11px; padding:3px 8px; border-radius:var(--radius); display:inline-block; ' + categoryBadgeStyle + '">' + escapeHtml(e.category) + '</span></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
}

function renderExpenseTable(entries) {
    var tbody = document.getElementById('expenseTableBody');
    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--plat-600);">No expenses in this period</td></tr>';
        return;
    }
    // Entries are stored in USD; the P&L summary above converts, so this table must too
    var mult = getCurrencyMultiplier();
    var html = '';
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        html += '<tr>' +
            '<td>' + escapeHtml(e.date) + '</td>' +
            '<td>' + escapeHtml(e.vendor) + '</td>' +
            '<td>' + escapeHtml(e.category) + '</td>' +
            '<td class="negative">-' + fmtUSD(e.amount * mult) + '</td>' +
            '<td>' + escapeHtml(e.account) + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
}

function renderInvoiceTable() {
    var section = document.getElementById('invoicesSection');
    var tbody = document.getElementById('invoiceTableBody');
    if (!qboConnected || qboData.invoices.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';
    var html = '';
    for (var i = 0; i < qboData.invoices.length; i++) {
        var inv = qboData.invoices[i];
        var statusClass = 'status-' + inv.status;
        var statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
        html += '<tr>' +
            '<td>' + inv.date + '</td>' +
            '<td>' + escapeHtml(inv.customer) + '</td>' +
            '<td>' + fmtUSD(inv.amount) + '</td>' +
            '<td>' + (inv.dueDate || '--') + '</td>' +
            '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
}

// ===== P&L BAR CHART =====
function updatePnLChart(pnl) {
    var emptyMsg = document.getElementById('pnlChartEmpty');
    var allEntries = pnl.revenueEntries.concat(pnl.expenseEntries);
    if (allEntries.length === 0) {
        emptyMsg.style.display = 'flex';
        if (pnlChart) { pnlChart.destroy(); pnlChart = null; }
        return;
    }
    emptyMsg.style.display = 'none';

    // Group by month
    var months = {};
    for (var i = 0; i < pnl.revenueEntries.length; i++) {
        var key = pnl.revenueEntries[i].date.substring(0, 7);
        if (!months[key]) months[key] = { revenue: 0, expenses: 0 };
        months[key].revenue += pnl.revenueEntries[i].usdValue;
    }
    for (var j = 0; j < pnl.expenseEntries.length; j++) {
        var eKey = pnl.expenseEntries[j].date.substring(0, 7);
        if (!months[eKey]) months[eKey] = { revenue: 0, expenses: 0 };
        months[eKey].expenses += pnl.expenseEntries[j].amount;
    }
    // Add CAPEX to expense month if present
    var fleet = FleetData.getFleet();
    for (var mi = 0; mi < fleet.miners.length; mi++) {
        var m = fleet.miners[mi];
        var pDate = m.purchaseDate || m.dateAdded.split('T')[0];
        if (pDate >= acctPeriod.start && pDate <= acctPeriod.end) {
            var cKey = pDate.substring(0, 7);
            if (!months[cKey]) months[cKey] = { revenue: 0, expenses: 0 };
            months[cKey].expenses += m.cost * m.quantity;
        }
    }

    var sortedKeys = Object.keys(months).sort();
    var labels = sortedKeys.map(function(k) {
        var parts = k.split('-');
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return monthNames[parseInt(parts[1], 10) - 1] + ' ' + parts[0].slice(2);
    });
    var revData = sortedKeys.map(function(k) { return +months[k].revenue.toFixed(2); });
    var expData = sortedKeys.map(function(k) { return +months[k].expenses.toFixed(2); });
    var netData = sortedKeys.map(function(k) { return +(months[k].revenue - months[k].expenses).toFixed(2); });

    if (pnlChart) pnlChart.destroy();
    var ctx = document.getElementById('pnlBarChart').getContext('2d');
    pnlChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revData,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.pos, 0.6),
                    borderColor: ProtonTheme.pos,
                    borderRadius: 4,
                    order: 2
                },
                {
                    label: 'Expenses',
                    data: expData,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.neg, 0.6),
                    borderColor: ProtonTheme.neg,
                    borderRadius: 4,
                    order: 2
                },
                {
                    label: 'Net Income',
                    type: 'line',
                    data: netData,
                    borderColor: ProtonTheme.btc,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.btc, 0.1),
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: ProtonTheme.btc,
                    fill: true,
                    tension: 0.3,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) { return ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString(); }
                    }
                },
                legend: { labels: { color: ProtonTheme.plat300, font: { size: 12 } } }
            },
            scales: {
                x: { ticks: {}, grid: {} },
                y: {
                    ticks: { callback: function(v) { return '$' + v.toLocaleString(); } },
                    grid: {}
                }
            }
        }
    });
}

// ===== EXPENSE DOUGHNUT CHART =====
function updateExpenseDoughnut(pnl) {
    var emptyMsg = document.getElementById('expenseChartEmpty');
    var hasExpenses = pnl.expenseEntries.length > 0 || pnl.capex > 0;
    if (!hasExpenses) {
        emptyMsg.style.display = 'flex';
        if (expenseDoughnutChart) { expenseDoughnutChart.destroy(); expenseDoughnutChart = null; }
        return;
    }
    emptyMsg.style.display = 'none';

    // Group by category
    var cats = {};
    for (var i = 0; i < pnl.expenseEntries.length; i++) {
        var cat = pnl.expenseEntries[i].category || 'Other';
        // Normalize electricity categories
        if (cat.indexOf('Electricity') === 0) cat = 'Electricity';
        if (!cats[cat]) cats[cat] = 0;
        cats[cat] += pnl.expenseEntries[i].amount;
    }
    // Add equipment CAPEX as its own slice
    if (pnl.capex > 0) {
        var mult = getCurrencyMultiplier();
        cats['Equipment'] = (cats['Equipment'] || 0) + (pnl.capex / mult); // pnl.capex already multiplied
    }

    var catLabels = Object.keys(cats);
    var catValues = catLabels.map(function(k) { return +cats[k].toFixed(2); });
    var totalExp = catValues.reduce(function(a, b) { return a + b; }, 0);

    // Expense categories are categorical, not semantic -- an expense is not "bad" the way a
    // negative P&L is -- so this uses the luminance ramp rather than the red/green/amber that
    // carry meaning elsewhere in the app.
    var palette = ProtonTheme.series;
    var colors = catLabels.map(function(_, i) { return palette[i % palette.length]; });

    if (expenseDoughnutChart) expenseDoughnutChart.destroy();
    var ctx = document.getElementById('expenseDoughnut').getContext('2d');
    expenseDoughnutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catValues,
                backgroundColor: colors,
                borderColor: ProtonTheme.alpha(ProtonTheme.black, 0.3),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                tooltip: {
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            var pct = ((ctx.parsed / totalExp) * 100).toFixed(1);
                            return ctx.label + ': $' + ctx.parsed.toLocaleString() + ' (' + pct + '%)';
                        }
                    }
                },
                legend: { position: 'bottom', labels: { color: ProtonTheme.plat300, font: { size: 12 }, padding: 12 } }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: function(chart) {
                var ctx2 = chart.ctx;
                var w = chart.width;
                var h = chart.height;
                ctx2.save();
                ctx2.font = 'bold 16px sans-serif';
                ctx2.fillStyle = ProtonTheme.text;
                ctx2.textAlign = 'center';
                ctx2.textBaseline = 'middle';
                ctx2.fillText('$' + totalExp.toLocaleString(undefined, { maximumFractionDigits: 0 }), w / 2, h / 2 - 8);
                ctx2.font = '11px sans-serif';
                ctx2.fillStyle = ProtonTheme.plat500;
                ctx2.fillText('Total Expenses', w / 2, h / 2 + 12);
                ctx2.restore();
            }
        }]
    });
}

// ===== TAX EXPORT (moved from payouts.js) =====
document.getElementById('btnTaxExport').addEventListener('click', function() {
    var today = new Date().toISOString().split('T')[0];
    var yearStart = new Date().getFullYear() + '-01-01';
    document.getElementById('taxStartDate').value = yearStart;
    document.getElementById('taxEndDate').value = today;
    document.getElementById('taxYearPreset').value = '';
    document.getElementById('taxExportPanel').classList.toggle('open');
});

document.getElementById('cancelTaxExport').addEventListener('click', function() {
    document.getElementById('taxExportPanel').classList.remove('open');
});

document.getElementById('taxYearPreset').addEventListener('change', function() {
    var year = this.value;
    if (!year) return;
    document.getElementById('taxStartDate').value = year + '-01-01';
    document.getElementById('taxEndDate').value = year + '-12-31';
});

document.getElementById('downloadTaxCSV').addEventListener('click', function() {
    var startDate = document.getElementById('taxStartDate').value;
    var endDate = document.getElementById('taxEndDate').value;
    var reportType = document.getElementById('taxReportType').value;
    if (reportType === 'full') {
        exportFullReport(startDate, endDate);
    } else if (reportType === 'tax') {
        exportTaxReport(startDate, endDate);
    } else {
        exportCSV(startDate, endDate);
    }
    document.getElementById('taxExportPanel').classList.remove('open');
});

// ===== CSV EXPORT =====
function exportCSV(startDate, endDate) {
    var data = PayoutData.getData();
    var rows = [['Date', 'Type', 'BTC Amount', 'BTC Price (USD)', 'USD Value', 'TX Hash', 'Notes']];

    for (var i = 0; i < data.snapshots.length; i++) {
        var s = data.snapshots[i];
        if (s.date >= startDate && s.date <= endDate) {
            rows.push([s.date, 'earning', s.btcEarned.toFixed(8), s.btcPrice.toFixed(2), (s.btcEarned * s.btcPrice).toFixed(2), '', 'Daily snapshot']);
        }
    }

    for (var p = 0; p < data.payouts.length; p++) {
        var pay = data.payouts[p];
        if (pay.date >= startDate && pay.date <= endDate) {
            rows.push([pay.date, 'payout', pay.btcAmount.toFixed(8), pay.btcPrice.toFixed(2), pay.usdValue.toFixed(2), pay.txHash || '', pay.notes || '']);
        }
    }

    var header = rows[0];
    var body = rows.slice(1).sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    rows = [header].concat(body);
    downloadCSVFile(rows, 'proton-mining-payouts-' + startDate + '-to-' + endDate + '.csv');
}

// ===== TAX REPORT EXPORT =====
function exportTaxReport(startDate, endDate) {
    var payoutData = PayoutData.getData();
    var elecData = ElectricityData.getData();
    var fleet = FleetData.getFleet();
    var rows = [['Date', 'Description', 'BTC Amount', 'BTC Price (USD)', 'USD Value', 'Cost Basis', 'Gain/Loss', 'Category']];

    var totalIncome = 0;
    var totalExpenses = 0;
    var totalCapex = 0;

    // Mining Income
    var payouts = [];
    for (var i = 0; i < payoutData.payouts.length; i++) {
        var p = payoutData.payouts[i];
        if (p.date >= startDate && p.date <= endDate) payouts.push(p);
    }
    for (var s = 0; s < payoutData.snapshots.length; s++) {
        var snap = payoutData.snapshots[s];
        if (snap.date >= startDate && snap.date <= endDate) {
            payouts.push({ date: snap.date, btcAmount: snap.btcEarned, btcPrice: snap.btcPrice, usdValue: snap.btcEarned * snap.btcPrice, notes: 'Daily mining snapshot' });
        }
    }
    payouts.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    for (var pi = 0; pi < payouts.length; pi++) {
        var pay = payouts[pi];
        var usd = pay.usdValue || (pay.btcAmount * pay.btcPrice);
        totalIncome += usd;
        rows.push([pay.date, 'Mining income' + (pay.notes ? ' - ' + pay.notes : ''), pay.btcAmount.toFixed(8), pay.btcPrice.toFixed(2), usd.toFixed(2), usd.toFixed(2), '0.00', 'Mining Income']);
    }

    // Electricity Expenses
    for (var e = 0; e < elecData.length; e++) {
        var bill = elecData[e];
        if (bill.date >= startDate && bill.date <= endDate) {
            totalExpenses += bill.costUSD;
            rows.push([bill.date, 'Electricity' + (bill.notes ? ' - ' + bill.notes : '') + ' (' + bill.kwhUsed + ' kWh)', '', '', '-' + bill.costUSD.toFixed(2), '', '', 'Electricity Expense']);
        }
    }

    // Equipment CAPEX
    for (var mi = 0; mi < fleet.miners.length; mi++) {
        var m = fleet.miners[mi];
        var pDate = m.purchaseDate || m.dateAdded.split('T')[0];
        if (pDate >= startDate && pDate <= endDate) {
            var minerCost = m.cost * m.quantity;
            totalCapex += minerCost;
            rows.push([pDate, 'Equipment: ' + m.model + ' x' + m.quantity, '', '', '-' + minerCost.toFixed(2), minerCost.toFixed(2), '', 'Equipment Purchase']);
        }
    }

    // Summary
    var netTaxable = totalIncome - totalExpenses - totalCapex;
    rows.push([]);
    rows.push(['', 'SUMMARY', '', '', '', '', '', '']);
    rows.push(['', 'Total Mining Income', '', '', totalIncome.toFixed(2), '', '', '']);
    rows.push(['', 'Total Electricity Expenses', '', '', '-' + totalExpenses.toFixed(2), '', '', '']);
    rows.push(['', 'Total Equipment Purchases', '', '', '-' + totalCapex.toFixed(2), '', '', '']);
    rows.push(['', 'Net Taxable Income', '', '', netTaxable.toFixed(2), '', '', '']);

    downloadCSVFile(rows, 'proton-mining-tax-report-' + startDate + '-to-' + endDate + '.csv');
}

// ===== FULL REPORT (with QBO expenses) =====
function exportFullReport(startDate, endDate) {
    var payoutData = PayoutData.getData();
    var elecData = ElectricityData.getData();
    var fleet = FleetData.getFleet();
    var rows = [['Date', 'Description', 'BTC Amount', 'BTC Price (USD)', 'USD Value', 'Cost Basis', 'Gain/Loss', 'Category']];

    var totalIncome = 0;
    var totalElecExpenses = 0;
    var totalQboExpenses = 0;
    var totalCapex = 0;

    // Mining Income
    var payouts = [];
    for (var i = 0; i < payoutData.payouts.length; i++) {
        var p = payoutData.payouts[i];
        if (p.date >= startDate && p.date <= endDate) payouts.push(p);
    }
    for (var s = 0; s < payoutData.snapshots.length; s++) {
        var snap = payoutData.snapshots[s];
        if (snap.date >= startDate && snap.date <= endDate) {
            payouts.push({ date: snap.date, btcAmount: snap.btcEarned, btcPrice: snap.btcPrice, usdValue: snap.btcEarned * snap.btcPrice, notes: 'Daily mining snapshot' });
        }
    }
    payouts.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    for (var pi = 0; pi < payouts.length; pi++) {
        var pay = payouts[pi];
        var usd = pay.usdValue || (pay.btcAmount * pay.btcPrice);
        totalIncome += usd;
        rows.push([pay.date, 'Mining income' + (pay.notes ? ' - ' + pay.notes : ''), pay.btcAmount.toFixed(8), pay.btcPrice.toFixed(2), usd.toFixed(2), usd.toFixed(2), '0.00', 'Mining Income']);
    }

    // Local Electricity Expenses
    for (var e = 0; e < elecData.length; e++) {
        var bill = elecData[e];
        if (bill.date >= startDate && bill.date <= endDate) {
            totalElecExpenses += bill.costUSD;
            rows.push([bill.date, 'Electricity' + (bill.notes ? ' - ' + bill.notes : '') + ' (' + bill.kwhUsed + ' kWh)', '', '', '-' + bill.costUSD.toFixed(2), '', '', 'Electricity Expense']);
        }
    }

    // QBO Expenses
    if (qboConnected && qboData.expenses.length > 0) {
        for (var q = 0; q < qboData.expenses.length; q++) {
            var qExp = qboData.expenses[q];
            if (qExp.date >= startDate && qExp.date <= endDate) {
                totalQboExpenses += qExp.amount;
                rows.push([qExp.date, (qExp.vendor || 'Expense') + ' - ' + (qExp.category || ''), '', '', '-' + qExp.amount.toFixed(2), '', '', 'QBO Expense']);
            }
        }
    }

    // Equipment CAPEX
    for (var mi = 0; mi < fleet.miners.length; mi++) {
        var m = fleet.miners[mi];
        var pDate = m.purchaseDate || m.dateAdded.split('T')[0];
        if (pDate >= startDate && pDate <= endDate) {
            var minerCost = m.cost * m.quantity;
            totalCapex += minerCost;
            rows.push([pDate, 'Equipment: ' + m.model + ' x' + m.quantity, '', '', '-' + minerCost.toFixed(2), minerCost.toFixed(2), '', 'Equipment Purchase']);
        }
    }

    // Summary
    var totalAllExpenses = totalElecExpenses + totalQboExpenses;
    var netTaxable = totalIncome - totalAllExpenses - totalCapex;
    rows.push([]);
    rows.push(['', 'SUMMARY', '', '', '', '', '', '']);
    rows.push(['', 'Total Mining Income', '', '', totalIncome.toFixed(2), '', '', '']);
    rows.push(['', 'Total Electricity Expenses', '', '', '-' + totalElecExpenses.toFixed(2), '', '', '']);
    rows.push(['', 'Total QuickBooks Expenses', '', '', '-' + totalQboExpenses.toFixed(2), '', '', '']);
    rows.push(['', 'Total Equipment Purchases', '', '', '-' + totalCapex.toFixed(2), '', '', '']);
    rows.push(['', 'Net Taxable Income', '', '', netTaxable.toFixed(2), '', '', '']);

    downloadCSVFile(rows, 'proton-mining-full-report-' + startDate + '-to-' + endDate + '.csv');
}

// ===== CSV DOWNLOAD HELPER =====
function downloadCSVFile(rows, filename) {
    var csv = '';
    for (var r = 0; r < rows.length; r++) {
        var line = '';
        var row = rows[r];
        var cols = row.length || 8;
        for (var c = 0; c < cols; c++) {
            if (c > 0) line += ',';
            line += '"' + String(row[c] !== undefined ? row[c] : '').replace(/"/g, '""') + '"';
        }
        csv += line + '\n';
    }

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// Accounting auto-refresh (5 minutes)
setInterval(async function() {
    if (bankingActiveTab !== 'accounting') return;
    if (qboConnected) await loadAccountingData();
    if (acctStrikeConnected) await fetchStrikeAccountingData();
    if (qboConnected || acctStrikeConnected) renderAccounting();
}, 300000);

// ===== SECTION 6: UNIFIED INIT =====
initNav('banking');

(async function() {
    var data = await fetchLiveMarketData();
    // NO FALLBACK PRICE. This read `data.price || 96000`, so a failed fetch invented a
    // price — and in the payout path that invented number was persisted into the cost-basis
    // record. A hardcoded constant is stale the day it is written and wrong forever after.
    // null means unknown; every consumer must handle it rather than be handed a plausible lie.
    liveBtcPrice = (data && isFinite(data.price)) ? data.price : null;
    acctBtcPrice = liveBtcPrice;

    // ---- One-off payout repair --------------------------------------------------------
    // Rows written before this fix carry the spot price at SYNC time rather than the price on
    // the day they were paid. Runs once, after price history has been fetched, and reports what
    // it did rather than repairing silently — this edits your cost-basis record, so the count of
    // rows it could NOT price matters as much as the count it fixed.
    var REPRICE_FLAG = 'protonMiningPayoutRepriceV1';
    try {
        if (!localStorage.getItem(REPRICE_FLAG) && typeof PriceHistory !== 'undefined') {
            await PriceHistory.fetchPriceHistory();
            var rep = PayoutData.repriceFromHistory();
            localStorage.setItem(REPRICE_FLAG, new Date().toISOString());
            if (rep.repriced || rep.unpriced) {
                console.info('[Payouts] re-priced ' + rep.repriced + ' from their own dates, ' +
                             rep.unpriced + ' left unpriced (no history), ' + rep.skipped + ' skipped');
                var banner = document.createElement('div');
                banner.className = 'sync-toast';
                banner.textContent = rep.repriced + ' payout' + (rep.repriced === 1 ? '' : 's') +
                    ' re-priced from the date paid' +
                    (rep.unpriced ? ', ' + rep.unpriced + ' could not be priced and are marked unpriced' : '') + '.';
                document.body.appendChild(banner);
                setTimeout(function() { banner.classList.add('show'); }, 10);
                setTimeout(function() { banner.classList.remove('show');
                    setTimeout(function() { banner.remove(); }, 300); }, 12000);
            }
        }
    } catch (e) {
        // A failed repair must not stop the page loading. It stays un-flagged so the next visit
        // retries rather than skipping the correction permanently.
        console.warn('[Payouts] re-pricing did not run:', e && e.message);
    }

    window.onCurrencyChange = function() {
        liveBtcPrice = window.liveBtcPrice || liveBtcPrice;
        acctBtcPrice = liveBtcPrice;
        renderWallet();
        renderPayoutPage();
        if (bankingActiveTab === 'accounting') renderAccounting();
    };

    // Wallet init
    loadStrikeSettings();
    if (typeof ProtonAuth !== 'undefined') {
        ProtonAuth.onAuthChange(function(fbUser) {
            _walletAuthResolved = true;
            if (fbUser) {
                autoLoginWithFirebase();
            } else {
                if (StrikeAuth.isLoggedIn()) {
                    clearAllWalletState();
                } else {
                    showSignInPrompt();
                }
            }
        });
    }
    await loadAndRefreshWallet();
    startAutoRefresh();

    // Wire up global connection buttons in nav bar
    var btnConnectQbGlobal = document.getElementById('btnConnectQbGlobal');
    if (btnConnectQbGlobal) {
        btnConnectQbGlobal.addEventListener('click', function() {
            document.getElementById('qboConnectPanel').classList.add('open');
        });
    }

    // btnConnectStrikeGlobal handler now in shared.js (global)

    var btnDisconnectQbGlobal = document.getElementById('btnDisconnectQbGlobal');
    if (btnDisconnectQbGlobal) {
        btnDisconnectQbGlobal.addEventListener('click', disconnectQuickBooks);
    }

    var btnDisconnectStrikeGlobal = document.getElementById('btnDisconnectStrikeGlobal');
    if (btnDisconnectStrikeGlobal) {
        btnDisconnectStrikeGlobal.addEventListener('click', disconnectStrike);
    }

    // Re-init widget drag handles for Wallet tab after DOM is ready
    if (typeof window.initBankingTabWidgets === 'function') {
        setTimeout(function() {
            window.initBankingTabWidgets();
        }, 150);
    }

    // Income (payouts) init
    checkAndLogDailySnapshot();
    await syncAllPoolPayouts();
    renderPayoutPage();
    // Charts are lazy-inited on first tab switch — but when the page is opened directly on
    // #income they were built by the early hash handler, before liveBtcPrice was known and
    // before the pool sync above pulled new payouts. Push the fresh data in now.
    // Both are no-ops if the charts have not been created yet.
    updatePayoutChart();
    updateRevCostChart();

    // Accounting init
    setPeriod('month');
    // checkQboConnectionStatus() moved to after Strike auth completes
    loadStrikeAcctSettings();
    await loadAccountingData();
    await fetchStrikeAccountingData();
    // renderAccounting() is lazy-inited on first tab switch

    // Re-check hash after data is loaded
    var hash = location.hash.replace('#', '');
    if (hash === 'income' || hash === 'accounting') {
        switchBankingTab(hash);
    }
})();
