const { isUrlTracked } = require("../src/shared/matching");

const RULES = Object.freeze([
  { id: "rule-domain", pattern: "*://*.github.com/*", type: "domain" },
  {
    id: "rule-exact",
    pattern: "https://chatgpt.com/c/123",
    type: "exact"
  }
]);

describe("isUrlTracked", () => {
  test("matches wildcard domain pattern", () => {
    const tracked = isUrlTracked({
      url: "https://gist.github.com/fusi/demo",
      rules: RULES
    });

    expect(tracked).toBe(true);
  });

  test("matches exact pattern only when fully equal", () => {
    const tracked = isUrlTracked({
      url: "https://chatgpt.com/c/123",
      rules: RULES
    });
    const notTracked = isUrlTracked({
      url: "https://chatgpt.com/c/123?x=1",
      rules: RULES
    });

    expect(tracked).toBe(true);
    expect(notTracked).toBe(false);
  });

  test("returns false for non-matching url", () => {
    const tracked = isUrlTracked({
      url: "https://example.com/home",
      rules: RULES
    });

    expect(tracked).toBe(false);
  });
});
