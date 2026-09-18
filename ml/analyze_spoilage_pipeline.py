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
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)

if DEVICE.type == "cuda":
    torch.backends.cudnn.benchmark = True


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
# CNN IMAGE TRANSFORM
# ============================================================

cnn_transform = transforms.Compose(
    [
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
    ]
)


# ============================================================
# GLOBAL MODEL CACHE
# ============================================================

MODEL_CACHE = {
    "initialized": False,

    "clip_model": None,
    "clip_processor": None,
    "clip_text_features": None,

    "cnn_model": None,
    "feature_extractor": None,

    "tree": None,
    "class_names": None,

    "ood_data": None,
}


# ============================================================
# LOGGING
# ============================================================

def log(*values):
    print(
        *values,
        file=sys.stderr,
        flush=True,
    )


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

    return (
        model,
        processor,
    )


# ============================================================
# PRECOMPUTE CLIP TEXT FEATURES
# ============================================================

def create_clip_text_features(
    clip_model,
    clip_processor,
):

    text_inputs = (
        clip_processor(
            text=ALL_PROMPTS,
            return_tensors="pt",
            padding=True,
        )
    )

    text_inputs = {
        key:
            value.to(
                DEVICE
            )

        for key, value
        in text_inputs.items()
    }

    with torch.inference_mode():

        text_outputs = (
            clip_model.text_model(
                input_ids=
                    text_inputs[
                        "input_ids"
                    ],

                attention_mask=
                    text_inputs.get(
                        "attention_mask"
                    ),
            )
        )

        pooled_output = (
            text_outputs
            .pooler_output
        )

        text_features = (
            clip_model
            .text_projection(
                pooled_output
            )
        )

        text_features = (
            text_features
            /
            text_features.norm(
                dim=-1,
                keepdim=True,
            )
        )

    return text_features


# ============================================================
# LOAD CNN
# ============================================================

def load_cnn():

    model = (
        models.mobilenet_v2(
            weights=None
        )
    )

    model.classifier[1] = (
        nn.Linear(
            model.last_channel,
            2,
        )
    )

    try:
        state_dict = (
            torch.load(
                CNN_MODEL_PATH,
                map_location=DEVICE,
                weights_only=True,
            )
        )

    except TypeError:
        state_dict = (
            torch.load(
                CNN_MODEL_PATH,
                map_location=DEVICE,
            )
        )

    model.load_state_dict(
        state_dict
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
    cnn_model,
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

    tree_data = (
        joblib.load(
            TREE_MODEL_PATH
        )
    )

    if isinstance(
        tree_data,
        dict,
    ):

        tree = (
            tree_data[
                "model"
            ]
        )

        class_names = (
            tree_data.get(
                "class_names",
                [
                    "Fresh",
                    "Rotten",
                ],
            )
        )

    else:

        tree = (
            tree_data
        )

        class_names = [
            "Fresh",
            "Rotten",
        ]

    return (
        tree,
        class_names,
    )


# ============================================================
# LOAD OOD DETECTOR
# ============================================================

def load_ood_detector():

    return (
        joblib.load(
            OOD_MODEL_PATH
        )
    )


# ============================================================
# STARTUP CUDA / INFERENCE WARM-UP
#
# This performs one synthetic CLIP image pass and one synthetic
# MobileNet feature pass during backend startup.
#
# That moves the expensive first-inference CUDA initialization
# away from the user's first Analyze request.
# ============================================================

def warm_up_models():

    if DEVICE.type != "cuda":

        log(
            "CUDA not available. "
            "Skipping GPU warm-up."
        )

        return

    log(
        "Warming up CUDA inference..."
    )

    clip_model = (
        MODEL_CACHE[
            "clip_model"
        ]
    )

    text_features = (
        MODEL_CACHE[
            "clip_text_features"
        ]
    )

    feature_extractor = (
        MODEL_CACHE[
            "feature_extractor"
        ]
    )

    try:

        with torch.inference_mode():

            # ==================================================
            # WARM UP CLIP VISION MODEL
            #
            # CLIP ViT-B/32 expects 224x224 pixel values.
            # ==================================================

            dummy_clip_pixels = (
                torch.zeros(
                    (
                        1,
                        3,
                        224,
                        224,
                    ),
                    dtype=torch.float32,
                    device=DEVICE,
                )
            )

            image_outputs = (
                clip_model.vision_model(
                    pixel_values=
                        dummy_clip_pixels
                )
            )

            pooled_output = (
                image_outputs
                .pooler_output
            )

            image_features = (
                clip_model
                .visual_projection(
                    pooled_output
                )
            )

            image_features = (
                image_features
                /
                image_features.norm(
                    dim=-1,
                    keepdim=True,
                )
            )

            logit_scale = (
                clip_model
                .logit_scale
                .exp()
            )

            _ = (
                logit_scale
                *
                image_features
                @
                text_features.T
            )

            # ==================================================
            # WARM UP MOBILENET FEATURE EXTRACTOR
            # ==================================================

            dummy_cnn_tensor = (
                torch.zeros(
                    (
                        1,
                        3,
                        224,
                        224,
                    ),
                    dtype=torch.float32,
                    device=DEVICE,
                )
            )

            _ = (
                feature_extractor(
                    dummy_cnn_tensor
                )
            )

        # ======================================================
        # FORCE CUDA WORK TO FINISH BEFORE DECLARING READY
        # ======================================================

        torch.cuda.synchronize()

        log(
            "CUDA inference warm-up complete."
        )

    except Exception as error:

        log(
            "CUDA warm-up failed:",
            error,
        )

        raise


# ============================================================
# INITIALIZE ALL MODELS ONCE
# ============================================================

def initialize_models():

    if MODEL_CACHE[
        "initialized"
    ]:
        return

    log(
        "========================================"
    )

    log(
        "Initializing spoilage ML service..."
    )

    log(
        "Device:",
        DEVICE,
    )

    # ========================================================
    # CLIP
    # ========================================================

    log(
        "Loading CLIP..."
    )

    (
        MODEL_CACHE[
            "clip_model"
        ],
        MODEL_CACHE[
            "clip_processor"
        ],
    ) = load_clip()

    log(
        "Precomputing CLIP text features..."
    )

    MODEL_CACHE[
        "clip_text_features"
    ] = create_clip_text_features(
        MODEL_CACHE[
            "clip_model"
        ],

        MODEL_CACHE[
            "clip_processor"
        ],
    )

    # ========================================================
    # MOBILENETV2
    # ========================================================

    log(
        "Loading MobileNetV2..."
    )

    MODEL_CACHE[
        "cnn_model"
    ] = load_cnn()

    MODEL_CACHE[
        "feature_extractor"
    ] = create_feature_extractor(
        MODEL_CACHE[
            "cnn_model"
        ]
    )

    # ========================================================
    # DECISION TREE
    # ========================================================

    log(
        "Loading Decision Tree..."
    )

    (
        MODEL_CACHE[
            "tree"
        ],
        MODEL_CACHE[
            "class_names"
        ],
    ) = load_decision_tree()

    # ========================================================
    # OOD MODEL
    # ========================================================

    log(
        "Loading calibrated KNN OOD detector..."
    )

    MODEL_CACHE[
        "ood_data"
    ] = load_ood_detector()

    # ========================================================
    # WARM UP GPU
    # ========================================================

    warm_up_models()

    # ========================================================
    # READY
    # ========================================================

    MODEL_CACHE[
        "initialized"
    ] = True

    log(
        "ML models loaded successfully."
    )

    log(
        "========================================"
    )


# ============================================================
# CLIP PRODUCE VALIDATION
# ============================================================

def validate_produce(
    image,
):

    clip_model = (
        MODEL_CACHE[
            "clip_model"
        ]
    )

    clip_processor = (
        MODEL_CACHE[
            "clip_processor"
        ]
    )

    text_features = (
        MODEL_CACHE[
            "clip_text_features"
        ]
    )

    image_inputs = (
        clip_processor(
            images=image,
            return_tensors="pt",
        )
    )

    image_inputs = {
        key:
            value.to(
                DEVICE
            )

        for key, value
        in image_inputs.items()
    }

    with torch.inference_mode():

        image_outputs = (
            clip_model.vision_model(
                pixel_values=
                    image_inputs[
                        "pixel_values"
                    ]
            )
        )

        pooled_output = (
            image_outputs
            .pooler_output
        )

        image_features = (
            clip_model
            .visual_projection(
                pooled_output
            )
        )

        image_features = (
            image_features
            /
            image_features.norm(
                dim=-1,
                keepdim=True,
            )
        )

        logit_scale = (
            clip_model
            .logit_scale
            .exp()
        )

        logits = (
            logit_scale
            *
            image_features
            @
            text_features.T
        )

        probabilities = (
            logits
            .softmax(
                dim=1
            )[0]
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
        >
        non_produce_score
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
):

    feature_extractor = (
        MODEL_CACHE[
            "feature_extractor"
        ]
    )

    tensor = (
        cnn_transform(
            image
        )
    )

    tensor = (
        tensor.unsqueeze(
            0
        )
    )

    tensor = (
        tensor.to(
            DEVICE
        )
    )

    with torch.inference_mode():

        feature = (
            feature_extractor(
                tensor
            )
        )

    return (
        feature
        .cpu()
        .numpy()
    )


# ============================================================
# KNN OOD / NOVELTY CHECK
# ============================================================

def check_ood(
    feature,
):

    ood_data = (
        MODEL_CACHE[
            "ood_data"
        ]
    )

    scaler = (
        ood_data[
            "scaler"
        ]
    )

    knn = (
        ood_data[
            "knn"
        ]
    )

    k_neighbors = (
        ood_data[
            "k_neighbors"
        ]
    )

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

            n_neighbors=
                k_neighbors,
        )
    )

    distances = (
        distances[0]
    )

    nearest_distance = float(
        distances[0]
    )

    mean_distance = float(
        np.mean(
            distances
        )
    )

    if (
        mean_distance
        <= p95
    ):

        novelty_level = (
            "known_like"
        )

    elif (
        mean_distance
        <= p97
    ):

        novelty_level = (
            "slightly_unusual"
        )

    elif (
        mean_distance
        <= p99
    ):

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
):

    tree = (
        MODEL_CACHE[
            "tree"
        ]
    )

    class_names = (
        MODEL_CACHE[
            "class_names"
        ]
    )

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

    for (
        index,
        name,
    ) in enumerate(
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
# COMPLETE ANALYSIS PIPELINE
# ============================================================

def analyze_image(
    image_path,
):

    initialize_models()

    image_path = Path(
        image_path
    )

    if not image_path.exists():

        return {
            "success":
                False,

            "status":
                "error",

            "message":
                "Image file does not exist.",
        }

    try:

        with Image.open(
            image_path
        ) as source_image:

            image = (
                source_image
                .convert(
                    "RGB"
                )
            )

    except Exception as error:

        return {
            "success":
                False,

            "status":
                "error",

            "message":
                (
                    f"Unable to open image: "
                    f"{error}"
                ),
        }

    # ========================================================
    # STAGE 1
    # CLIP PRODUCE VALIDATION
    # ========================================================

    produce_result = (
        validate_produce(
            image
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
            image
        )
    )

    # ========================================================
    # STAGE 3
    # OOD / NOVELTY CHECK
    # ========================================================

    ood_result = (
        check_ood(
            feature
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
            feature
        )
    )

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

                for (
                    key,
                    value,
                )
                in spoilage_result[
                    "probabilities"
                ].items()
            },
        },
    }


# ============================================================
# PERSISTENT SERVER MODE
# ============================================================

def run_server():

    try:

        initialize_models()

    except Exception as error:

        print(
            json.dumps(
                {
                    "type":
                        "startup_error",

                    "message":
                        str(error),
                }
            ),
            flush=True,
        )

        raise

    # ========================================================
    # ONLY REPORT READY AFTER MODEL + CUDA WARM-UP COMPLETES
    # ========================================================

    print(
        json.dumps(
            {
                "type":
                    "ready",

                "device":
                    str(
                        DEVICE
                    ),
            }
        ),
        flush=True,
    )

    for raw_line in sys.stdin:

        raw_line = (
            raw_line.strip()
        )

        if not raw_line:
            continue

        request_id = None

        try:

            payload = (
                json.loads(
                    raw_line
                )
            )

            request_id = (
                payload.get(
                    "id"
                )
            )

            image_path = (
                payload.get(
                    "image_path"
                )
            )

            if not image_path:

                raise ValueError(
                    "image_path is required."
                )

            result = (
                analyze_image(
                    image_path
                )
            )

            response = {
                "id":
                    request_id,

                "result":
                    result,
            }

        except Exception as error:

            log(
                "Classification request failed:",
                error,
            )

            response = {
                "id":
                    request_id,

                "result": {
                    "success":
                        False,

                    "status":
                        "error",

                    "message":
                        str(
                            error
                        ),
                },
            }

        print(
            json.dumps(
                response
            ),
            flush=True,
        )


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    # ========================================================
    # PERSISTENT MODE
    # ========================================================

    if (
        len(sys.argv) >= 2
        and
        sys.argv[1]
        == "--server"
    ):

        run_server()

        raise SystemExit(
            0
        )

    # ========================================================
    # ONE-SHOT MODE
    # ========================================================

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

        raise SystemExit(
            1
        )

    image_path = (
        sys.argv[1]
    )

    try:

        result = (
            analyze_image(
                image_path
            )
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
                str(
                    error
                ),
        }

        print(
            json.dumps(
                result
            )
        )

        raise SystemExit(
            1
        )