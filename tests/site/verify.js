/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
// final constants: face invariant + framing + no board/PSU interpenetration
const engine = require(REPO_ROOT + 'site/diagram-engine.js');
const ENV={w:4.50,h:2.93,d:2.19}, PROUD=0.20;
const CH={x:0,y:0,z:0,w:ENV.w-2*PROUD,h:ENV.h,d:ENV.d};
const X0=-CH.w/2,X1=CH.w/2,Z0=-CH.d/2,Z1=CH.d/2;
const FAN=1.40, FAN_Z=Z1-FAN/2, PSU_D=ENV.d-FAN, PSU_Z=Z0+PSU_D/2, FY=-0.10;
const MODIN={x:X0-PROUD/2,y:FY,z:FAN_Z,w:PROUD,h:2*FAN,d:FAN};
const MODOUT={x:X1+PROUD/2,y:FY,z:FAN_Z,w:PROUD,h:2*FAN,d:FAN};
const BZ=[FAN_Z-FAN/3,FAN_Z,FAN_Z+FAN/3];
const BOARDS=BZ.map(z=>({x:0,y:0.16,z,w:3.70,h:2.26,d:0.16}));
const PSU={x:-0.80,y:0.08,z:PSU_Z,w:2.30,h:2.72,d:PSU_D};
const CTRL={x:-1.30,y:2.46,z:FAN_Z,w:1.30,h:0.08,d:1.10};
const BUS=[0.30,1.45].map(x=>({x,y:2.46,z:FAN_Z,w:0.16,h:0.09,d:1.30}));
const CHIP={x:0.55,y:1.18,z:BZ[2]+0.10,w:0.24,h:0.24,d:0.05};
const EPI={x:X0-0.05,y:0,z:0,w:0.10,h:CH.h,d:CH.d}, EPO={x:X1+0.05,y:0,z:0,w:0.10,h:CH.h,d:CH.d};
const boxes={CH,MODIN,MODOUT,PSU,CTRL,CHIP,EPI,EPO};
BOARDS.forEach((b,i)=>boxes['BOARD'+i]=b); BUS.forEach((b,i)=>boxes['BUS'+i]=b);
console.log('derived: body w',CH.w,'FAN_Z',FAN_Z.toFixed(3),'PSU_D',PSU_D.toFixed(3),'PSU_Z',PSU_Z.toFixed(3),
  'boardZ',BZ.map(v=>v.toFixed(3)).join(','),'fan cy',(FY+FAN/2).toFixed(2),(FY+1.5*FAN).toFixed(2),
  'bezel y',(FY+2*FAN).toFixed(2),'h',(ENV.h-(FY+2*FAN)).toFixed(2));
const D=engine.createDiagram({view:{VB:{w:1280,h:470},BASE_PITCH:20*Math.PI/180,FOV:1500,
  BASE_SCALE:90,ORIGIN:{x:640,y:324},SHIFT_X:0,PERIOD:44000},
  renderables:[{id:'r',at:[0,1.5,0],build:(H,y)=>H.newLayers()}],
  callouts:[{id:'a',side:'l',y:90,title:'t',desc:'d',at:[0,1,0]}],
  flow:()=>'',regionBoxes:()=>[],objects:()=>[{id:'r',box:CH}]});
let bad=[],mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
const extra=[[X0-0.90,1.30,FAN_Z],[X1+0.90,1.30,FAN_Z]];
for(let i=0;i<720;i++){const yaw=i*Math.PI/360;
 for(const k in boxes){const f=D.boxFaces(boxes[k]);let n=0;
  for(const s in f){if(D.frontFacing(f[s],yaw))n++;
   f[s].forEach(p=>{const q=D.project(p,yaw);mnx=Math.min(mnx,q[0]);mxx=Math.max(mxx,q[0]);mny=Math.min(mny,q[1]);mxy=Math.max(mxy,q[1]);});}
  if(n<2||n>3)bad.push(k+'@'+i+'='+n);}
 extra.forEach(p=>{const q=D.project(p,yaw);mnx=Math.min(mnx,q[0]);mxx=Math.max(mxx,q[0]);});}
console.log('faces outside 2..3:',bad.length,bad.slice(0,5).join(' '));
console.log('screen x',mnx.toFixed(0),mxx.toFixed(0),'| y',mny.toFixed(0),mxy.toFixed(0),
  '| column clearance L',(mnx-262).toFixed(0),'R',(1018-mxx).toFixed(0));
