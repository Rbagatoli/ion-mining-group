# Homepage energy-site miniatures

Replaces the single mixed sourcing landscape with eight original animated models: landfill gas, flare gas, hydro, nuclear, wind, solar, industrial surplus and grid supply. Existing energy labels select each facility; the visible carousel advances every 11 seconds. Its dimensions and the surrounding copy are preserved.

Landfill includes a moving refuse truck and collection wells. Hydro includes a dam, flowing spillways and a cutaway turbine. Nuclear includes a containment dome, cooling loop and cooling-tower vapour. Wind blades, solar tracking panels, industrial ventilation and power-flow pulses animate within their respective scenes. These are illustrative miniatures, not specific available properties.

One WebGL renderer, environment and canvas are reused across all scenes. Static geometry is batched by material; old model geometry and effects are disposed on selection. Rendering and automatic advancement stop offscreen or in a hidden tab. Reduced motion and WebGL failure retain selectable per-facility posters. There are no corner pause/play controls.

Validation completed before release:

- `node tools/render-energy-site-miniatures.cjs`: all eight transparent posters at 960 and 1920 pixels, rendered from the production scene runtime and visually reviewed.
- `node tests/energy-site-miniatures-browser.cjs`: all eight live choices, canvas/context reuse, rapid selection, automatic advancement, offscreen suspension, 320/390/1440-pixel layout, reduced motion and WebGL fallback; no browser errors or missing assets.
- `node tests/sourcing-preview-browser.cjs`: homepage and capital-widget motion, offscreen suspension, responsive copy, context-loss fallback and unavailable-WebGL fallback; all 15 check groups passed.
- `node tests/site/run.js`: full marketing-site suite passed, including generated assets, deployment assembly and scene snapshots.
- Full production generator sequence with asset stamping last; `git diff --check` passed.

Local screenshots and detailed JSON audits are kept beside this note but excluded from the commit. Reproduce posters with the rendering command above; reproduce browser audits after `node tools/build-pages.js`.
