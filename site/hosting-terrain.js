/* Region exploration changes the view only. Choosing hardware remains an explicit link. */
(function () {
    'use strict';
    var root = document.getElementById('hosting-terrain'), script = document.currentScript;
    if (!root || !script || !window.Facilities) return;
    var moduleURL = script.getAttribute('data-module-src'), coreURL = script.getAttribute('data-core-src');
    var F = window.Facilities, sites = F.all();
    if (!sites.length) return;
    var refs = {}, buttons = Array.from(root.querySelectorAll('[data-region]'));
    root.querySelectorAll('[data-ht]').forEach(function (el) { refs[el.getAttribute('data-ht')] = el; });
    var callouts = Array.from(root.querySelectorAll('[data-part]')), lines = {}, dots = {};
    var selected = F.byId(F.idFromQuery(location.search)) || sites[0];
    var scene = null, terrain = null, loading = false, failed = false, lost = false, inspecting = false, xray = false, focused = null, observer;
    var field = window.ProtonField && window.ProtonField.mount(refs.field);
    var svgNS = 'http://www.w3.org/2000/svg';

    function controls(ready) {
        refs.toolbar.querySelectorAll('button').forEach(function (button) { button.disabled = !ready; });
        callouts.forEach(function (button) { button.disabled = !ready; });
    }
    function sync() {
        refs.inspect.textContent = inspecting ? 'Return to landscape' : 'Inside a container';
        refs.inspect.setAttribute('aria-pressed',String(inspecting));
        refs.xray.textContent = xray ? 'X-ray on' : 'X-ray off';
        refs.xray.setAttribute('aria-pressed',String(xray));
    }
    function highlight(id) {
        if (!id) focused = null;
        callouts.forEach(function (button) {
            var part = button.getAttribute('data-part');
            button.classList.toggle('is-hot',part === id);
            button.setAttribute('aria-pressed',String(part === focused));
            if (lines[part]) lines[part].classList.toggle('is-hot',part === id);
        });
    }
    function project(points) {
        points.forEach(function (p) {
            var line = lines[p.id], dot = dots[p.id]; if (!line) return;
            var visible = p.visible && Number.isFinite(p.x) && Number.isFinite(p.y);
            line.setAttribute('visibility',visible ? 'visible' : 'hidden'); dot.setAttribute('visibility',visible ? 'visible' : 'hidden');
            if (!visible) return;
            var x = Math.max(.01,Math.min(.99,p.x))*1000, y = Math.max(.02,Math.min(.98,p.y))*1000;
            line.setAttribute('x2',x.toFixed(2)); line.setAttribute('y2',y.toFixed(2)); dot.setAttribute('cx',x.toFixed(2)); dot.setAttribute('cy',y.toFixed(2));
        });
    }
    function alignRegion() {
        var button = buttons.find(function (item) { return item.getAttribute('data-region') === selected.id; });
        if (button && refs.regions.scrollWidth > refs.regions.clientWidth) {
            refs.regions.scrollLeft = button.offsetLeft-(refs.regions.clientWidth-button.offsetWidth)/2;
        }
    }
    function details() {
        buttons.forEach(function (button) { button.setAttribute('aria-pressed',String(button.getAttribute('data-region') === selected.id)); });
        refs.region.textContent = selected.region; refs.name.textContent = selected.name; refs.fuel.textContent = selected.fuel;
        refs.capacity.textContent = F.capacityLabel(selected); refs.rate.textContent = F.powerLabel(selected); refs.status.textContent = selected.status;
        refs.cta.textContent = F.acceptsMachines(selected) ? 'Start mining here' : 'Join this waitlist';
        refs.cta.setAttribute('href','./hardware.html?site='+encodeURIComponent(selected.id));
        refs.landscape.textContent = terrain && terrain.REGIONS[selected.id] ? terrain.REGIONS[selected.id].label : 'Illustrative regional terrain';
        alignRegion();
    }
    function fallback(message) {
        failed = true; root.classList.remove('ht-ready'); refs.fallback.hidden = false;
        refs.message.textContent = message || 'The 3D view is unavailable. You can still compare regions and choose a site below.';
        controls(false); if (scene) scene.setActive(false);
    }
    function ready() {
        failed = false; root.classList.add('ht-ready'); refs.fallback.hidden = true; controls(true);
    }
    function updateScene() {
        if (!scene) return;
        if (!terrain.REGIONS[selected.id]) { fallback('A regional model is not available for this site. Its details are shown below.'); return; }
        var inside = inspecting, part = focused;
        scene.setConfig({valid:true,sceneKey:'hosting:'+selected.id,region:selected.id},{preserveView:true});
        scene.setAnnotations(callouts.map(function (button) { return {id:button.getAttribute('data-part')}; }));
        if (inside) scene.inspect(true); else if (part) { focused = part; scene.focusPart(part,false); }
        var canvas = refs.canvas.querySelector('canvas');
        if (canvas) canvas.setAttribute('aria-label',selected.name+' illustrative 3D landscape. Drag to rotate, pinch or scroll to zoom. Arrow keys rotate, plus and minus zoom, X toggles X-ray, and Escape resets.');
        if (failed && !lost) { scene.setActive(true); ready(); }
    }
    function select(id) {
        var next = F.byId(id); if (!next || next.id === selected.id) return;
        selected = next; details();
        try { updateScene(); } catch (error) { fallback(); }
    }
    buttons.forEach(function (button,index) {
        button.disabled = false;
        button.addEventListener('click',function () { select(button.getAttribute('data-region')); });
        button.addEventListener('keydown',function (event) {
            var next;
            if (event.key === 'ArrowRight') next = (index+1)%buttons.length;
            else if (event.key === 'ArrowLeft') next = (index+buttons.length-1)%buttons.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = buttons.length-1;
            else return;
            event.preventDefault(); buttons[next].focus(); select(buttons[next].getAttribute('data-region'));
        });
    });
    callouts.forEach(function (button) {
        var id = button.getAttribute('data-part'), line = document.createElementNS(svgNS,'line'), dot = document.createElementNS(svgNS,'circle');
        line.setAttribute('x1',button.getAttribute('data-side') === 'l' ? '192' : '808');
        line.setAttribute('y1',String(Number(button.getAttribute('data-y'))*10)); dot.setAttribute('r','2.4');
        line.setAttribute('visibility','hidden'); dot.setAttribute('visibility','hidden');
        refs.leaders.appendChild(line); refs.leaders.appendChild(dot); lines[id] = line; dots[id] = dot;
        button.addEventListener('pointerenter',function () { if (scene && !failed) scene.highlightPart(id); });
        button.addEventListener('pointerleave',function () { if (scene && !failed) scene.highlightPart(null); });
        button.addEventListener('focus',function () { if (scene && !failed) scene.highlightPart(id); });
        button.addEventListener('blur',function () { if (scene && !failed) scene.highlightPart(null); });
        button.addEventListener('click',function () { if (scene && !failed) { focused = focused === id ? null : id; scene.focusPart(id); } });
    });
    refs.inspect.addEventListener('click',function () { if (scene && !failed) { focused = null; scene.inspect(!inspecting); } });
    refs.xray.addEventListener('click',function () { if (scene && !failed) scene.setXray(!xray); });
    refs.in.addEventListener('click',function () { if (scene && !failed) scene.zoom(.8); });
    refs.out.addEventListener('click',function () { if (scene && !failed) scene.zoom(1.25); });
    refs.reset.addEventListener('click',function () { if (scene && !failed) { focused = null; scene.reset(); } });
    async function load() {
        if (loading || scene) return; loading = true;
        refs.message.textContent = 'Loading the regional landscape…';
        try {
            var modules = await Promise.all([import(moduleURL),import(coreURL)]); terrain = modules[0];
            scene = modules[1].mountMineScene(refs.canvas,{
                buildScene:function (config) { return terrain.buildHostingTerrain(config,modules[1].buildYard); },
                interactionSurface:refs.drawing,onProject:project,onPart:highlight,onReady:ready,
                onInspect:function (value) { inspecting = value; if (value) focused = null; sync(); },
                onXray:function (value) { xray = value; sync(); },onError:function () { lost = true; fallback(); },
                onRestore:function () { lost = false; failed = false; scene.setActive(true); }
            });
            details(); updateScene(); scene.energize(true); scene.setActive(true);
        } catch (error) {
            if (scene) { scene.dispose(); scene = null; }
            fallback();
        }
        loading = false;
    }
    details(); controls(false);
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) { observer.disconnect(); load(); }
        },{rootMargin:'240px'}); observer.observe(root);
    } else load();
    window.addEventListener('resize',alignRegion);
    window.addEventListener('pagehide',function (event) {
        if (event.persisted) return;
        if (observer) observer.disconnect(); if (scene) scene.dispose(); if (field) field.dispose();
    });
})();
