import cv2
import numpy as np


def to_gray(image):
    bgr = (image[..., :3] * 255.0).astype(np.uint8)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    gray *= image[..., 3]
    return gray


def compute_flow(gray_a, gray_b, cfg):
    return cv2.calcOpticalFlowFarneback(
        gray_a,
        gray_b,
        None,
        cfg["pyr_scale"],
        cfg["levels"],
        cfg["winsize"],
        cfg["iterations"],
        cfg["poly_n"],
        cfg["poly_sigma"],
        0,
    )


def warp_image(image, flow, t, grid_x, grid_y):
    map_x = (grid_x + flow[..., 0] * t).astype(np.float32)
    map_y = (grid_y + flow[..., 1] * t).astype(np.float32)
    return cv2.remap(
        image,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def blend_premultiplied(image_a, image_b, weight_b):
    weight_a = 1.0 - weight_b
    color_a = image_a[..., :3]
    alpha_a = image_a[..., 3:4]
    color_b = image_b[..., :3]
    alpha_b = image_b[..., 3:4]

    premult_a = color_a * alpha_a
    premult_b = color_b * alpha_b

    premult = premult_a * weight_a + premult_b * weight_b
    alpha = alpha_a * weight_a + alpha_b * weight_b
    safe_alpha = np.clip(alpha, 1e-6, 1.0)
    color = np.where(alpha > 0, premult / safe_alpha, 0.0)
    return np.concatenate([color, alpha], axis=-1)


def alpha_y_max(image, threshold):
    alpha = image[..., 3]
    mask = alpha > threshold
    if not np.any(mask):
        return None
    return int(np.where(mask)[0].max())


def alpha_bbox(image, threshold):
    alpha = image[..., 3]
    mask = alpha > threshold
    if not np.any(mask):
        return None
    ys, xs = np.where(mask)
    left = int(xs.min())
    right = int(xs.max()) + 1
    top = int(ys.min())
    bottom = int(ys.max()) + 1
    return left, top, right, bottom


def compute_target_bbox(keyframes, threshold):
    heights = []
    widths = []
    centers = []
    bottoms = []
    for frame in keyframes:
        bbox = alpha_bbox(frame, threshold)
        if not bbox:
            continue
        left, top, right, bottom = bbox
        heights.append(bottom - top)
        widths.append(right - left)
        centers.append((left + right) * 0.5)
        bottoms.append(bottom)
    if not heights:
        return None
    return {
        "height": float(np.median(heights)),
        "width": float(np.median(widths)),
        "center_x": float(np.median(centers)),
        "bottom": float(np.median(bottoms)),
    }


def shift_image_y(image, delta):
    if delta == 0:
        return image
    height, width = image.shape[:2]
    matrix = np.array([[1, 0, 0], [0, 1, float(delta)]], dtype=np.float32)
    return cv2.warpAffine(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def stabilize_frame(image, target_y_max, threshold, max_shift):
    if target_y_max is None:
        return image
    current = alpha_y_max(image, threshold)
    if current is None:
        return image
    delta = int(round(target_y_max - current))
    delta = max(-max_shift, min(max_shift, delta))
    return shift_image_y(image, delta)


def normalize_frame_scale(image, target_bbox, threshold, scale_min, scale_max):
    if not target_bbox:
        return image
    bbox = alpha_bbox(image, threshold)
    if not bbox:
        return image
    left, top, right, bottom = bbox
    height = max(1, bottom - top)
    width = max(1, right - left)
    target_height = target_bbox["height"]
    target_width = target_bbox["width"]
    scale_h = target_height / height
    scale_w = target_width / width
    scale = (scale_h + scale_w) * 0.5
    if scale_min:
        scale = max(scale_min, scale)
    if scale_max:
        scale = min(scale_max, scale)
    if abs(scale - 1.0) < 0.01:
        return image

    current_center = (left + right) * 0.5
    current_bottom = bottom
    target_center = target_bbox["center_x"]
    target_bottom = target_bbox["bottom"]
    dx = target_center - current_center
    dy = target_bottom - current_bottom
    matrix = np.array(
        [
            [scale, 0, current_center * (1 - scale) + dx],
            [0, scale, current_bottom * (1 - scale) + dy],
        ],
        dtype=np.float32,
    )
    height_px, width_px = image.shape[:2]
    return cv2.warpAffine(
        image,
        matrix,
        (width_px, height_px),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def build_normalization_transform(source_bbox, target_bbox, scale_min, scale_max):
    if not source_bbox or not target_bbox:
        return None
    source_height = max(1.0, source_bbox["height"])
    source_width = max(1.0, source_bbox["width"])
    scale_h = target_bbox["height"] / source_height
    scale_w = target_bbox["width"] / source_width
    scale = (scale_h + scale_w) * 0.5
    if scale_min:
        scale = max(scale_min, scale)
    if scale_max:
        scale = min(scale_max, scale)
    if abs(scale - 1.0) < 0.01:
        scale = 1.0

    current_center = source_bbox["center_x"]
    current_bottom = source_bbox["bottom"]
    target_center = target_bbox["center_x"]
    target_bottom = target_bbox["bottom"]
    dx = target_center - current_center
    dy = target_bottom - current_bottom
    return np.array(
        [
            [scale, 0, current_center * (1 - scale) + dx],
            [0, scale, current_bottom * (1 - scale) + dy],
        ],
        dtype=np.float32,
    )


def apply_affine(image, matrix):
    if matrix is None:
        return image
    height_px, width_px = image.shape[:2]
    return cv2.warpAffine(
        image,
        matrix,
        (width_px, height_px),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def interpolate_action(keyframes, inbetweens, flow_cfg):
    height, width = keyframes[0].shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(width), np.arange(height))
    steps = max(inbetweens + 1, 1)

    for idx in range(len(keyframes)):
        start = keyframes[idx]
        end = keyframes[(idx + 1) % len(keyframes)]
        gray_start = to_gray(start)
        gray_end = to_gray(end)
        flow_forward = compute_flow(gray_start, gray_end, flow_cfg)
        flow_backward = compute_flow(gray_end, gray_start, flow_cfg)

        for step in range(steps):
            t = step / steps
            warp_start = warp_image(start, flow_forward, t, grid_x, grid_y)
            warp_end = warp_image(end, flow_backward, 1.0 - t, grid_x, grid_y)
            yield blend_premultiplied(warp_start, warp_end, t)
