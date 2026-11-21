
import os
import numpy as np
import tensorflow as tf
from PIL import Image

class ModelNotReady(Exception):
    pass

_cache = None

CLASS_NAMES = [
    "No DR",
    "Mild",
    "Moderate",
    "Severe",
    "Proliferative DR"
]

def _load():
    global _cache

    if _cache is not None:
        return _cache

    default_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "../../ml/arovia_dr_best.keras"
        )
    )

    path = os.environ.get("MODEL_PATH", default_path)

    if not os.path.exists(path):
        raise ModelNotReady(f"Model file not found: {path}")

    try:
        model = tf.keras.models.load_model(path)
    except Exception as ex:
        raise ModelNotReady(f"Could not load DR model: {ex}")

    _cache = model
    return _cache


def predict(image_path: str) -> dict:
    model = _load()

    try:
        img = Image.open(image_path).convert("RGB")
        img = img.resize((224, 224))

        image = np.asarray(img, dtype=np.float32)
        image = np.expand_dims(image, axis=0)

        predictions = model.predict(image, verbose=0)[0]

        grade = int(np.argmax(predictions))
        confidence = float(predictions[grade])

        return {
            "grade": grade,
            "confidence": round(confidence, 4),
            "name": "efficientnetb0-dr",
            "version": "aptos-2019-v1",
            "grade_name": CLASS_NAMES[grade]
        }

    except Exception as ex:
        raise RuntimeError(f"DR prediction failed: {ex}")
