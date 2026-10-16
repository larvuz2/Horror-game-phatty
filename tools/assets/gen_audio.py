"""Generate music (ElevenLabs Music v2.5 + Lyria 3.5) and sound effects (ElevenLabs SFX v2) on fal."""
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from fal_client import run

MUSIC = {
    # name: (endpoint, payload)
    "menu_theme": ("elevenlabs/music/v2.5", {
        "prompt": ("Dark minimalist psychological horror film main title theme. Very slow, around 50 BPM. "
                   "Sparse, detuned felt piano notes ringing out into a huge cold reverb, a deep bowed "
                   "contrabass drone underneath, faint high glassy string harmonics, distant metallic "
                   "resonances, long silences between phrases. Melancholic, oppressive, beautiful and "
                   "uneasy, like an A24 horror score. No drums, no percussion hits, no vocals."),
        "music_length_ms": 120000, "force_instrumental": True, "output_format": "mp3_44100_192"}),
    "menu_theme_lyria": ("google/lyria-3.5", {
        "prompt": ("Instrumental dark ambient psychological horror main menu theme, very slow and sparse. "
                   "Detuned felt piano, deep bowed contrabass drone, glassy string harmonics, cavernous "
                   "reverb, long silences. Melancholic, cold, oppressive. No drums, no vocals."),
    }),
    "ambient_bed": ("elevenlabs/music/v2.5", {
        "prompt": ("Dark ambient drone for a horror game, no melody at all. Extremely low sub-bass hum, "
                   "slowly evolving dark textures, faint distant metallic scrapes and resonances, air and "
                   "room tone, subtle breathing-like swells. Very quiet, minimal, unsettling, seamless and "
                   "static. No piano, no drums, no vocals."),
        "music_length_ms": 120000, "force_instrumental": True, "output_format": "mp3_44100_192"}),
    "tension_layer": ("elevenlabs/music/v2.5", {
        "prompt": ("Horror tension underscore: sustained dissonant string cluster, col legno and sul "
                   "ponticello violins scraping, low trembling cellos, slowly pulsing sub bass, rising "
                   "unease, constant intensity without a climax, seamless. No drums, no vocals, no melody."),
        "music_length_ms": 60000, "force_instrumental": True, "output_format": "mp3_44100_192"}),
    "death_cinematic": ("elevenlabs/music/v2.5", {
        "prompt": ("Horror film death scene cue, 16 seconds. Starts almost silent with a muffled deep sub "
                   "drone and a slow heartbeat, then dissonant strings slowly rise in a long agonizing "
                   "crescendo with a low brass swell and a high shrieking violin cluster, building to an "
                   "unbearable peak at 12 seconds, then abruptly cut to silence. No drums, no vocals."),
        "music_length_ms": 16000, "force_instrumental": True, "output_format": "mp3_44100_192"}),
    "victory": ("elevenlabs/music/v2.5", {
        "prompt": ("Quiet melancholic relief after a horror film, slow solo felt piano with a warm soft "
                   "string pad, fragile and haunting, still slightly uneasy at the end. No drums, no vocals."),
        "music_length_ms": 40000, "force_instrumental": True, "output_format": "mp3_44100_192"}),
}

SFX = {
    # name: (prompt, duration or None, loop)
    "fluorescent_hum": ("constant electrical hum and buzz of an old fluorescent light ballast, 60Hz, steady", 10, True),
    "fluorescent_flicker": ("old fluorescent tube flickering, rapid buzzing electrical ticks and pings, crackle", 3, False),
    "room_tone": ("empty large concrete industrial storage room tone, subtle air movement, very low distant rumble, quiet", 15, True),
    "creak_1": ("old building metal beam groaning and creaking slowly, distant, reverberant", 4, False),
    "creak_2": ("wooden ceiling creak, slow single creak, reverberant empty room", 3, False),
    "distant_metal": ("distant metallic clank echoing in a large empty concrete warehouse", 4, False),
    "drip": ("single water drip into a small puddle in a large concrete room, echo", 2, False),
    "footsteps_concrete": ("slow single footsteps walking on gritty dusty concrete floor, boots, spaced one second apart, dry close", 10, False),
    "flashlight_pickup": ("picking up a metal flashlight from a wooden table, close foley", 1.5, False),
    "flashlight_click_empty": ("dry plastic flashlight switch click twice, nothing happens, close foley", 1.2, False),
    "flashlight_on": ("single crisp flashlight switch click on, close foley", 0.6, False),
    "battery_pickup": ("picking up two batteries, small metallic rattle, close foley", 1.0, False),
    "battery_insert": ("unscrewing a metal flashlight cap, dropping two batteries inside, screwing the cap back on tight, close foley", 3, False),
    "panel_open": ("rusty metal electrical cabinet door creaking open with a squeak", 2, False),
    "breaker_lever": ("heavy industrial power breaker lever pulled down hard, loud mechanical clunk with electrical arc snap", 2, False),
    "breaker_strain": ("straining against a stiff rusty metal lever, slow grinding metal creak", 2.5, False),
    "power_on": ("power restored in a warehouse, deep electrical thunk, fluorescent lights flickering on one by one with ballast pings, rising hum", 5, False),
    "lights_out": ("electrical pop and all fluorescent lights shutting off with a heavy clunk, power dies, hum fades out", 2.5, False),
    "chair_scrape": ("wooden chair dragged and scraping on a concrete floor, short", 1.5, False),
    "metal_chair_scrape": ("metal chair legs scraping on concrete floor, short screech", 1.5, False),
    "can_roll": ("empty metal can rolling on a concrete floor", 2.5, False),
    "cardboard_shift": ("cardboard box sliding and bumping on a concrete floor", 1.2, False),
    "metal_clang": ("metal pipe dropped falling on concrete floor, clanging bounce", 2, False),
    "bucket_hit": ("kicking a metal bucket, hollow metallic clunk and wobble", 1.5, False),
    "bottle_hit": ("kicking an empty plastic bottle across a concrete floor", 1.2, False),
    "wood_knock": ("bumping into a heavy wooden table, dull wood knock", 0.8, False),
    "metal_knock": ("bumping into a metal shelf, dull rattling metal knock", 1.0, False),
    "creature_breath": ("very slow, deep, raspy, wet breathing of a large unseen creature very close behind, unsettling, quiet", 8, True),
    "cloth_rustle": ("subtle dry fabric rustle, someone shifting in the dark, very quiet close", 1.5, False),
    "creature_move": ("a single slow heavy dragging footstep on concrete in the dark, quiet, behind you", 1.5, False),
    "pressure_tone": ("deep ominous low frequency sub bass pressure drone, felt more than heard, steady", 10, True),
    "attack_sting": ("sudden short horror stinger, sharp reversed whoosh into a deep low impact", 2, False),
    "heartbeat": ("slow heavy heartbeat thumping, muffled, close, steady", 6, True),
    "ear_ring": ("high pitched tinnitus ear ringing fading in, muffled", 5, False),
    "door_locked": ("rattling a locked heavy steel door handle, metal clunks, it will not open", 1.8, False),
    "clock_tick": ("single loud mechanical clock tick, old wall clock, dry", 0.5, False),
    "panel_buzz": ("electrical panel buzzing and faint crackling arcing inside a metal box, steady", 8, True),
    "ui_hover": ("very soft subtle low muffled tick, minimal interface sound", 0.5, False),
    "ui_select": ("deep soft muffled low thud with a little reverb tail, minimal interface confirm", 1.5, False),
    "whispers": ("faint indistinct distorted whispers in the dark, unintelligible, eerie, reverberant", 8, False),
    "sub_drop": ("massive deep cinematic sub bass drop boom with long dark tail", 4, False),
}


def music(name):
    ep, payload = MUSIC[name]
    return run(ep, payload, out_dir=f"../../raw/audio/music/{name}", timeout=2400)


def sfx(name):
    prompt, dur, loop = SFX[name]
    p = {"text": prompt, "loop": loop, "prompt_influence": 0.5, "output_format": "mp3_44100_192"}
    if dur:
        p["duration_seconds"] = max(0.5, dur)
    return run("fal-ai/elevenlabs/sound-effects/v2", p, out_dir=f"../../raw/audio/sfx/{name}")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    names = sys.argv[2:]
    with ThreadPoolExecutor(max_workers=6) as ex:
        jobs = []
        if which in ("all", "music"):
            jobs += [ex.submit(music, n) for n in (names or MUSIC)]
        if which in ("all", "sfx"):
            jobs += [ex.submit(sfx, n) for n in (names or SFX)]
        for j in as_completed(jobs):
            try:
                j.result()
            except Exception as e:
                print("[error]", e)
