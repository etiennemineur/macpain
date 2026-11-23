from pathlib import Path
import struct
from PIL import Image
root=Path(__file__).parent

def decode_pict(b):
 p=10;out=Image.new('1',(416,240),1)
 def u16():
  nonlocal p
  v=struct.unpack_from('>H',b,p)[0];p+=2;return v
 def rect():
  nonlocal p
  v=struct.unpack_from('>hhhh',b,p);p+=8;return v
 while p<len(b):
  op=b[p];p+=1
  if op==0:continue
  if op==0x11:p+=1;continue
  if op==1:
   n=u16();p+=n-2;continue
  if op==0xff:break
  if op not in [0x90,0x98]:raise ValueError((hex(op),p))
  stride=u16();bounds=rect();source=rect();dest=rect();mode=u16()
  top,left,bottom,right=bounds
  for y in range(bottom-top):
   if op==0x98 and stride>=8:
    n=u16() if stride>250 else b[p]
    if stride<=250:p+=1
    data=b[p:p+n];p+=n;row=bytearray();i=0
    while i<len(data):
     code=data[i];i+=1
     if code<=127:row.extend(data[i:i+code+1]);i+=code+1
     elif code>128:row.extend([data[i]]*(257-code));i+=1
   else:row=b[p:p+stride];p+=stride
   assert len(row)==stride,(len(row),stride)
   for x in range(right-left):
    X=dest[1]-80+x;Y=dest[0]-48+y
    if 0<=X<416 and 0<=Y<240:out.putpixel((X,Y),0 if row[x//8]&(128>>(x%8)) else 1)
 return out
if __name__=='__main__':
 for f in (root/'resources/MacPaint').glob('PICT_*.bin'):
  im=decode_pict(f.read_bytes());im.save(root/(f.stem+'.png'));print(f.name,im.size)
