/* Region centers are illustrative markers, never facility coordinates. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {buildGlobeSurface,globePoint} from './globe-surface.js?v=2';
export {globePoint} from './globe-surface.js?v=2';

export const REGIONS=Object.freeze({
    permian:{lat:31.9,lon:-103.0},bakken:{lat:48.1,lon:-103.5},alberta:{lat:54.8,lon:-116.0},
    'cold-lake':{lat:54.5,lon:-110.2},dubai:{lat:25.2,lon:55.3}
});
export function cameraDistance(aspect){return 3.35/Math.sin(Math.atan(Math.tan(48*Math.PI/360)*Math.min(1,aspect)))*1.12;}
export function buildGlobe(land,lakes=[]){
    const {root,surface,texture,textures}=buildGlobeSurface(land,{detail:true,lakes});root.name='hosting-globe';
    const pins=[];
    const platinum=new T.MeshPhysicalMaterial({color:0xd2d2cf,metalness:.92,roughness:.26,clearcoat:.25});
    const graphite=new T.MeshStandardMaterial({color:0x10151b,metalness:.65,roughness:.42});
    for(const [id,region]of Object.entries(REGIONS)){
        const group=new T.Group(),point=globePoint(region.lat,region.lon,3.207),normal=point.clone().normalize();group.name='region-pin-'+id;
        group.position.copy(point);group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);root.add(group);
        const mat=new T.MeshPhysicalMaterial({color:0xf7931a,metalness:.72,roughness:.28,clearcoat:.4,clearcoatRoughness:.18,emissive:0x8a3500,emissiveIntensity:.04});
        const base=new T.Mesh(new T.CylinderGeometry(.066,.081,.024,40),graphite);base.name='pin-foot';base.position.y=.012;group.add(base);
        const collar=new T.Mesh(new T.TorusGeometry(.064,.007,12,48),platinum);collar.rotation.x=Math.PI/2;collar.position.y=.025;group.add(collar);
        const stem=new T.Mesh(new T.CylinderGeometry(.013,.023,.18,24),platinum);stem.name='pin-stem';stem.position.y=.115;group.add(stem);
        const head=new T.Group();head.position.y=.235;group.add(head);
        const ball=new T.Mesh(new T.SphereGeometry(.083,40,28),mat);ball.name='orange-pin-head';head.add(ball);
        const band=new T.Mesh(new T.TorusGeometry(.080,.005,12,48),platinum);band.rotation.x=Math.PI/2;band.position.y=-.012;head.add(band);
        const cap=new T.Mesh(new T.CylinderGeometry(.022,.030,.010,24),platinum);cap.position.y=.081;head.add(cap);
        const signal=new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.65,depthWrite:false,toneMapped:false});
        const ring=new T.Mesh(new T.TorusGeometry(.11,.005,12,64),signal);ring.rotation.x=Math.PI/2;ring.position.y=.008;group.add(ring);
        const hit=new T.Mesh(new T.SphereGeometry(.16,12,8),new T.MeshBasicMaterial({visible:false}));hit.position.y=.23;hit.userData.region=id;group.add(hit);
        pins.push({id,group,point,normal,head,ring,mat,signal,hit});
    }
    return {root,pins,surface,texture,textures};
}
export function mountGlobe(host,land,runtime,callbacks={}){
    const model=buildGlobe(land,callbacks.lakes);let selected='permian',down=null,stage,multi=false,disposed=false;
    const pointers=new Set();
    stage=runtime.createStage(host,{spin:true,surface:callbacks.surface,minPixelRatio:1.5,maxPixelRatio:2,exposure:.94,fillIntensity:.8,
        label:'Interactive hosting globe. Right-drag rotates. Left-drag or both mouse buttons shift the view and rotation center. Touch: drag to rotate, pinch to zoom, two fingers to shift. Scroll to zoom. Select an orange marker or use the region buttons. Arrow keys rotate, plus and minus zoom, Escape resets.',
        onReady:callbacks.onReady,onError:callbacks.onError,onRestore:callbacks.onRestore,
        onResize:()=>{if(stage)fit(true);},onReset:()=>fit(false),
        tick(dt,time,reduced){
            const camera=stage.camera.position;
            model.pins.forEach(pin=>{
                pin.group.visible=pin.normal.dot(camera.clone().sub(pin.point))>.1;
                pin.ring.scale.setScalar(pin.id===selected?1.12+(reduced?0:Math.sin(time*2)*.04):1);
            });
            callbacks.onProject?.(model.pins.map(pin=>{const p=pin.point.clone().addScaledVector(pin.normal,.34).project(stage.camera);return{id:pin.id,x:(p.x+1)/2,y:(1-p.y)/2,visible:pin.group.visible&&p.z<1&&Math.abs(p.x)<.96&&Math.abs(p.y)<.86};}));
        }
    });
    stage.world.add(model.root);stage.world.environmentIntensity=.8;stage.controls.minPolarAngle=.05;stage.controls.maxPolarAngle=Math.PI-.05;
    const anisotropy=Math.min(8,stage.renderer.capabilities.getMaxAnisotropy());
    model.textures.forEach(texture=>{texture.anisotropy=anisotropy;texture.needsUpdate=true;});
    new T.TextureLoader().load(new URL('./textures/earth-normal.png',import.meta.url).href,texture=>{
        if(disposed){texture.dispose();return;}
        texture.anisotropy=anisotropy;model.textures.push(texture);
        model.surface.material.normalMap=texture;model.surface.material.normalScale.set(10,10);
        model.surface.material.needsUpdate=true;stage.wake();
    },undefined,()=>{}); // The detailed coastlines remain usable if the relief texture is unavailable.
    function fit(instant){
        const p=REGIONS[selected],distance=cameraDistance(stage.camera.aspect);
        stage.controls.minDistance=4.5;stage.controls.maxDistance=distance*1.8;
        stage.move(globePoint(p.lat,p.lon,distance).toArray(),[0,0,0],{instant,arc:true,duration:1.65});
    }
    function select(id,instant=false){
        if(!REGIONS[id])return;selected=id;
        model.pins.forEach(pin=>{pin.head.scale.setScalar(pin.id===id?1.12:1);pin.mat.emissiveIntensity=pin.id===id?.14:.04;pin.signal.opacity=pin.id===id?.95:.65;});
        fit(instant);callbacks.onSelect?.(id);stage.wake();
    }
    function pointerDown(e){pointers.add(e.pointerId);if(pointers.size>1)multi=true;down={x:e.clientX,y:e.clientY,id:e.pointerId};}
    function pointerUp(e){
        pointers.delete(e.pointerId);if(multi){if(!pointers.size)multi=false;down=null;return;}
        if(!down||down.id!==e.pointerId)return;
        const start=down;down=null;if(e.button>0||stage.wasShiftGesture()||Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;
        const bounds=stage.canvas.getBoundingClientRect(),point=new T.Vector2((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
        const ray=new T.Raycaster();ray.setFromCamera(point,stage.camera);
        const hit=ray.intersectObjects(model.pins.filter(p=>p.group.visible).map(p=>p.hit),false)[0];if(hit)select(hit.object.userData.region);
    }
    function cancel(){down=null;multi=false;pointers.clear();}
    stage.canvas.addEventListener('pointerdown',pointerDown);stage.canvas.addEventListener('pointerup',pointerUp);stage.canvas.addEventListener('pointercancel',cancel);
    select(selected,true);
    return {select,zoom:stage.zoom,reset:()=>fit(false),setActive:stage.setActive,
        dispose(){disposed=true;stage.canvas.removeEventListener('pointerdown',pointerDown);stage.canvas.removeEventListener('pointerup',pointerUp);stage.canvas.removeEventListener('pointercancel',cancel);
            stage.dispose();const geometries=new Set(),materials=new Set();model.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());model.textures.forEach(texture=>texture.dispose());}
    };
}
