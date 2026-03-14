# TypeScript 编译保护机制设计

**日期**: 2026-03-15
**状态**: 待审查

## 背景

当前项目存在 TypeScript 编译错误，且缺少防护机制导致问题被引入主分支。

## 问题

1. **编译错误未被发现**: staging 分支存在多个 TypeScript 类型错误
2. **缺少 CI 验证**: 无 GitHub Actions 进行自动化检查
3. **缺少本地保护**: 无 pre-push 钩子阻止有问题的代码推送

## 解决方案

### 1. 修复当前编译错误

| 文件 | 问题 | 修复方式 |
|------|------|----------|
| `src/core/task-loader.ts` | YAML 解析类型推断为 `{}` | 显式类型断言 |
| `src/core/task-manager/file-task-config.ts` | `rolloverStrategy`/`progressConfig` 位置错误 | 调整类型定义 |
| `src/core/executor/strategies/multi-turn.strategy.ts` | Agent SDK 类型不匹配 | 使用正确的 Options 类型 |
| `src/core/executor/strategies/single-turn.strategy.ts` | 同上 | 同上 |
| `src/cli/query-commands.ts` | undefined 参数 | 添加默认值 |

### 2. 添加 GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm run type-check
      - run: pnpm run lint
      - run: pnpm test --run
```

### 3. 添加 pre-push 钩子

```bash
# .husky/pre-push
pnpm run type-check
pnpm test --run
```

## 预期效果

- 推送前自动检查类型和测试
- CI 自动验证所有 PR 和推送
- 防止有编译错误的代码进入主分支
