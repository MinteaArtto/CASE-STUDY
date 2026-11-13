"""Train the RIPENESS Decision Tree (Unripe / Ripe / Overripe) on saved MobileNetV2 features.

Uses the dataset's own train / valid / test split, balanced class weights, fixed seed.
Hyperparameters are chosen on the VALID split; TEST is used once at the end.

Usage:
  python ml\\train_ripeness_tree.py --features "C:\\Users\\Charmaine\\Downloads\\features_ripeness.npz" --outdir ml\\model\\ripeness
"""
import argparse, json, itertools
from pathlib import Path
import numpy as np
import joblib
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score, accuracy_score

STAGES = ["Unripe", "Ripe", "Overripe"]      # Rotten is the condition model's job, so excluded here
SEED = 42


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", required=True)
    ap.add_argument("--outdir", default="ml/model/ripeness")
    a = ap.parse_args()
    out = Path(a.outdir); out.mkdir(parents=True, exist_ok=True)

    d = np.load(a.features, allow_pickle=False)
    keep = np.isin(d["stage"], STAGES)
    X, y, fruit, split = d["X"][keep], d["stage"][keep], d["fruit"][keep], d["split"][keep]
    tr, va, te = (split == "train"), (split == "valid"), (split == "test")
    print(f"train {tr.sum()}  valid {va.sum()}  test {te.sum()}")
    for s in STAGES:
        print(f"  {s:9} train {np.sum(y[tr]==s):5}  valid {np.sum(y[va]==s):4}  test {np.sum(y[te]==s):4}")

    # choose hyperparameters on the validation split (macro-F1 treats the 3 classes equally)
    best, best_f1 = None, -1
    for depth, leaf in itertools.product([4, 6, 8, 10, 12, 16, None], [1, 5, 10, 20]):
        m = DecisionTreeClassifier(max_depth=depth, min_samples_leaf=leaf,
                                   class_weight="balanced", random_state=SEED).fit(X[tr], y[tr])
        f1 = f1_score(y[va], m.predict(X[va]), average="macro")
        if f1 > best_f1:
            best, best_f1 = (depth, leaf), f1
    print(f"\nbest on valid: max_depth={best[0]}, min_samples_leaf={best[1]}  macro-F1={best_f1:.3f}")

    model = DecisionTreeClassifier(max_depth=best[0], min_samples_leaf=best[1],
                                   class_weight="balanced", random_state=SEED).fit(X[tr], y[tr])
    pred = model.predict(X[te])
    print("\n=== TEST RESULTS ===")
    print(f"accuracy {accuracy_score(y[te], pred):.3f}   macro-F1 {f1_score(y[te], pred, average='macro'):.3f}\n")
    print(classification_report(y[te], pred, labels=STAGES, digits=3, zero_division=0))
    cm = confusion_matrix(y[te], pred, labels=STAGES)
    print("confusion matrix (rows = true, cols = predicted):", STAGES)
    print(cm)

    print("\naccuracy per fruit (test) -- tiny n means unreliable:")
    per_fruit = {}
    for f in sorted(set(fruit[te])):
        m = fruit[te] == f
        per_fruit[f] = {"n": int(m.sum()), "accuracy": round(float(accuracy_score(y[te][m], pred[m])), 3)}
        print(f"  {f:8} n={m.sum():4}  acc={per_fruit[f]['accuracy']:.3f}")

    joblib.dump({"model": model, "classes": STAGES, "feature_dim": X.shape[1]}, out / "ripeness_tree.joblib")
    json.dump({"max_depth": best[0], "min_samples_leaf": best[1], "seed": SEED,
               "valid_macro_f1": round(best_f1, 4),
               "test_accuracy": round(float(accuracy_score(y[te], pred)), 4),
               "test_macro_f1": round(float(f1_score(y[te], pred, average="macro")), 4),
               "confusion_matrix": cm.tolist(), "labels": STAGES, "per_fruit": per_fruit},
              open(out / "ripeness_metrics.json", "w"), indent=2)
    try:
        import matplotlib; matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(4.5, 4))
        ax.imshow(cm, cmap="Blues")
        ax.set_xticks(range(3)); ax.set_xticklabels(STAGES); ax.set_yticks(range(3)); ax.set_yticklabels(STAGES)
        ax.set_xlabel("Predicted"); ax.set_ylabel("True"); ax.set_title("Ripeness - test set")
        for i in range(3):
            for j in range(3):
                ax.text(j, i, cm[i, j], ha="center", va="center",
                        color="white" if cm[i, j] > cm.max() / 2 else "black")
        fig.tight_layout(); fig.savefig(out / "ripeness_confusion_matrix.png", dpi=200)
    except ImportError:
        print("(matplotlib not installed - skipped confusion matrix image)")
    print(f"\nsaved model + metrics to {out}")


if __name__ == "__main__":
    main()