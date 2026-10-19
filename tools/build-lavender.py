"""Package the twelve photographed layers and reproduce the Figma Motion tracks."""
import argparse
import math
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--layers', type=Path, required=True)
parser.add_argument('--original', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
assets = root / 'pages' / 'breathe' / 'assets' / 'lavender'
assets.mkdir(parents=True, exist_ok=True)
Image.open(args.layers / 'repaired-background.png').convert('RGB').save(assets / 'background.jpg', quality=90, optimize=True)
Image.open(args.original).convert('RGB').save(assets / 'original.jpg', quality=88, optimize=True)
css = ['/* Generated from the 16-second Figma Motion rotation tracks. */']
for i in range(12):
    Image.open(args.layers / f'sprig-{i}.png').save(assets / f'sprig-{i}.png', optimize=True)
    css.append(f'.lavender-anchor--{i} {{ animation-name: lavenderSway{i}; }}')
    css.append(f'@keyframes lavenderSway{i} {{')
    for j in range(129):
        u = j / 8 * math.pi / 8
        if i < 3:
            angle = [5.5, 6.2, 5.8][i] * math.sin(2*u+i*1.7) + .7*math.sin(3*u+i)
        else:
            k = i - 3
            amp = 4.5 + (k % 3)*.6 if k < 5 else 2.5 + (k % 3)*.4
            angle = amp*math.sin(2*u+i*1.7) + .6*math.sin(3*u+i)
        css.append(f'  {j / 128 * 100:.5f}% {{ transform: rotate({-angle:.5f}deg); }}')
    css.append('}')
(root / 'pages' / 'breathe' / 'components' / 'lavender-scene' / 'motion.wxss').write_text('\n'.join(css) + '\n', encoding='ascii')
print('Lavender assets:', sum(p.stat().st_size for p in assets.iterdir()), 'bytes')
