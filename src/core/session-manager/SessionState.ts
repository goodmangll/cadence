/**
 * Session 数据接口
 */
export interface SessionData {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;
  updatedAt: string;
}

// 导出旧名称保持兼容性
export type SessionState = SessionData;
