(() => {
 const tests=[],check=(name,pass,detail)=>tests.push({name,pass:!!pass,detail}),$=id=>document.getElementById(id),frame=$('touch-window');
 check('whole application has Macintosh window',!!frame);if(!frame)return {passed:false,total:tests.length,tests};
 const r=frame.getBoundingClientRect();
 check('desktop visible around window',r.left>0&&r.top>0&&r.right<innerWidth&&r.bottom<innerHeight,r.toJSON());
 for(const id of ['touch-header','touch-titlebar','touch-menubar','touch-stage','touch-options','touch-zoom','touch-tools']){const e=$(id),b=e.getBoundingClientRect();check(id+' inside window',frame.contains(e)&&b.left>=r.left&&b.right<=r.right+.5&&b.top>=r.top&&b.bottom<=r.bottom+.5,b.toJSON());}
 const t=$('touch-titlebar'),tr=t.getBoundingClientRect(),m=$('touch-menubar').getBoundingClientRect();check('title precedes all menus',Math.abs(tr.top-r.top-1)<1&&tr.bottom<=m.top+.5);
 const p=t.getContext('2d').getImageData(0,0,t.width,t.height).data;let binary=true,ink=0;for(let i=0;i<p.length;i+=4){if(p[i]!==0&&p[i]!==255||p[i]!==p[i+1]||p[i]!==p[i+2]||p[i+3]!==255)binary=false;if(p[i]===0)ink++;}
 check('title is genuine black and white pixel art',binary&&ink>100);
 const k=t.height/19;check('title pixel scale is an integer (crisp pixels)',Number.isInteger(k)&&k>=1,{k});
 const at=(x,y)=>p[(Math.floor(y*k)*t.width+Math.floor(x*k))*4];check('six horizontal title stripes',[4,6,8,10,12,14].every(y=>at(25,y)===0)&&[5,7,9,11,13].every(y=>at(25,y)===255));
 $('menu-apple').click();document.querySelector('[data-menu-action=about]').click();const dr=$('touch-sheet').getBoundingClientRect();check('dialog is square and inside window',getComputedStyle($('touch-sheet')).borderRadius==='0px'&&dr.left>=r.left&&dr.right<=r.right&&dr.bottom<=r.bottom+.5);$('sheet-close').click();
 check('no overflow',document.documentElement.scrollWidth<=innerWidth);
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()