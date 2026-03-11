const { fetchLogSnapshot } = require('../src/shared/overview-storage');

describe('fetchLogSnapshot', () => {
  test('loads only log-prefixed keys', async () => {
    const storage = {
      getKeys: async () => ['pulseTraceConfig', 'logs_2026_03_11', 'logs_2026_03_10'],
      get: async (keys) => ({
        [keys[0]]: { a: 1 },
        [keys[1]]: { b: 2 }
      })
    };

    const result = await fetchLogSnapshot({ storage, logPrefix: 'logs_' });

    expect(result).toEqual({
      logs_2026_03_11: { a: 1 },
      logs_2026_03_10: { b: 2 }
    });
  });
});
