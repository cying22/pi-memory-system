// scorer.ts - 重要性评分
import type { MemoryEntry } from './types';

/**
 * 计算重要性分数
 * formula: (base_weight × recency × references) / 8.0
 */
export function calculateImportance(entry: MemoryEntry): number {
  const baseWeight = getBaseWeight(entry);
  const recency = getRecencyFactor(entry);
  const references = getReferenceFactor(entry);
  
  const score = (baseWeight * recency * references) / 8.0;
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * 获取基础权重
 */
function getBaseWeight(entry: MemoryEntry): number {
  // 检查标签中的标记
  if (entry.tags.includes('永久') || entry.tags.includes('⚠️永久')) {
    return 2.0;
  }
  if (entry.tags.includes('重要') || entry.tags.includes('🔥重要')) {
    return 1.5;
  }
  if (entry.tags.includes('置顶') || entry.tags.includes('📌置顶')) {
    return 1.3;
  }
  return 1.0;
}

/**
 * 获取时间衰减因子
 * max(0.1, 1.0 - days_since_creation / 180)
 */
function getRecencyFactor(entry: MemoryEntry): number {
  const created = new Date(entry.created);
  const now = new Date();
  const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  
  return Math.max(0.1, 1.0 - daysSinceCreation / 180);
}

/**
 * 获取引用提升因子
 * log₂(ref_count + 1)
 */
function getReferenceFactor(entry: MemoryEntry): number {
  return Math.log2(entry.refCount + 1);
}

/**
 * 判断是否应该归档
 * 条目 >90 天未被引用 且 重要性 < 0.3
 */
export function shouldArchive(entry: MemoryEntry): boolean {
  // 永久和置顶条目不归档
  if (entry.tags.includes('永久') || entry.tags.includes('置顶')) {
    return false;
  }
  
  const lastReferenced = new Date(entry.lastReferenced);
  const now = new Date();
  const daysSinceReferenced = (now.getTime() - lastReferenced.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysSinceReferenced > 90 && entry.importance < 0.3;
}

/**
 * 压缩条目为一行摘要
 */
export function compressToSummary(entry: MemoryEntry): string {
  const created = new Date(entry.created).toISOString().split('T')[0];
  const archived = new Date().toISOString().split('T')[0];
  return `## ${entry.id} — ${entry.content.slice(0, 50)}${entry.content.length > 50 ? '...' : ''} (archived ${archived}, 原始: ${created})`;
}

/**
 * 计算健康分数
 */
export function calculateHealth(entries: MemoryEntry[]): {
  overall: number;
  freshness: number;
  coverage: number;
  coherence: number;
} {
  if (entries.length === 0) {
    return { overall: 100, freshness: 1, coverage: 1, coherence: 1 };
  }
  
  const now = new Date();
  
  // freshness: 30 天内被引用的条目占比
  const recentEntries = entries.filter(e => {
    const lastRef = new Date(e.lastReferenced);
    const daysSince = (now.getTime() - lastRef.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  });
  const freshness = recentEntries.length / entries.length;
  
  // coverage: 各类型条目是否都有
  const types = new Set(entries.map(e => e.type));
  const coverage = types.size / 5; // 5 种类型
  
  // coherence: 有至少一个关联的条目占比
  const linkedEntries = entries.filter(e => e.relations.length > 0);
  const coherence = linkedEntries.length / entries.length;
  
  const overall = Math.round((freshness * 0.3 + coverage * 0.3 + coherence * 0.4) * 100);
  
  return { overall, freshness, coverage, coherence };
}
