# Tavern 数据指南

## 文件夹结构
```
apps/tavern/data/
├── characters/
│   ├── {id}.json          # 角色人设文本（Agent 读取）
│   └── ...
├── worldbook/
│   ├── {id}.json          # 世界书条目（Agent 按需读取）
│   └── ...
├── sessions/
│   ├── {id}.json          # 对话会话（Agent 读取）
│   └── ...
├── media/                 # ⚠️ 前端专用 - 禁止读取
│   └── {id}.json          # 头像、立绘、正则脚本、快捷回复
└── state.json             # 活跃角色、会话、用户名
```

> **⚠️ 警告：`/media/` 目录包含大体积 base64 图片数据和 HTML 模板，仅供前端使用。绝对不要读取此目录中的文件，否则会超出 token 限制。**

## 文件定义

### 角色目录 `/characters/`

此文件仅包含文本人设数据，不含图片、正则脚本或世界书。

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 唯一标识符 |
| name | string | 是 | 角色显示名（即 {{char}}） |
| description | string | 是 | 角色人设/背景——作为角色扮演上下文使用 |
| personality | string | 否 | 性格特征 |
| scenario | string | 否 | 角色扮演的场景设定 |
| first_mes | string | 是 | 首条问候语（可含 {{user}}/{{char}}） |
| mes_example | string | 否 | 示例对话，展示角色的写作风格 |
| system_prompt | string | 否 | AI 行为系统提示词 |
| post_history_instructions | string | 否 | 对话历史后注入的指令 |
| creator_notes | string | 否 | 创作者备注 |
| tags | string[] | 否 | 角色标签 |
| createdAt | string | 是 | ISO 时间戳 |
| updatedAt | string | 是 | ISO 时间戳 |

### 世界书 `/worldbook/`

每个文件是角色对应的世界书条目数组。Agent 在处理 SEND_MESSAGE 时读取，扫描最近对话文本匹配 `keys`，将命中条目的 `content` 注入 prompt。

| 字段 | 类型 | 描述 |
|------|------|------|
| keys | string[] | 匹配对话文本的关键词 |
| secondary_keys | string[] | 附加关键词（selective 条目用） |
| content | string | 命中时注入 prompt 的上下文文本 |
| enabled | boolean | 是否启用 |
| constant | boolean | 为 true 时始终注入，不检查关键词 |
| selective | boolean | 为 true 时需同时命中主关键词和附加关键词 |
| insertion_order | number | 注入顺序（越小越靠前） |

### 会话目录 `/sessions/`

每个文件是与角色的一次对话会话。

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 唯一标识符 |
| characterId | string | 是 | 关联的角色 ID |
| messages | Message[] | 是 | 按顺序的对话消息 |
| createdAt | string | 是 | ISO 时间戳 |
| updatedAt | string | 是 | ISO 时间戳 |

**Message 结构：**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 消息唯一 ID |
| role | string | 是 | "user" 或 "assistant" |
| content | string | 是 | 消息文本（可含 {{user}}/{{char}} 模板） |
| timestamp | string | 是 | ISO 时间戳 |

### 状态文件 `/state.json`

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| activeCharacterId | string \| null | null | 当前活跃角色 ID |
| activeSessionId | string \| null | null | 当前活跃会话 ID |
| userName | string | "User" | 用户显示名（即 {{user}}） |

## 角色扮演回复工作流

当你收到 **SEND_MESSAGE** action 时，必须以角色身份回复：

### 第 1 步：读取上下文
- 读取 `characters/{characterId}.json` 获取角色人设
- 读取 `sessions/{sessionId}.json` 获取对话历史
- 读取 `worldbook/{characterId}.json` 获取世界书条目
- 读取 `state.json` 获取 `userName`

### 第 2 步：构建角色扮演上下文
- 用 `description` + `personality` + `scenario` + `system_prompt` 作为你的人设
- 扫描最近对话文本，匹配世界书条目的 `keys`：
  - `constant: true` → 始终注入
  - `selective: true` → 需同时命中 `keys` 和 `secondary_keys`
  - 其他 → 任一 `key` 命中即注入
  - 仅注入 `enabled: true` 的条目
  - 按 `insertion_order` 升序排列
- 将 `{{user}}` → userName，`{{char}}` → 角色名
- 参考 `mes_example` 的对话风格

### 第 3 步：生成回复
- 以角色身份撰写回复，遵循人设和风格
- 消息中保留 `{{user}}` 和 `{{char}}` 模板变量（前端显示时动态替换）
- 角色卡的 `regex_scripts` 可能期望你输出特定标签（如 `<cm>`、`<note>`、`<screen>`）——参考 `mes_example` 或 `description` 中的模式

### 第 4 步：持久化并通知
- 生成唯一消息 ID
- 将 `{ id, role: "assistant", content, timestamp }` 追加到会话的 messages 数组
- 将更新后的会话写回 `sessions/{sessionId}.json`
- 发送 `ADD_MESSAGE` action，`filePath: "/sessions/{sessionId}.json"`

## 数据同步说明

### Agent 创建数据
Agent 写入云存储 → 发送 Action（CREATE_CHARACTER / ADD_MESSAGE）→ 前端刷新 UI。

### 用户创建数据
用户导入角色卡或发送消息 → 前端写入云存储 → reportAction → Agent 收到通知。

### 启动恢复
前端读取 state.json → 恢复活跃角色/会话 → 从云存储加载数据。
