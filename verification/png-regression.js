(async()=>{
 const app=window.__mp,cv=document.getElementById('screen'),r=cv.getBoundingClientRect();
 const pointer=(type,x,y,buttons=0)=>cv.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*r.width/512,clientY:r.top+y*r.height/342,button:0,buttons,pointerId:1,bubbles:true}));
 app.resetForTest();const t=MP15_DATA.tools.find(t=>t.tool==='pencil');pointer('pointerdown',t.x+12,t.y+10,1);pointer('pointerup',t.x+12,t.y+10);
 pointer('pointerdown',150,100,1);pointer('pointermove',240,180,1);pointer('pointerup',240,180);
 const expected=app.doc.slice(),create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let downloadName;
 let resolve;const ready=new Promise(r=>resolve=r);
 URL.createObjectURL=b=>{resolve(b);return create(b)};
 HTMLAnchorElement.prototype.click=function(){downloadName=this.download};
 let blob;
 try {app.cmd('save');blob=await ready;}finally {URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
 const bmp=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);
 const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let errors=0;
 for(let i=0;i<expected.length;i++){const v=expected[i]?0:255;if(a[i*4]!==v||a[i*4+1]!==v||a[i*4+2]!==v||a[i*4+3]!==255)errors++;}
 app.resetForTest();const dt=new DataTransfer();dt.items.add(new File([blob],'roundtrip.png',{type:'image/png'}));const f=document.getElementById('file');f.files=dt.files;f.dispatchEvent(new Event('change',{bubbles:true}));
 let importErrors=expected.length;
 for(let n=0;n<20;n++){await new Promise(r=>setTimeout(r,50));importErrors=app.doc.reduce((n,v,i)=>n+(v!==expected[i]),0);if(importErrors===0)break;}
 const tests=[{name:'PNG dimensions',pass:bmp.width===576&&bmp.height===720},{name:'PNG file name and MIME',pass:downloadName==='MacPain.png'&&blob.type==='image/png'},{name:'PNG exact opaque black/white export',pass:errors===0},{name:'PNG exact import',pass:importErrors===0}];
 app.resetForTest();return {passed:tests.every(t=>t.pass),total:tests.length,tests,width:bmp.width,height:bmp.height,exportErrors:errors,importErrors,pixelsCompared:expected.length};
})()
