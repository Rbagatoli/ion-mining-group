/* The website's detailed platinum Earth, with a batched prospect layer. */
import * as T from './globe-assets/vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './globe-assets/vendor/three-0.185.1/RoomEnvironment.js';
import {buildGlobeSurface,globePoint} from './globe-assets/globe-surface.js';
import {LAND,LAKES,BORDERS} from './globe-assets/hosting-earth-data.js';
import {createProspectLayer} from './prospect-globe-layer.js?v=428';

export function countryBorders(radius) {
    const positions=[],point=new T.Vector3();
    for(const line of BORDERS)for(let i=1;i<line.length;i++){
        const a=globePoint(line[i-1][1],line[i-1][0],1),b=globePoint(line[i][1],line[i][0],1);
        const steps=Math.max(1,Math.ceil(a.angleTo(b)/(Math.PI/720)));
        for(let j=0;j<steps;j++)for(const t of [j/steps,(j+1)/steps]){
            point.lerpVectors(a,b,t).normalize().multiplyScalar(radius);positions.push(point.x,point.y,point.z);
        }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const borders=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x000000,transparent:true,opacity:.82,depthWrite:false,toneMapped:false}));
    borders.name='black-country-borders';borders.raycast=()=>{};return borders;
}

export function applyGlobeStyle(globe,host,callbacks={}) {
    const scene=globe.scene(),renderer=globe.renderer(),model=buildGlobeSurface(LAND,{detail:true,lakes:LAKES});
    const scale=globe.getGlobeRadius()/3.2;
    const previous={material:globe.globeMaterial(),environment:scene.environment,
        intensity:scene.environmentIntensity,lights:globe.lights(),atmosphere:globe.showAtmosphere(),
        tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,color:renderer.outputColorSpace,
        pixelRatio:renderer.getPixelRatio(),polygons:globe.polygonsData(),pointer:globe.enablePointerInteraction()};
    let environment=null,disposed=false,globeMesh=null,oldGeometry=null,replacementGeometry=null,prospects=false;
    const markers=createProspectLayer(globe,host,callbacks);
    const borders=countryBorders(globe.getGlobeRadius()*1.0038);
    model.surface.visible=false;model.root.scale.setScalar(scale);model.surface.material.bumpScale*=scale;
    model.root.traverse(object=>{object.raycast=()=>{};});
    scene.traverse(object=>{if(object.isMesh&&object.material===previous.material)globeMesh=object;});

    function lightEnvironment() {
        const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);let next;
        try{next=pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
        const old=environment;environment=next;scene.environment=next.texture;if(old)old.dispose();
    }
    // Broad, restrained light keeps platinum detail without bleaching the continent.
    const hemisphere=new T.HemisphereLight(0xf2f1ee,0x242b34,1.05);
    const sun=new T.DirectionalLight(0xfffaf2,1.9);sun.position.set(-30,35,60);
    const rim=new T.DirectionalLight(0xdde4ec,.9);rim.position.set(25,16,-20);
    const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    model.textures.forEach(texture=>{texture.anisotropy=anisotropy;texture.needsUpdate=true;});
    function restoreContext(){if(!disposed)lightEnvironment();}
    function setProspects(points){
        const active=points!==null;
        if(active!==prospects){
            prospects=active;
            // Invisible country caps and individual point meshes still cost raycasts and
            // draw calls. They are unnecessary when the surface and picker supply both.
            globe.polygonsData(active?[]:previous.polygons).enablePointerInteraction(active?false:previous.pointer);
        }
        if(active&&globe.pointsData().length)globe.pointsData([]);
        markers.setData(points);
    }
    function dispose(){
        if(disposed)return;disposed=true;
        renderer.domElement.removeEventListener('webglcontextrestored',restoreContext);
        host.classList.remove('globe-platinum');markers.dispose();
        scene.remove(borders);borders.geometry.dispose();borders.material.dispose();scene.remove(model.root);
        globe.globeMaterial(previous.material).showAtmosphere(previous.atmosphere)
            .polygonsData(previous.polygons).enablePointerInteraction(previous.pointer);
        if(globeMesh&&oldGeometry)globeMesh.geometry=oldGeometry;
        if(replacementGeometry)replacementGeometry.dispose();
        globe.lights(previous.lights);scene.environment=previous.environment;scene.environmentIntensity=previous.intensity;
        renderer.toneMapping=previous.tone;renderer.toneMappingExposure=previous.exposure;renderer.outputColorSpace=previous.color;
        renderer.setPixelRatio(previous.pixelRatio);
        const geometries=new Set(),materials=new Set();
        model.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
        geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());model.textures.forEach(t=>t.dispose());
        if(environment)environment.dispose();hemisphere.dispose();sun.dispose();rim.dispose();
    }
    try{
        renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.91;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,matchMedia('(pointer: coarse)').matches?1.5:2));
        lightEnvironment();scene.environmentIntensity=.7;globe.lights([hemisphere,sun,rim]);
        globe.globeMaterial(model.surface.material).showAtmosphere(false);
        if(globeMesh){oldGeometry=globeMesh.geometry;replacementGeometry=model.surface.geometry.clone().rotateY(Math.PI/2).scale(scale,scale,scale);globeMesh.geometry=replacementGeometry;}
        scene.add(model.root);scene.add(borders);
        renderer.domElement.addEventListener('webglcontextrestored',restoreContext);host.classList.add('globe-platinum');
        new T.TextureLoader().load(new URL('./globe-assets/textures/earth-normal.png',import.meta.url).href,texture=>{
            if(disposed){texture.dispose();return;}
            texture.anisotropy=anisotropy;model.textures.push(texture);
            model.surface.material.normalMap=texture;model.surface.material.normalScale.set(7,7);model.surface.material.needsUpdate=true;
        },undefined,()=>{});
        return {dispose,setProspects,pick:markers.pick};
    }catch(error){dispose();throw error;}
}
