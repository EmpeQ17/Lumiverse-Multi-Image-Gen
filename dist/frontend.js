export function setup(ctx) {
  var removeStyle = ctx.dom.addStyle(`
    .aig-panel {
      padding: 16px;
      color: var(--lumiverse-text);
      font-size: 13px;
    }
    .aig-panel label {
      display: block;
      margin-bottom: 12px;
      color: var(--lumiverse-text-muted);
      font-size: 12px;
    }
    .aig-panel input,
    .aig-panel textarea,
    .aig-panel select {
      width: 100%;
      padding: 8px 10px;
      background: var(--lumiverse-fill);
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      color: var(--lumiverse-text);
      font-size: 13px;
      margin-top: 4px;
      box-sizing: border-box;
    }
    .aig-panel textarea {
      min-height: 80px;
      resize: vertical;
      font-family: monospace;
    }
    .aig-panel select {
      cursor: pointer;
    }
    .aig-panel .aig-row {
      display: flex;
      gap: 12px;
    }
    .aig-panel .aig-row > label {
      flex: 1;
    }
    .aig-panel .aig-row input {
      width: 100%;
    }
    .aig-panel .aig-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      color: var(--lumiverse-text);
      font-size: 13px;
      cursor: pointer;
    }
    .aig-panel .aig-checkbox input {
      width: auto;
      margin: 0;
    }
    .aig-panel .aig-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      color: var(--lumiverse-text);
      font-size: 13px;
      cursor: pointer;
      font-weight: 600;
    }
    .aig-panel .aig-toggle input {
      width: auto;
      margin: 0;
    }
    .aig-panel .aig-divider {
      border: none;
      border-top: 1px solid var(--lumiverse-border);
      margin: 12px 0;
    }
    .aig-panel .aig-save {
      margin-top: 16px;
      padding: 8px 20px;
      background: var(--lumiverse-accent);
      color: var(--lumiverse-text-on-accent);
      border: none;
      border-radius: var(--lumiverse-radius);
      cursor: pointer;
      font-size: 13px;
    }
    .aig-panel .aig-save:hover {
      opacity: 0.9;
    }
    .aig-panel .aig-refresh {
      margin-top: 16px;
      margin-left: 8px;
      padding: 8px 16px;
      background: var(--lumiverse-fill);
      color: var(--lumiverse-text);
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      cursor: pointer;
      font-size: 13px;
    }
    .aig-panel .aig-refresh:hover {
      background: var(--lumiverse-fill-hover);
    }
    .aig-panel .aig-status {
      margin-top: 8px;
      font-size: 11px;
      color: var(--lumiverse-text-muted);
    }
    .aig-panel h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
    }
  `);

  var tab = ctx.ui.registerDrawerTab({
    id: "auto_image_gen_settings",
    title: "Auto Image Gen",
    shortName: "ImgGen",
    description: "Settings for Auto Image Gen extension",
    headerTitle: "Auto Image Gen",
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zM3.25 4.5a.75.75 0 00-.75.75v9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-9.5a.75.75 0 00-.75-.75H3.25z"/><path d="M6.5 11.5l2-2.5 2 2 3-4 3.5 5h-13l2.5-3z"/></svg>',
  });

  tab.root.innerHTML = `
    <div class="aig-panel">
      <h3>Auto Image Gen Settings</h3>
      <label class="aig-toggle">
        <input type="checkbox" class="aig-enabled" />
        Enabled
      </label>
      <hr class="aig-divider" />
      <label>
        Model
        <select class="aig-model">
          <option value="">(default)</option>
        </select>
      </label>
      <label>
        Negative Prompt
        <textarea class="aig-neg" placeholder="lowres, bad anatomy, bad hands, text, error..."></textarea>
      </label>
      <div class="aig-row">
        <label>
          Width
          <input type="number" class="aig-width" min="256" max="4096" step="64" />
        </label>
        <label>
          Height
          <input type="number" class="aig-height" min="256" max="4096" step="64" />
        </label>
      </div>
      <label class="aig-checkbox">
        <input type="checkbox" class="aig-insert" />
        Insert generated image into chat
      </label>
      <button class="aig-save">Save</button>
      <button class="aig-refresh">Refresh Models</button>
      <div class="aig-status"></div>
    </div>
  `;

  var enabledCheck = tab.root.querySelector(".aig-enabled");
  var modelSelect = tab.root.querySelector(".aig-model");
  var negInput = tab.root.querySelector(".aig-neg");
  var widthInput = tab.root.querySelector(".aig-width");
  var heightInput = tab.root.querySelector(".aig-height");
  var insertCheck = tab.root.querySelector(".aig-insert");
  var saveBtn = tab.root.querySelector(".aig-save");
  var refreshBtn = tab.root.querySelector(".aig-refresh");
  var statusEl = tab.root.querySelector(".aig-status");

  function populateModels(models) {
    var currentValue = modelSelect.value;
    modelSelect.innerHTML = '<option value="">(default)</option>';
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var option = document.createElement("option");
      option.value = m.id;
      option.textContent = m.label || m.id;
      modelSelect.appendChild(option);
    }
    if (currentValue) {
      modelSelect.value = currentValue;
    }
  }

  ctx.sendToBackend({ type: "get_settings" });
  ctx.sendToBackend({ type: "get_models" });

  var unsub = ctx.onBackendMessage(function (payload) {
    if (payload.type === "settings" || payload.type === "settings_saved") {
      var s = payload.settings;
      enabledCheck.checked = s.enabled !== false;
      negInput.value = s.negative_prompt || "";
      widthInput.value = s.width || 1024;
      heightInput.value = s.height || 1024;
      insertCheck.checked = s.insert_into_chat !== false;
      if (s.model) {
        modelSelect.value = s.model;
      }
      if (payload.type === "settings_saved") {
        statusEl.textContent = "Saved!";
        setTimeout(function () { statusEl.textContent = ""; }, 2000);
      }
    } else if (payload.type === "models") {
      populateModels(payload.models || []);
    }
  });

  saveBtn.addEventListener("click", function () {
    ctx.sendToBackend({
      type: "save_settings",
      settings: {
        enabled: enabledCheck.checked,
        model: modelSelect.value || null,
        negative_prompt: negInput.value,
        width: parseInt(widthInput.value, 10) || 1024,
        height: parseInt(heightInput.value, 10) || 1024,
        insert_into_chat: insertCheck.checked,
      },
    });
  });

  refreshBtn.addEventListener("click", function () {
    statusEl.textContent = "Loading models...";
    ctx.sendToBackend({ type: "get_models" });
  });

  return function () {
    unsub();
    removeStyle();
    tab.destroy();
  };
}