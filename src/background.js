importScripts(
  "shared/constants.js",
  "shared/matching.js",
  "shared/tracking-engine.js",
  "shared/background-utils.js"
);
const {
  CHECKPOINT_INTERVAL_MS,
  MESSAGE_TYPES,
  STORAGE_KEYS
} = self.PulseTraceConstants;
const { isUrlTracked } = self.PulseTraceMatching;
const { createTrackingEngine } = self.PulseTraceTrackingEngine;
const {
  appendMetricEvent,
  appendSessionLog: appendSessionToStorage,
  createDefaultConfig,
  createEmptyContext,
  normalizeConfig
} = self.PulseTraceBackgroundUtils;
const WINDOW_NONE_ID = chrome.windows.WINDOW_ID_NONE;
let bootstrapPromise = null;
let checkpointTimer = null;
let config = createDefaultConfig();
let activeContext = createEmptyContext();
let engine = createTrackingEngine({
  heartbeatIntervalMs: config.settings.heartbeatIntervalMs
});

void ensureBootstrapped();

chrome.runtime.onInstalled.addListener(() => {
  void ensureBootstrapped();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureBootstrapped();
});

chrome.idle.onStateChanged.addListener((state) => {
  void withBootstrapped(async () => {
    const now = Date.now();
    await applyContextPatch({
      now,
      patch: { isOsActive: state === "active" }
    });
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  void withBootstrapped(async () => {
    const now = Date.now();
    if (windowId === WINDOW_NONE_ID) {
      await applyContextPatch({
        now,
        patch: { isBrowserFocused: false }
      });
      return;
    }
    await refreshActiveContext({ now });
  });
});

chrome.tabs.onActivated.addListener(() => {
  void withBootstrapped(async () => {
    await refreshActiveContext({ now: Date.now() });
  });
});

chrome.tabs.onUpdated.addListener((tabId) => {
  void withBootstrapped(async () => {
    if (activeContext.activeTabId !== tabId) {
      return;
    }
    await refreshActiveContext({ now: Date.now() });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_TYPES.PAGE_HEARTBEAT) {
    return false;
  }
  void withBootstrapped(async () => {
    const response = await handleHeartbeatMessage({ message, sender });
    sendResponse(response);
  }).catch((error) => {
    console.error("PulseTrace heartbeat failed:", error);
    sendResponse({ ok: false, error: String(error) });
  });
  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEYS.CONFIG]) {
    return;
  }
  void withBootstrapped(async () => {
    const nextConfig = normalizeConfig(changes[STORAGE_KEYS.CONFIG].newValue);
    const now = Date.now();
    config = nextConfig;
    rebuildEngine({ now });
    applyIdleThreshold();
    await refreshActiveContext({ now });
  });
});

chrome.runtime.onSuspend.addListener(() => {
  void withBootstrapped(async () => {
    const now = Date.now();
    const result = engine.closeOpenSession({ now });
    if (result.completedSession) {
      await appendSessionToStorage({
        session: result.completedSession,
        storage: chrome.storage.local,
        timestamp: now
      });
    }
    await persistRuntimeState({ now });
  });
});

async function withBootstrapped(fn) {
  await ensureBootstrapped();
  return fn();
}

function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  return bootstrapPromise;
}

async function bootstrap() {
  config = await loadConfig();
  await restoreRuntimeState();
  applyIdleThreshold();
  startCheckpointTimer();
  await refreshActiveContext({ now: Date.now() });
}

async function loadConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  return normalizeConfig(stored[STORAGE_KEYS.CONFIG]);
}

function applyIdleThreshold() {
  chrome.idle.setDetectionInterval(config.settings.idleThresholdSeconds);
}

function rebuildEngine(params) {
  const snapshot = engine.snapshot({ now: params.now });
  engine = createTrackingEngine({
    heartbeatIntervalMs: config.settings.heartbeatIntervalMs,
    initialState: {
      ...snapshot,
      heartbeatIntervalMs: config.settings.heartbeatIntervalMs
    }
  });
}

async function restoreRuntimeState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.RUNTIME_STATE);
  const runtimeState = stored[STORAGE_KEYS.RUNTIME_STATE];
  if (!runtimeState?.engineState) {
    rebuildEngine({ now: Date.now() });
    return;
  }
  const nextState = {
    ...runtimeState.engineState,
    heartbeatIntervalMs: config.settings.heartbeatIntervalMs
  };
  engine = createTrackingEngine({
    heartbeatIntervalMs: config.settings.heartbeatIntervalMs,
    initialState: nextState
  });
  activeContext = {
    ...createEmptyContext(),
    ...runtimeState.activeContext
  };
}

async function refreshActiveContext(params) {
  const now = params.now;
  const osState = await chrome.idle.queryState(config.settings.idleThresholdSeconds);
  const focusedWindow = await chrome.windows.getLastFocused();
  const isBrowserFocused =
    Boolean(focusedWindow?.focused) && focusedWindow.id !== WINDOW_NONE_ID;
  if (!isBrowserFocused) {
    await applyContextPatch({
      now,
      patch: {
        activeTabId: null,
        activeTitle: "",
        activeUrl: "",
        isBrowserFocused: false,
        isOsActive: osState === "active"
      }
    });
    return;
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs[0];
  await applyContextPatch({
    now,
    patch: {
      activeTabId: activeTab?.id ?? null,
      activeTitle: activeTab?.title ?? "",
      activeUrl: activeTab?.url ?? "",
      isBrowserFocused: true,
      isOsActive: osState === "active"
    }
  });
}

async function applyContextPatch(params) {
  const now = params.now;
  const nextContext = {
    ...activeContext,
    ...params.patch
  };
  nextContext.isTracked = isUrlTracked({
    rules: config.trackingRules,
    url: nextContext.activeUrl
  });
  const result = engine.applyContext({ ...nextContext, now });
  activeContext = nextContext;
  if (nextContext.activeUrl && nextContext.isTracked) {
    await appendMetricEvent({
      eventKey: "metric1Events",
      payload: {
        systemActive:
          nextContext.isTracked &&
          nextContext.isOsActive &&
          nextContext.isBrowserFocused,
        timestamp: now,
        title: nextContext.activeTitle,
        url: nextContext.activeUrl
      },
      storage: chrome.storage.local
    });
  }
  if (result.completedSession) {
    await appendSessionToStorage({
      session: result.completedSession,
      storage: chrome.storage.local,
      timestamp: now
    });
  }
  await persistRuntimeState({ now });
}

async function handleHeartbeatMessage(params) {
  const { message, sender } = params;
  const now = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
  await refreshActiveContext({ now });
  const response = engine.recordHeartbeat({
    now,
    tabId: sender.tab?.id ?? null,
    title: message.title || "",
    url: message.url || ""
  });
  if (!response.accepted) {
    return { ok: false, reason: "heartbeat-not-matched" };
  }
  await appendMetricEvent({
    eventKey: "metric2Heartbeats",
    payload: {
      tabId: sender.tab?.id ?? null,
      timestamp: now,
      title: message.title || "",
      url: message.url || ""
    },
    storage: chrome.storage.local
  });
  await persistRuntimeState({ now });
  return { ok: true };
}

async function persistRuntimeState(params) {
  const now = params.now;
  const runtimeState = {
    activeContext,
    engineState: engine.snapshot({ now }),
    savedAt: now
  };
  await chrome.storage.local.set({
    [STORAGE_KEYS.RUNTIME_STATE]: runtimeState
  });
}

function startCheckpointTimer() {
  if (checkpointTimer) {
    return;
  }
  checkpointTimer = setInterval(() => {
    void persistRuntimeState({ now: Date.now() });
  }, CHECKPOINT_INTERVAL_MS);
}
