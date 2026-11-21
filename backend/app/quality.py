"""Image quality gate. Heuristic checks (not a learned model); thresholds are tunable via env and should be validated on your own images."""
import io, os
import numpy as np
from PIL import Image
F = lambda k, d: float(os.environ.get(k, d))
def assess(data: bytes) -> dict:
    try: img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception: return {"ok": False, "reasons": ["Unreadable image file"], "metrics": {}}
    reasons = []
    if min(img.size) < 256: reasons.append("Resolution too low (minimum 256 px on the short side)")
    g = np.asarray(img.convert("L").resize((512, 512)), dtype="float32")
    mask = g > 15
    coverage = float(mask.mean())
    if coverage < F("Q_COVERAGE_MIN", 0.35): reasons.append("Retina field of view too small or image mostly black")
    vals = g[mask] if mask.any() else g.ravel()
    brightness, contrast = float(vals.mean()), float(vals.std())
    if brightness < F("Q_BRIGHT_MIN", 40): reasons.append("Image too dark")
    if brightness > F("Q_BRIGHT_MAX", 220): reasons.append("Image overexposed")
    if contrast < F("Q_CONTRAST_MIN", 20): reasons.append("Contrast too low")
    c = g[128:384, 128:384]  # central crop avoids the circular border inflating sharpness
    lap = 4 * c[1:-1, 1:-1] - c[:-2, 1:-1] - c[2:, 1:-1] - c[1:-1, :-2] - c[1:-1, 2:]
    blur = float(lap.var())
    if blur < F("Q_BLUR_MIN", 25): reasons.append("Image blurred or out of focus")
    return {"ok": not reasons, "reasons": reasons, "metrics": {"sharpness": round(blur, 1), "brightness": round(brightness, 1), "contrast": round(contrast, 1), "coverage": round(coverage, 2), "width": img.size[0], "height": img.size[1]}}
