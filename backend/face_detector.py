# ============================================================
# TRUSTGUARD AI - ROBUST FACE DETECTOR
# YuNet primary detector + enhanced Haar fallback
# ============================================================

from __future__ import annotations

import os
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

YUNET_MODEL = MODEL_DIR / "face_detection_yunet_2026may.onnx"

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/"
    "raw/main/models/face_detection_yunet/"
    "face_detection_yunet_2023mar.onnx"
)


# ============================================================
# HARR CASCADES
# ============================================================

HAAR_FILES = [
    "haarcascade_frontalface_default.xml",
    "haarcascade_frontalface_alt2.xml",
    "haarcascade_frontalface_alt.xml",
    "haarcascade_profileface.xml",
]


# ============================================================
# BASIC HELPERS
# ============================================================

def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def iou(
    box_a: Tuple[int, int, int, int],
    box_b: Tuple[int, int, int, int],
) -> float:
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    ax2 = ax + aw
    ay2 = ay + ah

    bx2 = bx + bw
    by2 = by + bh

    inter_x1 = max(ax, bx)
    inter_y1 = max(ay, by)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)

    inter_area = inter_w * inter_h

    if inter_area <= 0:
        return 0.0

    area_a = aw * ah
    area_b = bw * bh

    union = area_a + area_b - inter_area

    if union <= 0:
        return 0.0

    return inter_area / union


def merge_boxes(
    boxes: List[Tuple[int, int, int, int]],
    overlap_threshold: float = 0.35,
) -> List[Tuple[int, int, int, int]]:
    """
    Merge highly overlapping face detections without needing
    extra OpenCV modules.
    """

    if not boxes:
        return []

    remaining = list(boxes)
    result: List[Tuple[int, int, int, int]] = []

    while remaining:
        current = remaining.pop(0)

        overlapping = [current]
        keep: List[Tuple[int, int, int, int]] = []

        for candidate in remaining:
            if iou(current, candidate) >= overlap_threshold:
                overlapping.append(candidate)
            else:
                keep.append(candidate)

        remaining = keep

        xs = [b[0] for b in overlapping]
        ys = [b[1] for b in overlapping]
        x2s = [b[0] + b[2] for b in overlapping]
        y2s = [b[1] + b[3] for b in overlapping]

        x1 = min(xs)
        y1 = min(ys)
        x2 = max(x2s)
        y2 = max(y2s)

        result.append(
            (
                int(x1),
                int(y1),
                int(x2 - x1),
                int(y2 - y1),
            )
        )

    return result


# ============================================================
# MODEL DOWNLOAD
# ============================================================

def ensure_yunet_model() -> bool:
    """
    Download YuNet once if it is not already available.
    Falls back gracefully if the download is unavailable.
    """

    if YUNET_MODEL.exists() and YUNET_MODEL.stat().st_size > 10000:
        return True

    try:
        print("TrustGuard: downloading YuNet face detector...")

        urllib.request.urlretrieve(
            YUNET_URL,
            str(YUNET_MODEL),
        )

        if (
            YUNET_MODEL.exists()
            and YUNET_MODEL.stat().st_size > 10000
        ):
            print("TrustGuard: YuNet model ready.")
            return True

    except Exception as error:
        print(
            "TrustGuard: YuNet download failed, "
            f"using Haar fallback. Reason: {error}"
        )

    return False


# ============================================================
# YUNET DETECTOR
# ============================================================

def detect_with_yunet(
    image: np.ndarray,
) -> List[Tuple[int, int, int, int, float]]:
    """
    Returns:
        x, y, width, height, confidence
    """

    if not ensure_yunet_model():
        return []

    try:
        if not hasattr(cv2, "FaceDetectorYN"):
            return []

        height, width = image.shape[:2]

        detector = cv2.FaceDetectorYN.create(
            str(YUNET_MODEL),
            "",
            (width, height),
            0.70,
            0.30,
            5000,
        )

        _, detections = detector.detect(image)

        if detections is None:
            return []

        results = []

        for detection in detections:
            x = int(round(detection[0]))
            y = int(round(detection[1]))
            w = int(round(detection[2]))
            h = int(round(detection[3]))

            confidence = float(detection[-1])

            if w <= 0 or h <= 0:
                continue

            x = max(0, x)
            y = max(0, y)

            w = min(w, width - x)
            h = min(h, height - y)

            if w <= 0 or h <= 0:
                continue

            results.append(
                (
                    x,
                    y,
                    w,
                    h,
                    confidence,
                )
            )

        return results

    except Exception as error:
        print(
            "TrustGuard: YuNet detection error:",
            error,
        )
        return []


# ============================================================
# ENHANCED HAAR DETECTOR
# ============================================================

def build_image_variants(
    gray: np.ndarray,
) -> List[np.ndarray]:
    """
    Build several enhanced versions so small passport-style
    faces have a better chance of being detected.
    """

    height, width = gray.shape[:2]

    # Do not let extremely large uploads become too expensive.
    max_dimension = 1800

    # Upscale small images to help detect small faces, but never enlarge an
    # already large upload. The old 2x minimum could turn a 25 MP image into
    # a 100 MP working image and allocate several oversized variants.
    scale = min(4.0, max_dimension / max(height, width, 1))
    scale = max(scale, 1.0)

    if scale > 1.0:
        enlarged = cv2.resize(
            gray,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC,
        )
    else:
        enlarged = gray

    # Mild denoise
    blurred = cv2.GaussianBlur(
        enlarged,
        (3, 3),
        0,
    )

    # CLAHE improves local contrast
    clahe = cv2.createCLAHE(
        clipLimit=2.2,
        tileGridSize=(8, 8),
    )

    contrast = clahe.apply(
        enlarged
    )

    # Sharpening
    kernel = np.array(
        [
            [0, -1, 0],
            [-1, 5, -1],
            [0, -1, 0],
        ],
        dtype=np.float32,
    )

    sharpened = cv2.filter2D(
        contrast,
        -1,
        kernel,
    )

    # Slightly normalized version
    equalized = cv2.equalizeHist(
        enlarged
    )

    return [
        enlarged,
        contrast,
        sharpened,
        equalized,
        blurred,
    ]


@lru_cache(maxsize=len(HAAR_FILES))
def load_haar_classifier(cascade_name: str) -> cv2.CascadeClassifier:
    cascade_path = os.path.join(cv2.data.haarcascades, cascade_name)
    return cv2.CascadeClassifier(cascade_path)


def detect_with_haar(
    image: np.ndarray,
) -> List[Tuple[int, int, int, int, float]]:
    """
    Multi-cascade + multi-preprocessing face detection.

    Designed to improve detection of small frontal faces.
    """

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )

    variants = build_image_variants(
        gray
    )

    raw_detections: List[
        Tuple[int, int, int, int, float]
    ] = []

    image_height, image_width = image.shape[:2]

    for cascade_name in HAAR_FILES:
        cascade_path = os.path.join(cv2.data.haarcascades, cascade_name)
        if not os.path.exists(cascade_path):
            continue

        cascade = load_haar_classifier(cascade_name)

        if cascade.empty():
            continue

        for variant_index, variant in enumerate(
            variants
        ):
            vh, vw = variant.shape[:2]

            # Several detector settings.
            settings = [
                (1.03, 3),
                (1.05, 4),
                (1.08, 3),
                (1.10, 4),
            ]

            for scale_factor, min_neighbors in settings:
                try:
                    faces = cascade.detectMultiScale(
                        variant,
                        scaleFactor=scale_factor,
                        minNeighbors=min_neighbors,
                        minSize=(28, 28),
                        maxSize=(
                            max(40, int(vw * 0.75)),
                            max(40, int(vh * 0.75)),
                        ),
                    )
                except Exception:
                    continue

                for (x, y, w, h) in faces:
                    if w <= 0 or h <= 0:
                        continue

                    # Map enlarged coordinates to original image.
                    sx = image_width / float(vw)
                    sy = image_height / float(vh)

                    ox = int(round(x * sx))
                    oy = int(round(y * sy))
                    ow = int(round(w * sx))
                    oh = int(round(h * sy))

                    ox = max(0, ox)
                    oy = max(0, oy)

                    ow = min(
                        ow,
                        image_width - ox,
                    )

                    oh = min(
                        oh,
                        image_height - oy,
                    )

                    if ow <= 0 or oh <= 0:
                        continue

                    area_ratio = (
                        (ow * oh)
                        / float(
                            max(
                                1,
                                image_width
                                * image_height,
                            )
                        )
                    )

                    # Reject implausibly tiny noise.
                    if area_ratio < 0.00025:
                        continue

                    # Score gets a small bonus for larger faces
                    # and central placement.
                    center_x = (
                        ox + ow / 2.0
                    ) / image_width

                    center_y = (
                        oy + oh / 2.0
                    ) / image_height

                    centrality = 1.0 - min(
                        1.0,
                        (
                            abs(center_x - 0.5)
                            + abs(center_y - 0.5)
                        ) / 1.0,
                    )

                    size_score = clamp(
                        area_ratio * 7000.0
                    )

                    confidence = clamp(
                        45.0
                        + (size_score * 0.35)
                        + (centrality * 20.0)
                        + (variant_index * 1.5),
                        35,
                        96,
                    )

                    raw_detections.append(
                        (
                            ox,
                            oy,
                            ow,
                            oh,
                            confidence,
                        )
                    )

    # Merge duplicate detections.
    boxes = [
        (x, y, w, h)
        for x, y, w, h, _ in raw_detections
    ]

    merged = merge_boxes(
        boxes,
        overlap_threshold=0.30,
    )

    final_results = []

    for box in merged:
        best_confidence = 0.0

        for detection in raw_detections:
            if iou(
                box,
                detection[:4],
            ) >= 0.25:
                best_confidence = max(
                    best_confidence,
                    detection[4],
                )

        final_results.append(
            (
                box[0],
                box[1],
                box[2],
                box[3],
                best_confidence,
            )
        )

    # Largest / strongest first.
    final_results.sort(
        key=lambda item: (
            item[2] * item[3],
            item[4],
        ),
        reverse=True,
    )

    return final_results


# ============================================================
# FINAL FACE ANALYSIS
# ============================================================

def detect_faces(
    image: np.ndarray,
) -> Dict[str, Any]:
    """
    Main TrustGuard face-analysis function.

    Strategy:
      1. YuNet
      2. Enhanced Haar fallback
      3. Merge duplicate detections
    """

    if image is None or image.size == 0:
        return {
            "detected": False,
            "count": 0,
            "faces": [],
            "confidence": 0.0,
            "method": "invalid_image",
        }

    original_height, original_width = (
        image.shape[:2]
    )

    max_detection_dimension = 1800
    scale = min(
        1.0,
        max_detection_dimension / max(original_height, original_width, 1),
    )
    if scale < 1.0:
        detection_image = cv2.resize(
            image,
            (max(1, int(original_width * scale)), max(1, int(original_height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        detection_image = image
    x_scale = original_width / detection_image.shape[1]
    y_scale = original_height / detection_image.shape[0]

    # --------------------------------------------------------
    # 1. YUNET
    # --------------------------------------------------------

    yunet_faces = detect_with_yunet(detection_image)

    if yunet_faces:
        faces = []

        for (
            x,
            y,
            w,
            h,
            confidence,
        ) in yunet_faces:
            faces.append(
                {
                    "x": int(round(x * x_scale)),
                    "y": int(round(y * y_scale)),
                    "width": int(round(w * x_scale)),
                    "height": int(round(h * y_scale)),
                    "confidence": round(
                        clamp(
                            confidence * 100.0,
                            0,
                            100,
                        ),
                        1,
                    ),
                }
            )

        best_confidence = max(
            face["confidence"]
            for face in faces
        )

        return {
            "detected": True,
            "count": len(faces),
            "faces": faces,
            "confidence": round(
                best_confidence,
                1,
            ),
            "method": "YuNet",
            "image_width": original_width,
            "image_height": original_height,
        }

    # --------------------------------------------------------
    # 2. HAAR FALLBACK
    # --------------------------------------------------------

    haar_faces = detect_with_haar(detection_image)

    if haar_faces:
        faces = []

        for (
            x,
            y,
            w,
            h,
            confidence,
        ) in haar_faces:
            faces.append(
                {
                    "x": int(round(x * x_scale)),
                    "y": int(round(y * y_scale)),
                    "width": int(round(w * x_scale)),
                    "height": int(round(h * y_scale)),
                    "confidence": round(
                        clamp(
                            confidence,
                            0,
                            100,
                        ),
                        1,
                    ),
                }
            )

        best_confidence = max(
            face["confidence"]
            for face in faces
        )

        return {
            "detected": True,
            "count": len(faces),
            "faces": faces,
            "confidence": round(
                best_confidence,
                1,
            ),
            "method": "Enhanced Haar",
            "image_width": original_width,
            "image_height": original_height,
        }

    # --------------------------------------------------------
    # 3. NOTHING DETECTED
    # --------------------------------------------------------

    return {
        "detected": False,
        "count": 0,
        "faces": [],
        "confidence": 0.0,
        "method": "YuNet + Enhanced Haar",
        "image_width": original_width,
        "image_height": original_height,
    }


# ============================================================
# OPTIONAL SIMPLE TEST
# ============================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print(
            "Usage:\n"
            "python face_detector.py "
            "\"C:\\path\\to\\image.jpg\""
        )
        raise SystemExit(1)

    image_path = sys.argv[1]

    image = cv2.imread(
        image_path
    )

    result = detect_faces(
        image
    )

    print("\nTrustGuard Face Detection")
    print("--------------------------")
    print("Detected :", result["detected"])
    print("Count    :", result["count"])
    print("Method   :", result["method"])
    print(
        "Confidence:",
        result["confidence"],
    )
    print("Faces    :", result["faces"])
