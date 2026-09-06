/* Shared platinum Earth surface for the website and operator maps. */
import * as T from './vendor/three-0.185.1/three.module.min.js';

export function globePoint(lat,lon,radius=3.2){
    const a=lat*Math.PI/180,b=lon*Math.PI/180;
    return new T.Vector3(radius*Math.cos(a)*Math.sin(b),radius*Math.sin(a),radius*Math.cos(a)*Math.cos(b));
}

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
export function buildGlobeSurface(land){
    const root=new T.Group();root.name='platinum-globe-surface';
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
    return {root,surface,texture};
}
