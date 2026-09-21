/* Original water and nuclear plant miniatures. Their moving parts are registered
   with the shared scene runtime; geometry is purpose-built for the small view. */

function ribbon(T,K,points,width,material){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),positions=[],indices=[];
  for(let i=0;i<=48;i++){const p=curve.getPoint(i/48);positions.push(p.x-width/2,p.y,p.z,p.x+width/2,p.y,p.z);if(i<48){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return K.mesh(geo,material);
}

function rail(K,a,b,height=.25){
  K.rod([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.016,K.m.silver);
  for(let i=0;i<=5;i++){const t=i/5,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;K.rod([x,y,z],[x,y+height,z],.013,K.m.frame);}
}

function waterMaterial(T){return new T.MeshStandardMaterial({color:0x527e91,roughness:.23,metalness:.56,side:T.DoubleSide,emissive:0x102939,emissiveIntensity:.3});}

function rotorBlades(T,K,parent,r=.42){
  for(let i=0;i<9;i++){
    const blade=new T.Shape();blade.moveTo(.06,-.035);blade.bezierCurveTo(r*.4,-r*.22,r*.9,-r*.38,r,-r*.02);blade.quadraticCurveTo(r*.56,r*.09,.09,.07);blade.closePath();
    const o=K.mesh(new T.ExtrudeGeometry(blade,{depth:.07,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1}),K.m.silver,0,0,0,parent);o.rotation.z=i*Math.PI*2/9;
  }
  K.cyl(r*.22,.18,K.m.orange,0,0,.06,parent,'z');
}

export function buildHydroScene(T,K){
  const {m,root}=K;K.pad();const water=waterMaterial(T);
  // A curved gravity dam, with a wider foot and a thin, detailed crest.
  const centerX=-3.35,centerZ=-5.7,segments=40,positions=[],indices=[];
  const sections=[[.14,5.94],[.14,6.86],[2.16,6.38],[2.16,6.16]];
  for(let i=0;i<=segments;i++){const a=-.47+i/segments*.94;for(const [y,r]of sections)positions.push(centerX+Math.sin(a)*r,y,centerZ+Math.cos(a)*r);}
  for(let i=0;i<segments;i++)for(let s=0;s<4;s++){const a=i*4+s,b=i*4+(s+1)%4,c=(i+1)*4+s,d=(i+1)*4+(s+1)%4;indices.push(a,b,c,b,d,c);}
  indices.push(0,2,1,0,3,2);const end=segments*4;indices.push(end,end+1,end+2,end,end+2,end+3);
  const damGeo=new T.BufferGeometry();damGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));damGeo.setIndex(indices);damGeo.computeVertexNormals();K.mesh(damGeo,m.shell);
  // Reservoir surface follows the upstream curve; the rear bank remains visible.
  const lakeShape=new T.Shape();lakeShape.moveTo(-6.35,-2.8);lakeShape.lineTo(-.3,-2.8);lakeShape.lineTo(-.3,-.25);
  for(let i=0;i<=40;i++){const a=.47-i/40*.94;lakeShape.lineTo(centerX+Math.sin(a)*6.155,centerZ+Math.cos(a)*6.155);}
  lakeShape.lineTo(-6.35,-2.8);const lake=K.mesh(new T.ShapeGeometry(lakeShape),water,0,1.96,0);
  // ShapeGeometry uses XY; reflect its horizontal profile into world XZ.
  lake.rotation.x=-Math.PI/2;lake.scale.y=-1;
  K.box(6.26,1.98,.15,m.earth,-3.32,.96,-2.83,root,.03);
  K.box(.15,1.98,2.55,m.earth,-6.44,.96,-1.6,root,.03);
  for(let i=0;i<9;i++){
    const a=-.45+i*.1125,r=6.34,x=centerX+Math.sin(a)*r,z=centerZ+Math.cos(a)*r;
    K.rod([x,2.16,z],[x,2.43,z],.016,m.frame);
    if(i<8){const a2=a+.1125;K.rod([x,2.42,z],[centerX+Math.sin(a2)*r,2.42,centerZ+Math.cos(a2)*r],.018,m.silver);}
  }
  for(let i=0;i<6;i++){const a=-.4+i*.16;const x=centerX+Math.sin(a)*6.6,z=centerZ+Math.cos(a)*6.6;K.rod([x,.24,z+.03],[centerX+Math.sin(a)*6.385,2.1,centerZ+Math.cos(a)*6.385+.015],.027,m.rib);}
  // Spill gates and their water sheets are deliberately legible at phone size.
  for(const x of [-4.1,-3.35,-2.6]){
    K.box(.52,.22,.15,m.frame,x,2.08,.58,root,.025);
    K.box(.065,.53,.15,m.silver,x-.29,2.24,.54);K.box(.065,.53,.15,m.silver,x+.29,2.24,.54);K.box(.66,.075,.16,m.silver,x,2.51,.54);
    const p=[[x,2.04,.7],[x,1.87,.84],[x,1.05,1.05],[x,.29,1.43],[x,.18,2.3]];ribbon(T,K,p,.42,water);
    K.flow(p,{color:0xa2d7eb,count:4,speed:.4,radius:.027});
  }
  K.box(4.5,.075,1.05,water,-3.1,.125,2.32,root,.035);
  for(const z of [1.74,2.9])K.box(4.6,.16,.09,m.frame,-3.1,.11,z);
  for(let i=0;i<4;i++){
    const p=[[-5.7+i*.4,1.978,-2.2+i*.33],[-4.3+i*.45,1.983,-2.2+i*.33],[-2.4+i*.35,1.978,-2.2+i*.33]];
    K.pipe(p,.009,new T.MeshStandardMaterial({color:0x91adba,roughness:.22,metalness:.75}));
  }
  // Pressure penstock runs from the dam into an exposed spiral turbine.
  const feed=[[-.52,1.7,.1],[-.07,1.57,.36],[.36,1.0,.62],[.64,.72,1.1],[.99,.72,1.45]];
  K.pipe(feed,.16,m.rib);K.flow(feed,{color:0x9ad4ed,count:5,speed:.23,radius:.062});
  const feedCurve=new T.CatmullRomCurve3(feed.map(p=>new T.Vector3(...p)),false,'centripetal');
  for(const t of [.23,.50,.78]){const p=feedCurve.getPoint(t),ring=K.torus(.18,.024,m.silver,p.x,p.y,p.z);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),feedCurve.getTangent(t));}
  K.box(1.6,.14,1.04,m.frame,1.23,.09,1.3);K.box(.22,.46,.62,m.rib,.71,.32,1.3);K.box(.22,.46,.62,m.rib,1.79,.32,1.3);
  K.cyl(.62,.24,m.frame,1.25,.76,1.3,root,'z');K.cyl(.54,.255,m.dark,1.25,.76,1.44,root,'z');K.torus(.57,.058,m.silver,1.25,.76,1.605);
  const spin=K.group(1.25,.76,1.58,root,true);rotorBlades(T,K,spin,.47);K.rotor(spin,'z',1.5);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;K.cyl(.023,.05,m.orange,1.25+Math.sin(a)*.58,.76+Math.cos(a)*.58,1.67,root,'z');}
  const tail=[[1.27,.39,1.58],[1.62,.2,2.18],[2.85,.15,2.33],[4.2,.15,2.33]];K.pipe(tail,.13,water);K.flow(tail,{color:0x9ad4ed,count:5,speed:.3,radius:.045});
  K.box(2.9,.06,.67,water,3.27,.10,2.37,root,.025);for(const z of [1.99,2.76])K.box(3.08,.12,.07,m.frame,3.25,.09,z);
  // Generator hall shares the turbine shaft; a small front opening shows the link.
  K.powerhouse(2.13,0,-1.25,{w:2.8,h:1.7,d:1.75});
  for(let i=0;i<5;i++)K.box(.31,.32,.025,m.glass,1.23+i*.43,1.35,-.36);
  for(const x of [1.45,2.53])K.fan(x,1.85,-1.25,.31);
  K.pipe([[1.25,.75,1.16],[1.25,.75,.35],[1.25,.75,-.43]],.085,m.silver);
  K.box(2.93,.075,.8,m.frame,2.14,.02,-.02);rail(K,[.72,.1,.32],[3.57,.1,.32]);
  K.transformer(5.13,0,-.52,1.02);K.cabinet(6.1,0,1.02,.47,1.1);
  const power=[[3.44,.15,-.9],[4.1,.15,-.9],[4.1,.15,-.53],[5.12,.15,-.53],[5.9,.15,-.1],[6.11,.15,.75]];
  K.pipe(power,.045,m.orange);K.flow(power,{count:5,speed:.16,radius:.06});
  return root;
}

export function buildNuclearScene(T,K){
  const {m,root}=K;K.pad();const water=waterMaterial(T);
  // An open-top hyperboloid tower: unmistakably cooling, never a smokestack.
  const tower=K.group(-4.92,0,-.45),profile=[];
  for(let i=0;i<=30;i++){const t=i/30,y=.34+t*3.08,r=.70+.61*Math.pow((t-.61)/.74,2);profile.push(new T.Vector2(r,y));}
  const towerMat=m.shell.clone();towerMat.side=T.DoubleSide;K.mesh(new T.LatheGeometry(profile,48),towerMat,0,0,0,tower);
  K.cyl(1.25,.14,m.frame,0,.11,0,tower);K.cyl(1.1,.045,water,0,.24,0,tower);K.torus(profile.at(-1).x,.035,m.silver,0,3.42,0,tower,'y');
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;K.rod([Math.sin(a)*1.12,.18,Math.cos(a)*1.12],[Math.sin(a+.07)*1.11,.54,Math.cos(a+.07)*1.11],.042,m.frame,tower);
    for(let j=0;j<10;j++){const p=profile[j*3],q=profile[j*3+3];K.rod([Math.sin(a)*(p.x+.006),p.y,Math.cos(a)*(p.x+.006)],[Math.sin(a)*(q.x+.006),q.y,Math.cos(a)*(q.x+.006)],.009,m.rib,tower);}
  }
  K.cyl(profile.at(-1).x-.045,.025,m.dark,0,3.2,0,tower);
  // Quiet pale water vapour drifts upward; opacity fades before the upper edge.
  const vapourMaterial=new T.MeshStandardMaterial({color:0xe1e9e9,roughness:1,metalness:0,transparent:true,opacity:.18,depthWrite:false});
  for(let i=0;i<7;i++){
    const cloud=K.group(-4.92,3.52,-.45,root,true),mat=vapourMaterial.clone();
    for(let j=0;j<3;j++)K.mesh(new T.SphereGeometry(.13+j*.027,8,6),mat,Math.sin(j*2.1)*.11,j*.053,Math.cos(j*2.1)*.10,cloud);
    const phase=i/7;K.motion.updates.push(time=>{const t=(time*.14+phase)%1;cloud.position.set(-4.92+t*.2+Math.sin(t*4+i)*.07,3.44+t*.60,-.45-t*.12);cloud.scale.setScalar(.7+t*.45);mat.opacity=Math.sin(t*Math.PI)*.22;});
  }
  // Containment cylinder, hemispherical dome, exterior ribs and sealed entry.
  const cx=-.88,cz=-.60;K.cyl(1.43,.14,m.frame,cx,.09,cz);K.cyl(1.3,1.78,m.shell,cx,1.04,cz);
  K.mesh(new T.SphereGeometry(1.3,40,24,0,Math.PI*2,0,Math.PI/2),m.silver,cx,1.93,cz);
  K.torus(1.31,.035,m.rib,cx,1.92,cz,root,'y');K.torus(1.33,.028,m.frame,cx,.28,cz,root,'y');
  for(let i=0;i<16;i++){const a=i*Math.PI/8;K.rod([cx+Math.sin(a)*1.306,.24,cz+Math.cos(a)*1.306],[cx+Math.sin(a)*1.306,1.88,cz+Math.cos(a)*1.306],.018,m.rib);}
  K.box(.90,.70,.67,m.shell,cx,.39,.87);K.box(.5,.48,.035,m.rib,cx,.34,1.22);K.torus(.14,.019,m.frame,cx,.41,1.25);K.rod([cx-.13,.41,1.27],[cx+.13,.41,1.27],.012,m.frame);
  K.cyl(.046,.22,m.frame,cx,3.32,cz);K.cyl(.06,.045,m.orange,cx,3.44,cz);
  // Turbine hall: plated roof, glazing band and ventilation along the front.
  K.powerhouse(2.83,0,-.72,{w:3.22,h:1.47,d:1.98});
  for(let i=0;i<7;i++){
    K.box(.30,.26,.027,m.glass,1.58+i*.4,1.18,.295);
    K.box(.035,.055,2.04,m.rib,1.35+i*.48,1.56,-.72);
  }
  for(const x of [2.07,3.3]){K.box(.62,.16,.56,m.frame,x,1.66,-.74);K.fan(x,1.77,-.74,.24);}
  K.box(2.15,.12,.55,m.frame,2.65,.12,.87);
  K.cyl(.28,1.85,m.silver,2.61,.46,.88,root,'x');for(const x of [1.84,2.16,2.48,2.80,3.12,3.44])K.torus(.29,.025,m.rib,x,.46,.88,root,'x');
  K.cyl(.20,.46,m.orange,3.81,.46,.88,root,'x');K.box(.39,.38,.53,m.rib,3.83,.19,.88);
  const generator=K.group(4.07,.46,.88,root,true);for(let i=0;i<6;i++){const a=i*Math.PI/3;K.rod([0,Math.sin(a)*.045,Math.cos(a)*.045],[0,Math.sin(a)*.18,Math.cos(a)*.18],.019,m.silver,generator);}K.rotor(generator,'x',2.1);
  // The silver primary line connects contained reactor to the generating hall.
  K.pipe([[.13,1.08,-.46],[.77,1.08,-.46],[.96,1.08,-.15],[1.25,1.08,-.15]],.105,m.silver);
  K.pipe([[.14,.67,-.15],[.72,.67,-.15],[.88,.67,.11],[1.25,.67,.11]],.082,m.frame);
  // Separate blue cooling loop from the condenser to the tower's water basin.
  K.box(1.85,.15,.89,m.frame,-4.65,.12,1.83);K.box(1.66,.025,.70,water,-4.65,.21,1.83);
  const cooling=[[-4.92,.33,.70],[-4.92,.31,1.65],[-3.7,.31,1.91],[-2.6,.31,2.16],[.55,.31,2.16],[2.12,.31,1.98],[2.55,.31,1.3]];
  const returning=[[3.14,.25,1.34],[3.47,.25,2.63],[-2.35,.25,2.63],[-3.77,.25,2.49],[-5.54,.25,2.35],[-5.76,.3,.43]];
  K.pipe(cooling,.063,water);K.pipe(returning,.053,m.rib);K.flow(cooling,{color:0x93d0e6,count:6,speed:.105,radius:.052});K.flow(returning,{color:0x6497ae,count:5,speed:.10,radius:.042});
  for(const x of [-2.7,-1.55,-.4,.75,1.9])K.box(.065,.27,.36,m.frame,x,.13,2.38);
  // Dedicated output transformer and a compact high-voltage bus to the edge.
  K.transformer(5.37,0,.20,1.03);K.cabinet(6.12,0,1.71,.50,1.03);
  const output=[[3.96,.17,.87],[4.47,.17,.87],[4.47,.17,.21],[5.37,.17,.21],[6.09,.17,.69],[6.11,.17,1.5]];
  K.pipe(output,.044,m.orange);K.flow(output,{count:5,speed:.16,radius:.058});
  K.box(13.5,.022,.34,m.road,0,.015,-2.68,root,.005);for(let x=-6;x<6;x+=1.2)K.box(.48,.005,.027,m.rib,x,.03,-2.68,root,.002);
  return root;
}
