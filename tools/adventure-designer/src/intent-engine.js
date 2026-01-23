export function interpretIntent(description) {
  const text = description.toLowerCase();
  const tags = [];

  addTagIf(text, tags, "forest", ["forest", "woods", "grove"]);
  addTagIf(text, tags, "road", ["road", "path", "trail"]);
  addTagIf(text, tags, "water", ["water", "river", "lake"]);
  addTagIf(text, tags, "mountain", ["mountain", "cliff", "ridge"]);
  addTagIf(text, tags, "village", ["village", "town", "hamlet"]);
  addTagIf(text, tags, "clearing", ["clearing", "meadow", "field"]);

  if (tags.length === 0) {
    tags.push("grass");
  }

  const priority = text.includes("must") || text.includes("important") ? "high" : "medium";
  return { intentTags: tags, priority };
}

export function suggestTilesFromIntent(selection, map, intentTags, tilesByName) {
  const targetName = pickTargetTile(intentTags);
  const target = tilesByName[targetName];
  if (!target) {
    return [];
  }

  const edits = [];
  if (selection.cells && selection.cells.length > 0) {
    selection.cells.forEach((cell) => {
      const index = cell.y * map.width + cell.x;
      if (map.tiles[index] !== target.id) {
        edits.push({ x: cell.x, y: cell.y, tileId: target.id });
      }
    });
  } else if (selection.cellTiles && selection.cellTiles.length > 0) {
    selection.cellTiles.forEach((cell) => {
      if (cell.tileId !== target.id) {
        edits.push({ x: cell.x, y: cell.y, tileId: target.id });
      }
    });
  } else if (selection.bounds) {
    const bounds = selection.bounds;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        const index = y * map.width + x;
        if (map.tiles[index] !== target.id) {
          edits.push({ x, y, tileId: target.id });
        }
      }
    }
  }
  return edits;
}

function pickTargetTile(tags) {
  if (tags.includes("road")) {
    return "grass";
  }
  if (tags.includes("water")) {
    return "water";
  }
  if (tags.includes("mountain")) {
    return "mountain";
  }
  if (tags.includes("forest")) {
    return "forest";
  }
  if (tags.includes("village")) {
    return "village";
  }
  if (tags.includes("clearing")) {
    return "grass";
  }
  return "grass";
}

function addTagIf(text, tags, tag, keywords) {
  if (tags.includes(tag)) {
    return;
  }
  if (keywords.some((word) => text.includes(word))) {
    tags.push(tag);
  }
}
