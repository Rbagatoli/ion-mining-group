/* Original gas-site miniatures. Supplied with a fresh shared mechanical kit. */
function energyRoute(K,points,color=0xffb64f){K.pipe(points,.075,K.m.frame);const visible=points.map(([x,y,z])=>[x,y+.09,z]);K.pipe(visible,.018,K.m.orange);K.flow(visible,{color,radius:.045});}
function vessel(K,x,z,height=1.3){const {T,m,root,cyl,mesh,rod,torus}=K;cyl(.29,height,m.shell,x,height/2+.12,z);for(const y of [.12,height+.12]){const end=mesh(new T.SphereGeometry(.29,20,10),m.silver,x,y,z);end.scale.y=.28;}for(const y of [.28,height-.05])cyl(.306,.045,m.frame,x,y,z);for(const xx of [x-.17,x+.17])rod([xx,.02,z],[xx,.25,z],.035,m.frame);torus(.1,.018,m.orange,x,.7,z+.39,root,'y');}

function truck(K){
  const {T,m,group,box,cyl,rotor}=K,g=group(0,0,0,K.root,true);g.scale.setScalar(.68);
  box(.87,.17,1.85,m.frame,0,.33,0,g);box(.91,.67,1.08,m.shell,0,.77,-.34,g,.065);
  for(const x of [-.47,.47])for(let z=-.76;z<.15;z+=.17)box(.022,.48,.035,m.rib,x,.77,z,g);
  box(.86,.74,.64,m.silver,0,.80,.56,g,.065);box(.70,.32,.025,m.glass,0,.97,.905,g);
  for(const x of [-.44,.44]){box(.022,.28,.41,m.glass,x,.96,.58,g);box(.025,.055,.19,m.orange,x,.67,.58,g);box(.10,.055,.10,m.silver,x*1.16,.80,.74,g);}
  box(.89,.13,.08,m.frame,0,.48,.925,g);box(.41,.13,.025,m.dark,0,.67,.907,g);for(const x of [-.3,.3])box(.12,.065,.03,m.glow,x,.66,.928,g);
  for(const x of [-.49,.49])for(const z of [-.7,-.24,.61]){const wheel=cyl(.21,.13,m.dark,x,.25,z,g,'x');rotor(wheel,'x',-3.4);cyl(.105,.145,m.silver,x,.25,z,g,'x');}
  box(.20,.035,.11,m.orange,0,1.195,.6,g);return g;
}

export function buildLandfillScene(T,K){
  const {root,m,motion,pad,mesh,box,pipe,cyl,rod,powerhouse,transformer,fan,flow,mover}=K;pad();
  // A capped landfill cell with real relief, bench contours and collection wells.
  const nx=64,nz=40,p=[],ix=[],cx=-2.8,cz=-.4;
  function height(x,z){const r=((x-cx)/3.15)**2+((z-cz)/1.8)**2;return .07+1.65*Math.pow(Math.max(0,1-r),.55);}
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=cx-3.2+i*6.4/nx,z=cz-1.85+j*3.7/nz;p.push(x,height(x,z),z);if(i<nx&&j<nz){const a=j*(nx+1)+i;ix.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();mesh(geo,m.earth);
  for(const radius of [.45,.65,.85]){const points=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,x=cx+3.15*radius*Math.cos(a),z=cz+1.8*radius*Math.sin(a);points.push([x,height(x,z)+.02,z]);}pipe(points,.012,m.rib);}
  for(const x of [-4.7,-3.1,-1.5])for(const z of [-.95,.4]){
    const y=height(x,z);cyl(.065,.35,m.silver,x,y+.175,z);cyl(.12,.06,m.orange,x,y+.36,z);
    const path=[[x,y+.36,z],[x,y+.44,z+.18],[x,y+.30,.88],[-.25,.35,1.1],[.9,.35,1.1]];
    pipe(path,.038,m.dark);flow(path.map(([xx,yy,zz])=>[xx,yy+.05,zz]),{count:2,radius:.032,speed:.16});
  }
  // Treatment, generation and distribution fit alongside the collection cell.
  box(5.0,.12,3.4,m.pad,3.5,.06,-.25);vessel(K,1.4,-.45,1.18);vessel(K,2.2,-.45,1.53);
  const generator=powerhouse(3.85,.14,-.60,{w:2.0,h:1.5,d:1.45});fan(0,1.62,0,.30,'y',generator);
  transformer(5.55,.14,1.12,.64);K.cabinet(4.18,.14,1.12,.48,1.02);
  energyRoute(K,[[.9,.3,1.1],[1.4,.30,.3],[2.2,.30,.3],[2.8,.35,.25],[3.5,.35,.25]]);
  energyRoute(K,[[4.15,.19,.4],[4.75,.19,.65],[5.55,.19,1.15],[6.4,.19,1.8]]);
  // A service road carries a small refuse truck around the cell and plant.
  const road=[[-6.25,.075,2.32],[-3.6,.075,2.5],[1,.075,2.5],[5.65,.075,2.45],[6.35,.075,1.6],[6.3,.075,-2.15],[5.5,.075,-2.55],[-5.8,.075,-2.55],[-6.4,.075,-1.8],[-6.4,.075,1.5]];
  const path=new T.CatmullRomCurve3(road.map(p=>new T.Vector3(...p)),true,'centripetal');
  const rg=new T.TubeGeometry(path,180,.28,6,true);rg.scale(1,.18,1);mesh(rg,m.road,0,.06,0);
  for(let i=0;i<36;i++){const p=path.getPointAt(i/36);box(.1,.015,.035,m.rib,p.x,.13,p.z);}
  const vehicle=truck(K);mover(vehicle,road,{speed:.055,phase:.02});
  for(let i=0;i<8;i++){const x=-5.8+i*.67;rod([x,.05,-2.09],[x,.36,-2.09],.017,m.frame);}rod([-5.8,.31,-2.09],[-1.1,.31,-2.09],.013,m.rib);
  root.userData.description='A landfill cell with collection wells, moving refuse truck, gas treatment, generator and transformer.';
  root.userData.camera=[8,14,29];return root;
}

export function buildFlareScene(T,K){
  const {root,m,motion,pad,box,cyl,rod,pipe,torus,mesh,group,powerhouse,transformer,fan}=K;pad();
  // Wellhead and gas manifold, with small valves and a sheltered control skid.
  box(3,.12,2.45,m.pad,-4.6,.06,.7);
  cyl(.16,.7,m.frame,-5,.4,.7);cyl(.1,.95,m.silver,-5,.9,.7);
  for(const y of [.45,.87,1.2]){cyl(.21,.07,m.rib,-5,y,.7);rod([-5.48,y,.7],[-4.52,y,.7],.075,m.silver);torus(.13,.023,m.orange,-4.43,y,.7,root,'x');}
  K.cabinet(-3.85,.13,1.0,.58,1.2);
  // Slender flare stack, service ladder, pilot and a living flame.
  const sx=-4.5,sz=-1.5;cyl(.42,.11,m.frame,sx,.06,sz);cyl(.15,2.75,m.rib,sx,1.46,sz);
  cyl(.23,.19,m.dark,sx,2.90,sz);cyl(.19,.24,m.silver,sx,3.04,sz);
  for(const x of [sx-.23,sx+.23])rod([x,.15,sz+.22],[x,2.81,sz+.22],.023,m.frame);
  for(let y=.22;y<2.8;y+=.22)rod([sx-.23,y,sz+.22],[sx+.23,y,sz+.22],.018,m.silver);
  const flame=group(sx,3.11,sz,root,true);
  const flameMat=new T.MeshBasicMaterial({color:0xff9c23,transparent:true,opacity:.91,toneMapped:false});
  const flameGeo=new T.LatheGeometry([new T.Vector2(.07,0),new T.Vector2(.19,.20),new T.Vector2(.12,.47),new T.Vector2(.035,.72),new T.Vector2(0,.85)],20);
  mesh(flameGeo,flameMat,0,0,0,flame);const core=mesh(flameGeo,new T.MeshBasicMaterial({color:0xffdf95,toneMapped:false}),0,.015,0,flame);core.scale.set(.5,.65,.5);
  motion.updates.push(time=>{flame.scale.set(1+.07*Math.sin(time*3),.96+.13*Math.sin(time*2.4),1);flame.rotation.z=.045*Math.sin(time*2.1);});
  // Horizontal pressure separator with saddles, flanges and access platform.
  const sep=group(-1.2,.85,-.2);cyl(.43,2.5,m.shell,0,0,0,sep,'x');for(const x of [-1.25,1.25]){const end=mesh(new T.SphereGeometry(.43,24,12),m.silver,x,0,0,sep);end.scale.x=.35;}
  for(const x of [-.84,.84]){box(.18,.5,.7,m.frame,x,-.54,0,sep);torus(.447,.025,m.frame,x,0,0,sep,'x');}cyl(.08,.42,m.silver,0,.58,0,sep);torus(.12,.022,m.orange,0,.84,0,sep,'y');
  box(3.2,.12,2.2,m.pad,-1.2,.06,-.2);
  const generator=powerhouse(2.3,.14,-.4,{w:2.5,h:1.72,d:1.8});fan(-.55,1.82,0,.34,'y',generator);fan(.55,1.82,0,.34,'y',generator);
  cyl(.09,.54,m.frame,3.15,2.0,-.91);cyl(.15,.06,m.silver,3.15,2.28,-.91);
  transformer(5.3,.14,.75,.78);K.cabinet(4.4,.14,-1.1,.64,1.36);
  energyRoute(K,[[-5,.43,.7],[-3.9,.43,.7],[-2.7,.43,.65],[-2.45,.7,-.2]]);
  energyRoute(K,[[-.05,.67,-.2],[.55,.67,-.2],[.77,.3,.7],[1.8,.3,.7],[2.4,.3,.7]]);
  energyRoute(K,[[3.4,.22,.8],[4.2,.22,1.4],[5.3,.22,1.4],[6.4,.22,1.4]]);
  energyRoute(K,[[-2.7,.45,.65],[-3.15,.45,-1.5],[-4.5,.45,-1.5]]);
  for(let i=0;i<7;i++)box(.36,.014,.035,m.rib,-3.3+i*1.2,.02,2.45);
  root.userData.description='A flare-gas recovery site with a wellhead, separator, burning flare, generator and transformer.';
  root.userData.camera=[8,14,29];return root;
}
