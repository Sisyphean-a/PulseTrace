const { buildOverviewModel, parseDayKey } = require("../src/shared/overview-aggregation");

function createSession(input) {
  return {
    startTime: input.startTime,
    endTime: input.endTime,
    systemActiveDurationMs: input.systemActiveDurationMs,
    pageInteractiveDurationMs: input.pageInteractiveDurationMs,
    heartbeatCount: input.heartbeatCount ?? 0,
    timestamp: input.endTime
  };
}

describe("parseDayKey", () => {
  test("returns a date stamp for valid day keys", () => {
    const result = parseDayKey("logs_2026_03_11");

    expect(result).not.toBeNull();
    expect(result.dayKey).toBe("logs_2026_03_11");
    expect(result.label).toBe("2026-03-11");
  });

  test("returns null for invalid day keys", () => {
    const invalid = parseDayKey("pulseTraceConfig");

    expect(invalid).toBeNull();
  });
});

describe("buildOverviewModel", () => {
  const snapshot = {
    logs_2026_03_10: {
      "https://github.com/org/repo": {
        title: "Repo",
        sessions: [
          createSession({
            startTime: Date.UTC(2026, 2, 10, 2, 0),
            endTime: Date.UTC(2026, 2, 10, 2, 45),
            systemActiveDurationMs: 30 * 60 * 1000,
            pageInteractiveDurationMs: 20 * 60 * 1000
          })
        ],
        metric1Events: [],
        metric2Heartbeats: []
      }
    },
    logs_2026_03_11: {
      "https://chat.openai.com": {
        title: "Chat",
        sessions: [
          createSession({
            startTime: Date.UTC(2026, 2, 11, 9, 30),
            endTime: Date.UTC(2026, 2, 11, 10, 0),
            systemActiveDurationMs: 25 * 60 * 1000,
            pageInteractiveDurationMs: 15 * 60 * 1000
          }),
          createSession({
            startTime: Date.UTC(2026, 2, 11, 14, 0),
            endTime: Date.UTC(2026, 2, 11, 14, 40),
            systemActiveDurationMs: 35 * 60 * 1000,
            pageInteractiveDurationMs: 12 * 60 * 1000
          })
        ],
        metric1Events: [],
        metric2Heartbeats: []
      }
    },
    pulseTraceConfig: {
      trackingRules: []
    }
  };

  test("aggregates totals across days", () => {
    const model = buildOverviewModel({
      storageSnapshot: snapshot,
      now: Date.UTC(2026, 2, 11, 15, 0),
      range: "all"
    });

    expect(model.summary.totalSessions).toBe(3);
    expect(model.summary.totalSystemActiveMs).toBe(90 * 60 * 1000);
    expect(model.summary.totalInteractiveMs).toBe(47 * 60 * 1000);
    expect(model.summary.trackedUrlCount).toBe(2);
    expect(model.daily).toHaveLength(2);
    expect(model.topUrls[0].url).toBe("https://chat.openai.com");
    expect(model.timeline[1].items).toHaveLength(2);
  });

  test("applies rolling-day filter", () => {
    const model = buildOverviewModel({
      storageSnapshot: snapshot,
      now: Date.UTC(2026, 2, 11, 15, 0),
      range: "1d"
    });

    expect(model.summary.totalSessions).toBe(2);
    expect(model.daily).toHaveLength(1);
    expect(model.daily[0].dayKey).toBe("logs_2026_03_11");
    expect(model.summary.trackedUrlCount).toBe(1);
  });
});
