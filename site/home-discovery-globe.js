/* Alliance's original COBE globe and settings, adapted to Proton's illustrative
   energy routes. Regions explain a source, not available sites. */
const mounted = new WeakMap();
const SOURCES = {
    landfill:{label:'Landfill gas',lat:41.8,lon:-87.5},
    flare:{label:'Flare gas',lat:31.8,lon:-103},
    hydro:{label:'Hydro',lat:47.2,lon:-120.7},
    nuclear:{label:'Nuclear',lat:35.2,lon:-80.8},
    wind:{label:'Wind',lat:42,lon:-101},
    solar:{label:'Solar',lat:33.4,lon:-112.2},
    industrial:{label:'Industrial surplus',lat:40.7,lon:-80.4},
    grid:{label:'Grid supply',lat:34,lon:-84.4}
};
const HOME = {phi:0,theta:.3,scale:1};
const radians = degrees => degrees*Math.PI/180;
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
        button.type = 'button'; button.className = 'home-globe-label'; button.hidden = true;
        button.dataset.globeSource = id; button.textContent = region.label;
        button.setAttribute('aria-label','Explore '+region.label+' — illustrative region');
        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.style.display = 'none'; lines.appendChild(line); labels.appendChild(button);
        return {id,...region,button,line};
    });
    host.append(canvas,lines,labels);
    host.dataset.discoverySource = 'landfill';
    let selected = 'landfill', phi = HOME.phi, theta = HOME.theta, scale = HOME.scale;
    let renderer = null, createGlobe = null, ready = false, loading = false, failed = false, disposed = false;
    let active = true, visible = false, suspended = false, frame = 0, last = 0, elapsed = 0;
    let width = 0, height = 0, ratio = 1, flight = null, drag = null, ignoreClick = false;
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
    // Alliance's original floating-tag projection, with a responsive aspect correction.
    function project(region) {
        const lat = radians(region.lat), lon = radians(region.lon), c = Math.cos(lat);
        const x = c*Math.cos(lon), y = Math.sin(lat), z = -c*Math.sin(lon);
        const x1 = x*Math.cos(phi)+z*Math.sin(phi), z1 = -x*Math.sin(phi)+z*Math.cos(phi);
        const y1 = y*Math.cos(theta)-z1*Math.sin(theta), z2 = y*Math.sin(theta)+z1*Math.cos(theta);
        if (z2 < .12) return null;
        return {x:width/2+x1*.4*height*scale,y:height/2-y1*.4*height*scale};
    }
    function updateLabels() {
        const candidates = pins.filter(pin => project(pin));
        const primary = candidates.find(pin => pin.id === selected) || candidates[0];
        const others = candidates.filter(pin => pin !== primary);
        const secondary = others.length ? others[Math.floor(elapsed/3)%others.length] : null;
        const shown = available() && ready && !flight && scale < 1.08 ? [primary,secondary].filter(Boolean) : [];
        for (const pin of pins) {
            const position = project(pin), index = shown.indexOf(pin), show = index >= 0 && !!position;
            pin.button.hidden = !show; pin.line.style.display = show ? '' : 'none';
            pin.button.classList.toggle('is-visible',show);
            pin.button.classList.toggle('is-selected',pin.id === selected);
            if (!show) continue;
            const x = position.x+(index === 0 ? 40 : -40), y = position.y+(index === 0 ? -58 : 40);
            pin.button.style.left = x+'px'; pin.button.style.top = y+'px';
            pin.button.style.transform = index === 0 ? '' : 'translateX(-100%)';
            pin.line.setAttribute('x1',position.x); pin.line.setAttribute('y1',position.y);
            pin.line.setAttribute('x2',x); pin.line.setAttribute('y2',y+12);
        }
    }
    function draw(still = false) {
        if (!renderer || failed || disposed) return;
        try {
            // COBE changes uniforms after drawing. A static frame needs the
            // second draw to make its requested state visible immediately.
            renderer.render(); if (still) renderer.render();
            updateLabels();
        } catch { fallback(); }
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
        if (!labelFocused) elapsed += delta;
        let complete = false;
        if (flight?.started) {
            flight.elapsed += delta;
            const progress = Math.min(1,flight.elapsed/flight.duration);
            animateFlight(progress); complete = progress >= 1;
        } else if (!drag && scale === 1 && !labelFocused) {
            // Alliance advances phi by .001 per frame at 60 Hz.
            phi += delta*.06;
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
        selected = source; host.dataset.discoverySource = source; updateLabels();
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
    function measure() {
        width = host.clientWidth; height = host.clientHeight;
        ratio = Math.min(window.devicePixelRatio || 1,2);
        return width > 0 && height > 0;
    }
    function resize() {
        if (disposed || failed || !measure()) return;
        if (!renderer) { if (createGlobe) build(); return; }
        renderer.devicePixelRatio = ratio; renderer.resize();
        if (available()) { draw(true); startFlight(); wake(); }
    }
    function fallback() {
        if (failed || disposed) return;
        failed = true; ready = false; finishFlight(false); stop();
        renderer?.destroy(); renderer = null; canvas.style.opacity = '0';
        host.dataset.renderState = 'fallback'; updateLabels();
    }
    function contextLost(event) { event.preventDefault(); fallback(); }
    function build() {
        if (!createGlobe || renderer || disposed || failed || !measure()) return;
        try {
            renderer = createGlobe(canvas,{
                devicePixelRatio:ratio,width:width*ratio,height:height*ratio,
                phi,theta,dark:1,diffuse:.4,mapSamples:20000,mapBrightness:3,
                baseColor:[.08,.14,.25],markerColor:[.1,.8,1],glowColor:[.1,.3,.8],
                markers:pins.map(pin => ({location:[pin.lat,pin.lon],size:.03})),
                onRender:state => {
                    state.phi = phi; state.theta = theta; state.scale = scale;
                    state.width = width*ratio; state.height = height*ratio;
                },
                onReady:() => {
                    if (disposed || failed) return;
                    ready = true; host.dataset.renderState = 'ready'; canvas.style.opacity = '1';
                    draw(true); startFlight(); wake();
                },
                onError:fallback
            });
            // The wrapper owns the loop so hidden scenes and reduced-motion
            // views do not keep the original library running in the background.
            renderer.toggle(false);
        } catch { fallback(); }
    }
    async function load() {
        if (loading || renderer || disposed || failed) return;
        loading = true; host.dataset.renderState = 'loading';
        try {
            createGlobe = (await import('./vendor/alliance/cobe.esm.js')).default;
            if (!disposed && !failed) build();
        } catch { fallback(); }
        finally { loading = false; }
    }
    function chooseSource(source) {
        if (disposed || !available()) return;
        const button = document.querySelector('[data-energy-site-select="'+source+'"]');
        // The globe labels disappear during the flight; retain focus on the
        // permanent source control before its click starts that transition.
        button?.focus({preventScroll:true});
        button?.click();
    }
    function labelClick(event) {
        const button = event.target.closest('[data-globe-source]');
        if (button && labels.contains(button)) chooseSource(button.dataset.globeSource);
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
        labels.removeEventListener('click',labelClick);
        renderer?.destroy(); renderer = null; canvas.remove(); lines.remove(); labels.remove();
        host.dataset.renderState = 'poster'; mounted.delete(host);
    }
    canvas.addEventListener('webglcontextlost',contextLost);
    canvas.addEventListener('pointerdown',pointerDown); canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerEnd); canvas.addEventListener('pointercancel',pointerEnd);
    canvas.addEventListener('lostpointercapture',pointerEnd); canvas.addEventListener('click',canvasClick);
    canvas.style.cursor = 'grab'; labels.addEventListener('click',labelClick);
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
