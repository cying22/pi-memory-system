// tools.ts - 工具注册
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { loadIndex, saveIndex, appendToEntry, nextMemId } from './store';
import { calculateImportance } from './scorer';
import { runDreamCycle, formatDreamReport, shouldAutoDream } from './dreamer';
import { extractUserMarkers } from './extractor';
import type { MemoryEntry, ChatContext } from './types';

/**
 * 获取类型中文标签
 */
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    decision: '决策',
    person: '人物',
    task: '任务',
    fact: '事实',
    procedure: '流程'
  };
  return labels[type] || type;
}

/**
 * 格式化日期
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
 * 注册所有记忆工具
 */
export function registerMemoryTools(pi: ExtensionAPI): void {
  // 工具 1: memory_extract
  pi.registerTool({
    name: "memory_extract",
    label: "提取记忆",
    description: "从对话中提取事实、决策、人物、任务等关键信息并存储",
    promptSnippet: "从对话中提取关键信息存入记忆库",
    parameters: Type.Object({
      chatContext: Type.String({ description: "群ID 或 'private'" }),
      facts: Type.Array(Type.Object({
        type: StringEnum(['decision', 'person', 'task', 'fact', 'procedure'] as const),
        content: Type.String({ description: "具体内容" }),
        importance: Type.Number({ minimum: 0, maximum: 1, description: "重要性 0.0-1.0" }),
        tags: Type.Array(Type.String(), { description: "标签列表" })
      }), { description: "提取的事实列表" })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const index = await loadIndex();
      const chatContext: ChatContext = params.chatContext === 'private' 
        ? { isPrivate: true, groupId: null, scope: 'private' }
        : { isPrivate: false, groupId: params.chatContext, scope: `groups/${params.chatContext}` };
      
      const savedIds: string[] = [];
      
      for (const fact of params.facts) {
        const id = nextMemId(index);
        const now = new Date().toISOString();
        
        const entry: MemoryEntry = {
          id,
          type: fact.type,
          scope: chatContext.scope,
          content: fact.content,
          created: now,
          lastReferenced: now,
          importance: fact.importance,
          refCount: 0,
          tags: fact.tags,
          relations: []
        };
        
        // 计算最终重要性
        entry.importance = calculateImportance(entry);
        
        // 存储
        index.entries[id] = entry;
        await appendToEntry(chatContext, entry);
        savedIds.push(id);
      }
      
      await saveIndex(index);
      
      // 检查是否需要自动梦境
      if (await shouldAutoDream()) {
        pi.sendUserMessage("未整理记忆超过 20 条，建议执行 /memory:dream 整理", { deliverAs: "followUp" });
      }
      
      return {
        content: [{ 
          type: "text", 
          text: savedIds.length > 0 
            ? `✅ 已保存 ${savedIds.length} 条记忆: ${savedIds.join(', ')}`
            : '没有需要保存的记忆'
        }],
        details: { savedIds }
      };
    }
  });
  
  // 工具 2: memory_search
  pi.registerTool({
    name: "memory_search",
    label: "搜索记忆",
    description: "搜索记忆库，支持关键词和过滤",
    promptSnippet: "搜索存储的记忆内容",
    parameters: Type.Object({
      query: Type.String({ description: "搜索关键词" }),
      scope: Type.Optional(Type.String({ description: "搜索范围: all, private, 或群ID" })),
      type: Type.Optional(StringEnum(['all', 'decision', 'person', 'task', 'fact', 'procedure'] as const)),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: "返回数量上限" }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const index = await loadIndex();
      let entries = Object.values(index.entries);
      
      // 过滤范围
      if (params.scope && params.scope !== 'all') {
        if (params.scope === 'private') {
          entries = entries.filter(e => e.scope === 'private');
        } else {
          entries = entries.filter(e => e.scope === `groups/${params.scope}`);
        }
      }
      
      // 过滤类型
      if (params.type && params.type !== 'all') {
        entries = entries.filter(e => e.type === params.type);
      }
      
      // 关键词搜索
      const query = params.query.toLowerCase();
      entries = entries.filter(e => 
        e.content.toLowerCase().includes(query) ||
        e.tags.some(t => t.toLowerCase().includes(query))
      );
      
      // 按重要性排序
      entries.sort((a, b) => b.importance - a.importance);
      
      // 限制数量
      const limit = params.limit || 10;
      entries = entries.slice(0, limit);
      
      // 更新引用计数
      for (const entry of entries) {
        entry.refCount++;
        entry.lastReferenced = new Date().toISOString();
      }
      await saveIndex(index);
      
      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "未找到匹配的记忆" }],
          details: { results: [] }
        };
      }
      
      const resultsText = entries.map(e => 
        `**${e.id}** [${getTypeLabel(e.type)}] ${e.content.slice(0, 60)} (重要性: ${e.importance.toFixed(2)})`
      ).join('\n');
      
      return {
        content: [{ type: "text", text: `找到 ${entries.length} 条记忆:\n\n${resultsText}` }],
        details: { results: entries }
      };
    }
  });
  
  // 工具 3: memory_view
  pi.registerTool({
    name: "memory_view",
    label: "查看记忆",
    description: "查看特定记忆条目的详细信息",
    promptSnippet: "查看记忆条目详情",
    parameters: Type.Object({
      memId: Type.String({ description: "记忆 ID，如 mem_042" }),
      includeRelations: Type.Optional(Type.Boolean({ description: "是否包含关联条目" }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const index = await loadIndex();
      const entry = index.entries[params.memId];
      
      if (!entry) {
        return {
          content: [{ type: "text", text: `未找到记忆 ${params.memId}` }],
          details: { found: false }
        };
      }
      
      // 更新引用
      entry.refCount++;
      entry.lastReferenced = new Date().toISOString();
      await saveIndex(index);
      
      let text = `## ${entry.id} - ${getTypeLabel(entry.type)}\n`;
      text += `- **内容**: ${entry.content}\n`;
      text += `- **来源**: ${entry.scope}\n`;
      text += `- **创建**: ${entry.created}\n`;
      text += `- **重要性**: ${entry.importance.toFixed(2)}\n`;
      text += `- **引用次数**: ${entry.refCount}\n`;
      text += `- **标签**: ${entry.tags.join(', ') || '无'}\n`;
      
      if (params.includeRelations && entry.relations.length > 0) {
        text += `\n### 关联条目\n`;
        for (const relId of entry.relations) {
          const rel = index.entries[relId];
          if (rel) {
            text += `- ${rel.id}: ${rel.content.slice(0, 50)}\n`;
          }
        }
      }
      
      return {
        content: [{ type: "text", text }],
        details: { entry }
      };
    }
  });
  
  // 工具 4: memory_dream
  pi.registerTool({
    name: "memory_dream",
    label: "记忆整理",
    description: "手动触发记忆整理（梦境周期）",
    promptSnippet: "执行记忆整理和压缩",
    parameters: Type.Object({
      scope: Type.Optional(Type.String({ description: "整理范围: all, private, 或群ID" })),
      dryRun: Type.Optional(Type.Boolean({ description: "true=只预览不执行" }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const scope = params.scope || 'all';
      
      if (params.dryRun) {
        const index = await loadIndex();
        const entries = Object.values(index.entries);
        const archiveable = entries.filter(e => {
          const lastRef = new Date(e.lastReferenced);
          const now = new Date();
          const days = (now.getTime() - lastRef.getTime()) / (1000 * 60 * 60 * 24);
          return days > 90 && e.importance < 0.3;
        });
        
        return {
          content: [{ 
            type: "text", 
            text: `📋 梦境预览 (dry run):\n- 可归档条目: ${archiveable.length}\n- 总条目: ${entries.length}` 
          }],
          details: { archiveable: archiveable.map(e => e.id) }
        };
      }
      
      const report = await runDreamCycle(scope);
      const reportText = formatDreamReport(report);
      
      return {
        content: [{ type: "text", text: reportText }],
        details: { report }
      };
    }
  });
  
  // 工具 5: memory_dashboard
  pi.registerTool({
    name: "memory_dashboard",
    label: "记忆状态",
    description: "生成记忆系统健康报告",
    promptSnippet: "查看记忆系统健康状态",
    parameters: Type.Object({
      format: Type.Optional(StringEnum(['text', 'json'] as const))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const index = await loadIndex();
      const entries = Object.values(index.entries);
      const { listGroupDirs } = await import('./store');
      const groupDirs = await listGroupDirs();
      
      const byType: Record<string, number> = {};
      const byScope: Record<string, number> = {};
      
      for (const entry of entries) {
        byType[entry.type] = (byType[entry.type] || 0) + 1;
        byScope[entry.scope] = (byScope[entry.scope] || 0) + 1;
      }
      
      if (params.format === 'json') {
        return {
          content: [{ type: "text", text: JSON.stringify({ 
            total: entries.length, 
            byType, 
            byScope, 
            health: index.health,
            lastDream: index.lastDream 
          }, null, 2) }],
          details: { stats: { total: entries.length, byType, byScope, health: index.health } }
        };
      }
      
      let text = `## 📊 记忆系统状态\n\n`;
      text += `### 总览\n`;
      text += `- 总条目: ${entries.length}\n`;
      text += `- 群数量: ${groupDirs.length}\n`;
      text += `- 上次梦境: ${index.lastDream ? formatDate(index.lastDream) : '从未'}\n\n`;
      
      text += `### 按类型\n`;
      for (const [type, count] of Object.entries(byType)) {
        text += `- ${getTypeLabel(type)}: ${count}\n`;
      }
      
      text += `\n### 按群\n`;
      for (const [scope, count] of Object.entries(byScope)) {
        text += `- ${scope}: ${count}\n`;
      }
      
      text += `\n### 健康度: ${index.health.overall}/100\n`;
      text += `- 新鲜度: ${Math.round(index.health.freshness * 100)}%\n`;
      text += `- 覆盖度: ${Math.round(index.health.coverage * 100)}%\n`;
      text += `- 连贯性: ${Math.round(index.health.coherence * 100)}%\n`;
      
      return {
        content: [{ type: "text", text }],
        details: { stats: { total: entries.length, byType, byScope, health: index.health } }
      };
    }
  });
  
  // 注册命令
  pi.registerCommand("memory:search", {
    description: "搜索记忆",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("请提供搜索关键词", "warning");
        return;
      }
      pi.sendUserMessage(`搜索记忆: ${args}`);
    }
  });
  
  pi.registerCommand("memory:dream", {
    description: "触发梦境周期",
    handler: async (args, ctx) => {
      pi.sendUserMessage("执行记忆整理");
    }
  });
  
  pi.registerCommand("memory:status", {
    description: "查看记忆状态",
    handler: async (args, ctx) => {
      pi.sendUserMessage("查看记忆系统状态");
    }
  });
  
  pi.registerCommand("memory:view", {
    description: "查看记忆条目",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("请提供记忆 ID", "warning");
        return;
      }
      pi.sendUserMessage(`查看记忆: ${args}`);
    }
  });
}
