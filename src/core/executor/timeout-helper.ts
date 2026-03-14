/**
 * 超时处理辅助类
 */
export class TimeoutHelper {
  /**
   * 创建一个可取消的执行上下文
   * timeoutMs = -1 表示永不超时
   */
  static createExecutionContext(timeoutMs: number) {
    let timedOut = false;
    const hasTimeout = timeoutMs !== -1;
    let timeoutId: NodeJS.Timeout | undefined;

    if (hasTimeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
      }, timeoutMs);
    }

    return {
      isTimedOut: () => timedOut,
      cleanup: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      },
    };
  }
}
