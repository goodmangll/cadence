/**
 * 超时处理辅助类
 */
export class TimeoutHelper {
  /**
   * 创建一个可取消的执行上下文
   */
  static createExecutionContext(timeoutMs: number) {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return {
      signal: controller.signal,
      isAborted: () => controller.signal.aborted,
      cleanup: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      },
    };
  }
}
