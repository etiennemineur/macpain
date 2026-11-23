(() => {
 const app=__mp,cv=document.querySelector('canvas'),tests=[];
 const pointer=(type,x,y,buttons=0)=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*r.width/512,clientY:r.top+y*r.height/342,button:0,buttons,pointerId:1,bubbles:true}));};
 const click=(x,y)=>{pointer('pointerdown',x,y,1);pointer('pointerup',x,y);};
 const key=k=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
 const selectMenu=(menu,text)=>{
  click(app.MENUS[menu].x+4,8);const row=app.MENUS[menu]._layout.items.find(it=>it.t===text);
  if(!row)throw Error('Missing menu item '+text);click(row._rect.x+10,row._rect.y+8);
 };
 const widths={};
 for(const family of app.FONTS){
  app.resetForTest();selectMenu(4,family.name);
  const size=[18,12,14,9,24].find(s=>MP15_DATA.fonts[family.name][s]);
  selectMenu(5,size===9?'9 point':String(size));
  const t=MP15_DATA.tools.find(t=>t.tool==='text');click(t.x+12,t.y+10);click(150,140);
  for(const ch of 'MacPaint')key(ch);key('Escape');
  const layers=MacPaint.textLayers();
  const ok=layers.length===1&&layers[0].font===family.name&&layers[0].size===size&&layers[0].lines[0]==='MacPaint';
  widths[family.name]=app.textBmp('MacPaint',family.name,size,false,false).w;
  tests.push({name:'choose and type through real menus: '+family.name,pass:ok,size,font:layers[0]&&layers[0].font});
 }
 const distinct=new Set(Object.values(widths)).size>=4;
 tests.push({name:'fonts render with distinct metrics',pass:distinct,widths});
 app.resetForTest();return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()