/* Poster-first sourcing illustrations. WebGL loads only when visible and motion is allowed. */
(function(){
  'use strict';
  var script=document.currentScript;
  if(!script)return;
  if(!window.IntersectionObserver||!window.ResizeObserver)return;
  var sources={stage:script.dataset.moduleSrc,discovery:script.dataset.discoverySrc,capital:script.dataset.capitalSrc};
  var preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-sourcing-scene]').forEach(function(host){
    var kind=host.dataset.sourcingScene,stage=null,loading=false,failed=false,visible=false,paused=false,disposed=false;
    var button=document.createElement('button');button.type='button';button.className='sourcing-motion-toggle';button.hidden=true;
    button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path class="sourcing-pause-icon" d="M7 5v10M13 5v10"/><path class="sourcing-play-icon" d="m7 4 9 6-9 6Z"/></svg>';
    function label(){var text=paused?'Play animation':'Pause animation';button.setAttribute('aria-label',text);button.title=text;button.dataset.paused=String(paused);}
    label();host.append(button);
    function fallback(){failed=true;stage?.dispose();stage=null;host.dataset.renderState='fallback';button.hidden=true;}
    async function sync(){
      if(disposed)return;
      var permitted=!preference.matches,shouldRun=visible&&!document.hidden&&permitted&&!paused;
      if(stage){host.dataset.renderState=permitted?'ready':'reduced';button.hidden=!permitted;stage.setMotion(!paused&&permitted);stage.setActive(shouldRun);return;}
      if(!shouldRun||loading||failed)return;
      loading=true;host.dataset.renderState='loading';
      try{
        var modules=await Promise.all([import(sources.stage),import(sources[kind])]);
        if(disposed){loading=false;return;}
        var builder=kind==='capital'?modules[1].buildCapitalScene:modules[1].buildDiscoveryScene;
        stage=await modules[0].mountSourcingScene(host,builder,{kind:kind,onError:fallback});
        if(disposed){stage.dispose();stage=null;return;}
        host.dataset.renderState=preference.matches?'reduced':'ready';button.hidden=preference.matches;sync();
      }catch(error){fallback();}
      finally{loading=false;}
    }
    button.addEventListener('click',function(){paused=!paused;label();sync();});
    var observer=new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;sync();},{threshold:0});observer.observe(host);
    function onVisibility(){sync();}document.addEventListener('visibilitychange',onVisibility);preference.addEventListener('change',onVisibility);
    window.addEventListener('pagehide',function(event){if(event.persisted){stage?.setActive(false);return;}disposed=true;observer.disconnect();stage?.dispose();document.removeEventListener('visibilitychange',onVisibility);preference.removeEventListener('change',onVisibility);});
    window.addEventListener('pageshow',onVisibility);
  });
})();
