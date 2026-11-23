(() => {
 const tests=[],check=(name,pass)=>tests.push({name,pass:!!pass});
 check('Satire module loaded',!!window.Satire);
 check('audio API present',!!Satire.audio&&typeof Satire.audio.cheer==='function'&&typeof Satire.audio.stop==='function'&&typeof Satire.audio.setEnabled==='function');
 check('action audio API present',typeof Satire.audio.select==='function'&&typeof Satire.audio.tick==='function'&&typeof Satire.audio.loop==='function'&&typeof Satire.audio.loopStop==='function');
 check('motion API present',typeof Satire.motion.spring==='function'&&typeof Satire.motion.stepSpring==='function'&&typeof Satire.motion.particle==='function');
 check('thirty-six reaction sounds catalogued',Object.values(Satire.audio.CATEGORIES).flat().length===36);
 check('varied laughter present',Satire.audio.CATEGORIES.laugh.filter(f=>f.startsWith('laugh_')).length>=16);
 check('varied applause present',Satire.audio.CATEGORIES.hysteria.filter(f=>f.startsWith('applause_')).length>=10);
 check('no clip with spoken words remains',!Object.values(Satire.audio.CATEGORIES).flat().some(f=>/^(cheer_|gasp_)/.test(f)||['applause_13','laugh_01','laugh_07','laugh_18','laugh_19','laugh_21'].includes(f)));
 // Ressort : un coup fait dépasser la cible puis se stabiliser (rebond).
 const s=Satire.motion.spring(260,11);Satire.motion.kick(s,-130);
 let sawOvershoot=false,peaks=0,prev=0;
 for(let i=0;i<600;i++){const x=Satire.motion.stepSpring(s,1/60);if(x<prev)sawOvershoot=true;if(s.done)break;prev=x;}
 check('spring bounces and settles',sawOvershoot&&s.done);
 // Particule : gravité + rebond avec restitution.
 const p=Satire.motion.particle(0,0);p.vy=-40;
 for(let i=0;i<300;i++)Satire.motion.stepParticle(p,1/60,300,0.5,100);
 check('particle lands on floor and rests',p.y===100&&p.vy===0);
 // Cheer / tick / boucle / mute n'éclatent jamais (le son est paresseux, sans geste il n'y a pas de lecture).
 let ok=true;try{
  for(const tool of ['lasso','marquee','eraser','pencil','brush','bucket','spray','line','rect','rrect','oval','polygon','polygonFill','freeform','freeformFill','text','hand'])Satire.audio.select(tool);
  for(const tool of ['pencil','brush','spray','eraser','line','rect','rrect','oval','polygon','freeform']){Satire.audio.loop(tool);Satire.audio.loopStop();}
  Satire.audio.tick('type');Satire.audio.tick('shape');
  Satire.audio.cheer('draw');Satire.audio.cheer('erase');Satire.audio.cheer('undo');Satire.audio.cheer('redo');
  Satire.audio.stop();Satire.audio.setEnabled(false);Satire.audio.setEnabled(true);
 }catch(e){ok=false;}
 check('all audio actions never throw',ok);
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()