/* Search public facts without treating a missing value as zero or a right to power. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProtonDiscoveryModel=factory();}(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const regions={USA:{AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico'},CAN:{AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon'}};
  const countries={USA:'United States',CAN:'Canada',GBR:'United Kingdom',ARE:'United Arab Emirates',RUS:'Russia',CHN:'China',AUS:'Australia',MEX:'Mexico',BRA:'Brazil',ARG:'Argentina',VEN:'Venezuela',COL:'Colombia',ECU:'Ecuador',PER:'Peru',BOL:'Bolivia',CHL:'Chile',NGA:'Nigeria',AGO:'Angola',DZA:'Algeria',LBY:'Libya',EGY:'Egypt',IRQ:'Iraq',IRN:'Iran',SAU:'Saudi Arabia',KWT:'Kuwait',QAT:'Qatar',OMN:'Oman',BHR:'Bahrain',KAZ:'Kazakhstan',TKM:'Turkmenistan',UZB:'Uzbekistan',AZE:'Azerbaijan',NOR:'Norway',DEU:'Germany',FRA:'France',ITA:'Italy',NLD:'Netherlands',IDN:'Indonesia',MYS:'Malaysia',IND:'India',PAK:'Pakistan',THA:'Thailand',VNM:'Vietnam',COG:'Republic of the Congo',COD:'Democratic Republic of the Congo',GAB:'Gabon',GHA:'Ghana',TCD:'Chad',SDN:'Sudan',SSD:'South Sudan',GNQ:'Equatorial Guinea',CMR:'Cameroon',TTO:'Trinidad and Tobago'};
  Object.assign(countries,{ALB:'Albania',BGD:'Bangladesh',BLR:'Belarus',BLZ:'Belize',BRN:'Brunei',CIV:'Ivory Coast',CUB:'Cuba',DNK:'Denmark',ERI:'Eritrea',ESP:'Spain',ETH:'Ethiopia',GEO:'Georgia',GTM:'Guatemala',GUY:'Guyana',HRV:'Croatia',HUN:'Hungary',ISR:'Israel',JOR:'Jordan',MMR:'Myanmar',MNG:'Mongolia',MOZ:'Mozambique',MRT:'Mauritania',NAM:'Namibia',NER:'Niger',NZL:'New Zealand',PHL:'Philippines',PNG:'Papua New Guinea',POL:'Poland',ROU:'Romania',SEN:'Senegal',SYR:'Syria',TLS:'Timor-Leste',TUN:'Tunisia',TUR:'Turkey',TWN:'Taiwan',UKR:'Ukraine',YEM:'Yemen',ZAF:'South Africa'});
  function normalize(s){return String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function matches(text,query){const hay=' '+normalize(text)+' ';return normalize(query).split(' ').filter(Boolean).every(t=>t.length<=2?hay.includes(' '+t+' '):hay.includes(t));}
  const countryName=(iso,fallback)=>countries[iso]||fallback||iso||'Location unreported';
  function location(c){const s=c.sourceDetail||{},raw=s.state||s.province||s.region||'',region=(regions[c.iso3]||{})[raw]||raw;return [s.city,s.county,region,countryName(c.iso3,c.country)].filter(Boolean).join(', ');}
  function searchable(c){const s=c.sourceDetail||{},raw=s.state||s.province||s.region||'';return [c.id,c.name,c.energyType,c.operator,c.operatorId,s.landfillOperator,s.projectName,s.plantCode,location(c),raw,c.iso3,c.iso3==='USA'?'US USA America':c.iso3==='CAN'?'CA Canada':''].filter(Boolean).join(' ');}
  function placeSearch(c){const s=c.sourceDetail||{};return [location(c),s.state,s.province,s.region,c.iso3,c.iso3==='USA'?'US America':c.iso3==='CAN'?'CA':''].join(' ');}
  function coordinates(c){return Number.isFinite(c.lat)&&Math.abs(c.lat)<=90&&Number.isFinite(c.lng)&&Math.abs(c.lng)<=180;}
  function numeric(value){if(value==null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:NaN;}
  const sourceColors={landfill_gas:'#64d98b',flare_gas:'#ffad55',grid_facility:'#78b9ff',unknown:'#cbcac7'};
  function mw(kw){return Number.isFinite(kw)?(kw/1000).toLocaleString(undefined,{maximumFractionDigits:3})+' MW':'MW unknown';}
  function sliderBounds(f){const low=numeric(f.minMw),high=numeric(f.maxMw),largest=Math.max(Number.isFinite(low)?low:0,Number.isFinite(high)?high:0),ceiling=Math.max(5,Math.ceil((largest+.025)/5)*5);return {low:Number.isFinite(low)?low:0,high:Number.isFinite(high)?high:ceiling,ceiling};}
  function moveSlider(f,which,value,ceiling){
    const next={...f},v=Math.max(0,Math.min(ceiling,Number(value)));if(!Number.isFinite(v))return next;
    if(which==='min'){next.minMw=v===0?'':String(v);const high=numeric(next.maxMw);if(high!==null&&v>high)next.maxMw=v===ceiling?'':String(v);}
    else{next.maxMw=v===ceiling?'':String(v);const low=numeric(next.minMw);if(low!==null&&v<low)next.minMw=v===0?'':String(v);}
    return next;
  }
  function validate(f){for(const k of ['cash','minMw','maxMw'])if(Number.isNaN(numeric(f[k])))return 'Use a positive number or leave the field empty.';if(numeric(f.minMw)!==null&&numeric(f.maxMw)!==null&&Number(f.minMw)>Number(f.maxMw))return 'Minimum capacity must be no larger than maximum capacity.';return '';}
  function matchCandidate(c,f,saved){
    if(f.kind!=='all'&&f.kind!==c.energyType&&!(c.energyTypes||c.energyTechnologies||[]).includes(f.kind)||f.country&&f.country!==c.iso3)return false;
    if(!matches(searchable(c),f.query)||!matches(placeSearch(c),f.location))return false;
    if(f.generation&&!(Number.isFinite(c.existingGenerationKw)&&c.existingGenerationKw>0))return false;
    if(f.tracking==='saved'&&!saved||f.tracking==='new'&&saved)return false;
    return true;
  }
  function matchCapacity(row,f){const min=numeric(f.minMw),max=numeric(f.maxMw),kw=row.kw;return (min===null&&max===null)||Number.isFinite(kw)&&(min===null||kw>=min*1000)&&(max===null||kw<=max*1000);}
  function matchInfrastructure(row,f){return !f.infrastructure||f.infrastructure==='reported'&&row.infrastructureReported||f.infrastructure==='reuse'&&row.reuseDocumented;}
  function matchCash(row,f){const n=numeric(f.cash);return n===null||Number.isFinite(row.cash)&&row.cash<=n;}
  function suggestions(candidates,country){const found=new Set();candidates.forEach(c=>{if(country&&country!==c.iso3)return;const s=c.sourceDetail||{},raw=s.state||s.province||s.region||'',region=(regions[c.iso3]||{})[raw]||raw;if(region)found.add(region);if(s.city)found.add([s.city,region].filter(Boolean).join(', '));});return [...found].sort((a,b)=>a.localeCompare(b));}
  return {normalize,matches,countryName,location,searchable,coordinates,numeric,validate,matchCandidate,matchCapacity,matchInfrastructure,matchCash,suggestions,sourceColors,mw,sliderBounds,moveSlider};
}));
