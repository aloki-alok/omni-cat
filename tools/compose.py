"""Turns tools/dump-frames.ts output into the README assets.

  bun tools/dump-frames.ts > /tmp/frames.json
  uv run --with pillow python tools/compose.py /tmp/frames.json docs/assets

Writes omni-cat.gif (the demo), characters.png (every character and state) and
social-preview.png (the 1280x640 repo card). Needs a monospace font: set FONT_DIR
or install Hack Nerd Font; Menlo is the fallback.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BG = (11, 11, 11)
WINDOW = (22, 22, 22)
EDGE = (46, 46, 46)
TEXT = (232, 232, 232)
DIM = (128, 128, 128)
CYAN = (0, 229, 255)


def font(bold, size):
    name = 'HackNerdFont-Bold.ttf' if bold else 'HackNerdFont-Regular.ttf'
    for folder in (os.environ.get('FONT_DIR', ''), os.path.expanduser('~/Library/Fonts')):
        path = os.path.join(folder, name)
        if folder and os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', size, index=1 if bold else 0)


def sprite(draw, frame, x, y, scale):
    for i, px in enumerate(frame['px']):
        if px is not None:
            cx, cy = x + (i % frame['w']) * scale, y + (i // frame['w']) * scale
            draw.rectangle([cx, cy, cx + scale - 1, cy + scale - 1], fill=tuple(int(px[j:j + 2], 16) for j in (0, 2, 4)))


def hero_frame(item, index, total):
    w, h = 760, 316
    img = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([20, 20, w - 20, h - 20], radius=14, fill=WINDOW, outline=EDGE)
    for n, color in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        d.ellipse([42 + n * 22, 36, 54 + n * 22, 48], fill=color)
    title = 'claude'
    tw = d.textlength(title, font=font(False, 14))
    d.text(((w - tw) / 2, 34), title, font=font(False, 14), fill=DIM)
    d.line([20, 62, w - 20, 62], fill=EDGE)

    f = font(False, 18)
    d.text((46, 80), '❯', font=f, fill=CYAN)
    d.text((72, 80), '/omni test', font=f, fill=TEXT)
    if not item['detail']:  # the hint goes once the call has finished
        d.text((46, 112), 'Dialing your phone. Pick up when it rings.', font=font(False, 15), fill=DIM)

    sprite(d, item['frame'], 46, 150, 8)
    d.text((262, 178), item['note'], font=font(True, 22), fill=TEXT)
    if item['detail']:
        d.text((262, 214), item['detail'], font=font(False, 18), fill=DIM)

    d.rounded_rectangle([40, 262, w - 40, 290], radius=8, outline=EDGE)
    d.text((54, 266), '❯', font=f, fill=CYAN)
    if index % 2 == 0:  # a blinking cursor
        d.rectangle([76, 268, 84, 284], fill=TEXT)
    return img


def sheet(data):
    scale, pad, label_w, top = 6, 14, 92, 100
    fw, fh = 24 * scale, 12 * scale
    cols = len(data['labels'])
    w = label_w + cols * (fw + pad) + pad
    h = top + len(data['rows']) * (fh + pad) + 30
    img = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(img)
    d.text((pad + 4, 16), 'omni-cat characters', font=font(True, 18), fill=TEXT)
    d.text((pad + 4, 42), '/omni demo cat | crab | logo', font=font(False, 13), fill=DIM)
    for c, label in enumerate(data['labels']):
        x = label_w + pad + c * (fw + pad)
        d.text((x + 4, top - 18), label, font=font(False, 12), fill=DIM)
    for r, row in enumerate(data['rows']):
        y = top + r * (fh + pad)
        d.text((pad + 4, y + fh / 2 - 8), row['name'], font=font(True, 14), fill=CYAN)
        for c, frame in enumerate(row['frames']):
            x = label_w + pad + c * (fw + pad)
            d.rounded_rectangle([x - 2, y - 2, x + fw + 1, y + fh + 1], radius=6, fill=WINDOW, outline=EDGE)
            sprite(d, frame, x, y, scale)
    return img


def social(data):
    img = Image.new('RGB', (1280, 640), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([60, 60, 1220, 580], radius=24, fill=WINDOW, outline=EDGE)
    sprite(d, data['preview'], 110, 190, 20)
    d.text((620, 220), 'omni-cat', font=font(True, 72), fill=TEXT)
    d.text((620, 318), 'A pixel cat above your Claude Code prompt', font=font(False, 22), fill=DIM)
    d.text((620, 354), 'that runs an OmniDimension test call.', font=font(False, 22), fill=DIM)
    d.text((620, 440), '❯ /omni demo cat', font=font(False, 28), fill=CYAN)
    return img


def main(src, out):
    data = json.load(open(src))
    os.makedirs(out, exist_ok=True)
    frames = [hero_frame(item, i, len(data['hero'])) for i, item in enumerate(data['hero'])]
    paletted = [f.quantize(colors=48, method=Image.Quantize.MEDIANCUT) for f in frames]
    durations = [400] * len(paletted)
    durations[-1] = 2200  # hold on the happy ending
    paletted[0].save(os.path.join(out, 'omni-cat.gif'), save_all=True, append_images=paletted[1:],
                     duration=durations, loop=0, optimize=True, disposal=2)
    sheet(data['sheet']).save(os.path.join(out, 'characters.png'), optimize=True)
    social(data).save(os.path.join(out, 'social-preview.png'), optimize=True)
    for name in ('omni-cat.gif', 'characters.png', 'social-preview.png'):
        print(name, os.path.getsize(os.path.join(out, name)) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
