/* Shared platinum Earth surface for the website and operator maps. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export function globePoint(lat,lon,radius=3.2){
    const a=lat*Math.PI/180,b=lon*Math.PI/180;
    return new T.Vector3(radius*Math.cos(a)*Math.sin(b),radius*Math.sin(a),radius*Math.cos(a)*Math.cos(b));
}

function paintGeography(ctx,width,height,polygons,color){
    ctx.fillStyle=color;
    for(const polygon of polygons){
        ctx.beginPath();
        for(const ring of polygon)ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*width,y=(90-lat)/180*height;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
        ctx.fill('evenodd');
    }
}
function landTexture(land,{detail=false,lakes=[]}={}){
    const canvas=document.createElement('canvas'),width=detail?4096:2048,height=width/2;canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),ocean=detail?'#111a23':'#191c20';
    ctx.fillStyle=ocean;ctx.fillRect(0,0,width,height);
    paintGeography(ctx,width,height,land,detail?'#a2a7a8':'#aaa9a5');
    if(lakes.length)paintGeography(ctx,width,height,lakes,ocean);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    let roughness=null;
    if(detail){
        const mask=document.createElement('canvas');mask.width=1024;mask.height=512;
        const ctx=mask.getContext('2d');ctx.fillStyle='#707070';ctx.fillRect(0,0,1024,512);
        paintGeography(ctx,1024,512,land,'#c8c8c8');paintGeography(ctx,1024,512,lakes,'#707070');
        roughness=new T.CanvasTexture(mask);
    }
    return {texture,roughness,pixels:detail?null:ctx.getImageData(0,0,width,height).data};
}
export function buildGlobeSurface(land,options={}){
    const root=new T.Group();root.name='platinum-globe-surface';
    const {texture,pixels,roughness}=landTexture(land,options),detail=!!options.detail;
    const geometry=new T.SphereGeometry(3.2,detail?192:112,detail?128:80);geometry.rotateY(-Math.PI/2);
    const material=detail?
        new T.MeshPhysicalMaterial({map:texture,metalness:.58,roughness:1,roughnessMap:roughness,clearcoat:.16,clearcoatRoughness:.32,bumpMap:texture,bumpScale:.013}):
        new T.MeshStandardMaterial({map:texture,metalness:.82,roughness:.38,bumpMap:texture,bumpScale:.013});
    const surface=new T.Mesh(geometry,material);
    surface.name='platinum-earth';root.add(surface);
    const points=[],coasts=[],grid=[];
    if(!detail)for(let lat=-57;lat<=82;lat+=1.5){
        const step=1.5/Math.max(.2,Math.cos(lat*Math.PI/180));
        for(let lon=-179.5;lon<180;lon+=step){
            const x=Math.min(2047,Math.floor((lon+180)/360*2048)),y=Math.min(1023,Math.floor((90-lat)/180*1024));
            if(pixels[(y*2048+x)*4]>100)points.push(...globePoint(lat,lon,3.211).toArray());
        }
    }
    if(points.length){
        const dots=new T.BufferGeometry();dots.setAttribute('position',new T.Float32BufferAttribute(points,3));
        root.add(new T.Points(dots,new T.PointsMaterial({color:0xe8e5dd,size:.018,transparent:true,opacity:.6,sizeAttenuation:true})));
    }
    for(const polygon of [...land,...(options.lakes||[])])for(const ring of polygon)for(let i=1;i<ring.length;i++){
        const a=ring[i-1],b=ring[i],radius=detail?3.206:3.214;
        if(Math.abs(a[0]-b[0])<180)coasts.push(...globePoint(a[1],a[0],radius).toArray(),...globePoint(b[1],b[0],radius).toArray());
    }
    for(const lat of [-60,-30,0,30,60])for(let lon=-180;lon<180;lon+=3)grid.push(...globePoint(lat,lon,3.207).toArray(),...globePoint(lat,lon+3,3.207).toArray());
    for(let lon=-180;lon<180;lon+=30)for(let lat=-90;lat<90;lat+=3)grid.push(...globePoint(lat,lon,3.207).toArray(),...globePoint(lat+3,lon,3.207).toArray());
    for(const [values,color,opacity] of [[coasts,0xede9df,detail?.24:.23],[grid,0xb7b9bc,detail?.045:.10]]){
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(values,3));
        root.add(new T.LineSegments(geo,new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false})));
    }
    const halo=new T.Mesh(new T.SphereGeometry(3.31,64,48),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
        vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
        fragmentShader:'varying vec3 n; varying vec3 v; void main(){float edge=pow(1.-abs(dot(normalize(n),normalize(v))),3.); gl_FragColor=vec4(.62,.67,.72,edge*.24);}'
    }));root.add(halo);
    return {root,surface,texture,textures:roughness?[texture,roughness]:[texture]};
}
