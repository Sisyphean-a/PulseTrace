(function initOverviewPage() {
  const { LOG_PREFIX, STORAGE_KEYS } = self.PulseTraceConstants;
  const { buildOverviewModel } = self.PulseTraceOverviewAggregation;
  const { buildTopUrlDisplayGroups } = self.PulseTraceOverviewGrouping;
  const { renderUrlTable } = self.PulseTraceOverviewUrlRenderer;
  const RELOAD_DEBOUNCE_MS = 250;
  const MAX_URL_ITEMS = 8;
  const state = { range: "7d" };
  const elements = captureElements();
  let reloadTimer = null;
  if (!elements.root) {
    return;
  }
  state.range = elements.range?.value || state.range;
  bindEvents();
  void refreshOverview();
  function captureElements() {
    return {
      content: document.getElementById("overview-content"),
      dailyChart: document.getElementById("daily-chart"),
      empty: document.getElementById("overview-empty"),
      range: document.getElementById("overview-range"),
      refresh: document.getElementById("overview-refresh"),
      root: document.querySelector(".overview-panel"),
      statInteractionRate: document.getElementById("stat-interaction-rate"),
      statSessions: document.getElementById("stat-total-sessions"),
      statTotalActive: document.getElementById("stat-total-active"),
      statTotalInteractive: document.getElementById("stat-total-interactive"),
      statTrackedUrls: document.getElementById("stat-tracked-urls"),
      timelineChart: document.getElementById("timeline-chart"),
      updated: document.getElementById("overview-updated"),
      urlChart: document.getElementById("url-chart")
    };
  }
  function bindEvents() {
    elements.range?.addEventListener("change", (event) => {
      state.range = event.target.value;
      void refreshOverview();
    });
    elements.refresh?.addEventListener("click", () => {
      void refreshOverview();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (!Object.keys(changes).some((key) => key.startsWith(LOG_PREFIX))) {
        return;
      }
      scheduleRefresh();
    });
  }
  function scheduleRefresh() {
    if (reloadTimer !== null) {
      return;
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void refreshOverview();
    }, RELOAD_DEBOUNCE_MS);
  }
  async function refreshOverview() {
    setRefreshState(true);
    try {
      const storageSnapshot = await chrome.storage.local.get(null);
      const model = buildOverviewModel({
        now: Date.now(),
        range: state.range,
        storageSnapshot
      });
      const groupedUrls = buildTopUrlDisplayGroups({
        entries: model.topUrls,
        trackingRules: getTrackingRules(storageSnapshot)
      });
      renderOverview({
        ...model,
        displayTopUrls: groupedUrls
      });
    } catch (error) {
      console.error("PulseTrace overview render failed:", error);
      renderError(error);
    } finally {
      setRefreshState(false);
    }
  }
  function setRefreshState(isLoading) {
    if (!elements.refresh) {
      return;
    }
    elements.refresh.disabled = isLoading;
    elements.refresh.textContent = isLoading ? "加载中..." : "刷新";
  }
  function renderOverview(model) {
    const hasData = Boolean(model?.hasData);
    if (elements.empty) {
      elements.empty.hidden = hasData;
    }
    if (elements.content) {
      elements.content.hidden = !hasData;
    }
    if (!hasData) {
      elements.updated.textContent = "当前时间范围内没有会话数据。";
      return;
    }
    renderSummary(model.summary);
    renderDailyChart(model.daily);
    renderUrlChart(model.displayTopUrls || []);
    renderTimeline(model.timeline);
    elements.updated.textContent = "更新时间：" + formatDateTime(Date.now());
  }
  function renderError(error) {
    if (elements.empty) {
      elements.empty.hidden = false;
      elements.empty.textContent = "总览加载失败：" + String(error);
    }
    if (elements.content) {
      elements.content.hidden = true;
    }
    elements.updated.textContent = "刷新失败。";
  }
  function renderSummary(summary) {
    elements.statTotalActive.textContent = formatDuration(summary.totalSystemActiveMs);
    elements.statTotalInteractive.textContent = formatDuration(summary.totalInteractiveMs);
    elements.statSessions.textContent = String(summary.totalSessions);
    elements.statTrackedUrls.textContent = String(summary.trackedUrlCount);
    elements.statInteractionRate.textContent = formatPercent(summary.interactionRate);
  }
  function renderDailyChart(dailyData) {
    const maxValue = Math.max(
      1,
      ...dailyData.map((item) =>
        Math.max(item.totalSystemActiveMs, item.totalInteractiveMs)
      )
    );
    elements.dailyChart.textContent = "";
    dailyData.forEach((item) => {
      const row = document.createElement("div");
      row.className = "metric-row";
      const label = document.createElement("span");
      label.className = "metric-label";
      label.textContent = item.label.slice(5);
      const bars = createDualBars({
        maxValue,
        primaryMs: item.totalSystemActiveMs,
        secondaryMs: item.totalInteractiveMs
      });
      const value = document.createElement("span");
      value.className = "metric-value";
      value.textContent =
        formatDuration(item.totalSystemActiveMs) +
        " / " +
        formatDuration(item.totalInteractiveMs);
      row.append(label, bars, value);
      elements.dailyChart.appendChild(row);
    });
  }
  function renderUrlChart(urls) {
    const selected = urls.slice(0, MAX_URL_ITEMS);
    const maxValue = Math.max(
      1,
      ...selected.map((item) => Math.max(item.systemActiveMs, item.interactiveMs))
    );
    elements.urlChart.textContent = "";
    if (selected.length === 0) {
      elements.urlChart.textContent = "暂无 URL 统计数据。";
      return;
    }
    renderUrlTable({
      computeRatio,
      container: elements.urlChart,
      formatDuration,
      formatPercent,
      formatUrlLabel,
      maxValue,
      rows: selected
    });
  }
  function createDualBars(params) {
    const { maxValue, primaryMs, secondaryMs } = params;
    const wrapper = document.createElement("div");
    wrapper.className = "dual-bars";
    wrapper.append(
      createBar({
        className: "bar-system",
        maxValue,
        value: primaryMs
      }),
      createBar({
        className: "bar-interactive",
        maxValue,
        value: secondaryMs
      })
    );
    return wrapper;
  }
  function createBar(params) {
    const { className, maxValue, value } = params;
    const bar = document.createElement("div");
    bar.className = "metric-bar " + className;
    const rawWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
    const width = value <= 0 ? 0 : Math.max(2, Math.min(100, Math.round(rawWidth)));
    bar.style.width = width + "%";
    return bar;
  }
  function renderTimeline(timelineData) {
    elements.timelineChart.textContent = "";
    timelineData.forEach((day) => {
      const dayRow = document.createElement("div");
      dayRow.className = "timeline-day";
      const header = document.createElement("div");
      header.className = "timeline-day-header";
      header.textContent = day.label + "（" + day.items.length + " 次会话）";
      const lane = document.createElement("div");
      lane.className = "timeline-lane";
      day.items.forEach((item) => lane.appendChild(buildTimelineBlock(item)));
      dayRow.append(header, lane);
      elements.timelineChart.appendChild(dayRow);
    });
  }
  function buildTimelineBlock(item) {
    const left = (item.startMinute / (24 * 60)) * 100;
    const span = Math.max(item.endMinute - item.startMinute, 10);
    const width = (span / (24 * 60)) * 100;
    const block = document.createElement("div");
    block.className = "timeline-block";
    block.style.left = left + "%";
    block.style.width = width + "%";
    const ratio = computeRatio({
      denominator: item.systemActiveMs,
      numerator: item.interactiveMs
    });
    const alpha = (0.3 + ratio * 0.55).toFixed(2);
    block.style.background = "rgba(11, 122, 92, " + alpha + ")";
    block.title = buildTimelineTooltip(item);
    return block;
  }
  function buildTimelineTooltip(item) {
    return (
      formatTime(item.startTime) +
      " - " +
      formatTime(item.endTime) +
      "\n" +
      formatUrlLabel(item.url) +
      "\n活跃: " +
      formatDuration(item.systemActiveMs) +
      " | 交互: " +
      formatDuration(item.interactiveMs)
    );
  }
  function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString("zh-CN");
  }
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60_000));
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours === 0) {
      return restMinutes + "分";
    }
    return hours + "小时" + restMinutes + "分";
  }
  function formatPercent(value) {
    if (!Number.isFinite(value)) {
      return "0%";
    }
    return Math.min(100, Math.round(value * 100)) + "%";
  }
  function formatUrlLabel(url) {
    if (typeof url !== "string") {
      return "";
    }
    if (!/^https?:\/\//i.test(url)) {
      return url;
    }
    try {
      const parsed = new URL(url);
      return parsed.host + parsed.pathname;
    } catch (_error) {
      return url;
    }
  }
  function computeRatio(params) {
    const { denominator, numerator } = params;
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return numerator / denominator;
  }
  function getTrackingRules(storageSnapshot) {
    const config = storageSnapshot?.[STORAGE_KEYS.CONFIG];
    if (!config || !Array.isArray(config.trackingRules)) {
      return [];
    }
    return config.trackingRules;
  }
})();
