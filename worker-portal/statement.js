// ===== PROTON MINING — the seller statement =====
//
// Turns a ledger window plus a contract into the document a counterparty is paid on. Pure: every
// input arrives as an argument, so a statement recomputed next year from the same inputs is
// byte-identical to the one issued today. That property is the whole freeze guarantee, and
// content_hash is how it is checked.
//
// STRUCTURE 01 ONLY — gas or power purchase, volume x rate, with an optional take-or-pay minimum.
//
// Structures 02 (revenue share) and 03 (lease + royalty) are deliberately NOT implemented, and
// this is a scope decision rather than an oversight. Both settle on Proton's own mining revenue
// attributed to a specific site: 02 splits it after agreed opex, 03 takes a percentage of gross
// production. Today nothing attributes revenue to a site at all -- payout records carry no site,
// miner or worker, and electricity is one fleet-wide nameplate estimate. Until that exists, any
// number this file produced for 02 or 03 would be an allocation dressed up as a measurement.
//
// So an unrecognised structure produces NO CHARGES AT ALL rather than a default. That mirrors the
// rule in site-model.js normalize(): an unknown value is not quietly replaced with a plausible
// one.
//
//
// THE TWO THINGS MOST LIKELY TO PRODUCE A WRONG CHEQUE.
//
// 1. HEATING VALUE. MMBtu is not Mcf. Landfill gas runs around 500 Btu/scf; pipeline gas around
//    1000. site-engine.js has `gasBtuPerCf: 1000` sitting in its DEFAULT_CONFIG, and copying that
//    line into this file would DOUBLE the seller's payment. This file therefore imports nothing,
//    contains no numeric heating-value literal, and returns a null MMBtu when no heating-value
//    record is in force. A test asserts all three.
//
// 2. THE DIRECTION OF TAKE-OR-PAY. site-engine.js models take_or_pay_pct as a floor on PROTON'S
//    COST, on a power basis. Here it is money owed TO THE SELLER, on an energy basis. Same
//    economics, opposite beneficiary. Reusing that field would invert who owes whom, so this file
//    reads the contract record and never the prospect assumptions.

// Set on BOTH module.exports and the global, unconditionally.
//
// The Worker has no `module`, so it needs the global. Node has one, so the test suites can
// require() this directly. And when node imports it from an ESM file BOTH are defined -- an
// either/or wrapper takes the module.exports branch there and leaves the global undefined, which
// is a failure that only appears in the Worker entry point and not in any test.
(function(root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PortalStatement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var FLOW = ['accruing', 'cutoff', 'closed', 'issued', 'settled'];

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    // Money rounds ONCE, at the end. Rounding each line and then summing produces a total that
    // does not match the lines a counterparty can add up themselves -- the same argument
    // worker-orders makes about deposits.
    function money(n) { return isNum(n) ? Math.round(n * 100) / 100 : null; }
    function qty(n) { return isNum(n) ? Math.round(n * 1000) / 1000 : null; }

    // ---- Heating value -----------------------------------------------------------------------
    //
    // Mcf -> MMBtu. 1 Mcf is 1000 cubic feet, so MMBtu = Mcf * 1000 * btu_per_scf / 1e6.
    //
    // Returns null when there is no heating value in force. Null here propagates all the way to
    // the total and lands in basis.unresolved, because a statement that silently assumed pipeline
    // gas would pay double for landfill gas.
    function toMMBtu(mcf, btuPerScf) {
        if (!isNum(mcf) || !isNum(btuPerScf)) return null;
        return mcf * 1000 * btuPerScf / 1000000;
    }

    function heatingValue(contract) {
        var m = contract && contract.measurement;
        if (!m) return null;
        if (m.heating_value_source === 'contract_deemed') {
            // Deemed means the parties agreed a figure in writing. If they did not, there is no
            // figure -- there is certainly no default.
            return isNum(m.deemed_heating_value_btu_scf) ? {
                value_btu_scf: m.deemed_heating_value_btu_scf,
                source: 'contract_deemed', method: 'agreed'
            } : null;
        }
        // Measured sources arrive as records, passed in by the caller. Absent means absent.
        return null;
    }

    // ---- Take-or-pay -------------------------------------------------------------------------
    //
    // The one number in this system telemetry cannot produce.
    //
    // A meter reading of zero looks identical whether the seller's wells were down, Proton's engines
    // were down, or Proton curtailed on economics. Only the last of those obliges Proton to pay for gas
    // it did not take. So the shortfall depends on a SECOND, human-authored series -- curtailment
    // events with attribution -- and when that attribution has not been made, the answer is
    // PENDING, not zero.
    //
    // Returning zero when the truth is unknown would silently delete money the seller is owed,
    // and nobody would ever notice. So a pending shortfall is excluded from the total and the
    // statement says outright that it is partial.
    function takeOrPay(terms, deliveredQty, curtailments, deliveredIsFirm) {
        var top = terms && terms.take_or_pay;
        if (!top || !isNum(top.minimum_per_period)) return null;

        var minimum = top.minimum_per_period;
        var excusedCodes = top.excused_events || [];
        var events = curtailments || [];

        var excused = 0, ionCurtailed = 0, pending = false;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            // An event nobody has attributed yet cannot be counted either way. Guessing in
            // Proton's favour underpays; guessing in the seller's overpays. So: pending.
            if (!e.attribution) { pending = true; continue; }
            if (excusedCodes.indexOf(e.attribution) >= 0) {
                // A SELLER-side failure (or force majeure) excuses the minimum: Proton cannot be
                // made to pay for gas that was never available to take.
                if (isNum(e.quantity)) excused += e.quantity; else pending = true;
            } else if (e.attribution === 'ion_economic' || e.attribution === 'ion_maintenance') {
                // PROTON-side curtailment. Recorded for the record and shown on the statement, but
                // it does NOT reduce what Proton owes.
                //
                // The first version subtracted this from the shortfall, on the reading that gas
                // Proton refused "counts toward the minimum". That inverts the clause. Take-or-pay
                // exists precisely so that when Proton declines gas the seller made available, the
                // seller is paid anyway -- so netting it out made the clause pay ZERO in exactly
                // the month it exists for. Verified: minimum 800, delivered 0, 800 refused by Proton
                // produced a $0 statement where the seller was owed the full minimum.
                if (isNum(e.available_quantity)) ionCurtailed += e.available_quantity;
            }
        }

        var adjustedMinimum = minimum - excused;
        var out = {
            minimum: qty(minimum),
            excused: qty(excused),
            adjusted_minimum: qty(adjustedMinimum),
            delivered: qty(deliveredQty),
            ion_curtailed_available: qty(ionCurtailed),
            shortfall: null,
            pending_attribution: pending,
            // A shortfall is the gap between a contractual minimum and a MEASURED delivery. When
            // the period is not fully covered by meter readings, the delivered figure is a floor
            // rather than a measurement -- so the difference is not a shortfall, it is partly the
            // size of the hole in the data. Charging it firm would bill the seller's meter outage
            // to Proton, or the reverse, depending on which way the contract runs.
            delivered_is_firm: deliveredIsFirm !== false
        };
        if (pending || !isNum(deliveredQty) || out.delivered_is_firm === false) return out;
        out.shortfall = qty(Math.max(0, adjustedMinimum - deliveredQty));
        return out;
    }

    // ---- The statement -----------------------------------------------------------------------
    //
    // input: {
    //   site_id, period, contract, built (from ledger.build), coverage,
    //   heating_value_record, curtailments, adjustments, computed_at
    // }
    function compute(input) {
        var contract = input.contract || {};
        var terms = contract.terms || {};
        var built = input.built || { segments: [], gaps: [], milli: 0, unbillable: [] };
        var unresolved = [];
        var disclosures = [];

        var deliveredMcf = qty(built.milli / 1000);

        var hv = input.heating_value_record || heatingValue(contract);
        var deliveredMMBtu = hv ? qty(toMMBtu(deliveredMcf, hv.value_btu_scf)) : null;

        var basisUnit = (contract.measurement && contract.measurement.billing_basis) || null;

        // Flagged unresolved only when the contract actually BILLS on energy. A volume contract
        // does not need a heating value, and listing it as unresolved there tells a seller
        // something is missing from their statement when nothing is.
        if (deliveredMMBtu === null && basisUnit === 'energy_mmbtu') unresolved.push('delivered_mmbtu');
        var billQty = basisUnit === 'energy_mmbtu' ? deliveredMMBtu
                    : basisUnit === 'volume_mcf'  ? deliveredMcf
                    : null;
        if (billQty === null && basisUnit) unresolved.push('billable_quantity');

        var charges = [];
        var totalIsPartial = false;

        // Is the delivered figure a measurement, or a floor? Any unbounded gap or unbillable span
        // means gas may have flowed that nothing recorded, so every figure derived from it is a
        // lower bound. Take-or-pay must know this, because a shortfall computed against a floor is
        // partly just the size of the hole.
        var hasUnknownVolume =
            (built.gaps || []).some(function(g) { return g.kind === 'unbounded'; }) ||
            (built.unbillable || []).length > 0;

        var isStruct01 = contract.structure === '01_purchase';

        // An unrecognised structure charges NOTHING. Not a default, not a guess.
        if (isStruct01 && isNum(terms.price) && billQty !== null) {
            charges.push({
                code: 'gas_purchase',
                label: 'Gas delivered',
                basis_text: qty(billQty) + ' ' + unitLabel(basisUnit) + ' at ' +
                            terms.price + ' ' + (terms.price_basis || ''),
                quantity: qty(billQty), unit: unitLabel(basisUnit),
                rate: terms.price, rate_unit: terms.price_basis || null,
                amount_usd: money(billQty * terms.price),
                contract_version: contract.version || null
            });
        } else if (!isStruct01) {
            // Said out loud rather than producing an empty statement that looks like zero gas.
            disclosures.push('This contract uses structure ' + (contract.structure || 'unrecorded') +
                ', which this system does not yet compute. No charge has been calculated.');
            unresolved.push('structure_not_implemented');
            totalIsPartial = true;
        } else {
            // Structure 01, but something needed to price it is missing -- no rate on the
            // contract, or no billable quantity because the heating value is absent.
            //
            // Without this branch the statement showed a confident $0.00 with total_is_partial
            // FALSE, which reads as "you are owed nothing this month" when the truth is "nobody
            // has recorded what you are owed". Those are opposite messages to send a counterparty.
            disclosures.push('No amount could be calculated for this period. ' +
                (isNum(terms.price) ? 'The billable quantity is not available.'
                                    : 'No contract rate is recorded.') +
                ' This is not a zero balance.');
            unresolved.push(isNum(terms.price) ? 'billable_quantity' : 'contract_price');
            totalIsPartial = true;
        }

        // Take-or-pay, always shown as three lines when the contract has a minimum -- so that a
        // zero shortfall is a COMPUTED zero rather than the absence of a check.
        //
        // INSIDE the structure gate. It used to sit outside it, so a structure-02 or -03 contract
        // -- whose statement charges nothing by design, because per-site revenue attribution does
        // not exist yet -- still produced a take-or-pay shortfall line and billed it. A contract
        // this file cannot price must not bill anything at all.
        var top = isStruct01 ? takeOrPay(terms, billQty, input.curtailments, !hasUnknownVolume) : null;
        if (top) {
            if (top.pending_attribution) {
                totalIsPartial = true;
                unresolved.push('take_or_pay_shortfall');
                disclosures.push('A take-or-pay shortfall cannot be calculated until every ' +
                    'curtailment in this period has been attributed. The total below excludes it.');
            } else if (top.delivered_is_firm === false) {
                totalIsPartial = true;
                unresolved.push('take_or_pay_shortfall');
                disclosures.push('A take-or-pay shortfall has not been charged for this period. ' +
                    'Part of it is not covered by meter readings, so the delivered figure is a ' +
                    'minimum rather than a measurement, and the difference against the contract ' +
                    'minimum would partly be the size of that gap rather than a real shortfall.');
            } else if (top.shortfall > 0) {
                var rate = isNum(terms.take_or_pay.shortfall_price)
                    ? terms.take_or_pay.shortfall_price : terms.price;
                charges.push({
                    code: 'take_or_pay_shortfall',
                    label: 'Take-or-pay shortfall',
                    basis_text: 'Minimum ' + top.adjusted_minimum + ' less delivered ' +
                                top.delivered + ' and Proton-curtailed ' + top.ion_curtailed_available,
                    quantity: top.shortfall, unit: unitLabel(basisUnit),
                    rate: isNum(rate) ? rate : null, rate_unit: terms.price_basis || null,
                    amount_usd: isNum(rate) ? money(top.shortfall * rate) : null,
                    contract_version: contract.version || null
                });
            }
        }

        // Coverage is disclosed always, so a hundred percent is a measured hundred.
        var cov = input.coverage || null;
        if (cov && isNum(cov.coverage_pct) && cov.coverage_pct < 100) {
            disclosures.push('Coverage was ' + cov.coverage_pct + '%. ' + cov.gap_hours +
                ' hours of this period are unmeasured and are listed as gaps. No volume has been ' +
                'estimated for them.');
        }
        if (built.unbillable && built.unbillable.length) {
            disclosures.push(built.unbillable.length + ' span(s) could not be billed because the ' +
                'meter reading either side could not be reconciled. They are listed in full.');
        }

        var adjustments = (input.adjustments || []).map(function(a) {
            return {
                code: a.code || 'prior_period', label: a.label || 'Prior period adjustment',
                relates_to_period: a.relates_to_period || null,
                relates_to_statement: a.relates_to_statement || null,
                reason: a.reason || null, amount_usd: money(a.amount_usd),
                correction_refs: a.correction_refs || []
            };
        });

        var subtotal = sum(charges.map(function(c) { return c.amount_usd; }));
        var adjTotal = sum(adjustments.map(function(a) { return a.amount_usd; }));

        return {
            statement_id: null,           // assigned by the worker on close
            site_id: input.site_id || null,
            version: 1, supersedes: null, restates: null,
            status: 'closed',
            contract_ref: contract.contract_id ? {
                contract_id: contract.contract_id,
                versions: [contract.version || null],
                document_sha256: contract.document_sha256 || null
            } : null,
            period: input.period || null,
            quantity: {
                billing_basis: basisUnit,
                delivered_mcf: deliveredMcf,
                delivered_mmbtu: deliveredMMBtu,
                heating_value_applied: hv,
                segments: built.segments,
                coverage: cov,
                gaps: built.gaps
            },
            charges: charges,
            adjustments: adjustments,
            subtotal_usd: money(subtotal),
            adjustments_usd: money(adjTotal),
            total_usd: money(subtotal + adjTotal),
            total_is_partial: totalIsPartial,
            take_or_pay: top,
            basis: {
                unbillable_segments: built.unbillable || [],
                unresolved: unresolved,
                disclosures: disclosures,
                readings_included_count: countReadings(built),
                computed_at: input.computed_at || null,
                engine_version: 'statement@1'
            },
            history: []
        };
    }

    function unitLabel(basis) {
        return basis === 'energy_mmbtu' ? 'MMBtu' : basis === 'volume_mcf' ? 'Mcf' : '';
    }

    // null is not zero, so a null anywhere makes the sum a genuine number only over what exists;
    // the null itself is surfaced through basis.unresolved rather than swallowed.
    function sum(list) {
        var t = 0;
        for (var i = 0; i < list.length; i++) if (isNum(list[i])) t += list[i];
        return t;
    }

    function countReadings(built) {
        var ids = {};
        (built.segments || []).forEach(function(s) {
            if (s.start_reading_id) ids[s.start_reading_id] = 1;
            if (s.end_reading_id) ids[s.end_reading_id] = 1;
        });
        return Object.keys(ids).length;
    }

    // ---- Freezing ----------------------------------------------------------------------------
    //
    // Canonical JSON with sorted keys, so two runs over the same data hash the same regardless of
    // property insertion order. The hash is what lets a seller -- or an auditor, or a court --
    // prove the figure they were sent has not moved since.
    function canonical(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        var keys = Object.keys(value).sort();
        return '{' + keys.map(function(k) {
            return JSON.stringify(k) + ':' + canonical(value[k]);
        }).join(',') + '}';
    }

    // Advance one step, forward only. `issued` is a human act, exactly as `quoted` is in the order
    // flow -- the seller sees nothing until a person decides they should.
    function canAdvance(from, to) {
        var i = FLOW.indexOf(from), j = FLOW.indexOf(to);
        return i >= 0 && j === i + 1;
    }

    return {
        compute: compute,
        takeOrPay: takeOrPay,
        toMMBtu: toMMBtu,
        canonical: canonical,
        canAdvance: canAdvance,
        FLOW: FLOW
    };
});
