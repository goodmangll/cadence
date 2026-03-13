/**
 * 超时处理辅助类
 */
export class TimeoutHelper {
  /**
   * 创建一个可取消的执行上下文
   */
  static createExecutionContext(timeoutMs: number) {
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
    }, timeoutMs);

    return {
      isTimedOut: () => timedOut,
      cleanup: () => {
        clearTimeout(timeoutId);
      },
    };
  }
}
