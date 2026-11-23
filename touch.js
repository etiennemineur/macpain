/* Touch shell: one shared paint model, physical-pixel viewport, native controls. */
(() => {
 'use strict';
 const api=window.MacPaint;
 if(!api)throw new Error('MacPaint engine is unavailable');
 const $=id=>document.getElementById(id),stage=$('touch-stage'),canvas=$('touch-paper'),ctx=canvas.getContext('2d',{alpha:false});
 const sheet=$('touch-sheet'),body=$('sheet-body'),footer=$('sheet-footer');
 const names={lasso:['Lasso','Lasso'],marquee:['Sélection','Sélect.'],hand:['Déplacer la feuille','Main'],text:['Texte','Texte'],bucket:['Pot de peinture','Pot'],spray:['Bombe de peinture','Bombe'],brush:['Pinceau','Pinceau'],pencil:['Crayon','Crayon'],line:['Ligne','Ligne'],eraser:['Gomme','Gomme'],rect:['Rectangle','Rect.'],rectFill:['Rectangle plein','Rect. plein'],rrect:['Rectangle arrondi','Arrondi'],rrectFill:['Rectangle arrondi plein','Arr. plein'],oval:['Ovale','Ovale'],ovalFill:['Ovale plein','Ovale plein'],freeform:['Forme libre','Libre'],freeformFill:['Forme libre pleine','Libre plein'],polygon:['Polygone','Poly.'],polygonFill:['Polygone plein','Poly. plein']};
 const quick=['brush','pencil','eraser','bucket','text'];
 let pixelScale=1,origin={x:0,y:0},initialFit=true,grid=false,frame=0,panel='',dismiss=null,toastTimer=null,readyPNG=null,fileRequest=0,preview=null;
 const pointers=new Map();let gesture=null;
 const element=(tag,attrs={},text)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,String(v));}if(text!==undefined)e.textContent=text;return e;};
 const button=(text,fn,attrs={})=>{const b=element('button',{type:'button',...attrs},text);b.addEventListener('click',fn);return b;};
 /* Sons satiriques + rebond des pictogrammes (le socle de l'interface modulaire). */
 const bounceY=Satire.motion.spring(260,11),bounceScale=Satire.motion.spring(300,15),bounceRot=Satire.motion.spring(320,16);bounceScale.x=1;bounceScale.target=1;
 let motionFrame=0,workingTouch=false,workTime=0;
function bouncePicto(){if(Satire.difficulty.classic())return;Satire.motion.kick(bounceY,-130);Satire.motion.kick(bounceScale,4);Satire.motion.kick(bounceRot,12);if(!motionFrame)motionFrame=requestAnimationFrame(tickMotion);}
 let liveNext=0;
 function tickMotion(){
  motionFrame=0;const dt=1/60;
  Satire.motion.stepSpring(bounceY,dt);Satire.motion.stepSpring(bounceScale,dt);Satire.motion.stepSpring(bounceRot,dt);
  if(workingTouch)workTime+=dt;
  /* Ultra-Violence et au-delà : pendant le tracé, les boutons continuent de bondir. */
  if(workingTouch&&Satire.difficulty.get()>=3&&Satire.difficulty.started()&&performance.now()>liveNext){liveNext=performance.now()+160+Math.random()*260;const all=[...quickBar(),...document.querySelectorAll('#touch-options button,.history-actions button,#touch-menubar button')];const el=all[Math.floor(Math.random()*all.length)];if(el)hop(el,8+Math.random()*12,(Math.random()-.5)*16);}
  const y=bounceY.x,sc=Math.max(1,bounceScale.x),rot=bounceRot.x+(workingTouch?Math.sin(workTime*26)*1.2:0),el=$('pick-tool');
  el.style.transform='translateY('+y.toFixed(1)+'px) scale('+sc.toFixed(3)+') rotate('+rot.toFixed(2)+'deg)';
  if(workingTouch||!(bounceY.done&&bounceScale.done&&bounceRot.done))motionFrame=requestAnimationFrame(tickMotion);
  else el.style.transform='';
 }
 /* Niveau 2 : choisir le pot de peinture demande à iOS l'accès au capteur
    d'inclinaison (le pot se renverse si l'on penche le téléphone). */
 function askTilt(tool){if(tool!=='bucket'||Satire.difficulty.get()!==2)return;try{const D=window.DeviceOrientationEvent;if(D&&typeof D.requestPermission==='function')D.requestPermission().catch(()=>{});}catch(e){}}
 function selectTool(tool){askTilt(tool);stopGesture();api.setTool(tool);Satire.audio.select(tool);bouncePicto();for(const b of quickBar())if(b.dataset.quickTool===tool)hop(b,14,-4);else hop(b,3,0,60);}
 /* Les cases entières réagissent à l'humeur de la salle (Satire.on) : elles
    sautent, ricanent, s'affaissent, font la ola ou somnolent. */
 const calm=matchMedia('(prefers-reduced-motion: reduce)');
 const quickBar=()=>[...document.querySelectorAll('#touch-tools button')];
 const play=(el,frames,duration,delay=0)=>{if(el&&el.animate&&!calm.matches&&!Satire.difficulty.classic())el.animate(frames,{duration,delay,easing:'cubic-bezier(.3,.6,.4,1)'});};
 const hop=(el,h=10,rot=0,delay=0)=>play(el,[{transform:'translateY(0) scale(1,1)'},{transform:`translateY(${-h}px) scale(.94,1.08) rotate(${rot}deg)`,offset:.3},{transform:'translateY(0) scale(1.08,.9)',offset:.62},{transform:`translateY(${-h*.25}px) scale(.99,1.02)`,offset:.8},{transform:'translateY(0) scale(1,1)'}],460,delay);
 const shake=(el,delay=0)=>play(el,[{transform:'none'},{transform:'translateX(-3px) rotate(-4deg)'},{transform:'translateX(3px) rotate(4deg)'},{transform:'translateX(-2px) rotate(-3deg)'},{transform:'translateX(2px) rotate(2deg)'},{transform:'none'}],380,delay);
 const droop=(el,delay=0)=>play(el,[{transform:'none'},{transform:'translateY(5px) scale(1.08,.82)',offset:.35},{transform:'translateY(-2px) scale(.98,1.03)',offset:.7},{transform:'none'}],560,delay);
 const noise=kind=>{if(!calm.matches)Satire.audio.motion(kind);};
 const wave=(h=12,step=45)=>{noise('wave');quickBar().forEach((b,i)=>hop(b,h,i%2?4:-4,i*step));};
 const snicker=(times=1)=>{noise('snicker');for(let k=0;k<times;k++)quickBar().forEach((b,i)=>shake(b,k*400+(i*53)%90));};
 const current=()=>quickBar().find(b=>b.getAttribute('aria-pressed')==='true')||$('pick-tool');
 /* Modèle physique : la case est lancée en l'air, retombe sous la gravité,
    rebondit en s'écrasant, puis s'immobilise. La trajectoire est calculée
    image par image ; chaque impact déclenche son bruit. */
 const toss=(el,power=700,delay=0,spread=60)=>{
  if(!el||!el.animate||calm.matches||Satire.difficulty.classic())return;
  const G=2600,R=0.58,dt=1/60,frames=[],hits=[];let y=0,v=-power,x=0,vx=(Math.random()-.5)*spread,rot=0,vr=(Math.random()-.5)*240,sq=0,time=0;
  while(time<2.4){v+=G*dt;y+=v*dt;x+=vx*dt;rot+=vr*dt;sq*=.75;
   if(y>0){y=0;if(v>90){hits.push([time,v]);sq=Math.min(.35,v/2200);v=-v*R;vr=-vr*.5;vx*=.6;}else break;}
   frames.push({transform:`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${(1+sq*.6).toFixed(3)},${(1-sq).toFixed(3)})`});time+=dt;}
  frames.push({transform:'translate(0,0) rotate(0deg) scale(1,1)'});
  el.animate(frames,{duration:time*1000+120,delay,easing:'linear'});
  for(const [at,speed] of hits)setTimeout(()=>Satire.audio.motion('bounce',speed/1400),delay+at*1000);
 };
 const avalanche=(n=6)=>{const all=[...quickBar(),$('pick-tool'),$('pick-pattern'),$('pick-settings'),$('touch-undo'),$('touch-redo')].filter(Boolean).sort(()=>Math.random()-.5);all.slice(0,n).forEach((b,i)=>toss(b,500+Math.random()*500,i*70));};
 const doze=on=>$('touch-tools').classList.toggle('dozing',on&&!Satire.difficulty.classic());
 /* Interface « Lego » : plus on travaille, plus les commandes changent de
    place (les cases rapides, puis les réglages, puis Annuler/Rétablir). */
 let mischief=0,legoLevel=0;const legoHome=new Map();
 const reshuffle=(box,swapOnly)=>{if(!box)return;const kids=[...box.children];if(kids.length<2)return;if(!legoHome.has(box))legoHome.set(box,kids.slice());
  const i=Math.floor(Math.random()*kids.length);let j=swapOnly?(i+1)%kids.length:Math.floor(Math.random()*kids.length);if(j===i)j=(i+1)%kids.length;
  [kids[i],kids[j]]=[kids[j],kids[i]];box.append(...kids);noise('swap');hop(kids[i],12,6);hop(kids[j],12,-6,80);};
 const legoReset=()=>{mischief=0;legoLevel=0;for(const [box,kids] of legoHome)box.append(...kids);legoHome.clear();};
 const legoProgress=()=>{
  mischief++;const level=Satire.difficulty.levelFor(mischief);
  if(level!==legoLevel){legoLevel=level;Satire.audio.cheer('level');wave(16,40);if(level>=2)reshuffle($('touch-tools'));if(level>=3)reshuffle($('touch-options'));if(level>=4)reshuffle(document.querySelector('.history-actions'),true);avalanche(2+2*level);return;}
  if(legoLevel>=1&&mischief%7===3)avalanche(1+legoLevel);
  if(legoLevel>=2&&mischief%(legoLevel>=5?3:6)===0)reshuffle($('touch-tools'));
  if(legoLevel>=3&&mischief%10===0)reshuffle($('touch-options'));
  if(legoLevel>=4&&mischief%8===0)reshuffle(document.querySelector('.history-actions'),true);
 };
 /* Nightmare! : tout vibre (classe « frenzy », voir touch.css), les menus et
    les outils changent d'ordre sans arrêt, des boutons sont projetés en l'air,
    et toute l'application tressaute sur chaque coup de grosse caisse. */
 /* Simulation 1984 en vrais pixels : panneaux, menus et messages sont confiés au kit
    de satire.js (texte en polices bitmap d'origine, boutons arrondis tracés point par point). */
 Satire.pixel.install();$('finish-polygon').classList.add('primary');
 Satire.pixel.watch($('touch-sheet'),{buttons:'#sheet-footer button,#sheet-body button:not(.tool-choice):not(.pattern-choice):not([data-brush]):not(.pattern-editor button)'});
 Satire.pixel.watch($('touch-dropdown'),{});Satire.pixel.watch($('touch-menubar'),{});Satire.pixel.watch($('touch-message'),{});Satire.pixel.watch($('touch-stage'),{buttons:'#finish-polygon'});
 /* Le logo du menu : un fruit en pixels, qui change avec le niveau de difficulté. */
 const fruitLogo=()=>{const b=$('menu-apple'),rows=Satire.difficulty.fruit(),c=element('canvas',{'aria-hidden':'true'});c.width=rows[0].length;c.height=rows.length;c.style.cssText='width:'+c.width*2+'px;height:'+c.height*2+'px;image-rendering:pixelated;display:block;margin:auto';
  const x=c.getContext('2d');x.fillStyle='#000';rows.forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==='#')x.fillRect(i,j,1,1);});b.replaceChildren(c);b.title='MacPain ('+Satire.difficulty.fruitName()+')';};
 fruitLogo();
 /* Nightmare! : les modules se séparent. À chaque battement de la minuterie, des
    boutons prennent une taille, un angle et une place à eux ; d'autres, ou tous,
    reprennent leur forme. Ils restent cliquables là où ils sont. */
 const modules=()=>[...quickBar(),...$('touch-options').children,...document.querySelectorAll('.history-actions button,#touch-menubar button')];
 const scatter=reset=>{const still=reset||Math.random()<.22;for(const el of modules()){el.style.transition='scale .6s ease-in-out,rotate .6s ease-in-out,translate .6s ease-in-out';
   if(still||Math.random()<.45){el.style.scale='';el.style.rotate='';el.style.translate='';}
   else{el.style.scale=(.55+Math.random()*1.2).toFixed(2);el.style.rotate=((Math.random()-.5)*56).toFixed(0)+'deg';el.style.translate=((Math.random()-.5)*46).toFixed(0)+'px '+((Math.random()-.5)*34).toFixed(0)+'px';}}};
 let frenzyTimer=0,frenzyTick=0;
 const frenzySync=()=>{
  const on=Satire.difficulty.frenzy()&&!calm.matches;document.documentElement.classList.toggle('frenzy',on);
  if(on&&!frenzyTimer)frenzyTimer=setInterval(()=>{
   if(document.hidden||document.querySelector('[data-macpaint-chooser]')||Satire.difficulty.ramp()<1)return;frenzyTick++;scatter(false);
   if($('touch-dropdown').hidden)reshuffle($('touch-menubar'));
   if(frenzyTick%2===0)reshuffle($('touch-tools'));
   if(frenzyTick%3===0)reshuffle($('touch-options'));
   if(frenzyTick%5===0)reshuffle(document.querySelector('.history-actions'),true);
   /* Les boutons d'outils bondissent en permanence, dans tous les sens. */
   quickBar().forEach((b,i)=>{if(Math.random()<.7)toss(b,420+Math.random()*900,i*40,620);});
   if(frenzyTick%2===0)avalanche(4);
  },900);
  if(!on&&frenzyTimer){clearInterval(frenzyTimer);frenzyTimer=0;scatter(true);}
 };
 setTimeout(frenzySync,300);
 Satire.on((type,d)=>{
  if(type==='beat'&&document.documentElement.classList.contains('frenzy')){const now=performance.now(),root=document.documentElement;lastBeat=now;quietUntil=now+220;pose();if(paperBeat)paperBeat();const k=d.fill?9:6,r=()=>((Math.random()-.5)*k).toFixed(1);play($('touch-app'),[{transform:`translate(${r()}px,${r()}px)`,easing:'steps(1)'},{transform:`translate(${r()}px,${r()}px)`,easing:'steps(1)'},{transform:'none'}],140);return;}
  if(type==='difficulty'){if(Satire.difficulty.classic())legoReset();frenzySync();fruitLogo();wave(12,40);toast('Difficulté : '+d.name);}
  if(type==='cheer'){if(d.action==='new')legoReset();else if(['draw','fill','erase','text','dot','ovation'].includes(d.action))legoProgress();}
  switch(type){
   case 'select':doze(false);break;
   case 'mock':snicker(3);shake($('pick-tool'));avalanche(4);break;
   case 'combo':hop(current(),8+Math.min(d.n,10),d.n%2?6:-6);break;
   case 'surprise':{const all=quickBar();toss(all[Math.floor(Math.random()*all.length)],900);break;}
   case 'suspense':snicker(1);break;
   case 'idle':doze(true);break;
   case 'bored':{doze(false);const all=quickBar();hop(all[Math.floor(Math.random()*all.length)],20,-10);break;}
   case 'cheer':
    doze(false);
    if(d.action==='undo'){droop($('touch-undo'));noise('droop');if(d.streak>=2)snicker(1);}
    else if(d.action==='redo')hop($('touch-redo'),10,8);
    else if(d.action==='erase'){noise('flinch');quickBar().forEach((b,i)=>shake(b,i*25));}
    else if(d.action==='ovation'){wave(22,40);avalanche(11);}
    else if(d.action==='new'||d.action==='save')wave(14,50);
    else if(d.action==='dot')hop(current(),6);
    else if(d.action==='draw'||d.action==='fill'||d.action==='text'){hop(current(),8+10*d.energy);if(d.category==='hysteria')wave(9,35);else if(d.category==='laugh')snicker(1);}
    break;
  }
 });
 function toolIcon(tool,target){
  const cell=MP15_DATA.tools.find(t=>t.tool===tool),c=target||element('canvas',{'aria-hidden':'true'});c.width=25;c.height=21;
  const x=c.getContext('2d');x.clearRect(0,0,25,21);x.fillStyle='#000';
  for(let y=0;y<21;y++)for(let xx=0;xx<25;xx++)if(cell.rows[y][xx]==='1')x.fillRect(xx,y,1,1);return c;
 }
 function patternIcon(i,target){
  const c=target||element('canvas',{'aria-hidden':'true'});if(!target){c.width=c.height=32;}
  const x=c.getContext('2d'),p=api.pattern(i);x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';
  for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++)if(p[(y&7)*8+(xx&7)])x.fillRect(xx,y,1,1);return c;
 }
 const bg=document.createElement('canvas');bg.width=bg.height=2;
 {const x=bg.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,2,2);x.fillStyle='#999';x.fillRect(0,0,1,1);x.fillRect(1,1,1,1);}
 const background=ctx.createPattern(bg,'repeat');
 function clampOrigin(){
  const w=api.width*pixelScale,h=api.height*pixelScale;
  origin.x=w<=canvas.width?Math.floor((canvas.width-w)/2):Math.max(canvas.width-w,Math.min(0,Math.round(origin.x)));
  origin.y=h<=canvas.height?Math.floor((canvas.height-h)/2):Math.max(canvas.height-h,Math.min(0,Math.round(origin.y)));
 }
 function snap(n){return Math.max(1,Math.min(16,2**Math.round(Math.log2(Math.max(1,n)))));}
 function fitPaper(){
  const maximum=Math.min(canvas.width/api.width,canvas.height/api.height);
  pixelScale=1;while(pixelScale*2<=maximum&&pixelScale<16)pixelScale*=2;
  /* Petit écran (iPhone de 375 points) : la feuille ×2 dépasse de quelques pixels, on la préfère à une feuille ×1 qui n'occupe que la moitié de la largeur. */
  if(pixelScale<16&&api.width*pixelScale<canvas.width*.75&&api.width*pixelScale*2<=canvas.width*1.12)pixelScale*=2;
  origin={x:0,y:0};clampOrigin();schedule();
 }
 function setZoom(next,anchor){
  const k=snap(next);if(k===pixelScale)return;
  const a=anchor||{x:canvas.width/2,y:canvas.height/2};
  const doc={x:(a.x-origin.x)/pixelScale,y:(a.y-origin.y)/pixelScale};
  pixelScale=k;origin={x:a.x-doc.x*k,y:a.y-doc.y*k};clampOrigin();schedule();
 }
 function drawTitlebar(){
  const c=$('touch-titlebar'),d=window.devicePixelRatio||1,r=c.getBoundingClientRect();
  const k=Math.max(1,Math.round(d));  // entier de pixels matériels par pixel de titre (1,2,3)
  c.width=Math.max(1,Math.round(r.width*d));c.height=19*k;c.style.height=(19*k/d)+'px';
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.setTransform(k,0,0,k,0,0);api.drawWindowTitle(x,Math.ceil(c.width/k));
 }
 function resize(){
  drawTitlebar();
  const vv=window.visualViewport,height=vv?vv.height:innerHeight,top=vv?vv.offsetTop||0:0,density=window.devicePixelRatio||1;
  document.documentElement.style.setProperty('--app-height',height+'px');
  document.documentElement.style.setProperty('--app-top',(Math.round(top*density)/density)+'px');
  document.documentElement.style.setProperty('--keyboard-inset',Math.max(0,document.documentElement.clientHeight-top-height)+'px');
  const r=stage.getBoundingClientRect(),d=window.devicePixelRatio||1;
  if(r.width<1||r.height<1)return;
  const nextW=Math.max(1,Math.round(r.width*d)),nextH=Math.max(1,Math.round(r.height*d));
  if(gesture&&(canvas.width!==nextW||canvas.height!==nextH))stopGesture(true);
  const oldW=canvas.width,oldH=canvas.height,oldCenter={x:(oldW/2-origin.x)/pixelScale,y:(oldH/2-origin.y)/pixelScale};
  canvas.width=nextW;canvas.height=nextH;
  if(initialFit){initialFit=false;fitPaper();}
  else {origin={x:canvas.width/2-oldCenter.x*pixelScale,y:canvas.height/2-oldCenter.y*pixelScale};clampOrigin();schedule();}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
 function draw(){
  frame=0;ctx.imageSmoothingEnabled=false;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);clampOrigin();
  ctx.fillStyle='#111';ctx.fillRect(origin.x+4,origin.y+4,api.width*pixelScale,api.height*pixelScale);
  api.drawDocument(ctx,origin.x,origin.y,pixelScale);
  ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.strokeRect(origin.x-.5,origin.y-.5,api.width*pixelScale+1,api.height*pixelScale+1);
  const s=api.state();
  if(grid&&pixelScale>=4){ctx.strokeStyle='#bcbcbc';ctx.beginPath();for(let x=0;x<=api.width;x+=8){const xx=origin.x+x*pixelScale+.5;if(xx>=0&&xx<=canvas.width){ctx.moveTo(xx,Math.max(0,origin.y));ctx.lineTo(xx,Math.min(canvas.height,origin.y+api.height*pixelScale));}}for(let y=0;y<=api.height;y+=8){const yy=origin.y+y*pixelScale+.5;if(yy>=0&&yy<=canvas.height){ctx.moveTo(Math.max(0,origin.x),yy);ctx.lineTo(Math.min(canvas.width,origin.x+api.width*pixelScale),yy);}}ctx.stroke();}
  if(s.selection){const r=s.selection;ctx.save();ctx.strokeStyle='#39ff14';ctx.setLineDash([4,4]);ctx.strokeRect(origin.x+r.x*pixelScale-.5,origin.y+r.y*pixelScale-.5,r.w*pixelScale+1,r.h*pixelScale+1);ctx.restore();}
  if(s.selectedText!==null){const b=api.textLayerBounds(s.selectedText);if(b){ctx.save();ctx.strokeStyle='#39ff14';ctx.setLineDash([4,4]);ctx.strokeRect(origin.x+b.x*pixelScale-.5,origin.y+b.y*pixelScale-.5,b.w*pixelScale+1,b.h*pixelScale+1);ctx.restore();}}
  refresh(s);if(preview)drawTextPreview();
 }
 function refresh(s=api.state()){
  $('touch-undo').disabled=!s.canUndo;$('touch-redo').disabled=!s.canRedo;
  $('tool-name').textContent=names[s.tool][1];$('pick-tool').title=names[s.tool][0];toolIcon(s.tool,$('current-tool'));patternIcon(s.pattern,$('current-pattern'));
  $('settings-label').textContent=s.tool==='text'?'Aa':s.selection&&['lasso','marquee'].includes(s.tool)?'Éditer':s.tool==='brush'?Math.max(api.brushes[s.brush].w,api.brushes[s.brush].h)*(s.width||1)+' px':s.tool==='eraser'?'8 px':s.tool==='pencil'?'1 px':s.tool==='bucket'?'Aplat':s.tool==='hand'?'Vue':s.tool==='spray'?(15+[1,2,4,8].indexOf(s.width)*4)+' px':(s.width===0?'Sans trait':s.width+' px');
  $('zoom-fit').textContent='×'+pixelScale;$('zoom-in').disabled=pixelScale>=16;$('zoom-out').disabled=pixelScale<=1;
  $('finish-polygon').hidden=s.polygonPoints<3;
  for(const b of document.querySelectorAll('[data-tool-choice],[data-quick-tool]'))b.setAttribute('aria-pressed',String((b.dataset.toolChoice||b.dataset.quickTool)===s.tool));
  for(const b of document.querySelectorAll('[data-pattern-choice]'))b.setAttribute('aria-pressed',String(Number(b.dataset.patternChoice)===s.pattern));
  for(const b of document.querySelectorAll('[data-width]'))b.setAttribute('aria-pressed',String(Number(b.dataset.width)===s.width));
  for(const b of document.querySelectorAll('[data-brush]'))b.setAttribute('aria-pressed',String(Number(b.dataset.brush)===s.brush));
  for(const b of document.querySelectorAll('[data-style]'))b.setAttribute('aria-pressed',String(b.dataset.style==='plain'?s.styles.length===0:s.styles.includes(b.dataset.style)));
  for(const b of document.querySelectorAll('[data-align]'))b.setAttribute('aria-pressed',String(b.dataset.align===s.alignment));
  if(s.dialog&&panel!=='engine')showEngineDialog(s.dialog);
 }
 function toast(text){$('touch-message').textContent=text;$('touch-message').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('touch-message').classList.remove('visible'),2800);}
 function stopGesture(cancel=false){if(gesture?.kind==='draw'){cancel?api.cancelStroke():api.endStroke();workingTouch=false;Satire.audio.loopStop();}pointers.clear();gesture=null;}
 function closeSheet(){preview=null;const fn=dismiss;dismiss=null;panel='';if(sheet.open)sheet.close();if(fn)fn();schedule();}
 function openSheet(title,type,onDismiss){stopGesture();if(sheet.open)closeSheet();panel=type;dismiss=onDismiss||null;$('sheet-title').textContent=title;body.replaceChildren();footer.replaceChildren();sheet.showModal();}
 $('sheet-close').addEventListener('click',closeSheet);
 sheet.addEventListener('cancel',e=>{e.preventDefault();closeSheet();});
 sheet.addEventListener('click',e=>{const r=sheet.getBoundingClientRect();if(e.target===sheet&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeSheet();});
 function openTools(){
  openSheet('Les 20 outils','tools');const grid=element('div',{class:'sheet-grid'});
  for(const tool of api.tools){const b=button('',()=>{selectTool(tool);closeSheet();if(tool==='text')toast('Touchez la feuille pour placer le texte.');},{class:'tool-choice','data-tool-choice':tool,'aria-label':names[tool][0],title:names[tool][0]});b.append(toolIcon(tool),element('span',{},names[tool][1]));grid.append(b);}
  body.append(grid);refresh();noise('wave');[...grid.children].forEach((b,i)=>hop(b,10,i%2?3:-3,Math.floor(i/4)*40+(i%4)*25));
 }
 /* Ultra-Violence : l'épaisseur se saisit en millimètres (piège partagé). */
 function setWidthHard(w){if(Satire.difficulty.get()===3){closeSheet();Satire.traps.width(px=>{api.setWidth(px);refresh();});}else{api.setWidth(w);refresh();}}
 /* Ultra-Violence : les trames deviennent une liste de 4 096 codes hexadécimaux,
    non triés, sans aperçu ; et la feuille se replie « pour économiser la mémoire ». */
 function openPatternsHard(){
  const stage=$('touch-stage');stage.style.visibility='hidden';
  openSheet('4 096 trames','patterns',()=>{stage.style.visibility='';});
  toast('Feuille repliée pour économiser la mémoire vive (128 Ko max).');
  const codes=window.MP15_DATA.patterns,list=[];for(let i=0;i<4096;i++)list.push(i);list.sort(()=>Math.random()-.5);
  const select=element('select',{id:'pattern-hex','aria-label':'Trame, par code hexadécimal',size:6,style:'width:100%;font:13px/1.6 ui-monospace,Menlo,monospace'});
  const frag=document.createDocumentFragment();for(const i of list){const o=element('option',{value:i%38},String(codes[i%38]).replace(/[^0-9a-f]/gi,'').toUpperCase().padStart(16,'0')+'-'+i.toString(16).toUpperCase().padStart(3,'0'));frag.append(o);}
  select.append(frag);select.addEventListener('change',()=>{api.setPattern(Number(select.value));closeSheet();});
  body.append(element('p',{class:'note'},'Choisissez votre trame par son code. Aucun aperçu n’est disponible.'),select);refresh();
 }
 function openPatterns(){
  if(Satire.difficulty.get()===3){openPatternsHard();return;}
  openSheet('Les 38 trames','patterns');const grid=element('div',{class:'sheet-grid pattern-grid'});
  for(let i=0;i<38;i++){const b=button('',()=>{api.setPattern(i);closeSheet();},{class:'pattern-choice','data-pattern-choice':i,'aria-label':'Trame '+(i+1)});b.append(patternIcon(i));grid.append(b);}
  body.append(grid);footer.append(button('Modifier la trame',openPatternEditor));refresh();
 }
 function openPatternEditor(){
  openSheet('Modifier la trame 8 × 8','pattern-edit');const grid=element('div',{class:'pattern-editor'});
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){const b=button('',()=>{api.setPatternPixel(x,y,!api.pattern()[y*8+x]);b.setAttribute('aria-pressed',String(!!api.pattern()[y*8+x]));},{'aria-label':'Pixel '+(x+1)+', '+(y+1),'aria-pressed':String(!!api.pattern()[y*8+x])});grid.append(b);}
  body.append(grid,element('p',{class:'note'},'Touchez les pixels. La trame est mise à jour directement.'));
  footer.append(button('Trames d’origine',()=>{api.command('resetpatterns');openPatternEditor();}),button('Terminé',closeSheet,{class:'primary'}));
 }
 function addTextSettings(){
  const row=element('div',{class:'form-row'}),fontLabel=element('label'),sizeLabel=element('label');fontLabel.append(element('span',{},'Police'));sizeLabel.append(element('span',{},'Corps'));
  const font=element('select',{id:'text-font','aria-label':'Police du texte'}),size=element('select',{id:'text-size','aria-label':'Corps du texte'}),state=api.state();
  for(const f of api.fonts)font.append(element('option',{value:f},f));for(const v of api.sizes)size.append(element('option',{value:v},String(v)));
  font.value=state.font;size.value=String(state.size);font.addEventListener('change',()=>{api.command('font:'+font.value);schedule();});size.addEventListener('change',()=>{api.command('size:'+size.value);schedule();});
  fontLabel.append(font);sizeLabel.append(size);row.append(fontLabel,sizeLabel);body.append(row);
  const styles=element('div',{class:'sheet-grid style-row'});styles.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
  for(const [key,label] of [['plain','Normal'],['bold','Gras'],['italic','Ital.'],['underline','Soul.'],['outline','Contour'],['shadow','Ombre']])styles.append(button(label,()=>{api.command('style:'+key);refresh();},{'data-style':key,'aria-label':{plain:'Style normal',bold:'Gras',italic:'Italique',underline:'Souligné',outline:'Contour',shadow:'Ombre'}[key]}));
  body.append(styles,element('h3',{},'Alignement'));const align=element('div',{class:'button-row'});for(const [key,label] of [['left','Gauche'],['middle','Centré'],['right','Droite']])align.append(button(label,()=>{api.command('align:'+key);refresh();},{'data-align':key}));body.append(align);refresh();
 }
 function drawTextPreview(){
  if(!preview||!preview.canvas.isConnected)return;
  const c=preview.canvas,r=c.getBoundingClientRect(),d=window.devicePixelRatio||1;if(r.width<1)return;
  const w=Math.round(r.width*d),h=Math.round(r.height*d);if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
  const x=c.getContext('2d'),s=api.state(),m=api.measureText(preview.input.value.split('\n')[0]);
  const max=Math.max(1,h/Math.max(1,m.lineHeight*1.4));let k=1;while(k*2<=Math.min(snap(d),max))k*=2;
  const shift=s.alignment==='middle'?m.width/2:s.alignment==='right'?m.width:0;
  x.fillStyle='#fff';x.fillRect(0,0,w,h);api.drawDocument(x,Math.round(-(preview.x-shift-4)*k),Math.round(-(preview.y-m.ascent-4)*k),k);
 }
 /* Repris de User Inyerface : le champ arrive prérempli avec son propre exemple
    (à effacer à la main), et c'est « Annuler » qui a l'air du bouton principal. */
 function trickText(input,fresh){
  if(Satire.difficulty.get()<2||Satire.difficulty.get()>3)return;
  if(fresh){input.value='Votre texte';api.setText(input.value);}
  const ok=$('text-commit'),cancel=ok.previousElementSibling;
  ok.classList.remove('primary');ok.classList.add('dim');if(cancel)cancel.classList.add('primary');
 }
 function openText(point){
  openSheet('Texte','text',()=>api.cancelText());const anchor={x:Math.max(0,Math.round(point.x)),y:Math.min(api.height-1,Math.round(point.y+api.measureText('').ascent))};api.beginText(anchor.x,anchor.y);
  const input=element('textarea',{id:'text-content',rows:3,maxlength:2000,placeholder:'Votre texte…','aria-label':'Texte à dessiner',spellcheck:'false',autocapitalize:'sentences'});
  input.addEventListener('input',()=>{api.setText(input.value);Satire.audio.tick('type');});const sample=element('canvas',{id:'text-preview','aria-label':'Aperçu du texte bitmap'});sample.width=576;sample.height=128;body.append(input,sample);preview={canvas:sample,input,...anchor};addTextSettings();
  footer.append(button('Annuler',closeSheet),button('Valider',()=>{api.commitText();Satire.audio.cheer('text');dismiss=null;closeSheet();},{id:'text-commit',class:'primary'}));trickText(input,true);
  input.focus({preventScroll:true});
 }
 function openSelection(){
  openSheet('Sélection','selection');const row=element('div',{class:'sheet-grid'});row.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
  for(const [cmd,label] of [['copy','Copier'],['cut','Couper'],['paste','Coller'],['clearSel','Supprimer'],['invert','Inverser'],['fill','Remplir'],['trace','Contour'],['fliph','Miroir H'],['flipv','Miroir V'],['rotate','Tourner']]){
   const b=button(label,()=>{api.command(cmd);closeSheet();},{'data-selection-command':cmd});b.disabled=cmd==='paste'?!api.state().canPaste:!api.state().selection;row.append(b);
  }
  body.append(row);footer.append(button('Désélectionner',()=>{api.clearSelection();closeSheet();}));
 }
 function reEditText(id){
  const layer=api.textLayers().find(l=>l.id===id);if(!layer)return;
  api.editTextLayer(id);
  openSheet('Modifier le texte','text',()=>api.cancelText());
  const input=element('textarea',{id:'text-content',rows:3,maxlength:2000,placeholder:'Votre texte…','aria-label':'Texte à modifier',spellcheck:'false',autocapitalize:'sentences'});
  input.value=layer.lines.join('\n');
  input.addEventListener('input',()=>{api.setText(input.value);Satire.audio.tick('type');});
  const sample=element('canvas',{id:'text-preview','aria-label':'Aperçu du texte bitmap'});sample.width=576;sample.height=128;body.append(input,sample);
  preview={canvas:sample,input,x:layer.x,y:layer.y};addTextSettings();
  footer.append(button('Annuler',closeSheet),button('Valider',()=>{api.commitText();Satire.audio.cheer('text');dismiss=null;closeSheet();},{id:'text-commit',class:'primary'}));trickText(input,false);
  input.focus({preventScroll:true});
 }
 function openSettings(){
  const s=api.state();
  if(s.tool==='text'&&s.selectedText!==null){
   openSheet('Texte sélectionné','text-layer');
   body.append(button('Modifier le texte',()=>{const id=s.selectedText;closeSheet();reEditText(id);}),button('Supprimer le texte',()=>{api.deleteTextLayer(s.selectedText);closeSheet();}),element('p',{class:'note'},'Glissez le texte avec le doigt pour le déplacer.'));
   footer.append(button('Terminé',closeSheet,{class:'primary'}));return;
  }
  if(s.selection&&['lasso','marquee'].includes(s.tool)){openSelection();return;}
  openSheet(names[s.tool][0],'settings');
  if(s.tool==='text')addTextSettings();
  else if(s.tool==='brush'){
   body.append(element('h3',{},'Épaisseur'));const thick=element('div',{class:'button-row'});[1,2,4,8].forEach(w=>thick.append(button('×'+w,()=>setWidthHard(w),{'data-width':w})));body.append(thick);
   body.append(element('h3',{},'Forme de la brosse'));const grid=element('div',{class:'sheet-grid brush-grid'});
   api.brushes.forEach((b,i)=>{const choice=button('',()=>{api.setBrush(i);refresh();},{'data-brush':i,'aria-label':'Brosse '+(i+1)}),c=element('canvas',{'aria-hidden':'true'});c.width=c.height=32;const x=c.getContext('2d');x.fillStyle='#000';for(let yy=0;yy<b.h;yy++)for(let xx=0;xx<b.w;xx++)if(b.bits[yy*b.w+xx]==='1')x.fillRect(Math.floor((32-b.w*3)/2)+xx*3,Math.floor((32-b.h*3)/2)+yy*3,3,3);choice.append(c);grid.append(choice);});body.append(grid,element('p',{class:'note'},'Le pinceau utilise la trame sélectionnée.'));
  } else if(['pencil','eraser','bucket','hand','lasso','marquee'].includes(s.tool)){
   const notes={pencil:'Un pixel. Commencer sur du noir permet de gommer avec le crayon.',eraser:'Gomme de 8 × 8 pixels. Zoomez pour travailler plus précisément.',bucket:'Remplit la zone fermée avec la trame choisie.',hand:'Glissez avec un doigt pour déplacer la feuille. Deux doigts permettent aussi de zoomer.',lasso:'Tracez une sélection libre, puis déplacez son contenu ou choisissez Éditer.',marquee:'Glissez pour tracer une sélection rectangulaire.'};body.append(element('p',{},notes[s.tool]));
  } else {
   body.append(element('h3',{},s.tool==='spray'?'Dispersion':'Contour'));const row=element('div',{class:'button-row'});if(s.tool!=='spray')row.append(button('Sans contour',()=>{api.setWidth(0);refresh();},{'data-width':0}));[1,2,4,8].forEach((w,i)=>row.append(button((s.tool==='spray'?15+i*4:w)+' px',()=>setWidthHard(w),{'data-width':w})));body.append(row);
  }
  const label=element('label',{class:'switch-line'}),input=element('input',{type:'checkbox',id:'pixel-grid'});input.checked=grid;input.addEventListener('change',()=>{grid=input.checked;if(grid&&pixelScale<4)setZoom(4);schedule();});label.append(input,document.createTextNode('Grille de précision'));body.append(label);
  body.append(element('p',{class:'note'},'Le texte suit la trame : trame blanche, texte blanc.'));
  if(api.state().canPaste)body.append(button('Coller la sélection',()=>{api.command('paste');closeSheet();}));
  footer.append(button('Terminé',closeSheet,{class:'primary'}));refresh();
 }
 function downloadPNG(){if(!readyPNG){toast('Le PNG est en préparation.');return;}Satire.traps.gate(downloadNow);}
 function downloadNow(){const url=URL.createObjectURL(readyPNG),a=element('a',{href:url,download:'MacPain.png'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Export PNG demandé.');Satire.audio.cheer('save');}
 function openFiles(){
  openSheet('Fichier','file');readyPNG=null;const request=++fileRequest;const actions=element('div',{class:'file-actions'});
  const open=button('Ouvrir une image',()=>{closeSheet();api.command('open');},{id:'touch-open'});
  const save=button('Télécharger le PNG',downloadPNG,{id:'touch-save'});save.disabled=true;
  const share=button('Partager / enregistrer',()=>{if(!readyPNG)return;const file=new File([readyPNG],'MacPain.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[file]}))navigator.share({files:[file],title:'MacPain'}).catch(e=>{if(e.name!=='AbortError')toast('Partage indisponible. Utilisez Télécharger le PNG.');});else downloadPNG();},{id:'touch-share'});share.disabled=true;
  const fresh=button('Nouvelle feuille',()=>{if(api.hasInk()&&Satire.difficulty.get()===3){closeSheet();Satire.traps.confirmNew(()=>{api.command('new');fitPaper();});return;}if(api.hasInk()&&!confirm('Créer une nouvelle feuille ? Exportez le PNG pour garder ce dessin.'))return;api.command('new');closeSheet();fitPaper();},{id:'touch-new'});
  actions.append(open,save,share,fresh);body.append(actions,element('p',{class:'note'},'Dessin conservé dans ce navigateur. Pour le garder dans Photos ou Fichiers, exportez le PNG.'));
  body.append(button('Aide et gestes',openHelp),element('a',{href:'index.html?classic=1'},'Version classique MacPain'));
  api.exportPNG().then(blob=>{if(panel!=='file'||request!==fileRequest)return;readyPNG=blob;save.disabled=false;share.disabled=false;const file=new File([blob],'MacPain.png',{type:'image/png'});if(!navigator.canShare||!navigator.canShare({files:[file]}))share.hidden=true;}).catch(()=>toast('Échec de création du PNG.'));
 }
 function openHelp(){
  openSheet('Au doigt, en portrait','help');
  for(const line of ['Un doigt dessine. Les outils principaux sont en bas, à portée du pouce.','Deux doigts déplacent la feuille et changent le zoom. Le premier point est annulé quand le second doigt arrive.','Touchez ×1, ×2… pour recadrer la feuille. + et − agrandissent les pixels sans lissage.','Trame donne accès aux 38 motifs ; le bouton de taille ouvre les réglages de l’outil.','Pour écrire : choisissez Texte, touchez la feuille, saisissez puis validez. Les 13 polices d’origine restent disponibles.','Pour les polygones : touchez les sommets, puis Terminer la forme.','Dans Safari : Partager, puis Sur l’écran d’accueil permet de garder un accès direct.'])body.append(element('p',{},line));
  footer.append(button('Dessiner',closeSheet,{class:'primary'}));
 }
 function showEngineDialog(d){
  openSheet('MacPain','engine',()=>api.command('close'));
  for(const line of d.lines||[])body.append(element('p',{},typeof line==='string'?line:line.t));
  footer.append(button('OK',closeSheet,{class:'primary'}));
 }
 /* La feuille peut être tournée et mise à l'échelle (Ultra-Violence, Nightmare!) :
    le point touché est ramené dans son repère par la matrice inverse, lue à
    l'instant même puisque la transformation est animée. */
 function localPoint(e){
  /* Centre pris sur la scène (non transformée) : la feuille peut aussi être décalée. */
  const r=($('touch-stage')||canvas).getBoundingClientRect(),w=canvas.offsetWidth||r.width,h=canvas.offsetHeight||r.height;
  let x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2);
  const tr=getComputedStyle(canvas).transform;
  if(tr&&tr!=='none'){const p=new DOMMatrix(tr).inverse().transformPoint(new DOMPoint(x,y));x=p.x;y=p.y;}
  return {x:(x+w/2)*canvas.width/w,y:(y+h/2)*canvas.height/h};
 }
 let paperTimer=0,paperMode=-1;
 let paperBeat=null,lastBeat=-1e9,quietUntil=0,poseN=0;
 /* Nightmare! : pas d'animation continue. Chaque frappe de la musique fait sauter les boutons à la pose suivante (classes p0 à p3). Sans musique : toutes les 150 ms. */
 function pose(){const c=document.documentElement.classList;c.remove('p'+poseN);poseN=(poseN+1+Math.floor(Math.random()*3))%4;c.add('p'+poseN);}
 setInterval(()=>{if(document.documentElement.classList.contains('frenzy')&&performance.now()>quietUntil&&!document.hidden)pose();},150);
 /* Ultra-Violence et Nightmare! : rien ne s'arrête jamais, même panneau, piège ou publicité ouverts. Des boutons bondissent en permanence dès le premier appui. */
 setInterval(()=>{if(document.hidden||workingTouch||Satire.difficulty.get()<3||!Satire.difficulty.started())return;const all=[...quickBar(),...document.querySelectorAll('#touch-options button,.history-actions button,#touch-menubar button')];for(let i=0;i<2;i++){const el=all[Math.floor(Math.random()*all.length)];if(el)hop(el,8+Math.random()*12,(Math.random()-.5)*16);}},230);
 /* Hurt Me Plenty : la feuille tourne vers la direction du trait, un peu moins vite que le doigt. */
 const follow={id:-1,x:0,y:0,angle:0,target:0,on:false,frame:0,at:0};
 function paperFollow(e){
  if(Satire.difficulty.get()!==2||!Satire.difficulty.started()||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(follow.id!==e.pointerId||!follow.live){follow.id=e.pointerId;follow.live=true;follow.x=e.clientX;follow.y=e.clientY;follow.vx=follow.vy=0;return;}
  const dx=e.clientX-follow.x,dy=e.clientY-follow.y;follow.x=e.clientX;follow.y=e.clientY;
  follow.vx=(follow.vx||0)*.9+dx*.1;follow.vy=(follow.vy||0)*.9+dy*.1;if(follow.vx*follow.vx+follow.vy*follow.vy<.5)return;
  let d=Math.atan2(follow.vy,follow.vx)-follow.target;d-=Math.round(d/(2*Math.PI))*2*Math.PI;follow.target+=d*.25;follow.on=true;
  if(!follow.frame)follow.frame=requestAnimationFrame(followStep);
 }
 /* Rotation douce, image par image : la feuille rattrape la direction du trait sans à-coups. */
 function followStep(now){
  const dt=Math.min(.05,(now-(follow.at||now))/1000);follow.at=now;follow.frame=0;
  follow.angle+=(follow.target-follow.angle)*(1-Math.exp(-dt*2.2));
  if(!follow.on)return;
  canvas.style.transition='none';canvas.style.transform='rotate('+follow.angle.toFixed(4)+'rad)';
  if(Math.abs(follow.target-follow.angle)>.001)follow.frame=requestAnimationFrame(followStep);else follow.at=0;
 }
 canvas.addEventListener('pointerup',()=>{follow.live=false;});canvas.addEventListener('pointercancel',()=>{follow.live=false;});
 function paperSync(){
  if(follow.on&&Satire.difficulty.get()!==2){follow.on=false;follow.angle=follow.target=0;canvas.style.transition='transform .5s';canvas.style.transform='';}
  const level=matchMedia('(prefers-reduced-motion: reduce)').matches||!Satire.difficulty.started()?0:Satire.difficulty.get(),mode=level>=3?level:0;
  if(mode===paperMode)return;paperMode=mode;clearTimeout(paperTimer);
  const wild=mode===4;
  canvas.style.transition=mode?'transform '+(wild?'.6s':'1.4s')+' ease-in-out':'transform .5s';
  if(!mode){paperBeat=null;canvas.style.transform='';return;}
  const act=()=>{
   if(!document.hidden&&!document.querySelector('[data-macpaint-chooser]')){
    /* Nightmare! : angle, échelle et position sautent quatre à huit fois par seconde ;
       une fois sur cinq, la feuille se retrouve la tête en bas. */
    const R=Satire.difficulty.ramp();   /* montée progressive après un changement de niveau */
    const angle=((Math.random()-.5)*(wild?150:28)+(wild&&R>=1&&Math.random()<.2?180:0))*R,scale=wild?1+(Math.random()-.55)*R:1;
    const shift=wild?'translate('+((Math.random()-.5)*26*R).toFixed(1)+'%,'+((Math.random()-.5)*18*R).toFixed(1)+'%) ':'';
    canvas.style.transform=shift+'rotate('+angle.toFixed(1)+'deg) scale('+scale.toFixed(2)+')';
    if(!wild||Math.random()<.3)Satire.audio.motion(wild?'swap':'move');
   }
  };
  /* Nightmare! en musique : la feuille saute sur chaque temps (paperBeat) ; le minuteur ne sert que sans musique. */
  paperBeat=null;   /* la feuille glisse d'une pose à l'autre en 1,4 s : plus de saut sur chaque frappe */
  const turn=()=>{act();paperTimer=setTimeout(turn,wild?650+Math.random()*450:3500+Math.random()*2500);};
  paperTimer=setTimeout(turn,wild?400:1500);
 }
 Satire.on(type=>{if(type==='difficulty'||type==='start'){paperSync();frenzySync();}});setTimeout(paperSync,400);
 function docPoint(p){return {x:(p.x-origin.x)/pixelScale,y:(p.y-origin.y)/pixelScale};}
 function inside(p){return p.x>=0&&p.y>=0&&p.x<api.width&&p.y<api.height;}
 function pair(){return [...pointers.values()].slice(0,2);}
 function startPinch(){
  if(gesture?.kind==='draw')api.cancelStroke();
  const [a,b]=pair(),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  gesture={kind:'pinch',distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),scale:pixelScale,anchor:docPoint(mid)};
 }
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||sheet.open)return;e.preventDefault();canvas.focus({preventScroll:true});
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  const p=localPoint(e);pointers.set(e.pointerId,p);
  if(pointers.size>=2){startPinch();return;}
  const d=docPoint(p),s=api.state();
  if(s.tool==='hand'){gesture={kind:'pan',point:p,origin:{...origin}};return;}
  if(!inside(d)){gesture={kind:'pan',point:p,origin:{...origin}};return;}
  if(s.tool==='text'){
   const layerId=api.textLayerAt(d.x,d.y);
   if(layerId!==null){
    api.selectText(layerId);
    const layer=api.textLayers().find(l=>l.id===layerId);
    gesture={kind:'textMove',id:layerId,lx:layer.x,ly:layer.y,sx:d.x,sy:d.y,undoed:false};
    return;
   }
   api.clearTextSelection();
   gesture={kind:'text',point:p,document:d};return;
  }
  api.beginStroke(d.x,d.y,{shiftKey:e.shiftKey});gesture={kind:'draw'};workingTouch=true;workTime=0;if(!motionFrame)motionFrame=requestAnimationFrame(tickMotion);
  const t=api.state().tool;Satire.audio.loop(t);if(Satire.difficulty.classic())workingTouch=false;
 });
 canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;e.preventDefault();const p=localPoint(e);pointers.set(e.pointerId,p);
  if(gesture?.kind==='pinch'&&pointers.size>=2){
   const [a,b]=pair(),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pixelScale=snap(gesture.scale*Math.hypot(b.x-a.x,b.y-a.y)/gesture.distance);
   origin={x:mid.x-gesture.anchor.x*pixelScale,y:mid.y-gesture.anchor.y*pixelScale};clampOrigin();schedule();
  } else if(gesture?.kind==='pan'){origin={x:gesture.origin.x+p.x-gesture.point.x,y:gesture.origin.y+p.y-gesture.point.y};clampOrigin();schedule();}
  else if(gesture?.kind==='draw'){paperFollow(e);const d=docPoint(p);api.moveStroke(d.x,d.y,{shiftKey:e.shiftKey});}
  else if(gesture?.kind==='textMove'){const d=docPoint(p);if(!gesture.undoed){api.beginTextMove(gesture.id);gesture.undoed=true;}api.moveTextLayer(gesture.id,gesture.lx+(d.x-gesture.sx),gesture.ly+(d.y-gesture.sy));}
  else if(gesture?.kind==='text'&&Math.hypot(p.x-gesture.point.x,p.y-gesture.point.y)>(window.devicePixelRatio||1)*12)gesture={kind:'pan',point:p,origin:{...origin}};
 });
 canvas.addEventListener('pointerup',e=>{
  if(!pointers.has(e.pointerId))return;e.preventDefault();const p=localPoint(e),g=gesture;pointers.delete(e.pointerId);
  if(g?.kind==='draw'){const d=docPoint(p);api.moveStroke(d.x,d.y);const t=api.state().tool;api.endStroke();workingTouch=false;Satire.audio.loopStop();if(t==='line'||t==='rect'||t==='rrect'||t==='oval')Satire.audio.tick('shape');if(t.startsWith('polygon'))Satire.audio.tick('vertex');else Satire.audio.cheer(t==='eraser'?'erase':t==='bucket'?'fill':'draw');}
  if(g?.kind==='text'&&pointers.size===0){gesture=null;openText(g.document);return;}
  if(g?.kind==='pinch'&&pointers.size===1){gesture={kind:'pan',point:[...pointers.values()][0],origin:{...origin}};return;}
  if(pointers.size===0)gesture=null;
 });
 canvas.addEventListener('pointercancel',()=>{stopGesture(true);schedule();});
 window.addEventListener('blur',()=>stopGesture(true));
 window.addEventListener('orientationchange',()=>{stopGesture(true);setTimeout(resize,100);});
 for(const tool of quick){const b=button('',()=>{selectTool(tool);if(tool==='text')toast('Touchez la feuille pour placer le texte.');},{'data-quick-tool':tool,'aria-label':names[tool][0],title:names[tool][0]});b.append(toolIcon(tool));$('touch-tools').append(b);}
 $('touch-tools').append(button('•••',openTools,{class:'all-tools','aria-label':'Les 20 outils'}));
 $('pick-tool').addEventListener('click',openTools);$('pick-pattern').addEventListener('click',openPatterns);$('pick-settings').addEventListener('click',openSettings);
 /* Classic menu headings, native touch targets, shared actions. */
 const menuBar=$('touch-menubar'),dropdown=$('touch-dropdown');let activeMenu=null;
 function closeMenu(restoreFocus=false){const old=activeMenu;activeMenu=null;dropdown.hidden=true;for(const b of menuBar.children)b.setAttribute('aria-expanded','false');if(restoreFocus&&old)old.focus({preventScroll:true});}
 function positionMenu(){if(!activeMenu)return;const r=activeMenu.getBoundingClientRect(),top=$('touch-header').getBoundingClientRect().bottom,v=window.visualViewport,bottom=v?v.offsetTop+v.height:innerHeight;dropdown.style.top=top+'px';dropdown.style.left=Math.max(4,Math.min(r.left,innerWidth-dropdown.offsetWidth-4))+'px';dropdown.style.maxHeight=Math.max(44,bottom-top-8)+'px';}
 function openMenu(trigger){
  if(activeMenu===trigger){closeMenu();return;}stopGesture();closeMenu();activeMenu=trigger;trigger.setAttribute('aria-expanded','true');dropdown.replaceChildren();dropdown.setAttribute('aria-label',trigger.getAttribute('aria-label')||trigger.textContent);const s=api.state();
  const item=(label,fn,attrs={},disabled=false,checked=null)=>{const b=button(label,()=>{closeMenu();fn();},attrs);b.disabled=disabled;if(checked!==null){b.setAttribute('role','menuitemcheckbox');b.setAttribute('aria-checked',String(checked));}else b.setAttribute('role','menuitem');dropdown.append(b);};
  const action=(label,key,fn,disabled=false)=>item(label,fn,{'data-menu-action':key},disabled);
  const command=(label,key,disabled=false,checked=null)=>item(label,()=>api.command(key),{'data-menu-command':key},disabled,checked);
  const separator=()=>dropdown.append(element('hr',{role:'separator'}));
  switch(trigger.id){
   case 'menu-apple':action('Difficulté…','difficulty',()=>Satire.difficulty.choose());action('À propos de MacPain','about',()=>{openSheet(api.about.title,'about');for(const paragraph of api.about.paragraphs)body.append(element('p',{},paragraph));footer.append(button('OK',closeSheet,{class:'primary'}));});action('Aide et gestes','help',openHelp);break;
   case 'touch-file':action('Nouvelle feuille…','new',()=>{if(api.hasInk()&&Satire.difficulty.get()===3){Satire.traps.confirmNew(()=>{api.command('new');fitPaper();Satire.audio.cheer('new');});return;}if(api.hasInk()&&!confirm('Créer une nouvelle feuille ? Exportez le PNG pour garder ce dessin.'))return;api.command('new');fitPaper();Satire.audio.cheer('new');});action('Ouvrir une image…','open',()=>api.command('open'));separator();action('Enregistrer / partager…','export',openFiles);break;
   case 'menu-edit':action('Annuler','undo',()=>{api.undo();Satire.audio.cheer('undo');},!s.canUndo);action('Rétablir','redo',()=>{api.redo();Satire.audio.cheer('redo');},!s.canRedo);separator();for(const [key,label] of [['cut','Couper'],['copy','Copier'],['paste','Coller'],['clearSel','Supprimer']])command(label,key,key==='paste'?!s.canPaste:!s.selection);action('Transformer la sélection…','selection',openSelection,!s.selection);break;
   case 'menu-goodies':action('Outils…','tools',openTools);action('Trames…','patterns',openPatterns);action('Réglages…','settings',openSettings);separator();action(Satire.audio.isEnabled()?'Couper les sons':'Rétablir les sons','sound',()=>{Satire.audio.setEnabled(!Satire.audio.isEnabled());});action('Difficulté…','difficulty',()=>Satire.difficulty.choose());action('Voir la feuille','fit',fitPaper);action('Aide et gestes','help',openHelp);break;
   case 'menu-font':for(const f of api.fonts)command(f,'font:'+f,false,s.font===f);break;
   case 'menu-size':for(const n of api.sizes)command(String(n),'size:'+n,false,s.size===n);break;
   case 'menu-style':for(const [k,label] of [['plain','Normal'],['bold','Gras'],['italic','Italique'],['underline','Souligné'],['outline','Contour'],['shadow','Ombre']])command(label,'style:'+k,false,k==='plain'?!s.styles.length:s.styles.includes(k));separator();for(const [k,label] of [['left','À gauche'],['middle','Centré'],['right','À droite']])command(label,'align:'+k,false,s.alignment===k);break;
  }
  dropdown.hidden=false;dropdown.scrollTop=0;positionMenu();
 }
 dropdown.setAttribute('role','menu');
 for(const b of menuBar.children){b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-controls','touch-dropdown');b.setAttribute('aria-expanded','false');b.addEventListener('click',()=>openMenu(b));b.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();if(activeMenu!==b)openMenu(b);dropdown.querySelector('button:not(:disabled)')?.focus();}});}
 document.addEventListener('pointerdown',e=>{if(activeMenu&&!$('touch-header').contains(e.target)){closeMenu();e.stopPropagation();}},true);
 document.addEventListener('keydown',e=>{if(!activeMenu)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);return;}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&dropdown.contains(e.target)){e.preventDefault();e.stopPropagation();const items=[...dropdown.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}else if(e.key==='Tab')closeMenu();},true);
 menuBar.addEventListener('scroll',positionMenu);window.addEventListener('resize',()=>closeMenu());window.addEventListener('blur',()=>closeMenu());if(window.visualViewport)visualViewport.addEventListener('resize',()=>closeMenu());
 $('touch-help').addEventListener('click',openHelp);
 $('touch-undo').addEventListener('click',()=>{stopGesture();api.undo();Satire.audio.cheer('undo');});$('touch-redo').addEventListener('click',()=>{stopGesture();api.redo();Satire.audio.cheer('redo');});
 $('zoom-in').addEventListener('click',()=>{stopGesture();setZoom(pixelScale*2);});$('zoom-out').addEventListener('click',()=>{stopGesture();setZoom(pixelScale/2);});$('zoom-fit').addEventListener('click',fitPaper);
 $('finish-polygon').addEventListener('click',()=>api.finishPolygon());
 $('file').addEventListener('change',()=>{if($('file').files?.length){const off=api.subscribe(()=>{off();fitPaper();});}},true);
 api.subscribe(schedule);new ResizeObserver(()=>resize()).observe(stage);window.addEventListener('resize',resize);if(window.visualViewport){visualViewport.addEventListener('resize',resize);visualViewport.addEventListener('scroll',resize);}
 window.MacPaintTouch=Object.freeze({viewport:()=>({scale:pixelScale,origin:{...origin},width:canvas.width,height:canvas.height,pointers:pointers.size,gesture:gesture?.kind||null,panel}),redraw:schedule});
 resize();schedule();
})()
