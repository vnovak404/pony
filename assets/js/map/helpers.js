// Pony Parade: shared map helpers.

export const createSpotOffset = (mapData) => {
  return (spot, key) => {
    const offset = spot && spot[key];
    if (!offset) return { x: 0, y: 0 };
    return {
      x: (offset.x || 0) * mapData.meta.tileSize,
      y: (offset.y || 0) * mapData.meta.tileSize,
    };
  };
};

export const structureScale = {
  building: 1.8,
  landmark: 1.7,
  location: 1.5,
  nature: 2.4,
  house: 1.6,
  food: 1.6,
  drink: 1.5,
};

export const createDragState = () => ({
  active: false,
  item: null,
  offsetX: 0,
  offsetY: 0,
  pointerId: null,
});

export const createTooltipLabel = ({
  houseStates,
  formatHouseStatus,
  getSpotInventory,
  isFoodSpot,
  isDrinkSpot,
  isFunSpot,
  isSupplySource,
}) => {
  return (hit) => {
    let label = hit.label;
    if (hit.item && hit.item.kind === "house") {
      const state = houseStates.get(hit.item.id);
      if (state) {
        const health = Math.round(state.condition * 100);
        const statusLabel = formatHouseStatus(state);
        label = `${label} — House health ${health}% (${statusLabel})`;
      }
    }
    if (
      hit.item &&
      (isFoodSpot(hit.item) ||
        isDrinkSpot(hit.item) ||
        isFunSpot(hit.item) ||
        isSupplySource(hit.item))
    ) {
      const inventory = getSpotInventory(hit.item);
      if (inventory) {
        label = `${label} — Stock ${inventory.current}/${inventory.max}`;
      }
    }
    return label;
  };
};

export const createMapScale = ({ ponyMap, mapWidth, mapHeight, ctx }) => {
  const resize = () => {
    const parent = ponyMap.parentElement;
    if (!parent) return null;
    const width = parent.clientWidth - 2;
    const nextScale = width / mapWidth;
    const height = mapHeight * nextScale;
    const dpr = window.devicePixelRatio || 1;
    ponyMap.width = width * dpr;
    ponyMap.height = height * dpr;
    ponyMap.style.width = `${width}px`;
    ponyMap.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return nextScale;
  };

  let scale = resize() || 1;
  new ResizeObserver(() => {
    const nextScale = resize();
    if (nextScale) {
      scale = nextScale;
    }
  }).observe(ponyMap.parentElement);

  return () => scale;
};
