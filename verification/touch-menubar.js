(async()=>{
 const tests=[],check=(name,pass)=>tests.push({name,pass:!!pass}),$=id=>document.getElementById(id);
 const bar=$('touch-menubar');check('top MacPaint menubar exists',!!bar);if(!bar)return {passed:false,total:tests.length,tests};
 const r=bar.getBoundingClientRect();check('bar above paper',r.bottom<=$('touch-stage').getBoundingClientRect().top);
 check('seven classic menu headings',bar.querySelectorAll('button').length===7);
 for(const b of bar.querySelectorAll('button')){const r=b.getBoundingClientRect();check('touch target '+b.textContent,r.width>=44&&r.height>=44);}
 $('menu-font').click();check('13 font choices',document.querySelectorAll('[data-menu-command^="font:"]').length===13);
 document.querySelector('[data-menu-command="font:San Francisco"]').click();check('font applied to engine',MacPaint.state().font==='San Francisco');
 $('menu-size').click();document.querySelector('[data-menu-command="size:24"]').click();check('size applied',MacPaint.state().size===24);
 $('menu-style').click();document.querySelector('[data-menu-command="style:bold"]').click();check('bold applied',MacPaint.state().styles.includes('bold'));
 $('menu-font').click();check('chosen font checked',document.querySelector('[data-menu-command="font:San Francisco"]').getAttribute('aria-checked')==='true');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Escape closes dropdown',$('touch-dropdown').hidden);
 MacPaint.command('new');MacPaint.setTool('pencil');MacPaint.beginStroke(50,60);MacPaint.moveStroke(80,90);MacPaint.endStroke();
 $('menu-edit').click();document.querySelector('[data-menu-action="undo"]').click();check('menu undo changes ink',!MacPaint.hasInk());
 $('menu-edit').click();document.querySelector('[data-menu-action="redo"]').click();check('menu redo restores ink',MacPaint.hasInk());
 $('menu-goodies').click();document.querySelector('[data-menu-action="tools"]').click();check('tools sheet reached',document.querySelectorAll('[data-tool-choice]').length===20);$('sheet-close').click();
 $('touch-file').click();document.querySelector('[data-menu-action="export"]').click();await new Promise(r=>setTimeout(r,150));check('PNG existing panel reached',!!$('touch-save')&&!$('touch-save').disabled);$('sheet-close').click();
 $('menu-size').click();const d=$('touch-dropdown').getBoundingClientRect();check('dropdown within viewport',d.left>=0&&d.right<=innerWidth&&d.top>=r.bottom-1&&d.bottom<=innerHeight);
 $('touch-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));check('outside closes dropdown',$('touch-dropdown').hidden);
 $('menu-apple').click();document.querySelector('[data-menu-action="about"]').click();check('About shares credited text',Array.from($('sheet-body').querySelectorAll('p')).map(p=>p.textContent).join('\n')===MacPaint.about.paragraphs.join('\n'));check('About credited name and date',$('sheet-body').textContent.includes('Étienne Mineur')&&$('sheet-body').textContent.includes('10 novembre 2026'));$('sheet-close').click();
 check('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth);
 return {passed:tests.every(t=>t.pass),total:tests.length,tests};
})()