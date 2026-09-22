/* Decorative regional research globe. Pins illustrate a search area; they are
   never facility coordinates, available inventory or an energy-access claim. */
const mounted = new WeakMap();
const SOURCES = Object.freeze({
    landfill: {lat:31.7,lon:-100.0},
    powered: {lat:43.2,lon:-85.5},
    hydro: {lat:46.7,lon:-120.3}
});

export function mountHomeDiscoveryGlobe(host) {
    if (!host) return null;
    if (mounted.has(host)) return mounted.get(host);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let selected = Object.hasOwn(SOURCES,host.dataset.discoverySource) ? host.dataset.discoverySource : 'landfill';
    let visible = false, suspended = false, disposed = false, failed = false, loading = false, ready = false;
    let frame = 0, last = 0, time = 0, width = 0, height = 0;
    let T, renderer, world, camera, earth, environment, resizeObserver, loadObserver, viewObserver;
    let markers = [], routes = [];
    const textureSet = new Set();
    host.dataset.discoverySource = selected;
    host.dataset.renderState = 'poster';

    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; }
    function canAnimate() { return ready && visible && !suspended && !document.hidden && !motion.matches && !disposed && !failed; }
    function wake() { if (canAnimate() && !frame) frame = requestAnimationFrame(tick); }
    function releaseResources() {
        if (renderer) renderer.domElement.removeEventListener('webglcontextlost',contextLost);
        const geometries = new Set(), materials = new Set();
        world?.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
        });
        for (const material of materials) {
            for (const value of Object.values(material)) if (value?.isTexture) textureSet.add(value);
            material.dispose();
        }
        geometries.forEach(geometry => geometry.dispose());
        textureSet.forEach(texture => texture.dispose()); textureSet.clear();
        environment?.dispose(); environment = null;
        renderer?.dispose(); renderer?.domElement.remove(); renderer = null;
        world = null; earth = null; markers = []; routes = [];
    }
    function fallback() {
        failed = true; ready = false; stop();
        releaseResources(); host.dataset.renderState = 'fallback';
    }
    function contextLost(event) { event.preventDefault(); fallback(); }
    function fit() {
        if (!renderer || !camera) return false;
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return false;
        if (w !== width || h !== height) {
            width = w; height = h;
            renderer.setSize(w,h,false);
            camera.aspect = w/h;
            // The sphere fills the short edge. The surrounding layout may crop
            // its lower edge, but a wide host never reduces it to a tiny globe.
            const halfAngle = Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(1,camera.aspect));
            const distance = 3.39/Math.sin(halfAngle)*1.025;
            camera.position.copy(earth.front).multiplyScalar(distance);
            camera.lookAt(0,0,0); camera.updateProjectionMatrix();
        }
        return true;
    }
    function setVisuals() {
        if (!earth) return;
        const animated = !motion.matches;
        earth.root.rotation.y = animated ? Math.sin(time*.12)*.018 : 0;
        earth.root.rotation.z = animated ? Math.sin(time*.08)*.004 : 0;
        markers.forEach((marker,index) => {
            const active = marker.id === selected;
            const pulse = animated ? .5+.5*Math.sin(time*1.1-index*.6) : .5;
            marker.material.emissiveIntensity = active ? .26+pulse*.08 : .09;
            marker.cap.scale.setScalar(active ? 1.12 : 1);
            marker.halo.material.opacity = active ? .17+pulse*.07 : .07;
            marker.halo.scale.setScalar(active ? .94+pulse*.08 : .82);
            marker.ring.material.opacity = active ? .55 : .20;
        });
        routes.forEach(route => {
            const active = route.ids.includes(selected);
            route.line.material.opacity = active ? .22 : .07;
            route.pulse.visible = active;
            route.pulse.position.copy(route.curve.getPointAt(animated ? (time*.055+route.phase)%1 : .55));
        });
    }
    function render() {
        if (!renderer || disposed || failed || !fit()) return;
        try {
            setVisuals(); renderer.render(world,camera);
            if (!ready) { ready = true; host.dataset.renderState = 'ready'; }
        } catch { fallback(); }
    }
    function tick(now) {
        frame = 0;
        if (!canAnimate()) return;
        if (!last) last = now;
        const elapsed = (now-last)/1000;
        if (elapsed >= 1/30) { time += Math.min(elapsed,.1); last = now; render(); }
        wake();
    }
    function resize() {
        if (!disposed && !failed && renderer) { render(); wake(); }
    }
    function select(source) {
        if (!Object.hasOwn(SOURCES,source) || disposed || selected === source) return;
        selected = source; host.dataset.discoverySource = source;
        if (visible && !document.hidden) render();
        wake();
    }
    function sourceChanged(event) { select(event.detail?.source); }
    function visibilityChanged() { if (document.hidden) stop(); else if (visible) { render(); wake(); } }
    function motionChanged() { stop(); if (visible) render(); wake(); }
    function pageHide(event) {
        suspended = true; stop();
        if (!event.persisted) dispose();
    }
    function pageShow() { suspended = false; if (visible) { render(); wake(); } }
    function dispose() {
        if (disposed) return;
        disposed = true; stop();
        resizeObserver?.disconnect(); loadObserver?.disconnect(); viewObserver?.disconnect();
        document.removeEventListener('proton:discovery-source',sourceChanged);
        window.removeEventListener('proton:discovery-source',sourceChanged);
        document.removeEventListener('visibilitychange',visibilityChanged);
        motion.removeEventListener('change',motionChanged);
        window.removeEventListener('pagehide',pageHide); window.removeEventListener('pageshow',pageShow);
        window.removeEventListener('resize',resize);
        releaseResources(); host.dataset.renderState = 'poster'; mounted.delete(host);
    }

    async function load() {
        if (loading || renderer || disposed || failed) return;
        loading = true; host.dataset.renderState = 'loading';
        try {
            const [three,surface,geography,lighting,borders] = await Promise.all([
                import('./vendor/three-0.185.1/three.module.min.js'),
                import('./globe-surface.js'),
                import('./hosting-earth-data.js'),
                import('./vendor/three-0.185.1/RoomEnvironment.js'),
                import('./hosting-globe-scene.js')
            ]);
            if (disposed) return;
            T = three;
            renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));
            renderer.setClearColor(0x000000,0);
            renderer.outputColorSpace = T.SRGBColorSpace;
            renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .86;
            const canvas = renderer.domElement;
            canvas.className = 'home-discovery-canvas'; canvas.setAttribute('aria-hidden','true');
            canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
            canvas.addEventListener('webglcontextlost',contextLost); host.appendChild(canvas);
            world = new T.Scene(); camera = new T.PerspectiveCamera(39,1,.1,80);
            const room = new lighting.RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer);
            try { environment = pmrem.fromScene(room,.035); }
            finally { room.dispose(); pmrem.dispose(); }
            world.environment = environment.texture; world.environmentIntensity = .55;
            const model = surface.buildGlobeSurface(geography.LAND,{detail:true,lakes:geography.LAKES});
            earth = {...model,front:surface.globePoint(36,-99,1)};
            world.add(earth.root); earth.textures.forEach(texture => textureSet.add(texture));
            earth.surface.material.color.setHex(0x858b8e);
            earth.surface.material.metalness = .78;
            earth.surface.material.roughness = .75;
            earth.surface.material.clearcoat = .12;
            const divisions = borders.buildCountryBorders(geography.BORDERS);
            divisions.material.color.setHex(0x20252a); divisions.material.transparent = true; divisions.material.opacity = .7;
            earth.root.add(divisions);
            world.add(new T.HemisphereLight(0xf7f5ef,0x111318,.48));
            const right = new T.Vector3().crossVectors(new T.Vector3(0,1,0),earth.front).normalize();
            const key = new T.DirectionalLight(0xffffff,2.0);
            key.position.copy(earth.front).multiplyScalar(9).addScaledVector(right,-7).add(new T.Vector3(0,8,0)); world.add(key);
            const fill = new T.DirectionalLight(0xd7e0e8,.55);
            fill.position.copy(earth.front).multiplyScalar(4).addScaledVector(right,9); world.add(fill);
            const rim = new T.DirectionalLight(0xf7931a,.7);
            rim.position.copy(earth.front).multiplyScalar(-8).addScaledVector(right,7).add(new T.Vector3(0,-1,0)); world.add(rim);

            // A restrained warm edge joins the orange routes to the metal globe.
            earth.root.add(new T.Mesh(new T.SphereGeometry(3.24,80,56),new T.ShaderMaterial({
                transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
                vertexShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){vec4 q=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-q.xyz);p=q.xyz;gl_Position=projectionMatrix*q;}',
                fragmentShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){float e=pow(1.-abs(dot(normalize(n),normalize(v))),3.4);float warm=smoothstep(-2.8,2.8,p.x);gl_FragColor=vec4(1.,.36,.035,e*(.035+.14*warm));}'
            })));

            const stemMaterial = new T.MeshStandardMaterial({color:0xc9c6bf,metalness:.82,roughness:.27});
            for (const [id,region] of Object.entries(SOURCES)) {
                const anchor = surface.globePoint(region.lat,region.lon,3.218);
                const pin = new T.Group(); pin.name = 'illustrative-region-'+id;
                pin.position.copy(anchor); pin.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),anchor.clone().normalize());
                earth.root.add(pin);
                const material = new T.MeshStandardMaterial({color:0xf7931a,metalness:.38,roughness:.4,emissive:0xdb730d,emissiveIntensity:.12});
                const stem = new T.Mesh(new T.CylinderGeometry(.014,.014,.16,10),stemMaterial);
                stem.rotation.x = Math.PI/2; stem.position.z = .08; pin.add(stem);
                const cap = new T.Mesh(new T.SphereGeometry(.036,18,12),material); cap.position.z = .18; pin.add(cap);
                const ring = new T.Mesh(new T.RingGeometry(.055,.066,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
                ring.position.z = .006; pin.add(ring);
                const halo = new T.Mesh(new T.RingGeometry(.085,.112,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.10,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
                halo.position.z = .009; pin.add(halo);
                markers.push({id,material,cap,ring,halo,anchor});
            }
            const pairs = [[0,1],[0,2],[1,2]];
            pairs.forEach(([a,b],index) => {
                const start = markers[a].anchor.clone().normalize(), end = markers[b].anchor.clone().normalize();
                const points = Array.from({length:49},(_,i) => {
                    const t = i/48;
                    return new T.Vector3().lerpVectors(start,end,t).normalize().multiplyScalar(3.24+Math.sin(t*Math.PI)*.19);
                });
                const curve = new T.CatmullRomCurve3(points);
                const line = new T.Mesh(new T.TubeGeometry(curve,64,.006,5,false),new T.MeshBasicMaterial({color:0xf7a536,transparent:true,opacity:.2,depthWrite:false,toneMapped:false}));
                earth.root.add(line);
                const pulse = new T.Mesh(new T.SphereGeometry(.016,10,8),new T.MeshBasicMaterial({color:0xffae46,toneMapped:false})); earth.root.add(pulse);
                routes.push({ids:[markers[a].id,markers[b].id],curve,line,pulse,phase:index*.28});
            });
            const anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
            textureSet.forEach(texture => {texture.anisotropy = anisotropy; texture.needsUpdate = true;});
            // Relief enhances the silhouette, but vector coastlines are complete
            // and the globe stays usable if this optional local texture fails.
            new T.TextureLoader().load(new URL('./textures/earth-normal.png',import.meta.url).href,texture => {
                if (disposed || failed || !earth) { texture.dispose(); return; }
                texture.anisotropy = anisotropy; textureSet.add(texture);
                earth.surface.material.normalMap = texture; earth.surface.material.normalScale.set(6,6);
                earth.surface.material.needsUpdate = true;
                if (visible && !document.hidden) render();
            },undefined,() => {});
            if (!fit()) { host.dataset.renderState = 'loading'; return; }
            if (renderer.compileAsync) await renderer.compileAsync(world,camera);
            if (disposed || failed) return;
            render(); wake();
        } catch { if (!disposed) fallback(); }
        finally { loading = false; }
    }

    document.addEventListener('proton:discovery-source',sourceChanged);
    window.addEventListener('proton:discovery-source',sourceChanged);
    document.addEventListener('visibilitychange',visibilityChanged);
    motion.addEventListener('change',motionChanged);
    window.addEventListener('pagehide',pageHide); window.addEventListener('pageshow',pageShow);
    if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
    else window.addEventListener('resize',resize);
    if (typeof IntersectionObserver === 'function') {
        viewObserver = new IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
            if (visible) { if (!renderer) load(); else { render(); wake(); } } else stop();
        }); viewObserver.observe(host);
        loadObserver = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { loadObserver.disconnect(); load(); }
        },{rootMargin:'240px'}); loadObserver.observe(host);
    } else { visible = true; load(); }
    const api = {select,dispose}; mounted.set(host,api);
    return api;
}

const homeGlobe = document.getElementById('home-discovery-globe');
if (homeGlobe) mountHomeDiscoveryGlobe(homeGlobe);
