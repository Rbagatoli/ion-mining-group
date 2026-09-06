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
    var siteViews = window.ProtonSiteViews = {};
    groups.forEach(function (group) {
        var wraps = group.matches('.dg-wrap') ? [group] : Array.from(group.querySelectorAll('.dg-wrap'));
        var name = wraps[0].getAttribute('data-scene');
        var fuel = name.indexOf('landfill') === 0 ? 'landfill' : name.indexOf('pad') === 0 ? 'pad' : null;
        var scope = group.closest('.dg-fuel-pane') || group.parentElement, scale = scope.querySelector('.dg-scale-input');
        var diagrams = wraps.map(function (wrap) { return window[names[wrap.getAttribute('data-scene')]]; });
        var notes = wraps.map(function (wrap) { return wrap.querySelector('.dg-note')?.textContent || ''; });
        var scene = null, field = null, preview = null, loading = false, failed = false, xray = false, inspecting = false, current = '', calloutKey = '';
        var xrayStates = {asic:true};
        var refs = {}, tethers = {}, cards = {};
        var estimate = null, revision = 0, appliedRevision = -1, powered = true, resetPending = false;
        function state() {
            var value = scale ? Number(scale.value)/100 : 0;
            if (estimate && !estimate.valid) value = 0;
            return {view:fuel || (name === 'site' ? 'site' : value < .5 ? 'hosting' : 'asic'),
                progress:fuel ? value : 1,detail:wraps.length > 1 && value >= .5 ? 1 : 0};
        }
        function syncControls() {
            if (!scene) return;
            var s = state(), available = (!fuel || s.progress > .99) && (!estimate || estimate.valid && estimate.count > 0);
            refs.xray.disabled = !available; refs.xray.setAttribute('aria-pressed',String(xray));
            refs.xray.textContent = xray && available ? 'X-ray on' : 'X-ray off';
            refs.inspect.setAttribute('aria-pressed',String(inspecting));
            refs.inspect.textContent = inspecting ? (s.view === 'asic' ? 'Return to miner' : s.view === 'hosting' ? 'Return to container' : 'Return to site') :
                s.view === 'asic' ? 'Inside the miner' : 'Inside a container';
            refs.mode.textContent = inspecting ? (s.view === 'asic' ? 'Miner interior' : 'Container interior') : xray && available ? 'X-ray view' : 'Exterior view';
            refs.inspect.disabled = !!estimate && (!estimate.valid || !estimate.count);
            refs.power.hidden = !estimate || s.progress < .99;
            refs.power.disabled = !available;
            refs.power.textContent = powered ? 'Power down' : 'Energize mine';
            refs.power.setAttribute('aria-pressed',String(powered && available));
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
        function configuredLabels(diagram) {
            var gas = estimate.settings.source === 'gas', populated = estimate.count > 0;
            var labels = diagram.CALLOUTS.filter(function (co) {
                if (['tiein','cond','gen'].indexOf(co.id) >= 0) return populated && gas;
                if (['load','cont','xfmr'].indexOf(co.id) >= 0) return populated;
                return true;
            }).map(function (co) {
                var label = Object.assign({},co);
                if (co.id === 'load' || co.id === 'cont') label.desc = estimate.count.toLocaleString('en-US') + ' machines across ' + estimate.containers.toLocaleString('en-US') + ' containers · ' + estimate.settings.cooling + ' cooling';
                if (co.id === 'gen') label.desc = 'On-site generation for ' + (estimate.availableKW/1000).toLocaleString('en-US',{maximumFractionDigits:2}) + ' MW of available supply';
                if (co.id === 'xfmr') label.desc = 'Distributing ' + (estimate.siteKW/1000).toFixed(2) + ' MW including cooling and site overhead';
                return label;
            });
            if (labels.length !== diagram.CALLOUTS.length) labels.forEach(function (co,i) {
                var left = Math.ceil(labels.length/2); co.side = i < left ? 'l' : 'r'; co.y = 70+(i < left ? i : i-left)*120;
            });
            return {VB:diagram.VB,CALLOUTS:labels};
        }
        function update() {
            if (!scene) return;
            var s = state(), diagram = diagrams[s.detail];
            if (estimate && estimate.valid && appliedRevision !== revision) {
                scene.setConfig(Object.assign({},estimate,{siteType:fuel,siteDefinition:{main:diagrams[1],before:diagrams[0]}}),{preserveView:!!current});
                appliedRevision = revision;
            } else if (current !== s.view) {
                scene.setConfig({view:s.view,definition:{main:fuel ? diagrams[1] : diagram,before:fuel ? diagrams[0] : null}});
            }
            if (current !== s.view) {
                current = s.view;
                scene.setXray(!!xrayStates[s.view]);
            }
            scene.setProgress(s.progress,{animate:!!estimate && group.classList.contains('plant-ready')});
            scene.energize(!estimate || s.progress < 1 || powered && estimate.valid && estimate.count > 0);
            if (calloutKey !== s.view+':'+s.detail+':'+revision) {
                calloutKey = s.view+':'+s.detail+':'+revision;
                callouts(estimate && estimate.valid && s.detail ? configuredLabels(diagram) : diagram);
                refs.note.textContent = estimate && s.detail ? 'Your existing infrastructure stays in place. The added equipment reflects your inputs below.' +
                    (estimate.containers > 12 ? ' Twelve visual groups represent '+estimate.containers.toLocaleString('en-US')+' containers.' : '') : notes[s.detail];
                refs.note.hidden = !refs.note.textContent;
            }
            refs.cooling.textContent = fuel && s.progress < .5 ? 'Your existing infrastructure' : estimate ?
                estimate.settings.cooling === 'hydro' ? 'Hydro · closed water loop' : estimate.settings.cooling === 'air' ? 'Air · intake and exhaust' : 'Immersion · liquid tanks' :
                s.view === 'asic' ? 'Hydro ASIC · no miner fans' : 'Hydro · closed water loop';
            if (resetPending) { resetPending = false; scene.reset(); }
            syncControls();
        }
        if (fuel && document.getElementById('mb-builder')) siteViews[scope.getAttribute('data-fuel')] = {
            configure:function (value,options) {
                estimate = value; revision++;
                if (options && options.reset) { powered = true; resetPending = true; }
                update();
            }
        };
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
                    '<p class="plant-hint">Drag to rotate · pinch or scroll to zoom · select a label to explore</p>'+
                    '<button type="button" data-plant="power" aria-pressed="true" hidden>Power down</button>'+
                    '<button type="button" data-plant="inspect" aria-pressed="false">Inside a container</button>'+
                    '<button type="button" data-plant="xray" aria-pressed="false">X-ray off</button>'+
                    '<button type="button" data-plant="out" aria-label="Zoom out">−</button>'+
                    '<button type="button" data-plant="in" aria-label="Zoom in">+</button>'+
                    '<button type="button" data-plant="reset">Reset</button></div>'+
                    '<p class="plant-note" data-plant="note" hidden></p>';
                preview.querySelectorAll('[data-plant]').forEach(function (el) { refs[el.getAttribute('data-plant')] = el; }); group.appendChild(preview);
                if (window.ProtonField) { field = window.ProtonField.mount(refs.field); if (field) field.setActive(false); }
                scene = module.mountMineScene(refs.host,{
                    interactionSurface:refs.surface,onProject:project,onPart:highlight,onReady:ready,
                    onInspect:function (value) { inspecting = value; syncControls(); },
                    onXray:function (value) { xray = value; if (current) xrayStates[current] = value; syncControls(); },
                    onError:fallback,
                    onRestore:function () {
                        failed = false; preview.classList.add('plant-preview--loading'); preview.hidden = false;
                        update(); scene.setActive(true);
                    }
                });
                refs.inspect.addEventListener('click',function () {
                    // Reveal the configured mine in this same canvas before entering it.
                    if (!inspecting && fuel && state().progress < 1) {
                        var build = scope.querySelector('[data-mb-end="hi"]');
                        if (build) {
                            build.dispatchEvent(new Event('click', { bubbles: true }));
                        }
                        scale.value = '100'; scale.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                    scene.inspect(!inspecting);
                });
                refs.power.addEventListener('click',function () { powered = !powered; update(); });
                refs.xray.addEventListener('click',function () { scene.setXray(!xray); });
                refs.in.addEventListener('click',function () { scene.zoom(.8); }); refs.out.addEventListener('click',function () { scene.zoom(1.25); });
                refs.reset.addEventListener('click',function () { scene.reset(); highlight(null); });
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
