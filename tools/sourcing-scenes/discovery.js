/* Original editorial model: a surveyed landscape with three energy candidates.
   All terrain and equipment are procedural, illustrative and geographically fictional. */
export function buildDiscoveryScene(T) {
  const root = new T.Group();
  const mat = (color, roughness=.35, metalness=.85, extra={}) => new T.MeshStandardMaterial({color, roughness, metalness, ...extra});
  const m = {
    terrain: mat(0x515551,.56,.78), edge:mat(0x434443,.48,.88),
    shell:mat(0xb8b7b4,.26,.95), silver:mat(0xcdccc8,.22,.96),
    rib:mat(0x8e8d8a,.28,.94), frame:mat(0x686765,.29,.9),
    dark:mat(0x111112,.72,.25), pad:mat(0x3c3d3c,.78,.25),
    orange:mat(0xe77c10,.3,.74), glow:mat(0xf7931a,.32,.65,{emissive:0xf7931a,emissiveIntensity:.4}),
    water:mat(0x242b2e,.24,.9), contour:mat(0x93948e,.68,.5)
  };
  function mesh(geo,material,x=0,y=0,z=0,parent=root) {
    const o=new T.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
  }
  function box(w,h,d,material,x,y,z,parent=root,bevel=.025) {
    const r=Math.min(bevel,w/4,h/4,d/4),s=new T.Shape();
    s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
    s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
    s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    const g=new T.ExtrudeGeometry(s,{depth:Math.max(.001,d-2*r),steps:1,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:3});g.translate(0,0,-d/2+r);
    return mesh(g,material,x,y,z,parent);
  }
  function cylinder(r,h,material,x,y,z,parent=root) {return mesh(new T.CylinderGeometry(r,r,h,32),material,x,y,z,parent);}
  function rod(a,b,r,material,parent=root) {
    const u=new T.Vector3(...a),v=new T.Vector3(...b),d=v.clone().sub(u);
    const o=mesh(new T.CylinderGeometry(r,r,d.length(),10),material,0,0,0,parent);o.position.copy(u.add(v).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  }
  function route(points,r,material,parent=root) {
    const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.1);
    return mesh(new T.TubeGeometry(path,Math.max(24,points.length*12),r,8,false),material,0,0,0,parent);
  }
  const gaussian=(x,z,cx,cz,amp,sx,sz)=>amp*Math.exp(-((x-cx)**2/sx+(z-cz)**2/sz));
  function elevation(x,z) {
    return .32 + gaussian(x,z,-3,-2.1,1.45,6,2.2) + gaussian(x,z,3.7,-2.8,1.2,4,1.6)
      + gaussian(x,z,1,2.6,.38,3,1.2) + .045*Math.sin(x*2.2+z)*Math.cos(z*2.3);
  }
  // A machined terrain section, not a globe or a borrowed map texture.
  box(14.8,.18,8.2,m.edge,0,-.17,0,root,.065);
  box(14.55,.09,7.95,m.dark,0,-.055,0,root,.025);
  const nx=150,nz=86,w=14.4,d=7.8,verts=[],uv=[],indices=[];
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
    const x=-w/2+ix*w/nx,z=-d/2+iz*d/nz;verts.push(x,elevation(x,z),z);uv.push(ix/nx,iz/nz);
    if(ix<nx&&iz<nz){const a=iz*(nx+1)+ix,b=a+1,c=a+nx+1,e=c+1;indices.push(a,c,b,b,c,e);}
  }
  const terrain=new T.BufferGeometry();terrain.setAttribute('position',new T.Float32BufferAttribute(verts,3));terrain.setAttribute('uv',new T.Float32BufferAttribute(uv,2));terrain.setIndex(indices);terrain.computeVertexNormals();mesh(terrain,m.terrain);
  const perimeter=[];for(let i=0;i<=nx;i++)perimeter.push([-w/2+i*w/nx,-d/2]);
  for(let i=1;i<=nz;i++)perimeter.push([w/2,-d/2+i*d/nz]);
  for(let i=1;i<=nx;i++)perimeter.push([w/2-i*w/nx,d/2]);
  for(let i=1;i<=nz;i++)perimeter.push([-w/2,d/2-i*d/nz]);
  const side=[];for(let i=0;i<perimeter.length-1;i++){
    const [x,z]=perimeter[i],[xx,zz]=perimeter[i+1];side.push(x,0,z,xx,0,zz,x,elevation(x,z),z,xx,0,zz,xx,elevation(xx,zz),zz,x,elevation(x,z),z);
  }
  const sideGeo=new T.BufferGeometry();sideGeo.setAttribute('position',new T.Float32BufferAttribute(side,3));sideGeo.computeVertexNormals();mesh(sideGeo,new T.MeshStandardMaterial({color:0x686a66,metalness:.75,roughness:.5,side:T.DoubleSide}));
  // Fine engraved-looking contour lines follow the actual surface.
  const contourPoints=[];
  for(let level=.4;level<1.65;level+=.13)for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    const x=-w/2+ix*w/nx,z=-d/2+iz*d/nz,dx=w/nx,dz=d/nz;
    const corners=[[x,z],[x+dx,z],[x+dx,z+dz],[x,z+dz]],hits=[];
    for(let e=0;e<4;e++){
      const a=corners[e],b=corners[(e+1)%4],ha=elevation(...a),hb=elevation(...b);
      if((ha<level)!==(hb<level)){const t=(level-ha)/(hb-ha);hits.push([a[0]+t*(b[0]-a[0]),level+.008,a[1]+t*(b[1]-a[1])]);}
    }
    if(hits.length===2)contourPoints.push(...hits[0],...hits[1]);
  }
  const cg=new T.BufferGeometry();cg.setAttribute('position',new T.Float32BufferAttribute(contourPoints,3));root.add(new T.LineSegments(cg,new T.LineBasicMaterial({color:0xb8b9b0,transparent:true,opacity:.29})));
  // Recessed access corridor connects candidate pads across the landscape.
  const trace=[[-5.8,2.45],[-4.7,2.35],[-3.5,2.3],[-1.5,2.2],[.3,1.4],[2.5,1.6],[4.8,1.9],[6.4,1.8]].map(([x,z])=>[x,elevation(x,z)+.025,z]);
  route(trace,.13,m.dark);route(trace.map(([x,y,z])=>[x,y+.06,z]),.019,m.orange);
  function slab(x,z,w,d) {const y=elevation(x,z)+.07;box(w,.17,d,m.pad,x,y,z,root,.04);return y+.085;}
  // Candidate 1: landfill-gas collection skid, with separators and a manifold.
  const gx=-3.4,gz=.9,gy=slab(gx,gz,3.3,2.3);
  for(const [i,px] of [-.78,0,.78].entries()){
    const height=[1.15,1.55,.95][i];cylinder(.29,height,m.shell,gx+px,gy+height/2+.14,gz-.22);
    for(const yy of [.14,height+.14])mesh(new T.SphereGeometry(.29,24,12,0,Math.PI*2,0,Math.PI),m.rib,gx+px,gy+yy,gz-.22).scale.y=.35;
    for(const yy of [.3,height-.08])cylinder(.307,.045,m.frame,gx+px,gy+yy,gz-.22);
    for(const sx of [-.16,.16])box(.055,.24,.065,m.frame,gx+px+sx,gy+.12,gz-.22);
    rod([gx+px,gy+.55,gz+.03],[gx+px,gy+.55,gz+.54],.056,m.silver);
    cylinder(.105,.045,m.orange,gx+px,gy+.62,gz+.52);
  }
  rod([gx-1.18,gy+.55,gz+.54],[gx+1.18,gy+.55,gz+.54],.095,m.rib);
  for(const x of [gx-1.16,gx+1.16]){const f=cylinder(.16,.055,m.silver,x,gy+.55,gz+.54);f.rotation.z=Math.PI/2;}
  box(.44,.62,.4,m.shell,gx+1.25,gy+.31,gz-.45);box(.22,.15,.025,m.dark,gx+1.25,gy+.45,gz-.23);box(.055,.035,.025,m.glow,gx+1.36,gy+.24,gz-.23);
  // Orange perimeter identifies the selected candidate, kept separate from equipment.
  for(const z of [gz-1.11,gz+1.11])rod([gx-1.59,gy+.025,z],[gx+1.59,gy+.025,z],.022,m.glow);
  for(const x of [gx-1.59,gx+1.59])rod([x,gy+.025,gz-1.11],[x,gy+.025,gz+1.11],.022,m.glow);
  // Candidate 2: a compact powered site. Visible coils, louvers and busbars.
  const sx=3.6,sz=.2,sy=slab(sx,sz,3.35,2.2);
  box(1.2,1.07,.85,m.shell,sx-.5,sy+.55,sz);
  for(const xx of [-1.19,.19])for(let k=0;k<10;k++)box(.18,.87,.035,m.rib,sx+xx,sy+.55,sz-.36+k*.08);
  for(const x of [sx-.85,sx-.48,sx-.1]){
    cylinder(.07,.42,m.dark,x,sy+1.27,sz-.1);
    for(let k=0;k<5;k++)cylinder(.108,.027,m.silver,x,sy+1.14+k*.066,sz-.1);
  }
  for(const px of [.66,1.17]){
    box(.46,1.5,.62,m.rib,sx+px,sy+.77,sz-.1);box(.4,1.35,.025,m.shell,sx+px,sy+.79,sz+.224);
    box(.13,.13,.018,m.dark,sx+px,sy+1.11,sz+.242);
    for(let k=0;k<6;k++)box(.28,.026,.02,m.dark,sx+px,sy+.27+k*.065,sz+.245);
  }
  rod([sx-.86,sy+1.49,sz-.1],[sx+.99,sy+1.49,sz-.1],.035,m.silver);
  // Candidate 3: wind generation, originally modeled slender tapered turbines.
  function turbine(x,z,height,phase){
    const y=elevation(x,z);cylinder(.36,.12,m.frame,x,y+.06,z);
    mesh(new T.CylinderGeometry(.042,.115,height,24),m.shell,x,y+height/2+.1,z);
    box(.23,.23,.55,m.rib,x,y+height+.1,z,root,.07);
    const rotor=new T.Group();rotor.position.set(x,y+height+.11,z+.31);root.add(rotor);
    const hub=mesh(new T.SphereGeometry(.12,20,12),m.silver,0,0,0,rotor);hub.scale.z=1.5;
    const blade=new T.Shape();blade.moveTo(-.045,.08);blade.bezierCurveTo(-.14,.45,-.17,.9,-.025,1.28);blade.lineTo(.028,1.22);blade.quadraticCurveTo(.11,.51,.057,.14);blade.closePath();
    const bg=new T.ExtrudeGeometry(blade,{depth:.025,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,curveSegments:12});
    for(let i=0;i<3;i++){const b=mesh(bg,m.shell,0,0,0,rotor);b.rotation.z=phase+i*Math.PI*2/3;}
  }
  turbine(-.2,-2.05,2.32,.15);turbine(1.8,-2.8,1.78,.7);
  // A thick machined locator has a real cut-through opening and a tapered tip.
  function locator(x,y,z,scale,material){
    const s=new T.Shape();s.moveTo(0,0);s.bezierCurveTo(-.18,.23,-.51,.7,-.51,1.02);s.bezierCurveTo(-.51,1.68,.51,1.68,.51,1.02);s.bezierCurveTo(.51,.7,.18,.23,0,0);
    const hole=new T.Path();hole.absarc(0,1.03,.205,0,Math.PI*2,true);s.holes.push(hole);
    const g=new T.ExtrudeGeometry(s,{depth:.15,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:4,curveSegments:24});
    const o=mesh(g,material,x,y,z);o.rotation.y=.56;o.scale.setScalar(scale);return o;
  }
  locator(gx-1.42,gy+1.4,gz-.75,1.23,m.orange);
  locator(sx+1.45,sy+1.32,sz-.9,.65,m.silver);
  // Field-survey scale engraved into the exposed front edge; no unreadable labels.
  for(let i=0;i<37;i++){const x=-7.1+i*.394;box(.018,.032,i%4===0?.23:.12,i%4===0?m.silver:m.frame,x,-.065,4.015,root,.004);}
  root.userData.description='Original contoured landscape, selected gas collection skid, powered site and wind turbines';
  return root;
}
