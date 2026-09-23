/* Region centers are illustrative markers, never facility coordinates. */
import * as T from './vendor/three-0.185.1/three.module.min.js';
import {buildGlobeSurface,globePoint} from './globe-surface.js?v=2';
export {globePoint} from './globe-surface.js?v=2';

export const REGIONS=Object.freeze({
    permian:{lat:31.9,lon:-103.0},bakken:{lat:48.1,lon:-103.5},alberta:{lat:54.8,lon:-116.0},dubai:{lat:25.2,lon:55.3}
});
export function cameraDistance(aspect){
    // Fill the widget width with a close regional view, cropping the globe vertically.
    const span=Math.min(1.85,Math.max(.5,aspect)*1.08);
    return 3.24*Math.sqrt(1+1/Math.pow(Math.tan(48*Math.PI/360)*span,2));
}
export function buildCountryBorders(borders=[]){
    const vertices=[],point=new T.Vector3(),radius=3.212;
    for(const line of borders)for(let i=1;i<line.length;i++){
        const a=globePoint(line[i-1][1],line[i-1][0],1),b=globePoint(line[i][1],line[i][0],1);
        // Subdivide on the sphere so long boundaries never cut below its surface.
        const steps=Math.max(1,Math.ceil(a.angleTo(b)/(Math.PI/720)));
        for(let j=0;j<steps;j++)for(const t of [j/steps,(j+1)/steps]){
            point.lerpVectors(a,b,t).normalize().multiplyScalar(radius);
            vertices.push(point.x,point.y,point.z);
        }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    const lines=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x000000,depthWrite:false,toneMapped:false}));
    lines.name='country-borders';return lines;
}
export function buildGlobe(land,lakes=[],borders=[]){
    const {root,surface,texture,textures}=buildGlobeSurface(land,{detail:true,lakes});root.name='hosting-globe';
    surface.material.color.setHex(0x858b8e);
    surface.material.metalness=.78;surface.material.roughness=.75;surface.material.clearcoat=.12;
    const divisions=buildCountryBorders(borders);
    divisions.material.color.setHex(0x20252a);divisions.material.transparent=true;divisions.material.opacity=.7;root.add(divisions);
    const key=new T.DirectionalLight(0xffffff,2),fill=new T.DirectionalLight(0xd7e0e8,.55),rim=new T.DirectionalLight(0xf7931a,1.05);
    root.add(new T.HemisphereLight(0xf7f5ef,0x111318,.48),key,fill,rim);
    // Match the homepage's camera-facing warm perimeter without tinting the land.
    const atmosphere=new T.Mesh(new T.SphereGeometry(3.24,80,56),new T.ShaderMaterial({
        transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
        vertexShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){vec4 q=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-q.xyz);p=q.xyz;gl_Position=projectionMatrix*q;}',
        fragmentShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){float e=pow(1.-abs(dot(normalize(n),normalize(v))),3.4);float left=1.-smoothstep(-2.8,1.2,p.x);float bottom=1.-smoothstep(-2.5,.5,p.y);float warm=max(left,bottom*.65);gl_FragColor=vec4(1.,.40,.055,e*(.08+.34*warm));}'
    }));atmosphere.name='hosting-warm-atmosphere';root.add(atmosphere);
    const pins=[];
    const platinum=new T.MeshStandardMaterial({color:0xd9d8d4,metalness:1,roughness:.24});
    for(const [id,region]of Object.entries(REGIONS)){
        const group=new T.Group(),point=globePoint(region.lat,region.lon,3.218),normal=point.clone().normalize();group.name='region-pin-'+id;
        group.position.copy(point);group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);root.add(group);
        const mat=new T.MeshStandardMaterial({color:0xf7931a,metalness:.72,roughness:.25,emissive:0xdb730d,emissiveIntensity:.08});
        const bezel=new T.Mesh(new T.TorusGeometry(.059,.008,8,40),platinum);bezel.name='pin-bezel';bezel.position.z=.015;group.add(bezel);
        const cap=new T.Mesh(new T.OctahedronGeometry(.038,0),mat);cap.name='orange-pin-head';cap.position.z=.029;group.add(cap);
        const ring=new T.Mesh(new T.RingGeometry(.074,.079,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
        ring.position.z=.012;group.add(ring);
        const halo=new T.Mesh(new T.RingGeometry(.095,.104,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.035,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
        halo.position.z=.012;group.add(halo);
        const hit=new T.Mesh(new T.SphereGeometry(.16,12,8),new T.MeshBasicMaterial({visible:false}));hit.position.z=.029;hit.userData.region=id;group.add(hit);
        pins.push({id,group,point,normal,cap,mat,ring,halo,hit});
    }
    return {root,pins,surface,texture,textures,lightingRig:{key,fill,rim}};
}
export function mountGlobe(host,land,runtime,callbacks={}){
    const model=buildGlobe(land,callbacks.lakes,callbacks.borders);let selected='permian',down=null,stage,multi=false,disposed=false;
    const pointers=new Set(),front=new T.Vector3(),right=new T.Vector3(),viewUp=new T.Vector3(),up=new T.Vector3(0,1,0);
    stage=runtime.createStage(host,{spin:true,spinSpeed:Math.PI/180,pan:false,lighting:false,surface:callbacks.surface,minPixelRatio:1.5,maxPixelRatio:2,exposure:.86,
        label:'Interactive hosting globe. Left-drag rotates. Scroll to zoom. Touch: drag to rotate, pinch to zoom. Select an orange marker or use the region buttons. Arrow keys rotate, plus and minus zoom, Escape resets.',
        onReady:callbacks.onReady,onError:callbacks.onError,onRestore:callbacks.onRestore,
        onResize:()=>{if(stage)fit(true);},onReset:()=>fit(false),
        tick(dt,time,reduced){
            const camera=stage.camera.position;
            front.copy(camera).normalize();right.crossVectors(up,front).normalize();viewUp.crossVectors(front,right).normalize();
            model.lightingRig.key.position.copy(front).multiplyScalar(9).addScaledVector(right,-7).addScaledVector(up,8);
            model.lightingRig.fill.position.copy(front).multiplyScalar(4).addScaledVector(right,9);
            // Keep the orange reflection at the upper-left edge as the globe turns.
            model.lightingRig.rim.position.copy(front).multiplyScalar(-8).addScaledVector(right,-7).addScaledVector(viewUp,6);
            model.pins.forEach((pin,index)=>{
                const focused=pin.id===selected,pulse=reduced?.5:.5+.5*Math.sin(time*1.1-index*.6);
                pin.group.visible=pin.normal.dot(camera)>3.218;
                pin.mat.emissiveIntensity=focused?.16+pulse*.045:.055;
                pin.cap.scale.setScalar(focused?1.08:1);
                pin.halo.material.opacity=focused?.10+pulse*.03:.035;
                pin.halo.scale.setScalar(focused?.97+pulse*.04:.86);
                pin.ring.material.opacity=focused?.48:.22;
            });
            callbacks.onProject?.(model.pins.map(pin=>{const p=pin.point.clone().addScaledVector(pin.normal,.029).project(stage.camera);return{id:pin.id,x:(p.x+1)/2,y:(1-p.y)/2,visible:pin.group.visible&&p.z<1&&Math.abs(p.x)<.96&&Math.abs(p.y)<.86};}));
        }
    });
    stage.world.add(model.root);stage.world.environmentIntensity=.55;stage.controls.minPolarAngle=.05;stage.controls.maxPolarAngle=Math.PI-.05;
    const anisotropy=Math.min(8,stage.renderer.capabilities.getMaxAnisotropy());
    model.textures.forEach(texture=>{texture.anisotropy=anisotropy;texture.needsUpdate=true;});
    new T.TextureLoader().load(new URL('./textures/earth-normal.png',import.meta.url).href,texture=>{
        if(disposed){texture.dispose();return;}
        texture.anisotropy=anisotropy;model.textures.push(texture);
        model.surface.material.normalMap=texture;model.surface.material.normalScale.set(6,6);
        model.surface.material.needsUpdate=true;stage.wake();
    },undefined,()=>{}); // The detailed coastlines remain usable if the relief texture is unavailable.
    function fit(instant){
        const p=REGIONS[selected],distance=cameraDistance(stage.camera.aspect);
        stage.controls.minDistance=4.1;stage.controls.maxDistance=Math.max(14,distance*2.5);
        stage.move(globePoint(p.lat,p.lon,distance).toArray(),[0,0,0],{instant,arc:true,duration:1.65});
    }
    function select(id,instant=false){
        if(!REGIONS[id])return;selected=id;
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
