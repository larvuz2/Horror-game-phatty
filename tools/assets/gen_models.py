"""Generate the creature (Meshy 7.1, auto-rigged) and props (Tripo P2) on fal."""
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from fal_client import run

STYLE = ("realistic, game-ready PBR asset, worn and dirty, abandoned industrial storage room prop, "
         "physically accurate proportions, neutral lighting")
NEG = "cartoon, stylized, toy, plastic look, low quality, oversaturated colors, text artifacts"

PROPS = {
    "chair_wood": "old wooden chair with backrest, scratched dusty dark varnished wood, simple sturdy design",
    "chair_metal": "old metal folding chair, chipped grey paint, rust spots, scuffed seat",
    "table_small": "small old wooden work table with four square legs, scratched stained dusty tabletop",
    "desk_metal": "old steel office desk with a stack of drawers on one side, dented grey-green paint, rust, 1960s industrial",
    "shelf_tall": "tall industrial metal shelving unit with four empty shelves, rusty grey steel uprights and bolted steel shelf boards",
    "cabinet": "tall old metal storage cabinet with two closed doors, dented, rusty edges, peeling grey paint",
    "box_cardboard": "worn closed cardboard box sealed with brown packing tape, dusty, slightly crushed corner",
    "box_open": "old open cardboard box with flaps open, worn stained brown cardboard",
    "bucket": "old galvanized metal bucket with wire handle, dented, rust stains",
    "paint_can": "old metal paint can with lid, dried grey paint drips down the side, rusty rim",
    "bottle": "empty crumpled dirty clear plastic water bottle with cap, no label",
    "pallet": "weathered wooden shipping pallet, dirty grey worn planks",
    "barrel": "industrial steel drum barrel, 55 gallon, faded dark blue paint, rust and dents",
    "trash_bin": "old galvanized metal trash can with lid, dented and dirty",
    "wall_clock": "broken round industrial wall clock, cracked glass, white face with black numbers, black frame",
    "fluorescent": "industrial hanging fluorescent tube light fixture, long dusty metal housing with two exposed tubes, hanging chains",
    "electrical_panel": "old industrial wall-mounted electrical breaker panel box, grey metal cabinet with hinged door, faded warning label, rust stains",
    "flashlight": "old metal flashlight, black knurled aluminium body, rubber grip, glass lens",
    "batteries": "two large D-cell batteries lying side by side, old worn labels",
    "toolbox": "old dark green metal toolbox with handle, chipped paint, rust",
    "rag": "dirty crumpled grey cloth rag lying flat on the floor",
    "warning_sign": "old rectangular metal warning sign plate reading DANGER HIGH VOLTAGE, faded yellow and black, rusty screws",
    "fan": "old industrial floor fan with metal cage grill on a stand, rusty grey metal",
    "door": "heavy old steel industrial door with frame and push bar, dented, peeling dark grey paint, rust",
    "pipe": "rusty steel pipe one meter long, straight, corroded",
    "cable_spool": "large wooden cable spool reel with black electrical cable wound on it, weathered wood",
    "gas_cylinder": "old dented steel gas cylinder tank, faded grey paint, valve on top",
}

CREATURE_PROMPT = (
    "extremely tall and gaunt faceless humanoid creature, emaciated thin body, very long thin arms, "
    "long bony fingers, narrow shoulders, slightly elongated neck, long thin legs, smooth featureless "
    "head with no face, no eyes, no mouth, no hair, dark charcoal-black rough leathery skin, "
    "unsettling horror creature, realistic, full body, standing"
)


def creature(seed):
    return run("meshy/v7.1/text-to-3d", {
        "prompt": CREATURE_PROMPT,
        "mode": "full",
        "pose_mode": "a-pose",
        "enable_rigging": True,
        "rigging_height_meters": 2.35,
        "enable_pbr": True,
        "target_polycount": 30000,
        "seed": seed,
        "texture_prompt": "dark charcoal black rough matte skin, no specular highlights, subtle ash grey variation",
    }, out_dir=f"../../raw/creature/meshy_{seed}")


def prop(name, desc):
    return run("tripo3d/p2/text-to-3d", {
        "prompt": f"{desc}, {STYLE}",
        "negative_prompt": NEG,
        "texture": True,
        "pbr": True,
        "texture_quality": "detailed",
        "auto_size": True,
        "face_limit": 12000,
    }, out_dir=f"../../raw/props/{name}")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    jobs = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        if which in ("all", "creature"):
            for s in (11, 29):
                jobs.append(ex.submit(creature, s))
        if which in ("all", "props"):
            names = sys.argv[2:] or list(PROPS)
            for n in names:
                jobs.append(ex.submit(prop, n, PROPS[n]))
        for j in as_completed(jobs):
            try:
                j.result()
            except Exception as e:
                print("[error]", e)
