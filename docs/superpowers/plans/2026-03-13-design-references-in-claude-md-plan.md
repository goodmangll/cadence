# Design References in CLAUDE.md Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Design References" section to CLAUDE.md with documentation links and reminders.

**Architecture:** Simple addition of a new section to the existing CLAUDE.md file.

**Tech Stack:** Markdown

---

## Chunk 1: Add Design References Section to CLAUDE.md

### Task 1: Read current CLAUDE.md

**Files:**
- Read: `CLAUDE.md`

- [ ] **Step 1: Read the current CLAUDE.md file**

Read the entire file to understand its structure and find the best place to add the new section.

- [ ] **Step 2: Determine insertion point**

Find a good location - either after the "开发注意事项" section or at the end of the file.

---

### Task 2: Add the new section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the "设计参考资料" section**

Insert the following content at the determined location:

```markdown
## 设计参考资料

### Agent SDK 文档
- **官方文档**: 使用 context7 查询最新文档
  ```
  @context7 query @anthropic-ai/claude-agent-sdk "message types"
  @context7 query @anthropic-ai/claude-agent-sdk "query() function"
  ```
- **网络搜索**:
  ```
  @tavily "anthropic agent sdk message types 2026"
  @tavily "@anthropic-ai/claude-agent-sdk API reference"
  ```

### 关键提醒（已知重要信息）
- **消息类型**: `system`, `assistant`, `user`, `tool_progress`, `result`
- **重要**: 工具执行的真实输出在 `user` 消息的 `tool_result` 中，**不要忽略**！
- `result` 消息只包含统计信息（费用、token 数等），不包含实际输出
- Session V2 API（`unstable_v2_createSession`）和普通 API（`query()`）的消息格式可能不同

### 设计前检查清单
每次设计涉及 Agent SDK 的功能前，请先：
1. [ ] 用 context7 查询最新的消息类型文档
2. [ ] 确认是否有新的消息类型或字段
3. [ ] 检查 Session V1 和 V2 API 的区别
4. [ ] 回顾之前的设计文档，避免重复遗漏
```

- [ ] **Step 2: Verify the changes**

Check that the section was added correctly and the markdown is valid.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Add design references section to CLAUDE.md"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-13-design-references-in-claude-md-plan.md`. Ready to execute?**
