// context.ts - 上下文注入
import { loadIndex, listGroupDirs, loadGroupMeta } from './store';
import type { ChatContext, MemoryEntry } from './types';

/**
 * 构建全局记忆摘要（私聊用）
 */
export async function buildGlobalSummary(): Promise<string> {
  const index = await loadIndex();
  const entries = Object.values(index.entries);
  const groupDirs = await listGroupDirs();
  
  const lines: string[] = [
    '## 📚 全局记忆摘要',
    '',
    '### 各群概况'
  ];
  
  // 按群分组
  const groupsMap = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    if (entry.scope.startsWith('groups/')) {
      const groupId = entry.scope.split('/')[1];
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, []);
      }
      groupsMap.get(groupId)!.push(entry);
    }
  }
  
  // 生成各群摘要
  for (const [groupId, groupEntries] of groupsMap) {
    const meta = await loadGroupMeta(groupId);
    const groupName = meta?.name || groupId;
    
    // 按时间排序，取最新的
    const sorted = groupEntries.sort((a, b) => 
      new Date(b.lastReferenced).getTime() - new Date(a.lastReferenced).getTime()
    );
    const recent = sorted.slice(0, 3);
    
    lines.push(`- **${groupName}** (${groupEntries.length}条记忆)`);
    if (recent.length > 0) {
      lines.push(`  - 最近：${recent[0].content.slice(0, 50)} (${formatDate(recent[0].lastReferenced)})`);
    }
  }
  
  // 私聊记忆
  const privateEntries = entries.filter(e => e.scope === 'private');
  if (privateEntries.length > 0) {
    lines.push('', '### 个人记忆');
    const recent = privateEntries
      .sort((a, b) => new Date(b.lastReferenced).getTime() - new Date(a.lastReferenced).getTime())
      .slice(0, 3);
    for (const entry of recent) {
      lines.push(`- ${entry.content.slice(0, 50)} (${formatDate(entry.lastReferenced)})`);
    }
  }
  
  // 跨群关注
  const tasks = entries.filter(e => e.type === 'task');
  const highPriorityTasks = tasks.filter(e => e.importance >= 0.5);
  if (highPriorityTasks.length > 0) {
    lines.push('', '### 跨群关注');
    lines.push(`- 🔥 ${highPriorityTasks.length} 个高优任务`);
  }
  
  return lines.join('\n');
}

/**
 * 构建群记忆摘要（群聊用）
 */
export async function buildGroupSummary(groupId: string): Promise<string> {
  const index = await loadIndex();
  const entries = Object.values(index.entries)
    .filter(e => e.scope === `groups/${groupId}`);
  
  const meta = await loadGroupMeta(groupId);
  const groupName = meta?.name || groupId;
  
  const lines: string[] = [
    `## 📚 ${groupName}记忆`,
    ''
  ];
  
  // 最近决策
  const decisions = entries
    .filter(e => e.type === 'decision')
    .sort((a, b) => new Date(b.lastReferenced).getTime() - new Date(a.lastReferenced).getTime())
    .slice(0, 5);
  
  if (decisions.length > 0) {
    lines.push('### 最近决策');
    for (const d of decisions) {
      lines.push(`- ${d.id}: ${d.content.slice(0, 50)} (${formatDate(d.lastReferenced)})`);
    }
    lines.push('');
  }
  
  // 待办事项
  const tasks = entries
    .filter(e => e.type === 'task')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
  
  if (tasks.length > 0) {
    lines.push('### 待办事项');
    for (const t of tasks) {
      lines.push(`- ${t.content.slice(0, 50)}`);
    }
    lines.push('');
  }
  
  // 相关人物
  const people = entries
    .filter(e => e.type === 'person')
    .slice(0, 5);
  
  if (people.length > 0) {
    lines.push('### 相关人物');
    for (const p of people) {
      lines.push(`- ${p.content.slice(0, 50)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 格式化日期为简短格式
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  
  return date.toISOString().split('T')[0];
}

/**
 * 检测会话上下文
 * 这里需要根据 Pi 的 session context 来判断
 */
export function detectChatContext(sessionContext: any): ChatContext {
  // TODO: 需要验证 Pi 的 session context 结构
  // 暂时使用简单判断
  
  if (sessionContext?.groupId) {
    return {
      isPrivate: false,
      groupId: sessionContext.groupId,
      scope: `groups/${sessionContext.groupId}`
    };
  }
  
  return {
    isPrivate: true,
    groupId: null,
    scope: 'private'
  };
}
