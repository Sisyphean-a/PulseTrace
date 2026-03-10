(function initConstants(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceConstants = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildConstants() {
    const STORAGE_KEYS = Object.freeze({
      CONFIG: "pulseTraceConfig",
      RUNTIME_STATE: "pulseTraceRuntimeState"
    });

    const DEFAULT_SETTINGS = Object.freeze({
      idleThresholdSeconds: 60,
      heartbeatIntervalMs: 10_000
    });

    const LOG_PREFIX = "logs_";

    const MESSAGE_TYPES = Object.freeze({
      PAGE_HEARTBEAT: "PAGE_HEARTBEAT"
    });

    const CHECKPOINT_INTERVAL_MS = 15_000;

    return Object.freeze({
      CHECKPOINT_INTERVAL_MS,
      DEFAULT_SETTINGS,
      LOG_PREFIX,
      MESSAGE_TYPES,
      STORAGE_KEYS
    });
  }
);
