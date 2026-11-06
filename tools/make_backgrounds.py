"""assets/image-1〜4.png から PC版・スマホ版の背景 JPG を書き出す。

使い方: python3 tools/make_backgrounds.py  （Pillow が必要）
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
PC = (1600, 900)    # 16:9
SP = (780, 1688)    # iPhone 14 (390x844) の 2 倍密度


def load(name, box=None):
    im = ImageOps.exif_transpose(Image.open(A / name))   # EXIF Orientation を焼き込む
    rgba = im.convert("RGBA")
    out = Image.new("RGB", im.size, (0, 0, 0))
    out.paste(rgba, mask=rgba.split()[3])
    return out.crop(box) if box else out


def crop_ratio(im, ratio, cx=0.5, cy=0.5):
    """縦横比 ratio(w/h) で、中心 (cx,cy)（0〜1）にできるだけ寄せて切り出す。"""
    w, h = im.size
    cw, ch = (round(h * ratio), h) if w / h > ratio else (w, round(w / ratio))
    x0 = min(max(round(cx * w - cw / 2), 0), w - cw)
    y0 = min(max(round(cy * h - ch / 2), 0), h - ch)
    return im.crop((x0, y0, x0 + cw, y0 + ch))


def save(im, name, size, **crop):
    src = crop_ratio(im, size[0] / size[1], **crop)
    out = src.resize(size, Image.LANCZOS)
    if src.width < size[0] * 0.5:          # 2倍超の拡大はジャギーが目立つので軽くぼかす
        out = out.filter(ImageFilter.GaussianBlur(1.0))
    out.save(A / name, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{name:13} src {src.width}x{src.height} -> {size[0]}x{size[1]}")


# ① トップ：image-4（上端の赤い UI 痕を除去。光柱は x≈700）
top = load("image-4.png", (0, 6, 1178, 599))
save(top, "top-pc.jpg", PC, cx=0.58)
save(top, "top-sp.jpg", SP, cx=0.60)

# ② 宇宙船：3D モデルで描くので、背景は強くぼかした光芒のみ（右下の UI 痕を除去）
ship = load("image-2.png", (0, 0, 491, 462))
for name, size in (("ship-pc.jpg", PC), ("ship-sp.jpg", SP)):
    k = min(size) * 0.9 / ship.height
    sm = ship.resize((round(ship.width * k), round(ship.height * k)), Image.LANCZOS)
    base = Image.new("RGB", size, (0, 0, 0))
    base.paste(sm, ((size[0] - sm.width) // 2, (size[1] - sm.height) // 2))
    base = ImageEnhance.Brightness(base.filter(ImageFilter.GaussianBlur(min(size) * 0.06))).enhance(0.6)
    base.save(A / name, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{name:13} blurred glow -> {size[0]}x{size[1]}")

# ③ 5次元空間：image-3（中心消失点の格子）。
#    スマホ版は正方向で縦に切ると約4倍拡大になるため、90°回転してから切り出す（格子は回転しても同じ見え方）
grid = load("image-3.png")
save(grid, "fifth-pc.jpg", PC)
save(grid.rotate(90, expand=True), "fifth-sp.jpg", SP)

# ④ 最終：image-1（右端の白い UI 痕を除去）。スマホ版は ③ と同じ理由で回転
tess = load("image-1.png", (0, 0, 664, 365))
save(tess, "last-pc.jpg", PC)
save(tess.rotate(90, expand=True), "last-sp.jpg", SP)
