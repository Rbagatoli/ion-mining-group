/* Region centers are illustrative markers, never facility coordinates. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {buildGlobeSurface,globePoint} from './globe-surface.js';
export {globePoint} from './globe-surface.js';

export const REGIONS=Object.freeze({
    permian:{lat:31.9,lon:-103.0},bakken:{lat:48.1,lon:-103.5},alberta:{lat:54.8,lon:-116.0},
    'cold-lake':{lat:54.5,lon:-110.2},dubai:{lat:25.2,lon:55.3}
});
export function cameraDistance(aspect){return 3.35/Math.sin(Math.atan(Math.tan(48*Math.PI/360)*Math.min(1,aspect)))*1.12;}
export function buildGlobe(land){
    const {root,texture}=buildGlobeSurface(land);root.name='hosting-globe';
    const pins=[];
    for(const [id,region]of Object.entries(REGIONS)){
        const group=new T.Group(),point=globePoint(region.lat,region.lon,3.22),normal=point.clone().normalize();
        group.position.copy(point);group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);root.add(group);
        const mat=new T.MeshStandardMaterial({color:0xf7931a,metalness:.7,roughness:.22,emissive:0x9b4a00,emissiveIntensity:.75});
        const stem=new T.Mesh(new T.CylinderGeometry(.018,.035,.20,12),mat);stem.position.y=.10;group.add(stem);
        const head=new T.Mesh(new T.SphereGeometry(.067,16,12),mat);head.position.y=.23;group.add(head);
        const ring=new T.Mesh(new T.TorusGeometry(.105,.012,8,32),mat);ring.rotation.x=Math.PI/2;ring.position.y=.018;group.add(ring);
        const hit=new T.Mesh(new T.SphereGeometry(.16,12,8),new T.MeshBasicMaterial({visible:false}));hit.position.y=.23;hit.userData.region=id;group.add(hit);
        pins.push({id,group,point,normal,head,ring,mat,hit});
    }
    return {root,pins,texture};
}
export function mountGlobe(host,land,runtime,callbacks={}){
    const model=buildGlobe(land);let selected='permian',down=null,stage,multi=false;
    const pointers=new Set();
    stage=runtime.createStage(host,{spin:true,surface:callbacks.surface,
        label:'Interactive hosting globe. Right-drag rotates. Left-drag or both mouse buttons shift the view and rotation center. Touch: drag to rotate, pinch to zoom, two fingers to shift. Scroll to zoom. Select an orange marker or use the region buttons. Arrow keys rotate, plus and minus zoom, Escape resets.',
        onReady:callbacks.onReady,onError:callbacks.onError,onRestore:callbacks.onRestore,
        onResize:()=>{if(stage)fit(true);},onReset:()=>fit(false),
        tick(dt,time,reduced){
            const camera=stage.camera.position;
            model.pins.forEach(pin=>{
                pin.group.visible=pin.normal.dot(camera.clone().sub(pin.point))>.1;
                pin.ring.scale.setScalar(pin.id===selected?1.15+(reduced?0:Math.sin(time*2)*.18):1);
            });
            callbacks.onProject?.(model.pins.map(pin=>{const p=pin.point.clone().addScaledVector(pin.normal,.3).project(stage.camera);return{id:pin.id,x:(p.x+1)/2,y:(1-p.y)/2,visible:pin.group.visible&&p.z<1&&Math.abs(p.x)<.96&&Math.abs(p.y)<.86};}));
        }
    });
    stage.world.add(model.root);stage.world.environmentIntensity=.9;stage.controls.minPolarAngle=.05;stage.controls.maxPolarAngle=Math.PI-.05;
    function fit(instant){
        const p=REGIONS[selected],distance=cameraDistance(stage.camera.aspect);
        stage.controls.minDistance=4.5;stage.controls.maxDistance=distance*1.8;
        stage.move(globePoint(p.lat,p.lon,distance).toArray(),[0,0,0],{instant,arc:true,duration:1.65});
    }
    function select(id,instant=false){
        if(!REGIONS[id])return;selected=id;
        model.pins.forEach(pin=>{pin.head.scale.setScalar(pin.id===id?1.35:1);pin.mat.emissiveIntensity=pin.id===id?1.5:.6;});
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
        dispose(){stage.canvas.removeEventListener('pointerdown',pointerDown);stage.canvas.removeEventListener('pointerup',pointerUp);stage.canvas.removeEventListener('pointercancel',cancel);
            stage.dispose();const geometries=new Set(),materials=new Set();model.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());model.texture.dispose();}
    };
}
