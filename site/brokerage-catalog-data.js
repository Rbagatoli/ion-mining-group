/* Dated manufacturer specifications and public hardware asking-price references.
 * Research: reports/miner-catalog-2026-09-18. No inherited price-list cost is a Proton quote.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrokerageCatalog = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var data = {
  "checkedOn": "2026-09-18",
  "algorithm": "SHA-256",
  "scope": "Major industrial Bitcoin ASIC families; prior Proton catalog models preserved as requests. Not every chip bin or factory revision.",
  "pricingPolicy": {
    "publicLabel": "Observed market asking price",
    "allCurrency": "USD",
    "protonQuoteStatus": "No confirmed comparable Proton quote found in scoped repository sourcing evidence.",
    "savingsAvailable": false,
    "savingsDisplay": "Confirmed quote needed",
    "formula": "matched market landed cost per unit minus matched Proton landed quote per unit",
    "freshnessDays": 7,
    "requirements": [
      "Exact model and hashrate bin",
      "Same new/used condition and tested quality",
      "Same quantity, destination, delivery timing and Incoterm",
      "Equivalent warranty and return terms",
      "All freight, duty, tax, fees and accessories known",
      "Both quotes current and unexpired"
    ],
    "unknownCostRule": "Unknown is null, never zero.",
    "comparisonRule": "A single public listing is an asking-price reference, not a market average. Do not compare sale/conditional coupon/in-stock/futures or mismatched bins as equivalent."
  },
  "families": [
    {
      "id": "s21-pro",
      "name": "Antminer S21 Pro",
      "maker": "Bitmain",
      "cooling": "air",
      "modelKey": "s21-pro",
      "renderNote": "Exterior preview: the S21 Pro envelope is manufacturer-published. Small exterior details follow the inspected S21 XP family manual; exact Pro batch details need confirmation.",
      "description": "S21 Pro representative; select the exact related model and hashrate bin. Related models have different dimensions and power requirements.",
      "variants": [
        {
          "id": "s21-pro-234",
          "name": "S21 Pro · 234 TH/s",
          "hashrateTH": 234,
          "powerW": 3510,
          "efficiency": 15,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://file12.bitmain.com/shop-product-s3/firmware/793d284c-4b4c-4c00-bb6b-30f0a4902c96/2025/03/20/17/S21%20Pro%20User%20Guide-V1.1.9.pdf"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/antminer-s21-pro-234th-8471",
                "usd": 2695,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 234,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "USA stock claimed; shipment cost determined separately. Quantity 25+ discount not priced."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21-pro-245",
          "name": "S21 Pro · 245 TH/s",
          "hashrateTH": 245,
          "powerW": 3675,
          "efficiency": 15,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://file12.bitmain.com/shop-product-s3/firmware/793d284c-4b4c-4c00-bb6b-30f0a4902c96/2025/03/20/17/S21%20Pro%20User%20Guide-V1.1.9.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21-pro-220",
          "name": "S21 Pro · 220 TH/s",
          "hashrateTH": 220,
          "powerW": 3300,
          "efficiency": 15,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://file12.bitmain.com/shop-product-s3/firmware/793d284c-4b4c-4c00-bb6b-30f0a4902c96/2025/03/20/17/S21%20Pro%20User%20Guide-V1.1.9.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21-plus-216",
          "name": "S21+ · 216 TH/s",
          "hashrateTH": 216,
          "powerW": 3564,
          "efficiency": 16.5,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Bitmain-authored manual (third-party mirror)",
              "url": "https://manuals.plus/m/1abc2632737ae1023bcf80b452442d4432df7a3e654e1ed2e0252cccdf6bfad4.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "Bitmain-authored February 2025 manual accessed through a third-party mirror; confirm exact shipment revision."
          },
          "protonQuote": null,
          "specNote": "Bitmain-authored February 2025 manual accessed through a third-party mirror; confirm exact shipment revision."
        },
        {
          "id": "s21-plus-225",
          "name": "S21+ · 225 TH/s",
          "hashrateTH": 225,
          "powerW": 3713,
          "efficiency": 16.5,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Bitmain-authored manual (third-party mirror)",
              "url": "https://manuals.plus/m/1abc2632737ae1023bcf80b452442d4432df7a3e654e1ed2e0252cccdf6bfad4.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "Bitmain-authored February 2025 manual accessed through a third-party mirror."
          },
          "protonQuote": null,
          "specNote": "Bitmain-authored February 2025 manual accessed through a third-party mirror."
        },
        {
          "id": "s21-plus-235",
          "name": "S21+ · 235 TH/s",
          "hashrateTH": 235,
          "powerW": 3878,
          "efficiency": 16.5,
          "availability": "sourcing",
          "dimensionsMM": [
            450,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Bitmain-authored manual (third-party mirror)",
              "url": "https://manuals.plus/m/1abc2632737ae1023bcf80b452442d4432df7a3e654e1ed2e0252cccdf6bfad4.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "Bitmain-authored February 2025 manual accessed through a third-party mirror."
          },
          "protonQuote": null,
          "specNote": "Bitmain-authored February 2025 manual accessed through a third-party mirror."
        },
        {
          "id": "s21-xp-270",
          "name": "S21 XP · 270 TH/s",
          "hashrateTH": 270,
          "powerW": 3645,
          "efficiency": 13.5,
          "availability": "sourcing",
          "dimensionsMM": [
            449,
            219,
            293
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/35383015643673-S21-XP-Specifications"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/antminer-s21-xp-270th-b50a",
                "usd": 4180,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 270,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Hong Kong stock claimed; freight/tax/duty not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21-200",
          "name": "S21 · 200 TH/s",
          "hashrateTH": 200,
          "powerW": 3500,
          "efficiency": 17.5,
          "availability": "sourcing",
          "dimensionsMM": [
            400,
            195,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/23794895251609-S21-Specification"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "t21-190",
          "name": "T21 · 190 TH/s",
          "hashrateTH": 190,
          "powerW": 3610,
          "efficiency": 19,
          "availability": "sourcing",
          "dimensionsMM": [
            400,
            212,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/24967960325785-T21-Specifications"
            }
          ],
          "market": {
            "observations": [],
            "note": "Normal energy mode. Requires 380–415 V three-phase power; a separate high-energy mode is rated at 233 TH/s and 5126 W."
          },
          "protonQuote": null,
          "specNote": "Normal energy mode. Requires 380–415 V three-phase power; a separate high-energy mode is rated at 233 TH/s and 5126 W."
        },
        {
          "id": "s23-air",
          "name": "S23 air · confirm exact bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "model-existence-only",
          "specNote": "Bitmain names S23 in its current warranty program. Exact air-cooled hashrate, power and efficiency require confirmation from the manufacturer. The preview shows the representative S21 Pro exterior.",
          "sources": [
            {
              "label": "Bitmain current model support list",
              "url": "https://support.bitmain.com/hc/en-us/articles/17960350462873-After-sales-extended-warranty-service"
            }
          ],
          "market": {
            "observations": [],
            "note": "Bitmain names S23 in its current warranty program. Exact air-cooled hashrate, power and efficiency require confirmation from the manufacturer. The preview shows the representative S21 Pro exterior."
          },
          "protonQuote": null
        }
      ]
    },
    {
      "id": "s21-hydro",
      "name": "Antminer S21+ Hyd.",
      "maker": "Bitmain",
      "cooling": "hydro",
      "modelKey": "s21-hydro",
      "renderNote": "Exterior preview: the compact hydro layout and visual envelope follow the S21 XP Hyd. reference. The supplied S21+ Hyd. casing dimensions and detailed connections still need confirmation.",
      "description": "Fanless liquid-cooled S21 hardware; external cooling and three-phase power are separate requirements.",
      "variants": [
        {
          "id": "s21-plus-hyd-395",
          "name": "S21+ Hyd. · 395 TH/s",
          "hashrateTH": 395,
          "powerW": 5925,
          "efficiency": 15,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-hashrate-efficiency-seller-power",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://file12.bitmain.com/shop-product-s3/firmware/d24fe923-64b6-4e9d-b5b6-ebbe3b80fbb1/2025/02/07/11/S21%2B%20Hyd.%20Product%20Manual.pdf"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/",
                "usd": 3176,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 395,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Hong Kong new listing; no binding quote or delivered total."
              }
            ],
            "note": "Bitmain documents 395 TH/s and 15 J/TH; the seller also lists 5925 W. Confirm the supplied unit’s factory specification and external dimensions."
          },
          "protonQuote": null,
          "specNote": "Bitmain documents 395 TH/s and 15 J/TH; the seller also lists 5925 W. Confirm the supplied unit’s factory specification and external dimensions."
        },
        {
          "id": "s21-xp-hyd-473",
          "name": "S21 XP Hyd. · 473 TH/s",
          "hashrateTH": 473,
          "powerW": 5676,
          "efficiency": 12,
          "availability": "sourcing",
          "dimensionsMM": [
            339,
            173,
            207
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/34523540504857-S21-XP-Hyd-Specification"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/",
                "usd": 7379,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 473,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "New Asia listing; freight/tax/duty not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21-hyd-335",
          "name": "S21 Hyd. · 335 TH/s",
          "hashrateTH": 335,
          "powerW": 5360,
          "efficiency": 16,
          "availability": "sourcing",
          "dimensionsMM": [
            339,
            163,
            207
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/26824251926681-S21-Hyd-Specification"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s21e-hyd",
          "name": "S21e Hyd. · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/17960350462873-After-sales-extended-warranty-service"
            }
          ],
          "market": {
            "observations": [],
            "note": "Bitmain lists this model in its current support range. Exact hashrate, power and efficiency require confirmation for the quoted unit."
          },
          "protonQuote": null,
          "specNote": "Bitmain lists this model in its current support range. Exact hashrate, power and efficiency require confirmation for the quoted unit."
        }
      ]
    },
    {
      "id": "s23-hydro",
      "name": "Antminer S23 Hyd.",
      "maker": "Bitmain",
      "cooling": "hydro",
      "modelKey": "s23-hydro",
      "renderNote": "Exterior preview: the published S23 Hyd. envelope uses a hydro-family layout. Model-specific hose and connector details could not be verified from an accessible manufacturer photograph.",
      "description": "Current manufacturer-documented 580 TH/s liquid-cooled model; external cooling is not included in hardware benchmarks.",
      "variants": [
        {
          "id": "s23-hyd-580",
          "name": "S23 Hyd. · 580 TH/s",
          "hashrateTH": 580,
          "powerW": 5510,
          "efficiency": 9.5,
          "availability": "sourcing",
          "dimensionsMM": [
            410,
            170,
            209
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://file12.bitmain.com/shop-product-s3/firmware/807d3b27-f625-470f-a940-247f83b36854/2025/06/20/14/S23%20Hyd.%20Product%20Manual_v1.0.6.pdf"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/",
                "usd": 16078,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 580,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "New Hong Kong stock claimed. Delivered cost and warranty not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        }
      ]
    },
    {
      "id": "s19-air",
      "name": "Antminer S19k Pro",
      "maker": "Bitmain",
      "cooling": "air",
      "modelKey": "s19-air",
      "description": "Prior-generation fleet miners; used and refurbished lots require lot-specific tests, condition and warranty.",
      "variants": [
        {
          "id": "s19k-pro-120",
          "name": "S19k Pro · 120 TH/s",
          "hashrateTH": 120,
          "powerW": 2760,
          "efficiency": 23,
          "availability": "sourcing",
          "dimensionsMM": [
            400,
            195,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/23833956049049-S19K-Pro-Specifications"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/",
                "usd": 461,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 120,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "New Hong Kong stock listing; not a used-market benchmark. Confirm hardware revision, warranty, freight and duty."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s19-xp-141",
          "name": "S19 XP · 141 TH/s",
          "hashrateTH": 141,
          "powerW": 3031.5,
          "efficiency": 21.5,
          "availability": "sourcing",
          "dimensionsMM": [
            400,
            195.5,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/8906244096409-S19-XP-Specifications"
            }
          ],
          "market": {
            "observations": [],
            "note": "Manufacturer-rated at 141 TH/s and 3031.5 W. Confirm the exact hashrate bin when requesting a quote."
          },
          "protonQuote": null,
          "specNote": "Manufacturer-rated at 141 TH/s and 3031.5 W. Confirm the exact hashrate bin when requesting a quote."
        },
        {
          "id": "s19j-pro-plus-120",
          "name": "S19j Pro+ · 120 TH/s",
          "hashrateTH": 120,
          "powerW": 3300,
          "efficiency": 27.5,
          "availability": "sourcing",
          "dimensionsMM": [
            400,
            195,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/18416393681945-S19j-Pro-Specifications"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "s19-pro-110",
          "name": "S19 Pro · 110 TH/s",
          "hashrateTH": 110,
          "powerW": 3250,
          "efficiency": 29.5,
          "availability": "sourcing",
          "dimensionsMM": [
            370,
            195.5,
            290
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/900000261726-S19-Pro-Specifications"
            }
          ],
          "market": {
            "observations": [],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        }
      ]
    },
    {
      "id": "s19-hydro",
      "name": "Antminer S19 XP Hyd.",
      "maker": "Bitmain",
      "cooling": "hydro",
      "modelKey": "s19-hydro",
      "renderNote": "Exterior preview: the S19 XP Hyd. envelope is manufacturer-published; detailed hoses and connections are a hydro-family reconstruction rather than a verified exact batch layout.",
      "description": "Prior-generation liquid-cooled ASIC; exact bin and coolant requirements must match the quoted unit.",
      "variants": [
        {
          "id": "s19-xp-hyd-257",
          "name": "S19 XP Hyd. · 257 TH/s",
          "hashrateTH": 257,
          "powerW": 5346,
          "efficiency": 20.8,
          "availability": "sourcing",
          "dimensionsMM": [
            410,
            170,
            209
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/36035119865113-Bitcoin-Miner-S19-XP-Hyd-Specifications"
            }
          ],
          "market": {
            "observations": [],
            "note": "Manufacturer-rated at 257 TH/s and 5346 W. Confirm the supplied batch and external cooling requirements."
          },
          "protonQuote": null,
          "specNote": "Manufacturer-rated at 257 TH/s and 5346 W. Confirm the supplied batch and external cooling requirements."
        }
      ]
    },
    {
      "id": "whatsminer-air",
      "name": "WhatsMiner M70S",
      "maker": "MicroBT",
      "cooling": "air",
      "modelKey": "whatsminer-air",
      "description": "MicroBT air-cooled miners with inline fans. Select the exact hashrate bin for specifications and pricing.",
      "variants": [
        {
          "id": "m70s-248",
          "name": "M70S · 248 TH/s",
          "hashrateTH": 248,
          "powerW": 3348,
          "efficiency": 13.5,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/79?skuId=190"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/79?skuId=190",
                "usd": 3224,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 248,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Flash price $3224; regular $3472. Delivery within seven days after full payment; freight, duty, destination and taxes not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m70-220",
          "name": "M70 · 220 TH/s",
          "hashrateTH": 220,
          "powerW": 3190,
          "efficiency": 14.5,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/78?skuId=189"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/78?skuId=189",
                "usd": 2420,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 220,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Flash price $2420; regular $2640. Delivery within seven days after full payment; confirm warehouse and additional costs."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m60s-plusplus-218",
          "name": "M60S++ · 218 TH/s",
          "hashrateTH": 218,
          "powerW": 3379,
          "efficiency": 15.5,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/74?skuId=169"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/74?skuId=169",
                "usd": 2180,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 218,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m60s-plus-200",
          "name": "M60S+ · 200 TH/s",
          "hashrateTH": 200,
          "powerW": null,
          "efficiency": 17,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/71?skuId=154"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/71?skuId=154",
                "usd": 3200,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 200,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m60s-188",
          "name": "M60S · 188 TH/s",
          "hashrateTH": 188,
          "powerW": 3478,
          "efficiency": 18.5,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/66?skuId=188"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/66?skuId=188",
                "usd": 1692,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 188,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "This 188 TH/s configuration is listed at $1,692. The category’s $1,656 starting price applies to 184 TH/s. Ships within seven days after full payment; confirm freight, duty and tax."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m60-160",
          "name": "M60 · 160 TH/s",
          "hashrateTH": 160,
          "powerW": null,
          "efficiency": 19.9,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/65?skuId=166"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/65?skuId=166",
                "usd": 1280,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 160,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m50s-plusplus-160",
          "name": "M50S++ · 160 TH/s · 21 J/TH",
          "hashrateTH": 160,
          "powerW": 3360,
          "efficiency": 21,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/56?skuId=186"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/56?skuId=186",
                "usd": 1840,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 160,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "This listing applies to 160 TH/s at 21 J/TH. The separate 22 J/TH configurations require their own matched quotes."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m50s-124",
          "name": "M50S · 124 TH/s",
          "hashrateTH": 124,
          "powerW": 3224,
          "efficiency": 26,
          "availability": "sourcing",
          "dimensionsMM": [
            430,
            155,
            226
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/54?skuId=175"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/54?skuId=175",
                "usd": 744,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 124,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m30s-plusplus",
          "name": "M30S++ · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": 31,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/52?skuId=139"
            }
          ],
          "market": {
            "observations": [],
            "note": "The manufacturer lists 102–104 TH/s bins. Confirm the exact bin and its current price before comparing quotes."
          },
          "protonQuote": null,
          "specNote": "The manufacturer lists 102–104 TH/s bins. Confirm the exact bin and its current price before comparing quotes."
        }
      ]
    },
    {
      "id": "whatsminer-hydro",
      "name": "WhatsMiner M73",
      "maker": "MicroBT",
      "cooling": "hydro",
      "modelKey": "whatsminer-hydro",
      "renderNote": "Exterior preview follows the current manufacturer's M73 listing image, which reuses an M63-family rack photograph. Revision-specific details and rear coolant connections need confirmation.",
      "description": "Rack-format hydro hardware, distinct from compact Bitmain units. Dimensions include handles where stated.",
      "variants": [
        {
          "id": "m73-512",
          "name": "M73 · 512 TH/s",
          "hashrateTH": 512,
          "powerW": 7424,
          "efficiency": 14.5,
          "availability": "sourcing",
          "dimensionsMM": [
            663,
            483,
            86
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/80?skuId=191"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/80?skuId=191",
                "usd": 6144,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 512,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Manufacturer dimensions are 86 × 483 × 663 mm including the handle, shown here in L × W × H order. The external cooling loop is separate."
          },
          "protonQuote": null,
          "specNote": "Manufacturer dimensions are 86 × 483 × 663 mm including the handle, shown here in L × W × H order. The external cooling loop is separate."
        },
        {
          "id": "m63s-plusplus-464",
          "name": "M63S++ · 464 TH/s",
          "hashrateTH": 464,
          "powerW": 7192,
          "efficiency": 15.5,
          "availability": "sourcing",
          "dimensionsMM": [
            663,
            483,
            86
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/75?skuId=170"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/75?skuId=170",
                "usd": 4640,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 464,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot page says contact us to buy; no confirmed allocation."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m63s-408",
          "name": "M63S · 408 TH/s",
          "hashrateTH": 408,
          "powerW": null,
          "efficiency": 18,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/67?skuId=132"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/67?skuId=132",
                "usd": 3672,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 408,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "m63-372",
          "name": "M63 · 372 TH/s",
          "hashrateTH": 372,
          "powerW": null,
          "efficiency": 19.9,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/57?skuId=112"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/57?skuId=112",
                "usd": 2976,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 372,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        }
      ]
    },
    {
      "id": "whatsminer-immersion",
      "name": "WhatsMiner M66S",
      "maker": "MicroBT",
      "cooling": "immersion",
      "modelKey": "whatsminer-immersion",
      "description": "Purpose-built immersion variants; baths, fluid, heat rejection and site works are separate from miner prices.",
      "variants": [
        {
          "id": "m66s-286",
          "name": "M66S · 286 TH/s",
          "hashrateTH": 286,
          "powerW": 5291,
          "efficiency": 18.5,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/69?skuId=148"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/69?skuId=148",
                "usd": 2574,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 286,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "A separate 290 TH/s bin is also listed. Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels. Confirm orientation and the exact bin."
          },
          "protonQuote": null,
          "specNote": "A separate 290 TH/s bin is also listed. Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels. Confirm orientation and the exact bin."
        },
        {
          "id": "m66-276",
          "name": "M66 · 276 TH/s",
          "hashrateTH": 276,
          "powerW": 5492.4,
          "efficiency": 19.9,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.whatsminer.com/products/details/68?skuId=134"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "MicroBT official shop",
                "url": "https://shop.whatsminer.com/products/details/68?skuId=134",
                "usd": 2208,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 276,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Manufacturer spot listing. Confirm warehouse, quantity, freight, import duty and tax; one-year direct-purchase warranty subject to terms."
              }
            ],
            "note": "Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels. Confirm orientation before planning installation."
          },
          "protonQuote": null,
          "specNote": "Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels. Confirm orientation before planning installation."
        },
        {
          "id": "m66s-plus",
          "name": "M66S+ · up to 318 TH/s",
          "hashrateTH": 318,
          "powerW": null,
          "efficiency": 17,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-launch-ceiling-not-confirmed-bin",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.whatsminer.com/src/views/news_detail.html?id=284&title=MicroBT+Unveiled+WhatsMiner+M6XS++Series+and+Leads+in+Green+Mining"
            }
          ],
          "market": {
            "observations": [],
            "note": "Published maximum hashrate, not a confirmed available bin. Exact power and price require a quote. Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels."
          },
          "protonQuote": null,
          "specNote": "Published maximum hashrate, not a confirmed available bin. Exact power and price require a quote. Manufacturer dimensions are 267.5 × 147 × 401 mm including the handle, without reliable axis labels."
        },
        {
          "id": "m66s-plusplus",
          "name": "M66S++ · up to 356 TH/s",
          "hashrateTH": 356,
          "powerW": null,
          "efficiency": 15.5,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-launch-ceiling-not-confirmed-bin",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.whatsminer.com/src/views/news_detail.html?id=288&title=Lead+Great+and+Green+Mining+Forward+%7C+MicroBT+Unveils+New-Gen+WhatsMiner+M6XS+++Series+at+Bitcoin+MENA+2024"
            },
            {
              "label": "Manufacturer dimensions excluding handle",
              "url": "https://support.whatsminer.com/en-US/article/663?title=What+operations+need+to+be+completed+before+hydro-cooling+miner+are+put+into+a+cabinet"
            }
          ],
          "market": {
            "observations": [],
            "note": "Published maximum hashrate is 356 TH/s; available bins require confirmation. Dimensions excluding the handle are listed as 267.5 × 147 × 369 mm. Confirm exact power, price and complete dimensions."
          },
          "protonQuote": null,
          "specNote": "Published maximum hashrate is 356 TH/s; available bins require confirmation. Dimensions excluding the handle are listed as 267.5 × 147 × 369 mm. Confirm exact power, price and complete dimensions."
        },
        {
          "id": "m56s-plusplus",
          "name": "M56S++ · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://support.whatsminer.com/en-US/article/486?title=WhatsMiner%C3%82%C2%A0Immersion+Cooling%C3%82%C2%A0Miner_Operation%C3%82%C2%A0Guide"
            }
          ],
          "market": {
            "observations": [],
            "note": "The manufacturer confirms this model family. Exact hashrate, power and efficiency require confirmation for the quoted unit."
          },
          "protonQuote": null,
          "specNote": "The manufacturer confirms this model family. Exact hashrate, power and efficiency require confirmation for the quoted unit."
        }
      ]
    },
    {
      "id": "avalon-a15",
      "name": "Avalon A15 Pro",
      "maker": "Canaan",
      "cooling": "air",
      "modelKey": "avalon-a15",
      "description": "Compact Avalon air chassis; request exact specifications and availability for older A14 and A15 models.",
      "variants": [
        {
          "id": "a15-pro-221",
          "name": "A15 Pro · 221 TH/s",
          "hashrateTH": 221,
          "powerW": 3662,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": [
            301,
            192,
            292
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/avalon-miner-a15pro-221t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a15pro-221t",
                "usd": 1944.8,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 221,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "Canaan publishes 221 TH/s and 3662 W, but its listed 16.8 J/TH is inconsistent with those figures. Efficiency requires confirmation against the supplied unit."
          },
          "protonQuote": null,
          "specNote": "Canaan publishes 221 TH/s and 3662 W, but its listed 16.8 J/TH is inconsistent with those figures. Efficiency requires confirmation against the supplied unit."
        },
        {
          "id": "a15-pro-plus-240",
          "name": "A15 Pro+ · 240 TH/s",
          "hashrateTH": 240,
          "powerW": 3720,
          "efficiency": 15.5,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/",
                "usd": 2280,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 240,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "Listed in the manufacturer’s spot catalog. Confirm the exact product revision and shipment availability."
          },
          "protonQuote": null,
          "specNote": "Listed in the manufacturer’s spot catalog. Confirm the exact product revision and shipment availability."
        },
        {
          "id": "a15-xp-209",
          "name": "A15 XP · 209 TH/s",
          "hashrateTH": 209,
          "powerW": null,
          "efficiency": 17.8,
          "availability": "sourcing",
          "dimensionsMM": [
            301,
            192,
            292
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/"
            },
            {
              "label": "Manufacturer family page",
              "url": "https://www.canaan.io/miner/A15/"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/",
                "usd": 1421.2,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 209,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "The manufacturer’s category page lists 3720 W, while its A15 family page lists 3667 W. Exact power requires confirmation against the supplied unit."
          },
          "protonQuote": null,
          "specNote": "The manufacturer’s category page lists 3720 W, while its A15 family page lists 3667 W. Exact power requires confirmation against the supplied unit."
        },
        {
          "id": "a1566",
          "name": "A1566 · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer A15 family",
              "url": "https://www.canaan.io/miner/A15/"
            }
          ],
          "market": {
            "observations": [],
            "note": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
          },
          "protonQuote": null,
          "specNote": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
        },
        {
          "id": "a1466",
          "name": "A1466 · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer A14 family",
              "url": "https://www.canaan.io/miner/A14/"
            }
          ],
          "market": {
            "observations": [],
            "note": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
          },
          "protonQuote": null,
          "specNote": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
        },
        {
          "id": "a1446",
          "name": "A1446 · confirm bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [
            {
              "label": "Manufacturer A14 family",
              "url": "https://www.canaan.io/miner/A14/"
            }
          ],
          "market": {
            "observations": [],
            "note": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
          },
          "protonQuote": null,
          "specNote": "Available to request. Exact hashrate, power, efficiency and current price require confirmation for the supplied unit."
        },
        {
          "id": "a14-xp-154",
          "name": "A14 XP · 154 TH/s",
          "hashrateTH": 154,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/",
                "usd": 836,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 154,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "The manufacturer lists 154 TH/s, 3500 W and 21.5 J/TH, but these figures are inconsistent. Power and efficiency require confirmation against the exact specification."
          },
          "protonQuote": null,
          "specNote": "The manufacturer lists 154 TH/s, 3500 W and 21.5 J/TH, but these figures are inconsistent. Power and efficiency require confirmation against the exact specification."
        }
      ]
    },
    {
      "id": "avalon-a16",
      "name": "Avalon A16 XP",
      "maker": "Canaan",
      "cooling": "air",
      "modelKey": "avalon-a16",
      "description": "Latest published Avalon air family; product sold-out status takes precedence over category promotional badges.",
      "variants": [
        {
          "id": "a16-xp-300",
          "name": "A16 XP · 300 TH/s",
          "hashrateTH": 300,
          "powerW": 3850,
          "efficiency": 12.8,
          "availability": "preorder",
          "dimensionsMM": [
            366,
            213,
            300
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/avalon-miner-a16xp-300t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a16xp-300t",
                "usd": 4800,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 300,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "The category labels this a future batch; the product shows Sold Out and shipping from Q2 2026. Confirm current availability. Price excludes shipping, customs and tax."
              }
            ],
            "note": "Published future-batch listing; no verified immediately available allocation."
          },
          "protonQuote": null,
          "specNote": "Published future-batch listing; no verified immediately available allocation."
        },
        {
          "id": "a16-282",
          "name": "A16 · 282 TH/s",
          "hashrateTH": 282,
          "powerW": 3900,
          "efficiency": 13.8,
          "availability": "preorder",
          "dimensionsMM": [
            366,
            213,
            300
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/avalon-miner-a16-282t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a16-282t",
                "usd": 3666,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 282,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "The category labels this a future batch; the product shows Sold Out. Its May 2026 shipping date does not establish current stock."
              }
            ],
            "note": "Published future-batch listing; availability must be confirmed."
          },
          "protonQuote": null,
          "specNote": "Published future-batch listing; availability must be confirmed."
        }
      ]
    },
    {
      "id": "avalon-immersion",
      "name": "Avalon A1566I",
      "maker": "Canaan",
      "cooling": "immersion",
      "modelKey": "avalon-immersion",
      "description": "Immersion models need compatible site equipment; benchmark covers miners alone.",
      "variants": [
        {
          "id": "a1566i-270",
          "name": "A1566I · 270 TH/s",
          "hashrateTH": 270,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": [
            292.5,
            171.5,
            301
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/avalon-miner-a1566i-270t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a1566i-270t",
                "usd": 1674,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 270,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "The product shows Sold Out while the category lists spot availability. Hardware price only; confirm actual stock and shipping."
              }
            ],
            "note": "The manufacturer’s product page lists 4500 W, while its category page lists 4959 W and 17.8 J/TH. Power and efficiency require nameplate confirmation. The displayed 301 mm height is the upper end of its published 281–301 mm range."
          },
          "protonQuote": null,
          "specNote": "The manufacturer’s product page lists 4500 W, while its category page lists 4959 W and 17.8 J/TH. Power and efficiency require nameplate confirmation. The displayed 301 mm height is the upper end of its published 281–301 mm range."
        },
        {
          "id": "a1566i-261",
          "name": "A1566I · 261 TH/s requested bin",
          "hashrateTH": null,
          "powerW": null,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "confirm-exact-bin",
          "sources": [],
          "market": {
            "observations": [],
            "note": "The 261 TH/s configuration is available to request. Power, efficiency and current price require confirmation against the exact unit."
          },
          "protonQuote": null,
          "specNote": "The 261 TH/s configuration is available to request. Power, efficiency and current price require confirmation against the exact unit."
        },
        {
          "id": "a1366i-119",
          "name": "A1366I · 119 TH/s",
          "hashrateTH": 119,
          "powerW": 3570,
          "efficiency": 30,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://shop.canaan.io/products/"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/",
                "usd": 357,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 119,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        }
      ]
    },
    {
      "id": "sealminer-hydro",
      "name": "SEALMINER A3 Pro Hydro",
      "maker": "Bitdeer",
      "cooling": "hydro",
      "modelKey": "sealminer-hydro",
      "description": "Bitdeer 2U hydro family; published specifications differ by exact generation and bin.",
      "variants": [
        {
          "id": "seal-a3-pro-hyd-660",
          "name": "A3 Pro Hydro · 660 TH/s",
          "hashrateTH": 660,
          "powerW": 8250,
          "efficiency": 12.5,
          "availability": "sourcing",
          "dimensionsMM": [
            665,
            482,
            86
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/product/P260225000004"
            },
            {
              "label": "Bitdeer dimensional specification image",
              "url": "https://file.bitdeer.com/bd-public-prod/shop/202606/75523602-97e8-4568-a109-ecb991508f8b.png"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Bitdeer official shop",
                "url": "https://www.bitdeer.com/shop/product/P260225000004",
                "usd": 9900,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 660,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Regular price $9,900. The conditional $9,478 coupon price is not assumed available. Ships within seven business days after full payment. Freight, duty and tax are excluded; 365-day manufacturer warranty."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "seal-a3-hyd-500",
          "name": "A3 Hydro · 500 TH/s",
          "hashrateTH": 500,
          "powerW": 6750,
          "efficiency": 13.5,
          "availability": "sourcing",
          "dimensionsMM": [
            665,
            482,
            86
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/product/P260225000003"
            },
            {
              "label": "Bitdeer dimensional specification image",
              "url": "https://file.bitdeer.com/bd-public-prod/shop/202603/a2a3af23-fa3a-40bf-be4b-cbbbf6a476f2.png"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Bitdeer official shop",
                "url": "https://www.bitdeer.com/shop/product/P260225000003",
                "usd": 6750,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 500,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "Regular price $6,750. The conditional $6,411 coupon price is not assumed available. Ships within seven business days after full payment. Freight, duty and tax are excluded."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "seal-a2-pro-hyd-500",
          "name": "A2 Pro Hydro · 500 TH/s",
          "hashrateTH": 500,
          "powerW": null,
          "efficiency": 14.9,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/allproducts/miner"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Bitdeer official shop",
                "url": "https://www.bitdeer.com/shop/allproducts/miner",
                "usd": 6500,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 500,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        }
      ]
    },
    {
      "id": "sealminer-air",
      "name": "SEALMINER A2 Pro Air",
      "maker": "Bitdeer",
      "cooling": "air",
      "modelKey": "sealminer-air",
      "description": "Existing A2 air models can be sourced as available; announced A3 air is not presented as ready stock.",
      "variants": [
        {
          "id": "seal-a2-pro-air-260",
          "name": "A2 Pro Air · 260 TH/s",
          "hashrateTH": 260,
          "powerW": 3874,
          "efficiency": 14.9,
          "availability": "sourcing",
          "dimensionsMM": [
            365,
            197,
            292
          ],
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/allproducts/miner"
            },
            {
              "label": "Bitdeer exact product specification",
              "url": "https://www.bitdeer.com/shop/product/P260105000001"
            },
            {
              "label": "Bitdeer dimensional specification image",
              "url": "https://file.bitdeer.com/bd-public-prod/shop/202603/7509d129-367c-4eb0-902c-fa6093a9a486.png"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Bitdeer official shop",
                "url": "https://www.bitdeer.com/shop/product/P260105000001",
                "usd": 3380,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 260,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "Restocking Notice shown. Regular price $3380; conditional coupon $3067 is not assumed available. Delivery, allocation and additional charges require confirmation."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Manufacturer publishes 260 TH/s, 3874 W and 14.9 J/TH. Dimensions normalized from W × D × H = 197 × 365 × 292 mm. Product shows Restocking Notice; allocation is unconfirmed."
        },
        {
          "id": "seal-a2-air-226",
          "name": "A2 Air · 226 TH/s",
          "hashrateTH": 226,
          "powerW": null,
          "efficiency": 16.5,
          "availability": "sourcing",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/allproducts/miner"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Bitdeer official shop",
                "url": "https://www.bitdeer.com/shop/allproducts/miner",
                "usd": 2892.8,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 226,
                "checkedOn": "2026-09-18",
                "availability": "sold-out",
                "scope": "hardware-only",
                "note": "Shipping, tax, duty and destination not included or not confirmed."
              }
            ],
            "note": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
          },
          "protonQuote": null,
          "specNote": "Public asking prices are dated references, not a confirmed Proton offer or delivered cost."
        },
        {
          "id": "seal-a3-air-260",
          "name": "A3 Air · 260 TH/s",
          "hashrateTH": 260,
          "powerW": 3640,
          "efficiency": 14,
          "availability": "preorder",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/product/P250617000001"
            }
          ],
          "market": {
            "observations": [],
            "note": "The manufacturer shows “Stay Tuned”; no currently orderable offer is confirmed."
          },
          "protonQuote": null,
          "specNote": "The manufacturer shows “Stay Tuned”; no currently orderable offer is confirmed."
        },
        {
          "id": "seal-a3-pro-air-290",
          "name": "A3 Pro Air · 290 TH/s",
          "hashrateTH": 290,
          "powerW": null,
          "efficiency": 12.5,
          "availability": "preorder",
          "dimensionsMM": null,
          "specVerification": "manufacturer-published",
          "sources": [
            {
              "label": "Manufacturer specification",
              "url": "https://www.bitdeer.com/shop/allproducts/miner"
            }
          ],
          "market": {
            "observations": [],
            "note": "The manufacturer shows “Stay Tuned”; no currently orderable offer is confirmed."
          },
          "protonQuote": null,
          "specNote": "The manufacturer shows “Stay Tuned”; no currently orderable offer is confirmed."
        }
      ]
    },
    {
      "id": "s21-immersion",
      "name": "Antminer S21 Imm.",
      "maker": "Bitmain",
      "cooling": "immersion",
      "modelKey": "s21-immersion",
      "description": "Purpose-built Antminer immersion chassis. Normal and high-energy settings are different operating modes of the same named model; tanks and cooling equipment are separate.",
      "variants": [
        {
          "id": "s21-imm-239",
          "name": "S21 Imm. · 239 TH/s · normal mode",
          "hashrateTH": 239,
          "powerW": 3824,
          "efficiency": 16,
          "availability": "sourcing",
          "dimensionsMM": [
            293,
            236,
            364
          ],
          "specVerification": "manufacturer-published",
          "specNote": "Normal energy mode; manufacturer dimensions include a 44 mm handle. Three-phase 380–415 V and a compatible immersion system are required.",
          "sources": [
            {
              "label": "Bitmain S21 Imm. specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/35746238371097-S21-Imm-Specifications"
            },
            {
              "label": "Bitmain official S21 Imm. installation guide",
              "url": "https://support.bitmain.com/hc/article_attachments/38095898985625"
            }
          ],
          "market": {
            "observations": [],
            "note": "No current comparable asking-price observation was verified."
          },
          "protonQuote": null
        },
        {
          "id": "s21-imm-301",
          "name": "S21 Imm. · 301 TH/s · high-energy mode",
          "hashrateTH": 301,
          "powerW": 5569,
          "efficiency": 18.5,
          "availability": "sourcing",
          "dimensionsMM": [
            293,
            236,
            364
          ],
          "specVerification": "manufacturer-published",
          "specNote": "High-energy mode of S21 Imm. hardware, not a separate inventory claim. Confirm cooling capacity and intended operating mode with the exact quoted lot.",
          "sources": [
            {
              "label": "Bitmain S21 Imm. specification",
              "url": "https://support.bitmain.com/hc/en-us/articles/35746238371097-S21-Imm-Specifications"
            },
            {
              "label": "Bitmain official S21 Imm. installation guide",
              "url": "https://support.bitmain.com/hc/article_attachments/38095898985625"
            }
          ],
          "market": {
            "observations": [],
            "note": "No current comparable asking-price observation was verified."
          },
          "protonQuote": null
        },
        {
          "id": "s21-xp-imm-300",
          "name": "S21 XP Imm. · 300 TH/s · normal mode",
          "hashrateTH": 300,
          "powerW": 4050,
          "efficiency": 13.5,
          "availability": "sourcing",
          "dimensionsMM": [
            364,
            236,
            293
          ],
          "specVerification": "manufacturer-authored-manual-mirror",
          "specNote": "Normal energy mode. The Bitmain-authored manual is accessed through a mirror; a published Bitmain purchase-contract exhibit corroborates 300 TH/s, 4050 W and 13.5 J/TH. Manual axes differ from S21 Imm.; its footnote includes a 44 mm handle. Confirm orientation and shipment revision.",
          "sources": [
            {
              "label": "Bitmain-authored manual (third-party mirror)",
              "url": "https://manuals.plus/m/e8183885c16a2d52a9593468a18f2d960124d6c3639edbffd31db28133ab785f_optim.pdf"
            },
            {
              "label": "Published Bitmain contract exhibit",
              "url": "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000827876/510ff340-46ef-4519-977a-672b92347599.pdf"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "AsicXchange",
                "url": "https://asicxchange.com/retail/asic-miners/",
                "usd": 4500,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 300,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "New S21 XP Immersion 300 TH/s listing in Hong Kong. Shipping, tax, duty, warranty and allocation require confirmation; external immersion system excluded."
              }
            ],
            "note": "Dated hardware asking-price reference, not a confirmed Proton offer or delivered total."
          },
          "protonQuote": null
        },
        {
          "id": "s21-xp-imm-380",
          "name": "S21 XP Imm. · 380 TH/s · high-energy mode",
          "hashrateTH": 380,
          "powerW": 5700,
          "efficiency": 15,
          "availability": "sourcing",
          "dimensionsMM": [
            364,
            236,
            293
          ],
          "specVerification": "manufacturer-authored-manual-mirror",
          "specNote": "High-energy mode of the 300T-10 hardware, not a separate inventory claim. Quote and facility design must confirm the intended operating mode.",
          "sources": [
            {
              "label": "Bitmain-authored manual (third-party mirror)",
              "url": "https://manuals.plus/m/e8183885c16a2d52a9593468a18f2d960124d6c3639edbffd31db28133ab785f_optim.pdf"
            }
          ],
          "market": {
            "observations": [],
            "note": "No independently matched current hardware quote for this operating-mode selection."
          },
          "protonQuote": null
        }
      ]
    },
    {
      "id": "avalon-hydro",
      "name": "Avalon A1566HA",
      "maker": "Canaan",
      "cooling": "hydro",
      "modelKey": "avalon-hydro",
      "description": "Canaan rack-format hydro miners with manufacturer-listed 500 and 460 TH/s variants. External liquid cooling and site infrastructure are separate.",
      "variants": [
        {
          "id": "a1566ha-500",
          "name": "A1566HA · 500 TH/s",
          "hashrateTH": 500,
          "powerW": 8064,
          "efficiency": null,
          "availability": "sourcing",
          "dimensionsMM": [
            556,
            482.6,
            86
          ],
          "specVerification": "manufacturer-published-conflicting-efficiency-withheld",
          "specNote": "Canaan publishes 500 TH/s and 8064 W, while its printed 16.8 J/TH does not match those nominal figures. Efficiency remains unconfirmed; verify the exact nameplate. Net dimensions are 556 × 482.6 × 86 mm.",
          "sources": [
            {
              "label": "Canaan A1566HA 500T product",
              "url": "https://shop.canaan.io/products/avalon-miner-a1566ha-500t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a1566ha-500t",
                "usd": 4000,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 500,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "China shipment; Add to Cart shown. Price excludes freight, customs and taxes. 360-day direct-purchaser warranty, with resale coverage the reseller's responsibility. Confirm allocation."
              }
            ],
            "note": "Public hardware asking price; not a Proton quote or delivered price."
          },
          "protonQuote": null
        },
        {
          "id": "a1566ha-460",
          "name": "A1566HA · 460 TH/s",
          "hashrateTH": 460,
          "powerW": 8200,
          "efficiency": 17.8,
          "availability": "sourcing",
          "dimensionsMM": [
            556,
            482.6,
            86
          ],
          "specVerification": "manufacturer-published",
          "specNote": "Manufacturer lists a December 2025 shipment date alongside a current Add to Cart control. The historical batch date does not establish immediate stock. Confirm batch and nameplate.",
          "sources": [
            {
              "label": "Canaan A1566HA 460T product",
              "url": "https://shop.canaan.io/products/avalon-miner-a1566ha-460t"
            }
          ],
          "market": {
            "observations": [
              {
                "seller": "Canaan official shop",
                "url": "https://shop.canaan.io/products/avalon-miner-a1566ha-460t",
                "usd": 3220,
                "currency": "USD",
                "condition": "new",
                "hashrateTH": 460,
                "checkedOn": "2026-09-18",
                "availability": "listed",
                "scope": "hardware-only",
                "note": "China shipment; Add to Cart shown, historical shipping date December 2025. Price excludes freight, customs and taxes. Confirm actual batch and availability."
              }
            ],
            "note": "Public hardware asking price; not a Proton quote or delivered price."
          },
          "protonQuote": null
        }
      ]
    }
  ],
  "excludedNewFamilies": [
    {
      "name": "SEALMINER A4",
      "reason": "Manufacturer saysStayTuned forA4UltraHyd886T,A4ProAir336T,A4ProHyd680T. Excluded from current-stock representation.",
      "sources": [
        {
          "label": "Manufacturer specification",
          "url": "https://www.bitdeer.com/shop/allproducts/miner"
        }
      ]
    }
  ],
  "additionalPriceEvidence": [
    {
      "seller": "AsicXchange",
      "url": "https://asicxchange.com/retail/asic-miners/",
      "usd": 1816,
      "currency": "USD",
      "condition": "used",
      "hashrateTH": 194,
      "checkedOn": "2026-09-18",
      "availability": "listed",
      "scope": "hardware-only",
      "note": "WhatsMinerM60S194T used USA listing; seller says18J/T3492W. Not comparable to new188T manufacturer SKU without exact-bin verification."
    },
    {
      "seller": "OneMiners",
      "url": "https://oneminers.com/products/antminer-s21-pro-234th-s-new-product-page",
      "usd": 1399,
      "currency": "USD",
      "condition": null,
      "hashrateTH": 234,
      "checkedOn": "2026-09-18",
      "availability": "listed",
      "scope": "hardware-only",
      "note": "Listing says In Stock and tax included. Hosting/fulfilment requirements, destination tax, condition and checkout total require confirmation. Not treated as comparable landed price.",
      "comparable": false
    }
  ],
  "sourceLimits": [
    "No supplier partnership or authorized-dealer claim verified.",
    "Public listings are not supplier quotes to Proton.",
    "Manufacturer CAD and exact internal details were not obtained; any3D exterior remains a visual reconstruction unless validated against exact factory reference.",
    "Several source pages have inconsistent power, efficiency or stock badges. Those issues are retained in notes and uncertain fields remain null."
  ]
};
  var DAY = 86400000;
  var MAX_AGE = 7;
  var OWN = Object.prototype.hasOwnProperty;

  function positive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
  function amount(value) { return positive(value) && value >= 0.01 && Number.isSafeInteger(Math.round(value * 100)); }
  function cents(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
  function day(value, fallback) {
    if (value === undefined && fallback) value = new Date();
    var stamp;
    if (value instanceof Date) stamp = value.getTime();
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      stamp = Date.parse(value + 'T00:00:00Z');
      if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return null;
    } else return null;
    if (!Number.isFinite(stamp)) return null;
    return Math.floor(stamp / DAY);
  }
  function dateText(value) { return value === null ? null : new Date(value * DAY).toISOString().slice(0, 10); }
  function findVariant(id) {
    if (typeof id !== 'string') return null;
    for (var i = 0; i < data.families.length; i++) {
      var family = data.families[i];
      for (var j = 0; j < family.variants.length; j++) {
        if (family.variants[j].id === id) return { family: family, variant: family.variants[j] };
      }
    }
    return null;
  }
  function resolve(variant) { return typeof variant === 'string' ? (findVariant(variant) || {}).variant : variant; }
  function references(observations) {
    var seen = Object.create(null);
    return observations.filter(function (o) {
      if (!o || typeof o.url !== 'string' || !/^https:\/\//.test(o.url) || seen[o.url]) return false;
      seen[o.url] = true; return true;
    }).map(function (o) { return { label: o.seller || 'Public listing', url: o.url }; });
  }
  function select(variant, currentDay, condition) {
    var observations = variant && variant.market && Array.isArray(variant.market.observations) ? variant.market.observations : [];
    var current = [], stale = [], seen = Object.create(null);
    if (!variant || !positive(variant.hashrateTH) || currentDay === null) return { current: current, stale: stale, observed: observations };
    observations.slice().sort(function (a, b) {
      var ad = day(a && a.checkedOn, false), bd = day(b && b.checkedOn, false);
      return (bd === null ? -Infinity : bd) - (ad === null ? -Infinity : ad);
    }).forEach(function (o) {
      if (!o || o.comparable === false || !amount(o.usd) || o.currency !== 'USD' || o.scope !== 'hardware-only' || o.availability !== 'listed' || o.condition !== condition || !positive(o.hashrateTH) || o.hashrateTH !== variant.hashrateTH) return;
      if (o.conditional === true || o.couponRequired === true || o.hostingRequired === true || o.taxIncluded === true) return;
      if (typeof o.url !== 'string' || !/^https:\/\//.test(o.url)) return;
      var checked = day(o.checkedOn, false);
      if (checked === null || checked > currentDay) return;
      var key = o.seller + '|' + o.url;
      if (seen[key]) return;
      seen[key] = true;
      var expires = OWN.call(o, 'expiresOn') ? day(o.expiresOn, false) : null;
      if (OWN.call(o, 'expiresOn') && expires === null) return;
      if (currentDay - checked > MAX_AGE || (expires !== null && expires < currentDay)) stale.push(o);
      else current.push(o);
    });
    return { current: current, stale: stale, observed: observations };
  }
  function marketResult(variant, currentDay, condition) {
    var found = select(variant, currentDay, condition);
    var values = found.current.map(function (o) { return cents(o.usd); }).sort(function (a, b) { return a - b; });
    var status = values.length ? 'current' : found.stale.length ? 'stale' : 'unavailable';
    var relevant = values.length ? found.current : found.stale;
    var dates = relevant.map(function (o) { return day(o.checkedOn, false); });
    var count = values.length;
    var middle = Math.floor(count / 2);
    var median = count ? cents(count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : null;
    var note = count === 1 ? 'One observed hardware asking-price reference; not a market average.' : count > 1 ? 'Median of ' + count + ' observed hardware asking-price listings; not the whole market.' : status === 'stale' ? 'Asking-price references are older than seven days or expired; refresh before comparing.' : 'No current comparable hardware asking-price reference.';
    note += ' Freight, taxes, duties, payment and brokerage fees, installation and cooling are excluded or unconfirmed.';
    return { status: status, low: count ? values[0] : null, high: count ? values[count - 1] : null, median: median, currency: 'USD', checkedOn: dates.length ? dateText(Math.min.apply(Math, dates)) : null, sources: references(relevant.length ? relevant : found.observed), scope: 'hardware-only', condition: condition, count: count, note: note };
  }
  function marketFor(variant, date) {
    variant = resolve(variant);
    return marketResult(variant, day(date, true), variant && variant.condition === 'used' ? 'used' : 'new');
  }
  function emptyComparison(status, note) {
    return { status: status, usd: null, percent: null, benchmarkUSD: null, currency: 'USD', scope: 'hardware-only', note: note };
  }
  function compareQuote(variant, quote, date) {
    variant = resolve(variant);
    if (!quote || quote.usd === undefined || quote.usd === null || quote.usd === '') return emptyComparison('quote-required', 'Enter an exact-variant hardware quote to compare; no Proton offer is assumed.');
    var today = day(date, true);
    if (today === null || !variant || !positive(variant.hashrateTH) || !amount(quote.usd) || quote.currency !== 'USD' || quote.scope !== 'hardware-only' || (quote.condition !== 'new' && quote.condition !== 'used') || !positive(quote.hashrateTH) || quote.hashrateTH !== variant.hashrateTH) return emptyComparison('not-comparable', 'Match the exact hashrate bin, condition, USD currency and hardware-only scope. Unknown or invalid values cannot be compared.');
    if (OWN.call(quote, 'checkedOn')) {
      var quoteDay = day(quote.checkedOn, false);
      if (quoteDay === null || quoteDay > today) return emptyComparison('not-comparable', 'A future or invalid quote date cannot support a current comparison.');
      if (today - quoteDay > MAX_AGE) return emptyComparison('stale', 'The entered quote needs a fresh check.');
    }
    if (OWN.call(quote, 'expiresOn')) {
      var quoteExpiry = day(quote.expiresOn, false);
      if (quoteExpiry === null) return emptyComparison('not-comparable', 'Quote expiry must be a valid date.');
      if (quoteExpiry < today) return emptyComparison('stale', 'The entered quote has expired.');
    }
    var result = marketResult(variant, today, quote.condition);
    if (result.status === 'stale') return emptyComparison('stale', result.note);
    if (result.status !== 'current') return emptyComparison('not-comparable', result.note);
    var difference = cents(result.median - cents(quote.usd));
    return { status: 'current', usd: difference, percent: cents(difference / result.median * 100), benchmarkUSD: result.median, currency: 'USD', scope: 'hardware-only', checkedOn: result.checkedOn, sources: result.sources, count: result.count, note: 'Hardware reference difference only against ' + (result.count === 1 ? 'one observed asking-price listing' : 'the median of ' + result.count + ' observed asking-price listings') + '. A negative amount means the entered quote costs more. This is not total delivered savings; freight, taxes, duties and fees remain separate.' };
  }
  function savingsFor(variant, date) {
    variant = resolve(variant);
    var quote = variant && variant.protonQuote;
    if (!quote || quote.confirmed !== true || quote.comparable !== true) return emptyComparison('quote-required', 'Confirmed comparable Proton quote needed. No discount or savings is assumed.');
    var today = day(date, true);
    var checked = day(quote.checkedOn, false);
    var expires = day(quote.expiresOn, false);
    if (today === null || checked === null || expires === null || checked > today || expires < checked) return emptyComparison('not-comparable', 'The Proton quote needs a valid check date and expiry; future-dated evidence cannot establish current savings.');
    if (expires < today || today - checked > MAX_AGE) return emptyComparison('stale', 'The confirmed Proton quote has expired or needs refreshing.');
    return compareQuote(variant, quote, date);
  }
  return { checkedOn: data.checkedOn, families: data.families, pricingPolicy: data.pricingPolicy, excludedNewFamilies: data.excludedNewFamilies, findVariant: findVariant, marketFor: marketFor, savingsFor: savingsFor, compareQuote: compareQuote };
}));


