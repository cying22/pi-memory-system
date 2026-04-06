// dreamer.ts - 梦境周期逻辑
import { loadIndex, saveIndex, appendToArchive } from './store';
import { calculateImportance, shouldArchive, compressToSummary, calculateHealth } from './scorer';
import type { MemoryEntry, MemoryIndex, DreamReport } from './types';

/**
 * 执行梦境周期
 */
export async function runDreamCycle(scope: string = 'all'): Promise<DreamReport> {
  const index = await loadIndex();
  const now = new Date().toISOString();
  
  const report: DreamReport = {
    timestamp: now,
    scope,
    scanned: 0,
    newEntries: 0,
    updated: 0,
    archived: 0,
    health: index.health,
    insights: []
  };
  
  // 获取要处理的条目
  const entries = getEntriesByScope(index, scope);
  report.scanned = entries.length;
  
  // Phase 1: 重新计算重要性分数
  for (const entry of entries) {
    const oldImportance = entry.importance;
    entry.importance = calculateImportance(entry);
    
    if (Math.abs(oldImportance - entry.importance) > 0.1) {
      report.updated++;
    }
  }
  
  // Phase 2: 归档低重要性旧条目
  const toArchive: string[] = [];
  for (const entry of entries) {
    if (shouldArchive(entry)) {
      toArchive.push(entry.id);
    }
  }
  
  for (const id of toArchive) {
    const entry = index.entries[id];
    const summary = compressToSummary(entry);
    await appendToArchive(entry.scope, summary);
    delete index.entries[id];
    report.archived++;
  }
  
  // Phase 3: 更新健康分数
  const remainingEntries = Object.values(index.entries);
  index.health = calculateHealth(remainingEntries);
  report.health = index.health;
  
  // Phase 4: 生成洞察
  report.insights = generateInsights(index, report);
  
  // 保存索引
  index.lastDream = now;
  await saveIndex(index);
  
  return report;
}

/**
 * 根据范围获取条目
 */
function getEntriesByScope(index: MemoryIndex, scope: string): MemoryEntry[] {
  const allEntries = Object.values(index.entries);
  
  if (scope === 'all') {
    return allEntries;
  }
  
  if (scope === 'private') {
    return allEntries.filter(e => e.scope === 'private');
  }
  
  // 特定群
  return allEntries.filter(e => e.scope === `groups/${scope}`);
}

/**
 * 生成洞察
 */
function generateInsights(index: MemoryIndex, report: DreamReport): string[] {
  const insights: string[] = [];
  const entries = Object.values(index.entries);
  
  // 洞察 1: 健康度趋势
  if (report.health.overall < 60) {
    insights.push(`健康度偏低 (${report.health.overall}/100)，建议补充新记忆或清理旧条目`);
  }
  
  // 洞察 2: 孤立条目
  const isolated = entries.filter(e => e.relations.length === 0);
  if (isolated.length > entries.length * 0.5) {
    insights.push(`${isolated.length} 个条目没有关联，建议建立链接`);
  }
  
  // 洞察 3: 长期未更新的群
  const groupsByLastRef = new Map<string, Date>();
  for (const entry of entries) {
    if (entry.scope.startsWith('groups/')) {
      const groupId = entry.scope.split('/')[1];
      const lastRef = new Date(entry.lastReferenced);
      const current = groupsByLastRef.get(groupId);
      if (!current || lastRef > current) {
        groupsByLastRef.set(groupId, lastRef);
      }
    }
  }
  
  const now = new Date();
  for (const [groupId, lastRef] of groupsByLastRef) {
    const daysSince = (now.getTime() - lastRef.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 14) {
      insights.push(`群 ${groupId} 已 ${Math.round(daysSince)} 天未更新记忆`);
    }
  }
  
  return insights;
}

/**
 * 格式化梦境报告
 */
export function formatDreamReport(report: DreamReport): string {
  const lines: string[] = [
    `## 🌀 梦境报告 — ${new Date(report.timestamp).toLocaleString('zh-CN')}`,
    '',
    '### 📊 统计',
    `- 扫描: ${report.scanned} 条 | 更新: ${report.updated} | 归档: ${report.archived}`,
    '',
    `### 🧠 健康度: ${report.health.overall}/100`,
    `- 新鲜度: ${Math.round(report.health.freshness * 100)}%`,
    `- 覆盖度: ${Math.round(report.health.coverage * 100)}%`,
    `- 连贯性: ${Math.round(report.health.coherence * 100)}%`,
  ];
  
  if (report.insights.length > 0) {
    lines.push('', '### 🔮 洞察');
    for (const insight of report.insights) {
      lines.push(`- ${insight}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 检查是否需要自动触发梦境
 */
export async function shouldAutoDream(): Promise<boolean> {
  const index = await loadIndex();
  
  // 距离上次梦境超过 24 小时
  if (index.lastDream) {
    const lastDream = new Date(index.lastDream);
    const now = new Date();
    const hoursSince = (now.getTime() - lastDream.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      return false;
    }
  }
  
  // 未整理条目 > 20
  const entries = Object.values(index.entries);
  const recentEntries = entries.filter(e => {
    const created = new Date(e.created);
    const lastDream = index.lastDream ? new Date(index.lastDream) : new Date(0);
    return created > lastDream;
  });
  
  return recentEntries.length > 20;
}
