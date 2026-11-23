"""Extract historical font strikes, menu definitions and screenshot patterns.
No application code or disk image is included in the web build.
"""
from pathlib import Path
import struct,json,base64
from PIL import Image
root=Path(__file__).parent;src=root.parent
ref=Image.open(src/'macpaint.png').convert('RGB')
# Native reference pixels, not rescaled; 2px extra logical screen at right,
# extra bottom row of the screenshot omitted explicitly.
out=Image.new('RGB',(512,342),'white');out.paste(ref,(0,0))
# Store chrome in compact row-major bits, viewport replaced by white.
pix=out.load()
for y in range(47,287):
 for x in range(80,496):pix[x,y]=(255,255,255)
# Remove reference mouse cursor on paper (covered above) and temporary
# line-width popup at lower left; restore desktop in this area.
# Preserve the line-width popup shown in the supplied reference, exactly.
# It contains 1, 2, 4 and 8 pixel strokes, not 1/2/3/4.
pass
# The palette's selected brush is restored as an ordinary white cell.
for y in range(94,115):
 for x in range(16,41):pix[x,y]=tuple(255-v for v in pix[x,y])
# Save font records exactly (classic FONT format).
fonts={};names={0:'Chicago',2:'New York',3:'Geneva',4:'Monaco',5:'Venice',6:'London',7:'Athens',8:'San Francisco',9:'Toronto',11:'Cairo',12:'Los Angeles',23:'Symbol',24:'Taliesin'}
for f in list((root/'resources/System').glob('FONT_*.bin'))+list((root/'resources/AdditionalFonts').glob('FONT_*.bin')):
 b=f.read_bytes();rid=int(f.stem.split('_')[1]);fid,size=divmod(rid,128)
 if not b or fid not in names:continue
 if str(size) in fonts.get(names[fid],{}):continue
 ft,first,last,mw,kern,nd,rw,rh,ow,asc,desc,lead,words=struct.unpack_from('>HHHHhhhHHhhhH',b)
 stride=words*2;locoff=26+stride*rh;count=last-first+1
 loc=list(struct.unpack_from('>'+str(count+2)+'H',b,locoff))
 owpos=16+ow*2
 glyphs={}
 for i in range(count+1):
  code=first+i if i<count else 0xffff
  off,width=b[owpos+2*i:owpos+2*i+2]
  if off==255 and width==255:continue
  if off>=128:off-=256
  x0,x1=loc[i],loc[i+1];w=x1-x0
  bits=[]
  for y in range(rh):
   bits.append(''.join('1' if b[26+y*stride+x//8]&(128>>(x%8)) else '0' for x in range(x0,x1)))
  glyphs[str(code)]={'w':w,'advance':width,'offset':off+kern,'rows':bits}
 fonts.setdefault(names[fid],{})[str(size)]={'height':rh,'ascent':asc,'descent':desc,'leading':lead,'glyphs':glyphs}
# Original menu resources.
menus=[]
for f in sorted((root/'resources/MacPaint').glob('MENU_*.bin')):
 b=f.read_bytes();p=14;l=b[p];p+=1;title=b[p:p+l].decode('mac_roman');p+=l;items=[]
 while p<len(b) and b[p]:
  l=b[p];p+=1;t=b[p:p+l].decode('mac_roman');p+=l
  icon,key,mark,style=b[p:p+4];p+=4;items.append({'text':t,'key':chr(key) if key else '', 'style':style})
 menus.append({'title':title,'items':items})
# The 38 original QuickDraw system patterns.
b=(root/'resources/System/PAT#_0.bin').read_bytes();n=struct.unpack_from('>H',b)[0]
patterns=[b[2+8*i:10+8*i].hex().upper() for i in range(n)]
# Exact screenshot patterns: 19 columns, 2 rows, 20px per cell.
# Use the first 8x8 interior sample, preserve its pixel phase.
patterns_screen=[]
for r in range(2):
 for c in range(19):
  x0=120+c*20;y0=300+r*17
  vals=[]
  for yy in range(8):
   v=0
   for xx in range(8):v=(v<<1)|(1 if sum(ref.getpixel((x0+xx,y0+yy)))<384 else 0)
   vals.append(v)
  patterns_screen.append(bytes(vals).hex().upper())
# Extract 20 unselected tool cell bitmaps (25x21) as painted, positions intact.
tools=['lasso','marquee','hand','text','bucket','spray','brush','pencil','line','eraser','rect','rectFill','rrect','rrectFill','oval','ovalFill','freeform','freeformFill','polygon','polygonFill']
ic=[]
for i,name in enumerate(tools):
 x0=16+(i%2)*26;y0=28+(i//2)*22
 rows=[]
 for y in range(21):
  row=''
  for x in range(25):
   on=sum(ref.getpixel((x0+x,y0+y)))<384
   if i==6:on=not on
   row+='1' if on else '0'
  rows.append(row)
 ic.append({'tool':name,'x':x0,'y':y0,'rows':rows})
raw=bytearray()
for y in range(342):
 for x in range(0,512,8):
  v=0
  for xx in range(8):v=(v<<1)|(sum(out.getpixel((x+xx,y)))<384)
  raw.append(v)
# Decode legacy MacRoman explicitly rather than trusting OS fallback.
chars={chr(i):i for i in range(32,127)}
chars.update({'⌘':17,'✓':18,'◆':19})
for i in range(128,256):chars[bytes([i]).decode('mac_roman')]=i
from decode_help import decode_pict
help_pages={}
for rid,name in [(2400,'intro'),(2401,'shortcuts')]:
 im=decode_pict((root/('resources/MacPaint/PICT_'+str(rid)+'.bin')).read_bytes())
 packed=bytearray()
 for yy in range(240):
  for xx in range(0,416,8):
   value=0
   for bit in range(8):value=(value<<1)|(im.getpixel((xx+bit,yy))==0)
   packed.append(value)
 help_pages[name]=base64.b64encode(packed).decode()
j={'fontSources':json.loads((root/'additional-fonts-provenance.json').read_text()),'help':help_pages,'source':'https://archive.org/details/mac_Paint_2','fonts':fonts,'menus':menus,'patterns':patterns,'screenPatterns':patterns_screen,'tools':ic,'charcodes':chars,'chrome':base64.b64encode(raw).decode()}
(src/'classic-data.js').write_text('/* MacPaint 1.5 reference data: original bitmap FONT strikes, MENU and PAT# resources. */\nwindow.MP15_DATA='+json.dumps(j,separators=(',',':'),ensure_ascii=True)+';\n')
(root/'extracted-summary.json').write_text(json.dumps({'fonts':{k:list(v) for k,v in fonts.items()},'menus':menus,'patterns':patterns,'screenPatterns':patterns_screen},indent=2))
out.save(root/'chrome-reference.png')
print('Font strikes:',{k:list(v) for k,v in fonts.items()});print('patterns',len(patterns),'tools',len(ic),'JS bytes',(src/'classic-data.js').stat().st_size)
