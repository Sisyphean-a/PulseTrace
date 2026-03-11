(function initBackgroundUtils(root, factory) {
  const api = factory(root.PulseTraceConstants);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceBackgroundUtils = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildBackgroundUtils(constants) {
    const safeConstants = resolveConstants(constants);
    const { DEFAULT_SETTINGS, LOG_PREFIX } = safeConstants;
    const EMPTY_DAY_MAP = Object.freeze({});

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

    function createLogStorageWriter(params) {
      const storage = params.storage;
      let queue = Promise.resolve();
      return Object.freeze({
        appendMetricEvent: (input) => {
          queue = queue.then(() => appendMetricEventInternal({
            eventKey: input.eventKey,
            payload: input.payload,
            storage
          }));
          return queue;
        },
        appendSessionLog: (input) => {
          queue = queue.then(() => appendSessionLogInternal({
            session: input.session,
            storage,
            timestamp: input.timestamp
          }));
          return queue;
        }
      });
    }

    async function appendMetricEvent(params) {
      const writer = createLogStorageWriter({ storage: params.storage });
      await writer.appendMetricEvent({
        eventKey: params.eventKey,
        payload: params.payload
      });
    }

    async function appendSessionLog(params) {
      const writer = createLogStorageWriter({ storage: params.storage });
      await writer.appendSessionLog({
        session: params.session,
        timestamp: params.timestamp
      });
    }

    async function appendMetricEventInternal(params) {
      const { eventKey, payload, storage } = params;
      const dayKey = buildDayKey(payload.timestamp);
      const dayMap = await loadDayMap({ dayKey, storage });
      const url = payload.url;
      const currentEntry = dayMap[url] || createDayEntry(payload.title);
      const nextEntry = {
        ...currentEntry,
        title: payload.title || currentEntry.title,
        [eventKey]: [...currentEntry[eventKey], payload]
      };
      await storage.set({ [dayKey]: { ...dayMap, [url]: nextEntry } });
    }

    async function appendSessionLogInternal(params) {
      const { session, storage, timestamp } = params;
      const dayKey = buildDayKey(timestamp);
      const dayMap = await loadDayMap({ dayKey, storage });
      const currentEntry = dayMap[session.url] || createDayEntry(session.title);
      const sessionPayload = createSessionPayload(session);
      const nextEntry = {
        ...currentEntry,
        sessions: [...currentEntry.sessions, sessionPayload],
        title: session.title || currentEntry.title
      };
      await storage.set({ [dayKey]: { ...dayMap, [session.url]: nextEntry } });
    }

    async function loadDayMap(params) {
      const stored = await params.storage.get(params.dayKey);
      return stored[params.dayKey] || EMPTY_DAY_MAP;
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
      createLogStorageWriter,
      createDefaultConfig,
      createEmptyContext,
      normalizeConfig,
      normalizeSettings
    });

    function resolveConstants(input) {
      if (input?.DEFAULT_SETTINGS && input?.LOG_PREFIX) {
        return input;
      }
      if (typeof require === "function") {
        const loaded = require("./constants");
        if (loaded?.DEFAULT_SETTINGS && loaded?.LOG_PREFIX) {
          return loaded;
        }
      }
      throw new Error("PulseTraceConstants is unavailable");
    }
  }
);
