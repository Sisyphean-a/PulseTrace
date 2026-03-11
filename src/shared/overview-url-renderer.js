(function initOverviewUrlRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceOverviewUrlRenderer = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildOverviewUrlRenderer() {
    function renderUrlTable(params) {
      const {
        container,
        maxValue,
        rows,
        formatDuration,
        formatPercent,
        computeRatio,
        formatUrlLabel
      } = params;
      container.appendChild(buildHeader());
      rows.forEach((item) => {
        const stats = buildUrlStats({
          computeRatio,
          formatDuration,
          formatPercent,
          item
        });
        container.appendChild(
          buildRow({
            maxValue,
            stats,
            title: resolveTitle(item),
            url: item.url,
            urlLabel: formatUrlLabel(item.url),
            value: item
          })
        );
      });
    }

    function buildHeader() {
      const header = document.createElement("div");
      header.className = "url-table-head";
      header.append(
        createCell("url-cell url-col-url", "URL"),
        createCell("url-cell url-col-title", "页面标题"),
        createCell("url-cell url-col-stats", "统计数据")
      );
      return header;
    }

    function buildRow(params) {
      const { maxValue, stats, title, url, urlLabel, value } = params;
      const row = document.createElement("div");
      row.className = "url-table-row";
      row.append(
        createCell("url-cell url-col-url", urlLabel, url),
        createCell("url-cell url-col-title", title),
        buildStatsCell({
          maxValue,
          stats,
          value
        })
      );
      return row;
    }

    function createCell(className, text, title) {
      const cell = document.createElement("span");
      cell.className = className;
      cell.textContent = text;
      cell.title = title || text;
      return cell;
    }

    function buildUrlStats(params) {
      const { computeRatio, formatDuration, formatPercent, item } = params;
      const ratio = formatPercent(computeRatio({
        denominator: item.systemActiveMs,
        numerator: item.interactiveMs
      }));
      return (
        "活跃 " +
        formatDuration(item.systemActiveMs) +
        " | 交互 " +
        formatDuration(item.interactiveMs) +
        " | 会话 " +
        item.sessions +
        " | 交互率 " +
        ratio
      );
    }

    function resolveTitle(item) {
      if (!item?.isExact) {
        return "";
      }
      if (typeof item.title === "string" && item.title.length > 0) {
        return item.title;
      }
      return "（无标题）";
    }

    function buildStatsCell(params) {
      const { maxValue, stats, value } = params;
      const cell = document.createElement("div");
      cell.className = "url-cell url-col-stats";
      const text = document.createElement("div");
      text.className = "url-stats-text";
      text.textContent = stats;
      const bars = document.createElement("div");
      bars.className = "url-stats-bars";
      bars.append(
        createBar("url-stats-bar bar-system", value.systemActiveMs, maxValue),
        createBar("url-stats-bar bar-interactive", value.interactiveMs, maxValue)
      );
      cell.append(text, bars);
      return cell;
    }

    function createBar(className, value, maxValue) {
      const bar = document.createElement("div");
      bar.className = className;
      const rawWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
      const width = value <= 0 ? 0 : Math.max(2, Math.min(100, Math.round(rawWidth)));
      bar.style.width = width + "%";
      return bar;
    }

    return Object.freeze({
      renderUrlTable
    });
  }
);
