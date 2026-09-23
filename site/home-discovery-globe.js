/* Textured platinum globe with raised continental relief, dark oceans and
   orange energy routes. Regions illustrate sources, not available sites. */
const mounted = new WeakMap();
const SOURCES = {
    landfill:{label:'Landfill gas',lat:46,lon:-93},
    flare:{label:'Flare gas',lat:31,lon:-106},
    hydro:{label:'Hydro',lat:54,lon:-126},
    nuclear:{label:'Nuclear',lat:36,lon:-79},
    // Across the date line, 170°E is geographically west of Alaska.
    wind:{label:'Wind',lat:65,lon:170},
    solar:{label:'Solar',lat:24,lon:-112},
    industrial:{label:'Industrial surplus',lat:49,lon:-67},
    grid:{label:'Grid supply',lat:59,lon:-106}
};
const radians = degrees => degrees*Math.PI/180;
// Solve the perspective projection for 40°N, 100°W at 70% of the
// visible globe radius to the left. Positive phi moves America toward center.
function overviewPhi() {
    const distance = 3.39/Math.sin(radians(39/2))*1.025/3.2;
    let left = -1.2, right = 0;
    for (let i=0;i<48;i++) {
        const phi = (left+right)/2, lat = radians(40), lon = radians(-100)+phi;
        const x = Math.cos(lat)*Math.cos(lon);
        const z = Math.sin(lat)*Math.sin(.3)-Math.cos(lat)*Math.sin(lon)*Math.cos(.3);
        const projected = x*Math.sqrt(distance*distance-1)/(distance-z);
        if (projected < -.70) left = phi; else right = phi;
    }
    return (left+right)/2;
}
const HOME = {phi:overviewPhi(),theta:.3,scale:1};
const version = new URL(import.meta.url).searchParams.get('v');
const assetURL = path => {
    const url = new URL(path,import.meta.url);
    if (version) url.searchParams.set('v',version);
    return url.href;
};
const ROTATION_SPEED = Math.PI/180; // One revolution per six visible minutes.
const ease = value => value*value*(3-2*value);
const mix = (a,b,t) => a+(b-a)*t;
const angleTo = (from,to) => from+Math.atan2(Math.sin(to-from),Math.cos(to-from));
const sourceID = value => value === 'powered' ? 'grid' : value;

export function mountHomeDiscoveryGlobe(host) {
    if (!host) return null;
    if (mounted.has(host)) return mounted.get(host);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas');
    canvas.className = 'home-discovery-canvas';
    canvas.setAttribute('aria-hidden','true');
    canvas.style.touchAction = 'pan-y pinch-zoom';
    const labels = document.createElement('div'); labels.className = 'home-globe-labels';
    const lines = document.createElementNS('http://www.w3.org/2000/svg','svg');
    lines.classList.add('home-globe-lines'); lines.setAttribute('aria-hidden','true');
    const pins = Object.entries(SOURCES).map(([id,region]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'home-globe-pin'; button.hidden = true;
        button.dataset.globeSource = id;
        Object.assign(button.style,{width:'44px',height:'44px',minWidth:'44px',minHeight:'44px'});
        button.setAttribute('aria-label','Explore '+region.label+' — illustrative region');
        button.setAttribute('aria-pressed',String(id === 'landfill'));
        const glyph = document.createElement('span'); glyph.className = 'home-globe-pin-glyph';
        glyph.setAttribute('aria-hidden','true'); button.appendChild(glyph);
        const caption = document.createElement('span'); caption.className = 'home-globe-label'; caption.hidden = true;
        caption.textContent = region.label; caption.setAttribute('aria-hidden','true');
        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.style.display = 'none'; lines.appendChild(line); labels.append(button,caption);
        return {id,...region,button,caption,line};
    });
    const frameHost = host.closest('.home-discovery-grid');
    const stageHost = host.closest('.home-explorer-stage');
    const overlayElements = ['.home-sourcing-intro','.research-slot','.home-research-sources','.home-sourcing-actions','.home-explorer-top']
        .map(selector => frameHost?.querySelector(selector)).filter(Boolean);
    host.append(canvas,lines,labels);
    host.dataset.discoverySource = 'landfill';
    let selected = 'landfill', phi = HOME.phi, theta = HOME.theta, scale = HOME.scale;
    let T, renderer = null, world, camera, earth, environment, lightingRig;
    let ready = false, prepared = false, loading = false, failed = false, disposed = false;
    let homeDistance = 0, markers = [], routes = [];
    const textureSet = new Set();
    let active = true, visible = false, suspended = false, frame = 0, last = 0, elapsed = 0;
    let width = 0, height = 0, ratio = 1, flight = null, drag = null, ignoreClick = false, hoveredPin = null;
    let overlayCache = null;
    let resizeObserver, loadObserver, viewObserver;

    function available() { return active && visible && !document.hidden && !suspended && !failed && !disposed; }
    function animating() { return ready && available() && (!motion.matches || !!flight); }
    function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
    function wake() { if (!frame && animating()) frame = requestAnimationFrame(tick); }
    function finishFlight(success) {
        if (!flight) return;
        const previous = flight; flight = null;
        clearTimeout(previous.timeout); previous.resolve(success);
    }
    function project(region) {
        if (!camera || !region.anchor || !earth) return null;
        // A perspective globe hides points beyond its actual sphere horizon.
        if (region.anchor.clone().normalize().dot(camera.position) <= 3.215) return null;
        const point = region.tip.clone().project(camera);
        return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};
    }
    function targetLayout() {
        // Rectangles are local to the globe, so ordinary page scrolling does not
        // invalidate them. Throttle layout reads while the sphere is rotating.
        if (overlayCache && Date.now()-overlayCache.updated < 250) return overlayCache;
        const origin = host.getBoundingClientRect();
        const localRect = element => {
            const rect = element.getBoundingClientRect();
            return {left:rect.left-origin.left,top:rect.top-origin.top,
                right:rect.right-origin.left,bottom:rect.bottom-origin.top,width:rect.width,height:rect.height};
        };
        const clips = [stageHost,frameHost].filter(Boolean).map(localRect);
        return overlayCache = {updated:Date.now(),overlays:overlayElements.map(localRect).filter(rect => rect.width && rect.height),
            left:Math.max(0,...clips.map(rect => rect.left)),top:Math.max(0,...clips.map(rect => rect.top)),
            right:Math.min(width,...clips.map(rect => rect.right)),bottom:Math.min(height,...clips.map(rect => rect.bottom))};
    }
    function updateLabels() {
        const interactive = available() && ready && !flight && scale < 1.08;
        const layout = interactive ? targetLayout() : null;
        for (const pin of pins) {
            const position = project(pin);
            const show = interactive && !!position && position.x >= layout.left && position.x <= layout.right && position.y >= layout.top && position.y <= layout.bottom &&
                !layout.overlays.some(rect => position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom);
            const captionShown = show && pin.id === selected;
            if (!show && hoveredPin === pin.button) hoveredPin = null;
            pin.button.hidden = !show; pin.caption.hidden = !captionShown;
            pin.line.style.display = captionShown ? '' : 'none';
            pin.button.classList.toggle('is-visible',show);
            pin.button.classList.toggle('is-selected',pin.id === selected);
            pin.button.setAttribute('aria-pressed',String(pin.id === selected));
            pin.caption.classList.toggle('is-visible',captionShown);
            pin.caption.classList.toggle('is-selected',pin.id === selected);
            if (!show) continue;
            pin.button.style.left = position.x+'px'; pin.button.style.top = position.y+'px';
            pin.button.style.transform = 'translate(-50%,-50%)';
            if (!captionShown) continue;
            const x = Math.max(8,Math.min(width-154,position.x+30)), y = Math.max(8,position.y-42);
            pin.caption.style.left = x+'px'; pin.caption.style.top = y+'px';
            pin.line.setAttribute('x1',position.x); pin.line.setAttribute('y1',position.y);
            pin.line.setAttribute('x2',x); pin.line.setAttribute('y2',y+12);
        }
    }
    function fit() {
        if (!renderer || !camera) return false;
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return false;
        if (w !== width || h !== height) {
            width = w; height = h; ratio = Math.min(window.devicePixelRatio || 1,1.75);
            renderer.setPixelRatio(ratio); renderer.setSize(w,h,false); camera.aspect = w/h;
            const halfAngle = Math.atan(Math.tan(radians(camera.fov/2))*Math.min(1,camera.aspect));
            homeDistance = 3.39/Math.sin(halfAngle)*1.025; camera.updateProjectionMatrix();
        }
        const distance = 3.2*Math.sqrt(1+(Math.pow(homeDistance/3.2,2)-1)/(scale*scale));
        const longitude = -phi-Math.PI/2, cosine = Math.cos(theta);
        camera.position.set(Math.sin(longitude)*cosine,Math.sin(theta),Math.cos(longitude)*cosine).multiplyScalar(distance);
        camera.lookAt(0,0,0); camera.updateMatrixWorld();
        const front = camera.position.clone().normalize();
        const right = new T.Vector3().crossVectors(new T.Vector3(0,1,0),front).normalize();
        lightingRig.key.position.copy(front).multiplyScalar(9).addScaledVector(right,-7).add(new T.Vector3(0,8,0));
        lightingRig.fill.position.copy(front).multiplyScalar(4).addScaledVector(right,9);
        lightingRig.rim.position.copy(front).multiplyScalar(-8).addScaledVector(right,7).add(new T.Vector3(0,-1,0));
        return true;
    }
    function setVisuals() {
        const animated = !motion.matches;
        markers.forEach((marker,index) => {
            const focused = marker.id === selected, pulse = animated ? .5+.5*Math.sin(elapsed*1.1-index*.6) : .5;
            marker.material.emissiveIntensity = focused ? .16+pulse*.045 : .055;
            marker.cap.scale.setScalar(focused ? 1.08 : 1);
            marker.halo.material.opacity = focused ? .10+pulse*.03 : .035;
            marker.halo.scale.setScalar(focused ? .97+pulse*.04 : .86);
            marker.ring.material.opacity = focused ? .48 : .22;
        });
        routes.forEach(route => {
            const focused = route.ids.includes(selected);
            route.line.visible = focused; route.pulse.visible = focused;
            route.line.material.opacity = .16;
            route.pulse.position.copy(route.curve.getPointAt(animated ? (elapsed*.055+route.phase)%1 : .55));
        });
    }
    function draw() {
        if (!renderer || !prepared || failed || disposed || !fit()) return;
        try {
            setVisuals(); renderer.render(world,camera);
            if (!ready) {
                ready = true; host.dataset.renderState = 'ready'; canvas.style.opacity = '1'; startFlight();
            }
            updateLabels();
        } catch { fallback(); }
    }
    function releaseResources() {
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
        renderer?.dispose(); renderer = null; world = null; earth = null; camera = null;
        markers = []; routes = []; prepared = false; ready = false;
        pins.forEach(pin => { pin.anchor = null; pin.tip = null; });
    }
    function animateFlight(progress) {
        if (!flight?.started) return;
        if (flight.kind === 'reset') {
            const t = ease(progress);
            phi = mix(flight.from.phi,flight.to.phi,t);
            theta = mix(flight.from.theta,flight.to.theta,t);
            scale = mix(flight.from.scale,1,t);
        } else {
            const turn = ease(Math.min(1,progress/.6));
            phi = mix(flight.from.phi,flight.to.phi,turn);
            theta = mix(flight.from.theta,flight.to.theta,turn);
            scale = progress < .6 ? mix(flight.from.scale,1,turn) : mix(1,2.5,ease((progress-.6)/.4));
        }
    }
    function tick(now) {
        frame = 0; if (!animating()) return;
        const delta = last ? Math.min((now-last)/1000,.1) : 0; last = now;
        // Keep the focused label and its geographic anchor still while a
        // keyboard user reads it or tabs between the visible source labels.
        const labelFocused = labels.contains(document.activeElement);
        const pinEngaged = labelFocused || hoveredPin;
        if (!pinEngaged) elapsed += delta;
        let complete = false;
        if (flight?.started) {
            flight.elapsed += delta;
            const progress = Math.min(1,flight.elapsed/flight.duration);
            animateFlight(progress); complete = progress >= 1;
        } else if (!drag && scale === 1 && !pinEngaged) {
            phi += delta*ROTATION_SPEED;
        }
        draw(complete); if (complete) finishFlight(true); wake();
    }
    function startFlight() {
        if (!flight || flight.started || !ready || !available() || !width || !height) return;
        const region = SOURCES[flight.source];
        const targetPhi = flight.kind === 'reset' ? HOME.phi : -radians(region.lon)-Math.PI/2;
        Object.assign(flight,{started:true,elapsed:0,from:{phi,theta,scale},
            to:{phi:angleTo(phi,targetPhi),theta:flight.kind === 'reset' ? HOME.theta : radians(region.lat)}});
        if (motion.matches) { animateFlight(1); draw(true); finishFlight(true); updateLabels(); }
        else wake();
    }
    function select(value) {
        const source = sourceID(value);
        if (!Object.hasOwn(SOURCES,source) || disposed) return;
        selected = source; host.dataset.discoverySource = source;
        if (available()) draw(); else updateLabels();
    }
    function travel(kind,value) {
        const source = sourceID(value);
        if (kind === 'fly' && !Object.hasOwn(SOURCES,source)) return Promise.resolve(false);
        finishFlight(false);
        if (disposed || failed || !active || suspended || document.hidden) return Promise.resolve(false);
        drag = null; if (kind === 'fly') select(source);
        return new Promise(resolve => {
            const request = {kind,source,resolve,started:false,duration:kind === 'reset' ? .7 : 1.3};
            flight = request;
            request.timeout = setTimeout(() => { if (flight === request) finishFlight(false); },15000);
            if (!renderer) load(); startFlight(); updateLabels(); wake();
        });
    }
    function setActive(value) {
        active = !!value;
        if (!active) { finishFlight(false); stop(); drag = null; }
        else if (!disposed && !failed && visible) {
            if (!renderer) load(); else { draw(true); startFlight(); wake(); }
        }
        updateLabels();
    }
    function resize() {
        overlayCache = null;
        if (!disposed && !failed && renderer && active) { draw(); startFlight(); wake(); }
    }
    function fallback() {
        if (failed || disposed) return;
        failed = true; finishFlight(false); stop(); releaseResources(); canvas.style.opacity = '0';
        host.dataset.renderState = 'fallback'; updateLabels();
    }
    function contextLost(event) { event.preventDefault(); fallback(); }
    async function load() {
        if (loading || renderer || disposed || failed) return;
        loading = true; host.dataset.renderState = 'loading';
        try {
            const [three,surface,geography,lighting,borders] = await Promise.all([
                import('./vendor/three-0.185.1/three.module.min.js'),
                import(assetURL('./globe-surface.js')),
                import(assetURL('./hosting-earth-data.js')),
                import('./vendor/three-0.185.1/RoomEnvironment.js'),
                import(assetURL('./hosting-globe-scene.js'))
            ]);
            if (disposed || failed) return;
            T = three;
            renderer = new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));
            renderer.setClearColor(0x000000,0);
            renderer.outputColorSpace = T.SRGBColorSpace;
            renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .86;
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
            const rim = new T.DirectionalLight(0xf7931a,1.05);
            rim.position.copy(earth.front).multiplyScalar(-8).addScaledVector(right,7).add(new T.Vector3(0,-1,0)); world.add(rim);

            lightingRig = {key,fill,rim};

            // Keep the warm atmosphere on the exposed left/lower perimeter;
            // the page crops the opposite side. This shell leaves the neutral
            // land and ocean materials unchanged.
            earth.root.add(new T.Mesh(new T.SphereGeometry(3.24,80,56),new T.ShaderMaterial({
                transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
                vertexShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){vec4 q=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-q.xyz);p=q.xyz;gl_Position=projectionMatrix*q;}',
                fragmentShader:'varying vec3 n; varying vec3 v; varying vec3 p; void main(){float e=pow(1.-abs(dot(normalize(n),normalize(v))),3.4);float left=1.-smoothstep(-2.8,1.2,p.x);float bottom=1.-smoothstep(-2.5,.5,p.y);float warm=max(left,bottom*.65);gl_FragColor=vec4(1.,.40,.055,e*(.08+.34*warm));}'
            })));

            const bezelMaterial = new T.MeshStandardMaterial({color:0xd9d8d4,metalness:1,roughness:.24});
            for (const [id,region] of Object.entries(SOURCES)) {
                const anchor = surface.globePoint(region.lat,region.lon,3.218);
                const pin = new T.Group(); pin.name = 'illustrative-region-'+id;
                pin.position.copy(anchor); pin.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),anchor.clone().normalize());
                earth.root.add(pin);
                const material = new T.MeshStandardMaterial({color:0xf7931a,metalness:.72,roughness:.25,emissive:0xdb730d,emissiveIntensity:.08});
                // Shallow machined bezels sit on the metallic globe, rather than
                // tall toy-like map tacks. The faceted orange center catches light.
                const bezel = new T.Mesh(new T.TorusGeometry(.059,.008,8,40),bezelMaterial);
                bezel.position.z = .015; pin.add(bezel);
                const cap = new T.Mesh(new T.OctahedronGeometry(.038,0),material);
                cap.rotation.z = Math.PI/4; cap.position.z = .029; pin.add(cap);
                const ring = new T.Mesh(new T.RingGeometry(.074,.079,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
                ring.position.z = .012; pin.add(ring);
                const halo = new T.Mesh(new T.RingGeometry(.095,.104,48),new T.MeshBasicMaterial({color:0xf7931a,transparent:true,opacity:.035,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
                halo.position.z = .012; pin.add(halo);
                markers.push({id,pin,material,cap,ring,halo,anchor});
                const label = pins.find(item => item.id === id);
                label.anchor = anchor; label.tip = anchor.clone().normalize().multiplyScalar(3.247);
            }
            // A sparse circuit provides context without covering the globe with
            // every possible connection. Only the selected source's two arcs show.
            const pairs = markers.map((_,index) => [index,(index+1)%markers.length]);
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
            new T.TextureLoader().load(assetURL('./textures/earth-normal.png'),texture => {
                if (disposed || failed || !earth) { texture.dispose(); return; }
                texture.anisotropy = anisotropy; textureSet.add(texture);
                earth.surface.material.normalMap = texture; earth.surface.material.normalScale.set(6,6);
                earth.surface.material.needsUpdate = true;
                if (active && visible && !document.hidden) draw();
            },undefined,() => {});
            if (renderer.compileAsync) await renderer.compileAsync(world,camera);
            if (disposed || failed) return;
            prepared = true; draw(); startFlight(); wake();
        } catch { if (!disposed) fallback(); }
        finally { loading = false; }
    }
    function chooseSource(source) {
        if (disposed || !available()) return;
        const button = document.querySelector('[data-energy-site-select="'+source+'"]');
        // Canvas hit-testing is a fallback to the permanent source controls;
        // projected DOM pins themselves use the research controller's delegation.
        button?.focus({preventScroll:true});
        button?.click();
    }
    function pinOver(event) {
        const button = event.target.closest('[data-globe-source]');
        if (button && labels.contains(button) && event.pointerType !== 'touch') hoveredPin = button;
    }
    function pinOut(event) {
        if (hoveredPin && !hoveredPin.contains(event.relatedTarget)) hoveredPin = null;
    }
    function pointerDown(event) {
        if (!available() || !ready || flight || event.button > 0 || !event.isPrimary) return;
        ignoreClick = false;
        drag = {id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,axis:null,touch:event.pointerType !== 'mouse'};
        if (!drag.touch) { drag.axis = 'x'; canvas.setPointerCapture?.(event.pointerId); }
        canvas.style.cursor = 'grabbing';
    }
    function pointerMove(event) {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
        if (!drag.axis && Math.hypot(dx,dy) > 6) {
            drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (drag.axis === 'x') canvas.setPointerCapture?.(event.pointerId);
        }
        if (Math.hypot(dx,dy) > 5) ignoreClick = true;
        if (drag.axis === 'x') { phi -= (event.clientX-drag.lastX)*.005; draw(true); }
        drag.lastX = event.clientX;
    }
    function pointerEnd(event) {
        if (!drag || drag.id !== event.pointerId) return;
        const id = drag.id; drag = null;
        if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
        canvas.style.cursor = 'grab'; wake();
    }
    function canvasClick(event) {
        if (ignoreClick || flight || !available() || !ready) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX-rect.left, y = event.clientY-rect.top;
        let nearest = null, distance = 44;
        for (const pin of pins) {
            const position = project(pin); if (!position) continue;
            const next = Math.hypot(position.x-x,position.y-y);
            if (next < distance) { nearest = pin; distance = next; }
        }
        if (nearest) chooseSource(nearest.id);
    }
    function visibilityChanged() {
        if (document.hidden) { finishFlight(false); stop(); drag = null; }
        else if (active && visible) { draw(true); startFlight(); wake(); }
        updateLabels();
    }
    function motionChanged() {
        stop();
        if (motion.matches && flight?.started) { animateFlight(1); draw(true); finishFlight(true); }
        else if (available()) draw(true);
        startFlight(); wake();
    }
    function pageHide(event) {
        suspended = true; finishFlight(false); stop(); drag = null;
        if (!event.persisted) dispose();
    }
    function pageShow() { suspended = false; if (available()) { draw(true); startFlight(); wake(); } }
    function dispose() {
        if (disposed) return;
        disposed = true; finishFlight(false); stop();
        resizeObserver?.disconnect(); loadObserver?.disconnect(); viewObserver?.disconnect();
        document.removeEventListener('visibilitychange',visibilityChanged);
        motion.removeEventListener('change',motionChanged);
        window.removeEventListener('pagehide',pageHide); window.removeEventListener('pageshow',pageShow);
        window.removeEventListener('resize',resize);
        canvas.removeEventListener('webglcontextlost',contextLost);
        canvas.removeEventListener('pointerdown',pointerDown); canvas.removeEventListener('pointermove',pointerMove);
        canvas.removeEventListener('pointerup',pointerEnd); canvas.removeEventListener('pointercancel',pointerEnd);
        canvas.removeEventListener('lostpointercapture',pointerEnd); canvas.removeEventListener('click',canvasClick);
        labels.removeEventListener('pointerover',pinOver); labels.removeEventListener('pointerout',pinOut);
        hoveredPin = null;
        releaseResources(); canvas.remove(); lines.remove(); labels.remove();
        host.dataset.renderState = 'poster'; mounted.delete(host);
    }
    canvas.addEventListener('webglcontextlost',contextLost);
    canvas.addEventListener('pointerdown',pointerDown); canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerEnd); canvas.addEventListener('pointercancel',pointerEnd);
    canvas.addEventListener('lostpointercapture',pointerEnd); canvas.addEventListener('click',canvasClick);
    canvas.style.cursor = 'grab'; labels.addEventListener('pointerover',pinOver); labels.addEventListener('pointerout',pinOut);
    document.addEventListener('visibilitychange',visibilityChanged);
    motion.addEventListener('change',motionChanged);
    window.addEventListener('pagehide',pageHide); window.addEventListener('pageshow',pageShow);
    if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); }
    else window.addEventListener('resize',resize);
    if (typeof IntersectionObserver === 'function') {
        viewObserver = new IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
            if (visible && active) { if (!renderer) load(); else { draw(true); startFlight(); wake(); } }
            else { finishFlight(false); stop(); drag = null; updateLabels(); }
        }); viewObserver.observe(host);
        loadObserver = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { loadObserver.disconnect(); load(); }
        },{rootMargin:'240px'}); loadObserver.observe(host);
    } else { visible = true; load(); }
    const api = {select,flyTo:source => travel('fly',source),reset:() => travel('reset'),setActive,dispose};
    mounted.set(host,api); return api;
}

const homeGlobe = document.getElementById('home-discovery-globe');
if (homeGlobe) mountHomeDiscoveryGlobe(homeGlobe);
