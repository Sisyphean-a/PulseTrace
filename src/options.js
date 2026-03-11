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
      showStatus("规则内容不能为空。");
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
    showStatus("规则已新增。");
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
      showStatus("请输入合法的数字设置。");
      return;
    }
    config = {
      ...config,
      settings: { heartbeatIntervalMs, idleThresholdSeconds }
    };
    await persistConfig();
    showStatus("设置已保存。");
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
    const saveButton = buildButton("保存", "secondary");
    const deleteButton = buildButton("删除", "");
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
    const labelMap = {
      domain: "域名通配",
      exact: "精确匹配"
    };
    ["domain", "exact"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = labelMap[type];
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
      showStatus("规则内容不能为空。");
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
    showStatus("规则已更新。");
  }

  async function deleteRule(ruleId) {
    config = {
      ...config,
      trackingRules: config.trackingRules.filter((rule) => rule.id !== ruleId)
    };
    await persistConfig();
    renderRules();
    showStatus("规则已删除。");
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
