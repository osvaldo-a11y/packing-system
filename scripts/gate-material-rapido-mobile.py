#!/usr/bin/env python3
"""Pixel gates vs ANTES baselines for Material rápido Mobile."""
from pathlib import Path
from PIL import Image, ImageChops
import json

BEFORE = Path("/opt/cursor/artifacts/material-rapido-mobile/before")
AFTER = Path("/opt/cursor/artifacts/material-rapido-mobile/after")
OUT = Path("/opt/cursor/artifacts/material-rapido-mobile/gates")
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = [
    ("A_material_rapido_desktop.png", "I_material_rapido_desktop_post.png", "Material rápido Desktop"),
    ("materials_desktop.png", "materials_desktop.png", "Materiales Desktop"),
    ("materials_mobile.png", "materials_mobile.png", "Materiales Mobile"),
    ("dispatches_desktop.png", "dispatches_desktop.png", "Despachos Desktop"),
    ("dispatches_mobile.png", "dispatches_mobile.png", "Despachos Mobile"),
    ("stock_desktop.png", "stock_desktop.png", "Stock Desktop"),
    ("stock_mobile.png", "stock_mobile.png", "Stock Mobile"),
    ("pt_tags_desktop.png", "pt_tags_desktop.png", "PT Desktop"),
    ("pt_tags_mobile.png", "pt_tags_mobile.png", "PT Mobile"),
    ("processes_desktop.png", "processes_desktop.png", "Procesos Desktop"),
    ("processes_mobile.png", "processes_mobile.png", "Procesos Mobile"),
    ("receptions_desktop.png", "receptions_desktop.png", "Recepciones Desktop"),
    ("receptions_mobile.png", "receptions_mobile.png", "Recepciones Mobile"),
]


def bbox_diff(a: Image.Image, b: Image.Image):
    a = a.convert("RGB")
    b = b.convert("RGB")
    if a.size != b.size:
        return {"error": f"size {a.size} vs {b.size}", "changed": None}
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if not bbox:
        return {"changed": 0, "bbox": None, "max_channel": 0}
    w, h = a.size
    crop = diff.crop(bbox)
    extrema = crop.getextrema()
    max_ch = max(ch[1] for ch in extrema)
    return {
        "changed": (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]),
        "bbox": bbox,
        "max_channel": max_ch,
        "pct_bbox": round(100 * (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) / (w * h), 4),
    }


results = []
for before_name, after_name, label in PAIRS:
    bp, ap = BEFORE / before_name, AFTER / after_name
    row = {"label": label, "before": before_name, "after": after_name}
    if not bp.exists() or not ap.exists():
        row["error"] = f"missing {'before' if not bp.exists() else 'after'}"
        results.append(row)
        print("MISSING", label)
        continue
    metrics = bbox_diff(Image.open(bp), Image.open(ap))
    row.update(metrics)
    results.append(row)
    print(f"{label}: changed_px_bbox={metrics.get('changed')} max={metrics.get('max_channel')} {metrics.get('error','')}")

(OUT / "report.json").write_text(json.dumps(results, indent=2))
print("wrote", OUT / "report.json")
