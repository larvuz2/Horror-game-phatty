"""Post-process generated audio: loudness normalization, seamless loops, trimming, footstep slicing.

Outputs MP3 files into public/audio and a manifest (src/config/audio.json) with loop points.
Loops are written as  [wrapped pre-roll | seamless cycle | wrapped post-roll]  so that any decoder
padding still lands inside continuous audio; the game loops between loopStart/loopEnd.
"""
import glob
import json
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "../../raw/audio")
OUT = os.path.join(HERE, "../../public/audio")
MANIFEST = os.path.join(HERE, "../../src/config/audio.json")
SR = 44100
PAD = 0.12  # seconds of wrapped audio around loops


def decode(path, mono=False):
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(SR)]
        if mono:
            cmd += ["-ac", "1"]
        subprocess.run(cmd + [t.name], check=True)
        x, _ = sf.read(t.name, dtype="float32", always_2d=True)
    return x


def encode(x, name, kbps):
    path = os.path.join(OUT, name + ".mp3")
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        sf.write(t.name, np.clip(x, -1, 1), SR, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t.name, "-codec:a", "libmp3lame",
                        "-b:a", f"{kbps}k", path], check=True)
    return path


def lufs(x):
    # crude integrated loudness approximation (K-weighting omitted): RMS in dBFS of gated blocks
    mono = x.mean(1)
    blk = int(0.4 * SR)
    if len(mono) < blk:
        return 20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-9)
    rms = np.array([np.sqrt(np.mean(mono[i:i + blk] ** 2)) for i in range(0, len(mono) - blk, blk // 4)])
    db = 20 * np.log10(rms + 1e-9)
    gated = db[db > db.max() - 30]
    return 10 * np.log10(np.mean(10 ** (gated / 10)))


def normalize(x, target_db=None, peak_db=-1.0):
    if target_db is not None:
        x = x * 10 ** ((target_db - lufs(x)) / 20)
    pk = np.abs(x).max() + 1e-9
    lim = 10 ** (peak_db / 20)
    if pk > lim:
        x = x * (lim / pk)
    return x


def fade(x, fin=0.005, fout=0.02):
    n_in, n_out = int(fin * SR), int(fout * SR)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return x


def trim_silence(x, thresh_db=-50, keep=0.02):
    env = np.abs(x).max(1)
    idx = np.where(env > 10 ** (thresh_db / 20))[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(keep * SR))
    b = min(len(x), idx[-1] + int(keep * SR * 4))
    return x[a:b]


def make_loop(x, start, end, xfade):
    """Seamless loop of x[start:end] using an equal-power crossfade of the tail into the head."""
    s, e, xf = int(start * SR), int(end * SR), int(xfade * SR)
    e = min(e, len(x) - xf)
    seg = x[s:e + xf].copy()
    n = e - s
    head, tail = seg[:xf], seg[n:n + xf]
    t = np.linspace(0, 1, xf)[:, None]
    seg[:xf] = head * np.sin(t * np.pi / 2) + tail * np.cos(t * np.pi / 2)
    return seg[:n]


def write_loop(cyc, name, kbps):
    p = int(PAD * SR)
    padded = np.concatenate([cyc[-p:], cyc, cyc[:p]])
    encode(padded, name, kbps)
    return {"loop": True, "loopStart": PAD, "loopEnd": PAD + len(cyc) / SR}


def src(kind, name):
    return sorted(glob.glob(f"{RAW}/{kind}/{name}/*.mp3"))[0]


manifest = {}


def music():
    # menu theme: use the sparse ElevenLabs cue, loop the first ~108 s
    x = decode(src("music", "menu_theme"))
    manifest["menu_theme"] = write_loop(normalize(make_loop(x, 0.0, 108.0, 6.0), -19), "music/menu_theme", 160)
    x = decode(src("music", "ambient_bed"))
    manifest["ambient_bed"] = write_loop(normalize(make_loop(x, 2.0, 112.0, 6.0), -21), "music/ambient_bed", 128)
    x = decode(src("music", "tension_layer"))
    manifest["tension_layer"] = write_loop(normalize(make_loop(x, 1.0, 46.0, 3.0), -18), "music/tension_layer", 128)
    # death cue: keep to 13.4 s, quick fade after the peak so the fade-to-black is silent
    x = decode(src("music", "death_cinematic"))
    x = x[: int(13.4 * SR)]
    x = normalize(x, None, -0.8)
    x[int(12.55 * SR):] *= np.linspace(1, 0, len(x) - int(12.55 * SR))[:, None] ** 2
    encode(x, "music/death_cinematic", 160)
    manifest["death_cinematic"] = {"loop": False}
    x = decode(src("music", "victory"))
    x = fade(normalize(x, -19), 0.01, 3.0)
    encode(x, "music/victory", 160)
    manifest["victory"] = {"loop": False}


SFX_LOOPS = {  # name: (start, end, xfade, mono, target)
    "fluorescent_hum": (0.3, 9.6, 1.0, True, -22),
    "room_tone": (0.5, 14.5, 2.0, False, -30),
    "creature_breath": (0.2, 7.8, 0.8, True, -20),
    "pressure_tone": (0.5, 9.5, 2.0, False, -18),
    "heartbeat": (0.2, 5.8, 0.4, False, -18),
    "panel_buzz": (0.3, 7.7, 1.0, True, -24),
}
SFX_ONESHOT_MONO = {"creak_1", "creak_2", "distant_metal", "drip", "chair_scrape", "metal_chair_scrape", "can_roll",
                    "cardboard_shift", "metal_clang", "bucket_hit", "bottle_hit", "wood_knock", "metal_knock",
                    "cloth_rustle", "creature_move", "clock_tick", "door_locked", "fluorescent_flicker",
                    "panel_open", "breaker_lever", "breaker_strain", "attack_sting"}


def sfx():
    for d in sorted(glob.glob(f"{RAW}/sfx/*")):
        name = os.path.basename(d)
        if name == "footsteps_concrete":
            continue
        if name in SFX_LOOPS:
            a, b, xf, mono, tgt = SFX_LOOPS[name]
            x = decode(src("sfx", name), mono)
            manifest[name] = write_loop(normalize(make_loop(x, a, b, xf), tgt), f"sfx/{name}", 96 if mono else 128)
            continue
        mono = name in SFX_ONESHOT_MONO
        x = decode(src("sfx", name), mono)
        x = fade(trim_silence(x), 0.003, 0.05)
        x = normalize(x, None, -1.0)
        encode(x, f"sfx/{name}", 96 if mono else 128)
        manifest[name] = {"loop": False}


def footsteps():
    x = decode(src("sfx", "footsteps_concrete"), True)
    env = np.abs(x[:, 0])
    win = int(0.01 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    thr = env.max() * 0.25
    peaks, last = [], -SR
    i = 0
    while i < len(env):
        if env[i] > thr and i - last > int(0.35 * SR):
            j = i + int(np.argmax(env[i:i + int(0.08 * SR)]))
            peaks.append(i)
            last = j
            i = j + int(0.3 * SR)
        else:
            i += 1
    steps = []
    for k, p in enumerate(peaks):
        a = max(0, p - int(0.02 * SR))
        b = min(len(x), a + int(0.42 * SR))
        if k + 1 < len(peaks):
            b = min(b, peaks[k + 1] - int(0.02 * SR))
        seg = fade(x[a:b].copy(), 0.002, 0.08)
        if len(seg) < int(0.12 * SR):
            continue
        steps.append(normalize(seg, None, -2.0))
    for k, seg in enumerate(steps[:8]):
        encode(seg, f"sfx/step_{k + 1}", 96)
        manifest[f"step_{k + 1}"] = {"loop": False}
    print("footsteps sliced:", len(steps))


if __name__ == "__main__":
    os.makedirs(f"{OUT}/music", exist_ok=True)
    os.makedirs(f"{OUT}/sfx", exist_ok=True)
    music()
    sfx()
    footsteps()
    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    print("wrote", len(manifest), "audio entries")
