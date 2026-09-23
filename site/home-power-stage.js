/* Original Proton hero artwork: a cinematic power-to-compute study. All
   geometry is authored here, with no stock footage or third-party models. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './vendor/three-0.185.1/RoomEnvironment.js';

export async function mountHomePowerScene(host, {onError = () => {}} = {}) {
  let renderer, scene, environment, room, pmrem, observer;
  let disposed = false, active = false, motion = true, frame = 0, last = 0, time = 1.8;
  const geometries = new Set(), materials = new Set();
  const material = options => { const value = new T.MeshStandardMaterial(options); materials.add(value); return value; };
  const basic = options => { const value = new T.MeshBasicMaterial(options); materials.add(value); return value; };
  const geometry = value => { geometries.add(value); return value; };
  const dummy = new T.Object3D();
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    renderer?.domElement.removeEventListener('webglcontextlost', lost);
    renderer?.domElement.remove();
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    environment?.dispose(); room?.dispose(); pmrem?.dispose(); renderer?.dispose();
  }
  function lost(event) { event.preventDefault(); dispose(); onError(); }
  let camera, update;
  function draw() { if (!disposed) { update(time); renderer.render(scene, camera); } }
  function resize() {
    if (disposed || !renderer || !camera) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 1.65));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Portrait framing keeps the industrial artwork behind the lower right
    // of the headline, rather than zooming into a single anonymous surface.
    camera.fov = width < 700 ? 53 : 38;
    camera.updateProjectionMatrix();
    draw();
  }
  function tick(now) {
    frame = 0;
    if (disposed || !active || !motion) return;
    if (!last) last = now;
    const delta = (now - last) / 1000;
    if (delta >= 1 / 30) { time += Math.min(delta, .08); last = now; draw(); }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (!disposed && active && motion) frame = requestAnimationFrame(tick);
  }
  try {
    renderer = new T.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x080808, 1);
    const canvas = renderer.domElement;
    canvas.className = 'home-power-canvas'; canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', lost);
    host.append(canvas);
    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x080808, .027);
    room = new RoomEnvironment();
    pmrem = new T.PMREMGenerator(renderer);
    environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .88;
    scene.environmentRotation.set(0, .72, 0);
    room.dispose(); room = null; pmrem.dispose(); pmrem = null;
    camera = new T.PerspectiveCamera(38, 1, .1, 120);
    scene.add(new T.HemisphereLight(0xf6f3ef, 0x101010, .9));
    const key = new T.DirectionalLight(0xfff9ee, 3.2); key.position.set(-5, 14, 12); scene.add(key);
    const rim = new T.DirectionalLight(0xffffff, 3.6); rim.position.set(12, 9, -7); scene.add(rim);
    const warm = new T.PointLight(0xff991f, 95, 20, 2); warm.position.set(4.5, 2, 4); scene.add(warm);
    const edge = new T.PointLight(0xf9d5a6, 42, 16, 2); edge.position.set(12, 4, -2); scene.add(edge);

    const graphite = material({color: 0x18191a, metalness: .86, roughness: .3});
    const black = material({color: 0x070808, metalness: .66, roughness: .39});
    const silver = material({color: 0x8c9093, metalness: .92, roughness: .25});
    const platinum = material({color: 0xc2c3c2, metalness: .97, roughness: .2});
    const brushed = material({color: 0x676b6d, metalness: .91, roughness: .38});
    const amberMetal = material({color: 0xf7931a, metalness: .72, roughness: .29});
    const amber = basic({color: 0xffa12b, toneMapped: false});
    const light = basic({color: 0xffdc9f, toneMapped: false});
    const dim = basic({color: 0x965215, transparent: true, opacity: .5, toneMapped: false});
    const halo = basic({color: 0xff9b1b, transparent: true, opacity: .075, depthWrite: false,
      blending: T.AdditiveBlending, toneMapped: false});
    const cube = geometry(new T.BoxGeometry(1, 1, 1));
    function box(size, position, surface, parent = scene) {
      const mesh = new T.Mesh(cube, surface);
      mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
    }
    function instances(transforms, surface, shape = cube, parent = scene) {
      const mesh = new T.InstancedMesh(shape, surface, transforms.length);
      transforms.forEach((transform, index) => {
        dummy.position.set(...transform.position);
        dummy.scale.set(...(transform.scale || [1, 1, 1]));
        dummy.rotation.set(...(transform.rotation || [0, 0, 0]));
        dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; parent.add(mesh); return mesh;
    }
    const platform = new T.Group(); scene.add(platform);
    box([54, .34, 43], [0, -.48, -5], graphite, platform);
    const floorTiles = [], seams = [];
    for (let x = -23; x <= 23; x += 3.4) for (let z = -23; z <= 15; z += 3.4) {
      floorTiles.push({position: [x, -.26, z], scale: [3.36, .1, 3.36]});
      if (z > -9 && x > -9) seams.push({position: [x - 1.68, -.192, z], scale: [.012, .008, 3.36]});
    }
    instances(floorTiles, black, cube, platform);
    instances(seams, brushed, cube, platform);

    // Three generous parallel banks of modular compute hardware. Fine fins,
    // deep recesses and machined rails provide texture at hero scale.
    const chassis = [], rails = [], fins = [], modules = [], slots = [], indicators = [], screws = [];
    const fanCentres = [];
    const banks = [{x: 2.2, z: -1.4, height: 4.5}, {x: 5.4, z: -3.1, height: 5.5}, {x: 8.6, z: -4.8, height: 6.5}];
    for (const [index, bank] of banks.entries()) {
      const {x, z, height} = bank, width = 2.35, depth = 3.1;
      chassis.push({position: [x, height / 2, z], scale: [width, height, depth]});
      box([width + .28, .22, depth + .3], [x, .02, z], graphite);
      box([width + .16, .14, depth + .16], [x, height + .045, z], silver);
      for (const side of [-1, 1]) {
        rails.push({position: [x + side * (width / 2 - .045), height / 2, z + depth / 2 + .08], scale: [.12, height, .18]});
        for (let row = 0; row < 13 + index * 3; row++) {
          const y = .27 + row * .32;
          fins.push({position: [x + side * (width / 2 + .035), y, z], scale: [.32, .075, depth - .18]});
        }
      }
      const count = 5 + index;
      for (let row = 0; row < count; row++) {
        const y = .5 + row * .85;
        modules.push({position: [x, y, z + depth / 2 + .04], scale: [width - .28, .73, .15]});
        slots.push({position: [x, y + .26, z + depth / 2 + .122], scale: [width - .52, .05, .03]});
        indicators.push({position: [x + .7, y - .22, z + depth / 2 + .126], scale: [.21, .025, .025]});
        for (const side of [-1, 1]) {
          fanCentres.push([x + side * .43, y - .018, z + depth / 2 + .137]);
          screws.push({position: [x + side * .88, y - .22, z + depth / 2 + .15], scale: [.03, .03, .025]});
        }
      }
      // A thin, constant amber edge lets the moving energy traces meet a
      // tangible destination without introducing a large luminous panel.
      box([.035, height - .2, .025], [x + width / 2 + .012, height / 2, z + depth / 2 + .177], amber);
      box([width + .5, .012, depth + .6], [x, -.1, z], halo);
    }
    instances(chassis, black); instances(rails, platinum); instances(fins, silver);
    instances(modules, brushed); instances(slots, black); instances(indicators, amber); instances(screws, platinum);

    const ring = geometry(new T.TorusGeometry(.25, .014, 4, 26));
    const fanRingTransforms = [], innerRingTransforms = [], fanHubs = [];
    fanCentres.forEach(position => {
      fanRingTransforms.push({position});
      innerRingTransforms.push({position, scale: [.66, .66, .66]});
      fanHubs.push({position, scale: [.105, .105, .07]});
    });
    instances(fanRingTransforms, silver, ring); instances(innerRingTransforms, graphite, ring); instances(fanHubs, platinum);
    const bladeGeometry = geometry(new T.BoxGeometry(.045, .19, .014));
    const fanBlades = new T.InstancedMesh(bladeGeometry, graphite, fanCentres.length * 5); scene.add(fanBlades);

    // Platinum power busbars approach from the foreground and branch into
    // each bank. Energy segments travel along those exact three-dimensional
    // paths; no decorative dots float independently of the wiring.
    const tracks = [], busbars = [], clamps = [];
    function route(points) {
      const curve = new T.CurvePath();
      for (let i = 1; i < points.length; i++) curve.add(new T.LineCurve3(new T.Vector3(...points[i - 1]), new T.Vector3(...points[i])));
      return curve;
    }
    for (let index = 0; index < banks.length; index++) {
      const bank = banks[index];
      for (let lane = 0; lane < 3; lane++) {
        const offset = (lane - 1) * .2, side = bank.x + offset;
        const points = [[-17 + index * 1.8, -.04, 10.6 + index * .8 + offset], [-5.4 + index * 1.1, -.04, 10.6 + index * .8 + offset], [side, -.04, 5.2 + index * .8 + offset], [side, -.04, bank.z + 1.84], [side, .4, bank.z + 1.84]];
        const path = route(points);
        for (let part = 1; part < points.length; part++) {
          const from = new T.Vector3(...points[part - 1]), to = new T.Vector3(...points[part]);
          const centre = from.clone().add(to).multiplyScalar(.5), length = from.distanceTo(to);
          const bar = new T.Mesh(cube, lane === 1 ? amberMetal : brushed);
          bar.position.copy(centre); bar.scale.set(.055, .07, length);
          bar.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), to.sub(from).normalize()); scene.add(bar); busbars.push(bar);
        }
        tracks.push({path, phase: index * .18 + lane * .13, speed: .095 - index * .009});
        for (let n = 0; n < 4; n++) clamps.push({position: [side, -.05, bank.z + 2.1 + n * .62], scale: [.09, .14, .08]});
      }
    }
    instances(clamps, platinum);
    const pulseGeometry = geometry(new T.BoxGeometry(.066, .035, .2));
    const pulseGlowGeometry = geometry(new T.BoxGeometry(.21, .05, .65));
    const pulseCount = tracks.length * 9;
    const pulses = new T.InstancedMesh(pulseGeometry, light, pulseCount);
    const glows = new T.InstancedMesh(pulseGlowGeometry, halo, pulseCount);
    pulses.instanceMatrix.setUsage(T.DynamicDrawUsage); glows.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(pulses, glows);

    // A handful of square data motes rise from the equipment, echoing
    // Proton's existing pixel language without obscuring the physical forms.
    const motes = new T.InstancedMesh(cube, dim, 24); scene.add(motes);
    const vector = new T.Vector3(), tangent = new T.Vector3(), front = new T.Vector3(0, 0, 1);
    update = elapsed => {
      const portrait = camera.aspect < .85;
      camera.position.set(15.4 + Math.sin(elapsed * .11) * .35, 10.4 + Math.cos(elapsed * .13) * .16, 20.6);
      camera.lookAt(portrait ? 4.8 : -.8, portrait ? 3.4 : 1.3, -1.5);
      let index = 0;
      for (const track of tracks) for (let part = 0; part < 9; part++) {
        const position = (elapsed * track.speed + track.phase + part * .021) % 1;
        vector.copy(track.path.getPoint(position)); tangent.copy(track.path.getTangent(position));
        dummy.position.copy(vector); dummy.position.y += .05;
        dummy.quaternion.setFromUnitVectors(front, tangent.normalize());
        const weight = Math.sin(part / 8 * Math.PI) * .75 + .25;
        dummy.scale.set(weight, weight, weight); dummy.updateMatrix();
        pulses.setMatrixAt(index, dummy.matrix); glows.setMatrixAt(index++, dummy.matrix);
      }
      pulses.instanceMatrix.needsUpdate = true; glows.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 24; i++) {
        const phase = (elapsed * .028 + i * .618) % 1, scale = .018 + .036 * Math.sin(phase * Math.PI);
        dummy.position.set(2.2 + (i % 7) * 1.04 + Math.sin(i * 2.7) * .24, 3 + phase * 6.5, -5.5 + (i % 4) * 1.1);
        dummy.rotation.set(0, .4, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); motes.setMatrixAt(i, dummy.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;
      fanCentres.forEach((centre, fan) => {
        for (let blade = 0; blade < 5; blade++) {
          const angle = elapsed * 1.7 + fan * .41 + blade * Math.PI * 2 / 5;
          dummy.position.set(centre[0] + Math.sin(angle) * .125, centre[1] + Math.cos(angle) * .125, centre[2]);
          dummy.rotation.set(0, 0, -angle + .25); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          fanBlades.setMatrixAt(fan * 5 + blade, dummy.matrix);
        }
      });
      fanBlades.instanceMatrix.needsUpdate = true;
      warm.intensity = 88 + Math.sin(elapsed * .6) * 7;
    };
    resize();
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    if (disposed) throw new Error('Power scene disposed while initializing');
    draw();
    if ('ResizeObserver' in window) { observer = new ResizeObserver(resize); observer.observe(host); }
    else window.addEventListener('resize', resize);
    return {
      setActive(value) { active = !!value; sync(); },
      setMotion(value) { motion = !!value; sync(); },
      dispose
    };
  } catch (error) { dispose(); throw error; }
}
