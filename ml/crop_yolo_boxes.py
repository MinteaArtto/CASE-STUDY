"""Crop YOLO-format bounding boxes into per-fruit images + a manifest CSV.

Usage (PowerShell, from anywhere):
  python crop_yolo_boxes.py --dataset "D:\\data\\fruit-ripeness" --out "D:\\data\\ripeness_crops"

Handles both layouts:  train/images + train/labels   or   images/train + labels/train
Class names are read from data.yaml. Keeps the original split (train/valid/test)
so crops from one photo never end up in two splits.
"""
import argparse, csv, re
from pathlib import Path
from PIL import Image

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

def read_names(yaml_path):
    txt = yaml_path.read_text(encoding="utf-8")
    m = re.search(r"names\s*:\s*\[(.*?)\]", txt, re.S)          # names: ['a','b']
    if m:
        return [s.strip().strip("'\"") for s in m.group(1).split(",") if s.strip()]
    names, grab = {}, False                                      # names:\n  0: a  (or - a)
    for line in txt.splitlines():
        if re.match(r"names\s*:\s*$", line): grab = True; continue
        if grab:
            m = re.match(r"\s+(\d+)\s*:\s*(.+)", line)
            if m: names[int(m.group(1))] = m.group(2).strip().strip("'\""); continue
            m = re.match(r"\s*-\s*(.+)", line)
            if m: names[len(names)] = m.group(1).strip().strip("'\""); continue
            if line.strip() and not line.startswith(" "): break
    return [names[i] for i in sorted(names)]

def find_pairs(root, split):
    for img_dir, lbl_dir in ((root/split/"images", root/split/"labels"),
                             (root/"images"/split, root/"labels"/split)):
        if img_dir.is_dir() and lbl_dir.is_dir():
            return img_dir, lbl_dir
    return None, None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--margin", type=float, default=0.05, help="extra margin around box (fraction)")
    ap.add_argument("--min_size", type=int, default=32, help="skip crops smaller than this (px)")
    a = ap.parse_args()
    root, out = Path(a.dataset), Path(a.out)
    names = read_names(root/"data.yaml")
    print("classes:", names)
    rows, skipped = [], 0
    for split in ("train", "valid", "val", "test"):
        img_dir, lbl_dir = find_pairs(root, split)
        if not img_dir: continue
        split_name = "valid" if split == "val" else split
        for img_path in sorted(p for p in img_dir.iterdir() if p.suffix.lower() in IMG_EXT):
            lbl = lbl_dir/(img_path.stem + ".txt")
            if not lbl.exists(): continue
            im = Image.open(img_path).convert("RGB"); W, H = im.size
            for k, line in enumerate(lbl.read_text().splitlines()):
                p = line.split()
                if len(p) < 5: continue
                c = int(float(p[0])); cx, cy, w, h = (float(v) for v in p[1:5])
                bw, bh = w*W*(1+2*a.margin), h*H*(1+2*a.margin)
                x0, y0 = max(0, int(cx*W - bw/2)), max(0, int(cy*H - bh/2))
                x1, y1 = min(W, int(cx*W + bw/2)), min(H, int(cy*H + bh/2))
                if x1-x0 < a.min_size or y1-y0 < a.min_size: skipped += 1; continue
                cls = names[c] if c < len(names) else f"class{c}"
                d = out/split_name/cls; d.mkdir(parents=True, exist_ok=True)
                f = d/f"{img_path.stem}_{k}.jpg"
                im.crop((x0, y0, x1, y1)).save(f, quality=95)
                rows.append([str(f), split_name, cls, img_path.name])
    out.mkdir(parents=True, exist_ok=True)
    with open(out/"manifest.csv", "w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fh); wr.writerow(["crop_path", "split", "class", "source_image"]); wr.writerows(rows)
    print(f"saved {len(rows)} crops, skipped {skipped} tiny boxes -> {out}")
    from collections import Counter
    for (s, c), n in sorted(Counter((r[1], r[2]) for r in rows).items()): print(f"  {s:6} {c:12} {n}")

if __name__ == "__main__":
    main()