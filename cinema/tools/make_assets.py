#!/usr/bin/env python3
"""Reproducible art compositing from two generated concept sheets.
No fictitious native resolution claims: dimensions and crop sources in manifest.
"""
from __future__ import annotations
import json, math, random, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps
ROOT = Path(__file__).resolve().parents[1]
SRC_A = Image.open(ROOT/'assets/source/cinematic_reference_a.png').convert('RGB')
SRC_B = Image.open(ROOT/'assets/source/cinematic_reference_b.png').convert('RGB')
DEST = ROOT/'assets/keyframes'; DEST.mkdir(parents=True,exist_ok=True)

# Clean art regions are extracted from assistant-generated cinematic composites.
# Crops are not pristine native camera photos; some are repurposed thumbnail artwork.
SHOTS = {
 'city_dawn': ('A',(920,50,1390,615),'city', (21,34,46), 'quiet sunrise with a city-sized ring'),
 'gateway': ('A',(915,50,1390,610),'ring',(18,31,45),'the central broken signal ring'),
 'vault': ('A',(1235,655,1521,833),'vault',(18,34,43),'planetarium vault with hologram'),
 'archive': ('B',(300,574,596,756),'corridor',(22,33,37),'infinite shelves and archive corridor'),
 'memory': ('B',(301,574,598,756),'glitch',(30,31,41),'corrupted memory stacks'),
 'edda': ('A',(840,655,1136,832),'face',(20,35,39),'consistent single archival face portrait'),
 'genome': ('B',(606,574,899,755),'helix',(12,43,45),'campaign genome illuminated in a dark laboratory'),
 'lab': ('B',(606,574,899,755),'lab',(28,37,37),'quiet genome laboratory'),
 'outcome': ('B',(310,80,900,330),'dawn',(44,39,43),'morning city and future branch'),
}

def linear_gradient(w,h, first, second, axis=0):
 a=np.asarray(first,np.float32); b=np.asarray(second,np.float32)
 if axis==0: t=np.linspace(0,1,w,dtype=np.float32)[None,:,None]
 else: t=np.linspace(0,1,h,dtype=np.float32)[:,None,None]
 result=(a*(1-t)+b*t)
 if axis==0: result=np.broadcast_to(result,(h,w,3))
 else: result=np.broadcast_to(result,(h,w,3))
 return result.copy()

def overlay_details(im, mode, seed, tone):
 w,h=im.size; rng=random.Random(seed)
 canvas=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(canvas,'RGBA')
 cx=int(w*.69);cy=int(h*.45)
 if mode in ('ring','city','dawn'):
  if mode=='ring':
   for i in range(7):
    r=int(h*(.20+.014*i)); col=(100,200,194,max(10,48-i*6))
    d.arc((cx-r,cy-r,cx+r,cy+r),15,342,fill=col,width=max(1,8-i))
  for _ in range(210):
   x=rng.randint(int(w*.38),w-10); y=rng.randint(int(h*.38),h)
   if rng.random()<.29:
    d.line((x,y,x,y+rng.randint(1,7)),fill=(239,177,102,rng.randint(16,60)),width=1)
 elif mode in ('corridor','glitch'):
  vanish=(int(w*.72),int(h*.45))
  for i in range(24):
   x=int(i*w/25)
   y=int(h*.08 + abs(x-vanish[0])*.12)
   d.line((x,0,vanish[0],vanish[1]),fill=(101,159,164,10),width=1)
   d.line((x,h,vanish[0],vanish[1]),fill=(195,143,94,12),width=1)
  for i in range(24):
   y=int(h*.14+i*h*.035)
   d.line((int(w*.47),y,w,y),fill=(105,186,182,10),width=1)
  if mode=='glitch':
   for _ in range(30):
    y=rng.randint(0,h); x=rng.randint(w//2,w); rw=rng.randint(50,240)
    d.rectangle((x,y,min(w,x+rw),y+rng.randint(1,3)),fill=(232,102,90,22))
 elif mode in ('helix','lab'):
  mid=int(w*.74)
  for i in range(124):
   y=int(h*.07+i*h*.0071)
   wave=math.sin(i*.20)
   x1=int(mid+wave*w*.067); x2=int(mid-wave*w*.067)
   if i%3==0:
    d.line((x1,y,x2,y),fill=(112,236,205,48),width=2)
   r=3
   d.ellipse((x1-r,y-r,x1+r,y+r),fill=(116,248,199,68))
   d.ellipse((x2-r,y-r,x2+r,y+r),fill=(254,202,132,58))
 elif mode=='vault':
  for i in range(5):
   r=int(h*(.19+.030*i));d.arc((cx-r,cy-r,cx+r,cy+r),-45,225,fill=(115,190,189,80-i*12),width=2)
 elif mode=='face':
  # Archival hairline/identity glyph behind the provided face, not invented second face.
  for i in range(8):
   x=int(w*.55+i*w*.048)
   d.line((x,0,x,h),fill=(130,207,195,18),width=2)
 # fine diagonal light, sparse city dust
 for _ in range(140):
  x=rng.randint(int(w*.36),w-1); y=rng.randint(0,h-1)
  d.ellipse((x,y,x+1,y+1),fill=(201,223,215,rng.randint(18,62)))
 return Image.alpha_composite(im.convert('RGBA'),canvas).convert('RGB')

def make_frame(key, size, phone=False):
 source, bounds, mode, tint, desc = SHOTS[key]
 src = (SRC_A if source=='A' else SRC_B).crop(bounds)
 w,h=size
 centering = (0.65,0.48) if key in ('city_dawn','gateway','outcome') else (0.5,0.5)
 # A native crop sometimes comes from a small storyboard thumbnail; scaling is recorded in manifest.
 raw = ImageOps.fit(src,(w,h),Image.Resampling.LANCZOS,centering=centering)
 raw = ImageEnhance.Contrast(raw).enhance(1.11)
 pix=np.asarray(raw).astype(np.float32)
 col=np.array(tint,dtype=np.float32).reshape(1,1,3)
 # cinematic tint, strong left matte serves as text safe region; right detail remains legible.
 x=np.linspace(0,1,w,dtype=np.float32)[None,:,None]
 y=np.linspace(0,1,h,dtype=np.float32)[:,None,None]
 left = .68 * np.power(np.maximum(0,1-x/.63),1.8)
 right = .07 + .15 * np.power(np.maximum(0,(x-.84)/.16),1.0)
 low = .15 * np.maximum(0,(y-.77)/.23)
 blend=np.clip(left+right+low,.05,.90)
 pix=pix*(1-blend)+col*blend
 # cold blue/green shadows, warm high luminance, retaining fidelity to reference.
 lum=(pix[:,:,0]*.25+pix[:,:,1]*.58+pix[:,:,2]*.17)[:,:,None]
 pix = pix*.90 + lum*np.array([.83,1.04,1.10])[None,None,:]*.10
 # Fog band as a subtle wide glow.
 yy=np.arange(h,dtype=np.float32)[:,None,None]
 fog = np.exp(-((yy-h*.71)/(h*.20))**2) * (.07 if key=='edda' else .11)
 pix=np.clip(pix*(1-fog)+np.array([128,158,164])[None,None,:]*fog,0,255).astype(np.uint8)
 out=Image.fromarray(pix,'RGB')
 out=overlay_details(out,mode,hashlib.sha1(key.encode()).digest()[0],tint)
 return out

manifest={'generator':'tools/make_assets.py','originals':{},'assets':[]}
for name,(source,crop,mode,tint,desc) in SHOTS.items():
 manifest['originals'][name]={'source':f'cinematic_reference_{source.lower()}.png','source_full_pixels':[1536,1024], 'source_crop_xyxy':list(crop),'native_crop_pixels':[crop[2]-crop[0],crop[3]-crop[1]],'note':'Generated composite poster crop; source may contain graphic overlays near crop boundaries.'}
 for size,suffix in [((1600,900),'desktop'),((720,1080),'mobile')]:
  im=make_frame(name,size,phone=suffix=='mobile')
  outfile=DEST/f'{name}-{suffix}.webp'
  im.save(outfile,'WEBP',quality=83,method=5)
  manifest['assets'].append({'id':name+'-'+suffix,'path':'assets/keyframes/'+outfile.name,'pixels':list(size),'format':'WebP','upscaled_from_crop':True,'compression_quality':83,'size_bytes':outfile.stat().st_size,'description':desc})
(ROOT/'assets/ASSET_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Created',len(manifest['assets']),'keyframes; total',sum(a['size_bytes'] for a in manifest['assets']),'bytes')
