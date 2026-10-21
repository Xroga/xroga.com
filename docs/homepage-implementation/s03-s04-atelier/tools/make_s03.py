import numpy as np, sys, os
from atelier import *
OUT = sys.argv[1]; VAR = sys.argv[2]  # a | b
os.makedirs(OUT, exist_ok=True)
W = 520

def profile_left(xx, var):
    if var == 'a':
        zS = 58.0
        px = np.where(xx < 300, 20.0, np.where(xx < 370, 20 + (zS - 20) * ss(300, 370, xx), zS))
        px = px - 16 * np.exp(-((xx - 452) / 3.2) ** 2)
    else:
        zS = 66.0
        px = np.where(xx < 200, 16.0, np.where(xx < 238, 16 + 24 * ss(200, 238, xx), np.where(xx < 330, 40.0, np.where(xx < 360, 40 + 26 * ss(330, 360, xx), zS))))
        px = px - 14 * np.exp(-((xx - 412) / 3.0) ** 2) - 14 * np.exp(-((xx - 454) / 3.0) ** 2)
    ch = 22.0
    return np.minimum(px, 16 + (zS - 16) * np.clip((W - xx) / ch, 0, 1)), zS

def left_geo(Hh, y0, y1, var, infinite=False):
    yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32)
    px, zS = profile_left(xx, var)
    if infinite:
        H = px
    else:
        top = np.clip((yy - y0) / 26.0, 0, 1); bot = np.clip((y1 - yy) / 26.0, 0, 1)
        H = np.minimum(px, 16 + (zS - 16) * np.minimum(top, bot))
        H = np.where((yy >= y0) & (yy <= y1), np.maximum(H, 0), 0.0)
    slab = sm((H > 1.0).astype(np.float32), 1.0)
    return sm(H, 0.6), slab

def right_geo(Hh, y0, y1, var):
    yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32)   # inner (content-facing) edge at x=0
    if var == 'a':
        zS = 44.0; px = np.where(xx < 190, zS, zS - 20 * ss(190, 230, xx))
    else:
        zS = 52.0; px = np.where(xx < 120, zS, np.where(xx < 150, zS - 18 * ss(120, 150, xx), np.where(xx < 260, zS - 18, zS - 18 - 14 * ss(260, 290, xx))))
    ch = 18.0
    px = np.minimum(px, 14 + (zS - 14) * np.clip(xx / ch, 0, 1))
    top = np.clip((yy - y0) / 24.0, 0, 1); bot = np.clip((y1 - yy) / 24.0, 0, 1)
    H = np.minimum(px, 14 + (zS - 14) * np.minimum(top, bot))
    H = np.where((yy >= y0) & (yy <= y1), np.maximum(H, 0), 0.0)
    slab = sm((H > 1.0).astype(np.float32), 1.0)
    return sm(H, 0.6), slab

rough = 0.36 if VAR == 'a' else 0.24
# ---- left base (finite slab, rest lighting: soft overhead key + faint fill from the left)
Hh = 1000
H, slab = left_geo(Hh, 70, 930, VAR)
base = shade(H, slab, (300, -280, 430), rough_slab=rough, intensity=1.0, falloff=700, amb=0.003)
base += shade(H, slab, (-700, 500, 330), rough_slab=rough, intensity=0.26, falloff=900, amb=0.0)
to_img(np.clip(base, 0, 1)).save(f'{OUT}/s03{VAR}-left-base.webp', quality=92, method=6)
Image.fromarray((slab * 255).astype(np.uint8)).save(f'{OUT}/s03{VAR}-left-mask.png', optimize=True)
# ---- left light sprite (infinite slab, translation-invariant in y, windowed)
Hs = 1500
Hi, slabi = left_geo(Hs, 0, Hs, VAR, infinite=True)
spr = shade(Hi, slabi, (-260, Hs / 2, 190), rough_slab=rough, intensity=3.3, falloff=300, amb=0.0, n_samp=5)
yy = np.arange(Hs, dtype=np.float32)[:, None, None]
win = np.clip(1 - np.abs(yy - Hs / 2) / 700.0, 0, 1) ** 1.5
spr = spr * win
to_img(spr, grain=0.0).save(f'{OUT}/s03{VAR}-left-light.webp', quality=92, method=6)
# ---- right base
Hr, slabr = right_geo(820, 40, 760, VAR)
rb = shade(Hr, slabr, (-200, -260, 430), rough_slab=rough, intensity=0.8, falloff=700, amb=0.003)
rb += shade(Hr, slabr, (900, 420, 300), rough_slab=rough, intensity=0.2, falloff=900, amb=0.0)
to_img(np.clip(rb, 0, 1)).save(f'{OUT}/s03{VAR}-right-base.webp', quality=92, method=6)
print('done', VAR)
