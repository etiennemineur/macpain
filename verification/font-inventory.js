(() => {
 const expected=['Athens','Cairo','Chicago','Geneva','London','Los Angeles','Monaco','New York','San Francisco','Taliesin','Toronto','Venice','Symbol'];
 const names=__mp.FONTS.map(f=>f.name);
 const tests=expected.map(name=>({name:'original family available: '+name,pass:names.includes(name)}));
 tests.push({name:'San Francisco has its native 18 point bitmap, not Geneva fallback',pass:!!MP15_DATA.fonts['San Francisco']?.['18']});
 if(MP15_DATA.fonts['San Francisco']?.['18']){
  const sf=__mp.textBmp('MacPaint', 'San Francisco',18,false,false),geneva=__mp.textBmp('MacPaint','Geneva',18,false,false);
  tests.push({name:'San Francisco drawing differs from Geneva',pass:sf.w!==geneva.w||sf.h!==geneva.h||sf.bits.some((v,i)=>v!==geneva.bits[i])});
 }
 return {passed:tests.every(t=>t.pass),total:tests.length,tests,families:names};
})()
