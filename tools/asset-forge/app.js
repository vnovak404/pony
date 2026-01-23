const dom = {
  refreshButton: document.getElementById("refresh-manifest"),
  assetCount: document.getElementById("asset-count"),
  manifestStatus: document.getElementById("manifest-status"),
  manifestMessage: document.getElementById("manifest-message"),
  manifestMeta: document.getElementById("manifest-meta"),
  searchInput: document.getElementById("search-input"),
  filterType: document.getElementById("filter-type"),
  filterStage: document.getElementById("filter-stage"),
  filterSystem: document.getElementById("filter-system"),
  assetGrid: document.getElementById("asset-grid"),
  assetDetails: document.getElementById("asset-details"),
  selectedCount: document.getElementById("selected-count"),
  copySelectedPrompts: document.getElementById("copy-selected-prompts"),
  copySelectedCommands: document.getElementById("copy-selected-commands"),
  clearSelection: document.getElementById("clear-selection"),
  generateForm: document.getElementById("asset-generate-form"),
  generateProvider: document.getElementById("generate-provider"),
  generateType: document.getElementById("generate-type"),
  generateTitle: document.getElementById("generate-title"),
  generateSystem: document.getElementById("generate-system"),
  generateCollection: document.getElementById("generate-collection"),
  generateStage: document.getElementById("generate-stage"),
  generateRequestSize: document.getElementById("generate-request-size"),
  generateTargetSize: document.getElementById("generate-target-size"),
  generatePrompt: document.getElementById("generate-prompt"),
  generateStatus: document.getElementById("generate-status"),
  resetGenerate: document.getElementById("reset-generate"),
  workingSprite: document.getElementById("working-sprite"),
  workingSpriteImg: document.getElementById("working-sprite-img"),
  workingLabel: document.getElementById("working-label")
};

const state = {
  manifest: null,
  assets: [],
  filtered: [],
  selectedId: null,
  selectedIds: new Set(),
  pendingAssets: [],
  workingSpriteUrl: ""
};

const TYPE_DEFAULTS = {
  tile: { targetSize: 64, label: "Tile" },
  sprite: { targetSize: 64, label: "Sprite" },
  icon: { targetSize: 32, label: "Icon" },
  overlay: { targetSize: 32, label: "Overlay" },
  hero: { targetSize: 256, label: "Hero" },
  minimap: { targetSize: 512, label: "Minimap" }
};

const resetDetails = () => {
  dom.assetDetails.className = "detail-empty";
  dom.assetDetails.innerHTML = `
    <div class="detail-title">Select an asset</div>
    <div class="detail-body">Click any card to inspect metadata, files, and previews.</div>
  `;
};

const setStatus = (status, message) => {
  dom.manifestStatus.textContent = status;
  dom.manifestMessage.textContent = message;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toLabel = (value) => (value ? String(value) : "—");

const copyText = async (text) => {
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
};

const collectOptions = (assets, key) => {
  const values = new Set();
  assets.forEach((asset) => {
    const value = asset?.[key];
    if (typeof value === "string" && value.trim()) {
      values.add(value.trim());
    }
  });
  return Array.from(values).sort();
};

const hydrateSelect = (select, values) => {
  const current = select.value;
  select.innerHTML = "<option value=\"all\">All</option>";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (values.includes(current)) {
    select.value = current;
  }
};

const renderManifestMeta = (manifest) => {
  if (!manifest) {
    dom.manifestMeta.innerHTML = "";
    return;
  }
  const entries = [
    ["Schema", manifest.schema_version ?? "—"],
    ["Generated", manifest.generated_at ?? "—"],
    ["Assets", Array.isArray(manifest.assets) ? manifest.assets.length : 0]
  ];
  dom.manifestMeta.innerHTML = entries
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
};

const matchesFilters = (asset, { search, type, stage, system }) => {
  if (type !== "all" && asset.type !== type) return false;
  if (stage !== "all" && asset.stage !== stage) return false;
  if (system !== "all" && asset.system !== system) return false;
  if (!search) return true;
  const haystack = [
    asset.id,
    asset.title,
    asset.system,
    asset.type,
    asset.stage,
    asset.script,
    asset.prompt,
    asset.meta?.tileset,
    asset.meta?.style
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
};

const renderGrid = (assets) => {
  const pending = state.pendingAssets.length ? state.pendingAssets : [];
  const allAssets = pending.length ? [...pending, ...assets] : assets;
  dom.assetGrid.innerHTML = "";
  if (allAssets.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No assets match the current filters.";
    empty.className = "detail-empty";
    dom.assetGrid.appendChild(empty);
    return;
  }

  allAssets.forEach((asset) => {
    const card = document.createElement("div");
    card.className = "asset-card";
    card.dataset.assetId = asset.id;
    if (asset.pending) {
      card.classList.add("pending");
    }
    if (state.selectedIds.has(asset.id)) {
      card.classList.add("selected");
    }
    if (asset.id === state.selectedId) {
      card.classList.add("selected");
    }

    const preview = document.createElement("div");
    preview.className = "asset-preview";
    if (asset.preview) {
      const img = document.createElement("img");
      img.src = asset.preview;
      img.alt = asset.title || asset.id;
      preview.appendChild(img);
    } else {
      preview.textContent = asset.type || "Asset";
    }

    const body = document.createElement("div");
    body.className = "asset-body";
    const title = document.createElement("div");
    title.className = "asset-title";
    title.textContent = asset.title || asset.id || "Untitled";
    const tags = document.createElement("div");
    tags.className = "asset-tags";
    const tagValues = [asset.system, asset.type, asset.stage];
    if (asset.pending) {
      tagValues.push("generating");
    }
    tagValues.filter(Boolean).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    body.appendChild(title);
    body.appendChild(tags);
    card.appendChild(preview);
    card.appendChild(body);
    if (!asset.pending) {
      const selector = document.createElement("input");
      selector.type = "checkbox";
      selector.className = "asset-select";
      selector.checked = state.selectedIds.has(asset.id);
      selector.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      selector.addEventListener("change", () => {
        toggleSelected(asset.id);
      });
      card.appendChild(selector);
      card.addEventListener("click", () => selectAsset(asset.id));
    }
    dom.assetGrid.appendChild(card);
  });
};

const renderDetails = (asset) => {
  if (!asset) {
    resetDetails();
    return;
  }
  const profileId = asset.prompt_profile || asset.meta?.prompt_profile;
  const profile = profileId ? state.manifest?.prompt_profiles?.[profileId] : null;
  const prompt = asset.prompt || "";
  const promptBase = asset.prompt_base || "";
  const promptVariant = asset.prompt_variant || "";
  const promptStatus = asset.prompt_status || (prompt ? "ok" : "missing");
  const regenCommand = asset.regenerate?.command || "";
  const scriptPath = typeof asset.script === "string" ? asset.script.trim() : "";
  const scriptHref = scriptPath && scriptPath.includes("/")
    ? scriptPath.startsWith("/") ? scriptPath : `/${scriptPath}`
    : "";
  const scriptEntry = scriptPath
    ? `<div><strong>script</strong>: ${
        scriptHref
          ? `<a href="${escapeHtml(scriptHref)}" target="_blank" rel="noreferrer">${escapeHtml(scriptPath)}</a>`
          : escapeHtml(scriptPath)
      }</div>`
    : "";
  const metaEntries = asset.meta
    ? Object.entries(asset.meta).map(
        ([key, value]) => `<div><strong>${escapeHtml(key)}</strong>: ${escapeHtml(toLabel(value))}</div>`
      )
    : [];
  const sourceEntry = asset.source
    ? `<div><strong>source</strong>: ${escapeHtml(JSON.stringify(asset.source))}</div>`
    : "";
  const fileList = (asset.files || []).map((file) => {
    const label = [file.role, file.label].filter(Boolean).join(": ");
    return `
      <div>
        <div><strong>${escapeHtml(label || "file")}</strong></div>
        <a href="${escapeHtml(file.path || "#")}" target="_blank" rel="noreferrer">
          ${escapeHtml(file.path || "")}
        </a>
      </div>
    `;
  });

  dom.assetDetails.className = "";
  dom.assetDetails.innerHTML = `
    ${asset.preview ? `<div class="detail-preview"><img src="${escapeHtml(asset.preview)}" alt="" /></div>` : ""}
    <div class="detail-title">${escapeHtml(asset.title || asset.id || "Untitled")}</div>
    <div class="asset-tags">
      ${[asset.system, asset.type, asset.stage]
        .filter(Boolean)
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("")}
    </div>
    <div class="detail-section">
      <h3>Metadata</h3>
      <div class="detail-list">
        ${scriptEntry}
        ${metaEntries.join("")}
        ${sourceEntry}
      </div>
    </div>
    <div class="detail-section">
      <h3>Prompts</h3>
      <div class="detail-list">
        <div><strong>status</strong>: ${escapeHtml(promptStatus)}</div>
        ${
          profile
            ? `<div><strong>profile</strong>: ${escapeHtml(profileId)}</div>
               <div class="detail-code">${escapeHtml(profile.prompt)}</div>`
            : ""
        }
        ${
          promptBase
            ? `<div><strong>base</strong>:</div><div class="detail-code">${escapeHtml(promptBase)}</div>`
            : ""
        }
        ${
          promptVariant
            ? `<div><strong>variant</strong>:</div><div class="detail-code">${escapeHtml(promptVariant)}</div>`
            : ""
        }
        ${
          prompt
            ? `<div><strong>full</strong>:</div><div class="detail-code">${escapeHtml(prompt)}</div>`
            : ""
        }
      </div>
      <div class="detail-actions">
        <button class="button ghost" type="button" ${prompt ? "" : "disabled"} data-action="copy-prompt">
          Copy Prompt
        </button>
        <button class="button ghost" type="button" ${regenCommand ? "" : "disabled"} data-action="copy-command">
          Copy Regenerate Command
        </button>
      </div>
      ${regenCommand ? `<div class="detail-code">${escapeHtml(regenCommand)}</div>` : ""}
      ${asset.regenerate?.notes ? `<div class="hint">${escapeHtml(asset.regenerate.notes)}</div>` : ""}
    </div>
    <div class="detail-section">
      <h3>Files</h3>
      <div class="detail-list">
        ${fileList.join("") || "<div>No files listed.</div>"}
      </div>
    </div>
  `;
};

const selectAsset = (assetId) => {
  state.selectedId = assetId;
  const asset = state.assets.find((entry) => entry.id === assetId);
  renderGrid(state.filtered);
  renderDetails(asset);

  const actions = dom.assetDetails.querySelectorAll("[data-action]");
  actions.forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.action === "copy-prompt" && asset?.prompt) {
        await copyText(asset.prompt);
      }
      if (button.dataset.action === "copy-command" && asset?.regenerate?.command) {
        await copyText(asset.regenerate.command);
      }
    });
  });
};

const updateSelectionBar = () => {
  const count = state.selectedIds.size;
  if (dom.selectedCount) {
    dom.selectedCount.textContent = count;
  }
  if (dom.copySelectedPrompts) {
    dom.copySelectedPrompts.disabled = count === 0;
  }
  if (dom.copySelectedCommands) {
    dom.copySelectedCommands.disabled = count === 0;
  }
  if (dom.clearSelection) {
    dom.clearSelection.disabled = count === 0;
  }
};

function toggleSelected(assetId) {
  if (state.selectedIds.has(assetId)) {
    state.selectedIds.delete(assetId);
  } else {
    state.selectedIds.add(assetId);
  }
  renderGrid(state.filtered);
  updateSelectionBar();
}

const selectedAssets = () =>
  state.assets.filter((asset) => state.selectedIds.has(asset.id));

const collectPromptProfiles = (assets) => {
  const profiles = {};
  assets.forEach((asset) => {
    const profileId = asset.prompt_profile || asset.meta?.prompt_profile;
    const profile = profileId ? state.manifest?.prompt_profiles?.[profileId] : null;
    if (profileId && profile) {
      profiles[profileId] = profile;
    }
  });
  return profiles;
};

const copySelectedPrompts = async () => {
  const assets = selectedAssets();
  if (assets.length === 0) {
    return;
  }
  const payload = {
    prompt_profiles: collectPromptProfiles(assets),
    assets: assets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type,
      stage: asset.stage,
      script: asset.script || "",
      prompt_profile: asset.prompt_profile || asset.meta?.prompt_profile || "",
      prompt_status: asset.prompt_status || (asset.prompt ? "ok" : "missing"),
      prompt_base: asset.prompt_base || "",
      prompt_variant: asset.prompt_variant || "",
      prompt: asset.prompt || ""
    }))
  };
  await copyText(JSON.stringify(payload, null, 2));
};

const copySelectedCommands = async () => {
  const assets = selectedAssets();
  if (assets.length === 0) {
    return;
  }
  const commands = assets
    .map((asset) => asset.regenerate?.command)
    .filter(Boolean);
  const output = commands.length > 0
    ? commands.join("\n")
    : "No regenerate commands available for the selected assets.";
  await copyText(output);
};

const applyFilters = () => {
  const search = dom.searchInput.value.trim().toLowerCase();
  const filters = {
    search,
    type: dom.filterType.value,
    stage: dom.filterStage.value,
    system: dom.filterSystem.value
  };
  const filtered = state.assets.filter((asset) => matchesFilters(asset, filters));
  state.filtered = filtered;
  dom.assetCount.textContent = filtered.length;
  renderGrid(filtered);
  updateSelectionBar();
};

const loadManifest = async () => {
  if (window.location.protocol === "file:") {
    setStatus("Offline", "Run the local server to load the manifest.");
    return;
  }

  setStatus("Loading", "Fetching asset manifest...");
  try {
    const response = await fetch(`/api/assets/manifest?ts=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Manifest request failed (${response.status}).`);
    }
    const manifest = await response.json();
    state.manifest = manifest;
    state.assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    state.filtered = state.assets;
    state.selectedId = null;
    state.selectedIds = new Set();
    hydrateSelect(dom.filterType, collectOptions(state.assets, "type"));
    hydrateSelect(dom.filterStage, collectOptions(state.assets, "stage"));
    hydrateSelect(dom.filterSystem, collectOptions(state.assets, "system"));
    renderManifestMeta(manifest);
    dom.assetCount.textContent = state.assets.length;
    setStatus("Loaded", "Manifest loaded from the local server.");
    resetDetails();
    applyFilters();
  } catch (error) {
    setStatus("Error", "Failed to load manifest. Check the server logs.");
  }
};

const buildWorkingSprite = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.fillStyle = "#2f3d42";
  ctx.fillRect(18, 30, 28, 16);
  ctx.fillRect(14, 26, 12, 10);
  ctx.fillStyle = "#495a62";
  ctx.fillRect(26, 22, 16, 8);
  ctx.fillStyle = "#1f2a2e";
  ctx.fillRect(20, 44, 6, 12);
  ctx.fillRect(32, 44, 6, 12);
  ctx.fillStyle = "#f39c54";
  ctx.fillRect(22, 28, 4, 4);
  ctx.fillRect(34, 28, 4, 4);
  return canvas.toDataURL("image/png");
};

const setWorkingSprite = (active, label) => {
  if (dom.workingSprite) {
    dom.workingSprite.classList.toggle("is-working", Boolean(active));
  }
  if (dom.workingLabel && label) {
    dom.workingLabel.textContent = label;
  }
};

const setGenerateStatus = (status, detail) => {
  if (!dom.generateStatus) return;
  dom.generateStatus.textContent = detail ? `${status}: ${detail}` : status;
};

const disableGenerateForm = (disabled) => {
  if (!dom.generateForm) return;
  const controls = dom.generateForm.querySelectorAll("input, select, textarea, button");
  controls.forEach((control) => {
    if (control.id === "reset-generate") {
      control.disabled = disabled;
      return;
    }
    control.disabled = disabled;
  });
};

const ensureTargetSize = (assetType) => {
  const defaults = TYPE_DEFAULTS[assetType];
  if (!defaults || !dom.generateTargetSize) return;
  dom.generateTargetSize.value = String(defaults.targetSize);
};

const buildPendingAsset = (payload) => {
  const id = `pending-${Date.now()}`;
  return {
    id,
    title: payload.title || `${payload.type} asset`,
    system: payload.system,
    type: payload.type,
    stage: "generating",
    preview: state.workingSpriteUrl,
    pending: true
  };
};

const addPendingAsset = (payload) => {
  const pending = buildPendingAsset(payload);
  state.pendingAssets = [pending];
  renderGrid(state.filtered);
  return pending.id;
};

const clearPendingAssets = () => {
  state.pendingAssets = [];
  renderGrid(state.filtered);
};

const collectGeneratePayload = () => {
  const payload = {
    provider: dom.generateProvider?.value || "openai",
    type: dom.generateType?.value || "tile",
    title: dom.generateTitle?.value?.trim() || "",
    system: dom.generateSystem?.value?.trim() || "adventure_map",
    collection: dom.generateCollection?.value?.trim() || "asset_forge",
    stage: dom.generateStage?.value || "generated",
    request_size: dom.generateRequestSize?.value?.trim() || 1024,
    target_size: dom.generateTargetSize?.value ? Number(dom.generateTargetSize.value) : undefined,
    prompt: dom.generatePrompt?.value?.trim() || ""
  };
  return payload;
};

const resetGenerator = () => {
  if (!dom.generateForm) return;
  dom.generateTitle.value = "";
  dom.generatePrompt.value = "";
  dom.generateType.value = "tile";
  dom.generateSystem.value = "adventure_map";
  dom.generateCollection.value = "asset_forge";
  dom.generateStage.value = "generated";
  dom.generateRequestSize.value = "1024";
  dom.generateTargetSize.value = String(TYPE_DEFAULTS.tile.targetSize);
  setGenerateStatus("Idle", "Ready.");
  setWorkingSprite(false, "Ready to generate.");
};

const handleGenerateSubmit = async (event) => {
  event.preventDefault();
  if (window.location.protocol === "file:") {
    setGenerateStatus("Offline", "Run the local server to generate assets.");
    return;
  }

  const payload = collectGeneratePayload();
  if (!payload.prompt) {
    setGenerateStatus("Error", "Prompt is required.");
    return;
  }

  ensureTargetSize(payload.type);
  setGenerateStatus("Generating", "Contacting the API...");
  setWorkingSprite(true, `Generating ${payload.title || payload.type}...`);
  addPendingAsset(payload);
  disableGenerateForm(true);

  try {
    const response = await fetch("/api/assets/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const message = errorPayload.error || `Generation failed (${response.status}).`;
      throw new Error(message);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || "Generation failed.");
    }
    if (data.asset?.preview && dom.workingSpriteImg) {
      dom.workingSpriteImg.src = data.asset.preview;
    }
    setGenerateStatus("Complete", "Asset generated.");
    setWorkingSprite(false, "Asset generated and added to the library.");
    clearPendingAssets();
    await loadManifest();
  } catch (error) {
    clearPendingAssets();
    setGenerateStatus("Error", error.message || "Generation failed.");
    setWorkingSprite(false, "Generation failed.");
  } finally {
    disableGenerateForm(false);
  }
};

dom.refreshButton?.addEventListener("click", () => loadManifest());
dom.searchInput?.addEventListener("input", () => applyFilters());
dom.filterType?.addEventListener("change", () => applyFilters());
dom.filterStage?.addEventListener("change", () => applyFilters());
dom.filterSystem?.addEventListener("change", () => applyFilters());
dom.copySelectedPrompts?.addEventListener("click", () => copySelectedPrompts());
dom.copySelectedCommands?.addEventListener("click", () => copySelectedCommands());
dom.clearSelection?.addEventListener("click", () => {
  state.selectedIds.clear();
  renderGrid(state.filtered);
  updateSelectionBar();
});
dom.generateType?.addEventListener("change", () => {
  ensureTargetSize(dom.generateType.value);
});
dom.generateForm?.addEventListener("submit", handleGenerateSubmit);
dom.resetGenerate?.addEventListener("click", resetGenerator);

resetDetails();
state.workingSpriteUrl = buildWorkingSprite();
if (state.workingSpriteUrl && dom.workingSpriteImg) {
  dom.workingSpriteImg.src = state.workingSpriteUrl;
}
resetGenerator();
loadManifest();
