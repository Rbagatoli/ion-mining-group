/* GENERATED FILE — DO NOT EDIT.

   Source: site/miner-db.js (specs) and site/price-list.js (prices, ASOF,
   DEPOSIT_RATE). Regenerate with:

       node tools/build-order-catalogue.js

   This is the order Worker's ONLY source of prices. It must never read a
   figure the browser sent: the browser computes totals for display, and a
   display total is a number the customer controls. */

export const ASOF = "2026-08-21";

/* A commercial term, and still unconfirmed — see site/price-list.js. */
export const DEPOSIT_RATE = 0.25;

export const CATALOGUE = {
    "Antminer S19 Pro": { hashrate: 110, power: 3.25, efficiency: 29.5, usd: 2200 },
    "Antminer S19 XP": { hashrate: 140, power: 3.01, efficiency: 21.5, usd: 2500 },
    "Antminer S19 XP Hyd.": { hashrate: 257, power: 5.345, efficiency: 20.8, usd: 6000 },
    "Antminer S19j Pro+": { hashrate: 120, power: 3.3, efficiency: 27.5, usd: 2400 },
    "Antminer S19k Pro": { hashrate: 120, power: 2.76, efficiency: 23, usd: 3000 },
    "Antminer S21": { hashrate: 200, power: 3.5, efficiency: 17.5, usd: 3200 },
    "Antminer S21 Hyd.": { hashrate: 335, power: 5.36, efficiency: 16, usd: 9000 },
    "Antminer S21 Pro": { hashrate: 234, power: 3.51, efficiency: 15, usd: 4260 },
    "Antminer S21 XP": { hashrate: 270, power: 3.645, efficiency: 13.5, usd: 3010 },
    "Antminer S21 XP Hyd.": { hashrate: 473, power: 5.676, efficiency: 12, usd: 13500 },
    "Antminer S21+": { hashrate: 216, power: 3.564, efficiency: 16.5, usd: 2204 },
    "Antminer S21+ Hyd.": { hashrate: 395, power: 5.925, efficiency: 15, usd: 2649 },
    "Antminer S21e Hyd.": { hashrate: 332, power: 5.644, efficiency: 17, usd: 2070 },
    "Antminer T21": { hashrate: 190, power: 3.61, efficiency: 19, usd: 2394 },
    "Avalon A1446": { hashrate: 135, power: 3.31, efficiency: 24.5, usd: 2450 },
    "Avalon A1466": { hashrate: 150, power: 3.23, efficiency: 21.5, usd: 2750 },
    "Avalon A15 Pro": { hashrate: 221, power: 3.662, efficiency: 16.6, usd: 3403 },
    "Avalon A1566": { hashrate: 185, power: 3.42, efficiency: 18.5, usd: 2276 },
    "Avalon A1566I": { hashrate: 261, power: 4.5, efficiency: 17.2, usd: 4385 },
    "Whatsminer M50S": { hashrate: 128, power: 3.328, efficiency: 26, usd: 3150 },
    "Whatsminer M50S++": { hashrate: 160, power: 3.52, efficiency: 22, usd: 4000 },
    "Whatsminer M56S++": { hashrate: 254, power: 5.588, efficiency: 22, usd: 8000 },
    "Whatsminer M60": { hashrate: 172, power: 3.422, efficiency: 19.9, usd: 4650 },
    "Whatsminer M60S": { hashrate: 186, power: 3.441, efficiency: 18.5, usd: 5250 },
    "Whatsminer M60S++": { hashrate: 220, power: 3.41, efficiency: 15.5, usd: 6500 },
    "Whatsminer M66S": { hashrate: 298, power: 5.513, efficiency: 18.5, usd: 10500 },
    "Whatsminer M66S+": { hashrate: 318, power: 5.406, efficiency: 17, usd: 11500 },
    "Whatsminer M66S++": { hashrate: 348, power: 5.394, efficiency: 15.5, usd: 12500 }
};

/* The sites a customer may have machines shipped to.

   IDS ONLY, and that is the point. The browser names a site; the Worker decides what that
   site IS. Capacity and power price are never sent by the browser and never stored from it
   — same rule as the prices above, for the same reason: a figure the customer can edit is
   not a figure anyone can be held to.

   A site absent from this list is refused rather than accepted-and-ignored, so a mistyped
   or stale link cannot produce a paid order with no destination on it. */
export const SITE_IDS = ["permian","bakken","alberta","cold-lake","niger-delta"];

/* Sites that can actually receive machines today. A customer may hold a link to a site that
   has since filled up or has not been energised yet, and taking money against it would be
   selling space that does not exist. */
export const SITE_OPEN = [];

/* Prepaid electricity terms a customer may commit to.

   IDS ONLY, like the sites above. The browser names a term; the Worker decides what that
   term IS — how many years and what discount. A prepay is a multi-year commitment worth
   five figures, so the one thing a browser must never be able to do is name its own
   discount. */
export const PREPAY_TERMS = ["12m","24m","36m"];
