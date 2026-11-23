"""Extract unchanged FONT resources from a pinned archive of classic Mac suitcases."""
from pathlib import Path
import struct,zipfile,json,hashlib
root=Path(__file__).parent
archive=root/'OriginalFonts.zip'
source='https://github.com/JohnDDuncanIII/macfonts/blob/2091a81a224136df1529256a701c27638aebf84e/Macintosh%20OS%201-6/Originals/Originals.zip'
def resource_records(data):
 dataoff,mapoff,dlen,mlen=struct.unpack_from('>IIII',data)
 tyoff=mapoff+struct.unpack_from('>H',data,mapoff+24)[0]
 nmoff=mapoff+struct.unpack_from('>H',data,mapoff+26)[0]
 count=struct.unpack_from('>H',data,tyoff)[0]+1
 for i in range(count):
  typ,n,off=struct.unpack_from('>4sHH',data,tyoff+2+i*8)
  for j in range(n+1):
   p=tyoff+off+j*12;rid,no=struct.unpack_from('>hH',data,p)
   pos=dataoff+(int.from_bytes(data[p+4:p+8],'big')&0xffffff)
   size=struct.unpack_from('>I',data,pos)[0]
   name=''
   if no!=65535:
    nl=data[nmoff+no];name=data[nmoff+no+1:nmoff+no+1+nl].decode('mac_roman')
   yield typ.decode('mac_roman'),rid,name,data[pos+4:pos+4+size]
def apple_double_resource(b):
 assert struct.unpack_from('>I',b)[0]==0x00051607
 for i in range(struct.unpack_from('>H',b,24)[0]):
  kind,offset,size=struct.unpack_from('>III',b,26+12*i)
  if kind==2:return b[offset:offset+size]
 raise ValueError('No resource fork in AppleDouble')
out=root/'resources/AdditionalFonts';out.mkdir(parents=True,exist_ok=True)
rows=[]
with zipfile.ZipFile(archive) as z:
 for member,allowed in [('__MACOSX/._LOSTFONTS',{2,3,4,5,6,7,8,9,11,12,24}),('__MACOSX/._System 6.0.8 Fonts_ff',{23})]:
  for typ,rid,name,data in resource_records(apple_double_resource(z.read(member))):
   if typ!='FONT' or not data or rid//128 not in allowed:continue
   dest=out/('FONT_'+str(rid)+'.bin');dest.write_bytes(data)
   rows.append({'member':member,'id':rid,'familyId':rid//128,'pointSize':rid%128,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
provenance={'source':source,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'records':rows,'notes':['Original FONT bytes, not the OS X dfont/CairoSplices adaptations.','LOSTFONTS identifies Taliesin (later renamed Mobile); keep its historical menu name.','Symbol is an additional classic Mac font, sourced separately from the System 6 suitcase.','Existing 1.5 disk strikes have priority over later copies of the same family/size.']}
(root/'additional-fonts-provenance.json').write_text(json.dumps(provenance,indent=2))
print(json.dumps({'records':len(rows),'families':sorted(set(r['familyId'] for r in rows)),'archive_sha256':provenance['archive_sha256']},indent=2))
