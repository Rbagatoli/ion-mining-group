/* Shared materials and small mechanical parts for original energy-site miniatures. */
export function createSiteKit(T) {
  const root=new T.Group(),motion={rotors:[],terminals:[],flows:[],movers:[],updates:[]};root.userData.motion=motion;
  const material=(color,roughness=.34,metalness=.86,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
  const m={shell:material(0xb8b7b4,.26,.95),silver:material(0xcdccc8,.22,.96),rib:material(0x8e8d8a,.28,.94),frame:material(0x686765,.29,.9),dark:material(0x111112,.72,.25),pad:material(0x303332,.85,.3),earth:material(0x5b615a,.8,.45),orange:material(0xe77c10,.3,.74),glow:material(0xf7931a,.3,.6,{emissive:0xf7931a,emissiveIntensity:.5}),water:material(0x4b798a,.2,.75),glass:material(0x132e40,.22,.72),road:material(0x171b1c,.95,.08)};
  function mesh(geo,mat,x=0,y=0,z=0,parent=root){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function box(w,h,d,mat,x,y,z,parent=root,r=.025){
    r=Math.min(r,w/5,h/5,d/5);const s=new T.Shape();s.moveTo(-w/2+r,-h/2+r);s.lineTo(w/2-r,-h/2+r);s.lineTo(w/2-r,h/2-r);s.lineTo(-w/2+r,h/2-r);s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:d-2*r,steps:1,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:1});g.translate(0,0,-d/2+r);return mesh(g,mat,x,y,z,parent);
  }
  function cyl(r,h,mat,x,y,z,parent=root,axis='y',rt=r){const o=mesh(new T.CylinderGeometry(rt,r,h,24),mat,x,y,z,parent);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;return o;}
  function rod(a,b,r,mat,parent=root){const u=new T.Vector3(...a),v=new T.Vector3(...b),d=v.clone().sub(u);const o=mesh(new T.CylinderGeometry(r,r,d.length(),10),mat,0,0,0,parent);o.position.copy(u.add(v).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
  function pipe(points,r=.05,mat=m.silver,parent=root){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal');return mesh(new T.TubeGeometry(curve,points.length*12,r,8,false),mat,0,0,0,parent);}
  function torus(r,t,mat,x,y,z,parent=root,axis='z'){const o=mesh(new T.TorusGeometry(r,t,6,32),mat,x,y,z,parent);if(axis==='y')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.y=Math.PI/2;return o;}
  function group(x=0,y=0,z=0,parent=root,dynamic=false){const o=new T.Group();o.position.set(x,y,z);if(dynamic)o.userData.sourcingDynamic=true;parent.add(o);return o;}
  function pad(w=14,d=6.2){box(w,.18,d,m.pad,0,-.09,0,root,.055);box(w+.12,.075,d+.12,m.frame,0,-.205,0,root,.025);}
  function flow(points,{color=0xffb64f,count=3,speed=.18,radius=.043}={}){motion.flows.push({points,color,count,speed,radius});}
  function rotor(node,axis='y',speed=1,phase=0){node.userData.sourcingDynamic=true;motion.rotors.push({node,axis,speed,phase});}
  function mover(node,points,{speed=.1,closed=true,orient=true,phase=0}={}){node.userData.sourcingDynamic=true;motion.movers.push({node,points,speed,closed,orient,phase});}
  function transformer(x,y,z,scale=1){
    const g=group(x,y,z);g.scale.setScalar(scale);box(1.55,.12,1.05,m.frame,0,.06,0,g);box(1.1,1.0,.75,m.rib,0,.65,0,g);box(1.25,.10,.91,m.silver,0,1.2,0,g);
    for(let i=0;i<10;i++)for(const p of [-.46,.46])box(.04,.9,.18,m.shell,-.49+i*.109,.64,p,g,.008);
    for(const px of [-.38,0,.38]){cyl(.065,.34,m.frame,px,1.43,0,g);for(let k=0;k<5;k++)cyl(.10,.025,m.silver,px,1.3+k*.057,0,g);}
    if(!motion.terminals.length)motion.terminals=[-.38,0,.38].map(px=>[x+px*scale,y+1.6*scale,z]);
    return g;
  }
  function cabinet(x,y,z,w=.55,h=1.25,parent=root){box(w,h,.55,m.shell,x,y+h/2,z,parent);box(w-.07,h-.1,.03,m.rib,x,y+h/2,z+.285,parent);box(.16,.1,.02,m.dark,x,y+h*.73,z+.31,parent);box(.045,.15,.03,m.dark,x+w*.29,y+h*.5,z+.32,parent);for(let i=0;i<5;i++)box(w*.65,.022,.018,m.frame,x,y+.14+i*.07,z+.312,parent);}
  function powerhouse(x,y,z,{w=2.4,h=1.8,d=1.5}={}){const g=group(x,y,z);box(w,h,d,m.shell,0,h/2,0,g,.045);box(w+.12,.09,d+.1,m.silver,0,h+.045,0,g);for(let i=0;i<9;i++)box(w*.52,.037,.035,m.dark,w*.17,.25+i*.115,d/2+.025,g);box(w*.26,h*.75,.03,m.rib,-w*.3,h*.48,d/2+.018,g);box(.04,.22,.055,m.dark,-w*.23,h*.48,d/2+.06,g);box(.33,.03,.04,m.glow,0,h*.88,d/2+.03,g);return g;}
  function fan(x,y,z,r=.33,axis='y',parent=root){const g=group(x,y,z,parent);cyl(r,.04,m.dark,0,0,0,g,axis);const blades=group(0,0,0,g,true);for(let i=0;i<6;i++){const a=i*Math.PI/3;const blade=box(r*.62,.025,r*.21,m.rib,Math.sin(a)*r*.45,.025,Math.cos(a)*r*.45,blades,.008);blade.rotation.y=a+.5;}if(axis==='z')g.rotation.x=Math.PI/2;rotor(blades,'y',3.1);for(const rr of [.12,.21,.30].filter(v=>v<r))torus(rr,.012,m.silver,0,.06,0,g,'y');return g;}
  return {T,root,m,motion,mesh,box,cyl,rod,pipe,torus,group,pad,flow,rotor,mover,transformer,cabinet,powerhouse,fan};
}
