/* Upgrade the original diagram compositions in place. The original scene data
   owns equipment locations, callout wording and camera framing. */
(function () {
    'use strict';
    var script = document.currentScript, moduleURL = script && script.getAttribute('data-module-src');
    if (!moduleURL) return;
    var modulePromise;
    var names = {site:'SiteDiagram',hosting:'ContainerDiagram',asic:'AsicDiagram',
        landfillnow:'LandfillNowDiagram',landfillion:'LandfillIonDiagram',padnow:'PadNowDiagram',padion:'PadIonDiagram'};
    var groups = Array.from(document.querySelectorAll('.dg-views'));
    document.querySelectorAll('.dg-wrap[data-scene="site"]').forEach(function (wrap) { groups.push(wrap); });
    var svgNS = 'http://www.w3.org/2000/svg';
    groups.forEach(function (group) {
        var wraps = group.matches('.dg-wrap') ? [group] : Array.from(group.querySelectorAll('.dg-wrap'));
        var name = wraps[0].getAttribute('data-scene');
        var fuel = name.indexOf('landfill') === 0 ? 'landfill' : name.indexOf('pad') === 0 ? 'pad' : null;
        var scope = group.closest('.dg-fuel-pane') || group.parentElement, scale = scope.querySelector('.dg-scale-input');
        var diagrams = wraps.map(function (wrap) { return window[names[wrap.getAttribute('data-scene')]]; });
        var notes = wraps.map(function (wrap) { return wrap.querySelector('.dg-note')?.textContent || ''; });
        var scene = null, field = null, preview = null, loading = false, failed = false, xray = false, rotating = true, current = '', calloutKey = '';
        var xrayStates = {asic:true};
        var refs = {}, tethers = {}, cards = {};
        function state() {
            var value = scale ? Number(scale.value)/100 : 0;
            return {view:fuel || (name === 'site' ? 'site' : value < .5 ? 'hosting' : 'asic'),
                progress:fuel ? value : 1,detail:wraps.length > 1 && value >= .5 ? 1 : 0};
        }
        function syncControls() {
            if (!scene) return;
            var s = state(), available = !fuel || s.progress > .99;
            refs.xray.disabled = !available; refs.xray.setAttribute('aria-pressed',String(xray));
            refs.xray.textContent = xray && available ? 'X-ray on' : 'X-ray off';
            refs.mode.textContent = xray && available ? 'X-ray view' : 'Exterior view';
            refs.rotate.setAttribute('aria-pressed',String(rotating)); refs.rotate.textContent = rotating ? 'Auto-rotate on' : 'Auto-rotate off';
        }
        function highlight(id) {
            Object.keys(cards).forEach(function (key) {
                cards[key].classList.toggle('is-hot',key === id); cards[key].setAttribute('aria-pressed',String(key === id));
                tethers[key].line.classList.toggle('is-hot',key === id);
            });
        }
        function project(points) {
            points.forEach(function (p) {
                var tether = tethers[p.id]; if (!tether) return;
                var visible = p.visible && Number.isFinite(p.x) && Number.isFinite(p.y);
                tether.line.setAttribute('visibility',visible ? 'visible' : 'hidden'); tether.dot.setAttribute('visibility',visible ? 'visible' : 'hidden');
                if (!visible) return;
                var x = Math.max(.008,Math.min(.992,p.x))*1000, y = Math.max(.018,Math.min(.982,p.y))*1000;
                tether.line.setAttribute('x2',x.toFixed(2)); tether.line.setAttribute('y2',y.toFixed(2));
                tether.dot.setAttribute('cx',x.toFixed(2)); tether.dot.setAttribute('cy',y.toFixed(2));
            });
        }
        function callouts(diagram) {
            refs.callouts.textContent = ''; refs.leaders.textContent = ''; tethers = {}; cards = {};
            diagram.CALLOUTS.forEach(function (co) {
                var button = document.createElement('button'); button.type = 'button'; button.className = 'plant-callout plant-callout--'+co.side;
                button.style.top = (co.y/diagram.VB.h*100)+'%'; button.setAttribute('aria-pressed','false');
                var title = document.createElement('span'), desc = document.createElement('span');
                title.className = 'plant-c-title'; title.textContent = co.title; desc.className = 'plant-c-desc'; desc.textContent = co.desc;
                button.appendChild(title); button.appendChild(desc); refs.callouts.appendChild(button); cards[co.id] = button;
                var line = document.createElementNS(svgNS,'line'), dot = document.createElementNS(svgNS,'circle');
                line.classList.add('plant-lead'); line.setAttribute('x1',co.side === 'l' ? '195.3' : '804.7');
                line.setAttribute('y1',(co.y/diagram.VB.h*1000).toFixed(2)); dot.classList.add('plant-dot'); dot.setAttribute('r','2');
                line.setAttribute('visibility','hidden'); dot.setAttribute('visibility','hidden');
                refs.leaders.appendChild(line); refs.leaders.appendChild(dot); tethers[co.id] = {line:line,dot:dot};
                button.addEventListener('pointerenter',function () { scene.highlightPart(co.id); });
                button.addEventListener('pointerleave',function () { scene.highlightPart(null); });
                button.addEventListener('focus',function () { scene.highlightPart(co.id); });
                button.addEventListener('blur',function () { scene.highlightPart(null); });
                button.addEventListener('click',function () { scene.focusPart(co.id); });
            });
            scene.setAnnotations(diagram.CALLOUTS);
        }
        function update() {
            if (!scene) return;
            var s = state(), diagram = diagrams[s.detail];
            if (current !== s.view) {
                current = s.view; scene.setConfig({view:s.view,definition:{main:fuel ? diagrams[1] : diagram,before:fuel ? diagrams[0] : null}});
                scene.setXray(!!xrayStates[s.view]);
            }
            scene.setProgress(s.progress); scene.energize(true);
            if (calloutKey !== s.view+':'+s.detail) {
                calloutKey = s.view+':'+s.detail; callouts(diagram); refs.note.textContent = notes[s.detail]; refs.note.hidden = !notes[s.detail];
            }
            refs.cooling.textContent = fuel && s.progress < .5 ? 'Your existing infrastructure' : s.view === 'asic' ? 'Hydro ASIC · no miner fans' : 'Hydro · closed water loop';
            syncControls();
        }
        function sourceFields(active) {
            if (!window.ProtonField) return;
            wraps.forEach(function (wrap) {
                var canvas = wrap.querySelector('.anim-field--dg');
                var original = canvas && window.ProtonField.mount(canvas);
                if (original) original.setActive(active);
            });
        }
        function fallback() {
            failed = true; group.classList.remove('plant-ready'); if (preview) preview.hidden = true; if (scene) scene.setActive(false);
            if (field) field.setActive(false);
            sourceFields(true);
        }
        function ready() {
            preview.classList.remove('plant-preview--loading');
            group.classList.add('plant-ready');
            sourceFields(false);
            if (field) field.setActive(true);
        }
        async function load() {
            if (loading || scene || failed) return; loading = true;
            try {
                if (diagrams.some(function (d) { return !d; })) throw new Error('Missing original diagram');
                if (!modulePromise) modulePromise = import(moduleURL); var module = await modulePromise;
                // Keep the working SVG in front while the new canvas gets a real
                // layout box and paints its first frame. display:none cannot be measured.
                preview = document.createElement('div'); preview.className = 'plant-preview plant-preview--loading';
                preview.innerHTML = '<div class="plant-drawing" data-plant="surface">'+
                    '<div class="plant-stage" data-plant="stage">'+
                    '<canvas class="anim-field anim-field--plant" data-plant="field" data-w="1280" data-h="470" aria-hidden="true"></canvas>'+
                    '<div class="plant-canvas" data-plant="host"></div>'+
                    '<svg class="plant-leaders" data-plant="leaders" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg>'+
                    '<div class="plant-caption"><span data-plant="cooling"></span><span data-plant="mode"></span></div></div>'+
                    '<div class="plant-callouts" data-plant="callouts" aria-label="Parts of the site"></div></div>'+
                    '<div class="plant-toolbar" aria-label="3D view controls">'+
                    '<p class="plant-hint">Scroll to zoom · hover to highlight · click a label to explore</p>'+
                    '<button type="button" data-plant="xray" aria-pressed="false">X-ray off</button>'+
                    '<button type="button" data-plant="rotate" aria-pressed="true">Auto-rotate on</button>'+
                    '<button type="button" data-plant="out" aria-label="Zoom out">−</button>'+
                    '<button type="button" data-plant="in" aria-label="Zoom in">+</button>'+
                    '<button type="button" data-plant="reset">Reset</button></div>'+
                    '<button type="button" class="plant-touch" data-plant="touch" aria-pressed="false">Enable touch rotation &amp; pinch zoom</button>'+
                    '<p class="plant-note" data-plant="note" hidden></p>';
                preview.querySelectorAll('[data-plant]').forEach(function (el) { refs[el.getAttribute('data-plant')] = el; }); group.appendChild(preview);
                if (window.ProtonField) { field = window.ProtonField.mount(refs.field); if (field) field.setActive(false); }
                scene = module.mountMineScene(refs.host,{
                    interactionSurface:refs.surface,onProject:project,onPart:highlight,onReady:ready,
                    onXray:function (value) { xray = value; if (current) xrayStates[current] = value; syncControls(); },
                    onRotate:function (value) { rotating = value; syncControls(); },onError:fallback,
                    onRestore:function () {
                        failed = false; preview.classList.add('plant-preview--loading'); preview.hidden = false;
                        update(); scene.setActive(true);
                    }
                });
                refs.xray.addEventListener('click',function () { scene.setXray(!xray); });
                refs.rotate.addEventListener('click',function () { scene.setAutoRotate(!rotating); });
                refs.in.addEventListener('click',function () { scene.zoom(.8); }); refs.out.addEventListener('click',function () { scene.zoom(1.25); });
                refs.reset.addEventListener('click',function () { scene.reset(); highlight(null); });
                refs.touch.addEventListener('click',function () {
                    var enabled = refs.touch.getAttribute('aria-pressed') !== 'true'; refs.touch.setAttribute('aria-pressed',String(enabled));
                    refs.touch.textContent = enabled ? 'Allow page scrolling' : 'Enable touch rotation & pinch zoom'; scene.setTouchControl(enabled);
                });
                if (scale) { scale.addEventListener('input',update); scale.addEventListener('change',update); }
                update(); scene.setActive(true);
            } catch (error) {
                if (scene) scene.dispose(); scene = null;
                if (field) field.dispose(); field = null;
                fallback();
            }
            loading = false;
        }
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) { observer.disconnect(); load(); }
            },{rootMargin:'240px'}); observer.observe(group);
        } else load();
    });
})();
