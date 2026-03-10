(function initBackgroundUtils(root, factory) {
  const api = factory(root.PulseTraceConstants);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceBackgroundUtils = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildBackgroundUtils(constants) {
    const { DEFAULT_SETTINGS, LOG_PREFIX } = constants;

    function createDefaultConfig() {
      return {
        settings: { ...DEFAULT_SETTINGS },
        trackingRules: []
      };
    }

    function createEmptyContext() {
      return {
        activeTabId: null,
        activeTitle: "",
        activeUrl: "",
        isBrowserFocused: false,
        isOsActive: true,
        isTracked: false
      };
    }

    function normalizeConfig(input) {
      const safe = input || {};
      const rules = Array.isArray(safe.trackingRules) ? safe.trackingRules : [];
      return {
        settings: normalizeSettings(safe.settings),
        trackingRules: rules
      };
    }

    function normalizeSettings(input) {
      const idleThreshold = Number.isInteger(input?.idleThresholdSeconds)
        ? input.idleThresholdSeconds
        : DEFAULT_SETTINGS.idleThresholdSeconds;
      const heartbeatInterval = Number.isInteger(input?.heartbeatIntervalMs)
        ? input.heartbeatIntervalMs
        : DEFAULT_SETTINGS.heartbeatIntervalMs;
      return {
        heartbeatIntervalMs: heartbeatInterval,
        idleThresholdSeconds: idleThreshold
      };
    }

    function buildDayKey(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return LOG_PREFIX + year + "_" + month + "_" + day;
    }

    async function appendMetricEvent(params) {
      const { eventKey, payload, storage } = params;
      const dayKey = buildDayKey(payload.timestamp);
      const stored = await storage.get(dayKey);
      const dayMap = stored[dayKey] || {};
      const url = payload.url;
      const currentEntry = dayMap[url] || createDayEntry(payload.title);
      const nextEvents = [...currentEntry[eventKey], payload];
      const nextEntry = {
        ...currentEntry,
        title: payload.title || currentEntry.title,
        [eventKey]: nextEvents
      };
      await storage.set({
        [dayKey]: { ...dayMap, [url]: nextEntry }
      });
    }

    async function appendSessionLog(params) {
      const { session, storage, timestamp } = params;
      const dayKey = buildDayKey(timestamp);
      const stored = await storage.get(dayKey);
      const dayMap = stored[dayKey] || {};
      const currentEntry = dayMap[session.url] || createDayEntry(session.title);
      const sessionPayload = createSessionPayload(session);
      const nextEntry = {
        ...currentEntry,
        sessions: [...currentEntry.sessions, sessionPayload],
        title: session.title || currentEntry.title
      };
      await storage.set({
        [dayKey]: { ...dayMap, [session.url]: nextEntry }
      });
    }

    function createDayEntry(title) {
      return {
        metric1Events: [],
        metric2Heartbeats: [],
        sessions: [],
        title: title || ""
      };
    }

    function createSessionPayload(session) {
      return {
        endTime: session.endTime,
        heartbeatCount: session.heartbeatCount,
        pageInteractiveDurationMs: session.pageInteractiveDurationMs,
        startTime: session.startTime,
        systemActiveDurationMs: session.systemActiveDurationMs,
        timestamp: session.endTime
      };
    }

    return Object.freeze({
      appendMetricEvent,
      appendSessionLog,
      createDefaultConfig,
      createEmptyContext,
      normalizeConfig,
      normalizeSettings
    });
  }
);
