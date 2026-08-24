---
title:    Who carries which risk in a stranded-gas deal
slug:     who-carries-which-risk-in-a-stranded-gas-deal
date:     2026-08-24
summary:  Gas purchase, revenue share and lease plus royalty are not three prices for the same thing. They are three answers to who carries the loss.
tags:     energy-owner, deal-structure
status:   published
sources:  https://hashrateindex.com/blog/hashrate-index-roundup-november-3-2025/, https://hashrateindex.com/blog/hashrate-index-roundup-june-8-2026/, https://hashrateindex.com/blog/hashrate-index-roundup-august-17-2026/, https://www.law.cornell.edu/uscode/text/11/362, https://www.law.cornell.edu/uscode/text/11/365, https://www.law.cornell.edu/ucc/9/9-609, https://www.law.cornell.edu/ucc/9/9-334, https://www.epa.gov/lmop/landfill-gas-energy-project-development-handbook, https://ngfcp.nuprc.gov.ng/, https://www.aer.ca/regulations-and-compliance-enforcement/rules-and-regulations/directives/directive-060, https://rrc.texas.gov/resource-center/research/research-queries/about-swr32-query, https://www.vnf.com/ferc-provides-further-guidance-on-co-located-load-interconnection
---

The [energy page](energy.html) sets out three ways to be paid for energy you are currently flaring,
venting or curtailing. This note is the other half of that conversation: what each one costs you
when the deal goes wrong. A price is the easy part of a term sheet. The hard part is the list of
things that can go wrong on a mining site and whose problem each one is, and that list is not on
the front of anybody's proposal.

Three shorthands, so the rest of this reads cleanly. **Purchase** is where they buy your gas or
your power at a set price. **Share** is where they take the energy and split mining revenue with
you. **Lease** is where they rent the pad and pay a royalty on top of the rent. What each one is
for is on the energy page. What each one does to you is here.

## Nobody makes the bitcoin price go away

None of the three removes bitcoin price risk from the site. They move it, and they change the form
in which you hold it.

The number that decides whether the machines on your pad make money is hashprice, which is what a
unit of mining capacity earns in a day. Hashrate Index put it at
[$43.33 per PH/s per day on 3 November 2025](https://hashrateindex.com/blog/hashrate-index-roundup-november-3-2025/),
[$28.94 on 8 June 2026](https://hashrateindex.com/blog/hashrate-index-roundup-june-8-2026/), and
[$31.89 on 17 August 2026](https://hashrateindex.com/blog/hashrate-index-roundup-august-17-2026/).
A third of the revenue line went and part of it came back inside ten months, on a site whose gas
supply never changed. Hashrate Index is published by Luxor Technology, which runs a mining pool and
brokers ASICs — two of the businesses Proton is in — and those are three readings from one provider
rather than a cross-checked series.

- Under a **purchase**, the buyer carries the movement in price. They do not carry the movement in
  volume, and a purchase pays per unit delivered: if they answer a fall in hashprice by switching
  machines off, your cheque falls with the volume even though your price never moved. What holds
  the cheque still is take-or-pay or a capacity charge, not the fixed price. That is the next
  section.
- Under a **share**, you carry it directly, in both directions. That is the deal, and it is the
  honest one about what it is.
- Under a **lease**, you carry a thin slice through the royalty and none of it through the rent.

Then the part the structure names hide. A fixed price from a company whose only revenue is mining
is not the same instrument as a fixed price from an investment-grade utility. When hashprice falls
far enough, the fixed obligation does not get smaller, it gets harder to pay. What a purchase
agreement actually does is convert your commodity exposure into credit exposure on a
single-purpose counterparty. That is usually a good trade. It is not the same as having no
exposure.

That includes when we say it. Our own [energy page](energy.html) describes a purchase agreement as bankable and as moving the price risk off your side of the table, which it does. It is not the same as the risk leaving the deal, and the page says so. If a proposal in front of you claims otherwise, that is the sentence to push on.

## Who funds the capex, and what the capex buys

In all three structures the capital is normally the operator's: gas conditioning, generation,
switchgear, transformers, containers, machines, and the site work under them. That is the reason
these deals exist at all. It also creates two things worth naming out loud.

The first is the term. Capital spent on your pad has a payback period, and the term is what lets it
be earned back. So when a counterparty asks for sixty months, the useful question is not how keen
they are to work with you but what the sixty months is the payback on. Ask them, and ask what the
price does at forty-eight. Shorten the term and the price has to move, because the same capital has
fewer months to earn back.

The second is that from the day the equipment lands there is property on your ground that is not
yours, and what happens to it is now a permanent feature of the arrangement.

If any of the capital is yours — you grade the pad, you build the road, you pay for the tie-in —
you have quietly bought into the project. Ask what happens to that spend if the deal ends in month
nine: reimbursed, amortised against future payments, or simply gone. Money you spend to make a site
attractive to one counterparty may be worth nothing to the next one.

## What happens when they stop paying

The realistic failure here is not fraud. It is hashprice, and it arrives in stages.

**First they curtail.** Switching machines off in a bad market is rational, so assume they have
asked for the right to do it and check whether the draft in front of you gives it to them. If your
payment depends on gas actually being taken, that right is a payment holiday you granted at
signing, and a revenue line that looked contractual turns out not to be. Take-or-pay is the direct
answer to it: an obligation to pay for volume whether or not it is taken.

While you are there, check the asymmetry. Your interruption right and their curtailment right are
different animals. Yours exists because it is your site and your operations come first. Theirs
exists because mining is sometimes unprofitable. A contract that treats the two as matching
concessions is charging you for one of them.

**Then a missed payment.** What matters is not the default clause but what stands behind it: how
long the cure period runs, whether arrears carry interest, whether you can suspend delivery without
terminating, and above all whether there is security you can draw on without anyone's cooperation.

**Then insolvency**, where the clauses people are proudest of stop working. In a United States
bankruptcy the automatic stay under
[11 U.S.C. § 362](https://www.law.cornell.edu/uscode/text/11/362), as it reads on 24 August 2026,
bars acts to obtain possession of property of the estate, to exercise control over it, and to
enforce liens against it, from the moment the petition is filed. Where the equipment is property of
the estate, that reaches your ability to remove it or sell it. And under
[11 U.S.C. § 365(e)(1)](https://www.law.cornell.edu/uscode/text/11/365), as at the same date, an
executory contract or unexpired lease of the debtor generally may not be terminated or modified
solely because of a clause conditioned on the debtor's insolvency or the commencement of the case.
Section 365(e)(2) sets out exceptions that can reverse that for some contracts.

Put plainly: the clause that says this agreement terminates on insolvency may be the clause that
does not work. That is a description of a federal statute with its own exceptions, not advice on
your contract, and a counterparty outside the United States sits under a different regime entirely.

> The conclusion is unglamorous. The protections that work are the ones that pay you before a
> default, not the ones that describe what happens after it. Security you already hold beats a
> remedy you have to go and get.

## The equipment on your land after they walk

If an operator leaves, you have containers, engines, a transformer and possibly several thousand
machines on your pad, and none of it is yours. Three separate questions decide what that means, and
they have three different answers.

1. **Who owns it.** The operator, or a leasing company, or an investor whose machines were hosted
   on that pad and who has never spoken to you. Ask for the answer in writing, by item, and ask
   again when the site expands.
2. **Who has a security interest in it.** Equipment of this kind can be financed or leased, and
   where it is, the party who eventually arrives at your gate is a lender you never negotiated
   with. Under the uniform text of [UCC § 9-609](https://www.law.cornell.edu/ucc/9/9-609), as it
   stands on 24 August 2026, a secured party may take possession of collateral after default,
   either through judicial process or without it if it can proceed without breach of the peace.
3. **Who is obliged to remove it, and with whose money.** This is the one entirely within your
   control at signing, and the one most easily left as a sentence rather than a sum.

A removal obligation is a promise. A removal security is money. Ask for the second: a bond, an
escrow, or a retention sized against the real cost of demobilisation and site restoration, with a
mechanism to resize it as the site grows. An obligation owed by a company that has just failed is
worth what the company is worth.

Two more things belong in the document item by item rather than in an argument later. First, which
items stay and which go, listed by name. Foundations, buried pipe and an interconnect upgrade sit
at one end of that list, containers and machines at the other, and everything in between is a
negotiation you would rather have now than at the gate. Second, where equipment is attached to your
land, where you sit against a lender. Under the uniform text of
[UCC § 9-334](https://www.law.cornell.edu/ucc/9/9-334), as at the same date, a security interest in
fixtures is subordinate to a conflicting interest of an encumbrancer or owner of the related real
property other than the debtor, but purchase-money exceptions and fixture filings can reverse that.
Which is a long way of saying it is decided by paperwork filed at the beginning, so it is worth
knowing where you stand before you sign rather than after.

## What a minimum term does, and what a clawback does

Two clauses deserve more attention than their length suggests.

A **minimum term** protects whoever spent the capital. It obliges you to keep the site available
for a period. On its own it obliges the other side to nothing at all: a minimum term without a
minimum payment is a lock-in with no floor. The question to ask is what the smallest amount you can
receive in a month inside that term is, and whether that number appears anywhere in the document.

The mirror is the obligation running the other way. If the contract has you delivering a minimum
volume or a minimum quality, check it against what your supply actually does over that period.
Wells decline. Landfill collection systems degrade and get repaired. A minimum delivery obligation
set against a declining curve over sixty months is a bet you lose at some point by arithmetic, and
the only open question is what it costs when you do.

A **clawback** is repayment of money already paid to you, triggered by an event. It shows up in
three forms:

- An upfront or signing payment repayable pro rata on early termination. That is a loan, and it
  should be described and priced as one.
- A make-whole for unamortised capital if you terminate for convenience. That is you buying out
  their payback period.
- Recovery of a shortfall against a minimum volume, usually netted against future payments.

None of the three is unreasonable in itself. What makes them dangerous is that each one produces a
number, and that number is not the price on the front page. Compute all three yourself, at a date
of your choosing, before you sign.

> A test worth running before signing. Pick month fourteen of a sixty-month term. Assume the deal
> ends for a reason that is nobody's fault: you sold the field, a pipeline finally reached you, the
> landfill closed early. Compute what each side owes the other. If neither party's lawyer can
> produce that figure from the document, it is not a clause, it is a future argument with a date on
> it.

## Which structure is worst depends on who you are

There is no ranking of these three that holds for everyone, and anyone who offers you one is
describing their own book. The least favourable structure is a function of what you own. What
follows is reasoning rather than observation, for the reason set out at the end.

- **If you need a bankable number**, revenue share is the worst of the three. It is unforecastable,
  it carries little weight with a lender, and it makes you an involuntary partner in a business you
  did not choose. A share struck after agreed operating costs also makes your revenue a function of
  someone else's cost accounting, which is something you then have to audit for the life of the
  deal.
- **If your resource is long-lived and cheap** — a large landfill with twenty years of gas, a field
  with a shallow decline — a fixed purchase price is the worst of the three. You have sold an
  option on a resource that will outlive the contract, at a price struck in whatever market existed
  the month you signed, and the counterparty keeps the whole of any improvement.
- **If you own the land but not the energy**, lease plus royalty is the natural fit and the other
  two are awkward. If you do own the energy, a pure lease can be the worst outcome available: you
  have handed over the resource and been paid rent for the dirt.

And the version that is bad whatever label it carries: a fixed price with no index, over a term
longer than your visibility into your own supply, from a single-purpose company with nothing
standing behind the obligation. The name of the structure is not the risk. The credit, the term and
the security are.

## The jurisdiction may have decided some of this already

Reasoning stops where the statute starts, and in several of the places this energy actually sits,
it starts early.

- **Nigeria.** Flared associated gas is not straightforwardly the producer's to sell. Section 105
  of the Petroleum Industry Act 2021 empowers the Commission to take natural gas destined for
  flaring free of charge at the flare stack, as
  [set out in this May 2026 analysis of the flare commercialisation programme](https://www.mondaq.com/nigeria/oil-gas-electricity/1783214/putting-out-the-flare-diligence-structuring-implementation-and-enforcement-under-the-nigerian-gas-flare-commercialisation-programme-ngfcp).
  The [Nigerian Gas Flare Commercialisation Programme](https://ngfcp.nuprc.gov.ng/), as its site
  describes it on 24 August 2026, allocates flares "to competent third-party investors" under a
  competitive procurement process, and NUPRC issued Permits to Access Flare Gas to
  [28 companies in December 2025](https://kennalp.com/resources/gas-flaring-permits-and-compliance-what-the-nuprc-s-latest-approvals-mean-for-energy-companies/).
  If your flare is in Nigeria, part of the answer to who gets paid is statutory before any
  commercial negotiation begins.
- **Alberta.**
  [AER Directive 060](https://www.aer.ca/regulations-and-compliance-enforcement/rules-and-regulations/directives/directive-060),
  current edition 27 March 2026, sets the requirements for flaring, incinerating and venting at all
  upstream petroleum industry wells and facilities in Alberta. Putting a load on the pad changes
  what you are doing with the gas, and therefore what you report and what has to be approved. That
  is a regulatory workstream with its own clock, and the contract should say whose job it is and
  who carries the delay.
- **Texas.** The right to flare is not open-ended. Under Statewide Rule 32, as the Railroad
  Commission describes it on 24 August 2026, an operator may flare while drilling a well and
  [for up to ten days after completion to conduct potential well testing](https://rrc.texas.gov/resource-center/research/research-queries/about-swr32-query),
  and beyond that has to request an exception. Continuing to flare is a baseline with a clock on
  it, which is worth remembering when someone implies the alternative to their offer is free.
- **Co-located load in PJM.** Putting load behind your meter is a tariff question as well as a
  commercial one. FERC found in an order of 18 December 2025 that PJM's tariff lacked sufficient
  clarity and consistency on the rates, terms and conditions applicable to interconnection
  customers seeking to use new generating facilities to serve co-located load, and in an order of
  16 April 2026
  [accepted parts of PJM's compliance filing and rejected others](https://www.vnf.com/ferc-provides-further-guidance-on-co-located-load-interconnection),
  including its attempt to alter the Commission's definition of co-located load. That is a narrower
  fact pattern than a curtailed generator taking on load — it concerns new generation built to
  serve load on site — and the rules for it are being written now. A term sheet that treats the
  interconnection question as settled is assuming something that is not.

## What to ask for in writing

Not a model contract, and not in order of importance. These are the points where silence in the
document favours the operator.

1. **The price and its index.** A fixed number over sixty months is a forecast you both signed. If
   it is fixed, say why, and say what happens at review.
2. **A minimum payment, not only a minimum term.** Name the smallest amount that can arrive in a
   month when nothing runs, and whether it is take-or-pay, a floor, or a capacity charge.
3. **Security that exists before default.** A deposit, a letter of credit, a parent guarantee or
   prepayment, sized to the months it would take you to replace them.
4. **Curtailment in both directions.** Your interruption right, with notice periods and whether
   using it costs you a payment. Theirs, with whether using it costs them one.
5. **Definitions, wherever a payment is a share.** Which costs come out before the split, whether
   they are capped, who may audit, how often, and what you can see between audits.
6. **Removal security rather than a removal promise.** Sized to demobilisation and restoration,
   with a mechanism to resize it as the site grows.
7. **An itemised end-of-term list.** What stays, what goes, who owns each item, and who pays to
   move it.
8. **Where you stand in the queue.** Written disclosure of who holds a security interest in the
   equipment, plus whatever lien or priority position you can negotiate in your own favour.
9. **The early-termination number, both ways, with worked examples** at two different points in the
   term.
10. **Environmental attributes.** Who owns the emission reductions from destroying the methane, in
    writing, whether or not either side can sell them today. Chapter 5 of EPA's
    [landfill gas energy project development handbook](https://www.epa.gov/lmop/landfill-gas-energy-project-development-handbook),
    on a page last updated 6 February 2026, treats the environmental attribute agreement as a
    separate instrument from the gas purchase agreement, which is a fair signal of how separable
    that value is.
11. **Assignment.** Who they can sell this contract to without asking you, and what you can do if it
    lands with someone you would never have signed with.

## Where this argument is weak

Most of the above is reasoning about how these deals are constructed, not a survey of executed
contracts. Nobody publishes their gas purchase agreement, so there is no public standard to point
at, and anyone who claims to know what is market for a flare gas mining deal is telling you what
they have signed, which is one side of a small number of deals. That bites hardest on the section
about which structure is worst: it is a three-way taxonomy assembled out of reasoning, and it reads
more settled than reasoning deserves. Treat the whole of it as questions to ask rather than terms
you are owed.

The hashprice series is three readings from one provider, chosen because they are dated and public.
A different index, or different dates, would produce a different swing, and we did not cross-check
against a second series.

The legal points are descriptions of statutes and regulator publications rather than advice, and
four of them are specific to the United States. Your own counsel is the only person who can say how
any of it lands on your document, and in Nigeria, Alberta or anywhere else the framework is
different again.

And the obvious one. Proton sits on the other side of this table. A note from a mining company about
what to demand from a mining company should be read with that in mind. It is worth writing down
anyway, because a deal that fails in year two is a worse outcome for us than one we never won.

---

## Where to look next

The three structures, and what a buildable site looks like — volume, gas quality, available load,
duration and land — are on the [energy page](energy.html). If you are still working out whether you
have a project at all, that screening list is the more useful half.

If you already know you do, the productive next step is not a term sheet. It is going through the
eleven points above and deciding which three you would refuse to sign without. Everything after
that is a negotiation about price, and price is the part both sides find easy.
