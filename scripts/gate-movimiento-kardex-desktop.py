#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageChops
import json

CANDIDATES = [
    Path("/opt/cursor/artifacts/agregar-material-mobile/after"),
    Path("/opt/cursor/artifacts/agregar-material-desktop-ux-final"),
    Path("/opt/cursor/artifacts/agregar-material-desktop/after"),
    Path("/opt/cursor/artifacts/material-rapido-mobile/after"),
]
AFTER = Path("/opt/cursor/artifacts/movimiento-kardex-desktop/after")
OUT = Path("/opt/cursor/artifacts/movimiento-kardex-desktop/gates")
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = [
    ("agregar_material_desktop.png", "agregar_material_desktop.png", "Agregar material Desktop"),
    ("agregar_material_mobile.png", "agregar_material_mobile.png", "Agregar material Mobile"),
    ("material_rapido_desktop.png", "material_rapido_desktop.png", "Material rápido Desktop"),
    ("material_rapido_mobile.png", "material_rapido_mobile.png", "Material rápido Mobile"),
    ("materials_desktop.png", "materials_desktop.png", "Materiales Desktop"),
    ("materials_mobile.png", "materials_mobile.png", "Materiales Mobile"),
    ("dispatches_desktop.png", "dispatches_desktop.png", "Despachos Desktop"),
    ("dispatches_mobile.png", "dispatches_mobile.png", "Despachos Mobile"),
    ("stock_desktop.png", "stock_desktop.png", "Stock Desktop"),
    ("stock_mobile.png", "stock_mobile.png", "Stock Mobile"),
    ("packing_lists_desktop.png", "packing_lists_desktop.png", "Packing Lists Desktop"),
    ("packing_lists_mobile.png", "packing_lists_mobile.png", "Packing Lists Mobile"),
    ("repallet_desktop.png", "repallet_desktop.png", "Repaletizaje Desktop"),
    ("repallet_mobile.png", "repallet_mobile.png", "Repaletizaje Mobile"),
    ("pt_tags_desktop.png", "pt_tags_desktop.png", "PT Desktop"),
    ("pt_tags_mobile.png", "pt_tags_mobile.png", "PT Mobile"),
    ("processes_desktop.png", "processes_desktop.png", "Procesos Desktop"),
    ("processes_mobile.png", "processes_mobile.png", "Procesos Mobile"),
    ("receptions_desktop.png", "receptions_desktop.png", "Recepciones Desktop"),
    ("receptions_mobile.png", "receptions_mobile.png", "Recepciones Mobile"),
    ("home_desktop.png", "home_desktop.png", "Home Desktop"),
    ("home_mobile.png", "home_mobile.png", "Home Mobile"),
]

ALIASES = {
    "agregar_material_desktop.png": ["agregar_material_desktop.png", "agregar_material_desktop_post.png", "A_vacio.png"],
    "agregar_material_mobile.png": ["agregar_material_mobile.png", "A_top.png"],
    "material_rapido_desktop.png": ["material_rapido_desktop.png", "T_material_rapido_desktop_post.png"],
    "material_rapido_mobile.png": ["material_rapido_mobile.png", "C_material_rapido_mobile.png"],
}


def find_before(name: str):
    for folder in CANDIDATES:
        for n in ALIASES.get(name, [name]):
            p = folder / n
            if p.exists():
                return p
    return None


def bbox_diff(a: Image.Image, b: Image.Image):
    a, b = a.convert("RGB"), b.convert("RGB")
    if a.size != b.size:
        return {"error": f"size {a.size} vs {b.size}", "changed": None}
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if not bbox:
        return {"changed": 0, "max_channel": 0}
    return {"changed": (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]), "max_channel": max(ch[1] for ch in diff.crop(bbox).getextrema())}


results = []
for before_name, after_name, label in PAIRS:
    bp, ap = find_before(before_name), AFTER / after_name
    row = {"label": label, "before": str(bp) if bp else None}
    if not bp or not ap.exists():
        row["error"] = "missing baseline or after"
        results.append(row)
        print("NO BASELINE / AFTER", label)
        continue
    metrics = bbox_diff(Image.open(bp), Image.open(ap))
    row.update(metrics)
    results.append(row)
    print(f"{label}: changed_px_bbox={metrics.get('changed')} {metrics.get('error','')}")

(OUT / "report.json").write_text(json.dumps(results, indent=2))
print("wrote", OUT / "report.json")
