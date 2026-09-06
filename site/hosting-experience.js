/* Page state stays independent of saved orders. All 3D modules load on approach. */
(function(){
    'use strict';
    var script=document.currentScript,root=document.getElementById('hosting-experience');
    if(!root||!script)return;
    var urls={};['tour','stage','core','globe','world'].forEach(function(key){urls[key]=script.getAttribute('data-'+key+'-src');});
    var modules={},observers=[],disposables=[],gone=false;
    function get(key){if(!modules[key])modules[key]=import(urls[key]);return modules[key];}
    function refs(el,attr){var result={};el.querySelectorAll('['+attr+']').forEach(function(n){result[n.getAttribute(attr)]=n;});return result;}
    function approach(el,load){
        if('IntersectionObserver'in window){var observer=new IntersectionObserver(function(entries){if(entries.some(function(e){return e.isIntersecting;})){observer.disconnect();load();}},{rootMargin:'200px'});observer.observe(el);observers.push(observer);}
        else load();
    }
    var tour=document.getElementById('hosting-tour'),r=refs(tour,'data-tour'),scene=null,index=0,failed=false,xray=false;
    var buttons=Array.from(tour.querySelectorAll('[data-stop]')),hotspots=Array.from(tour.querySelectorAll('[data-hotspot]'));
    // Text navigation remains available if WebGL or a module fails.
    var stops=[
        ['One container, fully equipped.','Explore the shell, rooftop cooling, power distribution and mining racks inside a single hydro-cooled container.','Exterior','The complete container'],
        ['Power, right at the rack.','Inspect the container’s distribution cabinet and the connections that supply the miners.','Power','Power distribution'],
        ['A complete cooling loop.','See the rooftop dry cooler and external supply and return pipes that carry heat away from the miners.','Cooling','The hydro cooling loop'],
        ['Every miner connected.','A network switch links the miners to the connection used for monitoring and communication with the mining pool.','Network','Network connections'],
        ['Inside the container.','Hydro miners sit alongside their coolant manifolds, power distribution and network equipment. Rotate the open container to inspect the connections.','Inside','Racks & connections']
    ];
    function align(rail,button){if(button&&rail.scrollWidth>rail.clientWidth)rail.scrollLeft=button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2;}
    function textStop(i){
        index=i;var data=stops[i];buttons.forEach(function(b,j){b.setAttribute('aria-pressed',String(i===j));});
        r.title.textContent=data[0];r.text.textContent=data[1];r.eyebrow.textContent='0'+(i+1)+' / '+data[3];r.progress.textContent='0'+(i+1)+' — 05';
        r.inside.textContent=i===4?'Back to exterior':'Inside a container';r.inside.setAttribute('aria-pressed',String(i===4));
        r.next.firstChild.textContent=i===4?'Back to exterior ':'Next: '+stops[i+1][2]+' ';
        align(r.stops,buttons[i]);hotspots.forEach(function(b){b.hidden=true;});
    }
    function visit(i){if(!Number.isInteger(i)||i<0||i>=stops.length)return;textStop(i);if(scene&&!failed)scene.visit(i);}
    function controls(enabled){['xray','in','out','reset'].forEach(function(key){r[key].disabled=!enabled;});}
    function failure(){failed=true;tour.classList.remove('hx-ready');r.fallback.hidden=false;r.message.textContent='The 3D container is unavailable. You can still explore its systems using the buttons above.';controls(false);hotspots.forEach(function(b){b.hidden=true;});}
    function ready(){failed=false;tour.classList.add('hx-ready');r.fallback.hidden=true;controls(true);}
    buttons.forEach(function(b,i){b.addEventListener('click',function(){visit(i);});['pointerenter','focus'].forEach(function(event){b.addEventListener(event,function(){if(scene&&!failed)scene.highlight(['shell','power','cooling','network','miners'][i]);});});['pointerleave','blur'].forEach(function(event){b.addEventListener(event,function(){if(scene)scene.highlight(null);});});});
    r.next.addEventListener('click',function(){visit((index+1)%stops.length);});r.inside.addEventListener('click',function(){visit(index===4?0:4);});
    r.xray.addEventListener('click',function(){if(scene&&!failed)scene.setXray(!xray);});
    r.in.addEventListener('click',function(){if(scene&&!failed)scene.zoom(.8);});r.out.addEventListener('click',function(){if(scene&&!failed)scene.zoom(1.25);});
    r.reset.addEventListener('click',function(){if(scene&&!failed)scene.reset();});
    hotspots.forEach(function(b){b.addEventListener('click',function(){visit(Number(b.getAttribute('data-visit')));});['pointerenter','focus'].forEach(function(e){b.addEventListener(e,function(){if(scene&&!failed)scene.highlight(b.getAttribute('data-hotspot'));});});['pointerleave','blur'].forEach(function(e){b.addEventListener(e,function(){if(scene)scene.highlight(null);});});});
    approach(tour,async function(){
        r.message.textContent='Loading the container…';
        try{
            var m=await Promise.all([get('tour'),get('stage'),get('core')]);if(gone)return;
            var pending=index;
            scene=m[0].mountTour(r.canvas,m[2],m[1],{surface:r.surface,onReady:ready,onError:failure,onRestore:function(){scene.visit(index,true);},onStop:textStop,
                onXray:function(value){xray=value;r.xray.textContent=value?'X-ray on':'X-ray off';r.xray.setAttribute('aria-pressed',String(value));},
                onProject:function(points){points.forEach(function(p){var b=hotspots.find(function(n){return n.getAttribute('data-hotspot')===p.id;});if(!b)return;b.hidden=failed||!p.visible;if(!b.hidden){b.style.left=(p.x*100)+'%';b.style.top=(p.y*100)+'%';}});}
            });scene.visit(pending,true);disposables.push(scene);
        }catch(error){if(scene){scene.dispose();scene=null;}failure();}
    });
    var field=window.ProtonField&&window.ProtonField.mount(r.field);if(field)disposables.push(field);
    var globe=document.getElementById('hosting-globe'),F=window.Facilities;
    if(globe&&F){
        var g=refs(globe,'data-globe'),sites=F.all(),selected=F.byId(F.idFromQuery(location.search))||sites[0];
        var globeScene=null,globeFailed=false,regionButtons=Array.from(globe.querySelectorAll('[data-region]')),markers={},lines={};
        function regionDetails(){
            regionButtons.forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-region')===selected.id));});
            g.region.textContent=selected.region;g.name.textContent=selected.name;g.fuel.textContent=selected.fuel;
            g.capacity.textContent=F.capacityLabel(selected);g.rate.textContent=F.powerLabel(selected);g.status.textContent=selected.status;
            g.cta.textContent=F.acceptsMachines(selected)?'Start mining here':'Join this waitlist';g.cta.setAttribute('href','./hardware.html?site='+encodeURIComponent(selected.id));
            g['place-region'].textContent=selected.region;g['place-name'].textContent=selected.name;
            Object.keys(markers).forEach(function(id){markers[id].setAttribute('aria-pressed',String(id===selected.id));});
            align(g.regions,regionButtons.find(function(b){return b.getAttribute('data-region')===selected.id;}));
        }
        function selectRegion(id){var next=F.byId(id);if(!next)return;selected=next;regionDetails();if(globeScene&&!globeFailed)globeScene.select(id);}
        function globeControls(value){['in','out','reset'].forEach(function(key){g[key].disabled=!value;});}
        function globeFailure(){globeFailed=true;globe.classList.remove('hx-ready');g.fallback.hidden=false;g.message.textContent='The globe is unavailable. Choose a region above to compare its details below.';globeControls(false);Object.keys(markers).forEach(function(id){markers[id].hidden=true;lines[id].setAttribute('visibility','hidden');});}
        sites.forEach(function(site,i){
            var button=document.createElement('button'),line=document.createElementNS('http://www.w3.org/2000/svg','line');
            button.type='button';button.textContent=String(i+1).padStart(2,'0');button.setAttribute('aria-label','Explore '+site.name);button.setAttribute('title',site.name);button.setAttribute('data-marker',site.id);button.hidden=true;
            button.addEventListener('click',function(){selectRegion(site.id);});g.markers.appendChild(button);markers[site.id]=button;
            line.setAttribute('visibility','hidden');g.leaders.appendChild(line);lines[site.id]=line;
        });
        regionButtons.forEach(function(button,i){button.disabled=false;button.addEventListener('click',function(){selectRegion(button.getAttribute('data-region'));});
            button.addEventListener('keydown',function(event){var next;if(event.key==='ArrowRight')next=(i+1)%regionButtons.length;else if(event.key==='ArrowLeft')next=(i+regionButtons.length-1)%regionButtons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=regionButtons.length-1;else return;event.preventDefault();regionButtons[next].focus();selectRegion(regionButtons[next].getAttribute('data-region'));});
        });
        g.in.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(.8);});g.out.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.zoom(1.25);});g.reset.addEventListener('click',function(){if(globeScene&&!globeFailed)globeScene.reset();});
        function positionMarkers(points){
            var width=g.surface.clientWidth,height=g.surface.clientHeight,placed=[];
            points.slice().sort(function(a,b){return a.y-b.y;}).forEach(function(p){
                var b=markers[p.id],line=lines[p.id];if(!b)return;
                b.hidden=globeFailed||!p.visible;line.setAttribute('visibility',b.hidden?'hidden':'visible');if(b.hidden)return;
                var x=Math.max(28,Math.min(width-28,p.x*width)),y=Math.max(80,Math.min(height-95,p.y*height-24));
                for(var tries=0;tries<12&&placed.some(function(q){return Math.hypot(q.x-x,q.y-y)<52;});tries++){y+=50;if(y>height-90){y=80;x=Math.max(28,x-54);}}
                placed.push({x:x,y:y});b.style.left=x+'px';b.style.top=y+'px';
                line.setAttribute('x1',x);line.setAttribute('y1',y);line.setAttribute('x2',p.x*width);line.setAttribute('y2',p.y*height);
            });
        }
        regionDetails();globeControls(false);
        approach(globe,async function(){
            g.message.textContent='Loading the hosting globe…';
            try{
                var m=await Promise.all([get('globe'),get('world'),get('stage')]);if(gone)return;
                var pending=selected.id;
                globeScene=m[0].mountGlobe(g.canvas,m[1].LAND,m[2],{surface:g.surface,
                    onReady:function(){globeFailed=false;globe.classList.add('hx-ready');g.fallback.hidden=true;globeControls(true);},onError:globeFailure,
                    onRestore:function(){globeScene.select(selected.id,true);},onSelect:function(id){selected=F.byId(id);regionDetails();},onProject:positionMarkers
                });globeScene.select(pending,true);disposables.push(globeScene);
            }catch(error){if(globeScene){globeScene.dispose();globeScene=null;}globeFailure();}
        });
        var globeField=window.ProtonField&&window.ProtonField.mount(g.field);if(globeField)disposables.push(globeField);
    }
    window.addEventListener('pagehide',function(e){if(e.persisted)return;gone=true;observers.forEach(function(o){o.disconnect();});disposables.forEach(function(d){d.dispose();});});
})();
