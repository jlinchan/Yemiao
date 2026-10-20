# -*- coding: utf-8 -*-
# 一次性脚本：操作栏近白 SVG -> 高清 PNG（4x = 96px，透明底），真机渲染 100% 可靠（用后即删）
import io, os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from reportlab.graphics.shapes import Drawing

ICONS = ['copyLight', 'speakerLight', 'likeLight', 'dislikeLight', 'regenerateLight', 'dotsLight']

import sys
sys.path.insert(0, '.')
icons = {}
exec(io.open('utils/agent-icons.js', encoding='utf-8').read().split('module.exports')[0], {}, icons) if False else None
# 直接从 node 导出的 JSON 读取（避免 js 解析）
import subprocess, json
out = subprocess.check_output(['node', '-e', "const i=require('./utils/agent-icons');console.log(JSON.stringify({copyLight:i.copyLight,speakerLight:i.speakerLight,likeLight:i.likeLight,dislikeLight:i.dislikeLight,regenerateLight:i.regenerateLight,dotsLight:i.dotsLight}))"])
data = json.loads(out.decode('utf-8'))

SIZE = 96  # 4x of 24 viewBox
for name, uri in data.items():
    svg_text = uri.replace('data:image/svg+xml;charset=utf-8,', '')
    import urllib.parse
    svg_text = urllib.parse.unquote(svg_text)
    drawing = svg2rlg(io.BytesIO(svg_text.encode('utf-8')))
    scale = SIZE / drawing.width
    drawing.width = SIZE
    drawing.height = SIZE
    drawing.scale(scale, scale)
    out_path = 'assets/agent/icons/light-%s.png' % name.replace('Light', '').lower()
    renderPM.drawToFile(drawing, out_path, fmt='PNG', bg=0x00000000)
    print('%-44s %6.1fKB' % (out_path, os.path.getsize(out_path) / 1024))
print('done')
