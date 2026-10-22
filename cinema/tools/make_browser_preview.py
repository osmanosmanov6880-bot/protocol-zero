"""Render-only browser bridge for environments that block localhost navigation.
This does not modify the shipped ES-module application and must not be used for production.
"""
from pathlib import Path
import re,base64,html,json,sys
root=Path(__file__).resolve().parent.parent
mode=sys.argv[1] if len(sys.argv)>1 else 'full'
files=['story/scenes.mjs','story/prototype.mjs','story/engine.mjs','src/audio.mjs','src/particles.mjs','story/site-config.mjs','src/reality.mjs','src/app.mjs']
code=''
for path in files:
    source=(root/path).read_text()
    source=re.sub(r'^import .*?;\s*$', '', source,flags=re.M)
    source=re.sub(r'\bexport (const|function|class)\b',r'\1',source)
    if path=='src/app.mjs':
        source=re.sub(r'const mode = new URLSearchParams\(window.location.search\).*?;\n', f'const mode = {json.dumps(mode)};\n',source,count=1)
        source=re.sub(r'function imageUrl\(scene,device\)\{[^\n]+\}', "function imageUrl(scene,device){return __assetURLs[scene.image+'-'+device]||'';}",source,count=1)
    code+=source+'\n'
assets={}
for f in (root/'assets/keyframes').glob('*.webp'):
    assets[f.stem]='data:image/webp;base64,'+base64.b64encode(f.read_bytes()).decode()
code='const __assetURLs='+json.dumps(assets)+';\n'+code
code=code.replace('</script>','<\\/script>')
s=(root/'index.html').read_text()
s=re.sub(r'<link[^>]*rel="preload"[^>]*>', '',s)
s=re.sub(r'<link[^>]*rel="icon"[^>]*>', '',s)
s=s.replace('<link rel="stylesheet" href="src/main.css"/>','<style>'+ (root/'src/main.css').read_text() +'</style>')
s=s.replace('<script type="module" src="src/app.mjs"></script>','')
for f in (root/'assets/keyframes').glob('*.webp'):
    target='assets/keyframes/'+f.name
    s=s.replace(target,assets[f.stem])
s=s.replace('</body>','<script>'+code+'</script>\n</body>')
p=root/'previews'/f'bridge-{mode}.html';p.parent.mkdir(exist_ok=True);p.write_text(s)
print('generated',p,'bytes',p.stat().st_size)
