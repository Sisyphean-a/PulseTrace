(function initOverviewTimeline(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceOverviewTimeline = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildOverviewTimeline() {
    function createTimelineAdapter(params) {
      const config = normalizeTimelineConfig(params);
      return Object.freeze({
        buildTimelineDay: (bucket) => buildTimelineDay({ bucket, config }),
        pushTimelineItem
      });
    }

    function normalizeTimelineConfig(params) {
      return {
        dayDurationMs: params?.dayDurationMs || 24 * 60 * 60 * 1_000,
        minuteDurationMs: params?.minuteDurationMs || 60 * 1_000,
        minutesPerDay: params?.minutesPerDay || 24 * 60
      };
    }

    function pushTimelineItem(input) {
      const { bucket, session, title, url } = input;
      if (!Array.isArray(bucket.timelineItems)) {
        bucket.timelineItems = [];
      }
      bucket.timelineItems.push({
        endTime: session.endTime,
        interactiveMs: session.pageInteractiveDurationMs,
        startTime: session.startTime,
        systemActiveMs: session.systemActiveDurationMs,
        title: title || "",
        url
      });
    }

    function buildTimelineDay(params) {
      const { bucket, config } = params;
      const source = Array.isArray(bucket.timelineItems) ? bucket.timelineItems : [];
      const sorted = [...source].sort((left, right) => left.startTime - right.startTime);
      return {
        dayKey: bucket.dayKey,
        items: sorted.map((item) =>
          toTimelineItem({
            dayStart: bucket.timestamp,
            item,
            config
          })
        ),
        label: bucket.label
      };
    }

    function toTimelineItem(params) {
      const { config, dayStart, item } = params;
      const dayEnd = dayStart + config.dayDurationMs;
      const startTime = clamp(item.startTime, dayStart, dayEnd);
      const endTime = clamp(item.endTime, dayStart, dayEnd);
      return {
        endMinute: toMinute({ config, offsetMs: endTime - dayStart }),
        endTime,
        interactiveMs: item.interactiveMs,
        startMinute: toMinute({ config, offsetMs: startTime - dayStart }),
        startTime,
        systemActiveMs: item.systemActiveMs,
        title: item.title,
        url: item.url
      };
    }

    function toMinute(params) {
      const { config, offsetMs } = params;
      const value = Math.floor(offsetMs / config.minuteDurationMs);
      return clamp(value, 0, config.minutesPerDay);
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, max));
    }

    return Object.freeze({
      createTimelineAdapter
    });
  }
);
