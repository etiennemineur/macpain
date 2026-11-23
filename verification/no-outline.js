(() => {
 const tests=[],a=MacPaint,m=__mp,check=(name,pass)=>tests.push({name,pass:!!pass});m.resetForTest();a.setTool('rectFill');
 let accepts=true;try{a.setWidth(0);}catch(e){accepts=false;}check('zero outline width accepted',accepts);if(!accepts)return {passed:false,total:tests.length,tests};
 const draw=(tool)=>{a.setTool(tool);if(tool.startsWith('polygon')){for(const [x,y] of [[30,30],[90,30],[90,90],[30,90]]){a.beginStroke(x,y);a.endStroke();}a.finishPolygon();}else {a.beginStroke(30,30);for(const [x,y] of [[90,30],[90,90],[30,90],[30,30]])a.moveStroke(x,y);if(!tool.startsWith('freeform'))a.moveStroke(90,90);a.endStroke();}};
 const white=m.PAT.findIndex(p=>p.every(v=>v===0)),pattern=m.PAT.findIndex(p=>p.some(v=>v===0)&&p.some(v=>v===1));
 for(const tool of ['rectFill','rrectFill','ovalFill','freeformFill','polygonFill']){
  m.resetForTest();a.setWidth(0);a.setPattern(white);draw(tool);check(tool+' white fill has no black border',!a.hasInk());
  m.resetForTest();a.setWidth(0);a.setPattern(pattern);draw(tool);const p=a.pattern();check(tool+' pattern without solid outline',a.hasInk()&&m.doc.every((v,i)=>!v||p[((Math.floor(i/a.width)&7)*8)+(i%a.width&7)]===1));
  const saved=m.doc.slice();a.undo();check(tool+' undo restores blank',!a.hasInk());a.redo();check(tool+' redo exact',saved.every((v,i)=>v===m.doc[i]));
 }
 for(const tool of ['rect','rrect','oval','freeform','polygon','line']){m.resetForTest();a.setWidth(0);draw(tool);check(tool+' outline-only at zero paints nothing',!a.hasInk());}
 for(const w of [1,2,4,8]){m.resetForTest();a.setWidth(0);a.setWidth(w);a.setPattern(white);draw('rectFill');check(w+' px restores real border',m.doc[30*a.width+40]===1&&m.doc[(30+w)*a.width+40]===0);}
 m.resetForTest();a.setWidth(0);a.setTool('spray');check('spray keeps valid width',a.state().width===1);
 if(document.getElementById('pick-settings')){a.setTool('rectFill');document.getElementById('pick-settings').click();const b=document.querySelector('[data-width="0"]');check('touch offers Sans contour',!!b&&b.textContent==='Sans contour');if(b){b.click();check('touch selects no outline',a.state().width===0&&b.getAttribute('aria-pressed')==='true');}document.getElementById('sheet-close').click();}
 m.resetForTest();return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()