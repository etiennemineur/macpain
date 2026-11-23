# Executed by browser_exec with its real js/cdp browser helpers.
from pathlib import Path
import json,time

def run_trusted_touch(url,output):
    cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=3,mobile=True)
    cdp('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
    cdp('Page.addScriptToEvaluateOnNewDocument',source="window.__touchErrors=[];addEventListener('error',e=>__touchErrors.push(e.message));Storage.prototype.setItem=function(){};")
    goto_url(url);wait_for_load();cdp('Page.bringToFront');time.sleep(.3)
    js("__mp.resetForTest();window.__trustedTouches=0;document.getElementById('touch-paper').addEventListener('pointerdown',e=>{if(e.isTrusted&&e.pointerType==='touch')__trustedTouches++});")
    tests=[]
    def check(name,passed,detail=None):tests.append({'name':name,'pass':bool(passed),'detail':detail})
    def point(x,y):
        r=js(f"JSON.stringify((()=>{{const c=document.getElementById('touch-paper'),r=c.getBoundingClientRect(),v=MacPaintTouch.viewport();return {{x:r.left+(v.origin.x+{x}*v.scale)*r.width/c.width,y:r.top+(v.origin.y+{y}*v.scale)*r.height/c.height}}}})())")
        return json.loads(r) if isinstance(r,str) else r
    def touch(kind,points):
        cdp('Input.dispatchTouchEvent',type=kind,touchPoints=[{'id':i,'x':p['x'],'y':p['y'],'radiusX':6,'radiusY':6,'force':1} for i,p in points]);time.sleep(.035)
    def tap(selector):
        p=js("JSON.stringify((()=>{const b=document.querySelector("+json.dumps(selector)+");const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})())")
        p=json.loads(p) if isinstance(p,str) else p;touch('touchStart',[(0,p)]);touch('touchEnd',[]);time.sleep(.06)
    tap('[data-quick-tool="pencil"]')
    p=point(40,60);touch('touchStart',[(0,p)])
    for x,y in [(60,65),(100,80),(140,100),(180,130)]:touch('touchMove',[(0,point(x,y))])
    touch('touchEnd',[])
    check('trusted finger paints actual document',js('__mp.doc.some(v=>v===1)'))
    js('window.__touchBaseline=__mp.doc.slice()')
    tap('#touch-undo');check('thumb Undo removes actual stroke',js('__mp.doc.every(v=>v===0)'))
    tap('#touch-redo');check('thumb Redo restores exact stroke',js('__touchBaseline.every((v,i)=>v===__mp.doc[i])'))
    a,b=point(200,220),point(300,220);touch('touchStart',[(0,a)]);touch('touchStart',[(0,a),(1,b)])
    check('second finger cancels first dot exactly',js('__touchBaseline.every((v,i)=>v===__mp.doc[i])'))
    mid=(a['x']+b['x'])/2;a2={'x':mid-72,'y':a['y']};b2={'x':mid+72,'y':b['y']}
    initial=js('MacPaintTouch.viewport().scale');touch('touchMove',[(0,a2),(1,b2)])
    zoom=js('MacPaintTouch.viewport().scale');check('real pinch changes integer pixel zoom',zoom>initial and zoom in [1,2,4,8,16],{'before':initial,'after':zoom})
    before=js('JSON.stringify(MacPaintTouch.viewport().origin)');a3={**a2,'y':a2['y']+35};b3={**b2,'y':b2['y']+35};touch('touchMove',[(0,a3),(1,b3)]);after=js('JSON.stringify(MacPaintTouch.viewport().origin)')
    check('two fingers translate viewport without ink',before!=after and js('__touchBaseline.every((v,i)=>v===__mp.doc[i])'))
    touch('touchEnd',[]);check('pinch release leaves no drawing gesture',js('MacPaintTouch.viewport().pointers===0&&!MacPaintTouch.viewport().gesture&&!__mp.drag'))
    tap('#zoom-fit');tap('#pick-tool');js("document.querySelector('[data-tool-choice=\"spray\"]').scrollIntoView({block:'center'})");tap('[data-tool-choice="spray"]')
    touch('touchStart',[(0,point(120,250))]);time.sleep(.2)
    for x,y in [(180,260),(260,300),(400,350)]:touch('touchMove',[(0,point(x,y))])
    touch('touchEnd',[]);js('window.__sprayBaseline=__mp.doc.slice()');time.sleep(.22)
    check('touch spray accumulates and stops on release',js('__sprayBaseline.some((v,i)=>v!==__touchBaseline[i])&&__sprayBaseline.every((v,i)=>v===__mp.doc[i])'))
    touch('touchStart',[(0,point(200,280))]);touch('touchCancel',[]);time.sleep(.2)
    check('OS gesture cancellation restores document and stops spray',js('__sprayBaseline.every((v,i)=>v===__mp.doc[i])&&MacPaintTouch.viewport().pointers===0&&!__mp.drag'))
    check('trusted touch path was exercised',js('__trustedTouches')>=5,js('__trustedTouches'))
    check('no runtime errors',not js('window.__touchErrors'),js('window.__touchErrors'))
    report={'passed':all(t['pass'] for t in tests),'total':len(tests),'tests':tests,'url':js('location.href')}
    Path(output).write_text(json.dumps(report,indent=2));return report
