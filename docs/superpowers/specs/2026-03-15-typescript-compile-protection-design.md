# TypeScript 编译保护机制设计

**日期**: 2026-03-15
**状态**: 已批准

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
| `src/core/task-loader.ts` | YAML 解析类型推断为 `{}` | 显式类型断言 `as Record<string, unknown>` |
| `src/core/task-manager/file-task-config.ts` | `rolloverStrategy`/`progressConfig` 在 `execution` 内而非顶层 | 移动 RawTaskConfig.execution 内的字段到顶层 |
| `src/core/executor/strategies/multi-turn.strategy.ts` | Agent SDK 类型不匹配 | 检查 SDK 类型定义，使用正确的 Options |
| `src/core/executor/strategies/single-turn.strategy.ts` | 同上 | 同上 |
| `src/cli/query-commands.ts` | undefined 参数 | 添加默认值 `\|\| 10` |

### 2. 添加 GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run type-check
      - run: pnpm run lint
      - run: pnpm test --run
```

**说明**:
- 仅在 main、staging 分支 push 和 PR 时运行
- 使用 `--frozen-lockfile` 确保依赖版本一致性
- 缓存 pnpm 依赖加速 CI

### 3. 添加 pre-push 钩子

```bash
#!/bin/sh
# .husky/pre-push

command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found"; exit 1; }

pnpm run type-check
pnpm test --run
```

**安装方式**:
```bash
# 确保 husky 已安装
pnpm add -D husky

# 初始化 husky
npx husky init

# 创建 pre-push 钩子
echo 'pnpm run type-check && pnpm test --run' > .husky/pre-push
chmod +x .husky/pre-push
```

**说明**:
- 使用 pnpm 命令确保 Windows 兼容性（通过 corepack 或全局安装）
- 只在本地执行，不影响 CI 流程

## 验收标准

1. ✅ `pnpm run type-check` 无错误
2. ✅ `pnpm test --run` 通过
3. ✅ GitHub Actions CI 配置正确
4. ✅ pre-push 钩子可正常工作

## 与 Git 工作流集成

- CI 在 push 到 main/staging 和 PR 时自动运行
- pre-push 钩子在本地推送前拦截有问题的代码
- 开发者应在本地验证通过后再推送
