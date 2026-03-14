#!/bin/bash

# Cadence 开发环境管理脚本
# 用于方便地后台启动、停止、查看状态和重启开发服务器

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_DIR/.dev-server.pid"
LOG_FILE="$PROJECT_DIR/.dev-server.log"
ERROR_LOG_FILE="$PROJECT_DIR/.dev-server-error.log"

cd "$PROJECT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查进程是否在运行
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# 启动服务器
start() {
    if is_running; then
        print_warning "Server is already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi

    print_info "Building project..."
    if ! pnpm run build; then
        print_error "Build failed"
        return 1
    fi

    print_info "Starting server in background..."

    # 清空旧日志
    > "$LOG_FILE" 2>/dev/null || true
    > "$ERROR_LOG_FILE" 2>/dev/null || true

    # 后台启动
    pnpm run dev -- --local > "$LOG_FILE" 2> "$ERROR_LOG_FILE" &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # 等待一下检查是否启动成功
    sleep 2

    if kill -0 "$pid" 2>/dev/null; then
        print_success "Server started successfully (PID: $pid)"
        print_info "Log file: $LOG_FILE"
        print_info "Error log: $ERROR_LOG_FILE"
        print_info "Run 'tail -f $LOG_FILE' to see logs"
        return 0
    else
        print_error "Server failed to start"
        if [ -f "$ERROR_LOG_FILE" ]; then
            echo "--- Error log ---"
            cat "$ERROR_LOG_FILE"
        fi
        rm -f "$PID_FILE"
        return 1
    fi
}

# 停止服务器
stop() {
    if ! is_running; then
        print_warning "Server is not running"
        rm -f "$PID_FILE"
        return 0
    fi

    local pid=$(cat "$PID_FILE")
    print_info "Stopping server (PID: $pid)..."

    # 优雅停止
    kill "$pid" 2>/dev/null || true

    # 等待进程结束
    local timeout=10
    while kill -0 "$pid" 2>/dev/null && [ $timeout -gt 0 ]; do
        sleep 1
        timeout=$((timeout - 1))
    done

    # 如果还在运行，强制杀死
    if kill -0 "$pid" 2>/dev/null; then
        print_warning "Force killing server..."
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    fi

    rm -f "$PID_FILE"
    print_success "Server stopped"
}

# 查看状态
status() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        print_success "Server is running"
        echo "  PID: $pid"
        echo "  Log file: $LOG_FILE"
        echo "  Error log: $ERROR_LOG_FILE"
        echo "  PID file: $PID_FILE"

        if [ -f "$LOG_FILE" ]; then
            echo ""
            echo "=== Last 10 lines of log ==="
            tail -n 10 "$LOG_FILE"
        fi
        return 0
    else
        print_warning "Server is not running"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 重启服务器
restart() {
    print_info "Restarting server..."
    stop
    sleep 1
    start
}

# 查看日志
logs() {
    cd "$PROJECT_DIR"

    # 确保已构建
    if [ ! -d "dist" ]; then
        print_info "Building project first..."
        pnpm run build
    fi

    # 调用 cadence logs，透传所有参数
    node dist/index.js logs "$@"
}

# 查看错误日志
error_logs() {
    if [ ! -f "$ERROR_LOG_FILE" ]; then
        print_warning "Error log file does not exist"
        return 1
    fi

    if [ "$1" = "-f" ] || [ "$1" = "--follow" ]; then
        tail -f "$ERROR_LOG_FILE"
    else
        cat "$ERROR_LOG_FILE"
    fi
}

# 运行测试
test() {
    print_info "Running tests..."
    pnpm test "$@"
}

# 运行完整验证
verify() {
    print_info "Running full verification..."

    echo ""
    print_info "1. Type checking..."
    pnpm run type-check

    echo ""
    print_info "2. Linting..."
    pnpm run lint

    echo ""
    print_info "3. Building..."
    pnpm run build

    echo ""
    print_info "4. Testing..."
    pnpm test --run

    echo ""
    print_success "Verification complete!"
}

# 清理临时文件
clean() {
    print_info "Cleaning up temporary files..."
    rm -f "$PID_FILE" "$LOG_FILE" "$ERROR_LOG_FILE"
    rm -rf "$PROJECT_DIR/dist"
    print_success "Cleaned up"
}

# 显示帮助
show_help() {
    echo "Cadence 开发环境管理脚本"
    echo ""
    echo "用法: $0 [command]"
    echo ""
    echo "命令:"
    echo "  start              启动开发服务器（后台运行）"
    echo "  stop               停止开发服务器"
    echo "  restart            重启开发服务器"
    echo "  status             查看服务器状态"
    echo "  logs [args]        查看执行日志（透传参数到 cadence logs）"
    echo "  error-logs [-f]    查看错误日志（-f 实时跟随）"
    echo "  test [args]        运行测试（透传参数到 vitest）"
    echo "  verify             运行完整验证（类型检查 + lint + 构建 + 测试）"
    echo "  clean              清理临时文件和构建产物"
    echo "  help               显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start"
    echo "  $0 stop"
    echo "  $0 logs -f"
    echo "  $0 test --coverage"
}

# 主逻辑
case "${1:-help}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        shift
        logs "$@"
        ;;
    error-logs)
        error_logs "$2"
        ;;
    test)
        shift
        test "$@"
        ;;
    verify)
        verify
        ;;
    clean)
        clean
        ;;
    help)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
