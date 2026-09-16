from pathlib import Path

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


# ============================================================
# SETTINGS
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

MODEL_NAME = "openai/clip-vit-base-patch32"


# ============================================================
# LABEL GROUPS
# ============================================================

PRODUCE_PROMPTS = [
    "a photo of a fruit",
    "a photo of a vegetable",
    "a photo of fresh fruit",
    "a photo of rotten fruit",
    "a photo of fresh vegetables",
    "a photo of rotten vegetables",
    "a photo of agricultural produce",
]

NON_PRODUCE_PROMPTS = [
    "a photo of an electronic device",
    "a photo of furniture",
    "a photo of a vehicle",
    "a photo of an animal",
    "a photo of a person",
    "a photo of clothing",
    "a photo of a household object",
    "a photo of a building",
    "a photo of a tool",
    "a photo of prepared food",
    "a photo of cooked food",
]


ALL_PROMPTS = (
    PRODUCE_PROMPTS
    + NON_PRODUCE_PROMPTS
)


# ============================================================
# LOAD CLIP
# ============================================================

print("Loading produce validator...")

processor = CLIPProcessor.from_pretrained(
    MODEL_NAME
)

model = CLIPModel.from_pretrained(
    MODEL_NAME
)

model = model.to(
    DEVICE
)

model.eval()

print(
    f"Produce validator loaded on {DEVICE}."
)


# ============================================================
# VALIDATE IMAGE
# ============================================================

def validate_produce(
    image_path
):

    image_path = Path(
        image_path
    )

    image = Image.open(
        image_path
    ).convert("RGB")


    inputs = processor(
        text=ALL_PROMPTS,
        images=image,
        return_tensors="pt",
        padding=True,
    )


    inputs = {
        key: value.to(DEVICE)
        for key, value
        in inputs.items()
    }


    with torch.no_grad():

        outputs = model(
            **inputs
        )

        probabilities = (
            outputs.logits_per_image
            .softmax(dim=1)[0]
        )


    produce_count = len(
        PRODUCE_PROMPTS
    )

    produce_score = (
        probabilities[
            :produce_count
        ]
        .sum()
        .item()
    )

    non_produce_score = (
        probabilities[
            produce_count:
        ]
        .sum()
        .item()
    )


    is_produce = (
        produce_score
        > non_produce_score
    )


    return {
        "is_produce":
            is_produce,

        "produce_score":
            round(
                produce_score,
                4,
            ),

        "non_produce_score":
            round(
                non_produce_score,
                4,
            ),
    }


# ============================================================
# COMMAND LINE TEST
# ============================================================

if __name__ == "__main__":

    import sys

    if len(sys.argv) < 2:

        print(
            "Usage: "
            "python produce_validator.py "
            "<image_path>"
        )

        raise SystemExit(1)


    result = validate_produce(
        sys.argv[1]
    )

    print()
    print("=" * 60)
    print("PRODUCE VALIDATION")
    print("=" * 60)

    print(
        f"Produce: "
        f"{result['is_produce']}"
    )

    print(
        f"Produce score: "
        f"{result['produce_score']}"
    )

    print(
        f"Non-produce score: "
        f"{result['non_produce_score']}"
    )