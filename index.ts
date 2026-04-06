// index.ts - 记忆系统扩展入口
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerMemoryTools } from './tools';
import { loadIndex, saveIndex, appendToEntry, nextMemId, getMemoryDir } from './store';
import { isWorthExtracting, extractUserMarkers } from './extractor';
import { calculateImportance } from './scorer';
import { shouldAutoDream } from './dreamer';
import { buildGlobalSummary, buildGroupSummary, detectChatContext } from './context';
import type { MemoryEntry, ChatContext } from './types';
import { mkdir } from 'node:fs/promises';

export default function (pi: ExtensionAPI) {
  // 注册工具和命令
  registerMemoryTools(pi);
  
  // 会话启动时加载状态
  pi.on("session_start", async (_event, ctx) => {
    // 确保记忆目录存在
    await mkdir(getMemoryDir(), { recursive: true });
    await mkdir(`${getMemoryDir()}/private`, { recursive: true });
    await mkdir(`${getMemoryDir()}/groups`, { recursive: true });
    await mkdir(`${getMemoryDir()}/archive`, { recursive: true });
    
    ctx.ui.setStatus("memory", "📚 记忆系统就绪");
  });
  
  // 对话结束时自动提取
  pi.on("turn_end", async (event, ctx) => {
    try {
      // 获取当前会话的消息
      const entries = ctx.sessionManager.getBranch();
      const messages = entries
        .filter(e => e.type === 'message')
        .map(e => {
          if (e.message.role === 'user') {
            return typeof e.message.content === 'string' 
              ? e.message.content 
              : e.message.content.map(c => c.type === 'text' ? c.text : '').join('');
          }
          if (e.message.role === 'assistant') {
            return e.message.content;
          }
          return '';
        })
        .filter(m => m.length > 0);
      
      // 检查是否有提取价值
      if (!isWorthExtracting(messages)) {
        return;
      }
      
      // 检查用户标记
      const lastUserMessage = messages.filter((_, i) => i % 2 === 0).pop() || '';
      const markers = extractUserMarkers(lastUserMessage);
      
      // 这里需要调用 LLM 提取，但扩展中无法直接调用
      // 改为发送提示让用户触发
      if (markers.length > 0) {
        ctx.ui.setStatus("memory", "📌 检测到标记，建议提取记忆");
        pi.sendUserMessage("对话中包含重要标记，是否提取为记忆？", { deliverAs: "nextTurn" });
      }
    } catch (e) {
      console.error('Memory extraction error:', e);
    }
  });
  
  // 在 agent 开始前注入记忆上下文
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      // 检测会话类型（需要根据实际钉钉消息结构调整）
      const chatContext = detectChatContext({});
      
      let summary: string;
      if (chatContext.isPrivate) {
        summary = await buildGlobalSummary();
      } else {
        summary = await buildGroupSummary(chatContext.groupId!);
      }
      
      return {
        systemPrompt: event.systemPrompt + '\n\n' + summary
      };
    } catch (e) {
      console.error('Memory context injection error:', e);
      return {};
    }
  });
  
  // 会话关闭时清理
  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("memory", null);
  });
}
