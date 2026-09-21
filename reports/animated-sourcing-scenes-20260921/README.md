# Populated and animated sourcing illustrations

The Energy Sites illustration now has 24 ASICs in six racks: two rows of three racks, with four machines per rack and an aisle between the rows. Modeled PDU strips and cabling connect the installation. The original generator, transformer, switchgear and orange frame remain.

Both sourcing widgets now use the original geometry in live Three.js scenes. The homepage's two wind turbines rotate. The capital scene animates 48 ASIC intake fans and two generator cooling fans. Both have a traveling power pulse and short orange arcs above transformer terminals. Arcs fade in and out over 0.95 seconds once every 5.4 seconds rather than flashing rapidly.

## Runtime

- `site/sourcing-capital.js` and `site/sourcing-discovery.js` are the single sources for both the live models and fallback posters. They replace the former export-only models under `tools/sourcing-scenes/`.
- `site/sourcing-stage.js` batches static geometry by material while keeping rotors independently animated. Rendering is capped at 30 fps and 2× pixel density.
- `site/sourcing-preview.js` loads the stage and the relevant model only when the widget enters view and motion is permitted. Rendering stops offscreen, when the page is hidden, or when paused. A compact icon provides pause/play without adding vertical space.
- Reduced-motion settings use the still image without creating a WebGL context. Failed or lost graphics contexts also reveal the poster. The decorative canvas does not receive pointer events, so touch scrolling remains native.
- All four JavaScript dependencies are included in the normal asset-stamp mechanism. Transparent responsive posters retain the 2.4:1 aspect ratio, preventing a layout jump when animation starts.

Run `node tools/render-original-sourcing-posters.cjs` to regenerate the 960/1920 px stills from the same model modules. The exporter uses existing local Playwright, Chrome and Sharp installations and blocks external resources.

## Verification

The full marketing-site suite passed. `node tests/sourcing-preview-browser.cjs` passed 15 check groups covering actual moving canvas frames, pause/resume, GPU suspension offscreen, context-loss fallback, reduced motion, unavailable WebGL, responsive copy and layout at 390 and 1440 px. There were no uncaught page errors, missing local assets or write requests. Browser evidence is retained locally beside this report. All release generators were rerun with the cache stamper last.
