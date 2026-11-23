(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('classic')==='1')return;
 if(params.get('touch')==='1'||(navigator.maxTouchPoints>0&&matchMedia('(max-width:1024px)').matches)){
  const target=new URL('touch.html',location.href);target.search=location.search;target.hash=location.hash;
  location.replace(target.href);
 }
})()
