/* Eight original site miniatures share one renderer. Posters work without WebGL. */
(function(){
  'use strict';
  const script=document.currentScript,host=document.querySelector('[data-energy-site]');
  if(!script||!host)return;
  const buttons=[...document.querySelectorAll('[data-energy-site-select]')],image=host.querySelector('img');
  const sources=script.dataset,preference=matchMedia('(prefers-reduced-motion: reduce)');
  const sites={
    landfill:['gas','buildLandfillScene','Landfill gas: collection wells, a moving refuse truck, gas treatment, generator and transformer.'],
    flare:['gas','buildFlareScene','Flare gas: a wellhead, separator, burning flare, generator and transformer.'],
    hydro:['water','buildHydroScene','Hydro: a dam and reservoir feed flowing spillways and a spinning turbine beside the powerhouse.'],
    nuclear:['water','buildNuclearScene','Nuclear: a containment dome, cooling tower with water vapour, turbine hall and transformer.'],
    wind:['renewables','buildWindScene','Wind: three rotating turbines send power through collection cables to a transformer.'],
    solar:['renewables','buildSolarScene','Solar: tracking panel banks connect through inverters and collection cables to a transformer.'],
    industrial:['industry','buildIndustrialScene','Industrial surplus: a factory, energy recovery equipment, rotating fans and a power branch to a transformer.'],
    grid:['industry','buildGridScene','Grid supply: a transmission tower connects to a substation with busbars, switchgear and transformers.']
  };
  const order=Object.keys(sites),modules=new Map();
  let selected='landfill',shown=null,rendered=null,stage=null,busy=false,failed=false,visible=false,disposed=false,timer=0,leaving=false;
  const capable=!!(window.IntersectionObserver&&window.ResizeObserver);
  function load(url){if(!modules.has(url))modules.set(url,import(url));return modules.get(url);}
  function running(){return visible&&!document.hidden&&!preference.matches&&!leaving&&!disposed;}
  function schedule(){
    clearTimeout(timer);timer=0;
    const keyboardFocus=buttons.some(button=>button.matches(':focus-visible'));
    if(running()&&stage&&!failed&&!busy&&!keyboardFocus)timer=setTimeout(()=>choose(order[(order.indexOf(selected)+1)%order.length]),11000);
  }
  function fallback(){failed=true;stage?.dispose();stage=null;rendered=null;host.dataset.renderState='fallback';schedule();}
  function choose(id){
    if(!sites[id]||disposed)return;
    selected=id;buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.energySiteSelect===id)));
    clearTimeout(timer);host.dataset.renderState=preference.matches?'reduced':failed?'fallback':'loading';sync();
  }
  async function poster(id){
    const src=new URL('./assets/visuals/energy-site-'+id+'-960.webp',script.src).href;
    const srcset=src+' 960w, '+new URL('./assets/visuals/energy-site-'+id+'-1920.webp',script.src).href+' 1920w';
    const next=new Image();next.sizes=image.sizes;next.srcset=srcset;next.src=src;await next.decode();
    if(disposed||id!==selected)return false;
    image.srcset=srcset;image.src=src;image.alt='Illustrative miniature. '+sites[id][2];shown=id;host.dataset.energySite=id;return true;
  }
  async function sync(){
    if(disposed)return;
    stage?.setActive(running());
    if(busy)return;
    busy=true;clearTimeout(timer);
    try{
      while(!disposed){
        const id=selected;
        if(shown!==id&&!(await poster(id)))continue;
        if(preference.matches){stage?.setActive(false);stage?.setMotion(false);host.dataset.renderState='reduced';break;}
        if(failed||!capable){host.dataset.renderState='fallback';break;}
        if(!running())break;
        if(rendered!==id){
          stage?.setActive(false);host.dataset.renderState='loading';
          const [runtime,kit,family]=await Promise.all([load(sources.moduleSrc),load(sources.kitSrc),load(sources[sites[id][0]+'Src'])]);
          if(disposed)break;if(id!==selected)continue;
          if(!running()){if(preference.matches)host.dataset.renderState='reduced';break;}
          const builder=T=>family[sites[id][1]](T,kit.createSiteKit(T));
          if(stage)await stage.setScene(builder,'discovery');
          else stage=await runtime.mountSourcingScene(host,builder,{kind:'discovery',onError:fallback});
          if(disposed){stage?.dispose();stage=null;break;}
          rendered=id;
        }
        if(id!==selected)continue;
        host.dataset.renderState=preference.matches?'reduced':failed?'fallback':'ready';
        stage?.setMotion(!preference.matches);stage?.setActive(running());break;
      }
    }catch(error){fallback();}
    finally{busy=false;schedule();}
  }
  buttons.forEach(button=>{
    button.addEventListener('click',()=>choose(button.dataset.energySiteSelect));
    button.addEventListener('focus',schedule);button.addEventListener('blur',schedule);
  });
  const observer=capable?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0}):null;
  observer?.observe(host);
  function onVisibility(){sync();}
  document.addEventListener('visibilitychange',onVisibility);preference.addEventListener('change',onVisibility);
  window.addEventListener('pagehide',event=>{
    leaving=true;clearTimeout(timer);stage?.setActive(false);
    if(event.persisted)return;
    disposed=true;observer?.disconnect();stage?.dispose();document.removeEventListener('visibilitychange',onVisibility);preference.removeEventListener('change',onVisibility);
  });
  window.addEventListener('pageshow',()=>{leaving=false;sync();});
  sync();
})();
