"""Download the Figma asset manifest and create local web assets."""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/figma'
DEST.mkdir(parents=True, exist_ok=True)

def download(asset):
    target = DEST / asset['file']
    if not target.exists():
        subprocess.run(['curl.exe', '-f', '-L', '--retry', '2', '-sS', asset['url'], '-o', str(target)], check=True)
    if target.suffix != '.svg':
        with Image.open(target) as image:
            image.save(target.with_suffix('.webp'), 'WEBP', quality=88, method=6)
    return target.name

assets = json.loads((ROOT / 'design-reference/assets.json').read_text())
with ThreadPoolExecutor(max_workers=8) as pool:
    print('Prepared', len(list(pool.map(download, assets))), 'Figma assets')

for target in (ROOT / 'public/assets').rglob('*'):
    if target.suffix.lower() in ('.jpg', '.jpeg', '.png') and target.parent != DEST:
        with Image.open(target) as image:
            image.save(target.with_suffix('.webp'), 'WEBP', quality=88, method=6)

fonts = ROOT / 'public/fonts'
fonts.mkdir(exist_ok=True)
installed = Path.home() / 'AppData/Local/Microsoft/Windows/Fonts'
for source, name in [('Camood-BF68b8ed85bcac9.otf', 'camood'), ('cetrinn.otf', 'cetrinn'), ('PinyonScript-Regular.otf', 'pinyon-script')]:
    font = TTFont(installed / source)
    font.flavor = 'woff2'
    font.save(fonts / f'{name}.woff2')
print('Prepared WebP images and three local WOFF2 fonts')
