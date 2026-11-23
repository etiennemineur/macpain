/* Deterministic real-handler regression. No production-only test hooks. */
(() => {
  const app=window.__mp,cv=document.getElementById('screen');
  const results=[],timers=new Map();let id=-100,seed=12345;
  const original={random:Math.random,setInterval:window.setInterval,clearInterval:window.clearInterval};
  const count=()=>app.doc.reduce((a,b)=>a+b,0);
  const check=(name,pass,detail)=>results.push({name,pass:!!pass,detail});
  const pointer=(type,x,y,buttons=0)=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*r.width/512,clientY:r.top+y*r.height/342,button:0,buttons,bubbles:true,cancelable:true,pointerId:1,isPrimary:true}));};
  const pulse=n=>{for(let j=0;j<n;j++)for(const timer of [...timers.values()])timer.fn();};
  try {
    if(app.resetForTest)app.resetForTest();else {app.doc.fill(0);app.render();}
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    window.setInterval=(fn,ms)=>{const n=id--;timers.set(n,{fn,ms});return n;};
    window.clearInterval=n=>{if(timers.has(n))timers.delete(n);else original.clearInterval(n);};
    const cell=window.MP15_DATA&&MP15_DATA.tools.find(t=>t.tool==='spray');
    const sx=cell?cell.x+12:28,sy=cell?cell.y+10:83;
    pointer('pointerdown',sx,sy,1);pointer('pointerup',sx,sy);
    check('spray icon selects aerosol',app.tool==='spray',app.tool);
    pointer('pointerdown',150,140,1);pulse(8);
    const before=app.doc.slice(),beforeInk=count();
    pointer('pointermove',300,140,1);
    let lost=0;for(let i=0;i<before.length;i++)if(before[i]&&!app.doc[i])lost++;
    check('moving never erases deposited spray',beforeInk>0&&lost===0,{beforeInk,lost,afterInk:count()});
    let emptyBins=0;
    for(let x=90;x<210;x+=20){let ink=0;for(let y=80;y<=106;y++)for(let xx=x;xx<x+20;xx++)ink+=app.doc[y*576+xx];if(!ink)emptyBins++;}
    check('fast move sprays along the path, not just endpoints',emptyBins===0,{emptyBins});
    const stationary=count();pulse(8);check('holding increases density',count()>stationary,{before:stationary,after:count()});
    pointer('pointerup',300,140);
    check('release cancels spray timer',timers.size===0,timers.size);
    const end=count();pulse(10);check('no ink after release',count()===end,{end,after:count()});
    app.undo();check('one Undo removes the whole spray stroke',count()===0,count());
    for(const stop of ['pointercancel','outside-pointerup','blur']) {
      app.resetForTest();pointer('pointerdown',sx,sy,1);pointer('pointerup',sx,sy);
      pointer('pointerdown',180,160,1);pulse(5);
      if(stop==='pointercancel')pointer('pointercancel',180,160);
      else if(stop==='blur')window.dispatchEvent(new Event('blur'));
      else window.dispatchEvent(new PointerEvent('pointerup',{button:0,buttons:0,pointerId:1}));
      const stopped=count();pulse(10);
      check('stops on '+stop,timers.size===0&&count()===stopped,{activeTimers:timers.size,pixelsAfterStop:count()-stopped});
    }
  } finally {
    pointer('pointerup',300,140);
    Math.random=original.random;window.setInterval=original.setInterval;window.clearInterval=original.clearInterval;
  }
  return {passed:results.every(t=>t.pass),total:results.length,tests:results};
})()
