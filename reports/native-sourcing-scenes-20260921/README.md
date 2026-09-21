# Sourcing previews from the website's native 3D scenes

The homepage and Energy Sites preview images now come directly from the website's existing Three.js renderers. The previous AI-generated pictures are no longer referenced by either page.

- Globe: `hosting-globe-scene.js` / `globe-surface.js`, the same terrain, geography, markers, materials and `hosting-stage.js` lighting as the Hosting globe. Framed as a complete sphere with North America in view.
- Infrastructure: `mountMineScene` and `buildPresentation('site')` in `mine-builder-scene.js`, using `scene-site.js`. The actual gas plant, electrical gear, four containers and X-ray rack interiors retain the production materials, authored camera angle and lighting; framing is tightened for an illustration without callouts.
- Output: transparent WebP stills at 960 and 1920 px wide. The globe is 2.4:1, the equipment scene 3:1. No background rectangle, replacement geometry, image generation, new live WebGL instance or mobile gesture handler.
- Reproducible export: `node tools/render-sourcing-posters.cjs`, using existing Playwright/Chrome and Sharp; paths can be supplied through `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `SHARP_MODULE`. The export serves only local site files and blocks external requests.
- Geography and terrain attribution is retained in a compact, keyboard-accessible Image credits disclosure; closed state adds no height.

Asset paths: `site/assets/visuals/sourcing-globe-native-960.webp`, `sourcing-globe-native-1920.webp`, `sourcing-infrastructure-native-960.webp`, and `sourcing-infrastructure-native-1920.webp`. They contain alpha transparency. Both previews remain visible on desktop and mobile. Existing live interactive scenes and page copy are unchanged.

Browser verification covered 320, 390, 768, 1440 and 1920 px, high-density image selection, image decoding, horizontal overflow, and the open/closed credit disclosure. No page errors, missing assets or HTTP writes. At 390 px the globe occupies 133 px vertically and the site preview 107 px. Browser screenshots and audit output are retained locally beside this report.

The full site test suite passed, including the existing 3D scene, hosting, calculator, hardware, checkout and responsive-copy checks. All generators were rerun with the cache stamper last.
