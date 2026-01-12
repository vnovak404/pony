// Pony Parade: asset loading helpers.

export const loadStructureSprites = async ({ objects, loadImageWithFallback }) => {
  const structureSprites = {};
  const structureItems = objects.filter((item) => item.sprite || item.spritePath);
  const getVariantPath = (path, suffix) => {
    if (!path) return "";
    const dotIndex = path.lastIndexOf(".");
    if (dotIndex === -1) return `${path}_${suffix}`;
    return `${path.slice(0, dotIndex)}_${suffix}${path.slice(dotIndex)}`;
  };
  await Promise.all(
    structureItems.map(async (item) => {
      const spritePath = item.spritePath
        ? item.spritePath
        : `assets/world/structures/${item.sprite}.png`;
      try {
        const base = await loadImageWithFallback(spritePath);
        if (item.kind === "house") {
          const [repair, ruined] = await Promise.all([
            loadImageWithFallback(getVariantPath(spritePath, "repair")).catch(
              () => null
            ),
            loadImageWithFallback(getVariantPath(spritePath, "ruined")).catch(
              () => null
            ),
          ]);
          structureSprites[item.id] = { base, repair, ruined };
        } else {
          structureSprites[item.id] = base;
        }
      } catch (error) {
        structureSprites[item.id] = null;
      }
    })
  );
  return structureSprites;
};

export const loadDecorSprites = async ({ decorItems, loadImageWithFallback }) => {
  const decorSprites = {};
  await Promise.all(
    decorItems.map(async (item) => {
      if (!item.sprite) return;
      try {
        decorSprites[item.id] = await loadImageWithFallback(
          `assets/world/decor/${item.sprite}.png`
        );
      } catch (error) {
        decorSprites[item.id] = null;
      }
    })
  );
  return decorSprites;
};

export const loadStatusIcons = async ({ loadImageWithFallback }) => {
  const statusIconPaths = {
    health: "assets/ui/icons/health.webp",
    thirst: "assets/ui/icons/thirst.webp",
    hunger: "assets/ui/icons/hunger.webp",
    tiredness: "assets/ui/icons/tired.webp",
    boredom: "assets/ui/icons/boredom.webp",
  };
  const statusIcons = {};
  await Promise.all(
    Object.entries(statusIconPaths).map(async ([key, path]) => {
      try {
        statusIcons[key] = await loadImageWithFallback(path);
      } catch (error) {
        statusIcons[key] = null;
      }
    })
  );
  return statusIcons;
};

export const loadPonySprites = async ({ ponies, loadImageWithFallback, loadJson }) => {
  const sprites = await Promise.all(
    ponies.map(async (pony) => {
      if (!pony.sprites || !pony.sprites.meta) {
        return null;
      }
      try {
        const metaPath = pony.sprites.meta;
        const meta = await loadJson(metaPath);
        const basePath = metaPath.slice(0, metaPath.lastIndexOf("/") + 1);
        const metaImage = meta.meta && meta.meta.image ? meta.meta.image : "";
        const sheetPath = pony.sprites.sheet
          ? pony.sprites.sheet
          : metaImage
            ? metaImage.startsWith("/") || metaImage.startsWith("assets/")
              ? metaImage
              : `${basePath}${metaImage}`
            : "";
        if (!sheetPath) {
          return null;
        }
        const sheet = await loadImageWithFallback(sheetPath);
        if (!sheet) {
          return null;
        }
        const sheets = [sheet];
        const moveType = meta.animations.walk
          ? "walk"
          : meta.animations.trot
            ? "trot"
            : "idle";
        const moveFrames = meta.animations[moveType];
        const idleFrames = meta.animations.idle || moveFrames;
        const sleepFrames = meta.animations.sleep || idleFrames || moveFrames;
        const eatFrames = meta.animations.eat || idleFrames || moveFrames;
        const drinkFrames = meta.animations.drink || idleFrames || moveFrames;
        const vetFrames = meta.animations.vet || idleFrames || moveFrames;
        const repairFrames =
          meta.animations.repair ||
          (moveFrames && moveFrames.length ? [moveFrames[0]] : idleFrames || moveFrames);
        if (!moveFrames || !moveFrames.length) return null;
        return {
          pony,
          meta,
          sheet,
          sheets,
          moveFrames,
          sleepFrames,
          idleFrames,
          eatFrames,
          drinkFrames,
          vetFrames,
          repairFrames,
          moveType,
        };
      } catch (error) {
        return null;
      }
    })
  );
  return sprites;
};
