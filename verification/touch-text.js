(() => {
 const tests=[],check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail}),api=MacPaint;
 __mp.resetForTest();document.querySelector('[data-quick-tool="text"]').click();
 const c=document.getElementById('touch-paper'),r=c.getBoundingClientRect(),v=MacPaintTouch.viewport();
 const p={clientX:r.left+(v.origin.x+40*v.scale)*r.width/c.width,clientY:r.top+(v.origin.y+100*v.scale)*r.height/c.height,pointerId:731,pointerType:'touch',button:0,bubbles:true};
 c.dispatchEvent(new PointerEvent('pointerdown',{...p,buttons:1}));c.dispatchEvent(new PointerEvent('pointerup',{...p,buttons:0}));
 const input=document.getElementById('text-content');check('tap opens native text entry',!!input&&document.getElementById('touch-sheet').open);if(!input)return {passed:false,total:tests.length,tests};
 check('keyboard focus is in textarea',document.activeElement===input);
 check('all thirteen font families in native selector',document.getElementById('text-font').options.length===13);
 const before=__mp.doc.slice();input.value='iPhone é';input.dispatchEvent(new Event('input',{bubbles:true}));
 check('native input changes shared bitmap',__mp.doc.some((p,i)=>p!==before[i]));
 check('text has an in-panel bitmap preview',!!document.getElementById('text-preview'));
 const font=document.getElementById('text-font');font.value='San Francisco';font.dispatchEvent(new Event('change',{bubbles:true}));
 const size=document.getElementById('text-size');size.value='18';size.dispatchEvent(new Event('change',{bubbles:true}));
 check('native font selector changes engine',api.state().font==='San Francisco'&&api.state().size===18);
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'x',bubbles:true}));check('engine does not double-type native text',input.value==='iPhone é');
 document.getElementById('text-commit').click();check('validated text closes panel and remains ink',!api.state().textActive&&!document.getElementById('touch-sheet').open&&api.hasInk());
 const baseline=__mp.doc.slice();const layers=api.state().textLayers;const p2={clientX:r.left+(v.origin.x+250*v.scale)*r.width/c.width,clientY:r.top+(v.origin.y+250*v.scale)*r.height/c.height,pointerId:732,pointerType:'touch',button:0,bubbles:true};
 c.dispatchEvent(new PointerEvent('pointerdown',{...p2,buttons:1}));c.dispatchEvent(new PointerEvent('pointerup',{...p2,buttons:0}));
 const draft=document.getElementById('text-content');draft.value='Annuler';draft.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('sheet-close').click();
 check('closing a text draft preserves prior drawing',baseline.every((p,i)=>p===__mp.doc[i])&&api.state().textLayers===layers);
 __mp.resetForTest();return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()
