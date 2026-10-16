"""Turn raw FLUX images into tileable PBR texture sets (albedo / normal / roughness) and alpha decals."""
import glob
import os

import numpy as np
from PIL import Image
from scipy import ndimage

RAW = os.path.join(os.path.dirname(__file__), "../../raw/textures")
OUT = os.path.join(os.path.dirname(__file__), "../../public/textures")

# name: (size, normal strength, roughness base, roughness variation, gloss-in-dark (wet stains), albedo gain)
SETS = {
    "floor_concrete": (2048, 2.2, 0.82, 0.25, 0.45, 0.85),
    "wall_block": (1024, 3.0, 0.9, 0.1, 0.0, 0.8),
    "wall_plaster": (1024, 1.6, 0.88, 0.12, 0.0, 0.8),
    "ceiling_concrete": (1024, 2.0, 0.92, 0.08, 0.0, 0.7),
    "metal_painted": (1024, 1.4, 0.6, 0.3, 0.0, 0.9),
    "metal_rust": (1024, 2.5, 0.85, 0.15, 0.0, 0.85),
}
DECALS = ["decal_oil", "decal_water", "decal_grime", "decal_cracks", "decal_footprints"]


def load(name):
    f = sorted(glob.glob(f"{RAW}/{name}/*.png"))[0]
    return np.asarray(Image.open(f).convert("RGB")).astype(np.float32) / 255.0


def make_tileable(img, border=0.22):
    h, w, _ = img.shape
    rolled = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)

    def ramp(n):
        x = np.linspace(0, 1, n)
        d = np.minimum(x, 1 - x) / border
        d = np.clip(d, 0, 1)
        return d * d * (3 - 2 * d)

    wgt = np.outer(ramp(h), ramp(w))[..., None]
    return img * wgt + rolled * (1 - wgt)


def normal_from_height(hgt, strength):
    gx = ndimage.sobel(hgt, axis=1, mode="wrap")
    gy = ndimage.sobel(hgt, axis=0, mode="wrap")
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(hgt)
    n = np.stack([nx, ny, nz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5)


def save(arr, path, q=88):
    arr = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(path, "WEBP", quality=q, method=6)
    print("saved", path, os.path.getsize(path) // 1024, "KB")


def process_set(name, size, nstr, rbase, rvar, gloss, gain):
    img = make_tileable(load(name))
    img = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    # Albedo: slightly desaturated & darkened toward the cold palette.
    grey = lum[..., None]
    alb = (img * 0.75 + grey * 0.25) * gain
    save(alb, f"{OUT}/{name}_albedo.webp")
    # Height = high-passed luminance (mid-scale details dominate the normal map).
    hgt = ndimage.gaussian_filter(lum, 1.0, mode="wrap") - ndimage.gaussian_filter(lum, 24, mode="wrap")
    fine = lum - ndimage.gaussian_filter(lum, 2.0, mode="wrap")
    nrm = normal_from_height(hgt * 0.6 + fine * 0.8, nstr)
    save(nrm, f"{OUT}/{name}_normal.webp", q=78)
    # Roughness: variation from local luminance; dark stains become glossier (wet look) on the floor.
    loc = (lum - lum.mean()) / (lum.std() + 1e-5)
    rough = rbase + rvar * np.tanh(loc) * 0.5
    if gloss > 0:
        stains = ndimage.gaussian_filter(np.clip(-loc - 0.4, 0, 3), 6, mode="wrap")
        stains = stains / (stains.max() + 1e-5)
        rough = rough - gloss * np.clip(stains * 1.6, 0, 1)
    rough = np.clip(rough, 0.15, 1.0)
    save(np.repeat(rough[..., None], 3, -1), f"{OUT}/{name}_rough.webp", q=85)


def process_decal(name, size=1024):
    img = load(name)
    img = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    bg = np.percentile(lum, 92)
    alpha = np.clip((bg - lum) / max(bg - lum.min(), 1e-3), 0, 1) ** 0.8
    # Fade edges to avoid hard borders.
    yy, xx = np.mgrid[0:size, 0:size] / (size - 1)
    edge = np.clip(np.minimum.reduce([xx, 1 - xx, yy, 1 - yy]) / 0.06, 0, 1)
    alpha *= edge
    col = np.clip(img * 0.55, 0, 1)
    rgba = np.concatenate([col, alpha[..., None]], -1)
    arr = np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8)
    p = f"{OUT}/{name}.webp"
    Image.fromarray(arr, "RGBA").save(p, "WEBP", quality=85, method=6)
    print("saved", p, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n, args in SETS.items():
        process_set(n, *args)
    for d in DECALS:
        process_decal(d)
