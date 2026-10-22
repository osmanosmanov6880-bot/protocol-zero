#!/usr/bin/env python3
"""Deterministically bundle the authored HTML/CSS/ES modules and local WebP assets.
No API calls, no npm dependencies. Suitable for opening as a single local HTML file.
"""
from pathlib import Path
import re,base64,sys
R=Path(__file__).resolve().parents[1]
SRC=R/'index.html'
html=SRC.read_text(encoding='utf-8')
css=(R/'src/main.css').read_text(encoding='utf-8')
order=['story/scenes.mjs','story/prototype.mjs','story/engine.mjs','story/site-config.mjs','src/audio.mjs','src/particles.mjs','src/app.mjs']
parts=[]
for rel in order:
 text=(R/rel).read_text(encoding='utf-8')
 text=re.sub(r'^import .*?;\s*$', '', text,flags=re.MULTILINE)
 text=re.sub(r'^export (?=(const|function|class)\b)', '', text,flags=re.MULTILINE)
 parts.append('// '+rel+'\n'+text)
bundle='\n\n'.join(parts)
frames={}
for file in sorted((R/'assets/keyframes').glob('*.webp')):
 frames[file.name]='data:image/webp;base64,'+base64.b64encode(file.read_bytes()).decode('ascii')
# Scene-keyframe URLs are replaced with equivalent inlined asset URIs.
expr="function imageUrl(scene,device){return `assets/keyframes/${scene.image}-${device}.webp`;}"
replace="const _offlineImages = "+repr(frames)+";\nfunction imageUrl(scene,device){return _offlineImages[`${scene.image}-${device}.webp`] || _offlineImages['city_dawn-desktop.webp'];}"
if expr not in bundle:raise RuntimeError('imageUrl function changed; update offline bundler')
bundle=bundle.replace(expr,replace)
# Unlike a module script, the bundle must appear AFTER all HTML elements it uses.
script='<script>\n'+bundle.replace('</script>','<\\/script>')+'\n</script>'
if '<script type="module" src="src/app.mjs"></script>' not in html:raise RuntimeError('index.html entrypoint changed')
html=html.replace('<script type="module" src="src/app.mjs"></script>','')
html=html.replace('<link rel="stylesheet" href="src/main.css"/>','<style>\n'+css+'\n</style>')
html=re.sub(r'<link rel="preload"[^>]+>', '', html)
for name in ['city_dawn-desktop.webp','city_dawn-mobile.webp']:
 html=html.replace('assets/keyframes/'+name,frames[name])
html=html.replace('</body>',script+'\n</body>')
html=html.replace('<title>PROTOCOL ZERO — Наследники сигнала</title>', '<title>PROTOCOL ZERO — Наследники сигнала · Offline Cinema</title>')
out=R/'offline/PROTOCOL_ZERO_OFFLINE.html';out.write_text(html,encoding='utf-8')
print(f'BUILT {out} bytes={out.stat().st_size} embedded-keyframes={len(frames)} modules={len(order)}')
if '--export' in sys.argv:
 external=Path('/mnt/data/PROTOCOL_ZERO_CINEMA_OFFLINE_v1.0.0.html');external.write_bytes(out.read_bytes());print('EXPORTED',external)
