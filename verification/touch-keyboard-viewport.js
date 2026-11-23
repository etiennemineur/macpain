(() => {
 const tests=[],check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail});
 const descriptor=Object.getOwnPropertyDescriptor(window,'visualViewport'),real=window.visualViewport;
 const $=id=>document.getElementById(id);if($('touch-sheet').open)$('sheet-close').click();MacPaint.setTool('text');$('pick-settings').click();
 try{
  const h=Math.min(380,innerHeight-80),offsetTop=20;
  Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:h,width:innerWidth,offsetTop,scale:1}});window.dispatchEvent(new Event('resize'));
  const app=$('touch-app').getBoundingClientRect(),panel=$('touch-sheet').getBoundingClientRect(),bottom=offsetTop+h;
  check('sheet stays above keyboard visual boundary',panel.bottom<=bottom+1,{panel:panel.bottom,visualBottom:bottom});
  check('footer remains visible with keyboard',document.getElementById('sheet-footer').getBoundingClientRect().bottom<=bottom+1);
  check('portrait app follows visual viewport origin',Math.abs(app.top-offsetTop)<1,{appTop:app.top,offsetTop});
  check('portrait app fits keyboard-reduced viewport',app.bottom<=bottom+1,{appBottom:app.bottom,visualBottom:bottom});
 } finally {if(descriptor)Object.defineProperty(window,'visualViewport',descriptor);else Object.defineProperty(window,'visualViewport',{configurable:true,value:real});window.dispatchEvent(new Event('resize'));$('sheet-close').click();}
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()
