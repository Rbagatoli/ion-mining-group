/* ===== ION MINING GROUP — where a wire goes =====

   The one place bank details are written. Every field is a visible placeholder
   until somebody fills it in, and the payment page renders them exactly as they
   appear here — including the placeholders.

   THAT IS DELIBERATE. Wrong bank details are worse than absent ones: an absent
   one stops a customer and makes them ask, a wrong one sends five figures to
   somebody else's account and cannot be undone. So an unfilled field shows as
   [LIKE THIS] in orange on the page, and there is a test that the page refuses
   to present itself as ready while any of them remain.

   TO FILL IN: replace each value, and only the value. Leave the shape alone —
   the page reads these keys by name. */

var BankDetails = (function () {
    'use strict';

    var DETAILS = [
        { label: 'Beneficiary',      value: '[REGISTERED ENTITY NAME]' },
        { label: 'Bank',             value: '[BANK NAME]' },
        { label: 'Bank address',     value: '[BANK ADDRESS]' },
        { label: 'Account number',   value: '[ACCOUNT NUMBER]' },
        { label: 'Routing / ABA',    value: '[ROUTING NUMBER]' },
        { label: 'SWIFT / BIC',      value: '[SWIFT CODE]' },
        /* Only needed for payments arriving from outside the US, and harmless to
           show alongside the rest — somebody sending from abroad should not have
           to write and ask for it. */
        { label: 'IBAN',             value: '[IBAN, IF SENDING FROM OUTSIDE THE US]' }
    ];

    /* A field still carrying its placeholder. The page uses this to decide
       whether it can honestly ask anyone to send money. */
    function isPlaceholder(v) {
        return /^\[.*\]$/.test(String(v).trim());
    }

    function unfilled() {
        return DETAILS.filter(function (d) { return isPlaceholder(d.value); })
                      .map(function (d) { return d.label; });
    }

    function ready() { return unfilled().length === 0; }

    return {
        all: function () { return DETAILS.slice(); },
        isPlaceholder: isPlaceholder,
        unfilled: unfilled,
        ready: ready
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BankDetails;
