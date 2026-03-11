(function initOverviewGrouping(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceOverviewGrouping = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildOverviewGrouping() {
    function buildTopUrlDisplayGroups(params) {
      const { entries, trackingRules } = normalizeInput(params);
      const exactSet = createExactPatternSet(trackingRules);
      const groups = new Map();
      entries.forEach((entry) => mergeGroup({
        entry,
        exactSet,
        groups
      }));
      return [...groups.values()]
        .map((group) => toDisplayGroup(group))
        .sort(sortByActivity);
    }

    function normalizeInput(params) {
      return {
        entries: Array.isArray(params?.entries) ? params.entries : [],
        trackingRules: Array.isArray(params?.trackingRules) ? params.trackingRules : []
      };
    }

    function createExactPatternSet(trackingRules) {
      return new Set(
        trackingRules
          .filter((rule) => rule?.type === "exact" && isNonEmpty(rule.pattern))
          .map((rule) => rule.pattern)
      );
    }

    function mergeGroup(params) {
      const { entry, exactSet, groups } = params;
      if (!isValidEntry(entry)) {
        return;
      }
      const isExact = exactSet.has(entry.url);
      const hostKey = extractHostKey(entry.url);
      const groupKey = isExact ? "exact:" + entry.url : "host:" + hostKey;
      const current = groups.get(groupKey) || createEmptyGroup({ hostKey, isExact, url: entry.url });
      current.interactiveMs += toPositiveInt(entry.interactiveMs);
      current.sessions += toPositiveInt(entry.sessions);
      current.systemActiveMs += toPositiveInt(entry.systemActiveMs);
      if (isNonEmpty(entry.title)) {
        current.titles.add(entry.title);
      }
      groups.set(groupKey, current);
    }

    function createEmptyGroup(params) {
      const { hostKey, isExact, url } = params;
      return {
        hostKey,
        interactiveMs: 0,
        isExact,
        sessions: 0,
        systemActiveMs: 0,
        titles: new Set(),
        url
      };
    }

    function toDisplayGroup(group) {
      return {
        interactiveMs: group.interactiveMs,
        isExact: group.isExact,
        sessions: group.sessions,
        systemActiveMs: group.systemActiveMs,
        title: buildGroupTitle(group),
        url: buildDisplayUrl(group),
        urlKey: group.url
      };
    }

    function buildDisplayUrl(group) {
      if (group.isExact) {
        return group.url;
      }
      return group.hostKey + "/*";
    }

    function buildGroupTitle(group) {
      if (!group.isExact) {
        return "";
      }
      const titles = [...group.titles];
      if (titles.length === 0) {
        return "（无标题）";
      }
      return titles[0];
    }

    function extractHostKey(url) {
      try {
        return new URL(url).host || url;
      } catch (_error) {
        return url;
      }
    }

    function isValidEntry(entry) {
      return entry && isNonEmpty(entry.url);
    }

    function toPositiveInt(value) {
      if (!Number.isFinite(value) || value <= 0) {
        return 0;
      }
      return Math.floor(value);
    }

    function sortByActivity(left, right) {
      if (right.systemActiveMs !== left.systemActiveMs) {
        return right.systemActiveMs - left.systemActiveMs;
      }
      return right.interactiveMs - left.interactiveMs;
    }

    function isNonEmpty(value) {
      return typeof value === "string" && value.length > 0;
    }

    return Object.freeze({
      buildTopUrlDisplayGroups
    });
  }
);
