(function initTrackingEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceTrackingEngine = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildTrackingEngine() {
    const DEFAULT_HEARTBEAT_MS = 10_000;
    const MIN_TIMESTAMP_MS = 0;
    const ZERO_DURATION_MS = 0;

    function createTrackingEngine(params) {
      const normalized = normalizeCreateParams(params);
      const state = createState({ initialState: normalized.initialState });
      state.heartbeatIntervalMs = normalized.heartbeatIntervalMs;
      return Object.freeze({
        applyContext: (context) => applyContextUpdate({ context, state }),
        closeOpenSession: (request) => closeOpenSessionUpdate({ request, state }),
        getState: () => cloneState(state),
        recordHeartbeat: (payload) => recordHeartbeatUpdate({ payload, state }),
        snapshot: (request) => snapshotState({ request, state })
      });
    }

    function applyContextUpdate(params) {
      const { context, state } = params;
      const now = normalizeNow(context.now);
      advanceSystemDuration({ now, state });
      const completedSession = closeIfNeeded({ context, now, state });
      updateContextState({ context, state });
      openIfNeeded({ context, now, state });
      state.lastContextUpdateAt = now;
      return {
        completedSession,
        state: cloneState(state)
      };
    }

    function recordHeartbeatUpdate(params) {
      const { payload, state } = params;
      const now = normalizeNow(payload.now);
      advanceSystemDuration({ now, state });
      const session = state.currentSession;
      const accepted = doesHeartbeatMatchSession({ payload, session });
      if (accepted) {
        session.heartbeatCount += 1;
        session.title = payload.title || session.title;
      }
      state.lastContextUpdateAt = now;
      return { accepted, state: cloneState(state) };
    }

    function snapshotState(params) {
      const { request, state } = params;
      const now = normalizeNow(request.now);
      advanceSystemDuration({ now, state });
      state.lastContextUpdateAt = now;
      return cloneState(state);
    }

    function closeOpenSessionUpdate(params) {
      const { request, state } = params;
      const now = normalizeNow(request.now);
      advanceSystemDuration({ now, state });
      const completedSession = finalizeCurrentSession({ now, state });
      state.lastContextUpdateAt = now;
      return { completedSession, state: cloneState(state) };
    }

    function closeIfNeeded(params) {
      const { context, now, state } = params;
      const session = state.currentSession;
      if (!session) {
        return null;
      }
      const isSameTab = session.tabId === context.activeTabId;
      const isSameUrl = session.url === context.activeUrl;
      const shouldClose = !context.isTracked || !isSameTab || !isSameUrl;
      if (!shouldClose) {
        return null;
      }
      return finalizeCurrentSession({ now, state });
    }

    function openIfNeeded(params) {
      const { context, now, state } = params;
      if (!context.isTracked || !isValidTabId(context.activeTabId)) {
        return;
      }
      if (state.currentSession) {
        state.currentSession.title = context.activeTitle || state.currentSession.title;
        return;
      }
      state.currentSession = createSession({ context, now });
    }

    function updateContextState(params) {
      const { context, state } = params;
      state.activeTabId = context.activeTabId;
      state.activeTitle = context.activeTitle || "";
      state.activeUrl = context.activeUrl || "";
      state.isBrowserFocused = Boolean(context.isBrowserFocused);
      state.isOsActive = Boolean(context.isOsActive);
      state.isTracked = Boolean(context.isTracked);
    }

    function finalizeCurrentSession(params) {
      const { now, state } = params;
      if (!state.currentSession) {
        return null;
      }
      const completed = {
        ...state.currentSession,
        endTime: now,
        pageInteractiveDurationMs:
          state.currentSession.heartbeatCount * state.heartbeatIntervalMs
      };
      state.currentSession = null;
      return completed;
    }

    function advanceSystemDuration(params) {
      const { now, state } = params;
      if (!state.currentSession) {
        return;
      }
      const deltaMs = now - state.lastContextUpdateAt;
      if (deltaMs <= ZERO_DURATION_MS || !isSystemActive(state)) {
        return;
      }
      state.currentSession.systemActiveDurationMs += deltaMs;
    }

    function isSystemActive(state) {
      return (
        state.isTracked &&
        state.isOsActive &&
        state.isBrowserFocused &&
        Boolean(state.currentSession)
      );
    }

    function doesHeartbeatMatchSession(params) {
      const { payload, session } = params;
      if (!session) {
        return false;
      }
      const isSameTab = payload.tabId === session.tabId;
      const isSameUrl = payload.url === session.url;
      return isSameTab && isSameUrl;
    }

    function createSession(params) {
      const { context, now } = params;
      return {
        endTime: now,
        heartbeatCount: 0,
        startTime: now,
        systemActiveDurationMs: ZERO_DURATION_MS,
        tabId: context.activeTabId,
        title: context.activeTitle || "",
        url: context.activeUrl || ""
      };
    }

    function normalizeCreateParams(params) {
      const safe = params || {};
      return {
        heartbeatIntervalMs: normalizeHeartbeat(safe.heartbeatIntervalMs),
        initialState: safe.initialState || null
      };
    }

    function createState(params) {
      const { initialState } = params;
      const baseState = {
        activeTabId: null,
        activeTitle: "",
        activeUrl: "",
        currentSession: null,
        heartbeatIntervalMs: DEFAULT_HEARTBEAT_MS,
        isBrowserFocused: false,
        isOsActive: true,
        isTracked: false,
        lastContextUpdateAt: MIN_TIMESTAMP_MS
      };
      if (!initialState) {
        return baseState;
      }
      return {
        ...baseState,
        ...initialState,
        currentSession: initialState.currentSession
          ? { ...initialState.currentSession }
          : null
      };
    }

    function normalizeHeartbeat(value) {
      return Number.isFinite(value) && value > ZERO_DURATION_MS
        ? value
        : DEFAULT_HEARTBEAT_MS;
    }

    function normalizeNow(now) {
      if (Number.isFinite(now) && now >= MIN_TIMESTAMP_MS) {
        return now;
      }
      return Date.now();
    }

    function isValidTabId(value) {
      return Number.isInteger(value) && value >= MIN_TIMESTAMP_MS;
    }

    function cloneState(state) {
      return {
        ...state,
        currentSession: state.currentSession ? { ...state.currentSession } : null
      };
    }

    return Object.freeze({
      createTrackingEngine
    });
  }
);
