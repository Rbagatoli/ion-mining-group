---
title: Three questions before you buy a miner
slug: three-questions-before-you-buy-a-miner
date: 2026-08-23
summary: Before buying a miner, compare all-in power costs, changing network difficulty and equipment life against the cost of buying bitcoin directly.
tags: economics, hardware
status: published
sources: https://developer.bitcoin.org/devguide/block_chain.html, https://developer.bitcoin.org/devguide/mining.html, https://www.irs.gov/pub/irs-drop/n-14-21.pdf
---

Miner comparisons often start with terahashes per second. Hashrate is useful, but it needs
to sit beside efficiency, equipment price and operating costs.

Your hashrate affects expected mining output. It does not determine the value of that output
or the cost of earning it. These three questions help turn a machine specification into a
budget you can compare with buying bitcoin directly.

## 1. What does the power cost, and who is exposed to it moving?

Electricity is a major running cost. The same machine at **5 US cents/kWh** and **9 US cents/kWh**
has different operating margins, even before hardware, hosting and repairs are considered.

The thing to work out is not just the rate but who carries the risk if it changes:

- A **fixed rate** limits changes to the charges and period covered by the agreement. Check
  exclusions, pass-through charges and renewal terms.
- A **floating rate** can rise or fall. It is not necessarily cheaper than a fixed offer over
  your operating period.
- A **prepaid discount** on a floating rate does not fix the underlying bill. Check refund,
  usage and expiry terms before tying up cash with the provider.

> Compare the full bill: energy, cooling, network, maintenance, minimum charges and any taxes.
> An energy-only rate and an all-in hosting rate are not directly comparable.

## 2. What if network difficulty changes?

Bitcoin adjusts its mining difficulty every **2,016 blocks**. Higher difficulty reduces the
expected blocks found by the same hashrate over a given operating time; difficulty can also
fall. A change in network hashrate does not instantly change the difficulty target.
[Bitcoin's developer guide explains the adjustment](https://developer.bitcoin.org/devguide/block_chain.html).

Bitcoin price, the block subsidy, transaction fees and uptime also affect revenue. Pool
payout methods and fees affect what reaches your wallet; the
[mining guide describes how pools share rewards](https://developer.bitcoin.org/devguide/mining.html).
Do not extend today's daily earnings unchanged over several years. Test higher difficulty,
lower bitcoin prices and downtime alongside a base case, and account for any subsidy halving
within the period you model.

## 3. What happens at the end?

A miner has an operating life, but its economic life and resale value are uncertain. Budget for
three separate questions:

1. Could it become uneconomic before it fails? Compare expected revenue with running costs
   and allow for repairs or early retirement.
2. What could you recover on sale after removal, shipping and selling costs? Test a zero
   resale value rather than relying on a buyer being available.
3. What taxes and obligations arise while you operate it and when you sell it?

For example, the U.S. IRS says mined virtual currency's fair market value at receipt is
included in gross income; mining that qualifies as a trade or business can also create
self-employment tax obligations. That is not a blanket tax advantage over buying bitcoin.
[IRS Notice 2014-21, questions 8 and 9](https://www.irs.gov/pub/irs-drop/n-14-21.pdf) describes
these rules. Use advice specific to your jurisdiction and circumstances for deductions and
equipment disposal.

---

## So is a machine better than just buying bitcoin?

Either approach can produce the higher outcome under different assumptions. Cheap power and a
rising bitcoin price do not guarantee that mining wins: hardware cost, efficiency, fees,
difficulty, uptime, timing and resale value can outweigh them.

Compare the same cash outlays over the same period. If mining requires additional money each
month for electricity, include that spending when comparing it with buying bitcoin. State
whether mined coins are held or sold to pay bills, and apply tax assumptions consistently.

[Put your own assumptions in the calculator](calculator.html), then check the comparison's
funding assumptions and any costs it leaves out. Treat a projected crossover as the result
of that scenario, not a promised date when mining becomes the better choice.

**Reviewed — 20 September 2026:** Updated the rate, difficulty and mining-versus-buying examples
to distinguish assumptions from guaranteed outcomes. The original publication date is retained.
