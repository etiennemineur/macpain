(() => {
 const tests=[],api=window.MacPaint,app=window.__mp;
 const check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail});
 const result=()=>({passed:tests.every(t=>t.pass),total:tests.length,tests});
 check('shared public touch API exists',!!api);if(!api)return result();
 app.resetForTest();let notifications=0;const unsubscribe=api.subscribe(()=>notifications++);
 api.setTool('pencil');api.beginStroke(20,20);api.moveStroke(80,60);api.endStroke();
 const before=app.doc.slice();check('shared stroke writes actual document',before.some(v=>v===1));
 api.beginStroke(120,120);api.moveStroke(180,180);api.cancelStroke();
 check('pinch takeover restores the exact earlier drawing',before.every((v,i)=>v===app.doc[i]));
 api.undo();check('cancelled stroke leaves no extra Undo entry',app.doc.every(v=>v===0));
 api.redo();check('Redo survives cancelled gesture',before.every((v,i)=>v===app.doc[i]));
 check('state changes notify touch renderer',notifications>0,notifications);unsubscribe();
 const baseline=app.doc.slice();api.setTool('text');api.beginText(30,120);api.setText('iPhone é\nMacPaint');
 check('native keyboard text reaches bitmap engine',app.doc.some((v,i)=>v!==baseline[i]));
 api.setText('');check('erasing text clears its preview exactly',baseline.every((v,i)=>v===app.doc[i]));
 api.setText('San Francisco');api.command('font:San Francisco');api.command('size:18');api.cancelText();
 check('cancel text is non destructive',baseline.every((v,i)=>v===app.doc[i]));
 api.beginText(30,140);api.setText('MacPaint');api.commitText();check('validated text is committed',!api.state().textActive&&api.state().textLayers===1&&api.hasInk());
 for(const tool of api.tools){api.setTool(tool);check('API selects '+tool,app.tool===tool);}
 for(let i=0;i<38;i++){api.setPattern(i);check('API selects pattern '+i,app.pattern===i);}
 for(const w of [1,2,4,8]){api.setWidth(w);check('API applies width '+w,api.state().width===w);}
 api.setTool('marquee');api.beginStroke(10,10);api.moveStroke(90,90);api.endStroke();
 check('touch selection uses shared selection geometry',api.state().selection?.w===81&&api.state().selection?.h===81);
 api.command('copy');check('touch copy enables Paste',api.state().canPaste);
 app.resetForTest();return result();
})()
