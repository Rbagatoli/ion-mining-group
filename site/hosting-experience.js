/* Page state stays independent of saved orders. All 3D modules load on approach. */
(function(){
    'use strict';
    var script=document.currentScript,root=document.getElementById('hosting-experience');
    if(!root||!script)return;
    var urls={};['stage','globe','world'].forEach(function(key){urls[key]=script.getAttribute('data-'+key+'-src');});
    var modules={},observers=[],disposables=[],gone=false;
    function get(key){if(!modules[key])modules[key]=import(urls[key]);return modules[key];}
    function refs(el,attr){var result={};el.querySelectorAll('['+attr+']').forEach(function(n){result[n.getAttribute(attr)]=n;});return result;}
    function approach(el,load){
        if('IntersectionObserver'in window){var observer=new IntersectionObserver(function(entries){if(entries.some(function(e){return e.isIntersecting;})){observer.disconnect();load();}},{rootMargin:'200px'});observer.observe(el);observers.push(observer);}
        else load();
    }
    function align(rail,button){if(button&&rail.scrollWidth>rail.clientWidth)rail.scrollLeft=button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2;}
    var globe=document.getElementById('hosting-globe'),F=window.Facilities;
    if(globe&&F){
        var g=refs(globe,'data-globe'),groups=F.groups(),selected=F.byId(F.idFromQuery(location.search))||groups[0].sites[0],choices={};
        var globeScene=null,globeFailed=false,regionButtons=Array.from(globe.querySelectorAll('[data-region]')),siteButtons=Array.from(globe.querySelectorAll('[data-hosting-site]'));
        function regionDetails(){
            var group=F.groupFor(selected);choices[group.id]=selected.id;
            regionButtons.forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-region')===group.id));});
            g.region.textContent=selected.region;g.name.textContent=selected.name;g.fuel.textContent=selected.fuel;
            g.capacity.textContent=F.capacityLabel(selected);g.rate.textContent=F.powerLabel(selected);g.status.textContent=selected.status;
            g.rate.setAttribute('data-unpriced',String(typeof selected.powerCents!=='number'));
            g['capacity-title'].textContent=F.capacityTitle(selected);
            g.plan.textContent=F.isComingSoon(selected)?'Exploring a future site here.':'Operating site · Fully occupied';
            g.plan.hidden=!F.isComingSoon(selected);
            g.location.value=group.id;g.sites.hidden=group.sites.length<2;
            siteButtons.forEach(function(b){var site=F.byId(b.getAttribute('data-hosting-site'));b.hidden=F.groupFor(site).id!==group.id;b.setAttribute('aria-pressed',String(site.id===selected.id));});
            g.status.setAttribute('data-available',String(F.acceptsMachines(selected)));
            g.status.setAttribute('data-status',selected.statusKind);
            g.cta.textContent=F.actionLabel(selected);g.cta.setAttribute('href','./hardware.html?site='+encodeURIComponent(selected.id));
            align(g.regions,regionButtons.find(function(b){return b.getAttribute('data-region')===group.id;}));
        }
        function chooseGroup(id){var group=groups.find(function(item){return item.id===id;});if(!group)return false;selected=F.byId(choices[id])||group.sites[0];regionDetails();return true;}
        function selectRegion(id){if(chooseGroup(id)&&globeScene&&!globeFailed)globeScene.select(id);}
        siteButtons.forEach(function(button){button.disabled=false;button.addEventListener('click',function(){var next=F.byId(button.getAttribute('data-hosting-site'));if(!next)return;selected=next;regionDetails();});});
        function globeControls(value){['in','out','reset'].forEach(function(key){g[key].disabled=!value;});}
        function globeFailure(){globeFailed=true;globe.classList.remove('hx-ready');g.fallback.hidden=false;g.message.textContent='The globe is unavailable. Choose a region above to compare its details below.';globeControls(false);}
        regionButtons.forEach(function(button,i){button.disabled=false;button.addEventListener('click',function(){selectRegion(button.getAttribute('data-region'));});
            button.addEventListener('keydown',function(event){var next;if(event.key==='ArrowRight')next=(i+1)%regionButtons.length;else if(event.key==='ArrowLeft')next=(i+regionButtons.length-1)%regionButtons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=regionButtons.length-1;else return;event.preventDefault();regionButtons[next].focus();selectRegion(regionButtons[next].getAttribute('data-region'));});
        });
        g.location.disabled=false;g.location.addEventListener('change',function(){selectRegion(g.location.value);});
        g.in.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(.8);});g.out.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(1.25);});g.reset.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.reset();});
        regionDetails();globeControls(false);
        approach(globe,async function(){
            g.message.textContent='Loading the hosting globe…';
            try{
                var m=await Promise.all([get('globe'),get('world'),get('stage')]);if(gone)return;
                var pending=selected.id;
                globeScene=m[0].mountGlobe(g.canvas,m[1].LAND,m[2],{surface:g.surface,lakes:m[1].LAKES,borders:m[1].BORDERS,
                    onReady:function(){globeFailed=false;globe.classList.add('hx-ready');g.fallback.hidden=true;globeControls(true);},onError:globeFailure,
                    onRestore:function(){globeScene.select(F.groupFor(selected).id,true);},onSelect:chooseGroup
                });selected=F.byId(pending);regionDetails();globeScene.select(F.groupFor(selected).id,true);disposables.push(globeScene);
            }catch(error){if(globeScene){globeScene.dispose();globeScene=null;}globeFailure();}
        });
        var globeField=window.ProtonField&&window.ProtonField.mount(g.field);if(globeField)disposables.push(globeField);
    }
    window.addEventListener('pagehide',function(e){if(e.persisted)return;gone=true;observers.forEach(function(o){o.disconnect();});disposables.forEach(function(d){d.dispose();});});
})();
