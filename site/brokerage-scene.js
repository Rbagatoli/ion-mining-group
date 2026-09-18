/* The same ASIC geometry, platinum materials, lighting and navigation as Hosting. */
(function () {
    'use strict';
    const script = document.currentScript, moduleURL = script && script.getAttribute('data-module-src');
    const figure = document.getElementById('brMiner'), host = document.getElementById('brMinerCanvas');
    if (!figure || !host || !moduleURL) return;
    const controls = figure.querySelector('.br-scene-controls'), status = figure.querySelector('.br-scene-status');
    const inside = figure.querySelector('[data-br-view="inside"]'), xray = figure.querySelector('[data-br-view="xray"]');
    let scene, inspecting = false, transparent = false, loading = false;
    function sync() {
        inside.setAttribute('aria-pressed', String(inspecting)); inside.textContent = inspecting ? 'Close miner' : 'Inside miner';
        xray.setAttribute('aria-pressed', String(transparent)); xray.textContent = transparent ? 'X-ray on' : 'X-ray off';
    }
    function fallback() {
        figure.classList.remove('br-scene-ready'); controls.hidden = true; host.inert = true;
        status.textContent = 'Miner preview · interactive view unavailable';
        if (scene) scene.setActive(false);
    }
    async function load() {
        if (scene || loading) return;
        loading = true;
        try {
            const module = await import(moduleURL);
            scene = module.mountMineScene(host, {
                buildScene() {
                    const yard = module.buildPresentation('asic', { main: window.AsicDiagram });
                    // The compact product view has no callout columns. Fit its actual
                    // geometry while keeping the shared model and rendering untouched.
                    yard.layout = null; yard.fullOrbit = true; yard.frameHeight = .84;
                    return yard;
                },
                onReady() { host.inert = false; figure.classList.add('br-scene-ready'); controls.hidden = false; status.textContent = 'Hydro ASIC · illustrative model'; },
                onInspect(value) { inspecting = value; sync(); },
                onXray(value) { transparent = value; sync(); },
                onError: fallback,
                onRestore() { scene.setActive(true); }
            });
            scene.setConfig({ view: 'asic' }); scene.setXray(true); scene.setActive(true);
        } catch (error) {
            if (scene) scene.dispose(); scene = null; fallback();
        } finally { loading = false; }
    }
    controls.addEventListener('click', function (event) {
        const button = event.target.closest('[data-br-view]'); if (!button || !scene) return;
        switch (button.dataset.brView) {
            case 'inside': scene.inspect(!inspecting); break;
            case 'xray': scene.setXray(!transparent); break;
            case 'in': scene.zoom(.8); break;
            case 'out': scene.zoom(1.25); break;
            case 'reset': scene.reset(); break;
        }
    });
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
        }, { rootMargin: '200px' }); observer.observe(figure);
    } else load();
    window.addEventListener('pagehide', event => { if (scene) event.persisted ? scene.setActive(false) : scene.dispose(); });
    window.addEventListener('pageshow', event => { if (event.persisted && scene) scene.setActive(true); });
})();
