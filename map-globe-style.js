/* Apply the website's Earth surface to the operator map's existing data renderer. */
import * as T from './globe-assets/vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './globe-assets/vendor/three-0.185.1/RoomEnvironment.js';
import {buildGlobeSurface} from './globe-assets/globe-surface.js';
import {LAND} from './globe-assets/hosting-world-data.js';

export function applyGlobeStyle(globe, host) {
    const scene=globe.scene(), renderer=globe.renderer(), model=buildGlobeSurface(LAND);
    const scale=globe.getGlobeRadius()/3.2;
    const previous={material:globe.globeMaterial(),environment:scene.environment,
        intensity:scene.environmentIntensity,lights:globe.lights(),atmosphere:globe.showAtmosphere(),
        tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,color:renderer.outputColorSpace};
    let environment=null,disposed=false,globeMesh=null,oldGeometry=null,replacementGeometry=null;

    // The original globe remains the click surface and owns all data coordinates.
    // Decoration never takes a country, point or nearest-prospect click away.
    model.surface.visible=false;
    model.root.scale.setScalar(scale);
    model.surface.material.bumpScale*=scale;
    model.root.traverse(object=>{
        object.raycast=()=>{};
        if(object.isPoints)object.material.size*=scale;
    });
    scene.traverse(object=>{if(object.isMesh&&object.material===previous.material)globeMesh=object;});

    function lightEnvironment() {
        const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
        let next;
        try { next=pmrem.fromScene(room,.03); }
        finally { room.dispose();pmrem.dispose(); }
        const old=environment;environment=next;scene.environment=next.texture;
        if(old)old.dispose();
    }

    const hemisphere=new T.HemisphereLight(0xf2f1ee,0x292723,1.6);
    const sun=new T.DirectionalLight(0xfffaf2,3.0);sun.position.set(0,35,22);
    const rim=new T.DirectionalLight(0xdde4ec,2.6);rim.position.set(-24,16,-12);
    function restoreContext() { if(!disposed)lightEnvironment(); }
    function dispose() {
        if(disposed)return;disposed=true;
        renderer.domElement.removeEventListener('webglcontextrestored',restoreContext);
        host.classList.remove('globe-platinum');
        scene.remove(model.root);globe.globeMaterial(previous.material).showAtmosphere(previous.atmosphere);
        if(globeMesh&&oldGeometry)globeMesh.geometry=oldGeometry;
        if(replacementGeometry)replacementGeometry.dispose();
        globe.lights(previous.lights);scene.environment=previous.environment;scene.environmentIntensity=previous.intensity;
        renderer.toneMapping=previous.tone;renderer.toneMappingExposure=previous.exposure;renderer.outputColorSpace=previous.color;
        const geometries=new Set(),materials=new Set();
        model.root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
        geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
        model.texture.dispose();if(environment)environment.dispose();
        hemisphere.dispose();sun.dispose();rim.dispose();
    }
    try {
        renderer.outputColorSpace=T.SRGBColorSpace;
        renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
        lightEnvironment();scene.environmentIntensity=.9;
        globe.lights([hemisphere,sun,rim]);
        globe.globeMaterial(model.surface.material).showAtmosphere(false);
        if(globeMesh){
            oldGeometry=globeMesh.geometry;
            replacementGeometry=model.surface.geometry.clone().rotateY(Math.PI/2).scale(scale,scale,scale);
            globeMesh.geometry=replacementGeometry;
        }
        scene.add(model.root);
        renderer.domElement.addEventListener('webglcontextrestored',restoreContext);
        host.classList.add('globe-platinum');
        return {dispose};
    } catch(error) {
        dispose();throw error;
    }
}
