"""Generate surface textures and decals with FLUX 3 on fal (made tileable later in process_textures.py)."""
from concurrent.futures import ThreadPoolExecutor, as_completed

from fal_client import run

BASE = ("seamless tileable texture, orthographic top-down flat scan, uniform even diffuse lighting, "
        "no shadows, no perspective, photorealistic PBR albedo, high detail")

TEX = {
    "floor_concrete": f"old dirty industrial concrete floor slab, stains, oil spots, fine cracks, dust, scuffs, cold grey, {BASE}",
    "wall_block": f"painted concrete cinder block wall, dirty peeling off-white grey paint, grime, water stains, mortar lines, {BASE}",
    "wall_plaster": f"old dirty grey painted concrete wall surface, mottled grime, faint water streaks, chipped paint, {BASE}",
    "ceiling_concrete": f"raw concrete ceiling slab with formwork board marks, dark grey, dusty, mildew, {BASE}",
    "metal_painted": f"old painted steel sheet metal, chipped dark grey-green paint, rust patches, scratches, {BASE}",
    "metal_rust": f"heavily rusted corroded steel surface, orange brown rust, flaking, {BASE}",
    "wood_dirty": f"old weathered dirty wooden planks, grey brown, scratches, {BASE}",
}
DECALS = {
    "decal_oil": "single dark oil stain splotch on pure white background, top-down, isolated, irregular organic shape, soft edges",
    "decal_water": "dark dirty water leak stain streaks running down, isolated on pure white background, vertical drips, grime",
    "decal_grime": "dark dusty grime smudge patch isolated on pure white background, soft irregular edges, dirt",
    "decal_cracks": "network of thin dark concrete cracks isolated on pure white background, top-down",
    "decal_footprints": "faint dusty bare footprints of a very long thin foot trail walking, isolated on pure white background, top-down, smudged",
}


def tex(name, prompt, ar="1:1"):
    return run("blackforestlabs/flux-3/text-to-image", {
        "prompt": prompt, "resolution": "2k", "aspect_ratio": ar, "output_format": "png"},
        out_dir=f"../../raw/textures/{name}")


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as ex:
        jobs = [ex.submit(tex, n, p) for n, p in TEX.items()]
        jobs += [ex.submit(tex, n, p) for n, p in DECALS.items()]
        for j in as_completed(jobs):
            try:
                j.result()
            except Exception as e:
                print("[error]", e)
