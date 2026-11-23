"""Read an MFS disk and list/extract its two forks. Reference analysis only."""
from pathlib import Path
import struct,json
root=Path(__file__).parent
d=(root/'Paint_2.dsk').read_bytes()
u16=lambda off:struct.unpack_from('>H',d,off)[0]
u32=lambda off:struct.unpack_from('>I',d,off)[0]
m=1024
nfiles=u16(m+12); dst=u16(m+14)*512; dlen=u16(m+16)*512
bs=u32(m+20); start=u16(m+28)*512
bmap=d[m+64:dst]
def link(b):
    i=b-2;p=i*3//2;v=int.from_bytes(bmap[p:p+2],'big')
    return (v>>4) if not i%2 else (v&4095)
def fork(b,size):
    out=b'';seen=set()
    while b>=2 and b not in seen and len(out)<size:
        seen.add(b);out+=d[start+(b-2)*bs:start+(b-1)*bs];b=link(b)
    assert len(out)>=size,(b,size,len(out))
    return out[:size]
outdir=root/'forks';outdir.mkdir(exist_ok=True)
p=dst;files=[]
while p<dst+dlen and len(files)<nfiles:
    if not d[p]&128:p=(p//512+1)*512;continue
    l=d[p+50];name=d[p+51:p+51+l].decode('mac_roman')
    info={'name':name,'type':d[p+2:p+6].decode('mac_roman'),'creator':d[p+6:p+10].decode('mac_roman')}
    for typ,bo,so in [('data',22,24),('rsrc',32,34)]:
        size=u32(p+so);info[typ]=size
        if size:(outdir/(name.replace('/','_')+'.'+typ)).write_bytes(fork(u16(p+bo),size))
    files.append(info);p+=51+l;p+=p%2
(root/'files.json').write_text(json.dumps(files,indent=2));print(json.dumps(files,indent=2))

def resources(data):
    dataoff,mapoff,dlen,mlen=struct.unpack_from('>IIII',data)
    tyoff=mapoff+struct.unpack_from('>H',data,mapoff+24)[0]
    nmoff=mapoff+struct.unpack_from('>H',data,mapoff+26)[0]
    ntypes=struct.unpack_from('>H',data,tyoff)[0]+1
    out=[]
    for i in range(ntypes):
        t,n,off=struct.unpack_from('>4sHH',data,tyoff+2+i*8)
        for j in range(n+1):
            p=tyoff+off+j*12
            rid,no=struct.unpack_from('>hH',data,p)
            attr=int.from_bytes(data[p+4:p+8],'big'); pos=dataoff+(attr&0xffffff)
            size=struct.unpack_from('>I',data,pos)[0]
            name=''
            if no!=65535:
                nl=data[nmoff+no];name=data[nmoff+no+1:nmoff+no+1+nl].decode('mac_roman')
            out.append((t.decode('mac_roman'),rid,name,data[pos+4:pos+4+size]))
    return out
if __name__=='__main__':
    for f in outdir.glob('*.rsrc'):
        r=resources(f.read_bytes());print(f.name,[(t,rid,n,len(b)) for t,rid,n,b in r if t in ['FONT','NFNT','MENU','PAT#','STR#','vers']])
        target=root/'resources'/f.stem;target.mkdir(parents=True,exist_ok=True)
        idx=[]
        for t,rid,n,b in r:
            (target/(t+'_'+str(rid)+'.bin')).write_bytes(b);idx.append([t,rid,n,len(b)])
        (target/'index.json').write_text(json.dumps(idx,ensure_ascii=False,indent=2))
