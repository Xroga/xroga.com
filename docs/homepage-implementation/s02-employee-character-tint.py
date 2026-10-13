import numpy as np, colorsys
from PIL import Image
from scipy import ndimage as ndi
src = Image.open('src.webp').convert('RGB')
im = np.asarray(src).astype(np.float32)
mx = im.max(-1)
m = mx > 140
m[968:] = False
lab, _ = ndi.label(m)
core = ndi.binary_fill_holes(lab == lab[600, 627])
yy, xx = np.mgrid[0:core.shape[0], 0:core.shape[1]]
core &= ~((yy > 930) & (xx < 285))  # floor glow beside the lower-left arm
region = ndi.binary_dilation(core, iterations=8)
region[968:] = False
region &= ~((yy > 925) & (xx < 285))
# soft matte: solid inside the character, a short glow falloff at the edge
soft = np.clip((mx - 70) / (150 - 70), 0, 1)
alpha = np.where(core, 1.0, np.where(region, soft * 0.9, 0.0))
alpha = ndi.gaussian_filter(alpha, 0.8)
alpha[core & (ndi.binary_erosion(core, iterations=2))] = 1.0

# hue shift only the blue/violet glass (hue 185..300 deg, saturated); collar, gold clip, highlights stay
rgb = im / 255.0
mxc = rgb.max(-1); mnc = rgb.min(-1); d = mxc - mnc + 1e-6
h = np.zeros_like(mxc)
rr, gg, bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]
h = np.where(mxc == rr, ((gg - bb) / d) % 6, np.where(mxc == gg, (bb - rr) / d + 2, (rr - gg) / d + 4)) * 60
s = np.where(mxc > 0, d / (mxc + 1e-6), 0)
v = mxc
glass = (h > 185) & (h < 305) & (s > 0.22)
w = np.clip((s - 0.22) / 0.15, 0, 1) * glass  # feather the selection by saturation
# eyes, mouth and tie stay deep navy on every employee (dark pixels), as in the founder's character
w = w * np.clip((v - 0.30) / 0.18, 0, 1)

def hsv2rgb(h, s, v):
    h = (h % 360) / 60; i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,))
    for k, (a, b2, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel, 0] = a[sel]; out[sel, 1] = b2[sel]; out[sel, 2] = c[sel]
    return out

TARGETS = {  # target hue for the body (orig body ~ 222 deg) and a saturation/value nudge
    'builder': (222, 1.0, 1.0),
    'growth': (14, 0.92, 1.02),
    'research': (268, 0.95, 1.0),
    'creative': (330, 0.9, 1.02),
    'data': (174, 0.95, 0.98),
    'ops': (40, 0.9, 1.04),
}
box = (162, 118, 1062, 1018)
for name, (hue, sk, vk) in TARGETS.items():
    nh = h + (hue - 222)
    ns = np.clip(s * sk, 0, 1); nv = np.clip(v * vk, 0, 1)
    shifted = hsv2rgb(nh, ns, nv)
    out = rgb * (1 - w[..., None]) + shifted * w[..., None]
    rgba = np.dstack([np.clip(out, 0, 1) * 255, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA').crop(box)
    img.resize((512, 512), Image.LANCZOS).save(f'x-{name}-512.webp', quality=88, method=6)
    img.resize((256, 256), Image.LANCZOS).save(f'x-{name}-256.webp', quality=88, method=6)
# preview sheet on the site's dark background
sheet = Image.new('RGB', (6 * 300, 330), (11, 13, 20))
for i, name in enumerate(TARGETS):
    t = Image.open(f'x-{name}-512.webp').resize((280, 280), Image.LANCZOS)
    sheet.paste(t, (i * 300 + 10, 20), t)
sheet.save('six.png')
