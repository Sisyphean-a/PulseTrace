const { createTrackingEngine } = require("../src/shared/tracking-engine");

const HEARTBEAT_INTERVAL_MS = 10_000;

function buildContext(overrides) {
  return {
    now: 0,
    activeTabId: 1,
    activeUrl: "https://github.com/org/repo",
    activeTitle: "Repo",
    isOsActive: true,
    isBrowserFocused: true,
    isTracked: true,
    ...overrides
  };
}

describe("createTrackingEngine", () => {
  test("accumulates metric1 active duration across context updates", () => {
    const engine = createTrackingEngine({
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS
    });

    engine.applyContext(buildContext({ now: 1_000 }));
    engine.applyContext(buildContext({ now: 6_000 }));
    const result = engine.applyContext(
      buildContext({
        now: 7_000,
        isTracked: false,
        activeUrl: "https://example.com"
      })
    );

    expect(result.completedSession).not.toBeNull();
    expect(result.completedSession.systemActiveDurationMs).toBe(6_000);
    expect(result.completedSession.startTime).toBe(1_000);
    expect(result.completedSession.endTime).toBe(7_000);
  });

  test("stops metric1 accumulation during idle period", () => {
    const engine = createTrackingEngine({
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS
    });

    engine.applyContext(buildContext({ now: 0 }));
    engine.applyContext(buildContext({ now: 5_000, isOsActive: false }));
    engine.applyContext(buildContext({ now: 9_000, isOsActive: true }));
    const result = engine.applyContext(
      buildContext({
        now: 12_000,
        isTracked: false,
        activeUrl: "https://example.com"
      })
    );

    expect(result.completedSession.systemActiveDurationMs).toBe(8_000);
  });

  test("aggregates metric2 interaction duration from heartbeat count", () => {
    const engine = createTrackingEngine({
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS
    });

    engine.applyContext(buildContext({ now: 100 }));
    engine.recordHeartbeat({
      now: 1_500,
      tabId: 1,
      url: "https://github.com/org/repo",
      title: "Repo"
    });
    engine.recordHeartbeat({
      now: 5_000,
      tabId: 1,
      url: "https://github.com/org/repo",
      title: "Repo"
    });

    const result = engine.applyContext(
      buildContext({
        now: 10_000,
        isTracked: false,
        activeUrl: "https://example.com"
      })
    );

    expect(result.completedSession.heartbeatCount).toBe(2);
    expect(result.completedSession.pageInteractiveDurationMs).toBe(20_000);
  });
});
