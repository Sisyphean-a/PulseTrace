(function initOverviewAggregation(root, factory) {
  const api = factory(root.PulseTraceConstants, root.PulseTraceOverviewTimeline);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceOverviewAggregation = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildOverviewAggregation(constants, timelineApi) {
    const safeConstants = resolveConstants(constants);
    const { LOG_PREFIX } = safeConstants;
    const DAY_KEY_PATTERN = new RegExp(
      "^" + escapeRegex(LOG_PREFIX) + "(\\d{4})_(\\d{2})_(\\d{2})$"
    );
    const DAY_MS = 24 * 60 * 60 * 1_000;
    const MINUTES_PER_DAY = 24 * 60; const MS_PER_MINUTE = 60 * 1_000;
    const timelineModule = resolveTimelineApi(timelineApi);
    const { buildTimelineDay, pushTimelineItem } = timelineModule.createTimelineAdapter({
      dayDurationMs: DAY_MS,
      minuteDurationMs: MS_PER_MINUTE,
      minutesPerDay: MINUTES_PER_DAY
    });
    function parseDayKey(dayKey) {
      if (typeof dayKey !== "string") {
        return null;
      }
      const match = dayKey.match(DAY_KEY_PATTERN);
      if (!match) {
        return null;
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const timestamp = new Date(year, month - 1, day).getTime();
      if (!Number.isFinite(timestamp)) {
        return null;
      }
      return {
        dayKey,
        label: match[1] + "-" + match[2] + "-" + match[3],
        timestamp
      };
    }
    function buildOverviewModel(params) {
      const safe = params || {};
      const dayBuckets = collectDayBuckets({
        now: normalizeNow(safe.now),
        range: normalizeRange(safe.range),
        storageSnapshot: safe.storageSnapshot
      });
      const summary = createSummary();
      const topUrlMap = new Map();
      const daily = dayBuckets.map((bucket) =>
        aggregateDay({
          bucket,
          summary,
          topUrlMap
        })
      );
      const timeline = dayBuckets.map((bucket) => buildTimelineDay(bucket));
      const trackedUrlCount = summary.urlSet.size;
      const interactionRate = calculateRatio({
        denominator: summary.totalSystemActiveMs,
        numerator: summary.totalInteractiveMs
      });
      return {
        daily,
        hasData: summary.totalSessions > 0,
        summary: {
          interactionRate,
          totalDays: daily.length,
          totalInteractiveMs: summary.totalInteractiveMs,
          totalSessions: summary.totalSessions,
          totalSystemActiveMs: summary.totalSystemActiveMs,
          trackedUrlCount
        },
        timeline,
        topUrls: buildTopUrls(topUrlMap)
      };
    }
    function collectDayBuckets(params) {
      const { now, range, storageSnapshot } = params;
      const snapshot = isObject(storageSnapshot) ? storageSnapshot : {};
      const buckets = [];
      Object.entries(snapshot).forEach(([key, value]) => {
        const parsed = parseDayKey(key);
        if (!parsed || !isObject(value) || !isInRange({ now, range, timestamp: parsed.timestamp })) {
          return;
        }
        buckets.push({
          dayKey: key,
          label: parsed.label,
          timestamp: parsed.timestamp,
          urlMap: value
        });
      });
      return buckets.sort((left, right) => left.timestamp - right.timestamp);
    }
    function normalizeRange(input) {
      if (input === "all") {
        return { days: 0, type: "all" };
      }
      if (typeof input !== "string" || !input.endsWith("d")) {
        return { days: 7, type: "rolling-days" };
      }
      const days = Number.parseInt(input.slice(0, -1), 10);
      if (!Number.isInteger(days) || days <= 0) {
        return { days: 7, type: "rolling-days" };
      }
      return { days, type: "rolling-days" };
    }
    function isInRange(params) {
      const { now, range, timestamp } = params;
      if (range.type === "all") {
        return true;
      }
      const currentDayStart = getDayStart(now);
      const earliest = currentDayStart - (range.days - 1) * DAY_MS;
      const latest = currentDayStart + DAY_MS;
      return timestamp >= earliest && timestamp < latest;
    }
    function aggregateDay(params) {
      const { bucket, summary, topUrlMap } = params;
      const totals = {
        dayKey: bucket.dayKey,
        label: bucket.label,
        totalInteractiveMs: 0,
        totalSessions: 0,
        totalSystemActiveMs: 0
      };
      Object.entries(bucket.urlMap).forEach(([url, entry]) => {
        aggregateUrlEntry({
          bucket,
          entry,
          summary,
          topUrlMap,
          totals,
          url
        });
      });
      return totals;
    }
    function aggregateUrlEntry(params) {
      const { bucket, entry, summary, topUrlMap, totals, url } = params;
      const safeEntry = isObject(entry) ? entry : {};
      const sessions = Array.isArray(safeEntry.sessions) ? safeEntry.sessions : [];
      if (!hasActivity(safeEntry, sessions)) {
        return;
      }
      summary.urlSet.add(url);
      sessions.forEach((session) => {
        const normalized = normalizeSession(session);
        if (!normalized) {
          return;
        }
        totals.totalSessions += 1;
        totals.totalSystemActiveMs += normalized.systemActiveDurationMs;
        totals.totalInteractiveMs += normalized.pageInteractiveDurationMs;
        summary.totalSessions += 1;
        summary.totalSystemActiveMs += normalized.systemActiveDurationMs;
        summary.totalInteractiveMs += normalized.pageInteractiveDurationMs;
        pushTimelineItem({
          bucket,
          session: normalized,
          title: safeEntry.title,
          url
        });
        mergeTopUrl({
          summary: normalized,
          title: safeEntry.title,
          topUrlMap,
          url
        });
      });
    }
    function hasActivity(entry, sessions) {
      if (sessions.length > 0) {
        return true;
      }
      const metric1 = Array.isArray(entry.metric1Events) ? entry.metric1Events.length : 0;
      const metric2 = Array.isArray(entry.metric2Heartbeats)
        ? entry.metric2Heartbeats.length
        : 0;
      return metric1 + metric2 > 0;
    }
    function normalizeSession(session) {
      if (!isObject(session)) {
        return null;
      }
      const startTime = normalizeTimestamp(session.startTime);
      const endTime = normalizeTimestamp(session.endTime);
      if (startTime === null || endTime === null || endTime < startTime) {
        return null;
      }
      return {
        endTime,
        pageInteractiveDurationMs: normalizeDuration(session.pageInteractiveDurationMs),
        startTime,
        systemActiveDurationMs: normalizeDuration(session.systemActiveDurationMs)
      };
    }
    function normalizeDuration(value) {
      if (!Number.isFinite(value) || value < 0) {
        return 0;
      }
      return Math.floor(value);
    }
    function normalizeTimestamp(value) {
      if (!Number.isFinite(value) || value < 0) {
        return null;
      }
      return Math.floor(value);
    }
    function mergeTopUrl(params) {
      const { summary, title, topUrlMap, url } = params;
      const current = topUrlMap.get(url) || {
        interactiveMs: 0,
        sessions: 0,
        systemActiveMs: 0,
        title: "",
        url
      };
      topUrlMap.set(url, {
        interactiveMs: current.interactiveMs + summary.pageInteractiveDurationMs,
        sessions: current.sessions + 1,
        systemActiveMs: current.systemActiveMs + summary.systemActiveDurationMs,
        title: title || current.title,
        url
      });
    }
    function buildTopUrls(topUrlMap) {
      return [...topUrlMap.values()].sort((left, right) => {
        if (right.systemActiveMs !== left.systemActiveMs) {
          return right.systemActiveMs - left.systemActiveMs;
        }
        return right.interactiveMs - left.interactiveMs;
      });
    }
    function createSummary() {
      return {
        totalInteractiveMs: 0,
        totalSessions: 0,
        totalSystemActiveMs: 0,
        urlSet: new Set()
      };
    }
    function calculateRatio(params) {
      const { denominator, numerator } = params;
      if (!Number.isFinite(denominator) || denominator <= 0) {
        return 0;
      }
      return numerator / denominator;
    }
    function normalizeNow(now) {
      if (Number.isFinite(now) && now > 0) {
        return Math.floor(now);
      }
      return Date.now();
    }
    function getDayStart(timestamp) {
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }
    function isObject(value) {
      return typeof value === "object" && value !== null;
    }
    function escapeRegex(input) {
      return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function resolveTimelineApi(input) {
      if (input?.createTimelineAdapter) {
        return input;
      }
      if (typeof require === "function") {
        const loaded = require("./overview-timeline");
        if (loaded?.createTimelineAdapter) {
          return loaded;
        }
      }
      throw new Error("PulseTraceOverviewTimeline is unavailable");
    }
    function resolveConstants(input) {
      if (input?.LOG_PREFIX) {
        return input;
      }
      if (typeof require === "function") {
        const loaded = require("./constants");
        if (loaded?.LOG_PREFIX) {
          return loaded;
        }
      }
      throw new Error("PulseTraceConstants is unavailable");
    }
    return Object.freeze({
      buildOverviewModel,
      parseDayKey
    });
  }
);
