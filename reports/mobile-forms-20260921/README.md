# Mobile builder and calculator review

Verified the generated website at 320, 390, 430 and 1440 CSS pixels using Chromium. The test serves an immutable in-memory snapshot over a local GET/HEAD-only server. Coinbase and network-difficulty requests are intercepted with fixed BTC $87,003 and difficulty 132.76T fixtures; no external request or HTTP write reaches a remote service. Screenshots suppress the sticky navigation only during image capture so it cannot cover the widgets.

## Results

- 47/47 browser checks pass; no runtime errors, missing local assets, external requests or HTTP writes.
- All eight page/viewport combinations fit their viewport.
- Input fonts are at least 16px and visible interactive controls are at least 44px high when the mobile forms are expanded, including custom checkbox labels. Native selects retain their arrow affordance.
- All original input/select/button IDs remain. Previously visible desktop fields remain visible.
- Default estimates match the baseline at identical market inputs. `calc-engine.js`, `mine-builder-model.js`, `miner-db.js` and `price-list.js` are byte-identical to baseline.

### Height at 390px

| View | Before | After |
| --- | ---: | ---: |
| Builder, initial open configuration | 2,043px | 1,540px |
| Calculator, main input sections expanded | 2,601px | 1,833px |
| Calculator, default input view | 316px | 677px |

The builder is 24.6% shorter. The calculator starts with machine controls open now; the old initial view had every section closed. Opening its main sections now uses 29.5% less height, with specifications and replacement settings available in nested disclosures. Desktop calculator height remains 1,270px.

## Interaction coverage

At both 320px and 390px:

- Calculator default disclosure state, visible/updating summary values, touch and keyboard disclosure activation, model/count/rate updates, URL synchronization, copied-scenario reload with identical results, energy-mode capacity derivation, shared energy scenarios, custom machine specification access, replacement settings, optional tax fields and reset.
- Builder MW/slider synchronization, machine selection and specifications, source/cooling/rate changes, gas and machine-count sizing, disabled irrelevant inputs, invalid hidden capacity isolation, invalid infrastructure and overhead disclosure, invalid-estimate blocking, configured calculator-link carryover, reset preserving edited market data, production-detail disclosure and fetched/edited market status.

No physical iOS device was tested. Mobile Chromium uses touch-capable contexts and native page interactions.

## Evidence and rerun

- `baseline/checks.json`: clean-HEAD baseline metrics, default outputs and engine/data hashes.
- `after/checks.json`: final measurements and interaction results.
- `after/builder-{320,390,430,1440}.png` and `after/calculator-{320,390,430,1440}.png`: focused widget screenshots.
- `after/calculator-*-expanded.png`: main input sections opened.

Run `node tests/mobile-forms-browser.cjs` from this checkout. To recreate a baseline before committing, set `MOBILE_FORMS_PHASE=baseline`; modified tracked site files are read from HEAD for that baseline snapshot.
