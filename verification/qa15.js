/* Browser regression: exercises real handlers and canonical pixel buffer. */
(() => {
  const app=window.__mp,ref=window.MP15_DATA,cv=document.getElementById('screen');
  const report={tests:[],tools:[],patterns:[],fonts:[],menus:[]};
  const check=(name,ok,detail)=>report.tests.push({name,pass:!!ok,detail});
  const count=()=>app.doc.reduce((a,b)=>a+b,0);
  const pointer=(type,x,y,buttons)=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*r.width/512,clientY:r.top+y*r.height/342,button:0,buttons,bubbles:true,cancelable:true,pointerId:1,isPrimary:true}));};
  const click=(x,y)=>{pointer('pointerdown',x,y,1);pointer('pointerup',x,y,0);};
  const key=(key,opts={})=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...opts}));
  const choose=(name)=>{const c=ref.tools.find(c=>c.tool===name);click(c.x+12,c.y+10);check('tool maps '+name,app.tool===name,app.tool);};
  const path=(pts)=>{pointer('pointerdown',...pts[0],1);for(const p of pts.slice(1))pointer('pointermove',...p,1);pointer('pointerup',...pts.at(-1),0);};
  check('20 original tool cells',app.TOOLS.length===20,app.TOOLS.length);
  check('38 patterns',app.PAT.length===38,app.PAT.length);
  for(const name of app.TOOLS) {
    app.resetForTest();choose(name);
    let ok=false,details={};
    if(name==='hand'){
      path([[330,180],[230,110]]);ok=app.view.x>0&&app.view.y>0;details=app.view;
    } else if(name==='text') {
      click(150,140);for(const c of 'ABC éà')key(c);key('Escape');ok=MacPaint.state().textLayers===1;details={layers:MacPaint.state().textLayers};
    } else if(name==='bucket') {
      click(160,120);ok=count()===576*720;details={pixels:count()};
    } else if(name==='eraser') {
      app.doc.fill(1);path([[160,120],[220,160]]);ok=count()<576*720;details={erased:576*720-count()};
    } else if(name==='spray') {
      click(160,120);ok=count()>0;details={pixels:count()};
    } else if(name==='marquee'||name==='lasso') {
      path(name==='marquee'?[[150,100],[240,200]]:[[150,100],[240,100],[240,200],[150,200],[150,100]]);
      ok=!!app.selection&&app.selection.w>10&&app.selection.h>10;details={bounds:app.selection&&[app.selection.w,app.selection.h]};
    } else if(name.startsWith('polygon')) {
      click(160,100);click(260,100);click(230,200);click(160,100);ok=count()>0;details={pixels:count()};
    } else if(name.startsWith('freeform')) {
      path([[150,100],[200,90],[250,120],[230,200],[160,180]]);ok=count()>0;details={pixels:count()};
    } else {
      path([[150,100],[250,200]]);ok=count()>0;details={pixels:count()};
    }
    check('effect '+name,ok,details);report.tools.push({name,pass:ok,...details});
  }
  // Pattern clicking + actual filled-rectangle deposition, every pixel in 8x8 centre.
  for(let i=0;i<38;i++) {
    app.resetForTest();click(120+(i%19)*20+8,300+Math.floor(i/19)*17+7);
    const routed=app.pattern===i;choose('rectFill');path([[150,100],[270,220]]);
    let errors=0;
    for(let y=80;y<88;y++)for(let x=100;x<108;x++)if(app.doc[y*576+x]!==app.PAT[i][(y&7)*8+(x&7)])errors++;
    check('pattern '+i,routed&&errors===0,{routed,errors});report.patterns.push({i,pass:routed&&errors===0});
  }
  // Every native font strike: no font engine. F bitmap + exact metric.
  for(const [name,strikes] of Object.entries(ref.fonts))for(const [size,f] of Object.entries(strikes)){
    let errors=0,glyphs=0;
    for(const [ch,code] of Object.entries(ref.charcodes)) {
      const g=f.glyphs[String(code)];if(!g)continue;
      const b=app.textBmp(ch,name,Number(size),false,false);glyphs++;
      for(let y=0;y<f.height;y++)for(let x=0;x<g.w;x++){
        const X=1+g.offset+x;if(X<0||X>=b.w)continue;
        if(b.bits[y*b.w+X]!==Number(g.rows[y][x]))errors++;
      }
      if(b.adv!==g.advance||b.asc!==f.ascent||b.lineHeight!==f.ascent+f.descent+f.leading)errors++;
    }
    const pass=errors===0;
    check('font '+name+' '+size,pass,{errors,glyphs});report.fonts.push({name,size,pass,glyphs});
  }
  // Each menu against original MENU resources, preserving labels/separators/order.
  for(let i=0;i<7;i++) {
    app.resetForTest();const m=app.MENUS[i];click(m.x+4,8);
    const actual=m._layout.items.map(v=>v.sep?'-':v.t);
    // Goodies : les ressources d'origine, puis le réglage de difficulté ajouté par satire.js.
    const expected=ref.menus[i].items.map(v=>v.text.replace('MacPaint','MacPain'));if(i===0||i===3){if(expected[expected.length-1]!=='-')expected.push('-');expected.push('Difficulty...');}   // MacPain, et le réglage de difficulté
    const pass=i===4?actual.join('|')===app.FONTS.map(f=>f.name).join('|'):actual.join('|')===expected.join('|');
    check('menu '+i,pass,{actual,expected});report.menus.push({i,pass,actual});
  }
  // Real text and paint bucket through the two often-confused icons.
  app.resetForTest();choose('rect');path([[150,100],[270,220]]);const border=count();choose('bucket');click(200,150);
  check('bucket fills enclosed area',count()>border,{before:border,after:count()});
  app.resetForTest();choose('text');click(150,140);for(const c of 'MacPaint 1.5')key(c);key('Escape');const typed=MacPaint.textLayers();check('top A types',typed.length===1&&typed[0].lines.join(' ')==='MacPaint 1.5',typed.length);
  // Black pencil switches to white if the stroke begins on a black pixel.
  app.resetForTest();choose('pencil');click(150,120);const ink=count();click(150,120);check('pencil erases black',ink===1&&count()===0,{ink,after:count()});
  // undo and clipboard, with no assumed test-only state.
  app.resetForTest();choose('rectFill');path([[150,100],[190,140]]);const filled=count();key('z',{metaKey:true});check('undo restores bitmap',filled>0&&count()===0,count());
  app.resetForTest();choose('pencil');path([[150,120],[190,150]]);const before=count();choose('marquee');path([[140,100],[210,180]]);key('x',{metaKey:true});const cut=count();key('v',{metaKey:true});key('Escape');check('cut/paste preserved pixels',before>0&&cut===0&&count()===before,{before,cut,pasted:count()});
  // A menu hover must visibly invert its row, not just change invisible state.
  app.resetForTest();click(app.MENUS[1].x+4,8);
  const cell=app.MENUS[1]._layout.items[0]._rect;
  const beforeHover=cv.getContext('2d').getImageData(cell.x+1,cell.y,cell.w-2,cell.h).data;
  pointer('pointermove',cell.x+10,cell.y+8,0);
  const afterHover=cv.getContext('2d').getImageData(cell.x+1,cell.y,cell.w-2,cell.h).data;
  check('menu hover inversion',beforeHover.every((v,i)=>i%4===3?v===afterHover[i]:255-v===afterHover[i]));
  // Plain resets combined styles; bold+italic+underline are independent.
  app.resetForTest();app.cmd('style:bold');app.cmd('style:italic');app.cmd('style:underline');click(app.MENUS[6].x+4,8);
  let checked=app.MENUS[6]._layout.items.filter(i=>i.check&&i.check()).map(i=>i.t);
  check('styles can combine',['Bold','Italic','Underline'].every(v=>checked.includes(v)),checked);
  app.cmd('style:plain');click(app.MENUS[6].x+4,8);checked=app.MENUS[6]._layout.items.filter(i=>i.check&&i.check()).map(i=>i.t);
  check('Plain clears all styles',checked.includes('Plain')&&!checked.includes('Bold')&&!checked.includes('Italic'),checked);
  // Each stroke selector uses its reference value, not index+1.
  for(let i=0;i<4;i++){
    app.resetForTest();click(27,[277,291,305,320][i]);choose('line');path([[150,150],[250,150]]);
    let rows=0;for(let y=0;y<720;y++)if(app.doc[y*576+120])rows++;
    check('width '+[1,2,4,8][i],rows===[1,2,4,8][i],rows);
  }
  app.resetForTest();choose('brush');const white=app.PAT.findIndex(p=>p.every(v=>v===0));click(120+(white%19)*20+8,300+Math.floor(white/19)*17+7);path([[150,100],[250,200]]);
  check('brush applies white pattern',count()===0,count());
  // The original drag-down menu gesture must execute its selected item.
  app.resetForTest();choose('pencil');path([[150,100],[230,180]]);
  pointer('pointerdown',app.MENUS[2].x+4,8,1);
  const undoRow=app.MENUS[2]._layout.items[0]._rect;
  pointer('pointermove',undoRow.x+10,undoRow.y+8,1);pointer('pointerup',undoRow.x+10,undoRow.y+8,0);
  check('drag-down Undo menu',count()===0,count());
  app.resetForTest();app.cmd('closeDocument');check('Close closes painting',app.documentOpen===false,app.documentOpen);
  app.cmd('new');check('New reopens painting',app.documentOpen===true&&count()===0,app.documentOpen);
  // Both original help PICT resources are displayed, not rewritten prose.
  for(const name of ['intro','shortcuts']) {
    app.resetForTest();app.cmd(name);
    const rgba=cv.getContext('2d').getImageData(80,47,416,240).data,packed=atob(ref.help[name]);let errors=0;
    for(let i=0;i<416*240;i++){const expected=(packed.charCodeAt(i>>3)>>(7-(i&7)))&1;if((rgba[i*4]<128?1:0)!==expected)errors++;}
    check('original help '+name,errors===0,{errors});
  }
  app.resetForTest();
  report.passed=report.tests.every(t=>t.pass);report.total=report.tests.length;report.failures=report.tests.filter(t=>!t.pass);
  window.__qa15=report;return report;
})()
