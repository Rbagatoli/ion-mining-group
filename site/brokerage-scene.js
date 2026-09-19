/* Product browsing and 3D share the selected named chassis; prices never live here. */
(function(){
    'use strict';
    const script=document.currentScript,stageURL=script?.getAttribute('data-module-src'),modelsURL=script?.getAttribute('data-model-src');
    const figure=document.getElementById('brMiner'),host=document.getElementById('brMinerCanvas');if(!figure||!host||!stageURL||!modelsURL)return;
    const controls=figure.querySelector('.br-scene-controls'),status=figure.querySelector('.br-scene-status'),poster=figure.querySelector('.br-scene-poster');
    let scene=null,loading=false,disposed=false,suspended=false;
    let selection=window.BrokerageCatalogSelection||{modelKey:'s21-pro',variant:{name:'Antminer S21 Pro'}};
    function fallback(){figure.classList.remove('br-scene-ready');controls.hidden=true;host.inert=true;status.textContent='Exterior preview';}
    function modelVariant(){return {...selection.variant,previewName:selection.family?.name||selection.variant?.name||selection.modelKey};}
    function preview(){if(!/^[a-z0-9-]+$/.test(selection.modelKey))return;poster.src='./miner-models/'+selection.modelKey+'.png'+new URL(script.src,document.baseURI).search;poster.alt=modelVariant().previewName+' · representative family exterior';}
    function change(event){selection=event.detail||selection;preview();if(scene){try{scene.setModel(selection.modelKey,modelVariant());}catch(_){fallback();}}}
    async function load(){
        if(scene||loading||disposed)return;loading=true;
        try{
            const [stage,models]=await Promise.all([import(stageURL),import(modelsURL)]);if(disposed)return;
            scene=stage.mountMinerStage(host,{buildMiner:models.buildMiner,disposeMiner:models.disposeMiner,animateMiner:models.animateMiner,
                onReady(){figure.classList.add('br-scene-ready');controls.hidden=false;host.inert=false;status.textContent=matchMedia('(pointer: coarse)').matches?'Swipe sideways to rotate · Swipe up to scroll':'Drag to rotate';},onError:fallback});
            scene.setModel(selection.modelKey,modelVariant());scene.setActive(!suspended);
        }catch(_){scene?.dispose();scene=null;fallback();}finally{loading=false;}
    }
    controls.addEventListener('click',event=>{const action=event.target.closest('[data-br-view]')?.dataset.brView;if(!action||!scene)return;
        if(action==='in')scene.zoom(.84);if(action==='out')scene.zoom(1.2);if(action==='reset')scene.reset();});
    window.addEventListener('brokerage:model',change);
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'300px'});observer.observe(figure);
    window.addEventListener('pagehide',event=>{suspended=true;scene?.setActive(false);if(!event.persisted){disposed=true;observer.disconnect();scene?.dispose();}});
    window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;scene?.setActive(true);}});
    preview();
})();
