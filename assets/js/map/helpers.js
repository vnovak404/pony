// Pony Parade: shared map helpers.

import { toTitleCase } from "../utils.js";

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

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildIconChip = ({ ingredient, iconMap, countText }) => {
  const label = toTitleCase(ingredient);
  const iconPath = iconMap ? iconMap[ingredient] : null;
  const countHtml = countText
    ? `<span class="map-tooltip-count">${escapeHtml(countText)}</span>`
    : "";
  const countLabel = countText ? ` ${countText}` : "";
  if (!iconPath) {
    return {
      html: `<span class="map-tooltip-text">${escapeHtml(
        `${label}${countLabel}`
      )}</span>`,
      text: `${label}${countLabel}`,
    };
  }
  return {
    html: `<span class="map-tooltip-icon-chip"><img class="map-tooltip-icon" src="${iconPath}" alt="${escapeHtml(
      label
    )}">${countHtml}</span>`,
    text: `${label}${countLabel}`,
  };
};

const renderIngredientEntries = (entries, iconMap, showCounts = false) => {
  const htmlParts = [];
  const textParts = [];
  entries.forEach((entry) => {
    const countText = showCounts
      ? `${entry.current}/${entry.max}`
      : "";
    const chip = buildIconChip({
      ingredient: entry.ingredient,
      iconMap,
      countText,
    });
    htmlParts.push(chip.html);
    textParts.push(chip.text);
  });
  return { html: htmlParts.join(""), text: textParts.join(", ") };
};

const renderIngredientList = (ingredients, iconMap) => {
  const htmlParts = [];
  const textParts = [];
  ingredients.forEach((ingredient) => {
    const chip = buildIconChip({ ingredient, iconMap, countText: "" });
    htmlParts.push(chip.html);
    textParts.push(chip.text);
  });
  return { html: htmlParts.join(""), text: textParts.join(", ") };
};

const renderRecipe = (recipe, iconMap) => {
  if (!recipe) return null;
  const required = recipe.required || {};
  const requiredKeys = Object.keys(required);
  const requiredRender = renderIngredientList(requiredKeys, iconMap);
  const optionRenders = Array.isArray(recipe.options)
    ? recipe.options
        .map((option) => renderIngredientList(Object.keys(option || {}), iconMap))
        .filter((entry) => entry.html)
    : [];
  let html = requiredRender.html;
  let text = requiredRender.text;
  if (optionRenders.length) {
    const optionHtml = optionRenders
      .map((entry) => entry.html)
      .join('<span class="map-tooltip-or">or</span>');
    const optionText = optionRenders.map((entry) => entry.text).join(" or ");
    if (html && optionHtml) {
      html = `${html}<span class="map-tooltip-join">+</span>${optionHtml}`;
      text = `${text} + ${optionText}`;
    } else if (optionHtml) {
      html = optionHtml;
      text = optionText;
    }
  }
  if (!html) return null;
  return { html, text };
};

export const createTooltipLabel = ({
  houseStates,
  formatHouseStatus,
  getSpotInventory,
  getSpotIngredients,
  getSupplyTypesForSpot,
  isFoodSpot,
  isDrinkSpot,
  isFunSpot,
  isSupplySource,
  isSupplyProducer,
  ingredientIconMap,
  producerOutputs,
  recipesByLocation,
  recipesByType,
}) => {
  const outputMap = producerOutputs || {};
  const recipeByLocation = recipesByLocation || {};
  const recipeByType = recipesByType || {};
  return (hit) => {
    const baseLabel = hit.label || "";
    const lines = [];
    const textLines = [];
    const supplySource = isSupplySource ? isSupplySource(hit.item) : false;
    const supplyProducer = isSupplyProducer ? isSupplyProducer(hit.item) : false;

    const addLine = (label, value, valueText) => {
      lines.push(
        `<div class="map-tooltip-line"><span class="map-tooltip-label">${escapeHtml(
          label
        )}</span><span class="map-tooltip-value">${value}</span></div>`
      );
      textLines.push(`${label} ${valueText}`.trim());
    };

    const addIconLine = (label, payload) => {
      if (!payload || !payload.html) return;
      lines.push(
        `<div class="map-tooltip-line"><span class="map-tooltip-label">${escapeHtml(
          label
        )}</span><span class="map-tooltip-icons">${payload.html}</span></div>`
      );
      textLines.push(`${label} ${payload.text}`.trim());
    };

    if (hit.item && hit.item.kind === "house") {
      const state = houseStates.get(hit.item.id);
      if (state) {
        const health = Math.round(state.condition * 100);
        const statusLabel = formatHouseStatus(state);
        addLine("House", `${health}% (${statusLabel})`, `${health}% ${statusLabel}`);
      }
    }

    if (
      hit.item &&
      (isFoodSpot(hit.item) ||
        isDrinkSpot(hit.item) ||
        isFunSpot(hit.item) ||
        supplySource)
    ) {
      const inventory = getSpotInventory(hit.item);
      if (inventory) {
        addLine(
          "Stock",
          `${inventory.current}/${inventory.max}`,
          `${inventory.current}/${inventory.max}`
        );
      }
    }

    if (hit.item && getSpotIngredients) {
      const ingredients = getSpotIngredients(hit.item);
      if (ingredients.length) {
        const render = renderIngredientEntries(
          ingredients,
          ingredientIconMap,
          true
        );
        addIconLine("Ingredients", render);
      }
    }

    if (hit.item && supplyProducer) {
      const outputs = outputMap[hit.item.locationId] || [];
      if (outputs.length) {
        const render = renderIngredientList(outputs, ingredientIconMap);
        addIconLine("Produces", render);
      }
    }

    if (
      hit.item &&
      !supplySource &&
      !supplyProducer &&
      (isFoodSpot(hit.item) || isDrinkSpot(hit.item))
    ) {
      const supplyType = isFoodSpot(hit.item)
        ? "food"
        : isDrinkSpot(hit.item)
          ? "drink"
          : null;
      const recipe =
        recipeByLocation[hit.item.locationId] ||
        (supplyType ? recipeByType[supplyType] : null);
      const render = renderRecipe(recipe, ingredientIconMap);
      if (render) {
        addIconLine("Inputs", render);
      }
    }

    if (!lines.length) {
      return baseLabel;
    }
    return {
      text: [baseLabel, ...textLines].filter(Boolean).join(" — "),
      html: `<div class="map-tooltip-title">${escapeHtml(baseLabel)}</div>${lines.join(
        ""
      )}`,
    };
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
