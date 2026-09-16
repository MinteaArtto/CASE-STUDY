import json
import sys
from pathlib import Path

import joblib
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms
from transformers import CLIPModel, CLIPProcessor


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"

CNN_MODEL_PATH = (
    MODEL_DIR
    / "fresh_rotten_model.pth"
)

TREE_MODEL_PATH = (
    MODEL_DIR
    / "fresh_rotten_decision_tree.joblib"
)

OOD_MODEL_PATH = (
    MODEL_DIR
    / "fresh_rotten_knn_ood_calibrated.joblib"
)


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# ============================================================
# CLIP SETTINGS
# ============================================================

CLIP_MODEL_NAME = (
    "openai/clip-vit-base-patch32"
)

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
# IMAGE TRANSFORM FOR CNN
# ============================================================

cnn_transform = transforms.Compose([
    transforms.Resize(
        (224, 224)
    ),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[
            0.485,
            0.456,
            0.406,
        ],

        std=[
            0.229,
            0.224,
            0.225,
        ],
    ),
])


# ============================================================
# LOAD CLIP
# ============================================================

def load_clip():

    processor = (
        CLIPProcessor.from_pretrained(
            CLIP_MODEL_NAME
        )
    )

    model = (
        CLIPModel.from_pretrained(
            CLIP_MODEL_NAME
        )
    )

    model = model.to(
        DEVICE
    )

    model.eval()

    return model, processor


# ============================================================
# LOAD CNN
# ============================================================

def load_cnn():

    model = models.mobilenet_v2(
        weights=None
    )

    model.classifier[1] = (
        nn.Linear(
            model.last_channel,
            2,
        )
    )

    model.load_state_dict(
        torch.load(
            CNN_MODEL_PATH,
            map_location=DEVICE,
        )
    )

    model = model.to(
        DEVICE
    )

    model.eval()

    return model


# ============================================================
# CREATE CNN FEATURE EXTRACTOR
# ============================================================

def create_feature_extractor(
    cnn_model
):

    extractor = nn.Sequential(
        cnn_model.features,

        nn.AdaptiveAvgPool2d(
            (1, 1)
        ),

        nn.Flatten(),
    )

    extractor = extractor.to(
        DEVICE
    )

    extractor.eval()

    return extractor


# ============================================================
# LOAD DECISION TREE
# ============================================================

def load_decision_tree():

    tree_data = joblib.load(
        TREE_MODEL_PATH
    )

    # Supports the bundle produced by
    # train_decision_tree.py
    if isinstance(
        tree_data,
        dict
    ):

        tree = tree_data[
            "model"
        ]

        class_names = tree_data.get(
            "class_names",
            [
                "Fresh",
                "Rotten",
            ],
        )

    else:

        tree = tree_data

        class_names = [
            "Fresh",
            "Rotten",
        ]

    return (
        tree,
        class_names,
    )


# ============================================================
# LOAD OOD MODEL
# ============================================================

def load_ood_detector():

    data = joblib.load(
        OOD_MODEL_PATH
    )

    return data


# ============================================================
# PRODUCE VALIDATION
# ============================================================

def validate_produce(
    image,
    clip_model,
    clip_processor,
):

    inputs = clip_processor(
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

        outputs = clip_model(
            **inputs
        )

        probabilities = (
            outputs
            .logits_per_image
            .softmax(dim=1)[0]
        )

    produce_count = len(
        PRODUCE_PROMPTS
    )

    produce_score = float(
        probabilities[
            :produce_count
        ]
        .sum()
        .item()
    )

    non_produce_score = float(
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
            produce_score,

        "non_produce_score":
            non_produce_score,
    }


# ============================================================
# CNN FEATURE EXTRACTION
# ============================================================

def extract_cnn_feature(
    image,
    feature_extractor,
):

    tensor = cnn_transform(
        image
    )

    tensor = tensor.unsqueeze(
        0
    )

    tensor = tensor.to(
        DEVICE
    )

    with torch.no_grad():

        feature = feature_extractor(
            tensor
        )

    return (
        feature
        .cpu()
        .numpy()
    )


# ============================================================
# OOD / NOVELTY CHECK
# ============================================================

def check_ood(
    feature,
    ood_data,
):

    scaler = ood_data[
        "scaler"
    ]

    knn = ood_data[
        "knn"
    ]

    k_neighbors = ood_data[
        "k_neighbors"
    ]

    p95 = float(
        ood_data[
            "p95"
        ]
    )

    p97 = float(
        ood_data[
            "p97"
        ]
    )

    p99 = float(
        ood_data[
            "p99"
        ]
    )

    scaled_feature = (
        scaler.transform(
            feature
        )
    )

    distances, _ = (
        knn.kneighbors(
            scaled_feature,
            n_neighbors=k_neighbors,
        )
    )

    distances = distances[0]

    nearest_distance = float(
        distances[0]
    )

    mean_distance = float(
        np.mean(
            distances
        )
    )

    if mean_distance <= p95:

        novelty_level = (
            "known_like"
        )

    elif mean_distance <= p97:

        novelty_level = (
            "slightly_unusual"
        )

    elif mean_distance <= p99:

        novelty_level = (
            "unusual_but_acceptable"
        )

    else:

        novelty_level = (
            "highly_unfamiliar"
        )

    accepted = (
        mean_distance
        <= p99
    )

    return {
        "accepted":
            accepted,

        "novelty_level":
            novelty_level,

        "nearest_distance":
            nearest_distance,

        "mean_knn_distance":
            mean_distance,

        "thresholds": {
            "p95":
                p95,

            "p97":
                p97,

            "p99":
                p99,
        },
    }


# ============================================================
# DECISION TREE CLASSIFICATION
# ============================================================

def classify_spoilage(
    feature,
    tree,
    class_names,
):

    prediction_index = int(
        tree.predict(
            feature
        )[0]
    )

    probabilities = (
        tree.predict_proba(
            feature
        )[0]
    )

    predicted_label = (
        class_names[
            prediction_index
        ]
    )

    probability = float(
        probabilities[
            prediction_index
        ]
    )

    class_probabilities = {}

    for index, name in enumerate(
        class_names
    ):

        class_probabilities[
            name
        ] = float(
            probabilities[
                index
            ]
        )

    return {
        "prediction":
            predicted_label,

        "tree_probability":
            probability,

        "probabilities":
            class_probabilities,
    }


# ============================================================
# COMPLETE PIPELINE
# ============================================================

def analyze_image(
    image_path
):

    image_path = Path(
        image_path
    )

    if not image_path.exists():

        return {
            "success": False,

            "status":
                "error",

            "message":
                "Image file does not exist.",
        }


    # --------------------------------------------------------
    # Load image
    # --------------------------------------------------------

    try:

        image = Image.open(
            image_path
        ).convert(
            "RGB"
        )

    except Exception as error:

        return {
            "success":
                False,

            "status":
                "error",

            "message":
                f"Unable to open image: {error}",
        }


    # --------------------------------------------------------
    # Load models
    # --------------------------------------------------------

    clip_model, clip_processor = (
        load_clip()
    )

    cnn_model = load_cnn()

    feature_extractor = (
        create_feature_extractor(
            cnn_model
        )
    )

    tree, class_names = (
        load_decision_tree()
    )

    ood_data = (
        load_ood_detector()
    )


    # ========================================================
    # STAGE 1
    # PRODUCE VALIDATOR
    # ========================================================

    produce_result = (
        validate_produce(
            image,
            clip_model,
            clip_processor,
        )
    )


    if not produce_result[
        "is_produce"
    ]:

        return {
            "success":
                True,

            "status":
                "rejected_non_produce",

            "message":
                (
                    "The uploaded image was not "
                    "recognized as fruit or vegetable "
                    "produce."
                ),

            "produce_validation": {
                "is_produce":
                    False,

                "produce_score":
                    round(
                        produce_result[
                            "produce_score"
                        ],
                        4,
                    ),

                "non_produce_score":
                    round(
                        produce_result[
                            "non_produce_score"
                        ],
                        4,
                    ),
            },

            "ood":
                None,

            "spoilage":
                None,
        }


    # ========================================================
    # STAGE 2
    # CNN FEATURE EXTRACTION
    # ========================================================

    feature = (
        extract_cnn_feature(
            image,
            feature_extractor,
        )
    )


    # ========================================================
    # STAGE 3
    # OOD / NOVELTY CHECK
    # ========================================================

    ood_result = (
        check_ood(
            feature,
            ood_data,
        )
    )


    if not ood_result[
        "accepted"
    ]:

        return {
            "success":
                True,

            "status":
                "unfamiliar_produce",

            "message":
                (
                    "Produce was detected, but the "
                    "image is outside the model's "
                    "familiar training range. "
                    "Manual inspection is recommended."
                ),

            "produce_validation": {
                "is_produce":
                    True,

                "produce_score":
                    round(
                        produce_result[
                            "produce_score"
                        ],
                        4,
                    ),

                "non_produce_score":
                    round(
                        produce_result[
                            "non_produce_score"
                        ],
                        4,
                    ),
            },

            "ood": {
                "accepted":
                    False,

                "novelty_level":
                    ood_result[
                        "novelty_level"
                    ],

                "nearest_distance":
                    round(
                        ood_result[
                            "nearest_distance"
                        ],
                        4,
                    ),

                "mean_knn_distance":
                    round(
                        ood_result[
                            "mean_knn_distance"
                        ],
                        4,
                    ),

                "p99_threshold":
                    round(
                        ood_result[
                            "thresholds"
                        ][
                            "p99"
                        ],
                        4,
                    ),
            },

            "spoilage":
                None,
        }


    # ========================================================
    # STAGE 4
    # DECISION TREE
    # ========================================================

    spoilage_result = (
        classify_spoilage(
            feature,
            tree,
            class_names,
        )
    )


    # ========================================================
    # FINAL ACCEPTED RESULT
    # ========================================================

    return {
        "success":
            True,

        "status":
            "classified",

        "message":
            "Image successfully classified.",

        "produce_validation": {
            "is_produce":
                True,

            "produce_score":
                round(
                    produce_result[
                        "produce_score"
                    ],
                    4,
                ),

            "non_produce_score":
                round(
                    produce_result[
                        "non_produce_score"
                    ],
                    4,
                ),
        },

        "ood": {
            "accepted":
                True,

            "novelty_level":
                ood_result[
                    "novelty_level"
                ],

            "nearest_distance":
                round(
                    ood_result[
                        "nearest_distance"
                    ],
                    4,
                ),

            "mean_knn_distance":
                round(
                    ood_result[
                        "mean_knn_distance"
                    ],
                    4,
                ),

            "p95_threshold":
                round(
                    ood_result[
                        "thresholds"
                    ][
                        "p95"
                    ],
                    4,
                ),

            "p97_threshold":
                round(
                    ood_result[
                        "thresholds"
                    ][
                        "p97"
                    ],
                    4,
                ),

            "p99_threshold":
                round(
                    ood_result[
                        "thresholds"
                    ][
                        "p99"
                    ],
                    4,
                ),
        },

        "spoilage": {
            "prediction":
                spoilage_result[
                    "prediction"
                ],

            "tree_probability":
                round(
                    spoilage_result[
                        "tree_probability"
                    ],
                    4,
                ),

            "probabilities": {
                key:
                    round(
                        value,
                        4,
                    )

                for key, value
                in spoilage_result[
                    "probabilities"
                ].items()
            },
        },
    }


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) < 2:

        result = {
            "success":
                False,

            "status":
                "error",

            "message":
                (
                    "Usage: python "
                    "analyze_spoilage_pipeline.py "
                    "\"path_to_image.jpg\""
                ),
        }

        print(
            json.dumps(
                result
            )
        )

        raise SystemExit(1)


    image_path = sys.argv[1]

    try:

        result = analyze_image(
            image_path
        )

        print(
            json.dumps(
                result
            )
        )

    except Exception as error:

        result = {
            "success":
                False,

            "status":
                "error",

            "message":
                str(error),
        }

        print(
            json.dumps(
                result
            )
        )

        raise SystemExit(1)