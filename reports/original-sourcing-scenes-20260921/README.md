# Original sourcing widget renderings

Two independently authored Three.js compositions replace the reused globe and mine-yard captures in the homepage and Energy Sites widgets.

- **Discovery:** a fictional contoured landscape, a gas collection skid with three separation vessels and a manifold, an electrical site with switchgear and transformer, and two tapered wind turbines. A thick orange locator and orange pad perimeter select the gas candidate. Terrain, contour lines, equipment, markers and routes are new procedural geometry.
- **Capital:** an original generator housing with service doors, louvers, roof fans and exhaust; a finned distribution transformer; metered switchgear; and a cable trench leading to an unfinished orange mining bay with one partial equipment rack. Solid platinum equipment and the open orange volume distinguish existing infrastructure from remaining construction.

The scenes share the site's Three.js dependency, platinum/orange material family, ACES tone mapping and room-reflection lighting language. They do not import any existing globe, mine-yard or hardware model builders. The landscape is illustrative, not a map of a real property. Neither composition uses external imagery or texture assets, so the replaced globe's geography credit disclosure is removed from this widget. Interactive globe credits elsewhere are unchanged.

## Reproduce

Run `node tools/render-original-sourcing-posters.cjs`. Original geometry lives in `tools/sourcing-scenes/discovery.js` and `capital.js`. The exporter uses already installed Playwright, Chrome and Sharp, with optional `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `SHARP_MODULE` overrides. It serves local inputs only and rejects external requests and HTTP writes.

Camera framing uses projected model vertices rather than empty bounding-box corners. Each composition is exported as a transparent WebP at 960 × 400 and 1920 × 800. Responsive image selection keeps the two previews visible on desktop and mobile without loading another live WebGL scene or adding touch gestures. The 960 px discovery image is 39,426 bytes; capital is 62,042 bytes.

## Verification

Both widgets were inspected in the actual pages at 390 px and 1440 px. Automated browser checks covered 320, 390, 768, 1440 and 1920 px: images decoded, retained readable framing, selected suitable high-density sources, and caused no horizontal overflow, page errors or missing local assets. The images occupy 133 px vertically on a 390 px phone. Local screenshots and audit JSON are retained alongside this report, outside the commit.

The full marketing-site test suite passed, including existing 3D scenes, responsive copy, hosting, hardware, checkout and deployment checks. All release generators were rerun with the asset stamper last. Other HTML pages change only their shared cache stamp.
