/* One renderer, three illustrative miners, with the shared platinum scene materials. */
(function () {
    'use strict';
    const script = document.currentScript, moduleURL = script && script.getAttribute('data-module-src');
    const figure = document.getElementById('brMiner'), host = document.getElementById('brMinerCanvas');
    if (!figure || !host || !moduleURL) return;
    const controls = figure.querySelector('.br-scene-controls'), status = figure.querySelector('.br-scene-status');
    const inside = figure.querySelector('[data-br-view="inside"]'), xray = figure.querySelector('[data-br-view="xray"]');
    const play = figure.querySelector('[data-br-view="play"]'), media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const variants = [
        {id:'hydro',label:'Hydro-cooled · compact liquid-cooled chassis'},
        {id:'air-tower',label:'Air-cooled tower · stacked fans & side supply'},
        {id:'air-compact',label:'Air-cooled compact · inline fans & top supply'}
    ];
    let scene, current = 0, rendered = 0, inspecting = false, transparent = false, loading = false, ready = false;
    let playing = !media.matches, visible = false, suspended = false, disposed = false;
    let cycleTimer = 0, swapTimer = 0, revealTimer = 0;
    function clearCycle() { clearTimeout(cycleTimer); cycleTimer = 0; }
    function clearTransition() {
        clearTimeout(swapTimer); clearTimeout(revealTimer); swapTimer = revealTimer = 0;
        current = rendered;
        figure.classList.remove('br-scene-changing');
    }
    function sync() {
        inside.setAttribute('aria-pressed', String(inspecting)); inside.textContent = inspecting ? 'Close miner' : 'Inside miner';
        xray.setAttribute('aria-pressed', String(transparent)); xray.textContent = transparent ? 'X-ray on' : 'X-ray off';
        play.disabled = media.matches;
        play.textContent = media.matches ? 'Motion off' : playing ? 'Pause animation' : 'Play animation';
        play.title = media.matches ? 'Your reduced-motion preference is enabled. Select any design below.' : 'Rotate the miner and cycle through the three designs';
        status.setAttribute('aria-live', playing ? 'off' : 'polite');
        if (ready) status.textContent = variants[current].label;
        controls.querySelectorAll('[data-br-variant]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.brVariant === variants[current].id));
        });
    }
    function updateMotion() {
        clearCycle();
        const animate = playing && !media.matches && visible && !document.hidden && !suspended && ready;
        if (scene) scene.setMotion(animate);
        if (animate) cycleTimer = setTimeout(() => select((current+1)%variants.length, false), 10000);
        sync();
    }
    function pause() { playing = false; clearTransition(); updateMotion(); }
    function select(index, manual = true) {
        if (!scene || !ready || disposed) return;
        if (manual) pause();
        clearCycle(); clearTransition();
        current = index; sync();
        const apply = () => {
            swapTimer = 0;
            if (disposed) return;
            scene.setConfig({view:'asic',sceneKey:variants[current].id});
            rendered = current;
            scene.setXray(false); sync();
            if (media.matches) figure.classList.remove('br-scene-changing');
            else revealTimer = setTimeout(() => { revealTimer = 0; figure.classList.remove('br-scene-changing'); }, 40);
            updateMotion();
        };
        if (media.matches) apply();
        else { figure.classList.add('br-scene-changing'); swapTimer = setTimeout(apply, 180); }
    }
    function fallback() {
        ready = false; clearCycle(); clearTransition();
        figure.classList.remove('br-scene-ready'); controls.hidden = true; host.inert = true;
        status.textContent = 'Hydro design preview · interactive lineup unavailable';
        if (scene) scene.setActive(false);
    }
    async function load() {
        if (scene || loading || disposed) return;
        loading = true;
        try {
            const module = await import(moduleURL);
            if (disposed) return;
            scene = module.mountMineScene(host, {
                buildScene(config) {
                    const yard = module.buildMinerVariant(config.sceneKey || 'hydro');
                    yard.layout = null; yard.fullOrbit = true; yard.frameHeight = .84;
                    return yard;
                },
                onReady() { ready = true; host.inert = false; figure.classList.add('br-scene-ready'); controls.hidden = false; updateMotion(); },
                onInspect(value) { inspecting = value; sync(); },
                onXray(value) { transparent = value; sync(); },
                onError: fallback,
                onRestore() { scene.setActive(!suspended); }
            });
            scene.setConfig({view:'asic',sceneKey:'hydro'}); scene.setXray(false); scene.setActive(!suspended);
            updateMotion();
        } catch (error) {
            if (scene) scene.dispose(); scene = null; fallback();
        } finally { loading = false; }
    }
    controls.addEventListener('click', function (event) {
        const variant = event.target.closest('[data-br-variant]');
        if (variant) { select(variants.findIndex(item => item.id === variant.dataset.brVariant)); return; }
        const button = event.target.closest('[data-br-view]'); if (!button || !scene) return;
        if (button.dataset.brView === 'play') {
            if (!media.matches) { playing = !playing; if (playing && inspecting) scene.inspect(false); updateMotion(); }
            return;
        }
        pause();
        switch (button.dataset.brView) {
            case 'inside': scene.inspect(!inspecting); break;
            case 'xray': scene.setXray(!transparent); break;
            case 'in': scene.zoom(.8); break;
            case 'out': scene.zoom(1.25); break;
            case 'reset': scene.reset(); break;
        }
    });
    host.addEventListener('pointerdown', pause, true); host.addEventListener('keydown', pause, true);
    host.addEventListener('wheel', pause, {passive:true,capture:true});
    controls.addEventListener('focusin', event => { if (!event.target.matches('[data-br-view="play"]')) pause(); });
    const lazy = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { lazy.disconnect(); load(); }
    }, {rootMargin:'200px'}); lazy.observe(figure);
    const visibility = new IntersectionObserver(entries => {
        visible = entries[entries.length-1].isIntersecting; updateMotion();
    }); visibility.observe(host);
    document.addEventListener('visibilitychange', updateMotion);
    media.addEventListener('change', () => { playing = false; if (media.matches && swapTimer) select(current); updateMotion(); });
    window.addEventListener('pagehide', event => {
        suspended = true; clearCycle(); clearTransition();
        if (scene) scene.setActive(false);
        if (!event.persisted) { disposed = true; lazy.disconnect(); visibility.disconnect(); if (scene) scene.dispose(); }
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted && scene) { suspended = false; scene.setActive(true); updateMotion(); }
    });
})();
