import hashlib


def refine_map(
    intent_rows,
    legend,
    base_resolution,
    target_resolution,
    seed,
    notes=None,
):
    base_width, base_height = base_resolution
    target_width, target_height = target_resolution
    scale_x = target_width // base_width
    scale_y = target_height // base_height
    base_grid = [list(row) for row in intent_rows]
    road_codes = _codes_with_hint(legend, "road_hint", {"path", "road"})

    jitter_band = _resolve_jitter_band(scale_x, scale_y)
    grid = []
    for y in range(target_height):
        row = []
        by = min(base_height - 1, y // scale_y)
        ly = y % scale_y
        for x in range(target_width):
            bx = min(base_width - 1, x // scale_x)
            lx = x % scale_x
            base_code = base_grid[by][bx]
            code = _jitter_cell(
                base_grid,
                bx,
                by,
                lx,
                ly,
                scale_x,
                scale_y,
                jitter_band,
                base_code,
                seed,
                road_codes,
            )
            row.append(code)
        grid.append(row)

    smooth_passes = 1 if max(scale_x, scale_y) >= 3 else 0
    for _ in range(smooth_passes):
        grid = _smooth_grid(grid, road_codes)

    terrain_rows = ["".join(row) for row in grid]
    return {
        "layers": {
            "terrain": terrain_rows,
            "water": None,
            "roads": None,
            "elevation": None,
        },
        "regions": [],
        "decor_rules": [],
    }


def _codes_with_hint(legend, hint_key, terrain_names):
    codes = set()
    for code, meta in legend.items():
        if not isinstance(code, str) or len(code) != 1:
            continue
        if isinstance(meta, dict):
            if meta.get(hint_key):
                codes.add(code)
                continue
            terrain = str(meta.get("terrain", "")).strip().lower()
            if terrain in terrain_names:
                codes.add(code)
    return codes


def _resolve_jitter_band(scale_x, scale_y):
    if scale_x <= 1 and scale_y <= 1:
        return 0
    return max(1, min(scale_x, scale_y) // 3)


def _jitter_cell(
    base_grid,
    bx,
    by,
    lx,
    ly,
    scale_x,
    scale_y,
    jitter_band,
    base_code,
    seed,
    road_codes,
):
    if jitter_band <= 0:
        return base_code
    if base_code in road_codes:
        return base_code

    weights = [(base_code, 1.0)]
    height = len(base_grid)
    width = len(base_grid[0]) if height else 0

    if by > 0:
        north = base_grid[by - 1][bx]
        if north != base_code and north not in road_codes and ly < jitter_band:
            _add_weight(weights, north, _edge_weight(jitter_band, ly))
    if by < height - 1:
        south = base_grid[by + 1][bx]
        if south != base_code and south not in road_codes and ly >= scale_y - jitter_band:
            dist = (scale_y - 1) - ly
            _add_weight(weights, south, _edge_weight(jitter_band, dist))
    if bx > 0:
        west = base_grid[by][bx - 1]
        if west != base_code and west not in road_codes and lx < jitter_band:
            _add_weight(weights, west, _edge_weight(jitter_band, lx))
    if bx < width - 1:
        east = base_grid[by][bx + 1]
        if east != base_code and east not in road_codes and lx >= scale_x - jitter_band:
            dist = (scale_x - 1) - lx
            _add_weight(weights, east, _edge_weight(jitter_band, dist))

    if len(weights) == 1:
        return base_code
    return _weighted_choice(weights, seed, bx, by, lx, ly)


def _edge_weight(band, dist):
    if band <= 0:
        return 0.0
    return (band - dist) / band


def _add_weight(weights, code, weight):
    if weight <= 0:
        return
    for index, (entry_code, entry_weight) in enumerate(weights):
        if entry_code == code:
            weights[index] = (entry_code, entry_weight + weight)
            return
    weights.append((code, weight))


def _weighted_choice(weights, seed, bx, by, lx, ly):
    total = sum(weight for _, weight in weights)
    if total <= 0:
        return weights[0][0]
    pick = _noise(seed, bx, by, lx, ly) * total
    for code, weight in weights:
        pick -= weight
        if pick <= 0:
            return code
    return weights[-1][0]


def _noise(seed, bx, by, lx, ly):
    payload = f"{seed}:{bx}:{by}:{lx}:{ly}"
    digest = hashlib.sha256(payload.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big")
    return value / 18446744073709551616


def _smooth_grid(grid, road_codes):
    height = len(grid)
    width = len(grid[0]) if height else 0
    next_grid = []
    for y in range(height):
        row = []
        for x in range(width):
            code = grid[y][x]
            if code in road_codes:
                row.append(code)
                continue
            counts = {}
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= height:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if nx < 0 or nx >= width or (dx == 0 and dy == 0):
                        continue
                    neighbor = grid[ny][nx]
                    counts[neighbor] = counts.get(neighbor, 0) + 1
            if not counts:
                row.append(code)
                continue
            majority = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0]
            if majority[0] in road_codes:
                row.append(code)
                continue
            row.append(majority[0] if majority[1] >= 6 else code)
        next_grid.append(row)
    return next_grid
