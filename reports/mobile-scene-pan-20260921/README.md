# Mobile 3D scene movement

The scroll-friendly mobile preview handler intercepted OrbitControls touches
but implemented only horizontal rotation and pinch distance. It omitted the
two-finger midpoint movement, so visitors could not reposition the scene.

The shared preview now applies the existing screen-space pan calculation to
that midpoint. Camera and rotation center move together; pinch still changes
distance. Gesture state resets when contacts change, cancel, leave or suspend.
This applies to the Home, Energy Partners and Hosting rendering widgets.

Mobile controls:

- One finger sideways rotates the scene.
- One finger vertically scrolls the page.
- Two fingers move the scene; pinch changes zoom.

Desktop controls and the full-touch mine builder retain their existing behavior.
The short on-screen hint fits narrow phones, and the canvas's accessible label
has the full instructions. The shared dependency URL and generated page stamps
are updated so returning visitors fetch the fix.

Validation includes 55 shared scene checks, 26 presentation checks and the full
website suite. Real Chromium touch events test Home at 390px and 320px plus
Energy Partners and Hosting at 390px: panning without rotation or zoom,
pinching without browser zoom, one-finger scrolling and rotation, partial
release, cancellation, subsequent gesture recovery and hint/layout bounds.
The browser test uses a local GET-only server, a read-only camera probe and
fresh contexts; external requests and submissions are blocked. No physical
iPhone test is claimed. See `checks.json`; screenshots are local review aids.

Only the three shared scene/control files implement behavior changes. HTML
changes are generated cache stamps. This release excludes the separate,
unpublished CRM review-guidance candidate.
