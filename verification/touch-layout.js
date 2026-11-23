(() => {
 const tests=[],check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail});
 const root=document.getElementById('touch-app');check('dedicated touch shell exists',!!root);
 if(!root)return {passed:false,total:tests.length,tests};
 check('shared engine loaded',!!window.MacPaint&&MacPaint.fonts.length===13&&MacPaint.tools.length===20);
 check('real drawing canvas',!!document.getElementById('touch-paper'));
 check('no page horizontal overflow',document.documentElement.scrollWidth<=innerWidth,{scroll:document.documentElement.scrollWidth,viewport:innerWidth});
 for(const id of ['touch-header','touch-options','touch-stage','touch-tools','touch-zoom']){
  const r=document.getElementById(id).getBoundingClientRect();check(id+' is in initial viewport',r.width>0&&r.height>0&&r.left>=-.5&&r.right<=innerWidth+.5&&r.top>=-.5&&r.bottom<=innerHeight+1,r.toJSON());
 }
 for(const b of document.querySelectorAll('#touch-app button')){
  const r=b.getBoundingClientRect();if(!r.width||!r.height)continue;
  check('44 px touch target '+(b.id||b.getAttribute('aria-label')),r.width>=43.9&&r.height>=43.9,{w:r.width,h:r.height});
 }
 document.getElementById('pick-tool').click();
 check('twenty tools available',document.querySelectorAll('[data-tool-choice]').length===20);
 document.querySelector('[data-tool-choice="spray"]').click();check('tool sheet changes engine',MacPaint.state().tool==='spray');
 document.getElementById('pick-pattern').click();check('all 38 patterns available',document.querySelectorAll('[data-pattern-choice]').length===38);
 document.querySelector('[data-pattern-choice="3"]').click();check('pattern sheet changes engine',MacPaint.state().pattern===3);
 document.getElementById('pick-settings').click();document.querySelector('[data-width="8"]').click();check('width changes engine',MacPaint.state().width===8);
 document.getElementById('sheet-close').click();
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()
