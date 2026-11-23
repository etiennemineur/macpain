(() => {
 const tests=[];
 for(const [family,size,ch] of [['Symbol',14,'`'],['Symbol',10,'`'],['Symbol',24,'☃']]){
  const f=MP15_DATA.fonts[family]?.[size];if(!f){tests.push({name:family+' '+size+' overhang',pass:false,detail:'missing strike'});continue;}
  const code=MP15_DATA.charcodes[ch]??65535,g=f.glyphs[String(code)]||f.glyphs['65535'];
  const b=__mp.textBmp(ch,family,size,false,false),pad=b.pad??1;let errors=0;
  for(let y=0;y<f.height;y++)for(let x=0;x<g.w;x++)if(g.rows[y][x]==='1'){
   const X=pad+g.offset+x;if(X<0||X>=b.w||b.bits[y*b.w+X]!==1)errors++;
  }
  tests.push({name:family+' '+size+' complete native glyph '+ch,pass:errors===0,errors});
 }
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()
