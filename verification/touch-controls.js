(async () => {
 const tests=[],check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail}),tick=()=>new Promise(r=>requestAnimationFrame(r));
 const $=id=>document.getElementById(id),api=MacPaint,c=$('touch-paper');
 function choose(tool){$('pick-tool').click();document.querySelector('[data-tool-choice="'+tool+'"]').click();}
 function event(type,x,y){const r=c.getBoundingClientRect(),v=MacPaintTouch.viewport();c.dispatchEvent(new PointerEvent(type,{pointerId:94,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,bubbles:true,clientX:r.left+(v.origin.x+x*v.scale)*r.width/c.width,clientY:r.top+(v.origin.y+y*v.scale)*r.height/c.height}));}
 function stroke(points){event('pointerdown',...points[0]);for(const p of points.slice(1))event('pointermove',...p);event('pointerup',...points[points.length-1]);}
 const path=[[80,180],[240,180],[240,300],[80,280]];
 for(const tool of api.tools){
  __mp.resetForTest();$('zoom-fit').click();await tick();
  if(tool==='eraser'){choose('pencil');stroke([[80,180],[240,300]]);}
  choose(tool);check('UI chooses '+tool,api.state().tool===tool);
  if(tool==='hand'){
   $('zoom-in').click();const v=MacPaintTouch.viewport(),r=c.getBoundingClientRect();const x=(v.width/2-v.origin.x)/v.scale,y=(v.height/2-v.origin.y)/v.scale;stroke([[x,y],[x+40,y+40]]);
   check('hand moves page without painting',JSON.stringify(v.origin)!==JSON.stringify(MacPaintTouch.viewport().origin)&&!api.hasInk());
  }else if(tool==='text'){
   stroke([[80,180]]);const input=$('text-content');input.value='MacPaint';input.dispatchEvent(new Event('input',{bubbles:true}));$('text-commit').click();check('text tool paints via native composer',api.hasInk());
  }else if(tool==='marquee'||tool==='lasso'){
   stroke(tool==='marquee'?[[80,180],[240,300]]:[...path,path[0]]);check(tool+' creates a real selection',api.state().selection?.w>100);
  }else if(tool==='polygon'||tool==='polygonFill'){
   for(const p of path.slice(0,3))stroke([p]);await tick();check(tool+' exposes reachable finish action',!$('finish-polygon').hidden);$('finish-polygon').click();check(tool+' commits shape',api.hasInk()&&api.state().polygonPoints===0);
  }else {const inkBefore=__mp.doc.reduce((a,b)=>a+b,0);stroke(path);check(tool+' applies actual pixels',tool==='eraser'?__mp.doc.reduce((a,b)=>a+b,0)<inkBefore:api.hasInk());}
  await tick();
 }
 __mp.resetForTest();$('zoom-fit').click();choose('marquee');stroke([[80,180],[240,300]]);choose('brush');await tick();$('pick-settings').click();
 check('brush settings remain reachable inside a selection',document.querySelectorAll('[data-brush]').length===8);
 $('sheet-close').click();__mp.resetForTest();choose('text');stroke([[80,180]]);const input=$('text-content');input.value='MacPaint';input.dispatchEvent(new Event('input',{bubbles:true}));
 for(const font of api.fonts){const select=$('text-font');select.value=font;select.dispatchEvent(new Event('change',{bubbles:true}));check('touch font control applies '+font,api.state().font===font&&api.hasInk());}
 const sample=$('text-preview');await tick();const data=sample.getContext('2d').getImageData(0,0,sample.width,sample.height).data;let black=0;for(let i=0;i<data.length;i+=4)if(data[i]===0&&data[i+1]===0&&data[i+2]===0)black++;
 check('in-panel preview contains actual bitmap ink',black>0,black);$('text-commit').click();
 __mp.resetForTest();choose('pencil');stroke([[300,300],[420,420]]);const before=__mp.doc.slice();$('touch-file').click();document.querySelector('[data-menu-action="export"]').click();for(let i=0;i<100&&$('touch-save').disabled;i++)await new Promise(r=>setTimeout(r,10));
 const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob=null,download='';
 URL.createObjectURL=b=>{blob=b;return create(b);};HTMLAnchorElement.prototype.click=function(){download=this.download;};$('touch-save').click();URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;
 check('touch export creates actual PNG download',!!blob&&blob.type==='image/png'&&download==='MacPain.png');
 if(blob){const raw=new Uint8Array(await blob.arrayBuffer());check('export has real PNG signature',[137,80,78,71,13,10,26,10].every((v,i)=>raw[i]===v));const bitmap=await createImageBitmap(blob);check('PNG uses full document dimensions',bitmap.width===576&&bitmap.height===720);bitmap.close();$('sheet-close').click();api.command('new');const transfer=new DataTransfer();transfer.items.add(new File([blob],'roundtrip.png',{type:'image/png'}));$('file').files=transfer.files;$('file').dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<100&&!api.hasInk();i++)await new Promise(r=>setTimeout(r,10));check('touch PNG import round-trips every document pixel',before.every((v,i)=>v===__mp.doc[i]));}
 check('controls produce no runtime error',!window.__touchErrors?.length,window.__touchErrors);
 __mp.resetForTest();return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()
