# Mobile 3D vertical rotation regression

The existing mobile gesture path rotated sideways but treated vertical movement as page scrolling. The updated browser regression reproduced the user's issue before the production fix: horizontal rotation passed, then upward rotation failed because the polar angle did not change.

After the fix, **40/40 native Chromium touch checks passed** across Home, Energy Partners and Hosting at 390px, plus Home at 320px.

Verified behavior:

- A one-finger horizontal drag changes azimuth; upward and downward drags change elevation in opposite directions; diagonal drags change both axes.
- All single-finger rotations preserve the target and camera distance, with no page scrolling, pointer cancellation or browser zoom.
- Two-finger drags translate camera and target together without rotating or zooming. Pinch changes model zoom, not browser zoom.
- Vertical gestures starting outside the canvas scroll the page without moving the camera.
- Releasing one finger after a two-finger gesture does not jump into rotation or selection. Cancelled gestures recover normally.
- The updated `Drag to rotate · Two fingers move/zoom` hint fits the 320px and 390px layouts. Both Home screenshots were visually inspected.

For a 40px vertical gesture, the recorded polar-angle change was approximately 11.0 degrees at 390px and 13.8 degrees at 320px, with the reverse gesture restoring the prior elevation. Every canvas rotation recorded zero page-scroll movement.

`checks.json` contains the full before/after camera metrics and check results. There were no page errors, missing assets, blocked external requests or non-GET requests. The harness uses a local GET-only server, a read-only camera probe and Chromium CDP native touch input; it does not submit forms or modify site data.

Run from this checkout:

```powershell
node tests/mobile-scene-pan-browser.cjs
```

This is Chromium mobile emulation, not a physical iPhone/Safari test.

Additional release checks: all 56 shared 3D scene checks and 26 presentation UI checks passed; the complete `node tests/site/run.js` suite passed, including the assembled deployment tree and snapshots. Independent code review found no blocking issues. The generated marketing asset stamp is `e7b882f1`; desktop mouse controls are unchanged.
