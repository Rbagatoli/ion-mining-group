/* Screen-sized prospect markers: one draw, no per-site mesh or geometry changes on zoom. */
import * as T from './globe-assets/vendor/three-0.185.1/three.module.min.js';
import {globePoint} from './globe-assets/globe-surface.js';

export function markerRadius(kw, selected=false) {
    const t=T.MathUtils.clamp(Math.log(Math.max(kw||125,125)/125)/Math.log(10000/125),0,1);
    return (3.4+t*1.2)*(selected?1.4:1);
}

// Projection and picking share the same centers as the shader. Back-side sites
// must never be selectable through the Earth, including near the horizon.
export function projectMarkers(centers,camera,width,height,radius=100) {
    const matrix=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const p=new T.Vector3(),out=[],cp=camera.position;
    for(let i=0;i<centers.length;i+=3){
        const x=centers[i],y=centers[i+1],z=centers[i+2];
        if(x*cp.x+y*cp.y+z*cp.z < radius*Math.hypot(x,y,z)+.02)continue;
        p.set(x,y,z).applyMatrix4(matrix);
        if(p.z< -1||p.z>1||Math.abs(p.x)>1.05||Math.abs(p.y)>1.05)continue;
        out.push({index:i/3,x:(p.x+1)*width/2,y:(1-p.y)*height/2});
    }
    return out;
}

export function pickMarker(projected,x,y,tolerance=14) {
    let best=null,dist=tolerance*tolerance;
    for(const p of projected){const d=(p.x-x)**2+(p.y-y)**2;if(d<dist){best=p;dist=d;}}
    return best;
}

export function createProspectLayer(globe,host,{onSelect=()=>{},onEmpty=()=>{}}={}) {
    const geometry=new T.InstancedBufferGeometry();
    const plane=new T.PlaneGeometry(2,2);
    geometry.index=plane.index;geometry.attributes=plane.attributes;
    // The shader hides the far side. Draw visible pins over relief and border lines.
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,
        uniforms:{viewport:{value:new T.Vector2(1,1)},hovered:{value:-1},zoomScale:{value:1}},
        vertexShader:`
            attribute vec3 siteCenter;
            attribute vec4 siteColor;
            attribute vec2 siteStyle;
            attribute float siteIndex;
            uniform vec2 viewport;
            uniform float hovered;
            uniform float zoomScale;
            varying vec2 markerUv;
            varying vec4 markerColor;
            varying float markerSize;
            varying float markerSelected;
            void main(){
                markerUv=position.xy;
                float facing=dot(normalize(siteCenter),normalize(cameraPosition-siteCenter));
                markerColor=vec4(siteColor.rgb,siteColor.a*smoothstep(0.,.12,facing));
                vec4 center=projectionMatrix*modelViewMatrix*vec4(siteCenter,1.);
                float size=siteStyle.x*zoomScale*(abs(hovered-siteIndex)<.5?1.2:1.);
                markerSize=size;
                markerSelected=siteStyle.y;
                center.xy+=position.xy*size*2./viewport*center.w;
                gl_Position=center;
            }`,
        fragmentShader:`
            varying vec2 markerUv;
            varying vec4 markerColor;
            varying float markerSize;
            varying float markerSelected;
            void main(){
                float edge=abs(markerUv.x)+abs(markerUv.y);
                // Two crisp keylines stay readable over both bright land and dark water.
                // Keep their width in CSS pixels as the orange diamond grows on zoom.
                float inset=(1.-edge)*markerSize*.707107;
                float lineAa=max(fwidth(inset)*.45,.15);
                float alpha=smoothstep(0.,lineAa,inset);
                if(alpha<.01||markerColor.a<.01)discard;
                vec3 ink=vec3(.006,.009,.013),platinum=vec3(.94,.97,1.);
                float keyline=min(.6,markerSize*.12),rim=keyline+min(1.3,markerSize*.2);
                vec3 color=mix(platinum,ink,smoothstep(keyline-lineAa,keyline+lineAa,inset));
                color=mix(color,markerColor.rgb,smoothstep(rim-lineAa,rim+lineAa,inset));
                // A small platinum center singles out the chosen site without pulsing.
                color=mix(color,platinum,markerSelected*(1.-smoothstep(1.-lineAa,1.+lineAa,edge*markerSize*.707107)));
                gl_FragColor=vec4(color,alpha*markerColor.a);
                #include <colorspace_fragment>
            }`
    });
    const mesh=new T.Mesh(geometry,material);mesh.name='batched-prospect-markers';
    mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.renderOrder=5;mesh.visible=false;
    mesh.onBeforeRender=()=>{
        material.uniforms.viewport.value.set(globe.width(),globe.height());
        const altitude=globe.camera().position.length()/globe.getGlobeRadius()-1;
        material.uniforms.zoomScale.value=1+.95*(1-T.MathUtils.smoothstep(altitude,.16,1.2));
    };
    globe.scene().add(mesh);
    let data=[],centers=new Float32Array(),projected=[],dirty=true,active=false,disposed=false;
    let capacity=0,hoverRaf=0,pointer=null,down=null,canClick=false,multiple=false;
    const fingers=new Set(),controls=globe.controls();
    const tip=document.createElement('aside');tip.className='prospect-globe-tip';tip.hidden=true;tip.setAttribute('role','tooltip');
    const name=document.createElement('strong'),meta=document.createElement('span'),owner=document.createElement('span');
    tip.append(name,meta,owner);host.append(tip);

    function clearHover(){tip.hidden=true;material.uniforms.hovered.value=-1;host.style.cursor=active?(down?'grabbing':'grab'):'';}
    function changed(){dirty=true;clearHover();}
    controls.addEventListener('change',changed);
    const resize=new ResizeObserver(()=>{dirty=true;});resize.observe(host);

    function setData(points) {
        active=points!==null;data=points||[];clearHover();dirty=true;
        mesh.visible=active&&data.length>0;geometry.instanceCount=data.length;
        host.dataset.prospectMarkers=active?String(data.length):'';
        if(data.length>capacity){
            capacity=Math.max(64,2**Math.ceil(Math.log2(data.length)));
            geometry.setAttribute('siteCenter',new T.InstancedBufferAttribute(new Float32Array(capacity*3),3));
            geometry.setAttribute('siteColor',new T.InstancedBufferAttribute(new Float32Array(capacity*4),4));
            geometry.setAttribute('siteStyle',new T.InstancedBufferAttribute(new Float32Array(capacity*2),2));
            geometry.setAttribute('siteIndex',new T.InstancedBufferAttribute(new Float32Array(capacity),1));
        }
        if(!data.length){centers=new Float32Array();return;}
        const position=geometry.attributes.siteCenter,color=geometry.attributes.siteColor,style=geometry.attributes.siteStyle;
        const rgb=new T.Color(),radius=globe.getGlobeRadius()+.16;
        data.forEach((d,i)=>{
            const p=globePoint(d.lat,d.lng,radius);position.setXYZ(i,p.x,p.y,p.z);
            rgb.set(d.markerColor);
            color.setXYZW(i,rgb.r,rgb.g,rgb.b,d.dim?.78:1);
            style.setXY(i,markerRadius(d.kw,d.selected),d.selected?1:0);
            geometry.attributes.siteIndex.setX(i,i);
        });
        centers=position.array.subarray(0,data.length*3);
        for(const attr of ['siteCenter','siteColor','siteStyle','siteIndex'])geometry.attributes[attr].needsUpdate=true;
    }

    function pick(clientX,clientY,tolerance) {
        const r=host.getBoundingClientRect();
        if(!r.width||!r.height)return null;
        if(dirty){
            const camera=globe.camera();camera.updateMatrixWorld();
            projected=projectMarkers(centers,camera,r.width,r.height,globe.getGlobeRadius());dirty=false;
        }
        return pickMarker(projected,clientX-r.left,clientY-r.top,tolerance);
    }
    function hover() {
        hoverRaf=0;if(!active||!pointer||down||fingers.size||disposed)return;
        const hit=pick(pointer.x,pointer.y,10);
        if(!hit){clearHover();return;}
        const d=data[hit.index];material.uniforms.hovered.value=hit.index;
        name.textContent=d.label||'Prospect';
        meta.textContent=(Number.isFinite(d.kw)?(d.kw/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' MW · ':'')+(d.sourceLabel||'Energy site');
        owner.textContent=d.operator||'';owner.hidden=!d.operator;
        tip.hidden=false;host.style.cursor='pointer';
        const r=host.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
        tip.style.left=Math.max(8,Math.min(r.width-w-8,hit.x+14))+'px';
        tip.style.top=Math.max(8,Math.min(r.height-h-8,hit.y-h-12))+'px';
    }
    function onMove(e){
        if(!active)return;
        if(down){if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down.moved=true;return;}
        if(e.pointerType==='touch'||e.buttons)return;
        pointer={x:e.clientX,y:e.clientY};
        if(!hoverRaf)hoverRaf=requestAnimationFrame(hover);
    }
    function onDown(e){
        if(!active)return;fingers.add(e.pointerId);canClick=false;clearHover();
        if(fingers.size>1){multiple=true;if(down)down.moved=true;return;}
        multiple=false;down={x:e.clientX,y:e.clientY,moved:false,button:e.button,type:e.pointerType};
        host.style.cursor='grabbing';
    }
    function onUp(e){
        fingers.delete(e.pointerId);
        if(down&&!fingers.size){
            canClick=!multiple&&!down.moved&&down.button===0&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<=5;
            pointer={x:e.clientX,y:e.clientY,touch:down.type==='touch'};down=null;clearHover();
        }
    }
    function cancel(){down=null;canClick=false;fingers.clear();pointer=null;clearHover();}
    function onClick(e){
        if(!active||!canClick||!pointer)return;canClick=false;
        const hit=pick(e.clientX,e.clientY,pointer.touch?22:14);
        e.stopPropagation();clearHover();
        if(hit)onSelect(data[hit.index].id);else onEmpty();
    }
    host.addEventListener('pointerdown',onDown,true);
    host.addEventListener('pointermove',onMove,true);
    host.addEventListener('pointerup',onUp,true);
    host.addEventListener('pointercancel',cancel,true);
    host.addEventListener('pointerleave',cancel);
    host.addEventListener('click',onClick,true);

    return {setData,
        pick:(x,y,tolerance=14)=>{const hit=pick(x,y,tolerance);return hit?data[hit.index]:null;},
        dispose(){
            disposed=true;cancelAnimationFrame(hoverRaf);resize.disconnect();controls.removeEventListener('change',changed);
            host.removeEventListener('pointerdown',onDown,true);host.removeEventListener('pointermove',onMove,true);
            host.removeEventListener('pointerup',onUp,true);host.removeEventListener('pointercancel',cancel,true);
            host.removeEventListener('pointerleave',cancel);host.removeEventListener('click',onClick,true);
            tip.remove();host.style.cursor='';delete host.dataset.prospectMarkers;
            globe.scene().remove(mesh);geometry.dispose();material.dispose();
        }
    };
}
