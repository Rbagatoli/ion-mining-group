---
title: Energy hashprice: what a megawatt-hour of mining earns
slug: energy-hashprice-what-a-megawatt-hour-of-mining-earns
date: 2026-08-31
summary: Hashprice per petahash says what a machine earns. Energy hashprice says what you can afford to pay for power — $41 to $107 per MWh in August 2026.
tags: economics, hardware
status:   published
sources: https://hashrateindex.com/blog/hashrate-index-roundup-august-17-2026/, https://hashrateindex.com/blog/hashrate-index-roundup-august-3-2026/
---

Hashprice is quoted per petahash per day, and on **17 August 2026** it sat at
[$31.89 per PH/s per day](https://hashrateindex.com/blog/hashrate-index-roundup-august-17-2026/) —
a level Hashrate Index described as "at or below breakeven for many miners." That is a true
sentence and a nearly useless one, because it does not tell you whether *you* are one of them.

There is a second number in the same report that does, and it is quoted in the same units as
your electricity bill.

## Energy hashprice is revenue per megawatt-hour

Hashprice per PH/s tells you what a unit of *compute* earns. Energy hashprice tells you what a
unit of *power* earns — the revenue a megawatt-hour produces once it has been through your
machines. That matters because a megawatt-hour is the thing you actually buy.

It depends entirely on how efficient your fleet is. On **17 August 2026**, with hashprice at
$31.89, Hashrate Index put compute revenue per MWh at:

- **Under 14 J/TH** — $107 per MWh
- **14 to 19 J/TH** — $79 per MWh
- **19 to 25 J/TH** — $59 per MWh
- **25 to 38 J/TH** — $41 per MWh

Divide by a thousand and those are cents per kilowatt-hour: **10.7, 7.9, 5.9 and 4.1**. That is
the ceiling on what your power can cost before the machines stop paying for the electricity
they burn — before rent, staff, network, spares or capital.

Two weeks earlier, on **3 August 2026**, the same table read
[$109, $79, $60 and $41 per MWh](https://hashrateindex.com/blog/hashrate-index-roundup-august-3-2026/)
at a hashprice of $32.10. The bands barely moved. This is not a number that swings around
week to week; it moves with hashprice and with difficulty, and both were close to flat across
the month.

## The spread is the whole story

The top band earns **2.6 times** what the bottom band earns from the same megawatt-hour, on the
same day, on the same network.

That is a bigger gap than most people carry in their heads, and it is the reason "is mining
profitable" has no answer. At $60 per MWh power, a sub-14 J/TH fleet is comfortably ahead and a
25 to 38 J/TH fleet is losing money on every hour it runs. Same bitcoin price, same difficulty,
same day. The machines decide which business you are in, and the power price decides whether
that business works.

It also explains a behaviour that looks irrational from outside: operators running old hardware
into the ground rather than upgrading. If your power is cheap enough, a 30 J/TH machine still
clears its electricity. If it is not, no amount of hashrate fixes it, because hashrate is not
the constraint — the ceiling on your power price is.

## What actually moved in August

For context on how stable this was: network difficulty adjusted **+0.99% on 8 August 2026** to
**127.48T**, with the next adjustment estimated at **+1.01%**. Network hashrate averaged
**920 EH/s** over the seven days to 17 August, against **932 EH/s** two weeks earlier.

So difficulty crept up, hashrate drifted sideways, and hashprice moved less than a percent. The
squeeze in August was not an event. It was a level — and a level is harder to wait out than a
shock, because there is nothing obvious to wait for.

## If you own the energy, you are not buying at a market rate

Every number above assumes you are a buyer of power at a price somebody else sets. The reason
stranded energy is interesting is that it breaks that assumption.

Gas that is being flared has no customer. Landfill gas is being destroyed under a permit.
Curtailed generation is power that exists and cannot be sold. In each case the alternative use
is worth approximately nothing to whoever holds it, which is a different starting point from
negotiating against an industrial tariff. That is the entire argument for putting compute where
the energy is stranded rather than where the grid is convenient, and it is set out at more
length on [why mining](./why-mining.html).

It does not make the arithmetic go away. A 25 to 38 J/TH fleet on stranded gas still has a
ceiling of about $41 per MWh at August's hashprice, and the site still has to be built,
connected and staffed under that ceiling. What changes is which side of the line you start on.

## Run it against your own numbers

The useful exercise is not reading someone else's breakeven. It is taking the band your fleet
actually sits in, putting your real all-in power cost next to it, and seeing how much headroom
is left — then doing it again with difficulty growing, because it will.

The [calculator](./calculator.html) will do that with your figures rather than with a
representative fleet. Two things worth doing while you are in there: run it once with a
pessimistic difficulty assumption, and run it once at a power price a cent or two above what
you have been quoted. If the answer survives both, it is probably an answer.

Figures in this post are from Hashrate Index's weekly roundups for 3 and 17 August 2026 and are
accurate as of those dates. Hashprice, difficulty and the efficiency bands all move; check them
before relying on any of it.
