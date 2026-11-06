"""背景 JPG（assets/*-pc.jpg / *-sp.jpg）を画素粒子データに変換する。

使い方: python3 tools/make_particles.py  （Pillow が必要。先に make_backgrounds.py で背景を作っておく）

出力: assets/particles/<name>.js
  file:// で開いたページでもブラウザ側で画像の画素を読めないため、粒子データは
  通常の <script> で読み込める JS（base64）として書き出す。
  1粒子 = 8 バイト: uint16 列, uint16 行, uint8 R, G, B, 予備
"""
import base64
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
OUT = A / "particles"
GRID = {"pc": (534, 300), "sp": (260, 562)}   # 標本化する格子（PC は約3px、スマホは約3px間隔）
MIN_LUM = 14                                  # これより暗い画素は粒子にしない（黒背景を省いて軽くする）


def convert(name, kind):
    gw, gh = GRID[kind]
    im = Image.open(A / f"{name}-{kind}.jpg").convert("RGB").resize((gw, gh), Image.BOX)
    px = im.load()
    buf = bytearray()
    n = 0
    for y in range(gh):
        for x in range(gw):
            r, g, b = px[x, y]
            if 0.299 * r + 0.587 * g + 0.114 * b < MIN_LUM:
                continue
            buf += struct.pack("<HHBBBB", x, y, r, g, b, 0)
            n += 1
    b64 = base64.b64encode(bytes(buf)).decode()
    js = (f"(window.PARTICLE_DATA=window.PARTICLE_DATA||{{}})['{name}-{kind}']="
          f"{{w:{gw},h:{gh},n:{n},b64:'{b64}'}};\n")
    (OUT / f"{name}-{kind}.js").write_text(js)
    print(f"{name}-{kind}.js  grid {gw}x{gh}  particles {n}  {len(js) // 1024}KB")


OUT.mkdir(exist_ok=True)
for name in ("top", "fifth", "last"):
    for kind in GRID:
        convert(name, kind)
