// store.ts - 文件存储层
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { MemoryIndex, MemoryEntry, ChatContext } from './types';

const MEMORY_DIR = join(homedir(), '.pi', 'agent', 'memory');
const INDEX_FILE = join(MEMORY_DIR, 'index.json');

/**
 * 确保目录存在
 */
async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * 检查文件是否存在
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取记忆目录路径
 */
export function getMemoryDir(): string {
  return MEMORY_DIR;
}

/**
 * 获取会话对应的目录
 */
export function getScopeDir(context: ChatContext): string {
  if (context.isPrivate) {
    return join(MEMORY_DIR, 'private');
  }
  return join(MEMORY_DIR, 'groups', context.groupId!);
}

/**
 * 加载全局索引
 */
export async function loadIndex(): Promise<MemoryIndex> {
  await ensureDir(MEMORY_DIR);
  
  if (!(await fileExists(INDEX_FILE))) {
    // 创建空索引
    const emptyIndex: MemoryIndex = {
      version: '1.0.0',
      lastDream: null,
      nextId: 1,
      entries: {},
      health: { overall: 100, freshness: 1, coverage: 1, coherence: 1 }
    };
    await writeFile(INDEX_FILE, JSON.stringify(emptyIndex, null, 2), 'utf-8');
    return emptyIndex;
  }
  
  const content = await readFile(INDEX_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * 保存全局索引
 */
export async function saveIndex(index: MemoryIndex): Promise<void> {
  await ensureDir(MEMORY_DIR);
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * 生成下一个记忆 ID
 */
export function nextMemId(index: MemoryIndex): string {
  const id = `mem_${String(index.nextId).padStart(3, '0')}`;
  index.nextId++;
  return id;
}

/**
 * 获取事实文件路径
 */
export function getFactsFile(context: ChatContext): string {
  return join(getScopeDir(context), 'facts.md');
}

/**
 * 读取事实文件内容
 */
export async function readFactsFile(context: ChatContext): Promise<string> {
  const filePath = getFactsFile(context);
  if (!(await fileExists(filePath))) {
    return '';
  }
  return readFile(filePath, 'utf-8');
}

/**
 * 追加条目到事实文件
 */
export async function appendToEntry(context: ChatContext, entry: MemoryEntry): Promise<void> {
  const scopeDir = getScopeDir(context);
  await ensureDir(scopeDir);
  
  const filePath = getFactsFile(context);
  const existing = await readFactsFile(context);
  
  const entryMarkdown = formatEntryMarkdown(entry);
  const newContent = existing ? `${existing}\n\n${entryMarkdown}` : entryMarkdown;
  
  await writeFile(filePath, newContent, 'utf-8');
}

/**
 * 格式化条目为 Markdown
 */
function formatEntryMarkdown(entry: MemoryEntry): string {
  const relations = entry.relations.length > 0 
    ? entry.relations.join(', ') 
    : '无';
  
  return `## ${entry.id} - ${getTypeLabel(entry.type)}
- **时间**: ${entry.created}
- **来源**: ${entry.scope}
- **内容**: ${entry.content}
- **关联**: ${relations}
- **重要性**: ${entry.importance.toFixed(2)}
- **标签**: ${entry.tags.join(', ') || '无'}
- **最后引用**: ${entry.lastReferenced}`;
}

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
 * 列出所有群目录
 */
export async function listGroupDirs(): Promise<string[]> {
  const groupsDir = join(MEMORY_DIR, 'groups');
  if (!(await fileExists(groupsDir))) {
    return [];
  }
  
  const entries = await readdir(groupsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

/**
 * 读取群元数据
 */
export async function loadGroupMeta(groupId: string): Promise<Record<string, any> | null> {
  const metaPath = join(MEMORY_DIR, 'groups', groupId, 'meta.json');
  if (!(await fileExists(metaPath))) {
    return null;
  }
  const content = await readFile(metaPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 保存群元数据
 */
export async function saveGroupMeta(groupId: string, meta: Record<string, any>): Promise<void> {
  const scopeDir = join(MEMORY_DIR, 'groups', groupId);
  await ensureDir(scopeDir);
  const metaPath = join(scopeDir, 'meta.json');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * 获取归档文件路径
 */
export function getArchiveFile(scope: string): string {
  const name = scope.replace(/\//g, '_');
  return join(MEMORY_DIR, 'archive', `${name}.md`);
}

/**
 * 追加到归档文件
 */
export async function appendToArchive(scope: string, content: string): Promise<void> {
  const archiveDir = join(MEMORY_DIR, 'archive');
  await ensureDir(archiveDir);
  
  const filePath = getArchiveFile(scope);
  const existing = await fileExists(filePath) 
    ? await readFile(filePath, 'utf-8') 
    : '';
  
  const newContent = existing ? `${existing}\n${content}` : content;
  await writeFile(filePath, newContent, 'utf-8');
}
