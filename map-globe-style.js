/* Apply the website's Earth surface to the operator map's existing data renderer. */
import * as T from './globe-assets/vendor/three-0.185.1/three.module.min.js';
import {RoomEnvironment} from './globe-assets/vendor/three-0.185.1/RoomEnvironment.js';
import {buildGlobeSurface,globePoint} from './globe-assets/globe-surface.js';
import {LAND} from './globe-assets/hosting-world-data.js';

// Densify long border segments so they follow the sphere instead of cutting beneath it.
function countryBorders(globe) {
    const positions=[],radius=globe.getGlobeRadius()*1.006,point=new T.Vector3();
    for(const feature of globe.polygonsData()){
        const geometry=feature.geometry;
        const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
        for(const polygon of polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++){
            const a=globePoint(ring[i-1][1],ring[i-1][0],1),b=globePoint(ring[i][1],ring[i][0],1);
            const steps=Math.max(1,Math.ceil(a.angleTo(b)/(Math.PI/360)));
            for(let step=0;step<steps;step++)for(const t of [step/steps,(step+1)/steps]){
                point.lerpVectors(a,b,t).normalize().multiplyScalar(radius);positions.push(point.x,point.y,point.z);
            }
        }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const material=new T.LineBasicMaterial({color:globalThis.ProtonTheme.btc,transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
    const borders=new T.LineSegments(geometry,material);borders.name='btc-country-borders';borders.raycast=()=>{};
    return borders;
}

// One instanced draw adds crisp, unlit faces to the existing selectable discs.
// Their data, capacity sizing and raycast targets remain owned by Globe.gl.
function prospectFaces(globe,scene) {
    let mesh=null,capacity=0;
    const pose=new T.Object3D(),normal=new T.Vector3(),up=new T.Vector3(0,0,1),color=new T.Color();
    const value=(accessor,d)=>typeof accessor==='function'?accessor(d):typeof accessor==='string'?d[accessor]:accessor;
    function disposeMesh() {
        if(!mesh)return;
        scene.remove(mesh);mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();mesh=null;
    }
    function refresh() {
        const points=globe.pointsData().filter(d=>d.kind==='flare');
        if(!points.length){if(mesh)mesh.count=0;return;}
        if(points.length>capacity){
            disposeMesh();capacity=Math.max(64,2**Math.ceil(Math.log2(points.length)));
            const geometry=new T.PlaneGeometry(2,2);
            geometry.setAttribute('markerColor',new T.InstancedBufferAttribute(new Float32Array(capacity*4),4));
            geometry.setAttribute('markerInner',new T.InstancedBufferAttribute(new Float32Array(capacity),1));
            const material=new T.ShaderMaterial({transparent:true,toneMapped:false,
                uniforms:{rimColor:{value:new T.Color(globalThis.ProtonTheme.surface)}},
                vertexShader:`
                    attribute vec4 markerColor;
                    attribute float markerInner;
                    varying vec2 markerUv;
                    varying vec4 faceColor;
                    varying float innerRadius;
                    void main(){
                        markerUv=uv*2.-1.;faceColor=markerColor;innerRadius=markerInner;
                        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
                    }`,
                fragmentShader:`
                    uniform vec3 rimColor;
                    varying vec2 markerUv;
                    varying vec4 faceColor;
                    varying float innerRadius;
                    void main(){
                        float r=length(markerUv);
                        if(r>1.)discard;
                        float aa=fwidth(r);
                        float fill=1.-smoothstep(innerRadius-aa,innerRadius+aa,r);
                        gl_FragColor=vec4(mix(rimColor,faceColor.rgb,fill),faceColor.a*(1.-smoothstep(1.-aa,1.,r)));
                        #include <colorspace_fragment>
                    }`
            });
            mesh=new T.InstancedMesh(geometry,material,capacity);
            mesh.name='prospect-marker-faces';mesh.raycast=()=>{};mesh.frustumCulled=false;
            scene.add(mesh);
        }
        const radius=globe.getGlobeRadius(),deg=radius*Math.PI/180;
        const pointRadius=globe.pointRadius(),pointAltitude=globe.pointAltitude();
        const camera=globe.camera(),alt=Math.max(globe.pointOfView().altitude,1e-4);
        const rim=2*radius*alt*Math.tan(camera.fov*Math.PI/360)/(globe.height()||560)*1.05;
        const colors=mesh.geometry.getAttribute('markerColor'),inner=mesh.geometry.getAttribute('markerInner');
        points.forEach((d,i)=>{
            const size=Math.min(30,+value(pointRadius,d))*deg;
            const height=Math.max(+value(pointAltitude,d)*radius,.1);
            pose.position.copy(globePoint(d.lat,d.lng,radius+height+.02));
            normal.copy(pose.position).normalize();pose.quaternion.setFromUnitVectors(up,normal);
            pose.scale.setScalar(size+rim);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
            color.set(d.markerColor);colors.setXYZW(i,color.r,color.g,color.b,d.markerOpacity);
            inner.setX(i,size/(size+rim));
        });
        mesh.count=points.length;mesh.instanceMatrix.needsUpdate=true;
        colors.needsUpdate=true;inner.needsUpdate=true;
    }
    return {refresh,dispose:disposeMesh};
}

export function applyGlobeStyle(globe, host) {
    const scene=globe.scene(), renderer=globe.renderer(), model=buildGlobeSurface(LAND);
    const scale=globe.getGlobeRadius()/3.2;
    const previous={material:globe.globeMaterial(),environment:scene.environment,
        intensity:scene.environmentIntensity,lights:globe.lights(),atmosphere:globe.showAtmosphere(),
        tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,color:renderer.outputColorSpace};
    let environment=null,disposed=false,globeMesh=null,oldGeometry=null,replacementGeometry=null;
    const markers=prospectFaces(globe,scene);
    const borders=countryBorders(globe);

    // The original globe remains the click surface and owns all data coordinates.
    // Decoration never takes a country, point or nearest-prospect click away.
    model.surface.visible=false;
    model.root.scale.setScalar(scale);
    model.surface.material.bumpScale*=scale;
    model.root.traverse(object=>{
        object.raycast=()=>{};
        if(object.isPoints){object.material.size*=scale;object.material.depthWrite=false;}
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
        markers.dispose();
        scene.remove(borders);borders.geometry.dispose();borders.material.dispose();
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
        scene.add(borders);
        renderer.domElement.addEventListener('webglcontextrestored',restoreContext);
        host.classList.add('globe-platinum');
        return {dispose,refreshMarkers:()=>{if(!disposed)markers.refresh();}};
    } catch(error) {
        dispose();throw error;
    }
}
