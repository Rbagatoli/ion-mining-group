/**
 * Original editorial composition: working power infrastructure beside a future
 * mining bay. This is purpose-built geometry, not a capture of a website scene.
 * Dimensions are illustrative; no specific facility or equipment is depicted.
 */
export function buildCapitalScene(T) {
  const root = new T.Group();
  root.name = 'Original power infrastructure and populated mining bay';
  const rotors = [];
  let minerCount = 0;
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

  // Each fan is one moving mesh. Guards remain in the static geometry batch.
  const rotorGeometry = new Map();
  function spinningFan(radius, x, y, z, axis, phase, speed) {
    const key = radius + ':' + axis;
    let geometry = rotorGeometry.get(key);
    if (!geometry) {
      const parts = [], blade = new T.Shape();
      blade.moveTo(radius * .17, -radius * .09);
      blade.bezierCurveTo(radius * .36, -radius * .24, radius * .63, -radius * .40, radius * .91, -radius * .30);
      blade.quadraticCurveTo(radius * 1.01, -radius * .11, radius * .91, radius * .08);
      blade.bezierCurveTo(radius * .66, radius * .10, radius * .46, radius * .16, radius * .23, radius * .11);
      blade.closePath();
      const depth = radius * .065;
      for (let i = 0; i < 7; i++) {
        const piece = new T.ExtrudeGeometry(blade, { depth, steps: 1, bevelEnabled: false, curveSegments: 3 });
        piece.translate(0, 0, -depth / 2); piece.rotateZ(i * Math.PI * 2 / 7); parts.push(piece);
      }
      const hub = new T.CylinderGeometry(radius * .24, radius * .24, depth * 2, 16);
      hub.rotateX(Math.PI / 2); parts.push(hub);
      const positions = [], normals = [];
      for (const source of parts) {
        const flat = source.index ? source.toNonIndexed() : source;
        positions.push(...flat.getAttribute('position').array);
        normals.push(...flat.getAttribute('normal').array);
        if (flat !== source) flat.dispose(); source.dispose();
      }
      geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      if (axis === 'y') geometry.rotateX(-Math.PI / 2);
      rotorGeometry.set(key, geometry);
    }
    const node = add(geometry, m.rib, x, y, z);
    node.name = axis === 'y' ? 'Generator cooling rotor' : 'ASIC intake rotor';
    node.userData.sourcingDynamic = true;
    node.rotation[axis] = phase;
    // Static housings receive shadows; tiny moving blades do not need shadow passes.
    node.castShadow = false;
    rotors.push({ node, axis, speed, phase });
    return node;
  }

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
    spinningFan(.372, x, 3.232, gz - .18, 'y', rotors.length * .57, 5.1 + rotors.length * .35);
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

  // Six full racks: two rows, a clear central aisle, and four ASICs per rack.
  function miner(x, y, z) {
    minerCount++;
    bevel(.89, .46, .83, m.shell, x, y, z, .025);
    bevel(.92, .49, .068, m.frame, x, y, z + .44, .015);
    for (let i = 0; i < 9; i++) box(.016, .415, .014, m.rib, x - .36 + i * .09, y, z - .423);
    for (const dx of [-.222, .222]) {
      cylinder(.167, .034, m.dark, x + dx, y, z + .490, 'z');
      spinningFan(.153, x + dx, y, z + .516, 'z', (minerCount * .63 + dx * 2.1) % (Math.PI * 2), 6.8 + (minerCount % 4) * .43);
      for (const radius of [.084, .126, .162]) ring(radius, .006, m.silver, x + dx, y, z + .532);
      for (let j = 0; j < 3; j++) {
        const a = j * Math.PI / 3;
        bar([x + dx - Math.cos(a) * .168, y - Math.sin(a) * .168, z + .530], [x + dx + Math.cos(a) * .168, y + Math.sin(a) * .168, z + .530], .006, m.frame);
      }
    }
    bevel(.42, .075, .49, m.silver, x, y + .255, z - .05, .012);
    box(.056, .018, .023, m.warm, x + .343, y + .153, z + .493);
  }
  for (const rz of [-1.42, .71]) for (const rx of [1.58, 3.36, 5.14]) {
    for (const x of [rx - .54, rx + .54]) for (const z of [rz - .48, rz + .48]) {
      bevel(.067, 2.64, .067, m.frame, x, 1.765, z, .008);
      bevel(.16, .056, .17, m.silver, x, .433, z, .009);
    }
    for (const y of [.47, 1.10, 1.73, 2.36, 3.025]) {
      bevel(1.17, .043, 1.07, m.rib, rx, y, rz, .009);
      box(1.18, .065, .045, m.silver, rx, y, rz + .54);
    }
    // Repeated fan faces stay exposed toward the viewer; power runs down the back.
    for (const y of [.765, 1.395, 2.025, 2.655]) miner(rx, y, rz);
    bevel(.082, 2.29, .074, m.dark, rx + .58, 1.63, rz - .43, .012);
    for (const y of [.72, 1.35, 1.98, 2.61]) {
      box(.019, .028, .013, m.glow, rx + .624, y, rz - .389);
      pipe([[rx + .39, y + .05, rz - .425], [rx + .49, y + .12, rz - .50], [rx + .59, y, rz - .47]], .016, m.rubber);
    }
    pipe([[rx + .58, .50, rz - .43], [rx + .66, .385, rz - .43], [rx + .66, .375, -.36]], .027, m.rubber);
  }
  // Recessed cable tray travels through the aisle and joins the front feed.
  bevel(4.87, .06, .19, m.dark, 3.32, .368, -.36, .018);
  for (let i = 0; i < 29; i++) box(.063, .018, .17, m.rib, .96 + i * .167, .407, -.36);
  pipe([[2.75, .39, 1.87], [2.77, .39, 1.41], [2.76, .408, .13], [3.02, .414, -.36], [5.62, .414, -.36]], .017, m.glow);

  root.userData.editorial = 'Existing generation and electrical distribution powering a populated mining bay';
  root.userData.minerCount = minerCount;
  root.userData.motion = {
    rotors,
    terminals: [[tx - .44, 2.185, tz], [tx, 2.185, tz], [tx + .44, 2.185, tz]],
    flowPath: [[-1.49, .46, 1.73], [-1.35, .455, 2.03], [-.70, .38, 2.03], [2.40, .38, 2.03], [2.75, .425, 1.87], [2.77, .425, 1.41], [2.76, .443, .13], [3.02, .449, -.36], [5.62, .449, -.36]],
  };
  return root;
}
