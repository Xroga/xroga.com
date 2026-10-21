import numpy as np, sys, os
from atelier import *
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W = 400   # fin image width; inner (stage-facing) edge at x = W

def fin_profile(xx):
    x0 = W - 310.0
    t = np.clip((xx - x0) / 270.0, 0, 1)
    z = 70.0 * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))      # bullnose shoulder: a curved, convex return
    z = np.where(xx < x0, 0.0, z)
    ch = 26.0
    return np.minimum(z, 20 + 50 * np.clip((W - xx) / ch, 0, 1)), 70.0

def fin_geo(Hh, y0, y1, infinite=False):
    yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32)
    z, zS = fin_profile(xx)
    if infinite:
        H = z
    else:
        top = np.clip((yy - y0) / 30.0, 0, 1); bot = np.clip((y1 - yy) / 30.0, 0, 1)
        H = np.minimum(z, 20 + (zS - 20) * np.minimum(top, bot))
        H = np.where((yy >= y0) & (yy <= y1), np.maximum(H, 0), 0.0)
    slab = sm((H > 1.0).astype(np.float32), 1.0)
    return sm(H, 0.7), slab

rough = 0.42
Hh = 1160
H, slab = fin_geo(Hh, 50, 1100)
base = shade(H, slab, (120, -300, 420), rough_slab=rough, intensity=0.95, falloff=800, amb=0.003)
base += shade(H, slab, (W + 420, 560, 260), rough_slab=rough, intensity=0.42, falloff=900, amb=0.0)
to_img(np.clip(base, 0, 1)).save(f'{OUT}/s04a-fin-base.webp', quality=92, method=6)
Image.fromarray((slab * 255).astype(np.uint8)).save(f'{OUT}/s04a-fin-mask.png', optimize=True)
Hs = 1500
Hi, slabi = fin_geo(Hs, 0, Hs, infinite=True)
spr = shade(Hi, slabi, (W + 300, Hs / 2, 210), rough_slab=rough, intensity=4.6, falloff=330, amb=0.0, n_samp=5)
yy = np.arange(Hs, dtype=np.float32)[:, None, None]
spr = spr * (np.clip(1 - np.abs(yy - Hs / 2) / 700.0, 0, 1) ** 1.5)
to_img(spr, grain=0.0).save(f'{OUT}/s04a-fin-light.webp', quality=92, method=6)

# ---- candidate B: a suspended light panel (CGI slab with an emissive underside) for the upper right
PW, PH = 1100, 300
yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
bar = ((xx > 120) & (xx < PW - 120) & (np.abs(yy - 110) < 16)).astype(np.float32)
Hb = sm(bar * 30.0, 1.2) + 0 * xx
Hb = np.minimum(Hb, 6 + 24 * np.clip(np.minimum(xx - 120, PW - 120 - xx) / 14.0, 0, 1)) * (bar > 0)
slabb = sm(bar, 1.0)
casing = shade(Hb, slabb, (PW / 2, -200, 380), rough_slab=0.3, intensity=1.2, falloff=700, amb=0.003) * slabb[..., None]
glow = sm(((np.abs(yy - 126) < 3) & (xx > 138) & (xx < PW - 138)).astype(np.float32), 1.5)
halo = sm(glow, 16) * 5.0 + sm(glow, 46) * 4.0
halo = halo * ss(0, 1, 1 - np.abs(xx - PW / 2) / (PW / 2 - 40))
panel = casing + halo[..., None] * np.array([0.78, 0.80, 0.84], np.float32) * 0.5
to_img(np.clip(panel, 0, 1), grain=0.0).save(f'{OUT}/s04b-panel.webp', quality=92, method=6)
print('done')
