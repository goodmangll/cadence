#!/bin/bash
#
# SessionStart Hook - 恢复上下文
#
# 在 Claude Code/Agent SDK 从 compact 恢复 session 时注入之前的对话上下文
#
# 环境变量：
#   CLAUDE_SESSION_SOURCE - 恢复来源（startup/resume/compact）
#   CLAUDE_SESSION_GROUP - session group 名称（由 Cadence 设置）
#
# 当 CLAUDE_SESSION_SOURCE == "compact" 时，从备份文件读取上下文并注入
#
set -e

BACKUP_DIR="$HOME/.cadence/sessions/backups"
SESSION_GROUP="${CLAUDE_SESSION_GROUP:-default}"

# 检查是否是 compaction 后的恢复
if [ "$CLAUDE_SESSION_SOURCE" = "compact" ]; then
    BACKUP_FILE="$BACKUP_DIR/${SESSION_GROUP}-pre-compact.jsonl"

    if [ -f "$BACKUP_FILE" ]; then
        # 读取备份文件并输出
        echo ""
        echo "=== Previous Session Context (pre-compact backup) ==="
        echo ""
        tail -50 "$BACKUP_FILE"
        echo ""
        echo "=== End of Previous Context ==="
    else
        echo "No pre-compact backup found"
fi
