/* The same platinum Earth and batched prospect markers as Proton's operator map. */
import * as T from './runtime/globe-assets/vendor/three-0.185.1/three.module.min.js';
import {OrbitControls} from './runtime/globe-assets/vendor/three-0.185.1/OrbitControls.js';
import {RoomEnvironment} from './runtime/globe-assets/vendor/three-0.185.1/RoomEnvironment.js';
import {buildGlobeSurface,globePoint} from './runtime/globe-assets/globe-surface.js';
import {LAND,LAKES} from './runtime/globe-assets/hosting-earth-data.js';
import {countryBorders} from './runtime/map-globe-style.js';
import {createProspectLayer} from './runtime/prospect-globe-layer.js';

export function mount(host,{onSelect,onError,view}={}){
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,2000),canvas=renderer.domElement;
  let disposed=false,frame=0,active=true,intersects=true,visible=true,points=[],selection='',width=1,height=1;
  host.append(canvas);canvas.tabIndex=0;canvas.setAttribute('role','region');canvas.setAttribute('aria-label','Energy globe. Drag to rotate; pinch to zoom. Arrow keys rotate, plus and minus zoom. Select a marker or use the sites list.');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,matchMedia('(pointer: coarse)').matches?1.5:2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.91;
  const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=115;controls.maxDistance=700;controls.rotateSpeed=.65;controls.zoomSpeed=.8;controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI-.04;
  const model=buildGlobeSurface(LAND,{detail:true,lakes:LAKES});model.root.scale.setScalar(100/3.2);scene.add(model.root);
  const borders=countryBorders(100.38);scene.add(borders);
  const hemi=new T.HemisphereLight(0xf2f1ee,0x242b34,1.05),sun=new T.DirectionalLight(0xfffaf2,1.9),rim=new T.DirectionalLight(0xdde4ec,.9);sun.position.set(-30,35,60);rim.position.set(25,16,-20);scene.add(hemi,sun,rim);
  let environment;
  function lighting(){const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);try{const next=pmrem.fromScene(room,.04);environment?.dispose();environment=next;scene.environment=next.texture;scene.environmentIntensity=.7;}finally{room.dispose();pmrem.dispose();}}
  lighting();
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());model.textures.forEach(t=>{t.anisotropy=anisotropy;t.needsUpdate=true;});
  new T.TextureLoader().load(new URL('./runtime/globe-assets/textures/earth-normal.png',import.meta.url).href,t=>{if(disposed){t.dispose();return;}t.anisotropy=anisotropy;model.textures.push(t);model.surface.material.normalMap=t;model.surface.material.normalScale.set(7,7);model.surface.material.needsUpdate=true;wake();},undefined,()=>{});
  const bridge={scene:()=>scene,camera:()=>camera,controls:()=>controls,width:()=>width,height:()=>height,getGlobeRadius:()=>100};
  const markers=createProspectLayer(bridge,host,{onSelect:id=>{select(id);onSelect?.(id);}});
  function tick(){frame=0;if(disposed||!active||!visible||!intersects||document.hidden)return;controls.update();renderer.render(scene,camera);}
  function wake(){if(!disposed&&!frame)frame=requestAnimationFrame(tick);}
  controls.addEventListener('change',wake);controls.addEventListener('start',wake);
  function size(){const r=host.getBoundingClientRect();visible=r.width>0&&r.height>0;if(!visible)return;const before=Math.sin(Math.atan(Math.tan(Math.PI/8)*Math.min(1,camera.aspect)));width=r.width;height=r.height;camera.aspect=width/height;const after=Math.sin(Math.atan(Math.tan(Math.PI/8)*Math.min(1,camera.aspect)));if(camera.position.length())camera.position.multiplyScalar(before/after).clampLength(controls.minDistance,controls.maxDistance);camera.updateProjectionMatrix();controls.update();renderer.setSize(width,height);wake();}
  const resize=new ResizeObserver(size);resize.observe(host);
  const observer=new IntersectionObserver(entries=>{intersects=entries[0].isIntersecting;wake();});observer.observe(host);
  const homeDistance=()=>Math.min(630,110/Math.sin(Math.atan(Math.tan(Math.PI/8)*Math.min(1,camera.aspect))));
  function move(lat,lng,distance){camera.position.copy(globePoint(lat,lng,distance));camera.lookAt(0,0,0);controls.update();wake();}
  function reset(){move(38,-98,homeDistance());}
  function zoom(factor){camera.position.multiplyScalar(factor).clampLength(controls.minDistance,controls.maxDistance);controls.update();wake();}
  function fit(){if(!points.length)return reset();const center=new T.Vector3();points.forEach(p=>center.add(globePoint(p.lat,p.lng,1)));if(center.length()<points.length*.15)return reset();center.normalize();let angle=0;for(const p of points)angle=Math.max(angle,center.angleTo(globePoint(p.lat,p.lng,1)));const lat=Math.asin(center.y)*180/Math.PI,lng=Math.atan2(center.x,center.z)*180/Math.PI;move(lat,lng,angle>1.35?homeDistance():Math.min(homeDistance(),Math.max(homeDistance()*.92,100+Math.sin(angle)*homeDistance()*1.25)));}
  function setPoints(next){points=next;markers.setData(points.map(p=>({...p,selected:p.id===selection})));wake();}
  function select(id,focus=false){selection=id;setPoints(points);const p=points.find(p=>p.id===id);if(p&&focus)move(p.lat,p.lng,homeDistance()*.95);}
  function key(e){const spherical=new T.Spherical().setFromVector3(camera.position);if(e.key.startsWith('Arrow')){if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi-=.12;if(e.key==='ArrowDown')spherical.phi+=.12;spherical.makeSafe();camera.position.setFromSpherical(spherical);controls.update();wake();}else if(e.key==='+'||e.key==='=')zoom(.84);else if(e.key==='-')zoom(1.19);else if(e.key==='Home')reset();else return;e.preventDefault();}
  function lost(e){e.preventDefault();active=false;onError?.('The globe paused. Reload the globe to reconnect.');}
  function restored(){lighting();active=true;wake();}
  canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);document.addEventListener('visibilitychange',wake);
  // Hover uniforms need one frame, while idle globes do not continuously render.
  host.addEventListener('pointermove',wake);host.addEventListener('pointerleave',wake);
  size();if(view?.position?.length===3){camera.position.fromArray(view.position);const angle=aspect=>Math.sin(Math.atan(Math.tan(Math.PI/8)*Math.min(1,aspect)));camera.position.multiplyScalar(angle(view.aspect||1)/angle(camera.aspect)).clampLength(controls.minDistance,controls.maxDistance);}else reset();controls.update();wake();host.dataset.globeReady='true';
  return {setPoints,select,fit,reset,zoom,view:()=>({position:camera.position.toArray(),aspect:camera.aspect}),setActive(value){active=value;size();wake();},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();controls.removeEventListener('change',wake);controls.removeEventListener('start',wake);markers.dispose();controls.dispose();document.removeEventListener('visibilitychange',wake);host.removeEventListener('pointermove',wake);host.removeEventListener('pointerleave',wake);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);const geos=new Set(),mats=new Set();scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());model.textures.forEach(t=>t.dispose());environment?.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();delete host.dataset.globeReady;}};
}
