/* Original architectural energy studies for Proton. No diorama or ground plate.
   Dimensions are visual proportions, not specifications or a proposed site design. */
export const FACILITY_SOURCE_IDS = Object.freeze(['landfill','flare','hydro','nuclear','wind','solar','industrial','grid']);

function kit(T) {
  const root=new T.Group(), dynamic=[];
  // Fine directional brushing varies roughness rather than painting the metal gray.
  const size=128,data=new Uint8Array(size*size*4);
  let seed=73;
  for(let y=0;y<size;y++){seed=(seed*1664525+1013904223)>>>0;const line=141+(seed%33);for(let x=0;x<size;x++){const n=line+Math.round(3*Math.sin(x*.31+y));const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;}}
  const brush=new T.DataTexture(data,size,size,T.RGBAFormat);brush.wrapS=brush.wrapT=T.RepeatWrapping;brush.repeat.set(2,6);brush.needsUpdate=true;
  const make=(color,roughness,extra={})=>new T.MeshPhysicalMaterial({color,metalness:1,roughness,envMapIntensity:1.25,...extra});
  const m={
    shell:make(0xd5d7d8,.34,{roughnessMap:brush,clearcoat:.25,clearcoatRoughness:.2}),
    bright:make(0xe9ebed,.18,{clearcoat:.35,clearcoatRoughness:.12}),
    satin:make(0x8c9196,.43,{roughnessMap:brush}),
    edge:make(0x4d535a,.3),dark:make(0x1c222a,.27),
    black:make(0x080c12,.31),cell:make(0x030405,.16,{envMapIntensity:.7,clearcoat:.68,clearcoatRoughness:.12}),
    cellLine:make(0x434b52,.39),
    amber:new T.MeshPhysicalMaterial({color:0xf7931a,metalness:.72,roughness:.26,emissive:0xed840f,emissiveIntensity:.16}),
    seam:make(0x72787d,.5)
  };
  const mesh=(g,mat=m.shell,parent=root,x=0,y=0,z=0)=>{
    const o=new T.Mesh(g,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
  };
  const cyl=(rt,rb,h,mat=m.shell,parent=root,x=0,y=0,z=0,segments=40,open=false)=>mesh(new T.CylinderGeometry(rt,rb,h,segments,1,open),mat,parent,x,y,z);
  const sphere=(r,mat=m.bright,parent=root,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,24,16),mat,parent,x,y,z);
  const box=(w,h,d,mat=m.shell,parent=root,x=0,y=0,z=0,bevel=.025)=>{
    if(!bevel)return mesh(new T.BoxGeometry(w,h,d),mat,parent,x,y,z);
    const b=Math.min(bevel,w*.15,h*.15,d*.15),s=new T.Shape();
    s.moveTo(-w/2+b,-h/2+b);s.lineTo(w/2-b,-h/2+b);s.lineTo(w/2-b,h/2-b);s.lineTo(-w/2+b,h/2-b);s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,steps:1,curveSegments:1});g.translate(0,0,-d/2+b);
    return mesh(g,mat,parent,x,y,z);
  };
  const rod=(a,b,r=.045,mat=m.bright,parent=root)=>{
    const va=new T.Vector3(...a),vb=new T.Vector3(...b),delta=vb.clone().sub(va);
    const o=cyl(r,r,delta.length(),mat,parent);o.position.copy(va.add(vb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;
  };
  const pipe=(pts,r=.12,mat=m.bright,parent=root)=>{
    const curve=new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)),false,'centripetal');
    return mesh(new T.TubeGeometry(curve,Math.min(96,Math.max(24,pts.length*8)),r,r<.01?4:12,false),mat,parent);
  };
  const ring=(r,tube=.03,mat=m.bright,parent=root,x=0,y=0,z=0)=>{
    const o=mesh(new T.TorusGeometry(r,tube,8,80),mat,parent,x,y,z);o.rotation.x=Math.PI/2;return o;
  };
  const group=(parent=root,x=0,y=0,z=0)=>{const o=new T.Group();o.position.set(x,y,z);parent.add(o);return o;};
  const lathe=(points,mat=m.shell,parent=root,segments=128)=>mesh(new T.LatheGeometry(points.map(p=>new T.Vector2(...p)),segments),mat,parent);
  const flange=(x,y,z,r=.3,parent=root)=>{
    cyl(r,r,.085,m.bright,parent,x,y,z);ring(r*.77,.018,m.edge,parent,x,y+.049,z);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(.022,.022,.025,m.edge,parent,x+Math.cos(a)*r*.8,y+.055,z+Math.sin(a)*r*.8,6);}
  };
  const valve=(x,y,z,scale=1,parent=root)=>{
    const p=group(parent,x,y,z);p.scale.setScalar(scale);cyl(.17,.17,.45,m.shell,p);flange(0,-.24,0,.25,p);flange(0,.24,0,.25,p);
    rod([0,.1,0],[.5,.1,0],.035,m.bright,p);const w=ring(.22,.026,m.edge,p,.5,.1,0);w.rotation.z=Math.PI/2;
    for(let a=0;a<Math.PI*2;a+=Math.PI/2)rod([.5,.1,0],[.5,.1+Math.cos(a)*.22,Math.sin(a)*.22],.015,m.edge,p);
    return p;
  };
  const rail=(points,parent=root)=>{
    pipe(points,.026,m.bright,parent);
    for(const p of points)rod(p,[p[0],p[1]-.48,p[2]],.025,m.satin,parent);
  };
  const bushing=(x,y,z,h=1,parent=root)=>{
    cyl(.07,.14,h,m.satin,parent,x,y+h/2,z);
    for(let i=0;i<9;i++)cyl(.16-i*.005,.18-i*.005,.055,m.bright,parent,x,y+.12+i*(h-.22)/9,z);
    cyl(.065,.065,.13,m.bright,parent,x,y+h,z);
  };
  function finish(source,view=[14,8,22],turn=.016){
    root.name='proton-monument-'+source;root.userData.source=source;root.userData.view=view;
    root.userData.monumentTextures=[brush];root.userData.monumentMaterials=Object.values(m);
    root.userData.update=(time)=>{root.rotation.y=Math.sin(time*.095)*turn;dynamic.forEach(fn=>fn(time));};
    root.userData.update(0);return root;
  }
  return {T,root,m,mesh,cyl,sphere,box,rod,pipe,ring,group,lathe,flange,valve,rail,bushing,dynamic,finish};
}

function nuclear(k) {
  const {root,m,cyl,rod,ring,lathe,pipe,box}=k;
  const bottom=.92,top=10.9,throat=7.7,a=1.79,b=.376;
  const radius=y=>Math.sqrt(a*a+b*b*(y-throat)*(y-throat));
  const outer=[],inner=[],wall=.072,steps=96;
  for(let i=0;i<=steps;i++){const y=bottom+(top-bottom)*i/steps;outer.push([radius(y),y]);}
  for(let i=steps;i>=0;i--){const y=bottom+(top-bottom)*i/steps;inner.push([radius(y)-wall,y]);}
  // Closed thin-wall profile: the interior is modeled all the way down to the basin.
  const shell=lathe([...outer,...inner,outer[0]],m.shell,root,192);
  shell.name='hollow-hyperboloid-shell';shell.userData.openThroat=true;shell.userData.wallThickness=wall;
  ring(radius(top)-wall*.5,.047,m.bright,root,0,top,0);
  ring(radius(bottom)-.02,.07,m.satin,root,0,bottom,0);
  // Closely spaced slip-form joints remain fine, rather than cartoon ribs.
  for(let i=1;i<28;i++){const y=bottom+(top-bottom)*i/28;ring(radius(y)+.004,.008,m.seam,root,0,y,0);}
  for(let i=0;i<32;i++){
    const angle=i*Math.PI*2/32,points=[];
    for(let n=0;n<=32;n++){const y=bottom+(top-bottom)*n/32,r=radius(y)+.004;points.push([Math.cos(angle)*r,y,Math.sin(angle)*r]);}
    pipe(points,.006,m.seam);
  }
  const rb=radius(bottom);
  for(let i=0;i<24;i++){
    const t=i*Math.PI*2/24,dt=.063;
    rod([Math.cos(t-dt)*(rb-.08),.1,Math.sin(t-dt)*(rb-.08)],[Math.cos(t)*rb,bottom,Math.sin(t)*rb],.07,m.shell);
    rod([Math.cos(t+dt)*(rb-.08),.1,Math.sin(t+dt)*(rb-.08)],[Math.cos(t)*rb,bottom,Math.sin(t)*rb],.07,m.shell);
  }
  ring(rb-.1,.12,m.shell,root,0,.11,0);
  cyl(rb-.22,rb-.22,.06,m.black,root,0,.075,0,96);
  // The upper fill remains below the throat so the opening has credible depth.
  cyl(radius(3.1)-.2,radius(3.1)-.2,.1,m.dark,root,0,3.1,0,96);
  for(let i=-6;i<=6;i++)box(.045,.12,Math.sqrt(Math.max(0,4.1-i*i*.075))*2,m.satin,root,i*.29,3.18,0,0);
  pipe([[-3.52,.25,.3],[-3.15,.25,.3],[-2.75,.32,.3]],.16,m.satin);
  const inlet=k.group(root,-3.46,.25,.3);inlet.rotation.z=Math.PI/2;k.flange(0,0,0,.23,inlet);
  return k.finish('nuclear',[14,9,24],.012);
}

function flare(k) {
  const {root,m,cyl,ring,rod,box,pipe}=k;
  // A slender elevated flare stack, with four-legged steel support and access deck.
  cyl(.36,.5,11.6,m.shell,root,0,5.9,0,64);
  for(let i=0;i<4;i++){
    const a=Math.PI/4+i*Math.PI/2,x=Math.cos(a),z=Math.sin(a);
    rod([x*1.18,.03,z*1.18],[x*.42,10,z*.42],.06,m.satin);
    box(.45,.08,.45,m.edge,root,x*1.18,.04,z*1.18);
    for(let j=0;j<5;j++){
      const y=.3+j*1.7,r1=1.17-y*.075,r2=1.17-(y+1.7)*.075;
      const a2=a+Math.PI/2;
      rod([x*r1,y,z*r1],[Math.cos(a2)*r2,y+1.7,Math.sin(a2)*r2],.03,m.satin);
      rod([Math.cos(a2)*r1,y,Math.sin(a2)*r1],[x*r2,y+1.7,z*r2],.03,m.satin);
    }
  }
  for(let i=0;i<8;i++)ring(.5-i*.018,.018,m.edge,root,0,.8+i*1.27,0);
  // Ladder and protective hoops.
  rod([.62,.15,-.06],[.62,10.3,-.06],.025,m.bright);rod([.62,.15,.3],[.62,10.3,.3],.025,m.bright);
  for(let y=.25;y<10.3;y+=.22)rod([.62,y,-.06],[.62,y,.3],.021,m.bright);
  for(let y=2;y<10;y+=.72){const o=ring(.31,.018,m.satin,root,.78,y,.12);o.scale.x=.9;}
  cyl(.91,.91,.07,m.satin,root,0,10.13,0,64);
  ring(.9,.025,m.bright,root,0,10.85,0);ring(.9,.024,m.bright,root,0,10.5,0);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([Math.cos(a)*.9,10.17,Math.sin(a)*.9],[Math.cos(a)*.9,10.85,Math.sin(a)*.9],.025,m.bright);}
  cyl(.43,.33,.7,m.edge,root,0,11.64,0,64,true);ring(.425,.035,m.bright,root,0,11.99,0);
  cyl(.28,.28,.035,m.amber,root,0,11.77,0,48);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([Math.cos(a)*.3,11.22,Math.sin(a)*.3],[Math.cos(a)*.37,11.78,Math.sin(a)*.37],.018,m.bright);}
  pipe([[-2,.35,0],[-1.1,.35,0],[-.76,.65,0],[-.68,1.1,0],[0,1.2,0]],.2,m.shell);
  k.valve(-1.48,.43,0,.8).rotation.z=Math.PI/2;
  return k.finish('flare',[16,7,25],.019);
}

function wind(k) {
  const {root,m,cyl,box,sphere,group,mesh,dynamic,T}=k;
  cyl(.19,.51,10.8,m.shell,root,0,5.45,0,80);
  k.ring(.5,.026,m.bright,root,0,.2,0);k.ring(.34,.008,m.seam,root,0,5.4,0);
  box(.9,.72,2.1,m.shell,root,0,11, -.35,.12);
  box(.67,.035,1.12,m.edge,root,0,11.39,-.52,.006);
  for(let i=0;i<10;i++)box(.64,.025,.035,m.satin,root,0,11.415,-1+i*.105,.002);
  const rotor=group(root,0,11,.8);rotor.userData.monumentDynamic=true;
  const hub=sphere(.48,m.bright,rotor);hub.scale.set(1,1,1.75);
  // Airfoil sections taper and twist along the blade, with a thick leading edge.
  const bladeGeometry=()=>{
    const sections=32,around=16,positions=[],indices=[];
    for(let i=0;i<=sections;i++){
      const t=i/sections,y=.28+t*4.7,chord=(.12+.58*Math.sin(Math.PI*Math.pow(t,.55)))*(1-.75*t),twist=.3*(1-t)-.12;
      for(let j=0;j<around;j++){
        const a=j/around*Math.PI*2,u=Math.cos(a)*chord*.5,v=Math.sin(a)*chord*.095;
        positions.push(u*Math.cos(twist)+v*Math.sin(twist)+.28*t*t,y,-u*Math.sin(twist)+v*Math.cos(twist));
      }
    }
    for(let i=0;i<sections;i++)for(let j=0;j<around;j++){const a=i*around+j,b=i*around+(j+1)%around,c=a+around,d=b+around;indices.push(a,c,b,b,c,d);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  };
  const blade=bladeGeometry();
  for(let i=0;i<3;i++){const b=mesh(blade,m.shell,rotor);b.rotation.z=i*Math.PI*2/3+.14;}
  dynamic.push(time=>{rotor.rotation.z=-time*.105;});
  box(.29,.58,.035,m.edge,root,0,.58,.49,.035);
  return k.finish('wind',[10,4,28],.007);
}

function grid(k) {
  const {root,m,box,cyl,rod,pipe,bushing,ring}=k;
  box(4.3,3.9,2.7,m.shell,root,0,2.62,0,.11);
  box(4.55,.16,2.95,m.bright,root,0,4.6,0);
  for(const side of [-1,1]){
    for(let i=0;i<19;i++)box(.12,2.78,1.32,m.shell,root,side*2.68,2.55,-1.13+i*.126,.03);
    rod([side*2.43,1.25,-1.3],[side*2.43,3.92,-1.3],.105,m.bright);
    rod([side*2.43,1.25,1.3],[side*2.43,3.92,1.3],.105,m.bright);
    pipe([[side*1.8,3.65,0],[side*2.1,4.1,0],[side*2.55,4.1,0]],.11,m.satin);
    box(.28,.25,3.2,m.edge,root,side*1.44,.39,0);
  }
  // Conservator tank suspended behind the main transformer.
  const tank=cyl(.52,.52,3.65,m.shell,root,0,5.3,-1.28,64);tank.rotation.z=Math.PI/2;
  for(const x of [-1.5,1.5]){const r=ring(.52,.05,m.bright,root,x,5.3,-1.28);r.rotation.z=Math.PI/2;}
  for(let i=0;i<3;i++){
    bushing(-1.44+i*1.44,4.72,.35,1.7);
    bushing(-1.43+i*1.43,4.72,-.45,.69);
    pipe([[-1.44+i*1.44,6.44,.35],[-1.44+i*1.44,7.6,.3],[-1.44+i*1.44,8.1,-1.55]],.04,m.bright);
  }
  for(const x of [-3.65,3.65]){
    rod([x,.1,-2],[x,8.25,-2],.1,m.satin);
    rod([x-.34,.1,-2],[x,3,-2],.05,m.edge);rod([x+.34,.1,-2],[x,3,-2],.05,m.edge);
  }
  rod([-3.65,8.25,-2],[3.65,8.25,-2],.11,m.bright);
  for(let i=0;i<3;i++)bushing(-1.44+i*1.44,7.32,-2,.7);
  box(.63,1.13,.28,m.edge,root,-.95,2.65,1.51);
  for(let i=0;i<3;i++)box(.26,.024,.024,i===0?m.amber:m.bright,root,-.95,2.95-i*.19,1.66,.003);
  cyl(.16,.16,.06,m.bright,root,1.37,2.85,1.4).rotation.x=Math.PI/2;
  return k.finish('grid',[15,9,24],.018);
}

function solar(k) {
  const {T,root,m,group,box,rod,cyl,mesh}=k;
  const field=group(root,0,3.8,0);field.rotation.x=-.5;
  // A single architectural canopy; deep-black cells sit inside machined platinum frames.
  const cols=4,rows=3,w=2.1,h=2.88,gap=.075;
  const cw=(w-.14)/6,ch=(h-.14)/10,cut=.025,cellShape=new T.Shape();
  cellShape.moveTo(-cw/2+cut,-ch/2);cellShape.lineTo(cw/2-cut,-ch/2);cellShape.lineTo(cw/2,-ch/2+cut);cellShape.lineTo(cw/2,ch/2-cut);cellShape.lineTo(cw/2-cut,ch/2);cellShape.lineTo(-cw/2+cut,ch/2);cellShape.lineTo(-cw/2,ch/2-cut);cellShape.lineTo(-cw/2,-ch/2+cut);cellShape.closePath();
  const cellGeometry=new T.ShapeGeometry(cellShape);
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
    const x=(c-(cols-1)/2)*(w+gap),y=(r-(rows-1)/2)*(h+gap);
    box(w,h,.095,m.bright,field,x,y,0,.018);
    box(w-.12,h-.12,.025,m.black,field,x,y,.061,.006);
    for(let sx=0;sx<6;sx++)for(let sy=0;sy<10;sy++)mesh(cellGeometry,m.cell,field,x+(sx-2.5)*cw,y+(sy-4.5)*ch,.077);
    for(const edge of [-1,1])box(.007,h-.15,.005,m.cellLine,field,x+edge*.52,y,.079,0);
  }
  for(const x of [-2.2,2.2]){
    cyl(.095,.14,4.2,m.satin,root,x,1.82,-.2,24);
    rod([x,1.3,-.2],[x,5,-1.45],.075,m.bright);
    rod([x,1.3,-.2],[x,2.6,1.24],.075,m.bright);
  }
  for(const y of [-2.7,2.7])box(8.9,.09,.12,m.edge,field,0,y,-.12);
  // Rotate the array toward the camera with landscape proportion.
  field.rotation.z=Math.PI/2;
  root.rotation.y=-.12;
  return k.finish('solar',[11,8,25],.016);
}

function landfill(k) {
  const {root,m,group,cyl,ring,sphere,box,pipe,rod}=k;
  // Collected-gas treatment: tall knock-out vessel, manifold and centrifugal blower.
  const vessel=group(root,-1.25,0,0);
  cyl(1.02,1.02,5.5,m.shell,vessel,0,3.8,0,80);
  const cap=sphere(1.02,m.shell,vessel,0,6.55,0);cap.scale.y=.48;
  const low=sphere(1.02,m.satin,vessel,0,1.05,0);low.scale.y=.48;
  for(const y of [1.22,2.55,4.15,6.32])ring(1.025,.034,m.bright,vessel,0,y,0);
  for(const x of [-.76,.76])for(const z of [-.55,.55])rod([x,.08,z],[x,1.46,z],.083,m.satin,vessel);
  box(.75,.1,.75,m.edge,vessel,0,6.93,0);
  cyl(.23,.23,.8,m.bright,vessel,0,7.2,0);
  pipe([[-1.25,7.6,0],[-1.25,8.08,0],[.7,8.08,0],[1.75,7.7,0],[1.75,5.6,0]],.21,m.bright);
  cyl(.58,.58,3.75,m.shell,root,1.75,3.75,0,64);
  const top=sphere(.58,m.bright,root,1.75,5.63,0);top.scale.y=.45;
  for(const y of [2.0,3.3,4.8,5.54])ring(.59,.035,m.edge,root,1.75,y,0);
  pipe([[-3.4,.85,1.08],[-1.9,.85,1.08],[-1.25,1.25,1.08],[-1.25,2,1.05]],.2,m.bright);
  for(let i=0;i<3;i++){
    const x=-3.05+i*.72;
    pipe([[x,.86,1.08],[x,.86,1.75],[x,.45,2.05],[x,.06,2.05]],.115,m.shell);
    k.valve(x,.86,1.75,.7).rotation.x=Math.PI/2;
  }
  const blower=group(root,1.6,1.05,1.8);
  const housing=cyl(.76,.76,.5,m.shell,blower,0,0,0,72);housing.rotation.x=Math.PI/2;
  const throat=cyl(.4,.4,.57,m.edge,blower,0,0,.04,64,true);throat.rotation.x=Math.PI/2;
  const lip=ring(.42,.047,m.bright,blower,0,0,.34);lip.rotation.x=0;
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;const fin=box(.025,.47,.07,m.bright,blower,Math.sin(a)*.39,Math.cos(a)*.39,.02,.004);fin.rotation.z=-a+.3;
  }
  pipe([[1.75,1.95,0],[2.6,1.95,0],[2.7,1.3,1.2],[2.25,1.08,1.8]],.19,m.shell);
  const motor=cyl(.4,.4,1.1,m.satin,root,1.6,1.05,2.55,48);motor.rotation.x=Math.PI/2;
  for(let i=0;i<10;i++){const a=i*Math.PI/5;box(.03,.03,1.07,m.bright,root,1.6+Math.sin(a)*.415,1.05+Math.cos(a)*.415,2.55,.003);}
  for(const x of [1.07,2.1])box(.18,.28,1.66,m.edge,root,x,.28,2.1);
  return k.finish('landfill',[13,8,25],.02);
}

function industrial(k) {
  const {root,m,group,cyl,ring,box,rod,pipe,sphere}=k;
  // Shell-and-tube heat recovery vessel with visible nested pipework and an exhaust stack.
  const exchanger=group(root,0,3,0);exchanger.rotation.z=Math.PI/2;
  cyl(1.05,1.05,6.3,m.shell,exchanger,0,0,0,80);
  for(const y of [-3.13,-2.64,0,2.64,3.13]){ring(1.075,.052,m.bright,exchanger,0,y,0);k.flange(0,y,0,1.17,exchanger);}
  const cover=cyl(.99,.99,.11,m.edge,exchanger,0,-3.27,0,64);
  for(let j=-3;j<=3;j++)for(let i=-3;i<=3;i++)if(i*i+j*j<12){
    const tube=cyl(.081,.081,.13,m.bright,exchanger,i*.24,-3.35,j*.24,16,true);
  }
  for(const x of [-2,2]){
    box(.42,1.95,1.65,m.satin,root,x,1.28,0,.035);
    box(.8,.1,2.2,m.edge,root,x,.24,0);
  }
  cyl(.44,.54,8.7,m.shell,root,1.8,4.5,-1.85,64);
  for(let i=0;i<8;i++)ring(.53-i*.011,.019,m.edge,root,1.8,.65+i*1.13,-1.85);
  ring(.44,.036,m.bright,root,1.8,8.87,-1.85);
  cyl(.38,.38,.025,m.black,root,1.8,8.8,-1.85);
  pipe([[-1.2,4.02,0],[-1.2,5.25,0],[-.55,5.83,-.15],[.6,5.83,-.4],[1.8,5.4,-1.3],[1.8,4.7,-1.85]],.28,m.bright);
  pipe([[2.4,2.22,.45],[2.4,1.18,1.15],[-2.6,1.18,1.15],[-3.4,1.72,1.15],[-3.4,2.55,.48]],.15,m.satin);
  k.valve(-.7,1.18,1.15,.86).rotation.z=Math.PI/2;
  box(1.25,.11,1.1,m.satin,root,1.8,6.8,-1.85);
  k.rail([[1.1,7.45,-1.3],[2.5,7.45,-1.3],[2.5,7.45,-2.4],[1.1,7.45,-2.4]]);
  return k.finish('industrial',[15,9,25],.018);
}

function hydro(k) {
  const {T,root,m,mesh,box,rod,pipe,cyl,ring}=k;
  // A curved gravity-dam slice, with machined penstocks and an exposed Francis runner.
  const segments=80,verts=[],indices=[],r=8.5,arc=.56;
  for(let i=0;i<=segments;i++){
    const t=-arc+i/segments*arc*2;
    for(const [radius,y] of [[r,0],[r-.92,7.2],[r-1.32,7.2],[r-2.5,0]]){
      verts.push(Math.sin(t)*radius,y,Math.cos(t)*radius-r+1.1);
    }
  }
  for(let i=0;i<segments;i++)for(let j=0;j<4;j++){const a=i*4+j,b=(i+1)*4+j,c=(i+1)*4+(j+1)%4,d=i*4+(j+1)%4;indices.push(a,b,d,b,c,d);}
  indices.push(0,3,1,1,3,2);const end=segments*4;indices.push(end,end+1,end+3,end+1,end+2,end+3);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,m.shell);
  for(let i=0;i<13;i++){
    const t=-arc+i/12*arc*2;
    rod([Math.sin(t)*r,.05,Math.cos(t)*r-r+1.108],[Math.sin(t)*(r-.92),7.2,Math.cos(t)*(r-.92)-r+1.108],.012,m.seam);
  }
  for(const x of [-2.7,0,2.7]){
    pipe([[x,6.1,.12],[x,5.5,.75],[x,3.4,1.45],[x,1.25,2.0]],.42,m.bright);
    for(const y of [2,3.1,4.2,5.3]){const rr=ring(.45,.035,m.edge,root,x,y,1.48-(y-3.4)*.35);rr.rotation.x=.32;}
    box(.87,1.38,.09,m.dark,root,x,5.95,.39);
  }
  const crest=[];
  for(let i=0;i<=18;i++){const a=-arc+i/18*arc*2;crest.push([Math.sin(a)*(r-1.04),7.7,Math.cos(a)*(r-1.04)-r+1.1]);}
  k.rail(crest);
  // Runner is large enough to read as engineered steel, integrated at the dam foot.
  const wheel=k.group(root,0,1.25,2.2);wheel.rotation.x=Math.PI/2;
  cyl(.35,.48,1.14,m.bright,wheel,0,0,0,64);ring(1.08,.09,m.shell,wheel,0,.4,0);ring(.95,.09,m.shell,wheel,0,-.38,0);
  for(let i=0;i<17;i++){
    const a=i*Math.PI*2/17,points=[];
    for(let j=0;j<=8;j++){const t=j/8,ang=a+t*.54,rad=.47+t*.54;points.push([Math.cos(ang)*rad,(t-.5)*.8,Math.sin(ang)*rad]);}
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    const blade=new T.TubeGeometry(curve,12,.082,5,false);mesh(blade,m.bright,wheel);
  }
  return k.finish('hydro',[13,9,25],.014);
}

const builders={landfill,flare,hydro,nuclear,wind,solar,industrial,grid};
export function buildFacilityMonument(T,source='nuclear') {
  const build=builders[source];if(!build)throw new RangeError('Unknown facility source: '+source);
  return build(kit(T));
}

