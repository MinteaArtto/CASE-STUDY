"""Extract MobileNetV2 features (1280-d) for every crop in manifest.csv and save ONE .npz file.

Run once; training scripts then reuse the saved features (no need to re-read images).

Usage (from the project root, venv active):
  python ml\\extract_features.py --crops "C:\\Users\\Charmaine\\Downloads\\cropped ripeness" --out "C:\\Users\\Charmaine\\Downloads\\features_ripeness.npz"
"""
import argparse, csv, time
from pathlib import Path
import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms


def parse_label(name):
    """'Apple Overripe' / 'PearOverripe' -> ('Apple'/'Pear', 'Overripe'). Order matters (check Overripe/Unripe before Ripe)."""
    low = name.strip().lower()
    for key, stage in (("overripe", "Overripe"), ("unripe", "Unripe"), ("rotten", "Rotten"), ("ripe", "Ripe")):
        if low.endswith(key):
            return name.strip()[: -len(key)].strip(), stage
    return name.strip(), "Unknown"


class Crops(Dataset):
    def __init__(self, rows, tf):
        self.rows, self.tf = rows, tf

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        img = Image.open(self.rows[i]["crop_path"]).convert("RGB")
        return self.tf(img)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--crops", required=True, help="folder that contains manifest.csv")
    ap.add_argument("--out", required=True, help="output .npz file")
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--workers", type=int, default=0, help="keep 0 on Windows unless you know it works")
    ap.add_argument("--limit", type=int, default=0, help="only use the first N crops (quick test)")
    ap.add_argument("--random_weights", action="store_true", help="DEBUG ONLY: skip ImageNet weights")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(Path(a.crops) / "manifest.csv", encoding="utf-8")))
    if a.limit:
        rows = rows[: a.limit]
    print(f"{len(rows)} crops")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)
    weights = None if a.random_weights else models.MobileNet_V2_Weights.IMAGENET1K_V1
    net = models.mobilenet_v2(weights=weights)
    net.classifier = torch.nn.Identity()          # keep the 1280-d pooled features
    net.eval().to(device)

    tf = transforms.Compose([
        transforms.Resize((224, 224)),            # whole fruit, no cropping away parts
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    dl = DataLoader(Crops(rows, tf), batch_size=a.batch, num_workers=a.workers)

    feats, t0 = [], time.time()
    with torch.no_grad():
        for b, x in enumerate(dl, 1):
            feats.append(net(x.to(device)).cpu().numpy().astype(np.float32))
            if b % 20 == 0 or b == len(dl):
                done = min(b * a.batch, len(rows))
                print(f"  {done}/{len(rows)}  ({time.time() - t0:.0f}s)", flush=True)
    X = np.concatenate(feats)

    fruit, stage = zip(*(parse_label(r["class"]) for r in rows))
    np.savez_compressed(
        a.out, X=X,
        stage=np.array(stage), fruit=np.array(fruit),
        split=np.array([r["split"] for r in rows]),
        source=np.array([r["source_image"] for r in rows]),
        path=np.array([r["crop_path"] for r in rows]),
    )
    print("saved", a.out, X.shape)


if __name__ == "__main__":
    main()