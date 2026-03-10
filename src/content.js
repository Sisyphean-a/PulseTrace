(function initContentScript() {
  const { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } = self.PulseTraceConstants;
  const { isUrlTracked } = self.PulseTraceMatching;
  const DOM_EVENTS = Object.freeze([
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart"
  ]);
  const LISTENER_OPTIONS = Object.freeze({ passive: true });

  let config = createDefaultConfig();
  let trackingEnabled = false;
  let lastHeartbeatAt = 0;
  let listenersBound = false;

  void initialize();

  async function initialize() {
    config = await loadConfig();
    syncTrackingStatus();
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  function createDefaultConfig() {
    return {
      settings: { ...DEFAULT_SETTINGS },
      trackingRules: []
    };
  }

  async function loadConfig() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    return normalizeConfig(stored[STORAGE_KEYS.CONFIG]);
  }

  function normalizeConfig(input) {
    const safe = input || {};
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

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[STORAGE_KEYS.CONFIG]) {
      return;
    }
    config = normalizeConfig(changes[STORAGE_KEYS.CONFIG].newValue);
    syncTrackingStatus();
  }

  function syncTrackingStatus() {
    trackingEnabled = isUrlTracked({
      rules: config.trackingRules,
      url: window.location.href
    });
    if (trackingEnabled && !listenersBound) {
      bindListeners();
      return;
    }
    if (!trackingEnabled && listenersBound) {
      unbindListeners();
    }
  }

  function bindListeners() {
    DOM_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, onDomInteraction, LISTENER_OPTIONS);
    });
    listenersBound = true;
  }

  function unbindListeners() {
    DOM_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, onDomInteraction, LISTENER_OPTIONS);
    });
    listenersBound = false;
  }

  function onDomInteraction() {
    if (!trackingEnabled) {
      return;
    }
    const now = Date.now();
    const threshold = config.settings.heartbeatIntervalMs;
    if (now - lastHeartbeatAt < threshold) {
      return;
    }
    lastHeartbeatAt = now;
    chrome.runtime.sendMessage({
      timestamp: now,
      title: document.title || "",
      type: MESSAGE_TYPES.PAGE_HEARTBEAT,
      url: window.location.href
    });
  }
})();
