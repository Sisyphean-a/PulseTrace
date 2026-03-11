(function initOverviewStorage(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceOverviewStorage = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildOverviewStorage() {
    async function fetchLogSnapshot(params) {
      const storage = params.storage;
      const logPrefix = params.logPrefix;
      ensureGetKeys(storage);
      const keys = await storage.getKeys();
      const logKeys = keys.filter((key) => key.startsWith(logPrefix));
      if (logKeys.length === 0) {
        return {};
      }
      return storage.get(logKeys);
    }

    function ensureGetKeys(storage) {
      if (typeof storage?.getKeys !== "function") {
        throw new Error("chrome.storage.local.getKeys is required");
      }
    }

    return Object.freeze({
      fetchLogSnapshot
    });
  }
);
