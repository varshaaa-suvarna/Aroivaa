import os
import uuid
import numpy as np
from PIL import Image
import tensorflow as tf

from .inference import _load

def apply_jet_colormap(heatmap: np.ndarray) -> np.ndarray:
    """
    Applies standard JET colormap to a 2D float array in [0, 1].
    Returns RGB uint8 array of shape (H, W, 3).
    """
    val = np.clip(heatmap, 0.0, 1.0)
    r = np.clip(1.5 - np.abs(4.0 * val - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(4.0 * val - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(4.0 * val - 1.0), 0.0, 1.0)
    return (np.stack([r, g, b], axis=-1) * 255.0).astype(np.uint8)


def generate_gradcam_heatmap(
    model: tf.keras.Model,
    img_tensor: np.ndarray,
    target_class: int = None,
    layer_name: str = "top_activation"
) -> np.ndarray:
    """
    Computes normalized Grad-CAM heatmap for the given image tensor and class index.
    img_tensor shape: (1, 224, 224, 3), range [0, 255] float32.
    """
    try:
        last_conv_layer = model.get_layer(layer_name)
    except ValueError:
        # Fallback to top_conv if top_activation not found
        last_conv_layer = model.get_layer("top_conv")

    grad_model = tf.keras.models.Model(
        inputs=model.inputs,
        outputs=[last_conv_layer.output, model.output]
    )

    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model([img_tensor])
        if target_class is None:
            target_class = int(tf.argmax(predictions[0]))
        loss = predictions[:, target_class]

    grads = tape.gradient(loss, conv_outputs)
    if grads is None:
        raise RuntimeError("Gradients could not be computed for the target layer.")

    # Global average pooling of gradients
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap).numpy()

    # Apply ReLU: only positive contributions matter
    heatmap = np.maximum(heatmap, 0.0)

    # Normalize safely
    max_val = np.max(heatmap)
    if max_val > 1e-10:
        heatmap = heatmap / max_val
    else:
        heatmap = np.zeros_like(heatmap)

    return heatmap, int(target_class)


def generate_gradcam_overlay(
    image_path: str,
    target_class: int = None,
    alpha: float = 0.45
) -> tuple[Image.Image, int]:
    """
    Loads original retinal image, runs Grad-CAM using the existing EfficientNetB0 model,
    resizes heatmap to original dimensions, applies JET colormap, and blends with original image.
    Returns (blended_pil_image, target_class).
    """
    model = _load()

    # Load and preserve original image
    orig_img = Image.open(image_path).convert("RGB")
    orig_w, orig_h = orig_img.size

    # Prepare model input (224x224 RGB, [0, 255] float32 matching inference.py)
    resized_input = orig_img.resize((224, 224))
    img_array = np.asarray(resized_input, dtype=np.float32)
    img_tensor = np.expand_dims(img_array, axis=0)

    heatmap_7x7, predicted_class = generate_gradcam_heatmap(
        model=model,
        img_tensor=img_tensor,
        target_class=target_class
    )

    # Upsample heatmap to match original retinal image dimensions smoothly
    heatmap_pil = Image.fromarray((heatmap_7x7 * 255.0).astype(np.uint8)).resize(
        (orig_w, orig_h),
        resample=Image.Resampling.BILINEAR
    )
    smooth_heatmap = np.asarray(heatmap_pil, dtype=np.float32) / 255.0

    # Colorize using JET colormap
    colored_heatmap_arr = apply_jet_colormap(smooth_heatmap)
    colored_heatmap_pil = Image.fromarray(colored_heatmap_arr)

    # Blend overlay onto original retinal image
    blended_img = Image.blend(orig_img, colored_heatmap_pil, alpha=alpha)

    return blended_img, predicted_class


def generate_and_save_gradcam(
    image_path: str,
    output_path: str,
    target_class: int = None
) -> str:
    """
    Generates Grad-CAM blended visualization and writes to output_path.
    Returns the output_path.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    blended_img, _ = generate_gradcam_overlay(image_path, target_class=target_class)
    blended_img.save(output_path, format="JPEG", quality=92)
    return output_path
