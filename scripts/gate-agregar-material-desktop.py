#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageChops
import json

BEFORE = Path("/opt/cursor/artifacts/agregar-material-desktop/before")
AFTER = Path("/opt/cursor/artifacts/agregar-material-desktop/after")
OUT = Path("/opt/cursor/artifacts/agregar-material-desktop/gates")
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = [
    ("B_material_rapido_desktop.png", "T_material_rapido_desktop_post.png", "Material rápido Desktop"),
    ("C_material_rapido_mobile.png", "material_rapido_mobile_post.png", "Material rápido Mobile"),
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
    extrema = diff.crop(bbox).getextrema()
    return {
        "changed": (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]),
        "bbox": bbox,
        "max_channel": max(ch[1] for ch in extrema),
    }


results = []
for before_name, after_name, label in PAIRS:
    bp, ap = BEFORE / before_name, AFTER / after_name
    row = {"label": label, "before": before_name, "after": after_name}
    if not bp.exists() or not ap.exists():
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

before_a = BEFORE / "A_agregar_material_desktop.png"
after_b = AFTER / "B_implementado_vacio.png"
if before_a.exists() and after_b.exists():
    a = Image.open(before_a).convert("RGB")
    b = Image.open(after_b).convert("RGB")
    w, h = a.size
    side = Image.new("RGB", (w * 2 + 24, h), (17, 17, 17))
    side.paste(a, (0, 0))
    side.paste(b, (w + 24, 0))
    side.save(AFTER / "C_side_by_side.png")
    overlay = Image.blend(a.resize(b.size), b, 0.5)
    overlay.save(AFTER / "D_overlay_50.png")
    print("composites OK")
