# Sourcing illustration quality and desktop visibility

Replaced the homepage's map illustration and Energy Sites' infrastructure illustration with detailed platinum/orange CGI-style editorial imagery. Both now display at every screen width. They are conceptual static images, not an interactive map, proof of a site's existing assets or an available energy offer.

The built-in image-generation tool produced the images. The exact final prompts are saved in `prompts.json` alongside this report. The generated PNG originals remain in the Codex generated-images directory; optimized project assets are:

- `site/assets/visuals/sourcing-map-960.webp` — 960 × 320, 47,640 bytes.
- `site/assets/visuals/sourcing-map-1920.webp` — 1920 × 640, 161,454 bytes.
- `site/assets/visuals/sourcing-infrastructure-960.webp` — 960 × 323, 41,422 bytes.
- `site/assets/visuals/sourcing-infrastructure-1920.webp` — 1920 × 645, 131,706 bytes.

Responsive source selection retains sharpness without loading full-size PNGs. Explicit dimensions reserve space. The homepage illustration loads lazily; the hero illustration loads normally. Small top/bottom edge fades blend the image backgrounds into the page, preserving the subject. No new WebGL context, script or gesture handler is added. Existing interactive 3D scenes are unchanged.

The energy brief uses two readable columns on desktop and phones, with one column in the narrow two-panel tablet layout. Existing desktop/mobile copy and the three separate explanatory flow diagrams remain unchanged.

Validation: full site suite passed. The final edge-fade CSS also passed cascade and mobile-layout checks. Browser captures at 320, 390, 768, 1440 and 1920 px confirmed both images visible, decoded, sharp at high pixel density, and free of horizontal overflow. No browser errors, missing assets or HTTP writes. Both 390 px images deliver 3 source pixels per CSS pixel. The complete generator pass was rerun with the asset stamper last. Browser evidence and a local reproduction script are retained in this directory; screenshots and raw audits are local artifacts rather than public site assets.
