/* Shared lifecycle and always-on gestures for the hosting tour and globe. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import { OrbitControls } from './vendor/three-0.185.1/OrbitControls.js';
import { RoomEnvironment } from './vendor/three-0.185.1/RoomEnvironment.js';

export const ease = t => t*t*t*(t*(t*6-15)+10);
export function createStage(host, options = {}) {
    const renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.6));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !!options.shadows; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas = renderer.domElement; host.appendChild(canvas); canvas.tabIndex = 0;
    canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',options.label);
    const world = new T.Scene(), camera = new T.PerspectiveCamera(48,1,.06,600);
    const room = new RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer), environment = pmrem.fromScene(room,.03);
    world.environment = environment.texture; world.environmentIntensity = 1.05; room.dispose(); pmrem.dispose();
    world.add(new T.HemisphereLight(0xf2f1ee,0x292723,1.6));
    const sun = new T.DirectionalLight(0xfffaf2,3.0); sun.position.set(0,35,22); sun.castShadow = !!options.shadows;
    sun.shadow.mapSize.set(1024,1024); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
    Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:.1,far:110});
    world.add(sun,sun.target);
    const rim = new T.DirectionalLight(0xdde4ec,2.6); rim.position.set(-24,16,-12); world.add(rim);
    const controls = new OrbitControls(camera,canvas);
    controls.enablePan = false; controls.enableDamping = false;
    controls.minDistance = .8; controls.maxDistance = 85;
    controls.minPolarAngle = .13; controls.maxPolarAngle = Math.PI*.495;
    canvas.style.touchAction = 'none';
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motion.matches, disposed = false, lost = false, active = true, visible = true, ready = false;
    let raf = 0, last = 0, time = 0, width = 0, height = 0, travel = null, dragging = false, resume = 0, phase = 0;
    const up = new T.Vector3(0,1,0);
    function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; }
    function wake() { if (!raf && !disposed && !lost && active && visible && !document.hidden) raf = requestAnimationFrame(tick); }
    function manual() { travel = null; resume = time+3; options.onManual?.(); wake(); }
    function resize() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h || (w === width && h === height)) return;
        width=w; height=h; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
        options.onResize?.(w/h); wake();
    }
    function move(position,target,{instant=false,lift=0,duration=2.2,arc=false}={}) {
        const end=new T.Vector3(...position), aim=new T.Vector3(...target);
        if (instant || reduced) { camera.position.copy(end); controls.target.copy(aim); travel=null; controls.update(); }
        else {
            const start=camera.position.clone();
            travel={curve:new T.CubicBezierCurve3(start,start.clone().addScaledVector(up,lift),end.clone().addScaledVector(up,lift),end),
                target:controls.target.clone(),aim,start:time,duration,
                arc:arc?{direction:start.clone().normalize(),rotation:new T.Quaternion().setFromUnitVectors(start.clone().normalize(),end.clone().normalize()),near:start.length(),far:end.length()}:null};
        }
        resume=time+duration+1; wake();
    }
    function zoom(factor) {
        const offset=camera.position.clone().sub(controls.target);
        offset.setLength(T.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
        camera.position.copy(controls.target).add(offset); controls.update(); manual();
    }
    function tick(ms) {
        raf=0; if (disposed || lost || !active || !visible || document.hidden) return;
        const elapsed=last ? (ms-last)/1000 : 0, dt=Math.min(elapsed,.1); last=ms; time+=elapsed;
        if (travel) {
            const t=Math.min(1,(time-travel.start)/travel.duration), s=ease(t);
            if(travel.arc)camera.position.copy(travel.arc.direction).applyQuaternion(new T.Quaternion().slerp(travel.arc.rotation,s)).multiplyScalar(T.MathUtils.lerp(travel.arc.near,travel.arc.far,s));
            else camera.position.copy(travel.curve.getPoint(s));
            controls.target.lerpVectors(travel.target,travel.aim,s);
            if (t===1) travel=null;
        } else if (!reduced && !dragging && time>=resume) {
            let angle;
            if (options.spin) angle=-dt*.045;
            else { const before=Math.sin(phase); phase+=dt*.28; angle=(Math.sin(phase)-before)*.09; }
            camera.position.sub(controls.target).applyAxisAngle(up,angle).add(controls.target);
        }
        controls.update(); options.tick?.(dt,time,reduced);
        renderer.render(world,camera);
        if (!ready) { ready=true; options.onReady?.(); wake(); }
        if (!reduced || travel) wake();
    }
    function startDrag() { dragging=true; manual(); }
    function endDrag() { dragging=false; resume=time+3; wake(); }
    controls.addEventListener('start',startDrag); controls.addEventListener('end',endDrag); controls.addEventListener('change',wake);
    const surface=options.surface || host;
    function wheel(event) {
        if (!active || lost || !event.deltaY) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const unit=event.deltaMode===1 ? 16 : event.deltaMode===2 ? height : 1;
        zoom(Math.exp(T.MathUtils.clamp(event.deltaY*unit,-180,180)*.002));
    }
    surface.addEventListener('wheel',wheel,{passive:false,capture:true});
    function keyboard(event) {
        const angles={ArrowLeft:.10,ArrowRight:-.10,ArrowUp:.08,ArrowDown:-.08};
        if (event.key==='+' || event.key==='=') zoom(.8);
        else if (event.key==='-') zoom(1.25);
        else if (event.key==='Escape') options.onReset?.();
        else if (event.key.toLowerCase()==='x' && options.onXray) options.onXray();
        else if (angles[event.key]) {
            const v=camera.position.clone().sub(controls.target), s=new T.Spherical().setFromVector3(v);
            if (event.key==='ArrowUp' || event.key==='ArrowDown') s.phi=T.MathUtils.clamp(s.phi-angles[event.key],controls.minPolarAngle,controls.maxPolarAngle);
            else s.theta+=angles[event.key];
            camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(s)); controls.update(); manual();
        } else return;
        event.preventDefault(); wake();
    }
    canvas.addEventListener('keydown',keyboard);
    const sizeObserver=new ResizeObserver(resize); sizeObserver.observe(host);
    const observer=typeof IntersectionObserver==='function' ? new IntersectionObserver(entries=>{
        visible=entries.some(e=>e.isIntersecting); if (visible) wake(); else stop();
    },{rootMargin:'100px'}) : null; observer?.observe(host);
    function visibility() { if (document.hidden) stop(); else wake(); }
    function changeMotion() { reduced=motion.matches; if (travel && reduced) {camera.position.copy(travel.curve.v3);controls.target.copy(travel.aim);travel=null;} wake(); }
    function contextLost(event) { event.preventDefault(); lost=true; stop(); options.onError?.(); }
    function contextRestored() { lost=false; ready=false; options.onRestore?.(); wake(); }
    document.addEventListener('visibilitychange',visibility); motion.addEventListener('change',changeMotion);
    canvas.addEventListener('webglcontextlost',contextLost); canvas.addEventListener('webglcontextrestored',contextRestored);
    resize();
    return {world,camera,controls,canvas,renderer,move,zoom,wake,
        get travelling() { return !!travel; },
        setActive(value) { active=!!value; if(active){resize();wake();}else stop(); },
        dispose() {
            if(disposed)return;disposed=true;stop(); observer?.disconnect();sizeObserver.disconnect();
            document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',changeMotion);
            surface.removeEventListener('wheel',wheel,true);canvas.removeEventListener('keydown',keyboard);
            canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
            controls.dispose();environment.dispose();sun.shadow.dispose();renderer.dispose();canvas.remove();
        }
    };
}
