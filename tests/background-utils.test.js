const { createLogStorageWriter } = require('../src/shared/background-utils');

function createStorageMock(seed = {}) {
  const state = new Map(Object.entries(seed));
  return {
    get: async (key) => ({ [key]: state.get(key) }),
    set: async (patch) => {
      Object.entries(patch).forEach(([k, v]) => state.set(k, v));
    },
    dump: () => Object.fromEntries(state.entries())
  };
}

describe('createLogStorageWriter', () => {
  test('serializes concurrent writes on same day key', async () => {
    const storage = createStorageMock({
      logs_2026_03_11: {
        'https://a.com': {
          title: 'A',
          metric1Events: [],
          metric2Heartbeats: [],
          sessions: []
        }
      }
    });
    const writer = createLogStorageWriter({ storage });

    await Promise.all([
      writer.appendMetricEvent({
        eventKey: 'metric1Events',
        payload: { timestamp: Date.UTC(2026, 2, 11, 10, 0), title: 'A', url: 'https://a.com' }
      }),
      writer.appendMetricEvent({
        eventKey: 'metric2Heartbeats',
        payload: { timestamp: Date.UTC(2026, 2, 11, 10, 1), title: 'A', url: 'https://a.com' }
      })
    ]);

    const day = storage.dump().logs_2026_03_11['https://a.com'];
    expect(day.metric1Events).toHaveLength(1);
    expect(day.metric2Heartbeats).toHaveLength(1);
  });
});
