"""Single-pass extract of Greek Antique Casino assets into VaultRun/assets/antique."""
import tarfile, os, json, re
from collections import defaultdict

PKG = r"H:\MobileProject\2024newgames\slot_game\MK - Antique Casino Bundle\MK\MK - Antique Casino Bundle v1.1.0\MK - Antique Casino Bundle v1.1.0.unitypackage"
IDX = r"C:\Users\GAMING X\Downloads\VaultRun\_bundle_index.json"
DEST = r"C:\Users\GAMING X\Downloads\VaultRun\assets\antique"

anim_map = {
    "Wild": "WILD",
    "Scatter": "SCAT",
    "Alpha": "H1",
    "Beta": "H2",
    "Psi": "H3",
    "Sigma": "H4",
    "Diamond": "H5",
    "Heart": "H6",
    "Spade": "L1",
    "Club": "L2",
    "Coin Spin": "COIN",
    "Bonus": "BONUS",
    "FreeSpin": "FREESPIN",
    "Jackpot": "JACKPOT",
}

idx = json.load(open(IDX, encoding="utf-8"))
pathmap = idx["pathmap"]

anim_frames = defaultdict(list)
gui_files = []

for g, p in pathmap.items():
    p2 = p.replace("\\", "/")
    if not p2.lower().endswith(".png"):
        continue
    if "Greek" not in p2:
        continue
    parts = p2.split("/")
    if "Animations" in parts:
        i = parts.index("Animations")
        folder = parts[i + 1] if i + 1 < len(parts) else ""
        if folder in anim_map:
            anim_frames[folder].append((g, p2, parts[-1]))
    elif any(x in p2 for x in ["GUI Elements", "Game Screen", "Pop Ups", "Splash Screen"]):
        gui_files.append((g, p2, parts[-1]))

print("anim", {k: len(v) for k, v in anim_frames.items()})
print("gui", len(gui_files))


def frame_num(name):
    m = re.search(r"(\d+)", name)
    return int(m.group(1)) if m else 0


FRAME_CAP = 12
guid_to_dest = {}  # guid -> list of dest relative paths (usually one)

for folder, files in anim_frames.items():
    files = sorted(files, key=lambda x: frame_num(x[2]))
    if len(files) > FRAME_CAP:
        step = len(files) / FRAME_CAP
        files = [files[int(i * step)] for i in range(FRAME_CAP)]
    sym = anim_map[folder]
    for i, (g, p2, name) in enumerate(files):
        dest = os.path.join("symbols", sym, f"{i:02d}.png")
        guid_to_dest.setdefault(g, []).append(dest)

seen = set()
for g, p2, name in gui_files:
    low = p2.lower()
    if "game screen" in low:
        sub = "screen"
    elif "splash" in low:
        sub = "splash"
    elif "pop" in low:
        sub = "popup"
    else:
        sub = "gui"
    key = sub + "/" + name
    if key in seen:
        continue
    seen.add(key)
    dest = os.path.join("ui", sub, name)
    guid_to_dest.setdefault(g, []).append(dest)

wanted = set(guid_to_dest.keys())
print("wanted guids", len(wanted))

os.makedirs(DEST, exist_ok=True)
extracted = 0
manifest = {"symbols": {}, "ui": {}, "source": "MK Antique Casino / Greek"}

print("streaming package...")
with tarfile.open(PKG, "r:gz") as tf:
    for m in tf:
        name = m.name.replace("\\", "/")
        parts = name.split("/")
        if len(parts) < 2:
            continue
        guid, leaf = parts[0], parts[-1]
        if leaf != "asset" or guid not in wanted:
            continue
        f = tf.extractfile(m)
        if not f:
            continue
        data = f.read()
        if len(data) < 200 or data[:8] != b"\x89PNG\r\n\x1a\n":
            # still allow if png magic missing but large
            if len(data) < 500:
                continue
        for dest_rel in guid_to_dest[guid]:
            out_path = os.path.join(DEST, dest_rel)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as out:
                out.write(data)
            extracted += 1
            norm = dest_rel.replace("\\", "/")
            if norm.startswith("symbols/"):
                sym = norm.split("/")[1]
                manifest["symbols"].setdefault(sym, []).append(norm)
            elif norm.startswith("ui/"):
                cat = norm.split("/")[1]
                manifest["ui"].setdefault(cat, []).append(norm)
        if extracted % 20 == 0:
            print("...", extracted)

# sort frames
for k in manifest["symbols"]:
    manifest["symbols"][k] = sorted(manifest["symbols"][k])

with open(os.path.join(DEST, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

print("DONE extracted", extracted)
print("symbols", {k: len(v) for k, v in manifest["symbols"].items()})
print("ui", {k: len(v) for k, v in manifest["ui"].items()})
