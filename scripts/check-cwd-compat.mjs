/**
 * dsh 0.2.1-alpha.1 起宿主不再注册 `cwd` 提示词变量，当前目录改由
 * working-directory 的必需 runtime context 提供。这个脚本锁住两条兼容路径：
 *   - 新宿主（variables 只有 provider/model）：不产生任何 `{{cwd}}`
 *   - 老宿主（variables 仍含 cwd）：保留原 `persona-suffix` 行为
 *
 * 用法：node scripts/test-cwd-compat.mjs
 */
import assert from "node:assert/strict";
import {
  overlayOfficialIdentity,
  rewritePromptAssembly,
  escapeDshInterpolation,
} from "../lib/identity.js";

const modelOnly = { model: "deepseek-v4", provider: "mock" };
const withCwd = { ...modelOnly, cwd: "/private/tmp" };

// 1) 新宿主：旧 suffix 里的目录句被清空，不补回。
const sanitized = overlayOfficialIdentity([
  { name: "deployment:persona-prefix", text: "You are a coding agent powered by the {{model}} model." },
  { name: "deployment:persona-suffix", text: "Your working directory is {{cwd}}." },
], { hasCwdVariable: false });
assert.equal(sanitized.some((section) => section.text.includes("{{cwd}}")), false);
assert.equal(sanitized[0].text, "");
assert.equal(sanitized[1].text, "");

// 2) 新宿主：整个 assembly 不残留未注册变量。
const rewritten = rewritePromptAssembly({
  sections: [
    { name: "harness:identity", text: "You are an AI agent powered by DeepSeek Harness." },
    { name: "deployment:persona-prefix", text: "You are a coding agent powered by the {{model}} model." },
    { name: "deployment:persona-suffix", text: "Your working directory is {{cwd}}." },
  ],
  contexts: [],
  tools: [],
  variables: modelOnly,
}, "Operator body with {{cwd}} and {{model}}.");
assert.equal(rewritten.sections.some((section) => section.text.includes("{{cwd}}")), false);
assert.equal(
  rewritten.sections.filter((section) => section.name === "deployment:persona-suffix")
    .every((section) => section.text === ""),
  true,
);
assert.equal(rewritten.sections[0].text, "Operator body with { {cwd}} and {{model}}.");

// 3) 老宿主：仍注册 cwd 时保留原目录句。
const legacy = rewritePromptAssembly({
  sections: [{ name: "deployment:persona-suffix", text: "Your working directory is {{cwd}}." }],
  contexts: [],
  tools: [],
  variables: withCwd,
}, "inject");
assert.equal(
  legacy.sections.find((section) => section.name === "deployment:persona-suffix").text,
  "Your working directory is {{cwd}}.",
);

// 4) 用户自定义 suffix 不被误删。
const custom = overlayOfficialIdentity([
  { name: "deployment:persona-suffix", text: "Custom operator suffix." },
], { hasCwdVariable: false });
assert.deepEqual(custom, [{ name: "deployment:persona-suffix", text: "Custom operator suffix." }]);

// 5) 默认转义只放行已注册变量。
assert.equal(escapeDshInterpolation("{{cwd}} {{model}}"), "{ {cwd}} {{model}}");

console.log("cwd compatibility: OK");
