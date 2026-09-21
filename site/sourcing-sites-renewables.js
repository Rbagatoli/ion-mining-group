/* Original wind and solar miniatures. Geometry is shared only through mechanical kit parts. */

function cable(K, points, count = 3, speed = .2) {
  K.pipe(points, .036, K.m.orange);
  K.flow(points, { count, speed, radius: .046 });
}

function consolidatePanel(T, bank) {
  // Track a complete detailed panel with a handful of draws, not one per cell wire.
  const buckets = new Map();
  for (const part of [...bank.children]) {
    part.updateMatrix();
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    if (!buckets.has(part.material)) buckets.set(part.material, []);
    buckets.get(part.material).push(geometry);
    bank.remove(part);
    part.geometry.dispose();
  }
  for (const [material, parts] of buckets) {
    const geometry = new T.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const length = parts.reduce((n, part) => n + part.attributes[name].array.length, 0);
      const values = new Float32Array(length);
      let offset = 0;
      for (const part of parts) { values.set(part.attributes[name].array, offset); offset += part.attributes[name].array.length; }
      geometry.setAttribute(name, new T.BufferAttribute(values, 3));
    }
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    bank.add(mesh);
    parts.forEach(part => part.dispose());
  }
}

function turbine(T, K, x, z, height, radius, speed, phase) {
  const { m } = K;
  const g = K.group(x, .10, z);
  K.cyl(.29, .14, m.frame, 0, .07, 0, g);
  K.cyl(.20, .09, m.silver, 0, .17, 0, g);
  K.cyl(.14, height - .22, m.shell, 0, (height + .22) / 2, 0, g, 'y', .079);
  for (const y of [height * .34, height * .67]) K.cyl(.123 - y * .013, .014, m.frame, 0, y, 0, g);
  // Small access hatch, flange studs and service ladder give the tower scale.
  K.box(.085, .20, .021, m.rib, 0, .35, .13, g, .008);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    K.cyl(.017, .038, m.silver, Math.cos(a) * .225, .16, Math.sin(a) * .225, g);
  }
  K.box(.35, .27, .73, m.shell, 0, height, -.10, g, .058);
  K.box(.28, .045, .53, m.silver, 0, height + .15, -.10, g, .014);
  for (let i = 0; i < 5; i++) K.box(.014, .14, .02, m.frame, -.10 + i * .05, height, -.478, g, .002);
  K.rod([-.08, height + .16, -.31], [-.08, height + .31, -.31], .01, m.rib, g);
  K.rod([-.15, height + .27, -.31], [.02, height + .27, -.31], .008, m.rib, g);
  K.cyl(.13, .13, m.frame, 0, height, .31, g, 'z');
  const rotor = K.group(0, height, .405, g, true);
  K.cyl(.14, .12, m.silver, 0, 0, 0, rotor, 'z', .105);
  K.mesh(new T.SphereGeometry(.13, 16, 10), m.shell, 0, 0, .09, rotor).scale.set(1, 1, .8);
  // Tapered, swept airfoils, rather than rectangular fan blades.
  const bladeShape = new T.Shape();
  bladeShape.moveTo(-.060, .11);
  bladeShape.bezierCurveTo(-.135, .28, -.120, .55, -.073, .78);
  bladeShape.bezierCurveTo(-.047, .97, -.022, 1.16, .009, 1.24);
  bladeShape.quadraticCurveTo(.030, 1.27, .045, 1.22);
  bladeShape.bezierCurveTo(.108, .95, .155, .60, .115, .33);
  bladeShape.quadraticCurveTo(.093, .17, .043, .11);
  bladeShape.closePath();
  const bladeGeometry = new T.ExtrudeGeometry(bladeShape, { depth: .021, bevelEnabled: true, bevelSegments: 2, bevelSize: .009, bevelThickness: .007, steps: 1, curveSegments: 12 });
  bladeGeometry.scale(radius / 1.25, radius / 1.25, 1);
  for (let i = 0; i < 3; i++) {
    const blade = K.mesh(bladeGeometry, m.silver, 0, 0, .015, rotor);
    blade.rotation.z = i * Math.PI * 2 / 3;
  }
  K.rotor(rotor, 'z', speed, phase);
  return { x, z, height };
}

export function buildWindScene(T, K) {
  const { m } = K;
  K.pad();
  // A low, gently folded terrain tile keeps the turbines readable at phone width.
  const terrain = new T.PlaneGeometry(13.75, 5.96, 52, 26);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, .033 + .10 * Math.pow(Math.sin(x * .35 + .7) * Math.cos(z * .60), 2));
  }
  terrain.computeVertexNormals();
  K.mesh(terrain, m.earth);
  const towers = [
    turbine(T, K, -4.75, -.70, 2.85, 1.12, .46, .15),
    turbine(T, K, -.68, -1.05, 3.04, 1.21, .38, 1.70),
    turbine(T, K, 3.42, -.84, 2.65, 1.09, .43, .75)
  ];
  // Maintenance road links the control hut and the collection substation.
  K.box(12.9, .024, .51, m.road, 0, .15, 2.24, K.root, .02);
  for (let i = 0; i < 17; i++) K.box(.22, .005, .026, m.rib, -6.03 + i * .75, .164, 2.24, K.root, .001);
  K.box(2.22, .09, 1.38, m.frame, -4.42, .15, 1.08);
  K.powerhouse(-4.42, .20, 1.05, { w: 1.75, h: .89, d: 1.05 });
  K.box(1.58, .022, .58, m.dark, -4.42, 1.152, 1.05);
  for (let i = 0; i < 6; i++) K.box(.015, .012, .52, m.rib, -5.06 + i * .256, 1.17, 1.05, K.root, .002);
  K.transformer(4.46, .16, 1.01, .79);
  K.cabinet(5.54, .19, .96, .55, .83);
  for (const tower of towers) {
    const route = [[tower.x, .17, tower.z + .17], [tower.x, .17, .30], [tower.x + .28, .17, .55], [3.70, .17, .55], [4.13, .22, .78]];
    cable(K, route, 3, .12);
  }
  cable(K, [[4.9, .19, 1.1], [5.45, .19, 1.1], [5.88, .19, 1.47], [6.45, .19, 1.47]], 2, .27);
  // Concrete inspection covers make the orange collection route an intentional cutaway.
  for (const x of [-2.65, 1.38, 3.67]) K.box(.27, .025, .22, m.rib, x, .145, .55, K.root, .02);
  return K.root;
}

function panelBank(T, K, x, z, index, cellMaterials) {
  const { m } = K;
  for (const dx of [-.83, .83]) {
    K.box(.25, .07, .66, m.pad, x + dx, .045, z);
    K.rod([x + dx, .08, z - .33], [x + dx, .58, z], .037, m.frame);
    K.rod([x + dx, .08, z + .33], [x + dx, .58, z], .037, m.frame);
  }
  K.rod([x - 1.03, .58, z], [x + 1.03, .58, z], .048, m.silver);
  const bank = K.group(x, .60, z, K.root, true);
  K.box(2.20, .068, 1.22, m.silver, 0, 0, 0, bank, .012);
  K.box(2.12, .031, 1.14, m.dark, 0, .048, 0, bank, .007);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const cx = -.878 + col * .351, cz = -.369 + row * .369;
      K.box(.334, .012, .347, cellMaterials[(row + col + index) % cellMaterials.length], cx, .071, cz, bank, .004);
      K.box(.005, .003, .327, m.rib, cx - .078, .079, cz, bank, .0005);
      K.box(.005, .003, .327, m.rib, cx + .078, .079, cz, bank, .0005);
    }
  }
  for (const sx of [-1.05, 1.05]) for (const sz of [-.53, .53]) K.cyl(.018, .014, m.frame, sx, .075, sz, bank);
  consolidatePanel(T, bank);
  // The whole panel and its frame track together; fixed legs remain on the ground.
  bank.rotation.x = .28;
  K.motion.updates.push(time => { bank.rotation.x = .28 + Math.sin(time * .11 + index * .09) * .025; });
  return bank;
}

export function buildSolarScene(T, K) {
  const { m } = K;
  K.pad();
  K.box(13.75, .025, 5.96, m.earth, 0, .018, 0, K.root, .016);
  K.box(.62, .025, 5.76, m.road, 3.19, .042, 0, K.root, .008);
  const cellMaterials = [0x173241, 0x203d49, 0x294451].map(color => new T.MeshStandardMaterial({ color, roughness: .27, metalness: .78 }));
  const columns = [-4.98, -2.41, .16], rows = [-1.85, -.05, 1.75];
  let index = 0;
  for (const z of rows) {
    for (const x of columns) panelBank(T, K, x, z, index++, cellMaterials);
    K.box(.75, .06, .68, m.frame, 2.18, .055, z + .16);
    K.cabinet(2.18, .09, z + .13, .48, .65);
    K.box(.18, .025, .025, m.glow, 2.18, .52, z + .447, K.root, .004);
    const route = [[-5.79, .085, z + .64], [-2.35, .085, z + .64], [1.48, .085, z + .64], [1.89, .12, z + .44], [2.18, .15, z + .44]];
    cable(K, route, 4, .14);
    cable(K, [[2.41, .12, z + .32], [2.69, .09, z + .32], [2.86, .09, z + .58]], 1, .28);
  }
  K.box(2.49, .12, 2.04, m.frame, 4.80, .085, .60);
  K.transformer(4.75, .15, .57, .92);
  K.cabinet(5.76, .15, 1.05, .43, .83);
  K.powerhouse(4.85, .07, -1.61, { w: 2.07, h: .97, d: 1.07 });
  K.fan(4.85, 1.10, -1.61, .27, 'y');
  // Trench bus collects the three inverter strings before voltage conversion.
  cable(K, [[2.86, .09, -1.27], [2.86, .09, .50], [2.86, .09, 2.35], [3.52, .09, 2.55], [4.33, .09, 2.55], [4.33, .19, 1.50]], 4, .15);
  cable(K, [[5.14, .17, 1.03], [5.65, .17, 1.35], [6.39, .15, 1.35], [6.55, .15, 1.10]], 2, .3);
  return K.root;
}
