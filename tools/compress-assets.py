# -*- coding: utf-8 -*-
"""
素材压缩工具（2026-10-17 上游同步后包体整治，一次性脚本）。
背景：同步 codex/current-sleepwell 后主包 2.77MB / breathe-worlds 分包 3.41MB，
双双超 2MB 上限。本脚本按「显示尺寸 × 肉眼无差」原则压缩：

- PNG 插画（头像/光晕/花枝）：Floyd-Steinberg 抖动量化到 256 色
  （实测 sleep.png 134KB->21KB，whale-full-glow 645KB->98KB，肉眼无差）
- 超尺 JPEG：按实际显示尺寸缩放后重编码（moon-lake 750x750 只显示 75x95pt）
- JPEG 背景图：重编码 quality 70 / subsampling=2 / progressive
- 音频：wav 源 48kbps -> 40kbps CBR（16kHz 单声道环境音，可闻差异极小）
- 死资产删除（night-cat.jpg 无任何引用）不在本脚本内，已用 git rm 处理

每个步骤带 target_kb 幂等 guard：已达到目标体积即跳过，可安全重复执行。
依赖：Pillow + lameenc（隔离 venv：~/.workbuddy/binaries/python/envs/default）
用法：python tools/compress-assets.py
"""
import os
import wave
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def kb(size):
    return f'{size / 1024:.1f}KB'


def quantize_png(rel, colors=256, target_kb=None):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f'  [跳过] {rel} 不存在')
        return 0
    before = os.path.getsize(path)
    if target_kb and before <= target_kb * 1024:
        print(f'  [跳过] {rel} 已达标（{kb(before)} ≤ {target_kb}KB）')
        return 0
    im = Image.open(path).convert('RGBA')
    im.quantize(colors=colors, dither=Image.Dither.FLOYDSTEINBERG).save(path, 'PNG', optimize=True)
    after = os.path.getsize(path)
    print(f'  {rel}: {kb(before)} -> {kb(after)}')
    return before - after


def reencode_jpg(rel, quality=70, scale=1.0, target_kb=None):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f'  [跳过] {rel} 不存在')
        return 0
    before = os.path.getsize(path)
    if target_kb and before <= target_kb * 1024:
        print(f'  [跳过] {rel} 已达标（{kb(before)} ≤ {target_kb}KB）')
        return 0
    im = Image.open(path).convert('RGB')
    if scale != 1.0:
        w, h = im.size
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im.save(path, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=2)
    after = os.path.getsize(path)
    print(f'  {rel}: {kb(before)} -> {kb(after)} (q{quality}, {im.size})')
    return before - after


def resize_jpg(rel, size, quality=72, target_kb=None):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f'  [跳过] {rel} 不存在')
        return 0
    before = os.path.getsize(path)
    if target_kb and before <= target_kb * 1024:
        print(f'  [跳过] {rel} 已达标（{kb(before)} ≤ {target_kb}KB）')
        return 0
    im = Image.open(path).convert('RGB').resize(size, Image.LANCZOS)
    im.save(path, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=2)
    after = os.path.getsize(path)
    print(f'  {rel}: {kb(before)} -> {kb(after)} (q{quality}, {im.size})')
    return before - after


def png_to_jpg(rel, quality=80):
    src = os.path.join(ROOT, rel)
    if not os.path.exists(src):
        print(f'  [跳过] {rel} 已是 jpg 或不存在')
        return 0
    dst = os.path.splitext(src)[0] + '.jpg'
    before = os.path.getsize(src)
    im = Image.open(src).convert('RGB')
    im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=2)
    os.remove(src)
    after = os.path.getsize(dst)
    print(f'  {rel} -> {os.path.basename(dst)}: {kb(before)} -> {kb(after)}')
    return before - after


def reencode_mp3(name, kbps=40, target_kb=None):
    src = os.path.join(ROOT, f'assets/audio/{name}.wav')
    dst = os.path.join(ROOT, f'assets/audio/{name}.mp3')
    if not os.path.exists(src):
        print(f'  [跳过] {name}.wav 不存在')
        return 0
    before = os.path.getsize(dst)
    if target_kb and before <= target_kb * 1024:
        print(f'  [跳过] {name}.mp3 已达标（{kb(before)} ≤ {target_kb}KB）')
        return 0
    import lameenc
    with wave.open(src, 'rb') as w:
        pcm = w.readframes(w.getnframes())
        rate = w.getframerate()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(kbps)
    encoder.set_in_sample_rate(rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    data = encoder.encode(pcm) + encoder.flush()
    with open(dst, 'wb') as f:
        f.write(data)
    after = os.path.getsize(dst)
    print(f'  {name}.mp3: {kb(before)} -> {kb(after)} ({kbps}kbps)')
    return before - after


print('== 主包：咨询师头像（首页精选区 + 咨询页卡片，170rpx 显示） ==')
for name in ['sleep', 'growth', 'cognitive', 'empathy', 'relation']:
    quantize_png(f'assets/counselors/{name}.png', target_kb=25)
quantize_png('assets/counselors/moon-garden.png', target_kb=12)

print('== 主包：agent 页超尺插图（recommendation-cover 只显示 150rpx x 190rpx） ==')
resize_jpg('assets/agent/moon-lake.jpg', (300, 380), quality=72, target_kb=12)

print('== 主包：环境音 48kbps -> 40kbps ==')
for name in ['breeze', 'lake', 'rain', 'white', 'complete']:
    reencode_mp3(name, kbps=40, target_kb=41)

print('== 主包：星空呼吸背景 q70 ==')
for name in ['starfield-figma-a', 'starfield-figma-b', 'starfield-inhale', 'starfield-rest']:
    reencode_jpg(f'assets/animation/{name}.jpg', quality=70, target_kb=45)

print('== 分包 breathe-worlds：光晕/星球 PNG 量化 ==')
quantize_png('pages/breathe/assets/breath-orb/orb-source.png', target_kb=110)
quantize_png('pages/breathe/assets/whale/whale-full-glow.png', target_kb=105)
quantize_png('pages/breathe/assets/whale/whale-fin-glow.png', target_kb=40)
quantize_png('pages/breathe/assets/whale/whale-tail-glow.png', target_kb=12)

print('== 分包 breathe-worlds：薰衣草背景（全屏，原生分辨率保尺寸） ==')
reencode_jpg('pages/breathe/assets/lavender/background.jpg', quality=70, target_kb=260)
reencode_jpg('pages/breathe/assets/lavender/original.jpg', quality=68, target_kb=255)

print('== 分包 breathe-worlds：云海/海水/星空 ==')
for name in ['cloud_1', 'cloud_2', 'cloud_3']:
    reencode_jpg(f'pages/breathe/assets/cloud/{name}.jpg', quality=72, target_kb=60)
reencode_jpg('pages/breathe/assets/whale/deep-sea-water-base-hd.jpg', quality=70, target_kb=35)
png_to_jpg('pages/breathe/assets/breath-firefly/sky-bg.png', quality=80)

print('== 分包 breathe-worlds：薰衣草花枝（36-81px 小图） ==')
for i in range(12):
    quantize_png(f'pages/breathe/assets/lavender/sprig-{i}.png', target_kb=9)

print('完成。请随后执行：node tools/pack-budget.js 验证两包体积。')
