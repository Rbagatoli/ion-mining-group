/**
 * Original editorial composition: working power infrastructure beside a future
 * mining bay. This is purpose-built geometry, not a capture of a website scene.
 * Dimensions are illustrative; no specific facility or equipment is depicted.
 */
export function buildCapitalScene(T) {
  const root = new T.Group();
  root.name = 'Original power assets and remaining build';
  const standard = (color, roughness, metalness, extra = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const m = {
    shell: standard(0xb8b7b4, .26, .95), frame: standard(0x686765, .29, .9),
    rib: standard(0x8e8d8a, .28, .94), silver: standard(0xcdccc8, .22, .96),
    dark: standard(0x111112, .72, .25), orange: standard(0xe77c10, .3, .74),
    slab: standard(0x29292a, .87, .2), edge: standard(0x555452, .43, .82),
    rubber: standard(0x161719, .85, .05), porcelain: standard(0x999994, .36, .45),
    glass: standard(0x080d10, .22, .25),
    glow: standard(0xf7931a, .32, .65, { emissive: 0xf7931a, emissiveIntensity: .6 }),
    warm: standard(0xffca76, .28, .5, { emissive: 0xf7931a, emissiveIntensity: 1.1 }),
  };
  const add = (geo, mat, x, y, z, parent = root) => {
    const mesh = new T.Mesh(geo, mat); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (w, h, d, mat, x, y, z, parent = root) => add(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
  function bevel(w, h, d, mat, x, y, z, r = .04, parent = root) {
    r = Math.min(r, w / 5, h / 5, d / 5);
    const shape = new T.Shape();
    shape.moveTo(-w / 2 + r, -h / 2 + r); shape.lineTo(w / 2 - r, -h / 2 + r);
    shape.lineTo(w / 2 - r, h / 2 - r); shape.lineTo(-w / 2 + r, h / 2 - r); shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth: d - r * 2, steps: 1, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 1 });
    geometry.translate(0, 0, -d / 2 + r);
    return add(geometry, mat, x, y, z, parent);
  }
  function cylinder(radius, length, mat, x, y, z, axis = 'y', parent = root, segments = 24) {
    const mesh = add(new T.CylinderGeometry(radius, radius, length, segments), mat, x, y, z, parent);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  function bar(a, b, radius, mat, parent = root) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), direction = end.clone().sub(start);
    const mesh = add(new T.CylinderGeometry(radius, radius, direction.length(), 12), mat, ...start.clone().add(end).multiplyScalar(.5).toArray(), parent);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); return mesh;
  }
  function pipe(points, radius, mat, parent = root) {
    const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'centripetal');
    return add(new T.TubeGeometry(path, points.length * 10, radius, 10, false), mat, 0, 0, 0, parent);
  }
  function ring(radius, tube, mat, x, y, z, rotation = null, parent = root) {
    const mesh = add(new T.TorusGeometry(radius, tube, 6, 32), mat, x, y, z, parent);
    if (rotation) mesh.rotation.set(...rotation); return mesh;
  }
  const bolt = (x, y, z, parent = root) => cylinder(.028, .026, m.silver, x, y, z, 'z', parent, 6);

  // Two foundations share a datum, but the future bay exposes its supports.
  bevel(6.65, .23, 5.15, m.slab, -3.27, .115, 0, .065);
  bevel(6.0, .19, 5.15, m.slab, 3.25, .095, 0, .05);
  bevel(6.68, .055, .08, m.edge, -3.27, .15, 2.58, .015);
  bevel(5.98, .05, .065, m.edge, 3.25, .115, 2.58, .015);
  for (const x of [-6.36, -.18]) {
    for (const z of [-2.28, 2.28]) {
      cylinder(.045, .025, m.silver, x, .245, z);
      ring(.07, .009, m.dark, x, .26, z, [Math.PI / 2, 0, 0]);
    }
  }

  // Original low gas-generator housing; stepped panels and exposed louvers.
  const gx = -3.7, gz = -.88;
  for (const x of [gx - 1.63, gx + 1.63]) {
    bevel(.29, .21, 2.30, m.frame, x, .37, gz, .035);
    for (const z of [gz - .83, gz + .83]) cylinder(.067, .025, m.silver, x, .49, z);
  }
  bevel(4.03, .26, 2.20, m.frame, gx, .55, gz, .05);
  bevel(3.86, 2.28, 2.08, m.shell, gx, 1.80, gz, .065);
  bevel(3.99, .13, 2.20, m.silver, gx, 2.985, gz, .03);
  bevel(3.70, .105, 1.92, m.rib, gx, 3.10, gz, .025);
  // Large dark radiator grille on the right end, fully modeled fins.
  box(.023, 1.83, 1.69, m.dark, gx + 1.938, 1.85, gz);
  for (let j = 0; j < 20; j++) {
    const fin = box(.035, .049, 1.62, m.rib, gx + 1.965, 1.02 + j * .088, gz);
    fin.rotation.z = -.17;
  }
  for (const z of [gz - .81, gz + .81]) box(.055, 1.77, .045, m.frame, gx + 1.967, 1.85, z);
  // Front face combines two service doors and a smaller intake panel.
  const front = gz + 1.055;
  for (let j = 0; j < 2; j++) {
    const x = gx - 1.22 + j * 1.17;
    bevel(1.10, 1.95, .038, m.rib, x, 1.84, front, .008);
    bevel(1.01, 1.84, .027, m.shell, x, 1.84, front + .023, .007);
    bevel(.057, .27, .08, m.dark, x + .34, 1.78, front + .09, .016);
    for (const y of [1.18, 2.49]) box(.06, .13, .07, m.silver, x - .49, y, front + .057);
    for (const bx of [x - .45, x + .45]) for (const y of [.99, 2.69]) bolt(bx, y, front + .048);
  }
  box(.99, 1.43, .025, m.dark, gx + 1.14, 1.92, front + .013);
  for (let j = 0; j < 14; j++) {
    const fin = box(.94, .057, .045, m.frame, gx + 1.14, 1.31 + j * .094, front + .043);
    fin.rotation.x = -.23;
  }
  // Narrow orange status strip is inset into the face, never a painted toy body.
  box(.42, .035, .018, m.glow, gx + 1.14, 2.78, front + .048);
  for (const x of [gx - 1.68, gx + 1.66]) for (const y of [.84, 2.76]) bolt(x, y, front + .043);
  // Twin roof fan assemblies, visible through concentric machined guards.
  for (const x of [gx - .98, gx + .12]) {
    cylinder(.405, .063, m.dark, x, 3.185, gz - .18);
    cylinder(.105, .046, m.frame, x, 3.221, gz - .18);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, blade = bevel(.22, .018, .15, m.rib, x + Math.sin(a) * .24, 3.218, gz - .18 + Math.cos(a) * .24, .009);
      blade.rotation.y = a + .7;
    }
    for (const r of [.16, .24, .32, .397]) ring(r, .012, m.silver, x, 3.257, gz - .18, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * i / 4; bar([x - Math.cos(a) * .40, 3.26, gz - .18 - Math.sin(a) * .40], [x + Math.cos(a) * .40, 3.26, gz - .18 + Math.sin(a) * .40], .009, m.frame);
    }
  }
  // Exhaust with heat shield rings and rain cap, grounded in the generator roof.
  cylinder(.112, .50, m.frame, gx + 1.35, 3.34, gz - .57);
  cylinder(.166, .30, m.rib, gx + 1.35, 3.50, gz - .57);
  for (const y of [3.37, 3.43, 3.49, 3.55, 3.61]) ring(.17, .012, m.silver, gx + 1.35, y, gz - .57, [Math.PI / 2, 0, 0]);
  cylinder(.115, .17, m.silver, gx + 1.35, 3.73, gz - .57);
  cylinder(.215, .038, m.frame, gx + 1.35, 3.837, gz - .57);

  // Compact distribution transformer, with deep fins and three insulated taps.
  const tx = -2.20, tz = 1.55;
  bevel(1.84, .17, 1.27, m.frame, tx, .345, tz, .035);
  bevel(1.30, 1.18, .85, m.rib, tx, 1.01, tz, .05);
  bevel(1.43, .12, 1.02, m.silver, tx, 1.63, tz, .025);
  for (let i = 0; i < 12; i++) {
    const x = tx - .59 + i * .107;
    bevel(.042, 1.06, .20, m.shell, x, .98, tz + .505, .012);
    bevel(.042, 1.06, .16, m.shell, x, .98, tz - .482, .012);
  }
  for (const x of [tx - .75, tx + .75]) {
    pipe([[x, .61, tz - .25], [x, .60, tz + .40], [x, 1.29, tz + .40], [x, 1.42, tz + .20]], .045, m.frame);
  }
  for (const x of [tx - .44, tx, tx + .44]) {
    cylinder(.084, .37, m.porcelain, x, 1.895, tz);
    for (let k = 0; k < 5; k++) cylinder(.127 - k * .007, .034, m.porcelain, x, 1.76 + k * .062, tz);
    cylinder(.042, .11, m.silver, x, 2.12, tz);
  }
  // One high-voltage feed is routed behind the generator; no floating cables.
  pipe([[tx + .44, 2.165, tz], [tx + .80, 2.26, tz], [tx + .95, 2.02, tz - .47], [tx + .84, 1.11, .69], [-1.63, .65, .54]], .034, m.rubber);
  for (const x of [tx - .66, tx + .66]) for (const z of [tz - .48, tz + .48]) cylinder(.042, .027, m.silver, x, .445, z);

  // Front-left switchgear: clear handles, meters, cable glands, recessed plinth.
  const sx = -5.25, sz = 1.62;
  bevel(1.64, .13, .84, m.frame, sx, .34, sz, .025);
  bevel(1.50, 1.57, .64, m.shell, sx, 1.18, sz, .037);
  for (const x of [sx - .365, sx + .365]) {
    bevel(.69, 1.44, .032, m.rib, x, 1.18, sz + .339, .008);
    bevel(.62, 1.37, .018, m.shell, x, 1.18, sz + .360, .006);
    box(.23, .14, .02, m.glass, x, 1.60, sz + .386);
    box(.13, .012, .008, m.glow, x, 1.594, sz + .400);
    bevel(.04, .21, .053, m.dark, x + .17, 1.18, sz + .407, .009);
    for (let j = 0; j < 5; j++) box(.39, .024, .022, m.frame, x, .68 + j * .06, sz + .380);
    cylinder(.025, .017, m.warm, x - .12, 1.41, sz + .395, 'z');
    for (const y of [.63, 1.74]) bolt(x - .255, y, sz + .390);
  }
  pipe([[-5.25, .47, 1.96], [-5.25, .43, 2.16], [-4.45, .37, 2.26], [-3.36, .37, 2.26]], .035, m.rubber);

  // Cable trench physically ties the existing plant to the next stage of work.
  bevel(5.35, .067, .25, m.dark, .25, .265, 2.03, .022);
  for (let j = 0; j < 33; j++) box(.084, .025, .25, m.rib, -2.30 + j * .16, .306, 2.03);
  pipe([[-1.49, .43, 1.73], [-1.35, .42, 2.03], [-.70, .345, 2.03], [2.40, .345, 2.03], [2.75, .39, 1.87]], .021, m.glow);

  // Proposed bay: machined base shoes plus a restrained orange structural outline.
  const x0 = .76, x1 = 5.98, z0 = -2.18, z1 = 1.63, y0 = .31, y1 = 3.20;
  for (const x of [x0, x1]) for (const z of [z0, z1]) {
    bevel(.34, .09, .34, m.frame, x, .265, z, .027);
    for (const dx of [-.103, .103]) for (const dz of [-.103, .103]) cylinder(.024, .027, m.silver, x + dx, .326, z + dz, 'y', root, 6);
    box(.052, y1 - y0, .052, m.orange, x, (y0 + y1) / 2, z);
  }
  for (const y of [y0, y1]) {
    for (const z of [z0, z1]) box(x1 - x0, .053, .053, m.orange, (x0 + x1) / 2, y, z);
    for (const x of [x0, x1]) box(.053, .053, z1 - z0, m.orange, x, y, (z0 + z1) / 2);
  }
  // Two roof supports and an open partial floor show volume without a heavy box.
  for (const x of [2.49, 4.24]) {
    box(.031, .035, z1 - z0, m.orange, x, y1, (z0 + z1) / 2);
    box(.07, .11, z1 - z0, m.frame, x, .365, (z0 + z1) / 2);
  }
  for (const z of [-1.64, -.94, -.24, .46, 1.16]) box(x1 - x0 - .08, .03, .027, m.edge, (x0 + x1) / 2, .342, z);
  // Partial front-frame opening defines a future accessible aisle.
  box(.036, 1.62, .036, m.orange, 2.45, 1.14, z1);
  box(1.67, .036, .036, m.orange, 1.61, 1.95, z1);

  // A first rack in the future bay: a handful of machines, not a completed mine.
  const rx = 5.11, rz = -.20;
  for (const x of [rx - .54, rx + .54]) for (const z of [rz - .48, rz + .48]) bevel(.067, 2.16, .067, m.frame, x, 1.52, z, .008);
  for (const y of [.47, 1.10, 1.73, 2.59]) {
    bevel(1.17, .053, 1.07, m.rib, rx, y, rz, .011);
    box(1.18, .08, .055, m.silver, rx, y, rz + .54);
  }
  function miner(x, y, z) {
    bevel(.89, .46, .83, m.shell, x, y, z, .025);
    bevel(.92, .49, .068, m.frame, x, y, z + .44, .015);
    for (let i = 0; i < 9; i++) box(.016, .415, .014, m.rib, x - .36 + i * .09, y, z - .423);
    for (const dx of [-.222, .222]) {
      cylinder(.167, .034, m.dark, x + dx, y, z + .490, 'z');
      cylinder(.044, .025, m.rib, x + dx, y, z + .517, 'z');
      for (const radius of [.075, .119, .162]) ring(radius, .008, m.silver, x + dx, y, z + .528);
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 4;
        bar([x + dx - Math.cos(a) * .168, y - Math.sin(a) * .168, z + .530], [x + dx + Math.cos(a) * .168, y + Math.sin(a) * .168, z + .530], .006, m.frame);
      }
    }
    bevel(.42, .075, .49, m.silver, x, y + .255, z - .05, .012);
    box(.056, .018, .023, m.warm, x + .343, y + .153, z + .493);
  }
  miner(rx, .765, rz); miner(rx, 1.395, rz);
  // The final shelf remains empty; orange rear uprights imply unfinished build.
  for (const x of [rx - .54, rx + .54]) box(.024, .77, .024, m.orange, x, 2.16, rz - .49);
  for (let j = 0; j < 7; j++) box(.024, .05, .98, m.rib, rx - .43 + j * .14, 1.762, rz);
  pipe([[rx + .55, .52, rz + .16], [rx + .67, .39, rz + .63], [4.30, .365, 1.01], [3.10, .37, 1.18]], .036, m.rubber);
  // Empty expansion pads keep the expected work legible at small sizes.
  for (const x of [1.40, 2.16, 2.92, 3.68]) {
    bevel(.27, .065, .32, m.frame, x, .265, -1.44, .022);
    cylinder(.035, .041, m.orange, x, .317, -1.44);
  }

  root.userData.editorial = 'Existing generation and electrical distribution, with an unfinished mining bay';
  return root;
}
