// extractor.ts - 事实提取逻辑
import type { ExtractResult, Fact } from './types';

/**
 * 提取提示词模板
 */
const EXTRACTION_PROMPT = `从以下对话中提取关键事实。只提取有价值的离散信息，不要提取闲聊。

对话：
{conversation}

请以 JSON 格式输出：
{
  "facts": [
    {
      "type": "decision|person|task|fact|procedure",
      "content": "具体内容",
      "importance": 0.0-1.0,
      "tags": ["标签"]
    }
  ]
}

如果没有值得提取的内容，返回 {"facts": []}。

事实类型说明：
- decision: 决策（我们决定...）
- person: 人物信息（张三是...）
- task: 任务分配（下周五前完成...）
- fact: 事实陈述（服务器在...）
- procedure: 流程规范（发版前需要...）

重要性评分指南：
- 0.8-1.0: 影响项目方向的重大决策
- 0.5-0.7: 重要的人物、任务或事实
- 0.2-0.4: 一般性信息
- 0.0-0.1: 边缘信息`;

/**
 * 构建提取提示词
 */
export function buildExtractionPrompt(conversation: string): string {
  return EXTRACTION_PROMPT.replace('{conversation}', conversation);
}

/**
 * 解析提取结果
 */
export function parseExtractResult(response: string): ExtractResult {
  try {
    // 尝试从响应中提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { facts: [] };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // 验证结构
    if (!Array.isArray(parsed.facts)) {
      return { facts: [] };
    }
    
    // 过滤和验证每个事实
    const facts: Fact[] = parsed.facts
      .filter((f: any) => 
        f && 
        typeof f.content === 'string' && 
        f.content.length > 0 &&
        ['decision', 'person', 'task', 'fact', 'procedure'].includes(f.type)
      )
      .map((f: any) => ({
        type: f.type,
        content: f.content,
        importance: Math.min(1, Math.max(0, parseFloat(f.importance) || 0.5)),
        tags: Array.isArray(f.tags) ? f.tags.filter((t: any) => typeof t === 'string') : []
      }));
    
    return { facts };
  } catch (e) {
    console.error('Failed to parse extract result:', e);
    return { facts: [] };
  }
}

/**
 * 检查对话是否有提取价值
 * 简单启发式：对话长度 > 3 轮 且 包含关键词
 */
export function isWorthExtracting(messages: string[]): boolean {
  if (messages.length < 3) {
    return false;
  }
  
  const combined = messages.join(' ').toLowerCase();
  
  // 包含决策、任务、人物相关的关键词
  const keywords = [
    '决定', '确认', '同意', '批准',        // decision
    '负责', '对接', '联系人', '负责人',      // person
    '完成', '截止', '下周', '任务',          // task
    '是', '在', '配置', '设置',              // fact
    '流程', '步骤', '需要', '先'             // procedure
  ];
  
  return keywords.some(kw => combined.includes(kw));
}

/**
 * 检查用户标记
 */
export function extractUserMarkers(text: string): string[] {
  const markers: string[] = [];
  
  if (text.includes('⚠️永久') || text.includes('⚠️ 永久')) {
    markers.push('永久');
  }
  if (text.includes('🔥重要') || text.includes('🔥 重要')) {
    markers.push('重要');
  }
  if (text.includes('📌置顶') || text.includes('📌 置顶')) {
    markers.push('置顶');
  }
  
  return markers;
}
