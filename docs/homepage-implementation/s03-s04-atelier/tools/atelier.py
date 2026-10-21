import numpy as np, sys
from scipy.ndimage import gaussian_filter, map_coordinates
from PIL import Image

rng = np.random.default_rng(7)
def sm(a, s): return gaussian_filter(a.astype(np.float32), s, mode='nearest')
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def normals(H):
    gy, gx = np.gradient(H)
    n = np.stack([-gx, -gy, np.ones_like(H)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

def soft_shadow(H, L, steps=80, stride=2.5, soft=5.0):
    h, w = H.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    hxy = max(np.hypot(L[0], L[1]), 1e-6)
    dx, dy = L[0] / hxy, L[1] / hxy
    slope = L[2] / hxy
    vis = np.ones((h, w), np.float32)
    for i in range(1, steps + 1):
        d = i * stride
        hs = map_coordinates(H, [yy + dy * d, xx + dx * d], order=1, mode='nearest')
        occ = hs - (H + slope * d)
        vis = np.minimum(vis, np.clip(0.5 - occ / soft, 0, 1))
    return vis

def amb_occ(H, radii=(5, 12, 26, 50), dirs=10):
    h, w = H.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    acc = np.zeros((h, w), np.float32); n = 0
    for r in radii:
        for k in range(dirs):
            a = 2 * np.pi * (k + 0.37 * r) / dirs
            hs = map_coordinates(H, [yy + np.sin(a) * r, xx + np.cos(a) * r], order=1, mode='nearest')
            acc += np.clip((hs - H) / r, 0, 1.2); n += 1
    return np.clip(1 - acc / n * 1.5, 0, 1)

def ggx_spec(N, L, V, rough, F0):
    Hh = L + V; Hh = Hh / np.linalg.norm(Hh, axis=-1, keepdims=True)
    NdH = np.clip((N * Hh).sum(-1), 0, 1); NdL = np.clip((N * L).sum(-1), 0, 1); NdV = np.clip(N[..., 2], 1e-3, 1)
    VdH = np.clip((Hh * V).sum(-1), 0, 1)
    a = rough ** 2; a2 = a * a
    D = a2 / (np.pi * (NdH ** 2 * (a2 - 1) + 1) ** 2 + 1e-7)
    k = (rough + 1) ** 2 / 8
    G = (NdL / (NdL * (1 - k) + k + 1e-6)) * (NdV / (NdV * (1 - k) + k + 1e-6))
    F = F0[None, None, :] + (1 - F0[None, None, :]) * ((1 - VdH) ** 5)[..., None]
    return (D * G / (4 * NdL * NdV + 1e-4) * NdL)[..., None] * F

def key_dir(theta_deg, elev_deg, side=-1):
    """direction TO the light. side=-1: light on the left of the image. theta = angle below horizontal (y down)."""
    t, e = np.radians(theta_deg), np.radians(elev_deg)
    v = np.array([side * np.cos(e) * np.cos(t), np.cos(e) * np.sin(t), np.sin(e)])
    return v / np.linalg.norm(v)

def shade(H, slab, lightpos, rough_slab=0.36, rough_wall=0.7, intensity=3.2, falloff=520.0, cone=6, n_samp=5, exposure=1.0, amb=0.0035, wall_gain=0.35):
    """point/area light at lightpos=(x,y,z) in image px (z toward viewer). Per-pixel light vector + inverse-square-ish falloff."""
    h, w = H.shape
    N = normals(sm(H, 0.8))
    V = np.array([0, 0, 1.0], np.float32)
    A = amb_occ(H)
    F0 = np.array([0.54, 0.56, 0.60], np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    col = np.zeros((h, w, 3), np.float32)
    hemi = (0.5 - 0.5 * N[..., 1]) ** 1.2
    a_ = (amb * (0.4 + 1.2 * hemi) * A)[..., None]
    col += a_ * (slab[..., None] * F0 * 1.2 + (1 - slab[..., None]) * 0.4)
    for i in range(n_samp):
        ang = 2 * np.pi * i / n_samp
        jit = np.zeros(3, np.float32) if i == 0 else np.array([np.cos(ang), np.sin(ang), 0.0], np.float32) * cone
        lp = np.array(lightpos, np.float32) + jit
        Lv = np.stack([lp[0] - xx, lp[1] - yy, lp[2] - H], -1)
        dist = np.linalg.norm(Lv, axis=-1, keepdims=True)
        L = Lv / dist
        fall = 1.0 / (1.0 + (dist[..., 0] / falloff) ** 2) ** 1.0
        Lc = L[h // 2, w // 2]
        vis = soft_shadow(H, Lc)
        NdL = np.clip((N * L).sum(-1), 0, 1)
        spec_s = ggx_spec(N, L, V, rough_slab, F0) * vis[..., None]
        diff_w = (0.025 * NdL * vis)[..., None] * np.ones(3, np.float32)
        spec_w = ggx_spec(N, L, V, rough_wall, np.array([0.04, 0.04, 0.045], np.float32)) * vis[..., None]
        s_ = slab[..., None]
        col += (intensity / n_samp) * fall[..., None] * (s_ * spec_s + (1 - s_) * wall_gain * (diff_w + spec_w * 0.6))
    return 1 - np.exp(-col * exposure * 1.6)

def to_img(col, grain=1.0):
    g = np.clip(col, 0, 1) ** (1 / 2.2)
    n = rng.normal(0, 0.9 / 255 * grain, g.shape[:2]).astype(np.float32)[..., None]
    g = np.clip(g + n, 0, 1)
    return Image.fromarray((g * 255 + 0.5).astype(np.uint8))

def left_strip(W=520, Hh=1000, y0=70, y1=930):
    yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32)
    # profile across x (left→right): low plateau, fold ramp, high plateau with one groove, chamfered return edge at x=W
    zS = 58.0
    px = np.where(xx < 230, 20.0, np.where(xx < 300, 20 + (zS - 20) * ss(230, 300, xx), zS))
    px = px - 16 * np.exp(-((xx - 410) / 3.2) ** 2)                      # one machined groove
    ch = 22.0
    px = np.minimum(px, 20 + (zS - 20) * np.clip((W - xx) / ch, 0, 1))      # chamfer down to the return edge
    py_top = np.clip((yy - y0) / 26.0, 0, 1); py_bot = np.clip((y1 - yy) / 26.0, 0, 1)
    prof = np.minimum(px, 20 + (zS - 20) * np.minimum(py_top, py_bot) * 1.0)
    prof = np.where((yy < y0) | (yy > y1), 0.0, prof)
    H = np.where((yy >= y0) & (yy <= y1), np.maximum(prof, 0), 0.0)
    slab = (H > 1.0).astype(np.float32)
    slab = sm(slab, 1.0)
    return sm(H, 0.6), slab

if __name__ == '__main__':
    H, slab = left_strip()
    for i, ly in enumerate((120, 520, 900)):
        im = to_img(shade(H, slab, (-260, ly, 190)))
        im.save(f'left_{i}.png')
    print('ok')
