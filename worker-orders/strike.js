// Strike, as much of it as taking a payment for an order needs.
//
// A separate file because it is the ONE part of this Worker whose correctness
// cannot be settled by a test: everything else here is arithmetic and state
// machines that run in the suite, but these functions talk to somebody else's
// API and the response shapes are theirs to change. Keeping them behind a small
// seam means the order logic is testable against a stub, and this file is the
// only thing that needs a live key pointed at it before it can take money.
//
// WHY NOT CALL THE EXISTING proton-strike-proxy. That Worker is built for the
// owner's dashboard: per-user Strike keys, Firebase sessions, TOTP, send caps.
// A customer paying an invoice is none of those things, and routing through it
// would mean inventing a machine-to-machine auth path into a surface designed
// for an authenticated human. One owner key, used directly, is fewer moving
// parts and a smaller blast radius.

var STRIKE_BASE = 'https://api.strike.me';

async function call(method, endpoint, body, key) {
    var res = await fetch(STRIKE_BASE + endpoint, {
        method: method,
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = null; }
    if (!res.ok || json === null) {
        return { __error: true, status: res.status, detail: (json && json.data) || text || '' };
    }
    return json;
}

export function failed(r) { return !r || r.__error === true; }

/* An invoice is denominated in USD and quoted into BTC at pay time, which is
   how a dollar price survives a volatile settlement asset: the customer owes
   $13,140 whatever bitcoin does between now and them paying. */
export async function createInvoice(key, amountUsd, description, correlationId) {
    return await call('POST', '/v1/invoices', {
        correlationId: correlationId,
        description: description,
        amount: { amount: amountUsd.toFixed(2), currency: 'USD' }
    }, key);
}

/* The quote is what the customer actually pays against, and it EXPIRES —
   typically within the hour. That is fine for a coffee and useless for a
   five-figure deposit somebody needs a day to move, so this is called again
   whenever the pay page finds the quote stale. Re-quoting does not create a new
   invoice; the amount owed is unchanged. */
export async function quoteInvoice(key, invoiceId) {
    return await call('POST', '/v1/invoices/' + invoiceId + '/quote', {}, key);
}

export async function getInvoice(key, invoiceId) {
    return await call('GET', '/v1/invoices/' + invoiceId, undefined, key);
}

/* On-chain, which for these amounts is the realistic rail: Lightning routing is
   unreliable well below a five-figure payment, and anyone wiring that much is
   not doing it from a phone wallet. Strike models this as a receive request
   rather than an invoice, so it is a separate call with a separate settlement
   check. */
export async function createOnchainReceive(key) {
    return await call('POST', '/v1/receive-requests', { onchain: {} }, key);
}

/* Strike has returned this shape more than one way. The existing dashboard
   Worker probes three variants, which is evidence rather than superstition, so
   the same probing lives here. */
export function onchainAddressOf(receive) {
    if (!receive) return '';
    if (receive.onchainAddress) return receive.onchainAddress;
    if (receive.onchain && receive.onchain.address) return receive.onchain.address;
    var uri = (receive.onchain && receive.onchain.uri) || receive.uri || '';
    var m = /^bitcoin:([a-zA-Z0-9]+)/.exec(uri);
    return m ? m[1] : '';
}

export function bolt11Of(quote) {
    if (!quote) return '';
    return quote.lnInvoice || quote.bolt11 || (quote.lightning && quote.lightning.invoice) || '';
}

/* Strike spells settlement several ways across its objects. Read them all and
   treat only an explicit paid state as paid — anything unrecognised is UNPAID,
   because the failure that matters is calling an unpaid order paid. */
export function isSettled(invoice) {
    if (!invoice) return false;
    var state = String(invoice.state || invoice.status || '').toUpperCase();
    return state === 'PAID' || state === 'COMPLETED' || state === 'SETTLED';
}

export function isCancelled(invoice) {
    if (!invoice) return false;
    var state = String(invoice.state || invoice.status || '').toUpperCase();
    return state === 'CANCELLED' || state === 'CANCELED' || state === 'EXPIRED';
}

/* What the pay page is allowed to see. Never the raw Strike object: it carries
   account-level identifiers that have nothing to do with this customer. */
export function publicQuote(quote) {
    if (!quote) return null;
    return {
        bolt11: bolt11Of(quote),
        btc: (quote.sourceAmount && quote.sourceAmount.amount) ||
             (quote.targetAmount && quote.targetAmount.amount) || '',
        expiresInSec: quote.expirationInSec || null
    };
}
