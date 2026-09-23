/* Transparent studio stage for the original platinum architectural monuments.
   One WebGL context is reused across all energy sources. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './vendor/three-0.185.1/RoomEnvironment.js';

function release(root) {
  if(!root)return;
  const geometry=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{
    o.shadow?.map?.dispose();o.shadow?.mapPass?.dispose();
    if(o.geometry)geometry.add(o.geometry);
    if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
    for(const t of o.userData.monumentTextures||[])textures.add(t);
    for(const m of o.userData.monumentMaterials||[])materials.add(m);
  });
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();
}

// Thousands of little construction details become a handful of material draws.
// Moving turbine blades retain their own object hierarchy.
function batchArchitecture(root) {
  root.updateMatrixWorld(true);
  const groups=new Map(),remove=[],oldGeometry=new Set(),inverse=new T.Matrix4().copy(root.matrixWorld).invert();
  root.traverse(o=>{
    if(!o.isMesh||Array.isArray(o.material))return;
    for(let parent=o;parent;parent=parent.parent)if(parent.userData.monumentDynamic)return;
    const transform=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld);
    const g=o.geometry.clone().applyMatrix4(transform);
    if(!g.attributes.normal)g.computeVertexNormals();
    if(!groups.has(o.material))groups.set(o.material,[]);
    groups.get(o.material).push(g);remove.push(o);oldGeometry.add(o.geometry);
  });
  remove.forEach(o=>o.removeFromParent());oldGeometry.forEach(g=>g.dispose());
  for(const [material,parts] of groups){
    const vertices=parts.reduce((n,g)=>n+g.attributes.position.count,0),indices=parts.reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count),0);
    const positions=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),index=new Uint32Array(indices);
    let offset=0,at=0;
    for(const g of parts){
      const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
      positions.set(p.array,offset*3);normals.set(n.array,offset*3);if(u)uv.set(u.array,offset*2);
      const count=g.index?g.index.count:p.count;
      for(let i=0;i<count;i++)index[at++]=offset+(g.index?g.index.getX(i):i);
      offset+=p.count;g.dispose();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(new T.BufferAttribute(index,1));g.computeBoundingSphere();
    const mesh=new T.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
}

export async function mountFacilityMonument(host,{source='nuclear',modelsUrl,onError=()=>{}}={}) {
  if(!host)throw new TypeError('A facility monument host is required.');
  let renderer,scene,camera,environment,room,pmrem,model,ground,key,resizeObserver,visibilityObserver;
  let disposed=false,active=false,moving=true,visible=true,pageVisible=true,frame=0,last=0,time=0,revision=0,queue=Promise.resolve(),projected=null,failed=false;
  const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  let canvas;
  const doc=host.ownerDocument||document;
  const defaultModels=new URL('./home-facility-monuments.js',import.meta.url);
  const version=new URL(import.meta.url).searchParams.get('v');if(version)defaultModels.searchParams.set('v',version);
  host.dataset.renderState='loading';
  function markFailure(error){
    if(disposed||failed)return;failed=true;host.dataset.renderState='fallback';
    try{onError(error);}catch{/* Reporting must not prevent GPU cleanup. */}
  }
  function canAnimate(){return !disposed&&active&&moving&&!reduced?.matches&&visible&&pageVisible&&!doc.hidden;}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
  function render(){
    if(disposed||!renderer||!model)return;
    model.userData.update?.(time);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
  }
  function tick(now){
    frame=0;if(!canAnimate())return;
    if(!last)last=now;
    const dt=(now-last)/1000;
    if(dt>=1/30){time+=Math.min(dt,.1);last=now;render();}
    frame=requestAnimationFrame(tick);
  }
  function sync(){stop();if(canAnimate())frame=requestAnimationFrame(tick);}
  function fit(){
    if(!camera||!projected)return;
    const width=Math.max(1,host.clientWidth||host.getBoundingClientRect().width||600);
    const height=Math.max(1,host.clientHeight||host.getBoundingClientRect().height||450);
    const aspect=width/height,size=projected.getSize(new T.Vector3()),center=projected.getCenter(new T.Vector3());
    // Keep slender towers architectural and tall; wide equipment fits the same art area.
    const half=Math.max(size.y/2,size.x/(2*aspect))/.91;
    camera.left=center.x-half*aspect;camera.right=center.x+half*aspect;camera.top=center.y+half;camera.bottom=center.y-half;camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  function resize(){if(disposed)return;fit();render();}
  function calculateFraming(){
    model.userData.update?.(0);model.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());
    camera.position.copy(center).add(new T.Vector3(...model.userData.view));camera.lookAt(center);camera.updateMatrixWorld();
    projected=new T.Box3();const point=new T.Vector3(),transform=new T.Matrix4();
    model.traverse(o=>{
      const p=o.geometry?.attributes.position;if(!p)return;
      transform.multiplyMatrices(camera.matrixWorldInverse,o.matrixWorld);
      for(let i=0;i<p.count;i++)projected.expandByPoint(point.fromBufferAttribute(p,i).applyMatrix4(transform));
    });
    ground.position.y=bounds.min.y-.025;
    key.target.position.copy(center);key.target.updateMatrixWorld();
    const dimension=Math.max(bounds.getSize(new T.Vector3()).length(),12);
    key.position.copy(center).add(new T.Vector3(-10,18,16));
    Object.assign(key.shadow.camera,{left:-dimension/2,right:dimension/2,top:dimension/2,bottom:-dimension/2,near:.1,far:70});key.shadow.camera.updateProjectionMatrix();
    fit();
  }
  function setSource(id){
    if(disposed||!library.FACILITY_SOURCE_IDS.includes(id))return Promise.resolve(false);
    const token=++revision;
    queue=queue.catch(()=>false).then(async()=>{
      if(disposed||token!==revision)return false;
      if(!library.FACILITY_SOURCE_IDS.includes(id))return false;
      let next;
      try{
        if(model?.userData.source===id){failed=false;render();host.dataset.monumentSource=id;host.dataset.renderState='ready';sync();return true;}
        host.dataset.renderState='loading';stop();
        next=library.buildFacilityMonument(T,id);batchArchitecture(next);
        if(disposed||token!==revision){release(next);return false;}
        const old=model;model=next;scene.add(next);release(old);time=0;calculateFraming();
        // The pinned Three compileAsync polls material programs after returning.
        // A hover cancellation/context loss can dispose those programs mid-poll;
        // synchronous preparation keeps teardown atomic with source installation.
        renderer.compile(scene,camera);
        if(disposed||token!==revision)return false;
        failed=false;render();host.dataset.monumentSource=id;host.dataset.renderState='ready';sync();return true;
      }catch(error){
        if(!disposed&&token===revision){markFailure(error);sync();}
        if(next&&next!==model)release(next);return false;
      }
    });
    return queue;
  }
  function contextLost(event){event.preventDefault();markFailure(new Error('Facility WebGL context lost.'));dispose();}
  function motionChange(){if(disposed)return;render();sync();}
  function visibilityChange(){sync();}
  function pageHide(event){pageVisible=false;sync();if(!event.persisted)dispose();}
  function pageShow(){pageVisible=true;resize();sync();}
  function dispose(){
    if(disposed)return;disposed=true;revision++;stop();
    resizeObserver?.disconnect();visibilityObserver?.disconnect();
    doc.removeEventListener('visibilitychange',visibilityChange);
    window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);
    if(reduced?.removeEventListener)reduced.removeEventListener('change',motionChange);else reduced?.removeListener?.(motionChange);
    canvas?.removeEventListener('webglcontextlost',contextLost);
    release(scene);environment?.dispose();pmrem?.dispose();room?.dispose();
    renderer?.dispose();canvas?.remove();model=null;
  }
  let library;
  try{
    library=await import(modelsUrl||defaultModels.href);
    renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    canvas=renderer.domElement;canvas.className='home-monument-canvas';canvas.setAttribute('aria-hidden','true');
    canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';canvas.style.pointerEvents='none';
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.8));
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.setClearColor(0,0);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    scene=new T.Scene();
    room=new RoomEnvironment();
    // Tall softboxes add long, photographic highlight bands to curved platinum.
    const stripMaterial=new T.MeshBasicMaterial({color:0xffffff});
    const stripA=new T.Mesh(new T.PlaneGeometry(3.5,18),stripMaterial);stripA.position.set(-7,6,5);stripA.lookAt(0,5,0);room.add(stripA);
    const stripB=new T.Mesh(new T.PlaneGeometry(1.8,15),stripMaterial);stripB.position.set(6,5,-4);stripB.lookAt(0,4,0);room.add(stripB);
    pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.025);
    scene.environment=environment.texture;scene.environmentIntensity=1.05;scene.environmentRotation.y=.5;
    room.dispose();room=null;pmrem.dispose();pmrem=null;
    scene.add(new T.HemisphereLight(0xffffff,0x22262b,.4));
    key=new T.DirectionalLight(0xffffff,2);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.00012;key.shadow.normalBias=.025;key.shadow.radius=3;scene.add(key,key.target);
    const rim=new T.DirectionalLight(0xf3f4f5,2.7);rim.position.set(12,10,-12);scene.add(rim);
    const softFill=new T.DirectionalLight(0xe4e8ec,.35);softFill.position.set(0,4,20);scene.add(softFill);
    ground=new T.Mesh(new T.PlaneGeometry(70,70),new T.ShadowMaterial({opacity:.10}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    camera=new T.OrthographicCamera(-8,8,8,-8,.1,100);
    canvas.addEventListener('webglcontextlost',contextLost);host.append(canvas);
    if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);}
    if(typeof IntersectionObserver==='function'){visibilityObserver=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);sync();},{threshold:0});visibilityObserver.observe(host);}
    doc.addEventListener('visibilitychange',visibilityChange);
    window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);
    if(reduced?.addEventListener)reduced.addEventListener('change',motionChange);else reduced?.addListener?.(motionChange);
    const ready=await setSource(source);
    if(!ready&&!disposed)throw new Error('Facility monument could not be prepared.');
    return {
      setSource,
      setActive(value){if(disposed)return;active=Boolean(value);if(active)render();sync();},
      setMotion(value){if(disposed)return;moving=Boolean(value);render();sync();},
      dispose
    };
  }catch(error){markFailure(error);dispose();throw error;}
}

