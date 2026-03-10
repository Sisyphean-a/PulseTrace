(function initOptionsPage() {
  const MIN_IDLE_THRESHOLD_SECONDS = 15;
  const MIN_HEARTBEAT_INTERVAL_MS = 1_000;
  const { DEFAULT_SETTINGS, STORAGE_KEYS } = self.PulseTraceConstants;
  const STATUS_CLEAR_MS = 2_500;

  const elements = {
    heartbeatInterval: document.getElementById("heartbeat-interval"),
    idleThreshold: document.getElementById("idle-threshold"),
    ruleForm: document.getElementById("rule-form"),
    ruleList: document.getElementById("rule-list"),
    rulePattern: document.getElementById("rule-pattern"),
    ruleType: document.getElementById("rule-type"),
    settingsForm: document.getElementById("settings-form"),
    status: document.getElementById("status")
  };

  let config = createDefaultConfig();
  let statusTimer = null;

  void initialize();

  async function initialize() {
    config = await loadConfig();
    bindEvents();
    render();
  }

  function bindEvents() {
    elements.ruleForm.addEventListener("submit", handleCreateRule);
    elements.settingsForm.addEventListener("submit", handleSaveSettings);
  }

  async function handleCreateRule(event) {
    event.preventDefault();
    const type = elements.ruleType.value;
    const pattern = elements.rulePattern.value.trim();
    if (!pattern) {
      showStatus("Rule pattern cannot be empty.");
      return;
    }
    const nextRule = {
      id: createRuleId(),
      pattern,
      type
    };
    config = {
      ...config,
      trackingRules: [...config.trackingRules, nextRule]
    };
    await persistConfig();
    elements.rulePattern.value = "";
    render();
    showStatus("Rule added.");
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    const idleThresholdSeconds = Number(elements.idleThreshold.value);
    const heartbeatIntervalMs = Number(elements.heartbeatInterval.value);
    const invalidValues =
      !Number.isInteger(idleThresholdSeconds) ||
      idleThresholdSeconds < MIN_IDLE_THRESHOLD_SECONDS ||
      !Number.isInteger(heartbeatIntervalMs) ||
      heartbeatIntervalMs < MIN_HEARTBEAT_INTERVAL_MS;
    if (invalidValues) {
      showStatus("Please enter valid numeric settings.");
      return;
    }
    config = {
      ...config,
      settings: { heartbeatIntervalMs, idleThresholdSeconds }
    };
    await persistConfig();
    showStatus("Settings saved.");
  }

  function createDefaultConfig() {
    return {
      settings: { ...DEFAULT_SETTINGS },
      trackingRules: []
    };
  }

  async function loadConfig() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    const rawConfig = stored[STORAGE_KEYS.CONFIG];
    return normalizeConfig(rawConfig);
  }

  function normalizeConfig(rawConfig) {
    const safe = rawConfig || {};
    return {
      settings: {
        heartbeatIntervalMs: Number.isInteger(safe.settings?.heartbeatIntervalMs)
          ? safe.settings.heartbeatIntervalMs
          : DEFAULT_SETTINGS.heartbeatIntervalMs,
        idleThresholdSeconds: Number.isInteger(safe.settings?.idleThresholdSeconds)
          ? safe.settings.idleThresholdSeconds
          : DEFAULT_SETTINGS.idleThresholdSeconds
      },
      trackingRules: Array.isArray(safe.trackingRules) ? safe.trackingRules : []
    };
  }

  async function persistConfig() {
    await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: config });
  }

  function render() {
    renderSettings();
    renderRules();
  }

  function renderSettings() {
    elements.idleThreshold.value = String(config.settings.idleThresholdSeconds);
    elements.heartbeatInterval.value = String(config.settings.heartbeatIntervalMs);
  }

  function renderRules() {
    elements.ruleList.textContent = "";
    config.trackingRules.forEach((rule) => {
      const item = createRuleItem(rule);
      elements.ruleList.appendChild(item);
    });
  }

  function createRuleItem(rule) {
    const item = document.createElement("li");
    const typeInput = buildTypeInput(rule.type);
    const patternInput = buildPatternInput(rule.pattern);
    const saveButton = buildButton("Save", "secondary");
    const deleteButton = buildButton("Delete", "");
    item.className = "rule-item";
    saveButton.addEventListener("click", async () => {
      await updateRule({
        id: rule.id,
        pattern: patternInput.value.trim(),
        type: typeInput.value
      });
    });
    deleteButton.addEventListener("click", async () => {
      await deleteRule(rule.id);
    });
    item.append(typeInput, patternInput, saveButton, deleteButton);
    return item;
  }

  function buildTypeInput(currentValue) {
    const select = document.createElement("select");
    ["domain", "exact"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      option.selected = currentValue === type;
      select.appendChild(option);
    });
    return select;
  }

  function buildPatternInput(value) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    return input;
  }

  function buildButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) {
      button.classList.add(className);
    }
    return button;
  }

  async function updateRule(nextRule) {
    if (!nextRule.pattern) {
      showStatus("Rule pattern cannot be empty.");
      return;
    }
    config = {
      ...config,
      trackingRules: config.trackingRules.map((rule) => {
        if (rule.id === nextRule.id) {
          return nextRule;
        }
        return rule;
      })
    };
    await persistConfig();
    renderRules();
    showStatus("Rule updated.");
  }

  async function deleteRule(ruleId) {
    config = {
      ...config,
      trackingRules: config.trackingRules.filter((rule) => rule.id !== ruleId)
    };
    await persistConfig();
    renderRules();
    showStatus("Rule deleted.");
  }

  function showStatus(message) {
    elements.status.textContent = message;
    if (statusTimer) {
      clearTimeout(statusTimer);
    }
    statusTimer = setTimeout(() => {
      elements.status.textContent = "";
    }, STATUS_CLEAR_MS);
  }

  function createRuleId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return "rule-" + Date.now();
  }
})();
