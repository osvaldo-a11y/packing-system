#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageChops
import json

# Prefer last approved desktop UX-final / material indexes when present.
CANDIDATES = [
    Path("/opt/cursor/artifacts/agregar-material-desktop-ux-final"),
    Path("/opt/cursor/artifacts/agregar-material-desktop/after"),
    Path("/opt/cursor/artifacts/agregar-material-desktop/before"),
    Path("/opt/cursor/artifacts/material-rapido-mobile/after"),
]
AFTER = Path("/opt/cursor/artifacts/agregar-material-mobile/after")
OUT = Path("/opt/cursor/artifacts/agregar-material-mobile/gates")
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = [
    ("agregar_material_desktop_post.png", "agregar_material_desktop_post.png", "Agregar material Desktop"),
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


def find_before(name: str):
    aliases = {
        "agregar_material_desktop_post.png": [
            "agregar_material_desktop_post.png",
            "A_vacio.png",
            "B_implementado_vacio.png",
            "A_agregar_material_desktop.png",
        ],
        "material_rapido_desktop.png": ["material_rapido_desktop.png", "T_material_rapido_desktop_post.png", "B_material_rapido_desktop.png"],
        "material_rapido_mobile.png": ["material_rapido_mobile.png", "C_material_rapido_mobile.png"],
    }
    names = aliases.get(name, [name])
    for folder in CANDIDATES:
        for n in names:
            p = folder / n
            if p.exists():
                return p
    return None


def bbox_diff(a: Image.Image, b: Image.Image):
    a = a.convert("RGB")
    b = b.convert("RGB")
    if a.size != b.size:
        return {"error": f"size {a.size} vs {b.size}", "changed": None}
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if not bbox:
        return {"changed": 0, "bbox": None, "max_channel": 0}
    extrema = diff.crop(bbox).getextrema()
    return {
        "changed": (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]),
        "bbox": bbox,
        "max_channel": max(ch[1] for ch in extrema),
    }


results = []
for before_name, after_name, label in PAIRS:
    bp = find_before(before_name)
    ap = AFTER / after_name
    row = {"label": label, "after": after_name, "before": str(bp) if bp else None}
    if not bp or not ap.exists():
        row["error"] = "missing"
        results.append(row)
        print("MISSING", label)
        continue
    metrics = bbox_diff(Image.open(bp), Image.open(ap))
    row.update(metrics)
    results.append(row)
    print(f"{label}: changed_px_bbox={metrics.get('changed')} max={metrics.get('max_channel')} {metrics.get('error','')}")

(OUT / "report.json").write_text(json.dumps(results, indent=2))
print("wrote", OUT / "report.json")
