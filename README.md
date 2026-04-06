# 钉钉记忆系统

为钉钉群聊和私聊提供认知记忆系统。参考 [openclaw-auto-dream](https://github.com/LeoYeAI/openclaw-auto-dream) 设计。

## 功能

- **自动提取**: 对话结束时自动提取事实、决策、人物、任务
- **分群隔离**: 每个群聊有独立的记忆空间
- **私聊汇总**: 私聊可查看所有群的记忆（管理者视角）
- **重要性评分**: 基于引用频率和时间衰减的评分系统
- **遗忘曲线**: 低重要性旧条目自动归档
- **梦境周期**: 定期整理记忆，压缩和归档

## 工具

| 工具 | 说明 |
|------|------|
| `memory_extract` | 提取记忆 |
| `memory_search` | 搜索记忆 |
| `memory_view` | 查看记忆详情 |
| `memory_dream` | 执行记忆整理 |
| `memory_dashboard` | 查看系统状态 |

## 命令

| 命令 | 说明 |
|------|------|
| `/memory:search <关键词>` | 搜索记忆 |
| `/memory:dream` | 触发梦境周期 |
| `/memory:status` | 查看健康状态 |
| `/memory:view <mem_id>` | 查看条目详情 |

## 用户标记

在对话中使用以下标记影响提取：

- `⚠️ 永久` — 永不遗忘
- `🔥 重要` — 提升重要性
- `📌 置顶` — 提升重要性

## 文件结构

```
~/.pi/agent/memory/
├── index.json      # 全局索引 + 重要性评分
├── private/        # 私聊记忆
│   └── facts.md
├── groups/         # 群聊记忆
│   └── {group_id}/
│       ├── meta.json
│       └── facts.md
└── archive/        # 归档
```

## 扩展文件

```
~/.pi/agent/extensions/memory-system/
├── index.ts        # 扩展入口
├── types.ts        # 类型定义
├── store.ts        # 文件存储层
├── scorer.ts       # 重要性评分
├── extractor.ts    # 事实提取
├── dreamer.ts      # 梦境周期
├── context.ts      # 上下文注入
└── tools.ts        # 工具注册
```

## 重要性评分

```
importance = (base_weight × recency × references) / 8.0
```

- **base_weight**: 标记权重 (永久 2.0, 重要 1.5, 置顶 1.3, 普通 1.0)
- **recency**: `max(0.1, 1.0 - days/180)` — 6个月衰减
- **references**: `log₂(ref_count + 1)` — 引用提升

## 梦境周期

三阶段流程：

1. **收集 (Collect)**: 扫描新增记忆，识别用户标记
2. **整合 (Consolidate)**: 语义去重，关联链接，分配 ID
3. **评估 (Evaluate)**: 计算重要性，应用遗忘规则，健康检查

### 遗忘规则

- 条目 >90 天未被引用 **且** 重要性 < 0.3 → 归档
- `⚠️ 永久` 和 `📌 置顶` 条目永不遗忘

## 健康分数

```
health = (freshness × 0.3 + coverage × 0.3 + coherence × 0.4) × 100
```

- **freshness**: 30 天内被引用的条目占比
- **coverage**: 各类型条目是否都有更新
- **coherence**: 有至少一个关联的条目占比
