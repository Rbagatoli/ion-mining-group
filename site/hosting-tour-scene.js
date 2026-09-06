/* A continuous, representative hosting facility. No claimed site survey or live telemetry. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export const STOPS = Object.freeze([
    {id:'arrival',title:'Step onto the site.',label:'Arrival',eyebrow:'01 / Welcome to the mine',
        text:'Explore the infrastructure behind a hosted miner, from the power supply to the rack where it runs.',
        position:[28,5.2,18],target:[5,1.5,2],part:'fleet'},
    {id:'power',title:'It starts with power.',label:'Power',eyebrow:'02 / Generation & distribution',
        text:'Gas engines drive the generators. Switchgear and transformers distribute that power to the mining containers.',
        position:[-28,4,8],target:[-22,1.7,-1],part:'power'},
    {id:'cooling',title:'Keep the heat moving.',label:'Cooling',eyebrow:'03 / The hydro cooling loop',
        text:'Coolant carries heat away from the miners. Pumps circulate it through the loop, and rooftop dry coolers release the heat to the air.',
        position:[11,8,10],target:[3.2,3.25,3.4],part:'cooling'},
    {id:'aisle',title:'Between the containers.',label:'The aisle',eyebrow:'04 / Access to every container',
        text:'Walk the service aisle between the container rows. Access to power, cooling connections and the equipment stays close at hand.',
        position:[23,2.35,0],target:[-5,1.5,0],part:'fleet'},
    {id:'miners',title:'Meet the mining fleet.',label:'Your miners',eyebrow:'05 / Inside a container',
        text:'Follow the rack of hydro miners, their coolant connections and network equipment. Pool payouts go directly to the wallet you choose.',
        position:[7.3,1.8,4.45],target:[-.6,1.38,3.73],part:'miners'}
]);

function batch(root,geometry,material,items,name) {
    const mesh=new T.InstancedMesh(geometry,material,items.length),p=new T.Object3D();mesh.name=name;
    items.forEach((a,i)=>{p.position.set(...a.slice(0,3));p.scale.set(...a.slice(3,6));p.rotation.set(0,a[6]||0,0);p.updateMatrix();mesh.setMatrixAt(i,p.matrix);});
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
    const yard=core.buildYard({containers:6,count:1440,perContainer:240,generators:3,settings:{cooling:'hydro',source:'gas'}});
    const detail=new T.Group();detail.name='tour-site-details';yard.root.add(detail);
    const box=new T.BoxGeometry(1,1,1),pale=new T.MeshStandardMaterial({color:0xb3b3af,metalness:.93,roughness:.27});
    const light=new T.MeshStandardMaterial({color:0xffd8a0,emissive:0xf7931a,emissiveIntensity:2.1});
    const floor=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshStandardMaterial({color:0x111214,roughness:.43,metalness:.44}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;floor.name='continuous-site-ground';detail.add(floor);
    const bollards=[],bands=[],markings=[],poles=[],lamps=[];
    for(const x of [-19,-4.5,10,25])for(const z of [-5.5,5.5]) {
        bollards.push([x,.45,z,.13,.9,.13]);bands.push([x,.65,z,.14,.1,.14]);
    }
    for(let x=-22;x<30;x+=3) markings.push([x,.005,0,1.25,.012,.055]);
    for(const z of [-7,8])for(const x of [-19,10,25]) {
        poles.push([x,2.7,z,.08,5.4,.08],[x,5.4,z-.5,.08,.08,1.08]);lamps.push([x,5.32,z-1,.48,.045,.3]);
    }
    batch(detail,box,pale,bollards.concat(poles),'site-metalwork');batch(detail,box,yard.mats.orange,bands.concat(markings),'aisle-markers');batch(detail,box,light,lamps,'site-lights');
    const unit=yard.containers[4],textures=[];
    const strips=[];for(const x of [-1.6,1.6])strips.push([x,2.61,.91,2.6,.025,.035]);
    batch(unit.root,box,light,strips,'interior-light-strips');
    // The side access opens for the last stop; the roof stays in place above the visitor.
    const spots=new T.Group();spots.name='interior-lighting';unit.root.add(spots);
    for(const x of [-3,2]) {const lamp=new T.PointLight(0xffe7cd,9,7,1.4);lamp.position.set(x,2.4,.92);spots.add(lamp);}
    if(withSigns) {
        yard.containers.forEach((u,i)=>{textures.push(sign(u.wall,'PROTON  /  '+String(i+1).padStart(2,'0'),0,1.87,1.355,3,.375));
            textures.push(sign(u.root,String(i+1).padStart(2,'0')+' / HYDRO',0,1.85,-1.31,2.9,.36,Math.PI));});
        textures.push(sign(unit.root,'HYDRO  /  MINING RACK',-.6,2.45,.5,3.6,.24));
    }
    yard.root.updateMatrixWorld(true);
    const groups={fleet:yard.containers.map(u=>u.root),power:[yard.targets.gen,yard.targets.gas,yard.targets.xfmr],
        cooling:yard.containers.map(u=>u.roof),miners:[unit.rack,unit.pdu,unit.network,unit.root.getObjectByName('hydro-manifolds')]};
    const anchors={};for(const id of ['power','cooling','miners']){const bounds=new T.Box3();groups[id].forEach(g=>bounds.union(new T.Box3().setFromObject(g)));anchors[id]=bounds.getCenter(new T.Vector3());}
    return {yard,unit,groups,textures,anchors};
}

export function mountTour(host,core,runtime,callbacks={}) {
    const model=buildTour(core),{yard,unit}=model;
    let current=0,xray=false,open=0,frame=null,highlightedMaterials=[];
    const stage=runtime.createStage(host,{shadows:true,surface:callbacks.surface,
        label:'3D mine walkthrough. Drag to look around. Pinch or scroll to zoom. Arrow keys rotate, plus and minus zoom. Escape resets this stop. X toggles X-ray.',
        onReady:callbacks.onReady,onError:callbacks.onError,onRestore:callbacks.onRestore,
        onReset:()=>visit(current),onXray:()=>setXray(!xray),
        tick(dt,time,reduced) {
            yard.mats.led.emissiveIntensity=2.4;yard.mats.flow.emissiveIntensity=1.2;
            if(!reduced)yard.fans.forEach(f=>{f.rotation.y+=dt*7;});
            const target=current===4?1:0;open=reduced?target:T.MathUtils.damp(open,target,7,dt);
            unit.wall.visible=open<.95;unit.wall.position.z=open*2.8;unit.wall.position.y=open*.8;
            yard.pulses.forEach(p=>{p.mesh.visible=!reduced;p.mesh.position.copy(p.curve.getPoint((time*.12+p.offset)%1));});
            callbacks.onProject?.(project());
        }
    });
    stage.world.fog=new T.FogExp2(0x030405,.013);stage.world.add(yard.root);
    function visit(index,instant=false) {
        if(!Number.isInteger(index)||!STOPS[index])return;
        current=index;const stop=STOPS[index];highlight(null);
        stage.controls.minDistance=index===4?.8:2;stage.controls.maxDistance=index===4?16:75;
        stage.move(stop.position,stop.target,{instant,lift:index===4?9:12,duration:index===4?2.6:2.2});
        callbacks.onStop?.(index);stage.wake();
    }
    function setXray(value) {highlight(null);xray=!!value;core.setSceneXray(yard,xray);callbacks.onXray?.(xray);stage.wake();}
    function highlight(id) {
        for(const [mesh,original,clone] of highlightedMaterials){mesh.material=original;clone.dispose();}
        highlightedMaterials=[];
        if(frame){stage.world.remove(frame);frame.geometry.dispose();frame.material.dispose();frame=null;}
        if(id && model.groups[id]) {
            const bounds=new T.Box3();
            model.groups[id].forEach(group=>{bounds.union(new T.Box3().setFromObject(group));group.traverse(o=>{
                if(!o.material?.emissive)return;
                const original=o.material,clone=original.clone();o.material=clone;highlightedMaterials.push([o,original,clone]);
                clone.emissive.set(0xf7931a);clone.emissiveIntensity=.16;
            });});
            frame=new T.Box3Helper(bounds.expandByScalar(.11),0xf7931a);frame.material.transparent=true;frame.material.opacity=.72;stage.world.add(frame);
        }
        stage.wake();
    }
    function project() {
        return ['power','cooling','miners'].map(id=>{
            const p=model.anchors[id].clone().project(stage.camera);
            return {id,x:(p.x+1)/2,y:(1-p.y)/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.9&&Math.abs(p.y)<.8};
        });
    }
    visit(0,true);
    return {visit,highlight,setXray,zoom:stage.zoom,reset:()=>visit(current),setActive:stage.setActive,
        dispose(){highlight(null);stage.dispose();model.textures.forEach(t=>t.dispose());core.disposeYard(yard);}
    };
}
