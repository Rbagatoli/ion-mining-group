/* Original industrial heat-recovery and utility substation miniatures. */
export function buildIndustrialScene(T,K){
  const {root,m,box,cyl,rod,pipe,torus,group,pad,flow,transformer,cabinet,fan}=K;
  pad();
  // Three clerestory bays give the works its recognizable sawtooth silhouette.
  const works=group(-3.15,0,-.65),width=5.25,depth=2.85,wall=1.85,bay=width/3;
  box(width+.25,.13,depth+.22,m.frame,0,.065,0,works);
  box(width,wall,depth,m.rib,0,wall/2+.13,0,works,.045);
  for(let i=0;i<3;i++){
    const x=-width/2+i*bay;
    const shape=new T.Shape();shape.moveTo(x,wall+.13);shape.lineTo(x+bay,wall+.13);shape.lineTo(x+bay,wall+.92);shape.lineTo(x,wall+.2);shape.closePath();
    const roof=new T.ExtrudeGeometry(shape,{depth:depth+.16,bevelEnabled:false,steps:1});roof.translate(0,0,-depth/2-.08);
    K.mesh(roof,m.shell,0,0,0,works);
    // Dark clerestory glass and thin vertical mullions, visible from the camera.
    box(.024,.57,depth-.2,m.glass,x+bay+.015,wall+.53,0,works,.006);
    for(let z=-1.25;z<=1.3;z+=.43)box(.046,.64,.035,m.silver,x+bay+.035,wall+.53,z,works,.006);
    box(.06,.065,depth+.24,m.silver,x+bay,wall+.94,0,works,.012);
    for(let z=-1.2;z<=1.3;z+=.6)rod([x,wall+.22,z],[x+bay,wall+.94,z],.014,m.frame,works);
  }
  // Loading door, glazing, door tracks and structural columns on the front.
  for(let i=0;i<4;i++)box(.1,wall+.03,.07,m.silver,-width/2+i*bay,1.06,depth/2+.04,works,.015);
  box(1.36,1.43,.045,m.frame,-1.35,.865,depth/2+.04,works,.014);
  for(let i=0;i<10;i++)box(1.3,.055,.04,m.rib,-1.35,.24+i*.133,depth/2+.073,works,.006);
  box(1.4,.08,.14,m.silver,-1.35,1.63,depth/2+.09,works,.01);
  for(let i=0;i<4;i++){
    box(.47,.63,.05,m.glass,.02+i*.57,1.27,depth/2+.04,works,.014);
    box(.49,.035,.05,m.silver,.02+i*.57,1.26,depth/2+.072,works,.004);
  }
  box(.62,.93,.045,m.frame,1.83,.6,depth/2+.035,works,.008);
  box(.04,.14,.055,m.silver,2.02,.65,depth/2+.075,works,.006);
  // A working turbine/compressor and finned heat-recovery skid beside the works.
  box(3.15,.15,2.1,m.frame,1.48,.085,-.7);
  cyl(.58,1.35,m.rib,.83,.88,-.55,root,'x');
  for(let x=.3;x<=1.4;x+=.21)torus(.60,.04,m.silver,x,.88,-.55,root,'x');
  cyl(.30,.4,m.silver,-.01,.88,-.55,root,'x');
  box(.75,.28,.9,m.frame,.85,.3,-.55);
  // Top ventilation fans have visible blade movement behind their guard rings.
  box(1.65,.42,1.25,m.shell,2.04,.94,-.62);
  box(1.76,.07,1.37,m.silver,2.04,1.19,-.62);
  fan(1.63,1.25,-.62,.36);fan(2.43,1.25,-.62,.36);
  for(let i=0;i<11;i++)box(.025,.63,1.14,m.rib,1.29+i*.149,.64,-.62);
  // A tall recovery stack, with its service platform, ladder, collars and cap.
  cyl(.31,2.75,m.shell,2.58,1.46,-1.75);
  cyl(.24,1.1,m.silver,2.58,3.37,-1.75);
  cyl(.35,.09,m.frame,2.58,3.93,-1.75);
  for(const y of [.3,1.1,2.4,2.86])torus(.325,.028,m.frame,2.58,y,-1.75,root,'y');
  box(.9,.065,.82,m.frame,2.58,2.55,-1.75);
  for(const x of [2.09,3.07])rod([x,2.57,-1.27],[x,3.01,-1.27],.022,m.silver);
  rod([2.09,3.01,-1.27],[3.07,3.01,-1.27],.025,m.silver);
  for(const x of [2.39,2.76])rod([x,.16,-1.39],[x,2.56,-1.39],.024,m.frame);
  for(let y=.3;y<2.6;y+=.23)rod([2.39,y,-1.38],[2.76,y,-1.38],.022,m.silver);
  pipe([[-.45,1.14,-.25],[-.1,1.14,-.25],[-.1,1.68,-.25],[1.1,1.68,-.25],[1.1,1.04,-.25]],.11,m.silver);
  pipe([[1.5,.75,-1.19],[1.5,.75,-1.7],[2.58,.75,-1.7]],.11,m.rib);
  for(const x of [-.15,.4,.95])torus(.13,.025,m.frame,x,1.68,-.25,root,'x');
  // A distinct outgoing branch communicates usable surplus recovered from the plant.
  const route=[[-.8,.3,.8],[.12,.3,.8],[.12,.3,1.8],[3.6,.3,1.8],[4.67,.3,1.8],[4.67,1.69,1.03]];
  pipe(route,.045,m.orange);flow(route,{count:5,speed:.14,radius:.061});
  transformer(4.67,0,1.02,1.04);
  cabinet(5.83,.05,-.83,.7,1.53);cabinet(5.0,.05,-.83,.7,1.53);
  pipe([[4.67,1.72,1.03],[4.67,1.87,.4],[5.0,1.87,.4],[5.0,1.55,-.83]],.033,m.silver);
  flow([[4.67,1.72,1.03],[4.67,1.87,.4],[5.0,1.87,.4],[5.0,1.55,-.83]],{count:2,speed:.21,radius:.043});
  box(4.5,.012,.65,m.road,-3.3,.012,2.0);
  for(let x=-5.2;x<-.9;x+=.61)box(.31,.013,.028,m.rib,x,.025,2.0);
  return root;
}

export function buildGridScene(T,K){
  const {root,m,box,cyl,rod,pipe,group,pad,flow,transformer,cabinet}=K;
  pad();
  box(10.9,.06,5.35,m.earth,.8,.035,0,root,.025);
  // Tapered lattice transmission tower, braced on all four faces.
  const tower=group(-4.6,.03,-.95),levels=[{y:0,w:.76},{y:1.04,w:.58},{y:2.08,w:.36},{y:3.16,w:.20},{y:4.08,w:.11}];
  for(let i=0;i<levels.length-1;i++){
    const a=levels[i],b=levels[i+1];
    for(const sx of [-1,1])for(const sz of [-1,1])rod([sx*a.w,a.y,sz*a.w],[sx*b.w,b.y,sz*b.w],.046,m.silver,tower);
    for(const side of [-1,1]){
      rod([-a.w,a.y,side*a.w],[b.w,b.y,side*b.w],.024,m.rib,tower);
      rod([a.w,a.y,side*a.w],[-b.w,b.y,side*b.w],.024,m.rib,tower);
      rod([side*a.w,a.y,-a.w],[side*b.w,b.y,b.w],.024,m.rib,tower);
      rod([side*a.w,a.y,a.w],[side*b.w,b.y,-b.w],.024,m.rib,tower);
    }
    for(const side of [-1,1]){
      rod([-a.w,a.y,side*a.w],[a.w,a.y,side*a.w],.03,m.frame,tower);
      rod([side*a.w,a.y,-a.w],[side*a.w,a.y,a.w],.03,m.frame,tower);
    }
  }
  for(const sx of [-1,1])for(const sz of [-1,1])box(.39,.1,.39,m.frame,sx*.76,.035,sz*.76,tower);
  // Three-phase crossarm and tension insulators.
  rod([0,3.47,-1.35],[0,3.47,1.35],.068,m.frame,tower);
  rod([0,4.07,0],[0,3.47,-1.35],.034,m.silver,tower);rod([0,4.07,0],[0,3.47,1.35],.034,m.silver,tower);
  function insulator(x,y,z,h=.43){
    cyl(.044,h,m.frame,x,y+h/2,z);
    for(let i=0;i<6;i++)cyl(.09,.032,m.silver,x,y+.045+i*(h-.08)/5,z);
  }
  const phases=[-2.05,-.95,.15];
  for(const z of phases)insulator(-4.6,3.02,z,.43);
  // Receiving gantry and the visibly sagging incoming overhead conductors.
  for(const z of [-2.46,.57]){
    box(.27,.15,.38,m.frame,1.25,.10,z);
    rod([1.25,.15,z],[1.25,3.0,z],.074,m.silver);
    rod([.92,.15,z],[1.25,2.74,z],.028,m.frame);
  }
  rod([1.25,3.02,-2.46],[1.25,3.02,.57],.086,m.frame);
  for(const z of phases){
    insulator(1.25,2.48,z,.44);
    const wire=[[-4.6,3.02,z],[-3.2,2.72,z],[-1.6,2.54,z],[.05,2.64,z],[1.25,2.91,z]];
    pipe(wire,.026,m.frame);flow(wire,{count:3,speed:.17,radius:.043});
  }
  // Paired breaker banks, high-voltage busbars and disconnect blades.
  for(const x of [-1.8,-.15]){
    box(.72,.13,3.9,m.frame,x,.145,.05);
    for(const z of [-1.38,-.18,1.02]){
      box(.42,.55,.45,m.rib,x,.46,z);
      insulator(x,.75,z,.61);
      cyl(.10,.3,m.silver,x,1.51,z,root,'x');
      rod([x,1.52,z],[x+.33,1.82,z],.028,m.orange);
      box(.21,.03,.20,m.frame,x,1.43,z);
    }
  }
  for(const z of [-1.38,-.18,1.02]){
    rod([-1.8,1.5,z],[-.15,1.5,z],.048,m.silver);
    pipe([[1.25,2.5,z-.67],[1.25,1.9,z-.3],[-.15,1.5,z]],.027,m.rib);
  }
  // Two transformers and the control house give the buswork an obvious destination.
  transformer(3.01,.08,1.0,1.1);transformer(3.01,.08,-1.65,.93);
  for(const z of [1.0,-1.65]){
    const route=[[-1.8,1.53,1.02],[-.15,1.53,1.02],[1.2,1.53,1.02],[1.55,1.85,z],[3.0,1.85,z],[3.0,1.73,z]];
    pipe(route,.033,m.orange);flow(route,{count:4,speed:.16,radius:.045});
  }
  const house=group(5.27,.07,-.84);
  box(1.67,1.48,1.54,m.shell,0,.74,0,house,.04);box(1.84,.11,1.7,m.silver,0,1.52,0,house,.028);
  box(.54,.97,.04,m.rib,-.38,.56,.79,house,.01);box(.044,.14,.035,m.dark,-.2,.62,.824,house,.005);
  box(.60,.43,.037,m.glass,.42,1.0,.79,house,.01);
  box(.03,.43,.04,m.silver,.42,1.0,.815,house,.005);
  for(let i=0;i<8;i++)box(.6,.025,.04,m.frame,.41,.22+i*.067,.80,house,.006);
  cabinet(5.72,.05,1.09,.62,1.34);cabinet(4.95,.05,1.09,.62,1.34);
  const output=[[3,1.6,1.0],[3.8,1.6,1.0],[3.8,.28,1.9],[5.74,.28,1.9],[5.74,1.15,1.3]];
  pipe(output,.036,m.orange);flow(output,{count:3,speed:.2,radius:.048});
  // Low service curb without a fence obscuring the small mechanical detail.
  box(10.95,.09,.075,m.frame,.8,.11,2.69);box(.075,.09,5.4,m.frame,6.29,.11,0);
  return root;
}
