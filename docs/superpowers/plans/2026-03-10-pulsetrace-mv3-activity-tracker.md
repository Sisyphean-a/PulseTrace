# PulseTrace MV3 Activity Tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Manifest V3 浏览器扩展，支持目标规则配置、系统活跃时长追踪、页面交互心跳追踪与按日聚合日志存储。

**Architecture:** 使用 `background` Service Worker 作为单一聚合中心，`content` 只负责节流事件并发心跳，`options` 负责规则与设置管理。会话与聚合逻辑放入共享纯函数模块，便于单测与跨脚本复用。

**Tech Stack:** Manifest V3, Chrome Extension APIs, Vanilla JS, Vitest (Node 21)

---

### Task 1: 测试基建与目录初始化

**Files:**
- Create: `package.json`
- Create: `tests/matching.test.js`
- Create: `tests/tracking-engine.test.js`

- [ ] **Step 1: 写规则匹配失败测试**

```javascript
test('matches wildcard domain pattern', () => {
  expect(isUrlTracked({ url, rules })).toBe(true);
});
```

- [ ] **Step 2: 写会话聚合失败测试**

```javascript
test('accumulates system active time and heartbeat interaction', () => {
  expect(session.systemActiveDurationMs).toBe(expected);
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `npm test`
Expected: FAIL（缺少实现模块）

### Task 2: 共享模块实现（最小通过）

**Files:**
- Create: `src/shared/constants.js`
- Create: `src/shared/matching.js`
- Create: `src/shared/tracking-engine.js`

- [ ] **Step 1: 实现最小匹配函数使匹配测试通过**
- [ ] **Step 2: 实现最小会话状态机使聚合测试通过**
- [ ] **Step 3: 运行测试确认通过**

Run: `npm test`
Expected: PASS

### Task 3: 扩展运行时集成

**Files:**
- Create: `manifest.json`
- Create: `src/background.js`
- Create: `src/content.js`

- [ ] **Step 1: 实现 `manifest`（MV3 + service_worker + content_scripts + options_page）**
- [ ] **Step 2: 在 background 中连接 `chrome.idle/windows/tabs/runtime` 事件流**
- [ ] **Step 3: 实现运行态持久化与按日日志落盘**
- [ ] **Step 4: content script 接入节流心跳与存储配置读取**

### Task 4: 配置界面实现

**Files:**
- Create: `src/options.html`
- Create: `src/options.css`
- Create: `src/options.js`

- [ ] **Step 1: 实现规则增删改 UI**
- [ ] **Step 2: 实现设置项（idleThresholdSeconds / heartbeatIntervalMs）编辑与保存**
- [ ] **Step 3: `chrome.storage.local` 读写闭环**

### Task 5: 验证与收尾

**Files:**
- Verify: `tests/*.test.js`
- Verify: `manifest.json`, `src/*.js`, `src/shared/*.js`

- [ ] **Step 1: 运行完整测试**

Run: `npm test`
Expected: PASS, 0 failed

- [ ] **Step 2: 运行扩展结构检查**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`
