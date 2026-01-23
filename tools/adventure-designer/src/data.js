const DEFAULTS = {
  tilesPath: "../../adventures/missions/stellacorn/mission1/data/adventure_tiles.json",
  objectsPath: "../../adventures/missions/stellacorn/mission1/data/adventure_objects.json",
  mapPath: ""
};

export function getEditorConfig() {
  const params = new URLSearchParams(window.location.search);
  return {
    tilesPath: params.get("tiles") || DEFAULTS.tilesPath,
    objectsPath: params.get("objects") || DEFAULTS.objectsPath,
    mapPath: params.get("map") || DEFAULTS.mapPath
  };
}

export async function loadPhaserIfAvailable() {
  const candidates = [
    "../../node_modules/phaser/dist/phaser.min.js"
  ];

  for (const url of candidates) {
    const available = await checkUrl(url);
    if (!available) {
      continue;
    }
    const loaded = await loadScript(url);
    if (loaded && window.Phaser) {
      return;
    }
  }
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      return true;
    }
    if (response.status === 405) {
      const getResponse = await fetch(url, { method: "GET" });
      return getResponse.ok;
    }
    return false;
  } catch (error) {
    return false;
  }
}

function loadScript(url) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export async function loadJson(path, fallback) {
  if (!path) {
    return fallback;
  }
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    return await response.json();
  } catch (error) {
    return fallback;
  }
}
