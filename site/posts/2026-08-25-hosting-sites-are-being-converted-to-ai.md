---
title:    Hosting sites are being converted to AI
slug:     hosting-sites-are-being-converted-to-ai
date:     2026-08-25
summary:  Two operators have told the SEC they stopped mining at sites and are converting them to AI. That is hosting capacity leaving the market.
tags:     economics, difficulty
status:   published
sources:  https://www.sec.gov/Archives/edgar/data/0001812477/000181247726000023/keel-20260630.htm, https://www.sec.gov/Archives/edgar/data/1899123/000121390026013949/ea027632501ex99-1_bitdeer.htm, https://blockchain.info/q/getdifficulty, https://mempool.space/api/v1/difficulty-adjustment
---

If you own machines and rent space for them, the most important thing that happened this year
is not the bitcoin price and not difficulty. It is that the people who rent you the space have
found a better tenant.

Keel Infrastructure, the parent company of Bitfarms, told the SEC in its quarterly report for
the period ended 30 June 2026 that
[it has stopped mining bitcoin in the United States entirely](https://www.sec.gov/Archives/edgar/data/0001812477/000181247726000023/keel-20260630.htm).
The filing puts it plainly: *"Effective June 29, 2026, the Company ceased its Bitcoin Mining
operations in the United States as part of its strategic transition to HPC and AI
infrastructure development."* All four of its US sites were affected. Washington State stopped
on 28 April 2026 and is being converted to an 18 gross MW high-performance computing hall. Panther
Creek, Scrubgrass and Sharon in Pennsylvania stopped on 29 June 2026.

The company gives two reasons, and the order is worth noticing. The cessation was *"driven by
HPC and AI infrastructure construction timelines as well as macro factors affecting the
profitability of Bitcoin Mining."* Construction schedule first. They did not wind mining down
because it stopped working; they wound it down because the building was needed sooner.

## This is capacity leaving, not capacity resting

A site that is idle because hashprice is low comes back when hashprice recovers. A site with
its mining rigs decommissioned and an AI hall being built in the space does not.

Bitdeer's
[January 2026 operations update](https://www.sec.gov/Archives/edgar/data/1899123/000121390026013949/ea027632501ex99-1_bitdeer.htm),
filed on 10 February 2026, listed four sites marked *converting to AI* with completion targeted
for Q4 2026: Tydal-1 in Norway at 50 MW, Tydal-2 at 175 MW, phase 1 at Knoxville, Tennessee at
37 MW, and Wenatchee, Washington at 13 MW. That is 275 MW at one company. On Tydal the filing
says *"Decommissioning of Bitcoin mining rigs has begun to make room for the new AI data
center."*

Decommissioning is the word that matters. Long-lead equipment ordered, permits filed, rigs
pulled out. Nobody reverses that in a quarter because hashprice ticked up.

## What it does to a hosting rate

Your hosting rate is not really a function of what power costs. It is a function of what your
landlord's next-best use of that megawatt is worth.

For most of mining's history the next-best use of a cheap, well-connected megawatt was another
miner, so hosting was priced against other miners. That is no longer true at grid-connected
sites, and the effect turns up in three places rather than in the headline rate:

- **At renewal.** A rate agreed against a market of miners gets re-quoted against a market that
  now includes AI tenants.
- **In term.** Short terms are worth less to a landlord holding a conversion option, so the
  cheap rate starts coming with a longer commitment.
- **In curtailment.** Interruptible load is the thing that made cheap power cheap. A tenant who
  cannot be interrupted is worth more per megawatt than one who can, which is exactly the
  wrong way round for you.

None of that is a prediction about prices. It is the structure of who you are bidding against,
and it changed.

## The sites AI cannot use

The competition is not for energy. It is for *interconnected, reliable, low-latency* energy.
AI training and inference need firm power, fibre, and a building that meets uptime commitments.
That is precisely the profile of a grid-connected mining site, which is why those are the ones
being converted.

It is not the profile of a flare at a wellhead, a landfill gas engine, or a curtailed wind farm
behind a constrained interconnect. Those are intermittent, remote, and often deliberately
interruptible. An AI operator cannot sign an uptime commitment on them. A miner can run on them
happily, because a miner is the one load that genuinely does not care if it stops.

So the hosting market is splitting rather than shrinking. Grid-connected capacity is being bid
away by a richer tenant. Stranded-energy capacity is not in that auction at all, because the
richer tenant cannot use it.

That is the argument for
[owning machines on stranded energy](why-mining.html) rather than renting space on the grid,
and it is worth being precise about what it does and does not claim.

## Where the argument stops

It does not claim stranded energy is cheaper in every case. It often is, but a remote site
carries costs a grid site does not: freight, hands, spares held locally, and the risk that the
gas volume falls before the machines are paid off.

It does not claim the AI conversions will continue. If AI capacity demand cools, some of that
275 MW comes back to mining, and the bidding advantage disappears. Nobody publishing a view on
that in August 2026 knows.

And it does not change the underlying mining economics. As of 25 August 2026 network difficulty
is about **125.8 T** and falling — the last retarget was **-1.31%** and the next is
[estimated at about -0.46%](https://mempool.space/api/v1/difficulty-adjustment). A falling
difficulty raises the revenue per terahash for whoever is still running, which is the other
half of the same story and
[cuts both ways](./difficulty-has-fallen-15-this-year-and-it-cuts-both-ways.html).

What it does claim is narrower and harder to argue with: if your plan depends on
renting grid-connected space at a rate set by competition among miners, the market that set
that rate is not the market you will renew into.

If you want to see what that does to a specific fleet over a specific term, the
[calculator](calculator.html) takes the rate, the term and the difficulty assumption as
inputs and shows the answer for those numbers rather than for a worked example.
