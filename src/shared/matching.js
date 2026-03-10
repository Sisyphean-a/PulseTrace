(function initMatching(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PulseTraceMatching = api;
})(
  typeof globalThis === "undefined" ? this : globalThis,
  function buildMatching() {
    const REGEX_SPECIAL_CHARS = /[.+?^${}()|[\]\\]/g;
    const WILDCARD_TOKEN = "__WILDCARD__";
    const WILDCARD_CHAR = "*";

    function isUrlTracked(params) {
      const { rules, url } = params;
      if (!isNonEmptyString(url) || !Array.isArray(rules)) {
        return false;
      }
      return rules.some((rule) => doesRuleMatchUrl({ rule, url }));
    }

    function doesRuleMatchUrl(params) {
      const { rule, url } = params;
      if (!rule || !isNonEmptyString(rule.pattern) || !isNonEmptyString(rule.type)) {
        return false;
      }
      if (rule.type === "exact") {
        return url === rule.pattern;
      }
      if (rule.type === "domain") {
        const regex = wildcardPatternToRegex({ pattern: rule.pattern });
        return regex.test(url);
      }
      return false;
    }

    function wildcardPatternToRegex(params) {
      const { pattern } = params;
      const tokenized = pattern.split(WILDCARD_CHAR).join(WILDCARD_TOKEN);
      const escaped = tokenized.replace(REGEX_SPECIAL_CHARS, "\\$&");
      const regexBody = escaped.split(WILDCARD_TOKEN).join(".*");
      return new RegExp("^" + regexBody + "$");
    }

    function isNonEmptyString(value) {
      return typeof value === "string" && value.length > 0;
    }

    return Object.freeze({
      doesRuleMatchUrl,
      isUrlTracked,
      wildcardPatternToRegex
    });
  }
);
