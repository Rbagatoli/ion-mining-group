/* Manufacturer-reference exterior models. Millimetre envelopes; no invented internals.
   Reference notes and the exact representative model are carried by the catalogue. */
import * as THREE from './vendor/three-0.185.1/three.module.min.js';

export const MODEL_DEFINITIONS = {
    's21-pro': {type:'antminer',name:'ANTMINER S21 PRO',dimensionsMM:[450,219,293]},
    's21-hydro': {type:'hydro',name:'ANTMINER S21+ HYD.',dimensionsMM:[339,173,207]},
    's23-hydro': {type:'hydro',name:'ANTMINER S23 HYD.',dimensionsMM:[410,170,209]},
    's19-air': {type:'antminer',name:'ANTMINER S19K PRO',dimensionsMM:[400,195,290]},
    's19-hydro': {type:'hydro',name:'ANTMINER S19 XP HYD.',dimensionsMM:[410,170,209]},
    'whatsminer-air': {type:'whatsminer',name:'WhatsMiner M70S',dimensionsMM:[430,155,226]},
    'whatsminer-hydro': {type:'rack',name:'WhatsMiner M73',dimensionsMM:[663,483,86]},
    'whatsminer-immersion': {type:'immersion',name:'WhatsMiner M66S',dimensionsMM:[401,267.5,147]},
    'avalon-a15': {type:'avalon',name:'AVALON A15 PRO',dimensionsMM:[301,192,292]},
    'avalon-a16': {type:'avalon',name:'AVALON A16 XP',dimensionsMM:[366,213,300]},
    'avalon-immersion': {type:'avalonImmersion',name:'AVALON A1566I',dimensionsMM:[292.5,171.5,301]},
    'sealminer-hydro': {type:'rack',name:'SEALMINER A3 PRO HYD',dimensionsMM:[665,482,86]},
    'sealminer-air': {type:'sealAir',name:'SEALMINER A2 PRO AIR',dimensionsMM:[365,197,292]},
    's21-immersion': {type:'antminerImmersion',name:'ANTMINER S21 IMM.',dimensionsMM:[293,236,364]},
    'avalon-hydro': {type:'avalonHydro',name:'AVALON A1566HA',dimensionsMM:[556,482.6,86]}
};

const mat = (color,roughness=.4,metalness=.85,extra={}) => new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
function materials() {
    return {shell:mat(0xc5c7c8,.36,.88),edge:mat(0x7e8184,.31,.9),silver:mat(0xe0e1df,.27,.95),
        black:mat(0x17191b,.6,.18),fan:mat(0x27292b,.62,.2),grille:mat(0x767a7b,.36,.88),
        socket:mat(0x070809,.68,.05),label:mat(0xf0efea,.87,.02),yellow:mat(0xe4bf48,.72,.05),
        green:mat(0x538653,.45,.12,{emissive:0x315a22,emissiveIntensity:.25}),red:mat(0x77332b,.5,.15),
        copper:mat(0xa59167,.34,.88),board:mat(0x243629,.8,.15)};
}
function box(parent,material,x,y,z,w,h,d,name='') {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.name=name;parent.add(mesh);return mesh;
}
function batch(parent,material,parts,geometry=new THREE.BoxGeometry(1,1,1),name='') {
    if(!parts.length)return;
    const mesh=new THREE.InstancedMesh(geometry,material,parts.length),dummy=new THREE.Object3D();mesh.name=name;
    parts.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3],p[4],p[5]);dummy.rotation.set(p[6]||0,p[7]||0,p[8]||0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});parent.add(mesh);return mesh;
}
function cylinder(parent,material,x,y,z,radius,depth,name='',segments=32) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,depth,segments),material);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.name=name;parent.add(mesh);return mesh;
}
function tube(parent,material,points,radius=.018) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,32,radius,7,false),material);parent.add(mesh);return mesh;
}
function label(parent,text,x,y,z,w,h,{rotation=0,top=false,bg='#dbdcda',color='#383c3e',small=false}={}) {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const c=canvas.getContext('2d');
    if(bg){c.fillStyle=bg;c.fillRect(0,0,768,192);}c.fillStyle=color;c.font=(small?'400 49px':'600 65px')+' Arial, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,96,735);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,transparent:!bg,roughness:.75,metalness:.08}));mesh.position.set(x,y,z);mesh.rotation.set(top?-Math.PI/2:0,rotation,0);mesh.name='manufacturer-mark';parent.add(mesh);return mesh;
}
function bolts(parent,m,W,H,Z,offset=.065) {
    const points=[];for(const x of [-W/2+offset,W/2-offset])for(const y of [offset,H-offset])points.push([x,y,Z,.027,.016,.027,Math.PI/2]);
    batch(parent,m.edge,points,new THREE.CylinderGeometry(1,1,1,6),'panel-fasteners');
}
function vent(parent,m,x,y,z,w,h,{pitch=.067,vertical=false}={}) {
    const bars=[],count=Math.max(1,Math.floor((vertical?w:h)/pitch));
    box(parent,m.black,x,y,z,w,h,.018);
    for(let i=0;i<count;i++){const at=(i-(count-1)/2)*pitch;bars.push(vertical?[x+at,y,z+.012,.022,h,.01]:[x,y+at,z+.012,w,.017,.01]);}
    batch(parent,m.shell,bars,undefined,'vent-slots');
}
function honeycomb(parent,m,x,y,z,w,h,pitch=.09) {
    box(parent,m.black,x,y,z,w,h,.021);const points=[],r=pitch*.45;
    for(let iy=0;iy<Math.floor(h/pitch);iy++)for(let ix=0;ix<Math.floor(w/pitch)-1;ix++){
        const cx=x-w/2+pitch*(ix+1+(iy%2)*.5),cy=y-h/2+pitch*(iy+.5);
        for(let k=0;k<6;k++){const a=k*Math.PI/3,b=(k+1)*Math.PI/3;points.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r,z+.015,cx+Math.cos(b)*r,cy+Math.sin(b)*r,z+.015);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:m.grille.color}));lines.name='honeycomb-exhaust';parent.add(lines);
}
function airFan(parent,m,x,y,z,size,{guard=true,small=false,depth=size*.30}={}) {
    const fan=new THREE.Group();fan.position.set(x,y,z);fan.name=small?'power-supply-fan':'main-air-fan';parent.add(fan);
    const r=size*.445,rail=size*.045,d=depth;
    for(const sign of [-1,1]){box(fan,m.black,sign*(size-rail)/2,0,0,rail,size,d);box(fan,m.black,0,sign*(size-rail)/2,0,size,rail,d);}
    const throat=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d,48,1,true),m.black);throat.rotation.x=Math.PI/2;fan.add(throat);
    const rotor=new THREE.Group();rotor.name='fan-rotor';fan.add(rotor);
    for(let i=0;i<7;i++){
        const shape=new THREE.Shape();shape.moveTo(r*.2,0);shape.bezierCurveTo(r*.58,r*.1,r*.93,r*.12,r*.91,r*.32);shape.quadraticCurveTo(r*.5,r*.33,r*.25,r*.21);shape.closePath();
        const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.013,bevelEnabled:false,curveSegments:8}),m.fan);blade.rotation.z=i*Math.PI*2/7;blade.position.z=.001;rotor.add(blade);
    }
    cylinder(rotor,m.black,0,0,.02,r*.28,.055);cylinder(rotor,m.edge,0,0,.052,r*.19,.006);
    if(guard){
        const rings=small?4:7;for(let n=1;n<=rings;n++){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r*n/(rings+.1),small?.006:.008,5,48),m.grille);mesh.position.z=d*.6;fan.add(mesh);}
        for(const angle of [Math.PI/4,-Math.PI/4]){const bar=box(fan,m.grille,0,0,d*.63,size*.91,.012,.013);bar.rotation.z=angle;}
    }
    const screws=[];for(const sx of [-1,1])for(const sy of [-1,1])screws.push([sx*size*.414,sy*size*.414,d*.62,.021,.014,.021,Math.PI/2]);
    batch(fan,m.silver,screws,new THREE.CylinderGeometry(1,1,1,6));return rotor;
}
function controller(parent,m,x,y,z,w,{dark=false,mirrored=false}={}) {
    box(parent,dark?m.black:m.shell,x,y,z,w,.225,dark?.025:.115,'controller-strip');
    const direction=mirrored?-1:1,faceZ=z+(dark?-.045:0),ethernetX=x-direction*w*.2;
    box(parent,m.edge,ethernetX,y,faceZ+.067,.17,.139,.035,'ethernet-jack');
    box(parent,m.socket,ethernetX,y+.012,faceZ+.088,.127,.09,.012);
    const pins=[];for(let i=0;i<8;i++)pins.push([ethernetX-.05+i*.014,y-.014,faceZ+.096,.007,.041,.004]);batch(parent,m.copper,pins);
    cylinder(parent,m.black,x+direction*w*.1,y,faceZ+.065,.026,.018,'reset');
    cylinder(parent,m.green,x+direction*w*.23,y,faceZ+.065,.018,.012,'status-led');
    cylinder(parent,m.red,x+direction*w*.30,y,faceZ+.065,.018,.012,'fault-led');
    label(parent,mirrored?'STATUS  ·  RESET  ·  ETH':'ETH  ·  RESET  ·  STATUS',x,y+.065,faceZ+.07,w*.88,.047,{small:true,bg:null,color:dark?'#b9bfbd':'#383c3e'});
}
function powerSocket(parent,m,x,y,z,w=.25,h=.25) {
    box(parent,m.black,x,y,z,w,h,.05,'power-connector');box(parent,m.socket,x,y,z+.032,w*.72,h*.67,.02);
    for(const dx of [-1,0,1])box(parent,m.copper,x+dx*w*.2,y+(dx===0?h*.12:-h*.1),z+.047,.028,.07,.01);
}
function sidePanel(parent,m,x,y,z,depth,height,{ribs=12}={}) {
    box(parent,m.shell,x,y,z,.032,height,depth);const lines=[];
    for(let i=0;i<ribs;i++)lines.push([x+Math.sign(x)*.020,y-height/2+.13+i*(height-.26)/(ribs-1),z,.014,.012,depth-.12]);
    batch(parent,m.edge,lines,undefined,'extruded-case-ribs');
}
function plainSide(parent,m,x,y,z,depth,height) {
    box(parent,m.shell,x,y,z,.025,height,depth,'sheet-metal-side');
    for(const sign of [-1,1])box(parent,m.edge,x+Math.sign(x)*.015,y+sign*(height/2-.06),z,.012,.018,depth-.08,'folded-case-seam');
}
function pullHandle(parent,m,x,y,z,height,reach=.16) {
    const handle=tube(parent,m.black,[[x,y-height/2,z],[x,y-height/2,z+reach],[x,y+height/2,z+reach],[x,y+height/2,z]],.035);handle.name='pull-handle';return handle;
}
function waterPort(parent,m,x,y,z) {
    cylinder(parent,m.silver,x,y,z,.085,.19,'water-connection');
    cylinder(parent,m.silver,x,y,z+.07,.105,.06,'connector-collar',6);
    cylinder(parent,m.socket,x,y,z+.103,.06,.012,'water-port-opening');
}
function perforatedSheet(parent,m,x,y,z,w,h) {
    box(parent,m.shell,x,y,z,w,h,.025,'perforated-sheet');
    const holes=[],pitch=.083;
    for(let iy=0;iy<Math.floor(h/pitch)-1;iy++)for(let ix=0;ix<Math.floor(w/pitch)-1;ix++)holes.push([x-w/2+(ix+1)*pitch,y-h/2+(iy+1)*pitch,z+.016,.022,.007,.022,Math.PI/2]);
    batch(parent,m.socket,holes,new THREE.CylinderGeometry(1,1,1,10),'round-perforations');
}
function antminer(root,m,L,W,H,def) {
    const psuW=W*.265,mainW=W-psuW-.04,cx=-psuW/2,bodyH=H-.22,bodyL=L-.65,fanSize=Math.min(mainW-.07,(bodyH-.05)/2);
    box(root,m.black,cx,bodyH/2,0,mainW,bodyH,bodyL,'hashboard-enclosure');
    for(const sign of [-1,1])plainSide(root,m,cx+sign*mainW/2,bodyH/2,0,bodyL,bodyH);
    box(root,m.shell,cx,bodyH-.015,0,mainW,.035,bodyL);box(root,m.shell,cx,.02,0,mainW,.04,bodyL);
    for(const sign of [-1,1]){
        const face=new THREE.Group();face.position.z=sign*(L/2-.23);face.rotation.y=sign<0?Math.PI:0;root.add(face);
        const x=sign*cx;for(const y of [bodyH*.25,bodyH*.75])airFan(face,m,x,y,0,fanSize,{depth:.38});
    }
    const px=W/2-psuW/2,pFront=L/2-.30;
    box(root,m.shell,px,H*.48,-.10,psuW-.025,H*.95,L-.55,'side-power-supply');
    for(const sign of [-1,1])plainSide(root,m,px+sign*(psuW-.025)/2,H*.48,-.10,L-.55,H*.95);
    for(const y of [H*.31,H*.49,H*.67])airFan(root,m,px,y,pFront+.02,psuW*.73,{small:true,depth:.12});
    powerSocket(root,m,px,H*.10,pFront+.035,psuW*.65,.26);
    if(def.name.includes('S19'))powerSocket(root,m,px,H*.20,pFront+.035,psuW*.65,.24);
    const capL=L*.57,capZ=-L*.08;
    box(root,m.shell,cx,H-.105,capZ,mainW,.21,capL,'recessed-controller-cap');
    controller(root,m,cx,H-.105,capZ+capL/2-.06,mainW*.94);
    for(const d of [-.055,.055])tube(root,d<0?m.yellow:m.black,[[cx+mainW*.37,bodyH*.78,L/2-.15],[cx+mainW*.43,bodyH-.02,L/2-.40],[cx+mainW*.31,H-.11,capZ+capL/2+.03+d]],.012).name='fan-control-lead';
    const feet=[];for(const x of [-W*.37,W*.37])for(const z of [-L*.33,L*.33])feet.push([x,.017,z,.12,.034,.23]);batch(root,m.edge,feet);
    label(root,'BITMAIN',-W/2-.015,H*.72,0,L*.40,.19,{rotation:-Math.PI/2,bg:null});
}
function whatsminer(root,m,L,W,H,def) {
    const bodyH=Math.min(H*.69,W+.02),bodyL=L-.30;
    box(root,m.edge,0,bodyH/2,0,W,bodyH,bodyL,'airflow-tunnel');
    for(const x of [-W/2,W/2])plainSide(root,m,x,bodyH/2,0,bodyL,bodyH);
    box(root,m.shell,0,.03,0,W,.06,bodyL);box(root,m.shell,0,bodyH,0,W,.035,bodyL);
    for(const sign of [-1,1]){const face=new THREE.Group();face.position.z=sign*(L/2-.235);face.rotation.y=sign<0?Math.PI:0;root.add(face);airFan(face,m,0,bodyH/2,0,W-.075,{depth:.38});}
    const pH=H-bodyH-.11,pL=L*.75,py=bodyH+.11+pH/2;
    box(root,m.shell,0,py,-L*.04,W*.88,pH,pL,'top-power-supply');
    for(const x of [-W*.44,W*.44])plainSide(root,m,x,py,-L*.04,pL,pH);
    vent(root,m,-W*.22,py,pL/2-L*.04+.01,W*.30,pH*.75,{pitch:.055});
    powerSocket(root,m,W*.19,py,pL/2-L*.04+.013,.34,Math.min(.30,pH*.7));
    const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.set(0,py,-pL/2-L*.04-.025);root.add(rear);airFan(rear,m,0,0,0,pH*.85,{small:true});
    controller(root,m,0,bodyH+.12,L/2-.33,W*.92);
    label(root,'WhatsMiner',W/2+.025,bodyH*.63,0,L*.45,.22,{rotation:Math.PI/2,bg:null});
    label(root,'MICROBT  ·  '+def.name.replace('WhatsMiner ',''),0,py+.06,pL/2-L*.04+.042,W*.72,.072,{small:true});
    for(const sign of [-1,1])box(root,m.edge,sign*W*.38,.025,0,.08,.05,bodyL+.08);
    const wire=tube(root,m.black,[[W*.36,bodyH*.75,L/2-.13],[W*.43,bodyH*.91,L/2-.13],[W*.40,bodyH+.13,L/2-.40]],.014);wire.name='fan-control-lead';
}
function avalon(root,m,L,W,H,def) {
    const a16=def.name.includes('A16'),psuW=W*.255,mainW=W-psuW-.025,cx=-psuW/2,bodyL=L-.60,bodyZ=-.23;
    box(root,m.black,cx,H/2,bodyZ,mainW,H,bodyL,'avalon-body');
    for(const x of [cx-mainW/2,cx+mainW/2])plainSide(root,m,x,H/2,bodyZ,bodyL,H);
    box(root,m.shell,cx,H-.012,bodyZ,mainW,.025,bodyL);box(root,m.shell,cx,.02,bodyZ,mainW,.04,bodyL);
    const size=Math.min(1.2,mainW-.07,(H-.24)/2);
    for(const y of [H*.24,H*.685])airFan(root,m,cx,y,L/2-.275,size,{depth:.50});
    const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.z=-L/2+.13;root.add(rear);honeycomb(rear,m,-cx,H/2,0,mainW-.05,H-.09);
    const px=W/2-psuW/2,pFront=L/2-.53;box(root,m.shell,px,H*.49,bodyZ,psuW-.026,H*.94,bodyL,'avalon-power-supply');
    for(const y of [H*.34,H*.57])airFan(root,m,px,y,pFront+.035,psuW*.78,{small:true,depth:.12});
    powerSocket(root,m,px,H*.11,pFront+.05,psuW*.72,.28);box(root,m.black,px,H*.77,pFront+.05,.15,.18,.035,'power-switch');
    controller(root,m,a16?px:cx,H-.12,pFront+.01,a16?psuW*.92:mainW*.92);
    label(root,a16?'CANAAN':'AVALON',-W/2-.016,H*.68,-.17,L*.46,.24,{rotation:-Math.PI/2,bg:null});
    tube(root,m.black,[[cx+size*.39,H*.79,L/2-.16],[cx+size*.43,H-.08,L/2-.30],[a16?px:cx+mainW*.35,H-.07,pFront+.07]],.017).name='fan-control-lead';
    honeycomb(rear,m,-px,H/2,0,psuW-.06,H-.12,.062);
    bolts(root,m,W,H,-L/2+.12);
}
function hydro(root,m,L,W,H,def) {
    // Compact APW11 layout, referenced to the S21 XP Hyd. service manual.
    // The S19/S23 use their own published envelope; component offsets remain visual estimates.
    const front=L/2-.55,bodyL=L-.67,bodyZ=-.245,baseH=H*.28;
    box(root,m.shell,0,baseH/2,bodyZ,W,baseH,bodyL,'apw-water-cooled-power-supply');
    box(root,m.edge,0,baseH+.025,bodyZ,W,.05,bodyL);
    box(root,m.shell,0,(baseH+.05+H)/2,bodyZ,W,H-baseH-.05,bodyL,'sealed-water-block-chassis');
    for(const sign of [-1,1])plainSide(root,m,sign*W/2,H*.63,bodyZ,bodyL,H*.68);
    box(root,m.shell,0,H-.10,bodyZ,W,.20,bodyL,'hydro-controller-cap');
    const control=new THREE.Group();control.position.set(0,H-.105,front+.008);root.add(control);
    cylinder(control,m.red,-W*.37,.037,.033,.018,.012,'fault-led');cylinder(control,m.green,-W*.37,-.035,.033,.018,.012,'status-led');
    box(control,m.socket,-W*.18,-.048,.038,.17,.025,.014,'sd-card-slot');
    cylinder(control,m.black,W*.02,-.025,.035,.027,.015,'ip-report');
    box(control,m.edge,W*.23,0,.027,.18,.15,.04,'ethernet-jack');box(control,m.socket,W*.23,.008,.050,.13,.10,.012);
    cylinder(control,m.socket,W*.40,-.025,.035,.012,.012,'reset');
    const rows=[{top:H-.31,bottom:H-.75},{top:baseH-.03,bottom:.10}],xs=[-W*.29,0,W*.29];
    for(const row of rows)for(const x of xs){
        for(const y of [row.top,row.bottom]){cylinder(root,m.silver,x,y,front+.065,.055,.12,'manifold-fitting',6);}
        const points=[[x,row.top,front+.10],[x-.025,row.top-.055,front+.27],[x,(row.top+row.bottom)/2,front+.40],[x+.025,row.bottom+.055,front+.27],[x,row.bottom,front+.10]];
        const hose=tube(root,m.silver,points,.046);hose.name='corrugated-coolant-loop';
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
        for(let i=2;i<24;i++){
            const t=i/26,point=curve.getPoint(t),ring=new THREE.Mesh(new THREE.TorusGeometry(.048,.007,4,10),m.edge);
            ring.position.copy(point);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),curve.getTangent(t).normalize());root.add(ring);
        }
    }
    tube(root,m.silver,[[-W*.44,H-.64,front+.10],[-W*.47,H-.88,front+.38],[-W*.46,baseH+.18,front+.39],[-W*.30,baseH-.01,front+.1]],.052).name='power-supply-coolant-link';
    waterPort(root,m,-W*.41,H-.36,front+.15);waterPort(root,m,W*.42,.16,front+.15);
    const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.z=-L/2+.075;root.add(rear);powerSocket(rear,m,0,baseH*.49,.015,.30,.28);
    label(root,'ANTMINER',W/2+.019,H*.72,bodyZ,bodyL*.50,.18,{rotation:Math.PI/2,bg:null});
}
function rack(root,m,L,W,H,def) {
    const isSeal=def.name.startsWith('SEAL'),front=L/2-.24,bodyL=L-(isSeal?.70:.39),bodyZ=isSeal?.10:-.045;
    box(root,m.shell,0,H/2,bodyZ,W-.30,H,bodyL,'2u-rack-chassis');
    for(const x of [-W/2+.07,W/2-.07]){
        box(root,m.edge,x,H/2,front,.14,H,.075,'rack-ear');
        for(const y of [.12,H-.12])cylinder(root,m.socket,x,y,front+.045,.039,.008,'mounting-hole');
        pullHandle(root,m,x-Math.sign(x)*.13,H*.5,front+.045,H*.64,.15);
    }
    box(root,m.black,0,H/2,front,W-.30,H-.02,.048,'black-service-face');
    honeycomb(root,m,-W*.16,H*.78,front+.028,W*.49,H*.27,.051);
    controller(root,m,-W*.22,H*.27,front+.025,W*.39,{dark:true});
    powerSocket(root,m,W*.36,H*.48,front+.042,.38,.31);
    label(root,isSeal?'SEALMINER':'WhatsMiner',W*.11,H*.50,front+.032,W*.26,.11,{bg:null,color:'#c4c7c7'});
    const screws=[];for(const x of [-W*.36,0,W*.36])for(const z of [-bodyL*.41,0,bodyL*.41])screws.push([x,H+.007,z,.024,.012,.024]);batch(root,m.edge,screws,new THREE.CylinderGeometry(1,1,1,6));
    // Bitdeer's rear photograph exposes the shroud and couplings. The M73's
    // unseen rear is kept plain instead of inventing visible connector positions.
    if(isSeal){
        const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.z=-L/2+.40;root.add(rear);
        box(rear,m.shell,0,H*.48,0,W-.31,H-.045,.055,'rear-service-face');
        box(rear,m.shell,0,.025,.17,W-.26,.05,.37,'rear-protective-sill');
        for(const x of [-W/2+.145,W/2-.145])box(rear,m.shell,x,H*.48,.17,.05,H-.045,.37,'rear-protective-cheek');
        for(const x of [-W*.32,W*.33])waterPort(rear,m,x,H*.47,.14);
        waterPort(rear,m,-W*.14,H*.47,.13);
        tube(rear,m.silver,[[-W*.14,H*.47,.21],[-W*.11,H*.48,.34],[W*.02,H*.38,.34],[W*.07,H*.43,.19]],.051).name='rear-coolant-link';
    }
}
function immersion(root,m,L,W,H,def) {
    const bodyL=L-.30,front=L/2-.23;
    box(root,m.shell,0,H/2,-.08,W,H,bodyL,'immersion-enclosure');
    for(const sign of [-1,1])plainSide(root,m,sign*W/2,H/2,-.08,bodyL,H);
    box(root,m.black,0,H/2,front,W-.035,H-.025,.032,'black-immersion-service-face');
    vent(root,m,0,H*.58,front+.023,W*.67,H*.44,{pitch:.08});
    for(const x of [-W*.40,W*.40])pullHandle(root,m,x,H*.52,front+.02,H*.68,.17);
    controller(root,m,-W*.08,H*.18,front+.025,W*.65,{dark:true});
    powerSocket(root,m,W*.24,H*.89,front+.037,.28,.21);
    label(root,'WhatsMiner',-W*.15,H*.90,front+.032,W*.33,.095,{bg:null,color:'#d4d5d2'});
}
function sealAir(root,m,L,W,H) {
    const psuW=W*.25,mainW=W-psuW-.025,cx=-psuW/2,px=W/2-psuW/2,capH=.24,bodyH=H-capH,bodyL=L-.70;
    box(root,m.black,cx,bodyH/2,0,mainW,bodyH,bodyL,'sealminer-air-enclosure');
    for(const x of [cx-mainW/2,cx+mainW/2])plainSide(root,m,x,bodyH/2,0,bodyL,bodyH);
    box(root,m.shell,cx,.02,0,mainW,.04,bodyL);
    const size=Math.min(mainW-.06,(bodyH-.04)/2);
    for(const sign of [-1,1]){
        const face=new THREE.Group();face.position.z=sign*(L/2-.23);face.rotation.y=sign<0?Math.PI:0;root.add(face);
        for(const y of [bodyH*.25,bodyH*.75])airFan(face,m,sign*cx,y,0,size,{depth:.38});
    }
    box(root,m.shell,px,bodyH/2,0,psuW-.025,bodyH,bodyL,'side-power-supply');
    for(const y of [bodyH*.38,bodyH*.63])airFan(root,m,px,y,bodyL/2+.05,psuW*.81,{small:true,depth:.12});
    powerSocket(root,m,px,bodyH*.12,bodyL/2+.07,psuW*.72,.30);
    box(root,m.shell,0,H-capH/2,0,W,capH,bodyL,'full-width-controller-cap');
    controller(root,m,-W*.16,H-capH/2,bodyL/2-.02,W*.59);
    for(const x of [W*.15,W*.30]){
        box(root,m.black,x,H-capH/2,bodyL/2+.047,.12,.08,.08,'fan-lead-socket');
        tube(root,m.black,[[x,H-capH/2,bodyL/2+.075],[x+.05,bodyH+.03,L/2-.15],[cx+size*.40,bodyH*.76,L/2-.10]],.016).name='fan-control-lead';
    }
    label(root,'SEALMINER',-W/2-.016,H*.51,0,L*.48,.25,{rotation:-Math.PI/2,bg:null});
}
function avalonImmersion(root,m,L,W,H) {
    // A1566I: upright vented basket with a raised top handle, not an M66 rack.
    // The long perforated elevation lies along the manufacturer's first size axis.
    const exterior=new THREE.Group();exterior.rotation.y=Math.PI/2;root.add(exterior);root=exterior;[L,W]=[W,L];
    const bodyH=H-.20,psuW=W*.34,mainW=W-psuW-.035,cx=-psuW/2,front=L/2-.035;
    box(root,m.black,cx,bodyH/2,0,mainW,bodyH,L-.08,'vertical-immersion-basket');
    for(const x of [cx-mainW/2,cx+mainW/2])plainSide(root,m,x,bodyH/2,0,L-.08,bodyH);
    for(const sign of [-1,1]){
        const face=new THREE.Group();face.position.z=sign*front;face.rotation.y=sign<0?Math.PI:0;root.add(face);
        for(const dx of [-mainW*.32,0,mainW*.32])perforatedSheet(face,m,sign*cx+dx,bodyH*.49,.01,mainW*.29,bodyH*.91);
        for(const y of [.07,bodyH*.49,bodyH-.065])box(face,m.shell,sign*cx,y,.036,mainW,.055,.028,'basket-cross-brace');
    }
    const px=W/2-psuW/2;box(root,m.shell,px,bodyH/2,0,psuW,bodyH,L-.08,'vertical-controller-column');
    const controls=new THREE.Group();controls.position.set(px,bodyH+.017,0);controls.rotation.x=-Math.PI/2;root.add(controls);
    box(controls,m.edge,0,0,0,.18,.14,.025,'ethernet-jack');box(controls,m.socket,0,.012,.015,.13,.09,.006);
    cylinder(controls,m.black,-psuW*.27,0,.007,.025,.01,'reset');
    label(root,'AVALON',W/2+.019,H*.55,0,L*.46,.22,{rotation:Math.PI/2,bg:null});
    // Only the externally visible open channels are indicated; no invented chips.
    for(const x of [cx-mainW*.32,cx,cx+mainW*.32])box(root,m.edge,x,bodyH-.03,0,.025,.12,L-.18,'basket-top-divider');
    for(const x of [-W*.29,W*.29])box(root,m.silver,x,bodyH+.075,0,.045,.15,.11,'top-handle-upright');
    box(root,m.silver,0,H-.035,0,W*.61,.055,.11,'top-carry-handle');
}
function antminerImmersion(root,m,L,W,H) {
    // S21 Imm. front/back layouts from BITMAIN's own component photograph.
    const psuW=W*.30,mainW=W-psuW-.025,cx=-psuW/2,px=W/2-psuW/2,front=L/2-.21;
    box(root,m.black,cx,(H-.035)/2,-.08,mainW,H-.035,L-.38,'immersion-hashboard-housing');
    for(const x of [cx-mainW/2,cx+mainW/2])plainSide(root,m,x,H/2,-.08,L-.38,H);
    box(root,m.shell,px,H/2,-.08,psuW,H,L-.38,'apw11i-side-power-supply');
    for(const sign of [-1,1]){
        const face=new THREE.Group();face.position.z=sign*front;face.rotation.y=sign<0?Math.PI:0;root.add(face);
        for(const x of [-mainW*.32,0,mainW*.32])for(const y of [H*.25,H*.72])vent(face,m,sign*cx+x,y,.019,mainW*.27,H*.40,{pitch:.064});
        for(const x of [-psuW*.21,psuW*.21])vent(face,m,sign*px+x,H*.55,.019,psuW*.32,H*.83,{pitch:.061});
        box(face,m.shell,sign*cx,H*.48,.034,mainW,.19,.03,'hashboard-middle-brace');
    }
    controller(root,m,cx,H-.15,front+.035,mainW*.90);
    powerSocket(root,m,px,H*.075,front+.040,psuW*.55,.31);
    for(const x of [cx-mainW*.41,cx+mainW*.41])pullHandle(root,m,x,H*.49,front+.035,H*.25,.145);
    box(root,m.shell,cx,H-.015,-.08,mainW,.03,L-.38);
}
function avalonHydro(root,m,L,W,H) {
    const front=L/2-.23,bodyL=L-.55,bodyZ=.02;
    box(root,m.shell,0,H/2,bodyZ,W-.32,H,bodyL,'avalon-2u-hydro-chassis');
    box(root,m.black,0,H/2,front,W-.08,H,.045,'black-service-face');
    for(const x of [-W/2+.07,W/2-.07]){
        box(root,m.black,x,H/2,front,.14,H,.07,'rack-ear');
        for(const y of [H*.37,H*.57])box(root,m.socket,x,y,front+.045,.07,.033,.014,'mounting-hole');
        pullHandle(root,m,x-Math.sign(x)*.14,H*.50,front+.02,H*.82,.17);
    }
    const powerX=-W*.36;box(root,m.edge,powerX,H*.30,front+.045,.39,.31,.07,'round-ac-mount');
    cylinder(root,m.black,powerX,H*.30,front+.12,.145,.10,'power-connector');
    cylinder(root,m.socket,powerX,H*.30,front+.177,.107,.012); // Round industrial socket, unlike M73's rectangle.
    controller(root,m,W*.23,H*.85,front+.025,W*.30,{dark:true,mirrored:true});
    const rear=new THREE.Group();rear.rotation.y=Math.PI;rear.position.z=-L/2+.23;root.add(rear);
    box(rear,m.shell,0,H/2,0,W-.32,H-.02,.04,'rear-coolant-face');
    waterPort(rear,m,-W*.045,H*.38,.085);waterPort(rear,m,W*.42,H*.62,.085);
    label(rear,'OUTLET',-W*.14,H*.25,.031,.40,.07,{small:true,bg:null});label(rear,'INLET',W*.31,H*.61,.031,.34,.07,{small:true,bg:null});
    for(const sign of [-1,1])for(const z of [-L*.21,L*.16])box(root,m.edge,sign*(W/2-.155),H*.42,z,.025,.018,L*.26,'stamped-side-stiffener');
}

export function buildMiner(modelKey,variant={}) {
    const definition=MODEL_DEFINITIONS[modelKey];if(!definition)throw new Error('Unknown physical miner model: '+modelKey);
    const def={...definition};
    // The photograph identifies the rendered chassis. Variant bins do not invent a
    // new exterior; any verified footprint override is explicit in the catalogue.
    const dims=variant.renderDimensionsMM||definition.dimensionsMM;
    if(!Array.isArray(dims)||dims.length!==3||dims.some(n=>!Number.isFinite(n)||n<=0))throw new Error('Invalid physical miner dimensions: '+modelKey);
    const [L,W,H]=dims.map(n=>n/100),root=new THREE.Group(),m=materials();root.name=modelKey;
    root.userData={modelKey,dimensionsMM:[...dims],exteriorOnly:true,referenceModel:definition.name,accuracy:'reference-based exterior; small component dimensions estimated'};
    ({antminer,hydro,whatsminer,avalon,rack,immersion,sealAir,avalonImmersion,antminerImmersion,avalonHydro}[definition.type])(root,m,L,W,H,def);
    root.position.y=-H/2;root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(root);
    return {root,bounds,dimensionsMM:[...dims],modelKey};
}

export function disposeMiner(model) {
    if(!model)return;const materials=new Set(),geometries=new Set(),textures=new Set();
    model.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);if(m.map)textures.add(m.map);}});
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}
