/* Region centers are illustrative markers, never facility coordinates. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export const REGIONS=Object.freeze({
    permian:{lat:31.9,lon:-103.0},bakken:{lat:48.1,lon:-103.5},alberta:{lat:54.8,lon:-116.0},
    'cold-lake':{lat:54.5,lon:-110.2},dubai:{lat:25.2,lon:55.3}
});
export function globePoint(lat,lon,radius=3.2){
    const a=lat*Math.PI/180,b=lon*Math.PI/180;
    return new T.Vector3(radius*Math.cos(a)*Math.sin(b),radius*Math.sin(a),radius*Math.cos(a)*Math.cos(b));
}
export function cameraDistance(aspect){return 3.35/Math.sin(Math.atan(Math.tan(48*Math.PI/360)*Math.min(1,aspect)))*1.12;}
function landTexture(land){
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#191c20';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#aaa9a5';
    for(const polygon of land){
        ctx.beginPath();
        for(const ring of polygon)ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*2048,y=(90-lat)/180*1024;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
        ctx.fill('evenodd');
    }
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    return {texture,pixels:ctx.getImageData(0,0,2048,1024).data};
}
export function buildGlobe(land){
    const root=new T.Group();root.name='hosting-globe';
    const {texture,pixels}=landTexture(land);
    const geometry=new T.SphereGeometry(3.2,112,80);geometry.rotateY(-Math.PI/2);
    const surface=new T.Mesh(geometry,new T.MeshStandardMaterial({map:texture,metalness:.82,roughness:.38,bumpMap:texture,bumpScale:.013}));
    surface.name='platinum-earth';root.add(surface);
    const points=[],coasts=[],grid=[];
    for(let lat=-57;lat<=82;lat+=1.5){
        const step=1.5/Math.max(.2,Math.cos(lat*Math.PI/180));
        for(let lon=-179.5;lon<180;lon+=step){
            const x=Math.min(2047,Math.floor((lon+180)/360*2048)),y=Math.min(1023,Math.floor((90-lat)/180*1024));
            if(pixels[(y*2048+x)*4]>100)points.push(...globePoint(lat,lon,3.211).toArray());
        }
    }
    const dots=new T.BufferGeometry();dots.setAttribute('position',new T.Float32BufferAttribute(points,3));
    root.add(new T.Points(dots,new T.PointsMaterial({color:0xe8e5dd,size:.018,transparent:true,opacity:.6,sizeAttenuation:true})));
    for(const polygon of land)for(const ring of polygon)for(let i=1;i<ring.length;i++){
        const a=ring[i-1],b=ring[i];if(Math.abs(a[0]-b[0])<180)coasts.push(...globePoint(a[1],a[0],3.214).toArray(),...globePoint(b[1],b[0],3.214).toArray());
    }
    for(const lat of [-60,-30,0,30,60])for(let lon=-180;lon<180;lon+=3)grid.push(...globePoint(lat,lon,3.207).toArray(),...globePoint(lat,lon+3,3.207).toArray());
    for(let lon=-180;lon<180;lon+=30)for(let lat=-90;lat<90;lat+=3)grid.push(...globePoint(lat,lon,3.207).toArray(),...globePoint(lat+3,lon,3.207).toArray());
    for(const [values,color,opacity] of [[coasts,0xede9df,.23],[grid,0xb7b9bc,.10]]){
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(values,3));
        root.add(new T.LineSegments(geo,new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false})));
    }
    const halo=new T.Mesh(new T.SphereGeometry(3.31,64,48),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
        vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
        fragmentShader:'varying vec3 n; varying vec3 v; void main(){float edge=pow(1.-abs(dot(normalize(n),normalize(v))),3.); gl_FragColor=vec4(.62,.67,.72,edge*.24);}'
    }));root.add(halo);
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
        label:'Interactive hosting globe. Drag to rotate, pinch or scroll to zoom. Select an orange marker or use the region buttons. Arrow keys rotate, plus and minus zoom, Escape resets.',
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
        const start=down;down=null;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;
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
