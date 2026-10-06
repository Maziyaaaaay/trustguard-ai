"""Local pretrained classification; metadata is supporting evidence, never a verdict."""
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

MODEL_NAME = "onnx-community/ai-image-detect-distilled-ONNX"
MODEL_REVISION = "7f067e23521eeb6d6525221af82c613fb746aaff"

@lru_cache(maxsize=1)
def session():
    import onnxruntime as ort
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(Path(__file__).parent / "models/image_detector.onnx"), options, providers=["CPUExecutionProvider"])

def classify_image(image):
    evidence = {"camera": None, "capture_time": None, "gps_present": False}
    try:
        exif = image.getexif()
        evidence["camera"] = " ".join(str(exif.get(tag, "")) for tag in (271, 272)).strip() or None
        original = exif.get_ifd(34665) if 34665 in exif else {}
        evidence["capture_time"] = str(original.get(36867) or exif.get(306) or "") or None
        evidence["gps_present"] = 34853 in exif
    except Exception:
        pass
    base = {"model": MODEL_NAME, "revision": MODEL_REVISION, "metadata_evidence": {key: value for key, value in evidence.items() if key != "gps_present"},
            "limitations": "Experimental pretrained classifier. Model scores are not calibrated probabilities; edits, compression and unseen generators can cause errors. Metadata is editable and does not prove authenticity."}
    try:
        rgb = ImageOps.exif_transpose(image).convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
        pixels = (np.asarray(rgb, dtype=np.float32) / 255.0 - 0.5) / 0.5
        inputs = np.transpose(pixels, (2, 0, 1))[None, ...]
        model = session()
        logits = np.asarray(model.run(None, {model.get_inputs()[0].name: inputs})[0])[0]
        if logits.shape != (2,) or not np.all(np.isfinite(logits)):
            raise ValueError("Invalid detector output")
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        # Published label mapping: 0=fake, 1=real. Conservative review band.
        synthetic = float(probabilities[0])
        status = "likely_ai_generated" if synthetic >= .8 else "likely_photographic" if synthetic <= .2 else "inconclusive"
        return {**base, "available": True, "status": status, "synthetic_model_score": round(synthetic * 100, 1)}
    except Exception:
        return {**base, "available": False, "status": "unavailable", "error": "The local image detector could not run. Authenticity remains unverified."}
