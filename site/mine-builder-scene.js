/* Locally bundled WebGL scene. No network calls, telemetry, or economic calculations.
   The bounded representative yard keeps large fleets interactive on mobile. */
import * as THREE from './vendor/three-0.185.1/three.module.min.js';
import { OrbitControls } from './vendor/three-0.185.1/OrbitControls.js';
import { RoomEnvironment } from './vendor/three-0.185.1/RoomEnvironment.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16);
const SPHERE = new THREE.SphereGeometry(0.10, 8, 6);
const UP = new THREE.Vector3(0, 1, 0);
const RING = new THREE.TorusGeometry(1, .025, 5, 32);
const ROUND_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 32);
const OPEN_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
const DOME = new THREE.SphereGeometry(1, 24, 12);

function material(color, roughness = 0.5, metalness = 0.5, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function instances(parent, mat, parts, geometry = BOX) {
    if (!parts.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, mat, parts.length);
    const dummy = new THREE.Object3D();
    parts.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[4], p[5]);
        dummy.rotation.set(p[6] || 0, p[7] || 0, p[8] || 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
}
function lineTube(parent, points, mat, radius = 0.045) {
    const curve = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])));
    const geometry = new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 6, false);
    const mesh = new THREE.Mesh(geometry, mat); parent.add(mesh);
    return curve;
}

function palette() {
    return {
        ground: material(0x111112,.94,.08), edge: material(0x555452,.43,.82),
        frame: material(0x686765,.29,.9), shell: material(0xb8b7b4,.26,.95),
        rib: material(0x8e8d8a,.28,.94), silver: material(0xcdccc8,.22,.96),
        miner: material(0xa4a39f,.30,.92), dark: material(0x111112,.72,.25),
        copper: material(0xd67f25,.29,.82), orange: material(0xf7931a,.3,.74),
        board: material(0x353934,.65,.2), earth: material(0x373738,.88,.25),
        led: material(0xbd6817,.4,.2,{emissive:0xf7931a,emissiveIntensity:.05}),
        flow: material(0xb76a1b,.4,.6,{emissive:0xf7931a,emissiveIntensity:.05}),
        pulse: new THREE.MeshBasicMaterial({color:0xffc77e})
    };
}
function part(parent, name) {
    const group = new THREE.Group(); group.name = name; parent.add(group); return group;
}
function ring(parent, mat, x, y, z, radius, rx = 0, ry = 0) {
    const mesh = new THREE.Mesh(RING,mat);
    mesh.position.set(x,y,z); mesh.scale.setScalar(radius); mesh.rotation.set(rx,ry,0); parent.add(mesh);
}
function fan(parent, mats, x, y, z, radius, endWall = false) {
    const housing = part(parent,endWall ? 'air-exhaust' : 'dry-cooler-fan');
    housing.position.set(x,y,z); if (endWall) housing.rotation.z = Math.PI/2;
    instances(housing,mats.dark,[[0,0,0,radius,.10,radius]],CYLINDER);
    const rotor = part(housing,'rotor');
    const blades = [];
    for (let i = 0; i < 7; i++) {
        const angle = i/7*Math.PI*2;
        blades.push([Math.cos(angle)*radius*.47,.07,Math.sin(angle)*radius*.47,radius*.83,.035,radius*.18,0,-angle,0]);
    }
    instances(rotor,mats.silver,blades);
    instances(housing,mats.orange,[[0,.12,0,radius*.18,.14,radius*.18]],CYLINDER);
    for (const r of [.36,.67,.96]) ring(housing,mats.frame,0,.16,0,radius*r,Math.PI/2);
    instances(housing,mats.frame,[[0,.17,0,radius*2,.025,.025],[0,.17,0,.025,.025,radius*2]]);
    return rotor;
}

function containerUnit(mats, cooling, fill) {
    const root = new THREE.Group(), roof = part(root,'removable-roof'), wall = part(root,'service-wall');
    root.name = cooling + '-container'; root.userData.cooling = cooling;
    // Only the envelope becomes translucent. Racks, plumbing and electrical gear stay solid.
    const skinMaterials = [mats.shell,mats.rib,mats.orange].map(m => m.clone());
    const [platinum,ribMetal,orange] = skinMaterials;
    const skin = part(root,'fixed-envelope');
    const steel = [[0,.12,0,12.2,.24,2.44],[-6.04,2.66,0,.14,.14,2.56],[6.04,2.66,0,.14,.14,2.56]];
    for (const x of [-6.04,6.04]) for (const z of [-1.18,1.18]) steel.push([x,1.4,z,.14,2.6,.14]);
    for (const z of [-1.18,1.18]) for (const y of [.35,2.55]) steel.push([0,y,z,12.15,.12,.12]);
    instances(root, mats.frame, steel);
    instances(skin, platinum, [[0,1.45,-1.2,12,2.3,.08]]);
    instances(skin, platinum, [[-6.04,1.45,0,.08,2.3,2.4],[6.04,1.45,0,.08,2.3,2.4]]);
    const ribs = [];
    for (let x = -5.8; x <= 5.8; x += .28) ribs.push([x,1.45,-1.26,.045,2.25,.075]);
    instances(skin, ribMetal, ribs);
    instances(wall, platinum, [[0,1.45,1.22,12,2.3,.08]]);
    instances(wall, ribMetal, ribs.map(p => [p[0],p[1],1.28,p[3],p[4],p[5]]));
    instances(wall, platinum, [[-4.7,1.4,1.32,1.2,1.65,.07],[4.7,1.4,1.32,1.2,1.65,.07]]);
    instances(wall, orange, [[0,.39,1.33,12,.045,.045],[-4.7,2.12,1.37,.38,.055,.035],[4.7,2.12,1.37,.38,.055,.035]]);
    instances(wall, mats.silver, [[-4.2,1.4,1.36,.045,.36,.045],[5.2,1.4,1.36,.045,.36,.045]]);
    instances(wall, mats.led, [[0,2.35,1.3,3.2,.035,.035],[-4.65,1.8,1.35,.15,.06,.04]]);
    const doorHardware = [];
    for (const x of [-6.12,6.12]) for (const z of [-.8,-.35,.35,.8]) {
        doorHardware.push([x,1.4,z,.035,1.94,.035]);
        for (const y of [.6,1.4,2.2]) doorHardware.push([x,y,z,.055,.045,.12]);
    }
    instances(skin, ribMetal, doorHardware);

    const rack = part(root,cooling === 'immersion' ? 'immersion-tanks' : 'miner-racks');
    const rackFrames = [], machines = [], ports = [], lights = [], connectors = [], hoses = [], psus = [];
    if (cooling === 'immersion') {
        for (let x = -4.3; x <= 4.4; x += 2.15) {
            // Open tank rims and submerged board banks, distinct from a hydro rack.
            rackFrames.push([x,.36,0,1.8,.2,1.75],[x,1,.84,1.8,1.3,.07],[x,1,-.84,1.8,1.3,.07],
                [x-.87,1,0,.07,1.3,1.75],[x+.87,1,0,.07,1.3,1.75]);
            for (let b = 0; b < 8; b++) machines.push([x-.65+b*.185,1.15,0,.055,.66,1.25]);
            lights.push([x,.98,1,.18,.04,.03]);
            const liquid = new THREE.Mesh(new THREE.BoxGeometry(1.59,.02,1.55),material(0xba883b,.16,.1,{transparent:true,opacity:.27,depthWrite:false}));
            liquid.position.set(x,1.47,0); rack.add(liquid);
            lineTube(rack,[[x,.6,.96],[x,.6,1.06],[5.25,.6,1.06]],mats.copper,.047);
        }
    } else {
        const sampleCount = Math.ceil(54 * Math.min(1, fill));
        for (let x = -5.3; x < 4.5; x += 1.08) {
            rackFrames.push([x,1.4,-.85,.045,2.2,.06],[x,1.4,.48,.045,2.2,.06]);
        }
        for (const y of [.45,1.15,1.85]) rackFrames.push([-.55,y,-.85,10.2,.045,.05],[-.55,y,.48,10.2,.045,.05]);
        for (let i = 0; i < sampleCount; i++) {
            const col = i % 18, tier = Math.floor(i / 18), x = -5.05 + col * .535, y = .70 + tier * .7;
            machines.push([x,y,-.05,.44,.42,.72]);
            psus.push([x,y+.235,-.08,.40,.065,.54]);
            if (cooling === 'air') {
                ports.push([x,y,.331,.155,.035,.155,Math.PI/2,0,0]);
            } else {
                ports.push([x,y,.319,.40,.36,.025]);
                for (const dx of [-.11,.11]) {
                    connectors.push([x+dx,y-.055,.35,.034,.085,.034,Math.PI/2,0,0]);
                    const hz = dx < 0 ? .54 : .63, drop = dx < 0 ? .175 : .245;
                    hoses.push([x+dx,y-.055,(.3925+hz)/2,.021,hz-.3925,.021,Math.PI/2,0,0],
                        [x+dx,y-.055-drop/2,hz,.021,drop,.021]);
                }
            }
            lights.push([x-.12,y+.105,.34,.035,.025,.018]);
        }
        if (cooling === 'hydro') {
            const loop = part(root,'hydro-manifolds');
            for (const y of [.47,1.17,1.87]) {
                lineTube(loop,[[-5.3,y,.54],[4.65,y,.54],[4.65,.45,.54]],mats.copper,.035);
                lineTube(loop,[[-5.3,y-.07,.63],[4.85,y-.07,.63],[4.85,.38,.63]],mats.silver,.035);
            }
            instances(loop,mats.copper,connectors,CYLINDER);
            instances(loop,mats.dark,hoses,CYLINDER);
        }
    }
    instances(rack, mats.frame, rackFrames);
    instances(rack, mats.miner, machines);
    instances(rack, cooling === 'hydro' ? mats.silver : mats.dark, ports, cooling === 'air' ? CYLINDER : BOX);
    instances(rack, mats.silver, psus);
    instances(rack, mats.led, lights);
    // A metered distribution cabinet and service aisle remain legible through the cutaway.
    const pdu = part(root,'metered-power');
    instances(pdu, mats.silver, [[-5.7,1.12,.68,.45,1.65,.65]]);
    instances(pdu, mats.dark, [[-5.7,1.60,1.02,.28,.20,.025]]);
    instances(pdu, mats.orange, [[-5.7,.52,1.02,.28,.06,.025]]);
    instances(pdu,mats.dark,Array.from({length:6},(_,i) => [-5.7,.75+i*.1,1.02,.25,.035,.025]));
    const network = part(root,'network');
    instances(network,mats.frame,[[4.1,2.34,.5,.65,.15,.35]]);
    instances(network,mats.led,Array.from({length:8},(_,i) => [3.85+i*.065,2.34,.69,.03,.025,.025]));
    instances(root, mats.copper, [[0,.3,.89,10.5,.024,.028]]);
    instances(roof, platinum, [[0,2.81,0,12.28,.10,2.54]]);
    instances(roof, ribMetal, [[0,2.86,1.24,12.28,.15,.08],[0,2.86,-1.24,12.28,.15,.08]]);
    const fans = [];
    if (cooling !== 'air') {
        const cdu = part(root,'coolant-distribution-unit');
        instances(cdu,mats.shell,[[5.05,1.22,-.1,1.15,1.9,1.42]]);
        instances(cdu,mats.orange,[[5.05,2.11,.64,.92,.065,.035]]);
        instances(cdu,mats.frame,[[5.05,1.25,.64,.9,1.62,.05]]);
        instances(cdu,mats.dark,[[5.05,1.80,.68,.6,.23,.03]]);
        instances(cdu,mats.led,[[5.27,1.8,.71,.045,.05,.025]]);
        for (const x of [4.78,5.22]) {
            instances(cdu,mats.silver,[[x,.83,.69,.16,.08,.16]],CYLINDER);
            ring(cdu,mats.copper,x,1.16,.7,.09);
        }
        lineTube(root,[[4.65,.4,.54],[5.05,.4,.54],[5.05,.4,-.97],[5.05,3.08,-.97],[3.8,3.08,-.97]],mats.copper,.065);
        lineTube(root,[[4.85,.35,.63],[5.35,.35,.63],[5.35,.35,-1.07],[5.35,3.16,-1.07],[3.8,3.16,-1.07]],mats.silver,.065);
        // Exterior supply / return risers make the liquid circuit recognizable
        // even with the shell closed. Air containers instead have end-wall fans.
        const external = part(root,'external-liquid-loop');
        for (const [z,mat] of [[-.68,mats.copper],[.68,mats.silver]]) {
            lineTube(external,[[6.18,.7,z],[6.18,3.15,z],[5.35,3.15,z]],mat,.064);
            instances(external,mat,[[6.2,1.25,z,.13,.14,.13,0,0,Math.PI/2]],CYLINDER);
            ring(external,mats.orange,6.30,1.25,z,.12,0,Math.PI/2);
        }
        const cooler = part(roof,'closed-loop-dry-cooler');
        instances(cooler, mats.frame, [[0,3.13,0,10.7,.48,2.05]]);
        instances(cooler, mats.silver, [[-5.35,3.13,0,.12,.54,2.12],[5.35,3.13,0,.12,.54,2.12]]);
        instances(cooler, mats.orange, [[-5.42,3.35,0,.035,.045,2.12],[5.42,3.35,0,.035,.045,2.12]]);
        const fins = [];
        for (let x = -5.1; x <= 5.2; x += .14) for (const z of [-1.04,1.04]) fins.push([x,3.13,z,.022,.38,.10]);
        instances(cooler, mats.silver, fins);
        for (const x of [-3.6,0,3.6]) {
            fans.push(fan(cooler,mats,x,3.43,0,.79));
        }
    } else {
        // Air-cooled modules reject heat through the end-wall fan array.
        const intake = part(root,'air-intake-filters');
        instances(intake,mats.dark,[[-6.14,1.45,0,.10,1.94,2.03]]);
        const filters = [];
        for (let y = .55; y <= 2.4; y += .12) filters.push([-6.21,y,0,.045,.03,1.98]);
        instances(intake,mats.silver,filters);
        for (const y of [.9,1.9]) for (const z of [-.58,.58]) fans.push(fan(root,mats,6.2,y,z,.43,true));
    }
    return { root, roof, wall, fans, skinMaterials, cooling, rack, pdu, network };
}

// The balance of plant uses the same modeled metalwork as the containers.
// Repeated fins, fasteners and pipe fittings are instanced to keep orbiting light.
function metalwork(root) {
    const batches = new Map();
    return {
        add(mat, dimensions, geometry = BOX) {
            if (!batches.has(mat)) batches.set(mat,new Map());
            const shapes = batches.get(mat);
            if (!shapes.has(geometry)) shapes.set(geometry,[]);
            shapes.get(geometry).push(dimensions);
        },
        finish() { for (const [mat,shapes] of batches) for (const [geometry,items] of shapes) instances(root,mat,items,geometry); }
    };
}
function roundedCase(root, mat, w, h, d, y, bevel = .045) {
    const b = Math.min(bevel,w/8,h/8,d/8), shape = new THREE.Shape();
    shape.moveTo(-w/2+b,-h/2+b); shape.lineTo(w/2-b,-h/2+b);
    shape.lineTo(w/2-b,h/2-b); shape.lineTo(-w/2+b,h/2-b); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,steps:1});
    geo.translate(0,y,-d/2+b);
    const mesh = new THREE.Mesh(geo,mat); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
}
function pipeRun(root, points, mat, radius = .06) {
    const curve = new THREE.CurvePath(), p = points.map(v => new THREE.Vector3(...v));
    let last = p[0];
    for (let i = 1; i < p.length-1; i++) {
        const reach = Math.min(radius*2.4,p[i].distanceTo(p[i-1])*.35,p[i].distanceTo(p[i+1])*.35);
        const a = p[i].clone().add(p[i-1].clone().sub(p[i]).setLength(reach));
        const b = p[i].clone().add(p[i+1].clone().sub(p[i]).setLength(reach));
        curve.add(new THREE.LineCurve3(last,a)); curve.add(new THREE.QuadraticBezierCurve3(a,p[i],b)); last = b;
    }
    curve.add(new THREE.LineCurve3(last,p.at(-1)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(16,points.length*10),radius,10,false),mat);
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return curve;
}
function flange(batch, mats, x, y, z, radius, axis = 'y') {
    const rx = axis === 'z' ? Math.PI/2 : 0, rz = axis === 'x' ? Math.PI/2 : 0;
    batch.add(mats.silver,[x,y,z,radius,.07,radius,rx,0,rz],ROUND_CYLINDER);
    batch.add(mats.dark,[x,y,z,radius*.96,.018,radius*.96,rx,0,rz],ROUND_CYLINDER);
    for (let i = 0; i < 8; i++) {
        const a = i*Math.PI/4, u = Math.cos(a)*radius*.77, v = Math.sin(a)*radius*.77;
        batch.add(mats.frame,[x+(axis === 'x' ? .048 : u),y+(axis === 'y' ? .048 : axis === 'x' ? u : v),
            z+(axis === 'z' ? .048 : v),.026,.10,.026,rx,0,rz],CYLINDER);
    }
}
function gauge(batch, mats, x, y, z, radius = .11) {
    batch.add(mats.frame,[x,y,z,radius,.10,radius,Math.PI/2],ROUND_CYLINDER);
    batch.add(mats.silver,[x,y,z+.056,radius*.81,.016,radius*.81,Math.PI/2],ROUND_CYLINDER);
    batch.add(mats.dark,[x-radius*.13,y+radius*.18,z+.067,.018,radius*.95,.012,0,0,-.65]);
    for (let i = 0; i < 7; i++) {
        const a = i*Math.PI/4-Math.PI/4;
        batch.add(mats.dark,[x+Math.cos(a)*radius*.61,y+Math.sin(a)*radius*.61,z+.068,.012,.025,.012,0,0,a-Math.PI/2]);
    }
}
function handwheel(batch, mats, x, y, z, r = .14) {
    batch.add(mats.orange,[x,y,z,r,r,r],RING);
    batch.add(mats.orange,[x,y,z,r*1.8,.025,.025]);
    batch.add(mats.orange,[x,y,z,.025,r*1.8,.025]);
    batch.add(mats.silver,[x,y,z-.11,.045,.22,.045,Math.PI/2],ROUND_CYLINDER);
}
function skid(batch, mats, w, d) {
    for (const z of [-d*.36,d*.36]) batch.add(mats.frame,[0,.16,z,w,.18,.13]);
    for (const x of [-w*.39,w*.39]) {
        batch.add(mats.silver,[x,.12,0,.14,.18,d]);
        for (const z of [-d*.37,d*.37]) {
            batch.add(mats.dark,[x,.03,z,.30,.07,.25]);
            batch.add(mats.silver,[x,.26,z,.035,.10,.035],CYLINDER);
        }
    }
}
function pressureVessel(root, mats, x, y, z, r, height, name = 'pressure-vessel') {
    const vessel = part(root,name); vessel.position.set(x,y,z);
    const batch = metalwork(vessel), cap = r*.5, bottom = .25+cap, top = height-cap;
    batch.add(mats.shell,[0,(bottom+top)/2,0,r,top-bottom,r],ROUND_CYLINDER);
    for (const cy of [bottom,top]) batch.add(mats.silver,[0,cy,0,r,cap,r],DOME);
    for (const cy of [bottom+.09,top-.08]) {
        batch.add(mats.rib,[0,cy,0,r*1.018,.045,r*1.018],ROUND_CYLINDER);
    }
    for (const dx of [-r*.65,r*.65]) batch.add(mats.frame,[dx,.25,0,.09,.45,r*1.15]);
    batch.add(mats.silver,[0,height+.10,0,.07,.23,.07],ROUND_CYLINDER);
    flange(batch,mats,0,height+.19,0,.12);
    batch.add(mats.dark,[0,height*.62,r+.013,r,.25,.025]);
    batch.add(mats.orange,[0,height*.62+.08,r+.032,r*.70,.026,.02]);
    gauge(batch,mats,0,height*.78,r+.07,Math.min(.12,r*.28));
    batch.finish(); return vessel;
}
function switchCabinet(root, mats, x, y, z, w = .72, h = 1.8, d = .75) {
    const group = part(root,'switchgear-cabinet'); group.position.set(x,y,z);
    const batch = metalwork(group);
    roundedCase(group,mats.shell,w,h,d,h/2+.1);
    batch.add(mats.frame,[0,.08,0,w*1.08,.16,d*1.08]);
    batch.add(mats.dark,[0,h*.53,d/2+.017,w*.87,h*.89,.026]);
    batch.add(mats.silver,[0,h*.53,d/2+.035,w*.82,h*.85,.025]);
    batch.add(mats.dark,[-w*.12,h*.79,d/2+.06,w*.39,h*.14,.025]);
    batch.add(mats.led,[-w*.18,h*.81,d/2+.08,w*.18,.035,.02]);
    batch.add(mats.frame,[w*.30,h*.49,d/2+.068,.035,h*.16,.05]);
    batch.add(mats.orange,[0,h*.18,d/2+.062,w*.5,.055,.03]);
    for (let i = 0; i < 7; i++) batch.add(mats.dark,[0,h*(.25+i*.025),d/2+.057,w*.56,.014,.02]);
    for (const cy of [.3,h*.65,h*.95]) batch.add(mats.frame,[-w*.42,cy,d/2+.066,.035,.10,.045]);
    batch.finish(); return group;
}
function generatorPackage(parent, mats, x, y, z, w = 5.4, h = 2.2, d = 2.1) {
    const root = part(parent,'generator-package'); root.position.set(x,y,z);
    const batch = metalwork(root), base = .30, top = h+base;
    skid(batch,mats,w+.22,d+.22);
    roundedCase(root,mats.rib,w,h,d,h/2+base,.055);
    for (const sx of [-1,1]) for (const sz of [-1,1]) batch.add(mats.silver,[sx*(w/2-.035),h/2+base,sz*(d/2+.025),.07,h,.09]);
    // Separate acoustic doors, recessed radiator banks, hinges and locking handles.
    for (const side of [-1,1]) {
        const face = side*(d/2+.035), doorWidth = w*.205;
        for (let i = 0; i < 3; i++) {
            const dx = -w*.37+i*w*.225;
            batch.add(mats.dark,[dx,h/2+base,face,doorWidth+.018,h*.91,.024]);
            batch.add(mats.shell,[dx,h/2+base,face+side*.024,doorWidth,h*.88,.025]);
            for (const cy of [h*.29+base,h*.77+base]) batch.add(mats.frame,[dx-doorWidth*.43,cy,face+side*.05,.048,.12,.045]);
            batch.add(mats.frame,[dx+doorWidth*.33,h*.48+base,face+side*.063,.035,.24,.05]);
            batch.add(mats.dark,[dx,h*.82+base,face+side*.04,doorWidth*.6,.085,.025]);
        }
        batch.add(mats.dark,[w*.34,h/2+base,face,w*.235,h*.83,.045]);
        for (let i = 0; i < 16; i++) batch.add(mats.silver,[w*.34,base+h*.13+i*h*.047,face+side*.048,w*.225,.025,.085,.23]);
        batch.add(mats.orange,[0,base+.045,face+side*.035,w*.93,.055,.035]);
        batch.add(mats.dark,[-w*.35,h*.62+base,face+side*.043,w*.12,h*.19,.028]);
        batch.add(mats.led,[-w*.36,h*.64+base,face+side*.067,w*.055,.035,.017]);
        for (const dx of [-w*.45,w*.45]) for (const cy of [base+.09,top-.08]) batch.add(mats.frame,[dx,cy,face+side*.053,.035,.035,.022]);
    }
    for (const side of [-1,1]) {
        const face = side*(w/2+.04);
        batch.add(mats.dark,[face,h/2+base,0,.05,h*.81,d*.83]);
        for (let i = 0; i < 18; i++) batch.add(mats.silver,[face+side*.035,base+h*.12+i*h*.045,0,.085,.022,d*.80]);
    }
    const cooling = part(root,'generator-radiator');
    // Roof fan behind a wire guard, separate from the mining container cooling.
    const rotor = fan(cooling,mats,w*.32,top+.05,0,Math.min(d*.34,w*.16));
    for (const sz of [-d*.43,d*.43]) batch.add(mats.frame,[0,top+.04,sz,w*.93,.08,.07]);
    const exhaust = part(root,'insulated-exhaust'), exhaustBatch = metalwork(exhaust);
    const stackCount = w > 4 ? 2 : 1;
    for (let i = 0; i < stackCount; i++) {
        const dx = -w*.28+i*w*.23;
        exhaustBatch.add(mats.silver,[dx,top+.28,0,.23,Math.min(.9,d*.53),.23,Math.PI/2],ROUND_CYLINDER);
        for (const sz of [-d*.16,d*.16]) flange(exhaustBatch,mats,dx,top+.28,sz,.245,'z');
        pipeRun(exhaust,[[dx,top-.04,-d*.20],[dx,top+.29,-d*.20],[dx,top+.29,d*.27],[dx,top+1.02,d*.27]],mats.rib,.105);
        flange(exhaustBatch,mats,dx,top+.7,d*.27,.145);
        exhaustBatch.add(mats.dark,[dx,top+1.035,d*.27,.09,.025,.09],ROUND_CYLINDER);
        exhaustBatch.add(mats.silver,[dx,top+1.10,d*.27,.16,.035,.16,.12],ROUND_CYLINDER);
        for (const sz of [-.19,.19]) batch.add(mats.frame,[dx,top+.1,sz,.40,.08,.06]);
    }
    exhaustBatch.finish(); batch.finish();
    return {root,fans:[rotor]};
}
function gasConditioning(parent, mats, x, y, z, w = 1.7, h = 1.7, d = 1.7) {
    const root = part(parent,'gas-treatment-skid'); root.position.set(x,y,z);
    const batch = metalwork(root); skid(batch,mats,w,d);
    const r = Math.min(w*.19,d*.23);
    for (const [dx,scale] of [[-w*.24,1],[w*.24,.83]]) {
        pressureVessel(root,mats,dx,.12,-d*.10,r*scale,h*scale,'filter-separator');
        pipeRun(root,[[dx,h*.50,-d*.10],[dx,h*.50,d*.37],[dx,.48,d*.37]],mats.silver,.065);
        flange(batch,mats,dx,.76,d*.37,.115);
        handwheel(batch,mats,dx,h*.48,d*.46,.12);
        pipeRun(root,[[dx,.40,-d*.1],[dx,.18,-d*.1],[dx,.18,d*.5]],mats.rib,.036);
    }
    pipeRun(root,[[-w*.6,.48,d*.37],[w*.61,.48,d*.37]],mats.silver,.085);
    for (const dx of [-w*.55,0,w*.55]) flange(batch,mats,dx,.48,d*.37,.14,'x');
    batch.add(mats.frame,[0,.48,d*.37,.27,.27,.24]);
    gauge(batch,mats,0,.87,d*.42,.105);
    batch.add(mats.silver,[0,.73,d*.36,.025,.35,.025],ROUND_CYLINDER);
    batch.add(mats.orange,[-w*.43,.25,d*.5,w*.30,.06,.025]);
    batch.finish(); return root;
}
function transformerPackage(parent, mats, x, y, z, w = 1.5, h = 2, d = 1.5) {
    const root = part(parent,'transformer-package'); root.position.set(x,y,z);
    const batch = metalwork(root), tankHeight = h*.68;
    skid(batch,mats,w+.18,d+.18);
    roundedCase(root,mats.rib,w*.76,tankHeight,d*.72,.25+tankHeight/2);
    batch.add(mats.silver,[0,.28+tankHeight,0,w*.88,.09,d*.82]);
    for (const side of [-1,1]) {
        for (let i = 0; i < 15; i++) {
            const dx = -w*.36+i*w*.72/14;
            batch.add(mats.silver,[dx,.28+tankHeight*.49,side*d*.45,.035,tankHeight*.81,d*.22]);
        }
        for (const cy of [.35,.25+tankHeight*.91]) batch.add(mats.frame,[0,cy,side*d*.48,w*.87,.055,.055]);
    }
    const terminals = part(root,'insulated-transformer-terminals'), tb = metalwork(terminals);
    for (const dx of [-w*.25,0,w*.25]) {
        const bottom = .34+tankHeight;
        tb.add(mats.frame,[dx,bottom+h*.10,0,.060,h*.25,.060],ROUND_CYLINDER);
        for (let i = 0; i < 6; i++) tb.add(mats.miner,[dx,bottom+i*h*.032,0,.10-i*.003,.035,.10-i*.003],ROUND_CYLINDER);
        tb.add(mats.copper,[dx,bottom+h*.245,0,.038,.08,.038],ROUND_CYLINDER);
        flange(tb,mats,dx,bottom-.015,0,.12);
    }
    tb.finish();
    gauge(batch,mats,-w*.24,tankHeight*.78,d*.565,.085);
    batch.add(mats.dark,[w*.20,tankHeight*.70,d*.57,w*.22,.21,.026]);
    batch.add(mats.orange,[w*.20,tankHeight*.70+.055,d*.59,w*.15,.035,.02]);
    for (const dx of [-w*.33,w*.33]) batch.add(mats.silver,[dx,.32+tankHeight,-d*.31,.10,.16,.08]);
    pipeRun(root,[[w*.42,.60,-d*.26],[w*.52,.60,-d*.26],[w*.52,.05,-d*.26]],mats.copper,.024);
    batch.finish(); return root;
}

function wellhead(parent, mats, x, y, z, height = 2.4, outlet = height*.40) {
    const root = part(parent,'flanged-wellhead'); root.position.set(x,y,z);
    const b = metalwork(root);
    b.add(mats.edge,[0,.06,0,.95,.12,.95]);
    b.add(mats.silver,[0,height*.49,0,.16,height*.94,.16],ROUND_CYLINDER);
    for (const cy of [.25,height*.53,height*.83]) flange(b,mats,0,cy,0,.27);
    b.add(mats.frame,[0,height*.61,0,.29,.29,.30]);
    handwheel(b,mats,0,height*.61,.40,.23);
    b.add(mats.silver,[0,height-.02,0,.23,.11,.23],ROUND_CYLINDER);
    gauge(b,mats,0,height-.25,.26,.13);
    b.add(mats.orange,[.31,height*.45,.1,.11,.22,.025]);
    pipeRun(root,[[0,outlet,0],[.47,outlet,0],[.47,outlet,.48]],mats.rib,.105);
    flange(b,mats,.47,outlet,.39,.16,'z'); b.finish(); return root;
}
function landfillCell(diagram, mats) {
    const root = new THREE.Group(), G = diagram.MODEL, C = G.CELL;
    root.name = 'cell';
    const terrain = part(root,'terraced-landfill-cap'), wells = part(root,'wellfield'), header = part(root,'collection-header');
    // Same footprint, bench elevations and well locations as the authored layout.
    const levelsY = [0,.333,.333,.667,.667,1], levelsR = [1,.845,.755,.6,.51,.355], steps = 128;
    const radial = t => 1+.055*Math.sin(3*t+.6)+.032*Math.cos(5*t-.4)-.021*Math.sin(2*t+1.9);
    const point = (r,h,t) => [C.x+r*radial(t)*C.w/2*Math.cos(t),h*C.h,C.z+r*radial(t)*C.d/2*Math.sin(t)];
    const capHeight = (x,z) => {
        const nx = (x-C.x)/(C.w/2), nz = (z-C.z)/(C.d/2), u = Math.hypot(nx,nz)/radial(Math.atan2(nz,nx));
        if (u >= 1) return 0;
        if (u <= levelsR.at(-1)) return C.h;
        for (let i = 0; i < levelsR.length-1; i++) if (u >= levelsR[i+1]) {
            const t = (levelsR[i]-u)/(levelsR[i]-levelsR[i+1]);
            return (levelsY[i]+(levelsY[i+1]-levelsY[i])*t)*C.h;
        }
        return C.h;
    };
    const surfaceMat = mats.earth.clone(); surfaceMat.vertexColors = true;
    for (let band = 0; band < 6; band++) {
        const pos = [], colors = [], indices = [], rows = 5;
        for (let row = 0; row <= rows; row++) for (let i = 0; i <= steps; i++) {
            const t = row/rows, angle = i/steps*Math.PI*2;
            const r = levelsR[band]+((levelsR[band+1] ?? 0)-levelsR[band])*t;
            const h = levelsY[band]+((levelsY[band+1] ?? 1)-levelsY[band])*t;
            const p = point(r,h,angle); pos.push(...p);
            const grain = .87+.065*Math.sin(p[0]*5.13+p[2]*.7)*Math.cos(p[2]*4.19)+.025*Math.cos(p[0]*15.7);
            colors.push(grain,grain,grain);
            if (row < rows && i < steps) { const a = row*(steps+1)+i, b = a+steps+1; indices.push(a,b,a+1,b,b+1,a+1); }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry,surfaceMat); mesh.receiveShadow = mesh.castShadow = true; terrain.add(mesh);
    }
    // Fine bench drains and cap seams keep the graded surface readable up close.
    for (const band of [1,2,3,4]) {
        const points = Array.from({length:steps+1},(_,i) => { const p = point(levelsR[band],levelsY[band],i/steps*Math.PI*2); p[1] += .035; return p; });
        lineTube(terrain,points,mats.edge,.030);
    }
    for (let i = 0; i < 32; i++) {
        const angle = i/32*Math.PI*2, pts = levelsR.map((r,band) => { const p = point(r,levelsY[band],angle); p[1] += .032; return p; });
        lineTube(terrain,pts,mats.edge,.018);
    }
    const points = diagram.regionBoxes('wells'), hb = metalwork(header);
    for (const p of points) {
        const outlet = G.WELL_H*.55;
        wellhead(wells,mats,p.x,p.y,p.z,G.WELL_H,outlet);
        const run = [[p.x+.47,p.y+outlet,p.z+.48]];
        for (let i = 1; i <= 64; i++) {
            const z = p.z+.48+(G.HEADER_Z-p.z-.48)*i/64;
            const surface = capHeight(p.x+.47,z);
            run.push([p.x+.47,Math.max(.44,surface+.32),z]);
            if (i%12 === 0) hb.add(mats.edge,[p.x+.47,surface+.11,z,.22,.22,.25]);
        }
        // An HDPE lateral follows the cap all the way to the shared header.
        lineTube(header,run,mats.frame,.075);
    }
    const start = C.x-C.w*.40, end = G.BLOWER.x;
    pipeRun(header,[[start,.44,G.HEADER_Z],[end,.44,G.HEADER_Z],[end,.80,G.HEADER_Z],[end,.80,G.BLOWER.z]],mats.rib,.14);
    for (let x = start; x < end; x += 2.3) {
        hb.add(mats.edge,[x,.11,G.HEADER_Z,.42,.22,.62]);
        flange(hb,mats,x,.44,G.HEADER_Z,.205,'x');
    }
    for (const x of G.SUMP_X) {
        hb.add(mats.frame,[x,.23,G.HEADER_Z,.43,.45,.43],ROUND_CYLINDER);
        hb.add(mats.silver,[x,.47,G.HEADER_Z,.48,.06,.48],ROUND_CYLINDER);
        hb.add(mats.orange,[x,.515,G.HEADER_Z,.15,.022,.055]);
    }
    hb.finish(); return {root,targets:{cell:terrain,wells,header}};
}
function blowerPackage(parent, mats, x, y, z, w = 4.4, d = 2) {
    const root = part(parent,'blower-skid'); root.position.set(x,y,z);
    const b = metalwork(root); skid(b,mats,w+.2,d+.2);
    for (const side of [-1,1]) {
        const zz = side*d*.24;
        b.add(mats.frame,[-w*.17,.75,zz,.37,w*.36,.37,0,0,Math.PI/2],ROUND_CYLINDER);
        b.add(mats.silver,[w*.20,.84,zz,.48,.55,.48,0,0,Math.PI/2],ROUND_CYLINDER);
        flange(b,mats,w*.27,.84,zz,.48,'x');
        for (let j = 0; j < 16; j++) {
            const a = j/16*Math.PI*2;
            b.add(mats.silver,[-w*.17,.75+Math.cos(a)*.37,zz+Math.sin(a)*.37,w*.31,.045,.045,a]);
        }
        b.add(mats.dark,[-w*.39,.75,zz,.06,.29,.29,0,0,Math.PI/2],ROUND_CYLINDER);
        for (let j = 0; j < 8; j++) b.add(mats.silver,[-w*.4,.52+j*.065,zz,.045,.018,.40]);
        b.add(mats.frame,[w*.12,.31,zz,.72,.23,.70]);
        pipeRun(root,[[w*.22,1.18,zz],[w*.22,1.6,zz],[w*.48,1.6,zz]],mats.silver,.13);
        flange(b,mats,w*.43,1.6,zz,.20,'x');
    }
    gauge(b,mats,w*.12,1.6,d*.42,.14);
    b.add(mats.orange,[0,.23,d*.48,w*.36,.06,.04]); b.finish(); return root;
}
function landfillGround(diagram, mats) {
    const root = new THREE.Group(), G = diagram.MODEL; root.name = 'ground';
    const b = metalwork(root);
    for (const slab of [G.GROUND,G.PAD,G.ROAD]) {
        b.add(mats.ground,[slab.x,slab.y+slab.h/2,slab.z,slab.w,slab.h,slab.d]);
        if (slab === G.PAD) for (const side of [-1,1]) b.add(mats.edge,[slab.x,0,slab.z+side*slab.d/2,slab.w,.06,.08]);
    }
    b.finish();
    const grid = [];
    for (const [slab,nx,nz] of [[G.GROUND,11,9],[G.PAD,8,5]]) {
        const y = slab.y+slab.h+.004;
        for (let i = 0; i <= nx; i++) { const x = slab.x-slab.w/2+slab.w*i/nx; grid.push(x,y,slab.z-slab.d/2,x,y,slab.z+slab.d/2); }
        for (let i = 0; i <= nz; i++) { const z = slab.z-slab.d/2+slab.d*i/nz; grid.push(slab.x-slab.w/2,y,z,slab.x+slab.w/2,y,z); }
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));
    root.add(new THREE.LineSegments(gg,new THREE.LineBasicMaterial({color:0x90908d,transparent:true,opacity:.17})));
    pressureVessel(root,mats,G.LEACH.x,0,G.LEACH.z,G.LEACH.w*.45,G.LEACH.h,'leachate-vessel');
    blowerPackage(root,mats,G.LEACH_PUMP.x,0,G.LEACH_PUMP.z,G.LEACH_PUMP.w,1.35).scale.y = .65;
    switchCabinet(root,mats,G.KIOSK.x,0,G.KIOSK.z,G.KIOSK.w,G.KIOSK.h-.1,G.KIOSK.d);
    pipeRun(root,[[G.LEACH.x,.55,G.CELL.z+G.CELL.d/2],[G.LEACH.x,.55,G.LEACH_PUMP.z]],mats.frame,.10);
    return {root};
}
function landfillPlant(diagram, mats) {
    const G = diagram.MODEL, root = new THREE.Group(); root.name = 'plant';
    blowerPackage(root,mats,G.BLOWER.x,0,G.BLOWER.z,G.BLOWER.w,G.BLOWER.d);
    pressureVessel(root,mats,G.KO.x,0,G.KO.z,G.KO.w*.37,G.KO.h,'condensate-knockout');
    pipeRun(root,[[G.BLOWER.x+G.BLOWER.w*.5,1.15,G.BLOWER.z],[G.KO.x,1.15,G.KO.z],[G.FLARE.x-G.FLARE_R,1.15,G.FLARE.z]],mats.silver,.13);
    const b = metalwork(root);
    for (const x of [G.KO.x-1,G.KO.x+1.1,G.FLARE.x-G.FLARE_R-.25]) flange(b,mats,x,1.15,G.KO.z,.21,'x');
    handwheel(b,mats,G.KO.x+1.1,1.15,G.KO.z+.33,.2); b.finish();
    return {root,targets:{blower:root}};
}
function flarePackage(diagram, mats, enclosed) {
    const G = diagram.MODEL, root = new THREE.Group(), flame = part(root,'combustion'); root.name = 'flare';
    const stack = part(root,enclosed ? 'enclosed-flare' : 'flare-stack'); stack.position.set(G.FLARE.x,0,G.FLARE.z);
    const b = metalwork(stack), r = G.FLARE_R, h = G.FLARE_H;
    b.add(mats.edge,[0,.15,0,r*2.4,.30,r*2.4]);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h-.4,48,1,true),mats.shell);
    shell.position.y = .4+(h-.4)/2; shell.castShadow = shell.receiveShadow = true; stack.add(shell);
    b.add(mats.dark,[0,h-.18,0,r*.98,.08,r*.98],ROUND_CYLINDER);
    for (const cy of [.48,h*.36,h*.68,h-.06]) {
        b.add(mats.rib,[0,cy,0,r*1.045,.08,r*1.045],OPEN_CYLINDER);
        b.add(mats.dark,[0,cy+.046,0,r*1.012,.012,r*1.012],OPEN_CYLINDER);
    }
    for (let i = 0; i < 12; i++) {
        const a = i*Math.PI/6, xx = Math.cos(a)*r, zz = Math.sin(a)*r;
        b.add(mats.frame,[xx,h*.48,zz,.025,h*.90,.025]);
        if (enclosed) {
            b.add(mats.dark,[xx*.992,1.1,zz*.992,r*.27,1,.045,0,Math.PI/2-a]);
            for (let j = 0; j < 5; j++) b.add(mats.silver,[xx*1.015,.72+j*.17,zz*1.015,r*.25,.025,.045,0,Math.PI/2-a]);
        }
    }
    if (enclosed) {
        for (const dx of [-.25,.25]) b.add(mats.frame,[dx,h*.47,-r-.16,.045,h*.87,.045]);
        for (let cy = .40; cy < h*.92; cy += .32) b.add(mats.silver,[0,cy,-r-.16,.53,.035,.04]);
        for (const cy of [h*.28,h*.50,h*.72,h*.88]) ring(stack,mats.frame,0,cy,-r-.3,.40,Math.PI/2);
        b.add(mats.dark,[0,2.05,r+.02,.65,.8,.04]);
        b.add(mats.silver,[0,2.05,r+.047,.57,.72,.04]);
        b.add(mats.orange,[0,2.23,r+.074,.35,.08,.026]);
    } else {
        pressureVessel(root,mats,G.KO.x,0,G.KO.z,G.KO.w*.35,G.KO.h,'condensate-knockout');
        pipeRun(root,[[G.KO.x,1.0,G.KO.z],[G.FLARE.x,1.0,G.FLARE.z],[G.FLARE.x,2,G.FLARE.z]],mats.silver,.12);
    }
    b.finish();
    // A low combustion crown for the enclosed shroud; an organic tongue for the open stack.
    flame.position.set(G.FLARE.x,h-.06,G.FLARE.z);
    const flameMat = mats.flow.clone(); flameMat.transparent = true; flameMat.opacity = .8; flameMat.depthWrite = false;
    const height = enclosed ? .80 : 2.7, radius = enclosed ? r*.80 : .50, verts = [], indices = [];
    for (let row = 0; row <= 12; row++) for (let i = 0; i <= 24; i++) {
        const t = row/12, a = i/24*Math.PI*2, rr = radius*Math.pow(1-t,.8)*(1+.15*Math.sin(a*3+t*8));
        verts.push(Math.cos(a)*rr+Math.sin(t*5)*t*.18,t*height,Math.sin(a)*rr+Math.sin(t*3)*t*.12);
        if (row < 12 && i < 24) { const v = row*25+i; indices.push(v,v+25,v+1,v+1,v+25,v+26); }
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); fg.setIndex(indices); fg.computeVertexNormals();
    flame.add(new THREE.Mesh(fg,flameMat));
    return {root,flame};
}

function padSeparator(diagram, mats) {
    const G = diagram.MODEL, S = G.SEP, root = new THREE.Group(); root.name = 'sep';
    const vessel = part(root,'horizontal-separator'); vessel.position.set(S.x,0,S.z);
    const b = metalwork(vessel), r = S.h/2, cy = S.y+r;
    skid(b,mats,G.SKID.w,G.SKID.d);
    b.add(mats.shell,[0,cy,0,r,S.w-r,r,0,0,Math.PI/2],ROUND_CYLINDER);
    for (const dx of [-1,1]) {
        b.add(mats.silver,[dx*(S.w-r)/2,cy,0,r*.50,r,r],DOME);
        b.add(mats.frame,[dx*S.w*.29,S.y/2+.15,0,.27,S.y,.9]);
        flange(b,mats,dx*S.w*.28,cy,0,r*1.025,'x');
        pipeRun(vessel,[[dx*S.w*.24,cy,0],[dx*S.w*.24,cy+r+.32,0],[dx*S.w*.24,cy+r+.32,.45]],mats.silver,.10);
        handwheel(b,mats,dx*S.w*.24,cy+r+.32,.56,.19);
        gauge(b,mats,dx*S.w*.12,cy+.18,r+.09,.13);
    }
    b.add(mats.dark,[0,cy,r+.013,.68,.28,.035]);
    b.add(mats.orange,[0,cy+.065,r+.04,.43,.045,.025]);
    pipeRun(vessel,[[-S.w*.34,.45,r+.18],[S.w*.34,.45,r+.18],[S.w*.34,cy,r+.18]],mats.frame,.065);
    b.finish(); return {root};
}
function padTanks(diagram, mats) {
    const G = diagram.MODEL, root = new THREE.Group(); root.name = 'tanks';
    const r = G.TANK_R, h = G.TANK_H;
    for (const x of G.TANK_X) {
        const tank = part(root,'welded-storage-tank'); tank.position.set(x,0,G.TANK_Z);
        const b = metalwork(tank);
        b.add(mats.edge,[0,.10,0,r*1.04,.20,r*1.04],ROUND_CYLINDER);
        b.add(mats.shell,[0,h/2,0,r,h-.14,r],ROUND_CYLINDER);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(r,.25,48),mats.silver); roof.position.y = h+.05; tank.add(roof);
        for (let i = 1; i < 6; i++) b.add(mats.rib,[0,h*i/6,0,r*1.005,.022,r*1.005],OPEN_CYLINDER);
        for (let i = 0; i < 12; i++) {
            const angle = i*Math.PI/6;
            b.add(mats.rib,[Math.cos(angle)*r,h/2,Math.sin(angle)*r,.018,h-.24,.018]);
        }
        b.add(mats.frame,[0,h+.23,0,.35,.13,.35],ROUND_CYLINDER);
        flange(b,mats,0,h+.30,0,.36);
        pipeRun(tank,[[r*.42,h,0],[r*.42,h+.6,0],[r*.66,h+.6,0],[r*.66,h+.46,0]],mats.silver,.075);
        pipeRun(tank,[[0,.54,r-.1],[0,.54,r+.40],[0,.54,r+.56]],mats.silver,.12);
        flange(b,mats,0,.54,r+.3,.22,'z'); handwheel(b,mats,0,.54,r+.62,.19);
        b.add(mats.dark,[0,h*.62,r+.017,.60,.38,.026]);
        b.add(mats.orange,[0,h*.62+.10,r+.034,.40,.045,.02]);
        b.finish();
    }
    const walkway = part(root,'tank-service-walkway'), b = metalwork(walkway);
    const length = G.TANK_X.at(-1)-G.TANK_X[0], mid = (G.TANK_X[0]+G.TANK_X.at(-1))/2, z = G.TANK_Z;
    for (const dz of [-.53,.53]) for (const cy of [h+.16,h+.65,h+1.18]) b.add(mats.silver,[mid,cy,z+dz,length+.5,.035,.035]);
    for (let x = G.TANK_X[0]-.24; x <= G.TANK_X.at(-1)+.3; x += .19) b.add(mats.frame,[x,h+.12,z,.06,.04,1.10]);
    for (const x of G.TANK_X) for (const dz of [-.53,.53]) b.add(mats.frame,[x,h+.67,z+dz,.045,1.08,.045]);
    const ladderX = G.TANK_X[0]-r-.28, ladderZ = z+.5;
    for (const dz of [-.27,.27]) b.add(mats.silver,[ladderX,h/2,ladderZ+dz,.045,h,.045]);
    for (let cy = .3; cy < h; cy += .3) b.add(mats.silver,[ladderX,cy,ladderZ,.045,.035,.58]);
    b.finish(); return {root};
}

function presentationEquipment(diagram, renderable, mats, view) {
    const parent = new THREE.Group(), {id,at} = renderable, G = diagram.MODEL;
    parent.name = id;
    if (id === 'gen') {
        const size = G.genset || {w:5.4,h:2.2,d:2.1};
        return {root:parent,fans:generatorPackage(parent,mats,at[0],0,at[2],size.w,size.h,size.d).fans};
    }
    if (id === 'gas' || id === 'cond') {
        const size = G.gas || {w:1.7,h:1.7,d:1.7};
        gasConditioning(parent,mats,at[0],0,at[2],size.w,size.h,size.d); return {root:parent};
    }
    if (id === 'xfmr') {
        const size = G.xfmr || {w:1.5,h:2,d:1.5};
        transformerPackage(parent,mats,at[0],0,at[2],size.w,size.h,size.d); return {root:parent};
    }
    if (view === 'landfill') {
        if (id === 'cell') return landfillCell(diagram,mats);
        if (id === 'plant') return landfillPlant(diagram,mats);
        if (id === 'ground') return landfillGround(diagram,mats);
    }
    if (view === 'pad') {
        if (id === 'well') { wellhead(parent,mats,G.WELL.x,0,G.WELL.z,G.WELL_H); return {root:parent}; }
        if (id === 'sep') return padSeparator(diagram,mats);
        if (id === 'tanks') return padTanks(diagram,mats);
    }
    if (id === 'flare' && G.FLARE) return flarePackage(diagram,mats,view === 'landfill');
    return legacyPart(diagram,renderable,mats);
}

/** Pure scene construction: also usable from Node to inspect geometry without a GPU. */
export function buildYard(config) {
    const mats = palette();
    const root = new THREE.Group();
    const shown = Math.min(config.containers,12), cols = shown <= 1 ? 1 : shown <= 4 ? 2 : 3;
    const rows = Math.max(1,Math.ceil(shown/cols)), width = cols*14.5+10, depth = rows*6.8+7;
    instances(root,mats.ground,[[0,-.35,0,width,.60,depth]]);
    const edging = [[0,-.04,-depth/2,width,.08,.10],[0,-.04,depth/2,width,.08,.10],[-width/2,-.04,0,.10,.08,depth],[width/2,-.04,0,.10,.08,depth]];
    instances(root,mats.edge,edging);
    const gridLines = [];
    for (let x = -width/2+1; x < width/2; x += 1) gridLines.push(x,-.025,-depth/2,x,-.025,depth/2);
    for (let z = -depth/2+1; z < depth/2; z += 1) gridLines.push(-width/2,-.025,z,width/2,-.025,z);
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(gridLines,3));
    const grid = new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({color:0xb0a89b,transparent:true,opacity:.11})); root.add(grid);

    const containers = [], fans = [], pulses = [], utility = new THREE.Group();
    const gen = part(utility,'generation'), gas = part(utility,'gas-conditioning'), xfmr = part(utility,'transformer');
    const ux = -width/2+3.4, mainZ = Math.min(2.2,depth/2-2);
    if (shown) {
        // Generator count is a representative group; the UI reports total configured power.
        if (config.settings.source === 'gas') {
            const count = Math.min(3,config.generators);
            for (let i = 0; i < count; i++) {
                const z = -depth/2+3.2+i*3.8;
                fans.push(...generatorPackage(gen,mats,ux,0,z,3.2,2.12,2.25).fans);
            }
            gasConditioning(gas,mats,ux-.47,0,mainZ+1,2.0,2.2,1.5);
            lineTube(utility,[[ux+.8,.35,mainZ+1],[ux+.8,.35,-depth/2+3.2]],mats.copper,.09);
        } else {
            instances(gen,mats.frame,[[ux,2.7,-2,.15,5.4,.15],[ux,5.15,-2,3.0,.13,.13]]);
            lineTube(gen,[[ux-1,5.15,-2],[ux-1,3.2,-2],[ux,.5,-.5]],mats.dark,.05);
        }
        transformerPackage(xfmr,mats,ux+.35,0,mainZ+3,2.7,1.6,1.65);
        switchCabinet(xfmr,mats,ux+1.85,0,mainZ+1);
    }
    root.add(utility);
    for (let i = 0; i < shown; i++) {
        const represented = Math.floor(config.containers/shown)+(i < config.containers%shown ? 1 : 0);
        const fill = config.containers > 12 ? 1 : Math.min(1,(config.count-i*config.perContainer)/config.perContainer);
        const unit = containerUnit(mats,config.settings.cooling,fill);
        unit.root.position.set((i%cols-(cols-1)/2)*14.5+3.2,0,(Math.floor(i/cols)-(rows-1)/2)*6.8);
        unit.root.userData.containerIndex = i; unit.root.userData.represented = represented;
        unit.index = i; unit.open = 0; root.add(unit.root); containers.push(unit); fans.push(...unit.fans);
        const x = unit.root.position.x, z = unit.root.position.z;
        const curve = lineTube(root,[[ux+2.1,.1,mainZ+3],[ux+2.1,.1,z+2.0],[x,.1,z+2.0],[x,.42,z+1.45]],mats.flow,.045);
        for (let j = 0; j < 3; j++) {
            const mesh = new THREE.Mesh(SPHERE,mats.pulse); mesh.visible = false; root.add(mesh);
            pulses.push({mesh,curve,offset:j/3+i*.13});
        }
    }
    root.updateMatrixWorld(true);
    return {root,mats,containers,fans,pulses,width,depth,shown,utility,targets:{gen,gas,xfmr},bounds:new THREE.Box3().setFromObject(root)};
}

function finishScene(root, mats, containers = [], extra = {}) {
    containers.forEach((unit,index) => { unit.index = index; unit.open = 0; unit.root.userData.containerIndex = index; });
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
    return {root,mats,containers,fans:containers.flatMap(c => c.fans),pulses:[],shown:containers.length,
        width:size.x,depth:size.z,bounds,...extra};
}

function buildHostedContainer() {
    const mats = palette(), root = new THREE.Group(), unit = containerUnit(mats,'hydro',1);
    instances(root,mats.ground,[[0,-.24,0,14.3,.44,5.2]]);
    instances(root,mats.edge,[[0,-.01,2.6,14.3,.05,.05],[0,-.01,-2.6,14.3,.05,.05]]);
    root.add(unit.root);
    const spares = part(unit.root,'spares');
    instances(spares,mats.frame,[[-5.75,.60,-.55,.48,.7,.75]]);
    instances(spares,mats.silver,[[-5.75,1.04,-.55,.39,.17,.64]]);
    const targets = {cdu:unit.root.getObjectByName('coolant-distribution-unit'),loop:unit.root.getObjectByName('hydro-manifolds'),
        spares,shell:unit.root,asics:unit.rack,pdu:unit.pdu,net:unit.network,cool:unit.roof};
    return finishScene(root,mats,[unit],{targets,view:'hosting'});
}

function buildHydroMachine() {
    const mats = palette(), root = new THREE.Group(), body = part(root,'hydro-machine');
    const skinMaterials = [mats.shell.clone(),mats.orange.clone()];
    const roof = part(body,'removable-roof'), wall = part(body,'service-wall');
    // The published 339 x 173 x 207 mm envelope, in units of 100 mm.
    // Internal component placement is illustrative, as in the existing diagram.
    instances(root,mats.ground,[[0,-.12,0,4.7,.22,3.0]]);
    instances(body,mats.frame,[[0,.05,0,3.39,.10,1.73]]);
    instances(body,skinMaterials[0],[[0,1.065,-.842,3.39,2.01,.045]]);
    instances(body,skinMaterials[0],[[-1.665,1.065,0,.06,2.01,1.73],[1.665,1.065,0,.06,2.01,1.73]]);
    instances(body,skinMaterials[1],[[1.701,2,.0,.012,.023,1.60]]);
    instances(wall,skinMaterials[0],[[0,1.065,.842,3.39,2.01,.045]]);
    instances(roof,skinMaterials[0],[[0,2.045,0,3.39,.05,1.73]]);
    const rails = [], screws = [];
    for (const x of [-1.64,1.64]) for (const z of [-.81,.81]) rails.push([x,1.065,z,.045,2.01,.045]);
    for (const x of [-1.70,1.70]) for (const z of [-.72,.72]) for (const y of [.18,.62,1.14,1.87]) screws.push([x,y,z,.027,.03,.027,0,0,Math.PI/2]);
    instances(body,mats.silver,rails); instances(body,mats.dark,screws,CYLINDER);
    const ports = part(body,'coolant-ports');
    for (const z of [-.25,.35]) {
        instances(ports,mats.copper,[[1.79,.47,z,.10,.22,.10,0,0,Math.PI/2]],CYLINDER);
        instances(ports,mats.silver,[[1.91,.47,z,.068,.08,.068,0,0,Math.PI/2]],CYLINDER);
        instances(ports,mats.dark,[[1.954,.47,z,.045,.012,.045,0,0,Math.PI/2]],CYLINDER);
        ring(ports,mats.silver,1.86,.47,z,.084,0,Math.PI/2);
    }
    const boards = part(body,'three-hashboards'), plates = part(body,'cold-plates');
    for (const y of [.4,.87,1.34]) {
        instances(boards,mats.board,[[0,y,.17,2.95,.05,1.1]]);
        instances(plates,mats.silver,[[0,y+.12,.17,2.88,.16,1.02]]);
        instances(plates,mats.frame,[[0,y+.10,.685,2.78,.015,.012]]);
        const bolts = [];
        for (let x = -1.25; x <= 1.26; x += .5) for (const z of [-.28,.61]) bolts.push([x,y+.211,z,.025,.02,.025]);
        instances(plates,mats.dark,bolts,CYLINDER);
        for (const z of [-.20,.42]) lineTube(plates,[[1.36,y+.12,z],[1.50,y+.12,z],[1.50,.47,z]],mats.copper,.05);
    }
    const psu = part(body,'integrated-supply');
    instances(psu,mats.silver,[[0,1.05,-.61,3.08,1.83,.36]]);
    for (let y = .3; y < 1.9; y += .13) instances(psu,mats.frame,[[0,y,-.805,2.9,.028,.025]]);
    instances(psu,mats.dark,[[1.711,1.55,-.55,.022,.38,.29]]);
    const ctrl = part(body,'control-board');
    instances(ctrl,mats.board,[[-.40,1.82,.15,1.65,.045,.9]]);
    instances(ctrl,mats.dark,[[-.45,1.90,.1,.32,.10,.3],[.26,1.90,.13,.22,.10,.32]]);
    instances(ctrl,mats.silver,[[-1.1,1.91,.37,.25,.15,.28]]);
    instances(body,mats.dark,[[1.711,1.8,.23,.026,.13,.19]]);
    instances(body,mats.led,[[1.73,1.79,.4,.02,.034,.034]]);
    const bus = part(body,'copper-busbars');
    instances(bus,mats.copper,[[-1.44,1,.37,.055,1.63,.055],[-1.32,1,.37,.055,1.63,.055]]);
    const unit = {root:body,roof,wall,fans:[],skinMaterials,cooling:'hydro',kind:'machine'};
    return finishScene(root,mats,[unit],{view:'asic',targets:{ports,boards,heat:plates,psu,ctrl,bus},
        inspectTarget:new THREE.Vector3(0,1.8,0),inspectBounds:new THREE.Box3(new THREE.Vector3(-1.85,0,-1),new THREE.Vector3(2,3.4,1))});
}

// Convert the original authored plant geometry into lit meshes. Positions, paths,
// landfill contours and ground footprints remain owned by the original scenes.
function legacyPart(diagram, renderable, mats) {
    const root = new THREE.Group(), records = [], projected = [];
    root.name = renderable.id;
    const marker = record => { records.push(record); return '~'+(records.length-1)+'~'; };
    const poly = points => marker({points,closed:true});
    const line = (a,b) => marker({points:[a,b],closed:false});
    const ringPath = (axis,cx,cy,cz,r,yaw,steps = 24) => marker({closed:false,points:Array.from({length:steps+1},(_,i) => {
        const t = i/steps*Math.PI*2;
        return axis === 'x' ? [cx,cy+Math.cos(t)*r,cz+Math.sin(t)*r] :
            axis === 'y' ? [cx+Math.cos(t)*r,cy,cz+Math.sin(t)*r] : [cx+Math.cos(t)*r,cy+Math.sin(t)*r,cz];
    })});
    const H = {...diagram.H,newLayers:diagram.H.newLayers,poly,polyInside:poly,line,
        frontFacing:() => true,
        project:p => { projected.push(p.slice()); return [1000000+projected.length,1000000+projected.length]; },
        n1:n => n,
        ring:(...args) => ringPath('z',...args),ringX:(...args) => ringPath('x',...args),ringY:(...args) => ringPath('y',...args),
        addBox:(layers,b,yaw,skip = []) => {
            for (const [face,points] of Object.entries(diagram.H.boxFaces(b))) if (!skip.includes(face)) layers.top += poly(points);
        }};
    const layers = renderable.build(H,0), flame = part(root,'combustion');
    const flowCurves = [];
    for (const [layer,value] of Object.entries(layers)) {
        if (!value) continue;
        const paths = [];
        for (const m of String(value).matchAll(/~(\d+)~/g)) paths.push(records[Number(m[1])]);
        // Some of the source's pipes / flame outlines assemble their path using
        // project(). The encoded points recover the original 3D path losslessly.
        let path = null;
        for (const m of String(value).replace(/~\d+~/g,'').matchAll(/([ML])\s*([-\d.e+]+)[ ,]+([-\d.e+]+)|Z/gi)) {
            if (m[0].toUpperCase() === 'Z') { if (path) path.closed = true; continue; }
            const point = projected[Math.round(Number(m[2]))-1000001];
            if (!point) continue;
            if (m[1].toUpperCase() === 'M' || !path) { path = {points:[],closed:false}; paths.push(path); }
            path.points.push(point);
        }
        const triangles = [], segments = [];
        for (const path of paths) {
            if (!path || path.points.length < 2) continue;
            const points = path.points;
            if (path.closed && points.length >= 3) {
                const normal = new THREE.Vector3();
                for (let i = 0; i < points.length; i++) {
                    const a = points[i], b = points[(i+1)%points.length];
                    normal.x += (a[1]-b[1])*(a[2]+b[2]); normal.y += (a[2]-b[2])*(a[0]+b[0]); normal.z += (a[0]-b[0])*(a[1]+b[1]);
                }
                const values = [Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)], axis = values.indexOf(Math.max(...values));
                const shape = points.map(p => new THREE.Vector2(p[(axis+1)%3],p[(axis+2)%3]));
                for (const tri of THREE.ShapeUtils.triangulateShape(shape,[])) for (const index of tri) triangles.push(...points[index]);
            } else {
                if (layer === 'flow') flowCurves.push(points);
                for (let i = 1; i < points.length; i++) segments.push(...points[i-1],...points[i]);
            }
        }
        const parent = layer === 'flame' ? flame : root;
        if (triangles.length) {
            const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3)); geometry.computeVertexNormals();
            const mat = layer === 'flame' ? mats.flow.clone() : layer === 'ground' || renderable.id === 'ground' ? mats.ground :
                renderable.id === 'cell' && layer !== 'detail' ? mats.earth : layer === 'inside' ? mats.dark : mats.shell;
            mat.side = THREE.DoubleSide;
            const mesh = new THREE.Mesh(geometry,mat); mesh.castShadow = renderable.id !== 'ground'; mesh.receiveShadow = true; parent.add(mesh);
        }
        if (segments.length) {
            const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
            const mat = new THREE.LineBasicMaterial({color:layer === 'flow' || layer === 'flame' ? 0xf7931a : 0x90908d,
                transparent:true,opacity:layer === 'flow' || layer === 'flame' ? .85 : .36});
            parent.add(new THREE.LineSegments(geometry,mat));
        }
    }
    return {root,flame,flowCurves};
}

function calloutRegions(diagram) {
    const result = {};
    diagram.CALLOUTS.forEach(co => {
        const regions = [];
        for (const b of diagram.regionBoxes(co.id) || []) {
            if (![b.x,b.y,b.z,b.w,b.h,b.d].every(Number.isFinite)) continue;
            regions.push(new THREE.Box3(new THREE.Vector3(b.x-b.w/2,b.y,b.z-b.d/2),new THREE.Vector3(b.x+b.w/2,b.y+b.h,b.z+b.d/2)));
        }
        if (!regions.length) regions.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...co.at),new THREE.Vector3(.3,.3,.3)));
        result[co.id] = regions;
    });
    return result;
}

/** Detailed models follow the existing scene's authored equipment positions. */
export function buildPresentation(view, definition) {
    const main = definition?.main, before = definition?.before;
    if (!main?.scene) throw new Error('The original presentation layout is required');
    if (view === 'hosting' || view === 'asic') {
        const yard = view === 'hosting' ? buildHostedContainer() : buildHydroMachine();
        yard.layout = main.scene.view; yard.calloutSets = {after:main.CALLOUTS};
        yard.targetBounds = {};
        for (const co of main.CALLOUTS) {
            const object = yard.targets[co.id];
            if (object) yard.targetBounds[co.id] = new THREE.Box3().setFromObject(object);
        }
        return yard;
    }
    const mats = palette(), root = new THREE.Group(), mining = before ? part(root,'proton-deployment') : root;
    const containers = [], fans = [], pulses = [], targets = {}, flames = part(root,'combustion-state');
    const source = before || main;
    for (const r of source.scene.renderables) {
        if (/^cont\d*$/.test(r.id)) continue;
        const model = presentationEquipment(source,r,mats,view); root.add(model.root); targets[r.id] = model.root;
        Object.assign(targets,model.targets); fans.push(...(model.fans || []));
        if (model.flame?.children.length) flames.attach(model.flame);
    }
    if (before) {
        const existing = new Set(before.scene.renderables.map(r => r.id));
        for (const r of main.scene.renderables) {
            if (existing.has(r.id) || /^cont\d*$/.test(r.id)) continue;
            const model = presentationEquipment(main,r,mats,view); mining.add(model.root); targets[r.id] = model.root;
            Object.assign(targets,model.targets); fans.push(...(model.fans || []));
        }
    }
    const positions = main.CONTAINERS || main.scene.renderables.filter(r => /^cont\d*$/.test(r.id))
        .map(r => ({x:r.at[0],y:0,z:r.at[2],w:12.19,h:2.59,d:2.44}));
    positions.forEach((position,index) => {
        const unit = containerUnit(mats,'hydro',1);
        unit.root.position.set(position.x,position.y,position.z); unit.root.scale.x = position.w/12.2;
        unit.index = index; unit.open = 0; unit.root.userData.containerIndex = index;
        if (position.mast) {
            const mast = part(unit.root,'uplink');
            instances(mast,mats.silver,[[5.6,3.45,-.5,.035,1.70,.035]],CYLINDER);
            instances(mast,mats.orange,[[5.6,4.28,-.5,.08,.045,.08]],CYLINDER);
            unit.network = mast;
        }
        mining.add(unit.root); containers.push(unit); fans.push(...unit.fans); targets['cont'+index] = unit.root;
    });
    const anchorIndex = Number(String(main.ANCHOR_SLOT || 'cont'+Math.max(0,containers.length-2)).replace('cont',''));
    const anchor = containers[anchorIndex];
    if (anchor) Object.assign(targets,{shell:anchor.root,asics:anchor.rack,pdu:anchor.pdu,net:anchor.network,cool:anchor.roof,
        load:anchor.root,cont:anchor.root});
    if (targets.cond) targets.gas = targets.cond;
    if (targets.flare) Object.assign(targets,{stack:targets.flare,keep:targets.flare,flame:flames});
    if (targets.cell) { targets.wells ||= targets.cell; targets.header ||= targets.cell; }
    if (targets.plant) targets.blower ||= targets.plant;
    targets.space = root;
    const flow = legacyPart(main,{id:'power-and-gas-flow',build:H => ({flow:main.scene.flow(H,0)})},mats);
    mining.add(flow.root);
    flow.flowCurves.forEach((points,i) => {
        if (points.length < 2) return;
        const curve = new THREE.CurvePath();
        for (let j = 1; j < points.length; j++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[j-1]),new THREE.Vector3(...points[j])));
        const mesh = new THREE.Mesh(SPHERE,mats.pulse); mesh.scale.setScalar(.6); mining.add(mesh); pulses.push({mesh,curve,offset:i*.13});
    });
    // Comparison fades only the added plant. Shared source equipment never moves
    // or fades, and X-ray only changes the container envelope.
    const materialMap = new Map();
    if (before) mining.traverse(object => {
        if (!object.material) return;
        const old = object.material;
        if (!materialMap.has(old)) {
            const copy = old.clone(); copy.userData.baseOpacity = old.opacity;
            materialMap.set(old,copy);
        }
        object.material = materialMap.get(old);
    });
    if (before) containers.forEach(unit => { unit.skinMaterials = unit.skinMaterials.map(m => materialMap.get(m) || m); });
    const yard = finishScene(root,mats,containers,{view,targets,fans,pulses,flame:flames,
        mining:before ? mining : null,layout:main.scene.view,
        calloutSets:{before:before?.CALLOUTS,after:main.CALLOUTS},
        targetRegionSets:{before:before ? calloutRegions(before) : null,after:calloutRegions(main)},
        miningMaterials:[...materialMap.values()],operatingMaterials:[materialMap.get(mats.led),materialMap.get(mats.flow)].filter(Boolean)});
    // New container internals can sit on a different side of the same envelope.
    // Point their labels at the modeled component, not its old rack position.
    yard.targetBounds = {};
    yard.targetRegions = {};
    for (const id of ['gen','gas','cond','xfmr','flare','stack','keep','flame','blower','well','sep','tanks']) {
        if (targets[id]) yard.targetBounds[id] = new THREE.Box3().setFromObject(targets[id]);
    }
    if (targets.wells?.name === 'wellfield') yard.targetRegions.wells = targets.wells.children.map(o => new THREE.Box3().setFromObject(o));
    if (view === 'site') for (const [id,key] of [['asics','rack'],['pdu','pdu'],['cool','roof'],['shell','root']]) {
        yard.targetRegions[id] = containers.map(unit => new THREE.Box3().setFromObject(unit[key]));
    }
    if (view === 'site') for (const id of ['asics','pdu','net','cool']) {
        if (targets[id]) yard.targetBounds[id] = new THREE.Box3().setFromObject(targets[id]);
    }
    return yard;
}


export function setSceneXray(yard, enabled) {
    yard.containers.forEach(unit => unit.skinMaterials.forEach(mat => {
        mat.userData.xrayOpacity = enabled ? .15 : 1;
        mat.transparent = !!enabled; mat.opacity = enabled ? .15 : 1;
        mat.depthWrite = !enabled; mat.needsUpdate = true;
    }));
    setSceneProgress(yard,yard.progress ?? 1);
}

export function setSceneProgress(yard, progress) {
    yard.progress = progress;
    if (!yard.mining) return;
    yard.mining.visible = progress > .001;
    for (const mat of yard.miningMaterials) {
        mat.opacity = progress*(mat.userData.xrayOpacity ?? mat.userData.baseOpacity ?? 1);
        const transparent = mat.opacity < 1;
        if (mat.transparent !== transparent) mat.needsUpdate = true;
        mat.transparent = transparent; mat.depthWrite = !transparent;
    }
    yard.flame.traverse(object => {
        if (object.material?.emissive) object.material.emissiveIntensity = .15+(1-progress)*1.5;
        if (object.material?.isLineBasicMaterial) object.material.opacity = .12+(1-progress)*.6;
    });
}

function disposeYard(yard) {
    if (!yard) return;
    const geometries = new Set(), materials = new Set();
    yard.root.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry && ![BOX,CYLINDER,SPHERE,RING,ROUND_CYLINDER,OPEN_CYLINDER,DOME].includes(o.geometry)) geometries.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
    });
    Object.values(yard.mats).forEach(m => materials.add(m));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

// Fit the subject to the actual viewport, reserving room for the two captions.
// A bounding sphere wastes most of a wide preview on these long, low sites.
function cameraPose(bounds, target, aspect, direction, sweep = 0, fov = 38, frameWidth = .92, frameHeight = .75) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov)/2), tanH = tanV*aspect;
    let distance = 1;
    for (const angle of [-sweep,0,sweep]) {
        const toward = direction.clone().applyAxisAngle(UP,angle).normalize();
        const right = new THREE.Vector3().crossVectors(UP,toward).normalize();
        const up = new THREE.Vector3().crossVectors(toward,right).normalize();
        for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
            const point = new THREE.Vector3(x,y,z).sub(target), depth = point.dot(toward);
            distance = Math.max(distance,depth+Math.abs(point.dot(right))/(tanH*frameWidth),depth+Math.abs(point.dot(up))/(tanV*frameHeight));
        }
    }
    return target.clone().add(direction.clone().normalize().multiplyScalar(distance*1.02));
}
export function yardCameraPose(yard, aspect) {
    if (yard.layout) {
        const v = yard.layout, nativeAspect = v.VB.w/v.VB.h;
        // The authored camera has room for the original two callout columns.
        // On a phone the cards move below the model, so reclaim those columns.
        const mobile = aspect < 2, gain = mobile ? .58 : 1;
        const distance = v.FOV/v.BASE_SCALE*Math.max(1,nativeAspect/aspect*gain);
        const pitch = v.BASE_PITCH, yaw = v.BASE_YAW || 0;
        const target = new THREE.Vector3(-v.SHIFT_X,0,0);
        const direction = new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
        return {target,position:target.clone().addScaledVector(direction,distance),
            fov:THREE.MathUtils.radToDeg(2*Math.atan(v.VB.h/(2*v.FOV))),
            verticalOffset:mobile ? 0 : .5-v.ORIGIN.y/v.VB.h};
    }
    const target = yard.bounds.getCenter(new THREE.Vector3());
    target.y = yard.view === 'asic' ? .9 : .7;
    return { target, position: cameraPose(yard.bounds,target,aspect,new THREE.Vector3(.8,.86,1.3),.075) };
}

export function wheelZoomFactor(event, pageHeight = 800) {
    if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY)) return 1;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1);
    return Math.exp(THREE.MathUtils.clamp(pixels,-240,240)*.0015);
}

export function mountMineScene(host, callbacks = {}) {
    const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.6));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
    host.appendChild(renderer.domElement);
    const canvas = renderer.domElement; canvas.tabIndex = 0;
    canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','Interactive 3D model. Drag to orbit, scroll to zoom. Keyboard: arrow keys rotate, plus and minus zoom, X toggles X-ray, and Escape resets.');
    const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38,1,.1,1000);
    const env = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(env,.04); world.environment = envTarget.texture; world.environmentIntensity = 1.1;
    env.dispose(); pmrem.dispose();
    world.add(new THREE.HemisphereLight(0xf4f3ef,0x202020,1.35));
    const sun = new THREE.DirectionalLight(0xfffaf0,2.6); sun.position.set(-10,30,16);
    sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); sun.shadow.bias = -.0006;
    sun.shadow.normalBias = .05; sun.shadow.camera.near = .1; sun.shadow.camera.far = 140;
    world.add(sun); world.add(sun.target);
    const rim = new THREE.DirectionalLight(0xf0efeb,2.0); rim.position.set(12,14,-18); world.add(rim);
    const controls = new OrbitControls(camera,canvas);
    controls.enableDamping = false; controls.enablePan = false; controls.enableZoom = true;
    controls.minPolarAngle = .30; controls.maxPolarAngle = Math.PI*.46;
    canvas.style.touchAction = 'pan-y';
    const interactionSurface = callbacks.interactionSurface || host;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches, yard = null, active = false, visible = true, disposed = false, lost = false;
    let powered = true, powerLevel = 1, selected = -1, touchControl = false, manual = false, xray = false, progress = 1;
    let highlight = null, focus = null, hoveredPart = null;
    let autoRotate = !reduced, rotateOverride = null, dragging = false, resumeAt = 0;
    let annotations = [], viewportWidth = 0, viewportHeight = 0;
    let viewOffset = 0, desiredViewOffset = 0;
    let raf = 0, last = 0, elapsed = 0, buildTime = 0, key = '', transitioning = false;
    const desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), homePosition = new THREE.Vector3();
    const homeTarget = new THREE.Vector3(0,.7,0);

    function resize() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h || (w === viewportWidth && h === viewportHeight)) return;
        viewportWidth = w; viewportHeight = h;
        renderer.setSize(w,h,false); camera.aspect = w/h; applyViewOffset();
        if (yard && focus) focusPart(focus.id,false);
        else if (yard && selected < 0) fit(false);
        else if (yard && selected >= 0) inspect(true,selected);
        wake();
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    function applyViewOffset() {
        if (Math.abs(viewOffset) > .000001 && viewportWidth && viewportHeight) camera.setViewOffset(viewportWidth,viewportHeight,0,viewOffset*viewportHeight,viewportWidth,viewportHeight);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
    }
    function fit(instant) {
        if (!yard) return;
        const pose = yardCameraPose(yard,camera.aspect);
        camera.fov = pose.fov || 38;
        desiredViewOffset = pose.verticalOffset || 0;
        camera.updateProjectionMatrix();
        homePosition.copy(pose.position); homeTarget.copy(pose.target);
        desiredTarget.copy(homeTarget); desiredPosition.copy(homePosition);
        controls.minDistance = yard.view === 'asic' ? 1.2 : yard.view ? homePosition.distanceTo(homeTarget)*.2 : 6;
        controls.maxDistance = homePosition.distanceTo(homeTarget)*2.5;
        transitioning = true;
        if (instant || reduced) {
            viewOffset = desiredViewOffset; applyViewOffset();
            camera.position.copy(desiredPosition); controls.target.copy(desiredTarget); controls.update(); transitioning = false;
        }
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    function wake() { if (!raf && active && visible && !disposed && !lost && !document.hidden) raf = requestAnimationFrame(tick); }
    function tick(ms) {
        raf = 0;
        if (!active || !visible || disposed || lost || document.hidden) return;
        const dt = last ? Math.min((ms-last)/1000,.05) : 0; last = ms; elapsed += dt; buildTime += dt;
        if (yard) {
            powerLevel = reduced ? (powered ? 1 : 0) : THREE.MathUtils.damp(powerLevel,powered ? 1 : 0,3.8,dt);
            yard.mats.led.emissiveIntensity = .05+powerLevel*3;
            yard.mats.flow.emissiveIntensity = .03+powerLevel*1.5;
            for (const mat of yard.operatingMaterials || []) mat.emissiveIntensity = .05+powerLevel*1.7;
            yard.containers.forEach((unit,i) => {
                const assembly = reduced || yard.view ? 1 : THREE.MathUtils.smoothstep(buildTime-i*.055,0,.65);
                unit.root.scale.y = Math.max(.001,assembly);
                const target = selected === i ? 1 : 0;
                unit.open = reduced ? target : THREE.MathUtils.damp(unit.open,target,5,dt);
                unit.roof.position.y = unit.open*(unit.kind === 'machine' ? 1.1 : 2.5);
                unit.wall.position.z = unit.open*(unit.kind === 'machine' ? 1.1 : 2.6);
                unit.wall.position.y = unit.open*.7;
                unit.wall.visible = unit.open < .97;
            });
            if (!reduced) yard.fans.forEach(fan => { fan.rotation.y += dt*powerLevel*9; });
            yard.pulses.forEach(p => {
                p.mesh.visible = powered && !reduced;
                if (p.mesh.visible) p.mesh.position.copy(p.curve.getPoint((elapsed*.18+p.offset)%1));
            });
        }
        if (manual && !dragging && elapsed >= resumeAt) manual = false;
        if (transitioning) {
            const a = reduced ? 1 : 1-Math.exp(-dt*4.5);
            camera.position.lerp(desiredPosition,a); controls.target.lerp(desiredTarget,a);
            viewOffset = THREE.MathUtils.lerp(viewOffset,desiredViewOffset,a); applyViewOffset();
            const tolerance = Math.max(.0001,camera.position.distanceTo(controls.target)*.0001);
            if (camera.position.distanceTo(desiredPosition) < tolerance && controls.target.distanceTo(desiredTarget) < tolerance && Math.abs(viewOffset-desiredViewOffset) < .00001) {
                camera.position.copy(desiredPosition); controls.target.copy(desiredTarget);
                viewOffset = desiredViewOffset; applyViewOffset(); transitioning = false;
            }
        } else if (autoRotate && !manual && !dragging && selected < 0) {
            if (focus) {
                focus.phase += dt*.5;
                camera.position.copy(controls.target).add(focus.offset.clone().applyAxisAngle(UP,Math.sin(focus.phase)*.18));
            } else {
                const offset = camera.position.clone().sub(controls.target);
                offset.applyAxisAngle(UP,-dt*1000/(yard?.layout?.PERIOD || 60000)*Math.PI*2);
                camera.position.copy(controls.target).add(offset);
            }
        }
        controls.update(); renderer.render(world,camera); updateCallouts();
        // Idle motion and operating motion pause completely for reduced-motion visitors.
        if (!reduced || autoRotate || transitioning) wake();
    }
    function inspect(open, index) {
        if (yard?.view) { setXray(open); return; }
        if (!yard || !yard.containers.length || (yard.mining && progress < .01)) return;
        focus = null; highlightPart(null);
        if (index === undefined) index = Math.max(0,yard.containers.length-2);
        selected = open ? Math.min(index,yard.containers.length-1) : -1;
        manual = true; resumeAt = elapsed+3;
        if (selected >= 0) {
            yard.root.updateMatrixWorld(true);
            const origin = yard.containers[selected].root.getWorldPosition(new THREE.Vector3());
            desiredTarget.copy(yard.inspectTarget || origin.clone().add(new THREE.Vector3(0,2.0,0)));
            const bounds = yard.inspectBounds || new THREE.Box3(origin.clone().add(new THREE.Vector3(-6.4,0,-1.4)),origin.clone().add(new THREE.Vector3(6.4,6.0,1.4)));
            desiredPosition.copy(cameraPose(bounds,desiredTarget,camera.aspect,new THREE.Vector3(.5,.65,1.4)));
            transitioning = true;
        } else fit(false);
        callbacks.onInspect?.(selected >= 0); wake();
    }
    function setConfig(config) {
        if (!config || (!config.valid && !config.view)) return;
        const nextKey = config.view || [config.containers,config.count,config.perContainer,config.generators,config.settings.source,config.settings.cooling].join(':');
        if (nextKey === key) return;
        key = nextKey;
        clearHighlight();
        focus = null; hoveredPart = null; manual = false; dragging = false; resumeAt = 0;
        if (yard) { world.remove(yard.root); disposeYard(yard); }
        yard = config.view ? buildPresentation(config.view,config.definition) : buildYard(config);
        setSceneXray(yard,xray); world.add(yard.root); buildTime = reduced ? 10 : 0;
        selected = -1; callbacks.onInspect?.(false);
        const extent = Math.max(yard.width,yard.depth)*.75;
        Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent}); sun.shadow.camera.updateProjectionMatrix();
        setProgress(progress); fit(true); resize(); wake();
    }
    function zoom(factor) {
        if (!yard || !Number.isFinite(factor) || factor <= 0 || factor === 1) return false;
        const offset = camera.position.clone().sub(controls.target), distance = offset.length();
        const next = THREE.MathUtils.clamp(distance*factor,controls.minDistance,controls.maxDistance);
        if (Math.abs(next-distance) < .00001) return false;
        offset.setLength(next);
        camera.position.copy(controls.target).add(offset); controls.update(); pauseOrbit(); wake();
        return true;
    }
    function clearHighlight() {
        if (!highlight) return;
        world.remove(highlight);
        const materials = new Set();
        highlight.traverse(o => {
            if (o.isInstancedMesh) o.dispose();
            if (o.geometry && o.geometry !== BOX) o.geometry.dispose();
            if (o.material) materials.add(o.material);
        });
        materials.forEach(m => m.dispose()); highlight = null;
    }
    function partRegions(id) {
        if (yard?.targetRegions?.[id]) return yard.targetRegions[id].map(b => b.clone());
        if (yard?.targetBounds?.[id]) return [yard.targetBounds[id].clone()];
        if (yard?.containers.length && ['load','cont'].includes(id) && progress >= .5) return yard.containers.map(unit => new THREE.Box3().setFromObject(unit.root));
        const defined = yard?.targetRegionSets?.[progress < .5 ? 'before' : 'after']?.[id];
        if (defined) return defined.map(b => b.clone());
        const target = yard?.targets?.[id];
        return target ? [new THREE.Box3().setFromObject(target)] : [];
    }
    function partBounds(id) {
        const bounds = new THREE.Box3();
        partRegions(id).forEach(b => bounds.union(b));
        return bounds.isEmpty() ? null : bounds;
    }
    function highlightPart(id) {
        hoveredPart = id || null;
        clearHighlight();
        const current = hoveredPart || focus?.id, regions = partRegions(current).filter(b => !b.isEmpty());
        if (regions.length) {
            highlight = new THREE.Group(); highlight.name = 'section-highlight';
            // Filled regions reproduce the original whole-section highlight,
            // including all containers / wells belonging to a single label.
            const fill = new THREE.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.16,depthWrite:false,depthTest:false});
            const volumes = instances(highlight,fill,regions.map(b => {
                const center = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).addScalar(.06);
                return [...center.toArray(),...size.toArray()];
            }));
            volumes.castShadow = false; volumes.receiveShadow = false; volumes.renderOrder = 20;
            regions.forEach(b => {
                const outline = new THREE.Box3Helper(b.expandByScalar(.03),0xffae4b);
                outline.material.transparent = true; outline.material.opacity = .65;
                outline.material.depthTest = false; outline.material.depthWrite = false; outline.renderOrder = 21;
                highlight.add(outline);
            });
            world.add(highlight);
        }
        callbacks.onPart?.(current || null); wake();
    }
    function updateCallouts() {
        if (!yard || !callbacks.onProject) return;
        const points = annotations.map(co => {
            let point;
            if (yard.targetBounds?.[co.id]) point = yard.targetBounds[co.id].getCenter(new THREE.Vector3());
            else if (co.at) point = new THREE.Vector3(...co.at);
            if (!point) return {id:co.id,visible:false};
            point.project(camera);
            return {id:co.id,x:(point.x+1)/2,y:(1-point.y)/2,visible:point.z>-1 && point.z<1};
        });
        callbacks.onProject(points);
    }
    function focusPart(id, toggle = true) {
        if (toggle && focus?.id === id) { reset(); return; }
        const bounds = partBounds(id);
        if (!bounds) return;
        if (['asics','pdu','loop','cdu','spares','boards','heat','ctrl','bus','psu','net'].includes(id)) setXray(true);
        const direction = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        direction.phi = THREE.MathUtils.clamp(direction.phi,.45,1.18); direction.radius = 1;
        desiredViewOffset = 0;
        desiredTarget.copy(bounds.getCenter(new THREE.Vector3()));
        desiredPosition.copy(cameraPose(bounds,desiredTarget,camera.aspect,new THREE.Vector3().setFromSpherical(direction),.18,camera.fov,camera.aspect >= 2 ? .52 : .86,.7));
        focus = {id,offset:desiredPosition.clone().sub(desiredTarget),phase:0};
        controls.minDistance = Math.max(.25,focus.offset.length()*.22);
        selected = -1; manual = false; transitioning = true;
        highlightPart(null); callbacks.onInspect?.(false); wake();
    }
    function setXray(value) { xray = !!value; if (yard) setSceneXray(yard,xray); callbacks.onXray?.(xray); wake(); }
    function setProgress(value) {
        const next = THREE.MathUtils.clamp(Number(value) || 0,0,1), changed = next !== progress;
        progress = next;
        if (yard?.mining) {
            if (selected >= 0 && progress < .01) { selected = -1; fit(false); callbacks.onInspect?.(false); }
            setSceneProgress(yard,progress);
        }
        if (changed) { if (focus) reset(); else highlightPart(null); }
        wake();
    }
    function reset() { focus = null; highlightPart(null); manual = false; selected = -1; fit(false); callbacks.onInspect?.(false); wake(); }
    function pauseOrbit() {
        manual = true; transitioning = false; resumeAt = elapsed+3;
        if (focus) { focus.offset.copy(camera.position).sub(controls.target); focus.phase = 0; }
    }
    const startInteraction = () => { dragging = true; pauseOrbit(); wake(); };
    const endInteraction = () => { dragging = false; pauseOrbit(); wake(); };
    controls.addEventListener('start',startInteraction); controls.addEventListener('end',endInteraction); controls.addEventListener('change',wake);
    let pointer = null;
    const contacts = new Set();
    function wheel(event) {
        // Own the WHOLE rendering panel, including annotation / caption layers.
        // Canvas-only listeners miss wheel events targeted at those overlays.
        if (!active || !yard) return;
        event.stopImmediatePropagation();
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        zoom(wheelZoomFactor(event,interactionSurface.clientHeight || host.clientHeight));
    }
    function down(event) {
        if (event.pointerType === 'touch' && !touchControl) { event.stopImmediatePropagation(); return; }
        contacts.add(event.pointerId);
        if (pointer) pointer.multi = true;
        else pointer = {x:event.clientX,y:event.clientY,id:event.pointerId,multi:contacts.size>1};
    }
    function up(event) {
        contacts.delete(event.pointerId);
        if (!pointer || event.pointerId !== pointer.id) return;
        const moved = Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y), multi = pointer.multi; pointer = null;
        if (moved > 7 || multi || !yard || event.button > 0) return;
        const rect = canvas.getBoundingClientRect(), point = new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(point,camera);
        const hit = ray.intersectObjects(yard.containers.map(unit => unit.root),true).find(candidate => {
            for (let object = candidate.object; object; object = object.parent) if (!object.visible) return false;
            return true;
        });
        if (hit) {
            let object = hit.object;
            while (object && object.userData.containerIndex === undefined) object = object.parent;
            if (object) {
                if (yard.view) setXray(!xray);
                else inspect(selected !== object.userData.containerIndex,object.userData.containerIndex);
            }
        }
    }
    function keydown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key.toLowerCase() === 'x') { event.preventDefault(); setXray(!xray); return; }
        if (event.key === 'Enter') { event.preventDefault(); if (yard?.view) setXray(!xray); else inspect(selected < 0); return; }
        if (event.key === 'Escape' || event.key === '0') { event.preventDefault(); reset(); return; }
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.8); return; }
        if (event.key === '-') { event.preventDefault(); zoom(1.25); return; }
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        if (event.key === 'ArrowLeft') spherical.theta -= .12;
        if (event.key === 'ArrowRight') spherical.theta += .12;
        if (event.key === 'ArrowUp') spherical.phi -= .10;
        if (event.key === 'ArrowDown') spherical.phi += .10;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update(); pauseOrbit(); wake();
    }
    function visibility() { if (document.hidden) stop(); else wake(); }
    function motion(event) { reduced = event.matches; if (rotateOverride === null) { autoRotate = !reduced; callbacks.onRotate?.(autoRotate); } wake(); }
    function contextLost(event) { event.preventDefault(); lost = true; stop(); callbacks.onError?.(); }
    function contextRestored() { lost = false; callbacks.onRestore?.(); wake(); }
    interactionSurface.addEventListener('wheel',wheel,{passive:false,capture:true});
    canvas.addEventListener('pointerdown',down,true); canvas.addEventListener('pointerup',up);
    canvas.addEventListener('pointercancel',event => { contacts.delete(event.pointerId); pointer = null; });
    canvas.addEventListener('keydown',keydown); canvas.addEventListener('webglcontextlost',contextLost);
    canvas.addEventListener('webglcontextrestored',contextRestored); document.addEventListener('visibilitychange',visibility);
    media.addEventListener('change',motion);
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) wake(); else stop(); },{threshold:0}); observer.observe(host);
    resize();
    callbacks.onRotate?.(autoRotate);
    return {
        setConfig, inspect, zoom, reset, setXray, setProgress, focusPart, highlightPart,
        setAutoRotate(value) { autoRotate = !!value; rotateOverride = autoRotate; callbacks.onRotate?.(autoRotate); wake(); },
        setAnnotations(value) { annotations = value || []; updateCallouts(); wake(); },
        energize(value) { powered = !!value; wake(); },
        setTouchControl(value) { touchControl = !!value; canvas.style.touchAction = touchControl ? 'none' : 'pan-y'; },
        setActive(value) { active = !!value; if (active) { resize(); wake(); } else stop(); },
        dispose() {
            disposed = true; stop(); resizeObserver.disconnect(); observer.disconnect(); controls.dispose();
            media.removeEventListener('change',motion); document.removeEventListener('visibilitychange',visibility);
            interactionSurface.removeEventListener('wheel',wheel,true);
            clearHighlight(); disposeYard(yard); envTarget.dispose(); renderer.dispose(); canvas.remove();
        }
    };
}
