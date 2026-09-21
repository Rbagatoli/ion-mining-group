/* Lightweight live presentation of the two original sourcing compositions.
   The host controls visibility/motion. Static parts are batched by material. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './vendor/three-0.185.1/RoomEnvironment.js';

function batchStatic(root) {
  root.updateMatrixWorld(true);
  const batches=new Map(),removed=[],oldGeometry=new Set();
  root.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material))return;
    for(let parent=object;parent;parent=parent.parent)if(parent.userData.sourcingDynamic)return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!batches.has(object.material))batches.set(object.material,[]);
    batches.get(object.material).push(geometry);removed.push(object);oldGeometry.add(object.geometry);
  });
  removed.forEach(object=>object.removeFromParent());oldGeometry.forEach(geometry=>geometry.dispose());
  for(const [material,geometries] of batches){
    const vertices=geometries.reduce((n,g)=>n+g.attributes.position.count,0);
    const count=geometries.reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count),0);
    const position=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),index=new Uint32Array(count);
    let offset=0,ix=0;
    for(const geometry of geometries){
      const p=geometry.attributes.position,n=geometry.attributes.normal,u=geometry.attributes.uv;
      position.set(p.array,offset*3);normal.set(n.array,offset*3);if(u)uv.set(u.array,offset*2);
      const length=geometry.index?geometry.index.count:p.count;
      for(let k=0;k<length;k++)index[ix++]=offset+(geometry.index?geometry.index.getX(k):k);
      offset+=p.count;geometry.dispose();
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(position,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(new T.BufferAttribute(index,1));
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
}

function powerEffects(scene,motion) {
  const arcMaterial=new T.MeshBasicMaterial({color:0xffb345,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const haloMaterial=new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const arcs=new T.Group();scene.add(arcs);
  const terminals=motion.terminals||[];
  // Short, softly appearing arcs above the bushings. No rapid flashing.
  for(let i=0;i<terminals.length-1;i++){
    const a=new T.Vector3(...terminals[i]),b=new T.Vector3(...terminals[i+1]),dx=b.x-a.x;
    const points=[a,a.clone().add(new T.Vector3(-.10,.19,.025)),a.clone().add(new T.Vector3(dx*.56,.44,.012)),a.clone().add(new T.Vector3(dx*.35,.24,.02)),b.clone().add(new T.Vector3(.055,.12,0)),b];
    const curve=new T.CurvePath();for(let k=1;k<points.length;k++)curve.add(new T.LineCurve3(points[k-1],points[k]));
    arcs.add(new T.Mesh(new T.TubeGeometry(curve,25,.017,6,false),arcMaterial));
    arcs.add(new T.Mesh(new T.TubeGeometry(curve,25,.054,6,false),haloMaterial));
  }
  const pulses=[],pulseMaterial=new T.MeshBasicMaterial({color:0xffca77,toneMapped:false});
  const path=motion.flowPath?.length>1?new T.CatmullRomCurve3(motion.flowPath.map(p=>new T.Vector3(...p)),false,'centripetal'):null;
  if(path)for(let i=0;i<3;i++){const pulse=new T.Mesh(new T.SphereGeometry(.038,10,8),pulseMaterial);scene.add(pulse);pulses.push(pulse);}
  return time=>{
    const phase=(time+1.1)%5.4,opacity=phase<.95?Math.sin(phase/.95*Math.PI):0;
    arcs.visible=opacity>.001;arcMaterial.opacity=opacity*.88;haloMaterial.opacity=opacity*.14;
    pulses.forEach((pulse,i)=>pulse.position.copy(path.getPointAt((time*.13+i/3)%1)));
  };
}

export async function mountSourcingScene(host,buildScene,{kind,onError=()=>{}}={}) {
  let renderer,environment,room,pmrem;
  let scene,model,camera,disposed=false,active=false,moving=true,frame=0,last=0,time=0,lastShadow=-1;
  let resizeObserver;
  try {
    renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.setClearColor(0,0);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');canvas.className='sourcing-canvas';
    scene=new T.Scene();room=new RoomEnvironment();pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.04);
    scene.environment=environment.texture;scene.environmentIntensity=.95;scene.environmentRotation.y=.85;room.dispose();pmrem.dispose();
    model=buildScene(T);scene.add(model);
    const motion=model.userData.motion||{};
    batchStatic(model);
    scene.add(new T.HemisphereLight(0xf4f3ef,0x202020,.85));
    const key=new T.DirectionalLight(0xfffaf0,2.6);key.position.set(-10,30,16);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-16,right:16,top:14,bottom:-14,near:.1,far:90});key.shadow.bias=-.0001;key.shadow.normalBias=.025;scene.add(key);
    const rim=new T.DirectionalLight(0xf0efeb,2);rim.position.set(12,14,-18);scene.add(rim);
    const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());
    camera=new T.OrthographicCamera(-12,12,5,-5,.1,160);camera.position.copy(center).add(kind==='discovery'?new T.Vector3(8,14,29):new T.Vector3(9,9,24));camera.lookAt(center);camera.updateMatrixWorld();
    const projected=new T.Box3(),point=new T.Vector3(),transform=new T.Matrix4();
    model.updateMatrixWorld(true);model.traverse(object=>{const positions=object.geometry?.attributes.position;if(!positions)return;transform.multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld);for(let i=0;i<positions.count;i++)projected.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(transform));});
    const size=projected.getSize(new T.Vector3()),c=projected.getCenter(new T.Vector3()),half=Math.max(size.y/2,size.x/2/2.4)/.925;
    camera.left=c.x-half*2.4;camera.right=c.x+half*2.4;camera.top=c.y+half;camera.bottom=c.y-half;camera.updateProjectionMatrix();
    const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.16}));ground.rotation.x=-Math.PI/2;ground.position.y=bounds.min.y-.025;ground.receiveShadow=true;scene.add(ground);
    const effects=powerEffects(scene,motion);
    function render(){
      if(disposed)return;
      for(const rotor of motion.rotors||[])rotor.node.rotation[rotor.axis]=(rotor.phase||0)+time*rotor.speed;
      effects(time);
      if(time-lastShadow>.22||lastShadow<0){renderer.shadowMap.needsUpdate=true;lastShadow=time;}
      renderer.render(scene,camera);
    }
    function tick(now){
      frame=0;if(disposed||!active||!moving)return;
      if(!last)last=now;
      const delta=(now-last)/1000;
      if(delta>=1/30){time+=Math.min(delta,.1);last=now;render();}
      frame=requestAnimationFrame(tick);
    }
    function sync(){if(frame){cancelAnimationFrame(frame);frame=0;}last=0;if(active&&moving&&!disposed)frame=requestAnimationFrame(tick);}
    function resize(){if(disposed)return;renderer.setSize(Math.max(1,host.clientWidth),Math.max(1,host.clientWidth/2.4),false);render();}
    function contextLost(event){event.preventDefault();dispose();onError();}
    function dispose(){
      if(disposed)return;disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);canvas.remove();
      const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());environment.dispose();renderer.dispose();
    }
    canvas.addEventListener('webglcontextlost',contextLost);host.append(canvas);resize();
    // Compilation completes before the poster is hidden, avoiding a blank canvas flash.
    if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
    if(disposed)throw new Error('Sourcing context lost during initialization');
    render();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
    return {setActive(value){active=!!value;sync();},setMotion(value){moving=!!value;sync();},dispose};
  }catch(error){
    if(!disposed){renderer?.domElement.remove();environment?.dispose();room?.dispose();pmrem?.dispose();renderer?.dispose();}
    throw error;
  }
}
