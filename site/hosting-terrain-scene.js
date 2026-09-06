/* Procedural regional dioramas, not surveyed facility coordinates or layouts.
   All geometry is local. The existing renderer owns interaction and lifecycle. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export const REGIONS = Object.freeze({
    permian: {seed:13, label:'Terraced ridges · dry channels', trees:0},
    bakken: {seed:29, label:'Rolling plains · shallow valleys', trees:34},
    alberta: {seed:47, label:'Foothills · conifer stands', trees:155},
    'cold-lake': {seed:71, label:'Lake edge · boreal forest', trees:165},
    'niger-delta': {seed:97, label:'Branching waterways · wooded islands', trees:135}
});
const WIDTH = 108, DEPTH = 86, FLOOR = -7;
const smooth = (a,b,x) => T.MathUtils.smoothstep(x,a,b);
const bell = (x,z,cx,cz,rx,rz) => Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
const roadX = z => 18+Math.sin((z-11)/32*Math.PI)*6;
const riverX = z => -43+Math.sin(z*.10)*4.5;
const branchZ = x => -28+Math.sin(x*.095)*4;

export function terrainHeight(id,x,z) {
    const region = REGIONS[id];
    if (!region) throw new Error('Unknown hosting terrain: '+id);
    const noise = Math.sin(x*.19+region.seed)*Math.cos(z*.15-region.seed)*.58+Math.sin(x*.43+z*.29)*.18;
    let height;
    if (id === 'permian') {
        const mesa = 10*Math.exp(-(((x-31)/15)**4+((z+26)/12)**4));
        height = 1.8+mesa+7*bell(x,z,-37,28,13,19)+noise;
        height -= 1.8*Math.exp(-(((x+41-Math.sin(z*.11)*3)/4)**2));
    } else if (id === 'bakken') {
        height = 2.0+4.5*bell(x,z,-34,-24,22,20)+3.7*bell(x,z,37,25,22,24)+noise*.65;
    } else if (id === 'alberta') {
        height = 1.5+13*bell(x,z,-24,-32,14,12)+10*bell(x,z,21,-29,18,14)+5*bell(x,z,40,23,15,24)+noise;
    } else if (id === 'cold-lake') {
        height = 2.1+5*bell(x,z,30,-28,22,18)+4*bell(x,z,37,29,20,23)+noise*.7;
        const lake = Math.hypot((x+36)/12.5,(z-5)/28);
        height = T.MathUtils.lerp(-1.0,height,smooth(.92,1.20,lake));
    } else {
        height = 1.7+1.7*bell(x,z,36,22,24,22)+noise*.45;
        const channel = Math.min(Math.abs(x-riverX(z))/5.2,Math.abs(z-branchZ(x))/3.6);
        height = T.MathUtils.lerp(-1.1,height,smooth(.7,1.4,channel));
    }
    // The same level pad and access road sit above every regional landscape.
    const pad = Math.max(Math.abs(x)-28,Math.abs(z)-12);
    height = T.MathUtils.lerp(1,height,smooth(0,5,pad));
    const source = Math.max(Math.abs(x+35)-6,Math.abs(z)-8);
    height = T.MathUtils.lerp(1,height,smooth(0,3,source));
    if (z > 9) height = T.MathUtils.lerp(1,height,smooth(2.8,5.4,Math.abs(x-roadX(z))));
    return height;
}

function mesh(parent,geometry,material,name) {
    const item = new T.Mesh(geometry,material); item.name = name || ''; item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
}
function batch(parent,geometry,material,parts,name) {
    if (!parts.length) { geometry.dispose(); return; }
    const item = new T.InstancedMesh(geometry,material,parts.length), pose = new T.Object3D();
    parts.forEach((p,i) => {
        pose.position.set(p[0],p[1],p[2]); pose.scale.set(p[3],p[4],p[5]);
        pose.rotation.set(p[6] || 0,p[7] || 0,p[8] || 0); pose.updateMatrix(); item.setMatrixAt(i,pose.matrix);
    });
    item.name = name; item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
}
function lines(parent,points,color,opacity,name) {
    const geo = new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
    const item = new T.LineSegments(geo,new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
    item.name = name; parent.add(item); return item;
}
function tube(parent,points,material,radius=.12) {
    const curve = new T.CurvePath();
    for (let i=1;i<points.length;i++) curve.add(new T.LineCurve3(new T.Vector3(...points[i-1]),new T.Vector3(...points[i])));
    return mesh(parent,new T.TubeGeometry(curve,points.length*8,radius,8,false),material,'supported-gas-feed');
}

function landform(root,id) {
    const geometry = new T.PlaneGeometry(WIDTH,DEPTH,108,86); geometry.rotateX(-Math.PI/2);
    const pos = geometry.attributes.position, colors = [], low = new T.Color(0x87857f), high = new T.Color(0xc8c5bd);
    for (let i=0;i<pos.count;i++) {
        const y = terrainHeight(id,pos.getX(i),pos.getZ(i)); pos.setY(i,y);
        const c = low.clone().lerp(high,smooth(1,15,y)); colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3)); geometry.computeVertexNormals();
    const ground = mesh(root,geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.40,metalness:.86}),'regional-terrain');
    const contour = [], index = geometry.index;
    for (const level of [2,4,6,8,10,12,14]) {
        for (let i=0;i<index.count;i+=3) {
            const points = [];
            for (let edge=0;edge<3;edge++) {
                const a=index.getX(i+edge), b=index.getX(i+(edge+1)%3), ya=pos.getY(a), yb=pos.getY(b);
                if ((ya < level) === (yb < level)) continue;
                const t=(level-ya)/(yb-ya);
                points.push(pos.getX(a)+(pos.getX(b)-pos.getX(a))*t,level+.035,pos.getZ(a)+(pos.getZ(b)-pos.getZ(a))*t);
            }
            if (points.length===6) contour.push(...points);
        }
    }
    lines(root,contour,0xe5e1d9,.24,'elevation-contours');
    const edge = [], strata = [], vertices = [], color = [], perimeter = [];
    for (let i=0;i<=108;i++) perimeter.push([-54+i,-43]);
    for (let i=1;i<=86;i++) perimeter.push([54,-43+i]);
    for (let i=1;i<=108;i++) perimeter.push([54-i,43]);
    for (let i=1;i<=86;i++) perimeter.push([-54,43-i]);
    for (let i=1;i<perimeter.length;i++) {
        const a=perimeter[i-1], b=perimeter[i], ya=terrainHeight(id,...a), yb=terrainHeight(id,...b);
        for (const point of [[a[0],ya,a[1]],[a[0],FLOOR,a[1]],[b[0],yb,b[1]],[b[0],yb,b[1]],[a[0],FLOOR,a[1]],[b[0],FLOOR,b[1]]]) {
            vertices.push(...point); const c=new T.Color(point[1]===FLOOR?0x282827:0x646361); color.push(c.r,c.g,c.b);
        }
        edge.push(a[0],ya+.025,a[1],b[0],yb+.025,b[1]);
        for (const y of [-3.4,-5.5]) strata.push(a[0],y+Math.sin(i*.09)*.15,a[1],b[0],y+Math.sin((i+1)*.09)*.15,b[1]);
    }
    const skirt = new T.BufferGeometry(); skirt.setAttribute('position',new T.Float32BufferAttribute(vertices,3)); skirt.setAttribute('color',new T.Float32BufferAttribute(color,3)); skirt.computeVertexNormals();
    mesh(root,skirt,new T.MeshStandardMaterial({vertexColors:true,roughness:.58,metalness:.6,side:T.DoubleSide}),'cutaway-earth');
    lines(root,edge,0xd7d4ce,.42,'terrain-rim'); lines(root,strata,0xa6a29b,.26,'geological-strata');
    return ground;
}

function water(root,id,mats) {
    if (id!=='cold-lake' && id!=='niger-delta') return;
    const waterMaterial = new T.MeshStandardMaterial({color:0x515d60,metalness:.89,roughness:.19});
    const shoreline = [];
    if (id==='cold-lake') {
        const points = [new T.Vector3(-36,-.48,5)];
        for (let i=0;i<=100;i++) {
            const a=i/100*Math.PI*2;
            points.push(new T.Vector3(-36+12.1*Math.cos(a),-.48,5+27*Math.sin(a)));
        }
        const geo = new T.BufferGeometry().setFromPoints(points), indexes = [];
        for (let i=1;i<=100;i++) { indexes.push(0,i+1,i); shoreline.push(...points[i].toArray(),...points[i+1].toArray()); }
        geo.setIndex(indexes); geo.computeVertexNormals(); mesh(root,geo,waterMaterial,'lake-water');
    } else {
        for (const branch of [false,true]) {
            const vertices = [], indices = [];
            for (let i=0;i<=108;i++) {
                const t=i/108, along=(branch?WIDTH:DEPTH)*(t-.5), center=branch?branchZ(along):riverX(along), width=branch?3.3:4.9;
                for (const side of [-1,1]) vertices.push(branch?along:center+width*side,-.48,branch?center+width*side:along);
                if (i) { const n=i*2; indices.push(n-2,n,n-1,n-1,n,n+1); }
            }
            const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3)); geo.setIndex(indices); geo.computeVertexNormals();
            const mat=waterMaterial.clone(); mat.side=T.DoubleSide; mesh(root,geo,mat,branch?'tributary-water':'river-water');
            for(let i=2;i<vertices.length/3;i+=2) for(const side of [0,1]) shoreline.push(...vertices.slice((i-2+side)*3,(i-2+side)*3+3),...vertices.slice((i+side)*3,(i+side)*3+3));
        }
        waterMaterial.dispose();
    }
    lines(root,shoreline,0xc9cac6,.24,'waterline');
}

function accessAndSource(root,yard,id) {
    const mats=yard.mats, box=new T.BoxGeometry(1,1,1), cyl=new T.CylinderGeometry(1,1,1,24);
    const vertices=[], indices=[], centerLine=[];
    for(let i=0;i<=64;i++) {
        const z=10.3+(43-10.3)*i/64, x=roadX(z);
        for(const side of [-1,1]) vertices.push(x+side*2.65,terrainHeight(id,x+side*2.65,z)+.09,z);
        centerLine.push(x,terrainHeight(id,x,z)+.105,z);
        if(i) { const n=i*2; indices.push(n-2,n,n-1,n-1,n,n+1); }
    }
    const road=new T.BufferGeometry(); road.setAttribute('position',new T.Float32BufferAttribute(vertices,3)); road.setIndex(indices); road.computeVertexNormals();
    mesh(root,road,mats.dark,'access-road');
    const centerGeo=new T.BufferGeometry(); centerGeo.setAttribute('position',new T.Float32BufferAttribute(centerLine,3));
    const lane=new T.Line(centerGeo,new T.LineDashedMaterial({color:0xbbb5a9,dashSize:1.1,gapSize:1.4,transparent:true,opacity:.5})); lane.computeLineDistances(); root.add(lane);

    const source=new T.Group(); source.name='gas-source'; source.position.y=1.5; root.add(source);
    batch(source,box,mats.ground,[[-35,-.26,0,11,.5,15]],'source-pad');
    batch(source,cyl,mats.shell,[[-37,2.35,-3,1.55,4.7,1.55],[-32.8,2.35,-3,1.55,4.7,1.55],[-35.5,1.8,4,1.0,5.0,1.0,0,0,Math.PI/2]],'gas-vessels');
    batch(source,cyl,mats.copper,[[-37,3.65,-3,1.57,.06,1.57],[-32.8,3.65,-3,1.57,.06,1.57]],'tank-bands');
    batch(source,cyl,mats.frame,[[-37,4.78,-3,.38,.17,.38],[-32.8,4.78,-3,.38,.17,.38]],'tank-access-hatches');
    const ladder=[];
    for(const x of [-37,-32.8]) {
        ladder.push([x-.32,2.4,-1.35,.045,4.7,.045],[x+.32,2.4,-1.35,.045,4.7,.045]);
        for(let y=.3;y<4.8;y+=.32) ladder.push([x,y,-1.35,.65,.04,.05]);
    }
    batch(source,box,mats.silver,ladder,'tank-ladders');
    const pipeY=2.08;
    tube(root,[[-35.5,3.3,4],[-29.4,3.3,4],[-29.4,pipeY,4],[-23.8,pipeY,4]],mats.copper);
    batch(root,box,mats.frame,[[-28.6,1.53,4,.14,1.1,.65],[-25.2,1.53,4,.14,1.1,.65]],'pipe-supports');
    const fence=[], wire=[];
    for(let x=-27.5;x<=27.6;x+=2.5) for(const z of [-11.4,11.4]) {
        if(z>0 && x>14 && x<23) continue;
        fence.push([x,2.5,z,.055,2,.055]);
        if(x+2.5<=27.6 && !(z>0 && x>=12.5 && x<22.5)) for(const y of [1.8,2.4,3.05]) wire.push(x,y,z,x+2.5,y,z);
    }
    for(let z=-11.4;z<=11.5;z+=2.28) for(const x of [-27.5,27.5]) {
        fence.push([x,2.5,z,.055,2,.055]);
        if(z+2.28<=11.5) for(const y of [1.8,2.4,3.05]) wire.push(x,y,z,x,y,z+2.28);
    }
    batch(root,box,mats.frame,fence,'perimeter-posts'); lines(root,wire,0xaaa8a2,.42,'perimeter-wire');
    const poles=[], lamps=[];
    for(const x of [-25,25]) for(const z of [-9,9]) { poles.push([x,4,z,.07,5,.07],[x,6.4,z,.8,.10,.45]); lamps.push([x,6.34,z,.65,.035,.35]); }
    batch(root,box,mats.frame,poles,'site-light-poles'); batch(root,box,mats.led,lamps,'energized-site-lights');
    return source;
}

function landscapeDetail(root,id,mats) {
    let seed=REGIONS[id].seed;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const crowns=[], trunks=[], tips=[], rocks=[];
    for(let attempt=0;attempt<1200 && crowns.length<REGIONS[id].trees;attempt++) {
        const x=(random()-.5)*102,z=(random()-.5)*80;
        if(x>-43 && x<31 && Math.abs(z)<16 || z>9 && Math.abs(x-roadX(z))<6) continue;
        const y=terrainHeight(id,x,z); if(y<.9 || y>11) continue;
        const height=2.1+random()*2.4, width=.65+random()*.55;
        trunks.push([x,y+height*.38,z,.10,height*.76,.10]);
        crowns.push([x,y+height*.66,z,width,height*.70,width]);
        if(id!=='niger-delta') tips.push([x,y+height*.97,z,width*.58,height*.48,width*.58]);
    }
    const wood=new T.MeshStandardMaterial({color:0x535450,roughness:.74,metalness:.25});
    const foliage=new T.MeshStandardMaterial({color:id==='cold-lake'?0x90928c:0x636d65,roughness:.75,metalness:.28});
    const crown=id==='niger-delta'?new T.IcosahedronGeometry(1,1):new T.ConeGeometry(1,1,7);
    batch(root,new T.CylinderGeometry(1,1,1,6),wood,trunks,'tree-trunks');
    batch(root,crown,foliage,crowns,'regional-tree-canopies');
    const snow=new T.MeshStandardMaterial({color:id==='cold-lake'?0xc1c2bb:0x829083,roughness:.64,metalness:.32});
    batch(root,new T.ConeGeometry(1,1,7),snow,tips,'tree-tips');
    // Dispose unused local materials/geometries in the treeless desert case.
    if(!trunks.length) { wood.dispose(); foliage.dispose(); }
    if(!tips.length) snow.dispose();
    for(let i=0;i<95;i++) {
        const x=(random()-.5)*102,z=(random()-.5)*80;
        if(x>-44 && x<32 && Math.abs(z)<17 || z>9 && Math.abs(x-roadX(z))<6) continue;
        const y=terrainHeight(id,x,z);if(y<1)continue;
        const size=.25+random()*.8;rocks.push([x,y+size*.16,z,size,size*.58,size*.8,0,random()*6,0]);
    }
    batch(root,new T.DodecahedronGeometry(1,0),mats.rib,rocks,'terrain-rocks');
}

export function buildHostingTerrain(config,buildYard) {
    if(!REGIONS[config.region]) throw new Error('Unknown hosting region');
    // Six detailed containers illustrate the infrastructure. They do not encode
    // an unverified physical rack count for any of the listed hosting regions.
    const yard=buildYard({containers:6,count:1440,perContainer:240,generators:3,settings:{source:'gas',cooling:'hydro'}});
    const mine=yard.root, root=new T.Group(); root.name='hosting-region-'+config.region;
    mine.position.y=1.5;root.add(mine);
    const ground=landform(root,config.region);
    water(root,config.region,yard.mats);
    const source=accessAndSource(root,yard,config.region);
    landscapeDetail(root,config.region,yard.mats);
    root.updateMatrixWorld(true);
    const fleet=yard.containers.map(c=>new T.Box3().setFromObject(c.root));
    const gas=[new T.Box3().setFromObject(source),new T.Box3().setFromObject(yard.targets.gas)];
    const union=boxes=>boxes.reduce((bounds,box)=>bounds.union(box),new T.Box3());
    return {...yard,root,mine,terrain:ground,view:'terrain',fullOrbit:true,frameHeight:.90,width:WIDTH,depth:DEPTH,inspectIndex:4,
        bounds:new T.Box3().setFromObject(root),region:config.region,
        targetRegions:{load:fleet,gas},
        targetBounds:{load:union(fleet),gas:union(gas),gen:new T.Box3().setFromObject(yard.targets.gen),xfmr:new T.Box3().setFromObject(yard.targets.xfmr)}};
}
