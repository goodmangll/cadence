/**
 * 路径处理工具类
 */
export class PathUtils {
  /**
   * 展开用户主目录路径（~）
   */
  static expandHome(path: string): string {
    if (path.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        return path.replace('~', home);
      }
    }
    return path;
  }
}
