# Design References in CLAUDE.md

**Date**: 2026-03-13
**Goal**: Add a "Design References" section to CLAUDE.md with links to official documentation and methods to find information, preventing designers from missing important details like message types.

---

## Background

Recently, we discovered that the Agent SDK Executor design document missed the `user` message type, which contains the actual tool execution output (`tool_result`). This caused:
- Incomplete message handling in code
- Output not being collected in `executeWithSessionV2()`
- Need for last-minute fixes during testing

This spec addresses the root cause: designers didn't have quick access to reference information about the Agent SDK's message format.

---

## Solution

Add a new section to `CLAUDE.md` with:
1. Links to official documentation
2. Methods to find up-to-date information (context7, tavily)
3. Key known reminders (from past mistakes)

---

## Design Details

### Section to Add to CLAUDE.md

Add this section after the "开发注意事项" section or at the end of the file:

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

---

## Location in CLAUDE.md

Add after the "开发注意事项" section (around line 200-250) or at the end of the file.

---

## Success Criteria

- [ ] New section exists in CLAUDE.md
- [ ] Contains context7 query examples
- [ ] Contains tavily search examples
- [ ] Contains reminder about `user` message type
- [ ] Easy to find when starting new designs

---

## Related Files

- Modified: `CLAUDE.md`
