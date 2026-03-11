const { buildTopUrlDisplayGroups } = require("../src/shared/overview-grouping");

describe("buildTopUrlDisplayGroups", () => {
  test("groups by host when rule is not exact", () => {
    const groups = buildTopUrlDisplayGroups({
      entries: [
        {
          interactiveMs: 2_000,
          sessions: 1,
          systemActiveMs: 5_000,
          title: "页面A",
          url: "http://teambition.i.noahgroup.com/path/a"
        },
        {
          interactiveMs: 3_000,
          sessions: 2,
          systemActiveMs: 8_000,
          title: "页面B",
          url: "http://teambition.i.noahgroup.com/path/b"
        }
      ],
      trackingRules: [{ pattern: "*.noahgroup.*", type: "domain" }]
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].url).toBe("teambition.i.noahgroup.com/*");
    expect(groups[0].systemActiveMs).toBe(13_000);
    expect(groups[0].interactiveMs).toBe(5_000);
    expect(groups[0].sessions).toBe(3);
    expect(groups[0].title).toBe("");
    expect(groups[0].isExact).toBe(false);
  });

  test("keeps exact tracking urls as standalone entries", () => {
    const exactUrl = "http://teambition.i.noahgroup.com/path/a";
    const groups = buildTopUrlDisplayGroups({
      entries: [
        {
          interactiveMs: 1_000,
          sessions: 1,
          systemActiveMs: 4_000,
          title: "精确页面",
          url: exactUrl
        },
        {
          interactiveMs: 2_000,
          sessions: 1,
          systemActiveMs: 6_000,
          title: "普通页面",
          url: "http://teambition.i.noahgroup.com/path/b"
        }
      ],
      trackingRules: [{ pattern: exactUrl, type: "exact" }]
    });

    expect(groups).toHaveLength(2);
    const exactGroup = groups.find((group) => group.url === exactUrl);
    const hostGroup = groups.find(
      (group) => group.url === "teambition.i.noahgroup.com/*"
    );
    expect(exactGroup).toBeDefined();
    expect(hostGroup).toBeDefined();
    expect(exactGroup.title).toBe("精确页面");
    expect(hostGroup.title).toBe("");
    expect(exactGroup.isExact).toBe(true);
    expect(hostGroup.isExact).toBe(false);
  });

  test("keeps host with port as one display key", () => {
    const groups = buildTopUrlDisplayGroups({
      entries: [
        {
          interactiveMs: 1_000,
          sessions: 1,
          systemActiveMs: 3_000,
          title: "A",
          url: "http://icrm-local.test.noahgrouptest.com:8080/a"
        },
        {
          interactiveMs: 2_000,
          sessions: 2,
          systemActiveMs: 7_000,
          title: "B",
          url: "http://icrm-local.test.noahgrouptest.com:8080/b"
        }
      ],
      trackingRules: []
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].url).toBe("icrm-local.test.noahgrouptest.com:8080/*");
    expect(groups[0].sessions).toBe(3);
  });
});
