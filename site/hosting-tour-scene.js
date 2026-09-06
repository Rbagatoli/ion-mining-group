/* One hydro container throughout: exterior, its systems and an opened interior. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export const STOPS = Object.freeze([
    {id:'exterior',part:'shell',direction:[.8,.55,1.3],open:false},
    {id:'power',part:'power',direction:[.35,.25,1.2],open:true},
    {id:'cooling',part:'cooling',direction:[.65,1.25,1.3],open:false},
    {id:'network',part:'network',direction:[-.55,.2,1.2],open:true},
    {id:'miners',part:'miners',direction:[.40,.42,1.4],open:true}
]);

function batch(root,geometry,material,items,name) {
    const mesh=new T.InstancedMesh(geometry,material,items.length),p=new T.Object3D();mesh.name=name;
    items.forEach((a,i)=>{p.position.set(...a.slice(0,3));p.scale.set(...a.slice(3,6));p.updateMatrix();mesh.setMatrixAt(i,p.matrix);});
    mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
}
function sign(root,text,x,y,z,width,height,rotation=0) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#101112';ctx.fillRect(0,0,1024,128);
    ctx.fillStyle='#f7931a';ctx.fillRect(0,0,9,128);ctx.fillStyle='#dddcd8';ctx.font='600 55px Arial';ctx.textBaseline='middle';ctx.fillText(text,40,66);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:texture,roughness:.45,metalness:.4}));
    mesh.position.set(x,y,z);mesh.rotation.y=rotation;root.add(mesh);return texture;
}
export function buildTour(core,withSigns=true) {
    const yard=core.buildHostedContainer(),unit=yard.containers[0],textures=[];
    yard.root.name='single-container-showcase';
    const box=new T.BoxGeometry(1,1,1),light=new T.MeshStandardMaterial({color:0xffd8a0,emissive:0xf7931a,emissiveIntensity:1.3});
    batch(unit.root,box,light,[-3.7,0,3.7].map(x=>[x,2.61,.91,2.6,.025,.035]),'interior-light-strips');
    // Small fasteners and feet make the isolated shell read as equipment at close range.
    const hardware=[];
    for(const x of [-5.98,5.98])for(const z of [-1.26,1.26])for(const y of [.35,2.5])hardware.push([x,y,z,.07,.055,.04]);
    for(const x of [-5,0,5])for(const z of [-.9,.9])hardware.push([x,.035,z,.55,.08,.42]);
    batch(unit.root,box,yard.mats.silver,hardware,'container-fasteners');
    for(const x of [-3,2]){const lamp=new T.PointLight(0xffe7cd,5,7,1.4);lamp.position.set(x,2.35,.9);unit.root.add(lamp);}
    if(withSigns){
        textures.push(sign(unit.wall,'PROTON  /  HYDRO',0,1.9,1.355,3.5,.44));
        textures.push(sign(unit.root,'PROTON  /  HYDRO',0,1.9,-1.31,3.5,.44,Math.PI));
        textures.push(sign(unit.root,'HYDRO  /  MINING RACK',-.6,2.45,.5,3.6,.24));
    }
    yard.root.updateMatrixWorld(true);
    const groups={shell:[unit.root],power:[unit.pdu],cooling:[unit.roof,unit.root.getObjectByName('external-liquid-loop')],
        network:[unit.network],miners:[unit.rack,unit.root.getObjectByName('hydro-manifolds'),unit.root.getObjectByName('coolant-distribution-unit')]};
    const bounds={},anchors={};
    for(const [id,parts]of Object.entries(groups)){bounds[id]=new T.Box3();parts.forEach(p=>bounds[id].union(new T.Box3().setFromObject(p)));anchors[id]=bounds[id].getCenter(new T.Vector3());}
    anchors.cooling.set(0,3.5,0);
    for(const id of ['power','network','miners'])anchors[id].y=bounds[id].max.y+.08;
    return {yard,unit,groups,textures,bounds,anchors};
}

// Fit the chosen equipment to portrait and landscape windows, with space for
// the quiet oscillation. Every destination belongs to the same container.
export function containerPose(model,index,aspect){
    const stop=STOPS[index],bounds=model.bounds[stop.part].clone();
    if(index===4){bounds.copy(model.bounds.shell);bounds.max.y+=2.2;}
    if(index===1)bounds.expandByScalar(.38);
    if(index===3)bounds.expandByScalar(.65);
    const target=bounds.getCenter(new T.Vector3()),direction=new T.Vector3(...stop.direction).normalize();
    const tanV=Math.tan(38*Math.PI/360),tanH=tanV*Math.max(.2,aspect),axis=new T.Vector3(0,1,0);
    let distance=1;
    for(const angle of [-.10,0,.10]){
        const toward=direction.clone().applyAxisAngle(axis,angle),right=new T.Vector3().crossVectors(axis,toward).normalize(),up=new T.Vector3().crossVectors(toward,right);
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
            const p=new T.Vector3(x,y,z).sub(target),depth=p.dot(toward);
            distance=Math.max(distance,depth+Math.abs(p.dot(right))/(tanH*.86),depth+Math.abs(p.dot(up))/(tanV*.72));
        }
    }
    return {position:target.clone().addScaledVector(direction,distance*1.02),target,bounds};
}

export function mountTour(host,core,runtime,callbacks={}) {
    const model=buildTour(core),{yard,unit}=model;
    let current=0,xray=false,open=0,roof=0,frame=null,highlightedMaterials=[],stage;
    stage=runtime.createStage(host,{shadows:true,surface:callbacks.surface,
        label:'Explore one hydro mining container. Drag to rotate. Pinch or scroll to zoom. Arrow keys rotate, plus and minus zoom. Escape resets this view. X toggles X-ray.',
        onReady:callbacks.onReady,onError:callbacks.onError,onRestore:callbacks.onRestore,
        onResize:()=>{if(stage)visit(current,true);},onReset:()=>visit(current),onXray:()=>setXray(!xray),
        tick(dt,time,reduced){
            yard.mats.led.emissiveIntensity=2.1;
            if(!reduced)yard.fans.forEach(f=>{f.rotation.y+=dt*7;});
            const opening=STOPS[current].open?1:0,lift=current===4?2.2:0;
            open=reduced?opening:T.MathUtils.damp(open,opening,7,dt);roof=reduced?lift:T.MathUtils.damp(roof,lift,7,dt);
            unit.wall.visible=open<.95;unit.wall.position.z=open*2.5;unit.wall.position.y=open*.6;unit.roof.position.y=roof;
            callbacks.onProject?.(project());
        }
    });
    stage.camera.fov=38;stage.camera.updateProjectionMatrix();stage.world.add(yard.root);
    function visit(index,instant=false){
        if(!Number.isInteger(index)||!STOPS[index])return;
        current=index;highlight(null);
        const pose=containerPose(model,index,stage.camera.aspect),distance=pose.position.distanceTo(pose.target);
        stage.controls.minDistance=Math.max(.5,distance*.12);stage.controls.maxDistance=Math.max(25,distance*2);
        stage.move(pose.position.toArray(),pose.target.toArray(),{instant,lift:2.5,duration:1.7});
        callbacks.onStop?.(index);stage.wake();
    }
    function setXray(value){highlight(null);xray=!!value;core.setSceneXray(yard,xray);callbacks.onXray?.(xray);stage.wake();}
    function highlight(id){
        for(const [mesh,original,clone]of highlightedMaterials){mesh.material=original;clone.dispose();}highlightedMaterials=[];
        if(frame){stage.world.remove(frame);frame.geometry.dispose();frame.material.dispose();frame=null;}
        if(id&&model.groups[id]){
            const bounds=new T.Box3();
            model.groups[id].forEach(group=>{bounds.union(new T.Box3().setFromObject(group));group.traverse(o=>{
                if(!o.material?.emissive)return;
                const original=o.material,clone=original.clone();o.material=clone;highlightedMaterials.push([o,original,clone]);clone.emissive.set(0xf7931a);clone.emissiveIntensity=.16;
            });});
            frame=new T.Box3Helper(bounds.expandByScalar(.08),0xf7931a);frame.material.transparent=true;frame.material.opacity=.7;frame.material.depthTest=false;stage.world.add(frame);
        }
        stage.wake();
    }
    function project(){
        return ['power','cooling','network','miners'].map(id=>{
            const p=model.anchors[id].clone();if(id==='cooling')p.y+=roof;p.project(stage.camera);
            const relevant=current===0||current===4||STOPS[current].part===id;
            return{id,x:(p.x+1)/2,y:(1-p.y)/2,visible:relevant&&p.z>-1&&p.z<1&&Math.abs(p.x)<.88&&Math.abs(p.y)<.75};
        });
    }
    visit(0,true);
    return {visit,highlight,setXray,zoom:stage.zoom,reset:()=>visit(current),setActive:stage.setActive,
        dispose(){highlight(null);stage.dispose();model.textures.forEach(t=>t.dispose());core.disposeYard(yard);}
    };
}
