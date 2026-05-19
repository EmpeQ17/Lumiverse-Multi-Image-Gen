var TAG_REGEX = /\[img:\s*([\s\S]*?)\]/g;
var USER_ID = null;
var CONNECTION_ID = null;
var CONN_WORKFLOW_API = null;
var CONN_FIELD_MAPPINGS = null;
var SETTINGS = {
  negative_prompt: "",
  width: 1024,
  height: 1024,
  insert_into_chat: true,
  enabled: true,
  model: null,
};

function patchWorkflow(workflow, fieldMappings, values) {
  var patched = JSON.parse(JSON.stringify(workflow));

  for (var i = 0; i < fieldMappings.length; i++) {
    var m = fieldMappings[i];
    var node = patched[m.nodeId];
    if (!node || !node.inputs) continue;

    var val = undefined;
    if (m.mappedAs === "positive_prompt") val = values.positive_prompt;
    else if (m.mappedAs === "negative_prompt") val = values.negative_prompt;
    else if (m.mappedAs === "seed") val = values.seed;
    else if (m.mappedAs === "width") val = values.width;
    else if (m.mappedAs === "height") val = values.height;
    else if (m.mappedAs === "model" || m.mappedAs === "checkpoint") val = values.model;

    if (val !== undefined && val !== null && val !== "") {
      node.inputs[m.fieldName] = val;
    }
  }

  return patched;
}

async function loadSettings() {
  try {
    var s = await spindle.storage.getJson("settings.json", { fallback: null });
    if (s) {
      if (s.negative_prompt !== undefined) SETTINGS.negative_prompt = s.negative_prompt;
      if (s.width !== undefined) SETTINGS.width = s.width;
      if (s.height !== undefined) SETTINGS.height = s.height;
      if (s.insert_into_chat !== undefined) SETTINGS.insert_into_chat = s.insert_into_chat;
      if (s.enabled !== undefined) SETTINGS.enabled = s.enabled;
      if (s.model !== undefined) SETTINGS.model = s.model;
    }
  } catch (err) {
    spindle.log.info("auto-image-gen: loadSettings failed " + (err.message ?? err));
  }
}

async function saveSettings(newSettings) {
  try {
    if (newSettings.negative_prompt !== undefined) SETTINGS.negative_prompt = newSettings.negative_prompt;
    if (newSettings.width !== undefined) SETTINGS.width = newSettings.width;
    if (newSettings.height !== undefined) SETTINGS.height = newSettings.height;
    if (newSettings.insert_into_chat !== undefined) SETTINGS.insert_into_chat = newSettings.insert_into_chat;
    if (newSettings.enabled !== undefined) SETTINGS.enabled = newSettings.enabled;
    if (newSettings.model !== undefined) SETTINGS.model = newSettings.model;
    await spindle.storage.setJson("settings.json", SETTINGS, { indent: 2 });
  } catch (err) {
    spindle.log.info("auto-image-gen: saveSettings failed " + (err.message ?? err));
  }
}

async function loadConnection() {
  if (!USER_ID) return;
  try {
    var connections = await spindle.imageGen.listConnections(USER_ID);

    for (var i = 0; i < connections.length; i++) {
      if (connections[i].is_default || !CONNECTION_ID) {
        CONNECTION_ID = connections[i].id;
      }
    }

    if (CONNECTION_ID) {
      var conn = await spindle.imageGen.getConnection(CONNECTION_ID, USER_ID);
      if (conn && conn.metadata && conn.metadata.comfyui) {
        var cmeta = conn.metadata.comfyui;
        CONN_WORKFLOW_API = cmeta.workflow_api_json;
        CONN_FIELD_MAPPINGS = cmeta.field_mappings;
      }
    }
  } catch (err) {
    spindle.log.info("auto-image-gen: loadConnection failed " + (err.message ?? err));
  }
}

async function getAvailableModels() {
  try {
    if (!CONNECTION_ID || !USER_ID) return [];
    return await spindle.imageGen.getModels(CONNECTION_ID, USER_ID) || [];
  } catch (err) {
    spindle.log.info("auto-image-gen: getModels failed " + (err.message ?? err));
    return [];
  }
}

async function generateOne(prompt, chatId, characterId) {
  var modelVal = SETTINGS.model || undefined;

  var patched = patchWorkflow(CONN_WORKFLOW_API, CONN_FIELD_MAPPINGS || [], {
    positive_prompt: prompt,
    negative_prompt: SETTINGS.negative_prompt || "",
    seed: Math.floor(Math.random() * 2147483647),
    width: SETTINGS.width,
    height: SETTINGS.height,
    model: modelVal,
  });

  var genArgs = {
    prompt: prompt,
    connection_id: CONNECTION_ID,
    owner_chat_id: chatId,
    parameters: {
      workflow: patched,
      workflowFormat: "api_prompt",
      preserveImportedWorkflow: true,
    },
  };

  if (USER_ID) genArgs.userId = USER_ID;
  if (characterId) genArgs.owner_character_id = characterId;

  return await spindle.imageGen.generate(genArgs);
}

async function processContent(chatId, messageId, characterId, content) {
  if (!content) return;
  if (!SETTINGS.enabled) return;

  var matches = [...content.matchAll(TAG_REGEX)];
  if (matches.length === 0) return;

  spindle.log.info("auto-image-gen: found " + matches.length + " img tag(s)");

  var prompts = [];
  for (var i = 0; i < matches.length; i++) {
    var pt = matches[i][1].trim();
    if (pt.length > 0) prompts.push(pt);
  }

  if (!CONNECTION_ID || !CONN_WORKFLOW_API || !USER_ID) return;

  var cleaned = content.replace(TAG_REGEX, "$1").trim();
  if (!cleaned) cleaned = ".";

  try {
    await spindle.chat.updateMessage(chatId, messageId, { content: cleaned });
  } catch (err) {
    spindle.log.info("auto-image-gen: strip failed " + (err.message ?? err));
  }

  if (!SETTINGS.insert_into_chat) {
    for (var j = 0; j < prompts.length; j++) {
      spindle.log.info('auto-image-gen: generating "' + prompts[j].slice(0, 80) + '..."');
      try {
        await generateOne(prompts[j], chatId, characterId);
      } catch (err) {
        spindle.log.info("auto-image-gen: gen failed " + (err.message ?? err));
      }
    }
    return;
  }

  var currentContent = cleaned;

  for (var k = 0; k < prompts.length; k++) {
    var prompt = prompts[k];
    spindle.log.info('auto-image-gen: generating "' + prompt.slice(0, 80) + '..."');

    try {
      var result = await generateOne(prompt, chatId, characterId);
      if (result.imageUrl) {
        currentContent = currentContent + "\n\n![" + prompt.slice(0, 120) + "](" + result.imageUrl + ")";
        await spindle.chat.updateMessage(chatId, messageId, { content: currentContent });
      }
    } catch (err) {
      spindle.log.info("auto-image-gen: gen failed " + (err.message ?? err));
    }
  }
}

spindle.onFrontendMessage(async function (payload, userId) {
  if (!USER_ID && userId) {
    USER_ID = userId;
    await loadConnection();
  }

  if (payload.type === "get_settings") {
    spindle.sendToFrontend({ type: "settings", settings: SETTINGS }, userId);
  } else if (payload.type === "get_models") {
    var models = await getAvailableModels();
    spindle.sendToFrontend({ type: "models", models: models }, userId);
  } else if (payload.type === "save_settings") {
    await saveSettings(payload.settings);
    spindle.sendToFrontend({ type: "settings_saved", settings: SETTINGS }, userId);
  }
});

spindle.on("MESSAGE_EDITED", async function (payload) {
  var message = payload.message;
  var content = message.content;
  if (!content) return;
  var characterId = (message.extra && message.extra.character_id) || null;
  await processContent(payload.chatId, message.id, characterId, content);
});

loadSettings().then(function () {
  spindle.log.info("Auto Image Gen loaded! userId=auto-detect");
});