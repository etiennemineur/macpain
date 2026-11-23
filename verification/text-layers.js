(() => {
 const tests=[],a=MacPaint,m=__mp,check=(name,pass)=>tests.push({name,pass:!!pass});
 m.resetForTest();
 // 1. Création d'un calque de texte
 a.setTool('text');a.beginText(60,120);a.setText('Bonjour');a.commitText();
 check('committed text becomes a layer',a.state().textLayers===1&&!a.state().textActive);
 check('text layer not baked into bitmap',m.doc.every(v=>v===0));
 const layers=a.textLayers(),id=layers[0].id;
 check('layer carries content and style',layers[0].lines[0]==='Bonjour'&&layers[0].font==='Geneva');
 // 2. Déplacement
 const start=a.textLayerBounds(id);
 a.beginTextMove(id);a.moveTextLayer(id,200,300);
 const moved=a.textLayerBounds(id);
 check('moving relocates the layer',moved.x!==start.x||moved.y!==start.y);
 check('layer at new position',a.textLayerAt(200,300)===id);
 a.undo();
 check('undo restores original position',a.textLayerBounds(id).x===start.x&&a.textLayerBounds(id).y===start.y);
 a.redo();
 check('redo re-applies the move',a.textLayerBounds(id).x===moved.x);
 // 3. Réédition
 a.editTextLayer(id);
 check('editing removes layer and opens editor',a.state().textActive&&a.state().textLayers===0);
 a.setText('Adieu');a.commitText();
 check('re-edited text committed as new layer',a.state().textLayers===1&&a.textLayers()[0].lines[0]==='Adieu');
 const id2=a.textLayers()[0].id;
 // 4. Suppression
 a.deleteTextLayer(id2);
 check('deleting removes the layer',a.state().textLayers===0);
 a.undo();
 check('undo restores deleted layer',a.state().textLayers===1);
 // 5. Sélection
 a.selectText(a.textLayers()[0].id);
 check('selection is tracked',a.state().selectedText!==null);
 a.clearTextSelection();
 check('selection clears',a.state().selectedText===null);
 // 6. Export inclut le texte
 a.setPattern(0);a.setTool('pencil');a.beginStroke(20,20);a.moveStroke(80,20);a.endStroke();
 const before=a.textLayers().length;
 return a.exportPNG().then(blob=>{
  const url=URL.createObjectURL(blob);const img=new Image();
  return new Promise(res=>{img.onload=()=>{const c=document.createElement('canvas');c.width=576;c.height=720;const g=c.getContext('2d');g.drawImage(img,0,0);let ink=0;const d=g.getImageData(0,0,576,720).data;for(let i=0;i<d.length;i+=4)if(d[i]===0)ink++;res({passed:tests.every(t=>t.pass)&&ink>100&&before===1,total:tests.length+1,tests:[...tests,{name:'export PNG composites text layers',pass:ink>100,detail:ink}]});};img.src=url;});
 });
})()