/* A transparent product stage: one renderer, one physical chassis, no display box. */
import * as THREE from './vendor/three-0.185.1/three.module.min.js';
import { OrbitControls } from './vendor/three-0.185.1/OrbitControls.js';
import { RoomEnvironment } from './vendor/three-0.185.1/RoomEnvironment.js';

export function mountMinerStage(host,{buildMiner,disposeMiner,animateMiner=()=>{},onReady=()=>{},onError=()=>{},onInteraction=()=>{}}) {
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
    const canvas=renderer.domElement;host.appendChild(canvas);canvas.tabIndex=0;canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Miner exterior in 3D. Drag sideways or use arrow keys to rotate. Swipe up or down to scroll the page. Plus and minus zoom. Escape resets.');
    const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.01,200),controls=new OrbitControls(camera,canvas);
    controls.enablePan=false;controls.enableDamping=false;controls.minPolarAngle=.20;controls.maxPolarAngle=Math.PI*.85;
    controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
    // OrbitControls otherwise claims every touch immediately. Native vertical
    // scrolling and page pinch zoom remain available over this canvas.
    canvas.style.touchAction='pan-y pinch-zoom';
    let environment;
    function rebuildEnvironment(){
        environment?.dispose();const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
        try{environment=pmrem.fromScene(env,.04);world.environment=environment.texture;world.environmentIntensity=1.3;}finally{env.dispose();pmrem.dispose();}
    }
    rebuildEnvironment();
    world.add(new THREE.HemisphereLight(0xffffff,0x282725,1.35));
    const key=new THREE.DirectionalLight(0xfffcf3,3.0);key.position.set(-4,7,6);world.add(key);
    const rim=new THREE.DirectionalLight(0xe2ecff,2.3);rim.position.set(6,4,-5);world.add(rim);
    const fill=new THREE.DirectionalLight(0xffffff,.75);fill.position.set(-6,1,-2);world.add(fill);
    let model=null,visible=true,active=true,moving=true,orbiting=true,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame=0,last=0,width=0,height=0,disposed=false,lost=false,ready=false,homeDistance=10,phase=0,modelSignature='';
    const homeDirection=new THREE.Vector3(1,.68,1.55).normalize(),homeTarget=new THREE.Vector3(),orbitOffset=new THREE.Vector3(),orbitAxis=new THREE.Vector3(0,1,0);
    function motionState(){host.dataset.motion=reduced?'reduced':!active||!visible||document.hidden?'suspended':moving?'playing':'paused';host.dataset.orbit=orbiting?'automatic':'manual';}
    function fit(){
        if(!model||!width||!height)return;model.root.position.y=-model.dimensionsMM[2]/200;model.root.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(model.root),size=bounds.getSize(new THREE.Vector3());bounds.getCenter(homeTarget);
        // Fit the full rotating exterior, including the depth projected upward by the camera tilt.
        // A height-only fit clips tall machines on a shallow mobile canvas.
        const radius=Math.hypot(size.x,size.z)/2,v=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.92;
        const right=new THREE.Vector3().crossVectors(camera.up,homeDirection).normalize(),up=new THREE.Vector3().crossVectors(homeDirection,right).normalize();
        homeDistance=0;
        for(let i=0;i<64;i++)for(const y of [-size.y/2,size.y/2]){
            const point=new THREE.Vector3(Math.cos(i*Math.PI/32)*radius,y,Math.sin(i*Math.PI/32)*radius),depth=point.dot(homeDirection);
            homeDistance=Math.max(homeDistance,depth+Math.abs(point.dot(right))/(v*camera.aspect),depth+Math.abs(point.dot(up))/v);
        }
        controls.target.copy(homeTarget);camera.position.copy(homeTarget).addScaledVector(homeDirection,homeDistance);
        controls.minDistance=homeDistance*.45;controls.maxDistance=homeDistance*1.8;controls.update();wake();
    }
    function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h||w===width&&h===height)return;width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fit();wake();}
    function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
    function wake(){if(!frame&&active&&visible&&!disposed&&!lost&&!document.hidden)frame=requestAnimationFrame(draw);}
    function draw(time){
        frame=0;if(!active||!visible||disposed||lost||document.hidden||!model||!width||!height)return;
        const dt=last?Math.min((time-last)/1000,.05):0;last=time;
        if(moving&&!reduced){
            if(orbiting){orbitOffset.copy(camera.position).sub(controls.target).applyAxisAngle(orbitAxis,dt*.042);camera.position.copy(controls.target).add(orbitOffset);phase+=dt;model.root.position.y=-model.dimensionsMM[2]/200+Math.sin(phase*.55)*.035;controls.update();}
            animateMiner(model,dt);
        }
        renderer.render(world,camera);if(!ready){ready=true;onReady();}if(moving&&!reduced)wake();
    }
    function setModel(modelKey,variant){
        const signature=JSON.stringify([modelKey,variant?.renderDimensionsMM||null]);
        canvas.setAttribute('aria-label',(variant?.previewName||variant?.name||modelKey)+' representative exterior in 3D. Drag sideways or use arrow keys to rotate. Swipe up or down to scroll the page. Plus and minus zoom. Escape resets.');
        if(model&&signature===modelSignature){if(ready)onReady();wake();return;}
        const next=buildMiner(modelKey,variant);if(model){world.remove(model.root);disposeMiner(model);}model=next;modelSignature=signature;world.add(model.root);ready=false;phase=0;orbiting=true;motionState();
        host.dataset.modelKey=modelKey;resize();fit();wake();
    }
    function zoom(factor){if(!model)return;interact();const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();wake();}
    function interact(){orbiting=false;motionState();onInteraction();wake();}
    function reset(){orbiting=true;phase=0;motionState();fit();}
    function keyboard(event){
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape'].includes(event.key))return;event.preventDefault();interact();
        if(event.key==='Escape'){reset();return;}if(['+','=','-'].includes(event.key)){zoom(event.key==='-'?1.18:.85);return;}
        const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        if(event.key==='ArrowLeft')spherical.theta-=.14;if(event.key==='ArrowRight')spherical.theta+=.14;
        if(event.key==='ArrowUp')spherical.phi-=.10;if(event.key==='ArrowDown')spherical.phi+=.10;spherical.phi=THREE.MathUtils.clamp(spherical.phi,.20,Math.PI*.85);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();wake();
    }
    const touches=new Set();let gesture=null;
    function releaseTouch(id){if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
    function clearTouches(){for(const id of touches)releaseTouch(id);touches.clear();gesture=null;}
    function touchDown(event){
        if(event.pointerType!=='touch')return;event.stopImmediatePropagation();touches.add(event.pointerId);
        if(touches.size===1&&event.isPrimary!==false)gesture={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,direction:''};
        else{if(gesture)releaseTouch(gesture.id);gesture=null;}
    }
    function touchMove(event){
        if(event.pointerType!=='touch')return;event.stopImmediatePropagation();
        if(!gesture||gesture.id!==event.pointerId||touches.size!==1||!model)return;
        const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
        if(!gesture.direction){
            if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
            // Diagonal intent defaults to the page; the lock cannot switch
            // halfway through a vertical scroll and start rotating the model.
            gesture.direction=Math.abs(dx)>Math.abs(dy)*1.25?'horizontal':'vertical';
            if(gesture.direction==='horizontal'){canvas.setPointerCapture(event.pointerId);interact();}
        }
        if(gesture.direction!=='horizontal')return;
        const delta=event.clientX-gesture.lastX;gesture.lastX=event.clientX;
        orbitOffset.copy(camera.position).sub(controls.target).applyAxisAngle(orbitAxis,-delta*Math.PI*2/Math.max(width,240));
        camera.position.copy(controls.target).add(orbitOffset);controls.update();wake();
    }
    function touchEnd(event){
        if(event.pointerType!=='touch')return;event.stopImmediatePropagation();finishTouch(event);
    }
    function finishTouch(event){
        if(!touches.has(event.pointerId))return;touches.delete(event.pointerId);
        if(gesture?.id===event.pointerId)gesture=null;releaseTouch(event.pointerId);
    }
    const touchOptions={capture:true,passive:true};
    canvas.addEventListener('pointerdown',touchDown,touchOptions);canvas.addEventListener('pointermove',touchMove,touchOptions);
    canvas.addEventListener('pointerup',touchEnd,touchOptions);canvas.addEventListener('pointercancel',touchEnd,touchOptions);
    // A second finger yields captured rotation to native pinch. Its first
    // finger can then end outside the canvas; observe completion without
    // suppressing any event or changing another surface's gesture handling.
    window.addEventListener('pointerup',finishTouch,touchOptions);window.addEventListener('pointercancel',finishTouch,touchOptions);
    controls.addEventListener('start',interact);controls.addEventListener('change',wake);canvas.addEventListener('keydown',keyboard);
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
    const observer=new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;motionState();if(visible)wake();else stop();});observer.observe(host);
    const preference=matchMedia('(prefers-reduced-motion: reduce)');function motion(event){reduced=event.matches;last=0;motionState();wake();}preference.addEventListener('change',motion);
    function visibility(){motionState();if(document.hidden){clearTouches();stop();}else wake();}document.addEventListener('visibilitychange',visibility);
    function contextLost(event){event.preventDefault();lost=true;ready=false;clearTouches();stop();onError();}
    function contextRestored(){try{rebuildEnvironment();lost=false;fit();wake();}catch(_){lost=true;onError();}}canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
    resize();motionState();
    return {setModel,zoom,reset,setMotion(value){const next=!!value;if(moving!==next)last=0;moving=next;motionState();wake();},setActive(value){active=!!value;motionState();if(active){resize();wake();}else{clearTouches();stop();}},
        dispose(){disposed=true;clearTouches();stop();observer.disconnect();resizeObserver.disconnect();preference.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pointerup',finishTouch,touchOptions);window.removeEventListener('pointercancel',finishTouch,touchOptions);canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('pointerdown',touchDown,touchOptions);canvas.removeEventListener('pointermove',touchMove,touchOptions);canvas.removeEventListener('pointerup',touchEnd,touchOptions);canvas.removeEventListener('pointercancel',touchEnd,touchOptions);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);controls.dispose();disposeMiner(model);environment.dispose();renderer.dispose();canvas.remove();}
    };
}
