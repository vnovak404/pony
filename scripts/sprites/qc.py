from pathlib import Path


def ensure_pillow():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required. Install with: pip install pillow") from exc
    return Image


def _load_image(path):
    Image = ensure_pillow()

    return Image.open(path)


def try_fix_transparency(path, tolerance=12):
    Image = ensure_pillow()
    image_path = Path(path)
    try:
        image = Image.open(image_path)
    except FileNotFoundError:
        return False

    with image:
        if image.mode != "RGBA":
            image = image.convert("RGBA")

        width, height = image.size
        pixels = image.load()
        if pixels is None:
            return False

        corners = [
            pixels[0, 0][:3],
            pixels[width - 1, 0][:3],
            pixels[0, height - 1][:3],
            pixels[width - 1, height - 1][:3],
        ]
        avg_bg = tuple(sum(color[channel] for color in corners) // len(corners) for channel in range(3))

        changed = 0
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if a == 0:
                    continue
                distance = abs(r - avg_bg[0]) + abs(g - avg_bg[1]) + abs(b - avg_bg[2])
                if distance <= tolerance:
                    pixels[x, y] = (r, g, b, 0)
                    changed += 1

        if changed == 0:
            return False

        image.save(image_path)
    return True


def needs_horizontal_flip(path, threshold=0.02, balance_threshold=0.08):
    image_path = Path(path)
    try:
        image = _load_image(image_path)
    except RuntimeError:
        return False

    with image:
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        width, height = image.size
        alpha = image.getchannel("A")
        data = alpha.getdata()
        total = 0
        sum_x = 0
        left_sum = 0
        right_sum = 0
        for idx, value in enumerate(data):
            if value == 0:
                continue
            x = idx % width
            total += value
            sum_x += value * x
            if x < width * 0.5:
                left_sum += value
            else:
                right_sum += value

        if total == 0:
            return False

        center_x = sum_x / total
        margin = width * threshold
        if center_x < (width * 0.5 - margin):
            return True
        if right_sum == 0:
            return False
        return left_sum > right_sum * (1 + balance_threshold)


def enforce_facing_right(path):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required. Install with: pip install pillow") from exc

    image_path = Path(path)
    if not needs_horizontal_flip(image_path):
        return False
    with Image.open(image_path) as image:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
        image.save(image_path)
    return True


def qc_image(path):
    image_path = Path(path)
    try:
        image = _load_image(image_path)
    except RuntimeError as exc:
        return False, str(exc)

    with image:
        if image.mode != "RGBA":
            return False, f"Expected RGBA, got {image.mode}."

        width, height = image.size
        alpha = image.getchannel("A")
        alpha_min, alpha_max = alpha.getextrema()
        if alpha_min == 255:
            return False, "No transparent pixels detected."

        bbox = alpha.getbbox()
        if bbox is None:
            return False, "Empty frame (all transparent)."

        left, upper, right, lower = bbox
        area = (right - left) * (lower - upper)
        total_area = width * height
        min_area = 0.12 * total_area
        max_area = 0.9 * total_area

        if area < min_area:
            return False, "Subject area too small."
        if area > max_area:
            return False, "Subject area too large."

        padding = max(6, int(width * 0.012))
        if left < padding or upper < padding:
            return False, "Subject too close to top/left edge."
        if (width - right) < padding or (height - lower) < padding:
            return False, "Subject too close to bottom/right edge."

    return True, "ok"
