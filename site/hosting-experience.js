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
        var g=refs(globe,'data-globe'),sites=F.all(),selected=F.byId(F.idFromQuery(location.search))||sites[0];
        var globeScene=null,globeFailed=false,regionButtons=Array.from(globe.querySelectorAll('[data-region]')),markers={},lines={};
        function regionDetails(){
            regionButtons.forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-region')===selected.id));});
            g.region.textContent=selected.region;g.name.textContent=selected.name;g.fuel.textContent=selected.fuel;
            g.capacity.textContent=F.capacityLabel(selected);g.rate.textContent=F.powerLabel(selected);g.status.textContent=selected.status;
            g.location.value=selected.id;
            g.status.setAttribute('data-available',String(F.acceptsMachines(selected)));
            g.cta.textContent=F.acceptsMachines(selected)?'Start mining here':'Join this waitlist';g.cta.setAttribute('href','./hardware.html?site='+encodeURIComponent(selected.id));
            Object.keys(markers).forEach(function(id){markers[id].setAttribute('aria-pressed',String(id===selected.id));});
            align(g.regions,regionButtons.find(function(b){return b.getAttribute('data-region')===selected.id;}));
        }
        function selectRegion(id){var next=F.byId(id);if(!next)return;selected=next;regionDetails();if(globeScene&&!globeFailed)globeScene.select(id);}
        function globeControls(value){['in','out','reset'].forEach(function(key){g[key].disabled=!value;});}
        function globeFailure(){globeFailed=true;globe.classList.remove('hx-ready');g.fallback.hidden=false;g.message.textContent='The globe is unavailable. Choose a region above to compare its details below.';globeControls(false);Object.keys(markers).forEach(function(id){markers[id].hidden=true;lines[id].setAttribute('visibility','hidden');});}
        sites.forEach(function(site){
            var button=document.createElement('button'),line=document.createElementNS('http://www.w3.org/2000/svg','line');
            var face=document.createElement('span');face.className='hx-marker-face';face.setAttribute('aria-hidden','true');button.appendChild(face);
            button.type='button';button.setAttribute('aria-label','Explore '+site.name);button.setAttribute('title',site.name);button.setAttribute('data-marker',site.id);button.hidden=true;
            button.addEventListener('click',function(){selectRegion(site.id);});g.markers.appendChild(button);markers[site.id]=button;
            line.setAttribute('visibility','hidden');g.leaders.appendChild(line);lines[site.id]=line;
        });
        regionButtons.forEach(function(button,i){button.disabled=false;button.addEventListener('click',function(){selectRegion(button.getAttribute('data-region'));});
            button.addEventListener('keydown',function(event){var next;if(event.key==='ArrowRight')next=(i+1)%regionButtons.length;else if(event.key==='ArrowLeft')next=(i+regionButtons.length-1)%regionButtons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=regionButtons.length-1;else return;event.preventDefault();regionButtons[next].focus();selectRegion(regionButtons[next].getAttribute('data-region'));});
        });
        g.location.disabled=false;g.location.addEventListener('change',function(){selectRegion(g.location.value);});
        g.in.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(.8);});g.out.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(1.25);});g.reset.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.reset();});
        function positionMarkers(points){
            var width=g.surface.clientWidth,height=g.surface.clientHeight,placed=[];
            points.slice().sort(function(a,b){return (b.id===selected.id)-(a.id===selected.id)||a.y-b.y;}).forEach(function(p){
                var b=markers[p.id],line=lines[p.id];if(!b)return;
                b.hidden=globeFailed||!p.visible;line.setAttribute('visibility','hidden');if(b.hidden)return;
                var x=Math.max(24,Math.min(width-24,p.x*width)),y=Math.max(24,Math.min(height-76,p.y*height)),originX=x,originY=y;
                // Keep the chosen region anchored; nearby regions fan out instead of pushing every pin south.
                for(var tries=0;tries<32&&placed.some(function(q){return Math.hypot(q.x-x,q.y-y)<44;});tries++){
                    var angle=(tries%8)*Math.PI/4,radius=46*(1+Math.floor(tries/8));
                    x=Math.max(24,Math.min(width-24,originX+Math.cos(angle)*radius));
                    y=Math.max(24,Math.min(height-76,originY+Math.sin(angle)*radius));
                }
                placed.push({x:x,y:y});b.style.left=x+'px';b.style.top=y+'px';
                line.setAttribute('visibility',Math.hypot(x-p.x*width,y-p.y*height)>12?'visible':'hidden');
                line.style.opacity=p.id===selected.id?'.55':'.2';
                line.setAttribute('x1',x);line.setAttribute('y1',y);line.setAttribute('x2',p.x*width);line.setAttribute('y2',p.y*height);
            });
        }
        regionDetails();globeControls(false);
        approach(globe,async function(){
            g.message.textContent='Loading the hosting globe…';
            try{
                var m=await Promise.all([get('globe'),get('world'),get('stage')]);if(gone)return;
                var pending=selected.id;
                globeScene=m[0].mountGlobe(g.canvas,m[1].LAND,m[2],{surface:g.surface,lakes:m[1].LAKES,borders:m[1].BORDERS,
                    onReady:function(){globeFailed=false;globe.classList.add('hx-ready');g.fallback.hidden=true;globeControls(true);},onError:globeFailure,
                    onRestore:function(){globeScene.select(selected.id,true);},onSelect:function(id){selected=F.byId(id);regionDetails();},onProject:positionMarkers
                });globeScene.select(pending,true);disposables.push(globeScene);
            }catch(error){if(globeScene){globeScene.dispose();globeScene=null;}globeFailure();}
        });
        var globeField=window.ProtonField&&window.ProtonField.mount(g.field);if(globeField)disposables.push(globeField);
    }
    window.addEventListener('pagehide',function(e){if(e.persisted)return;gone=true;observers.forEach(function(o){o.disconnect();});disposables.forEach(function(d){d.dispose();});});
})();
