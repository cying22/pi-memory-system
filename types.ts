// types.ts - 记忆系统类型定义

/**
 * 事实类型
 */
export type FactType = 'decision' | 'person' | 'task' | 'fact' | 'procedure';

/**
 * 单条事实
 */
export interface Fact {
  type: FactType;
  content: string;
  importance: number;  // 0.0 - 1.0
  tags: string[];
}

/**
 * 记忆条目（存储格式）
 */
export interface MemoryEntry {
  id: string;           // mem_001, mem_002, ...
  type: FactType;
  scope: string;        // 'private' 或 'groups/{group_id}'
  content: string;
  created: string;      // ISO date
  lastReferenced: string;
  importance: number;
  refCount: number;
  tags: string[];
  relations: string[];  // 关联的 mem_id 列表
}

/**
 * 全局索引
 */
export interface MemoryIndex {
  version: string;
  lastDream: string | null;
  nextId: number;
  entries: Record<string, MemoryEntry>;
  health: HealthScore;
}

/**
 * 健康分数
 */
export interface HealthScore {
  overall: number;      // 0-100
  freshness: number;    // 0-1
  coverage: number;     // 0-1
  coherence: number;    // 0-1
}

/**
 * 会话上下文
 */
export interface ChatContext {
  isPrivate: boolean;
  groupId: string | null;
  scope: string;        // 'private' 或 'groups/{group_id}'
}

/**
 * 提取结果
 */
export interface ExtractResult {
  facts: Fact[];
}

/**
 * 梦境报告
 */
export interface DreamReport {
  timestamp: string;
  scope: string;
  scanned: number;
  newEntries: number;
  updated: number;
  archived: number;
  health: HealthScore;
  insights: string[];
}
