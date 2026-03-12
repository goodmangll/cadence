#!/bin/bash
#
# PreCompact Hook - 备份 transcript
#
# 在 Claude Code/Agent SDK 触发 compaction 之前备份完整的对话记录
#
# 环境变量：
#   CLAUDE_TRANSCRIPT_PATH - 当前 transcript 文件路径
#   CLAUDE_SESSION_GROUP - session group 名称（由 Cadence 设置）
#

set -e

BACKUP_DIR="$HOME/.cadence/sessions/backups"
SESSION_GROUP="${CLAUDE_SESSION_GROUP:-default}"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份当前 transcript
if [ -n "$CLAUDE_TRANSCRIPT_PATH" ]; then
    BACKUP_FILE="$BACKUP_DIR/${SESSION_GROUP}-pre-compact.jsonl"
    cp "$CLAUDE_TRANSCRIPT_PATH" "$BACKUP_FILE"
    echo "Transcript backed up to $BACKUP_FILE"
else
    echo "Warning: CLAUDE_TRANSCRIPT_PATH not set, no backup created"
fi
