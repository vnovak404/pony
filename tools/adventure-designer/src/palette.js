export function buildPalettes(context, setTool) {
  context.dom.tilePaletteEl.innerHTML = "";
  Object.values(context.tilesById).forEach((tile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tileId = tile.id;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = tile.color;
    button.appendChild(swatch);
    button.appendChild(document.createTextNode(tile.name));
    button.addEventListener("click", () => {
      context.state.selectedTileId = tile.id;
      updatePaletteActive(context.dom.tilePaletteEl, "tileId", tile.id);
      setTool("paint");
    });
    context.dom.tilePaletteEl.appendChild(button);
  });

  context.dom.objectPaletteEl.innerHTML = "";
  Object.values(context.objectsByType).forEach((obj) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.objectType = obj.type;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = obj.color;
    button.appendChild(swatch);
    button.appendChild(document.createTextNode(obj.name));
    button.addEventListener("click", () => {
      context.state.selectedObjectType = obj.type;
      updatePaletteActive(context.dom.objectPaletteEl, "objectType", obj.type);
      setTool("object");
    });
    context.dom.objectPaletteEl.appendChild(button);
  });

  if (context.state.selectedTileId === null && context.tilesById[0]) {
    context.state.selectedTileId = context.tilesById[0].id;
    updatePaletteActive(context.dom.tilePaletteEl, "tileId", context.state.selectedTileId);
  }
}

export function updatePaletteActive(container, key, value) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset[key] === String(value));
  });
}
