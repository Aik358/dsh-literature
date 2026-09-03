# AI-INTEGRATION — dsh-literature × DeepSeek Harness 的深度绑定方案

调研结论 + 实施方案。目标是把文献插件从「带两个工具的侧窗」升级为
**AI 的一等学术能力**：模型主动查库、引用自动校验、阅读行为沉淀进记忆、
并与 dsh-auto-memory（同机已安装）形成「读过的文献 = 可回忆的知识」闭环。

本文所有可行性判断都对照了两边插件的**实际代码**，不是猜想。

---

## 一、现状盘点（两边的真实能力）

### dsh-literature（本插件）

| 已有 | 说明 |
|---|---|
| `tools` | `zotero_lookup` / `zotero_save`（改名计划见 IMPLEMENTATION-PLANS A1） |
| session-hook | 监听 `session/event`，从模型输出里兜底识别 DOI/arXiv（默认关闭） |
| SSE | `/api/dsh-literature/events`，浏览器侧实时进度 |
| ai.js | 划词/全文问答 → 注入当前 DSH 会话（`MAX_CONTEXT_CHARS=60000`） |
| 数据 | 单 JSON 库（items/tasks/annotations），明文可读 |

### dsh-auto-memory（@a9i5k4/dsh-auto-memory，用户自写）

| 已有 | 说明（源码实证） |
|---|---|
| 三层记忆 | 用户级 `~/.dsh/memory/MEMORY.md`、项目 `{ws}/.dsh-memory/MEMORY.md`、每日日志 `{ws}/.dsh-memory/YYYY-MM-DD.md`（append-only） |
| 写入工具 | `memory_log_pre`（条目格式 `- HH:MM {note}`，卫生闸门 sanitizeForWrite + tailHas 复读防护 + 单条 2000 字上限）、`memory_note_pre`（项目笔记，每日 3000 字预算） |
| 检索工具 | `memory_recall_pre`（本机记忆 + 外部 AI 工具历史 + 历史 DSH 会话，关键词级） |
| 自动沉淀 | turn-stopping 钩子自动评估每轮并写日志/升格长期记忆 |
| 提示注入 | `ctx.systemPrompt.section()`（静态纪律，字节级稳定=前缀缓存锚）+ `ctx.systemPrompt.context()`（动态 user-role 快照，内容变化才注入） |
| 内部状态 | engine.state.logText 等内存缓存 + loadedAt；`/scan-dirty` 路由存在（M7 index-sync） |

### 关键基础设施事实（决定方案形态）

1. **`ToolRuntime.execute()` 是宿主侧按名调用工具的正规通路**
   （`@deepseek-ai/dsh-tools` types：`execute({ name, arguments, agent, signal })`）。
   literature 的 `ctx.tools` 与 auto-memory 注册到的**是同一个 tools service**。
   ⇒ 插件间联动存在一等公民路径，不需要 hack。
2. **memory_log_pre 内部用 `engine.resolvePaths(exec.agent)`** —— 依赖 agent 上下文
   解析工作区。⇒ 只有在 **AI 会话内**（有 agent）才能可靠转调；纯宿主事件（高亮等）
   没有现成 agent。
3. auto-memory 的记忆是**明文 Markdown**。文件本身就是它的对外契约
   （外部工具继承能力就是这么做的），但直写文件会绕过它的内存缓存与卫生闸门。

---

## 二、绑定架构：三层递进

```
┌─────────────────────────────────────────────────────────┐
│ L1 工具族（模型主动调用）— IMPLEMENTATION-PLANS B 已覆盖    │
│    search_library / get_detail / list_recent / verify     │
├─────────────────────────────────────────────────────────┤
│ L2 提示注入（模型知道自己有文献能力）— 本文件新增            │
│    静态能力公告 + 动态「正在阅读」快照                       │
├─────────────────────────────────────────────────────────┤
│ L3 记忆联动（读过的文献变成可回忆的知识）— 本文件新增        │
│    会话内转写 memory_log_pre + 宿主事件文件契约              │
└─────────────────────────────────────────────────────────┘
```

L1 是地基（B 部分已写好，先落地）。下面只展开 L2 / L3。

---

## 三、L2：提示注入 —— 让模型「知道」文献能力

### 3.1 静态能力公告（section，必做，成本≈0）

literature 的 `inject` 增加 `'systemPrompt'`，注册：

```js
ctx.systemPrompt.section({
  name: 'dsh:dsh-literature-pre-capabilities',
  order: 9900,                    // auto-memory 是 10000（末尾）；我们稍前
  text: () => GUIDANCE_TEXT,      // 固定字符串 → 字节级稳定，不破前缀缓存
})
```

GUIDANCE_TEXT 内容要点（照 auto-memory 的写法：能力 + 何时用 + 纪律 + 用户怎么提）：

- 本机已安装文献插件：内置文献库 + PDF 阅读 + 引用生成（APA/GB/MLA/Chicago/BibTeX）。
- 用户提到「文献/论文/DOI/arXiv/引用/参考文献/我读过那篇」时：
  - 需要检索用户**已存**文献 → `literature_search_library`（B1 落地后）
  - 引用真实性存疑 → `literature_verify_citation`（B3 落地后），**生成参考文献前先核验**
  - 保存/识别 → `literature_lookup` / `literature_save`
- 阅读行为会自动进入记忆（见 L3），用户问「我读过什么」时结合 memory_recall。

**预算**：整段 ≤ 400 字。静态、永不变。

### 3.2 动态阅读快照（context，可选，二期）

`ctx.systemPrompt.context()` 注册 `dsh:dsh-literature-pre-reading`：
渲染"最近 24h 阅读状态"（正在读哪篇、新增高亮/笔记数），**内容不变则返回空串**
（context surface 的去重语义由宿主 project() 保证，auto-memory 已验证该模式）。

价值：模型在对话里自然接上"你昨天标到第 12 页那篇"。二期再做——
先把 section 立起来，观察上下文预算消耗再决定。

---

## 四、L3：与 auto-memory 的联动 —— 「读过 = 可回忆」

### 4.1 通路一（推荐首发）：会话内工具转写

**时机**：模型在会话里调用 literature 工具（lookup/save/未来的 search_library）
并产生结果时，**literature 在自己的 execute 里转写一条 memory_log_pre**。

```js
// tools.js 某工具 execute 的末尾
async function rememberThroughMemory(ctx, agent, note, signal) {
  try {
    await ctx.tools.execute({
      name: 'memory_log_pre',
      arguments: { note },          // auto-memory 自己做闸门/去重/格式化
      agent,                        // 必须透传 —— resolvePaths 依赖它
      signal,
    })
    return true
  } catch {
    return false                    // auto-memory 未安装/写入被闸门拒：静默降级
  }
}
```

写入条目示例（一句话概括式，遵守 auto-memory 的卫生纪律）：

- lookup 成功 → `[文献] 识别并加入侧窗：{title}（{year}，{firstAuthor} et al.）`
- save 成功 → `[文献] 已保存全文：{title}（{key}）`
- verify_citation verified → `[文献] 核实引用：{shortTitle} — 真实存在（DOI:{doi}）`
- verify_citation not_found → `[文献] 拦截不实引用：模型输出的 {citation} 未在权威库命中`

**为什么选这条路**：
- auto-memory 的闸门/去重/预算/state 缓存**全部原生生效**，零格式风险；
- 联动是**可选的**：auto-memory 不在场时静默降级，literature 一切功能不受影响；
- 工具名 `memory_log_pre` 挂探测：启动时 execute 一次 `memory_status_pre`（或维护
  `tools/registered` 事件监听）来决定是否启用联动，避免每条事件都吞异常。

**不做**：不直接写 auto-memory 的文件（绕过闸门+缓存不同步，M7 是否兜底未验证）；
不调 `memory_note_pre`（每日 3000 字预算是稀缺资源，留给 AI 自己决策）。

### 4.2 通路二（二期）：宿主事件 → 记忆（无 agent 场景）

高亮/读完/导出引用发生在浏览器侧，**没有 agent**，4.1 的转调不可用。两条出路：

a) **SSE 事件 → 宿主聚合 → 下次会话首轮补记**：literature 宿主侧把阅读事件
   缓存为"待沉淀摘要"（内存 + 库内标记），在下一次有 agent 的工具调用里捎带写入
   （或 Section 3.2 的动态快照直接呈现，不进记忆文件）。
b) **文件契约（实验性）**：严格按 `- HH:MM [文献] {note}` 格式 append 今日日志。
   风险：绕过卫生闸门、state.logText 缓存不同步（注入可能短暂缺失该条）。
   **除非 auto-memory 侧确认 scan-dirty 会刷新缓存，否则不建议**。

**决策**：二期先做 a)。阅读轨迹的"回看"需求由 Section 3.2 动态快照 + EVOLUTION 3.3
的周报满足，记忆文件只沉淀 AI 会话内发生的文献事件——这是 auto-memory 自身
"每轮自动沉淀"已经覆盖的范围，不重复建设。

### 4.3 反向通路：memory_recall 检索文献记忆

`memory_recall_pre` 是关键词级检索明文 Markdown。4.1 写入的条目天然可被命中——
无需改 auto-memory。要提升命中率，条目里带上**检索友好词**：
`[文献] {title}（{firstAuthor} {year}）已保存全文` —— 标题、作者、年份齐全，
用户问"那篇 SSVEP 的论文"时 recall 能直接命中。

**明确不做**：不往 auto-memory 的 recall 里挂库内 JSON 检索（那是 B1
`literature_search_library` 的职责，两套检索各司其职：记忆=经历，库=资产）。

---

## 五、实施计划（按此顺序，可直接交给执行模型）

### 第 1 批 · L2 静态注入 + 联动开关（0.5.0，小改动）

1. `src/node/index.js`：inject 增加 `'systemPrompt'`；注册 capabilities section
   （§3.1，GUIDANCE_TEXT 双语视宿主语言——先中文，字段留 i18n 钩子）。
2. `src/node/tools.js`：实现 `rememberThroughMemory()`（§4.1），启动时探测
   auto-memory 是否注册（尝试 `ctx.tools.execute({ name:'memory_status_pre', … })`
   一次，成功则 `memoryBridge = true`；监听 `tools/registered` 事件更新状态）。
   在 lookup/save 的 execute 末尾调用（有 agent 才调）。
3. test-host：模拟注册 memory_log_pre 的假工具，断言转调发生且参数正确；
   断言 auto-memory 缺席时主流程不报错。
4. 回归 + bump。

**验收**：装了 auto-memory 的机器上，AI 保存一篇文献后，今日日志出现
`[文献] 已保存全文：…`；卸载 auto-memory 后一切功能如常。

### 第 2 批 · L1 工具族落地（0.6.0，= IMPLEMENTATION-PLANS B）

B1 search_library → B2 get_detail/list_recent → B3 verify_citation，
执行细节以 `IMPLEMENTATION-PLANS.md` PART B 为准。落地后把 §3.1 的
GUIDANCE_TEXT 更新为真实工具名。

### 第 3 批 · L2 动态快照 + 阅读沉淀（0.7.0）

1. §3.2 阅读状态 context surface（内容不变返回空串）。
2. §4.2a：宿主侧阅读事件聚合，跟随下一次工具调用补记（或仅走快照）。
3. （可选）B4：引用弹窗「发送到对话」。

### 依赖与顺序约束

- L1（PART B）依赖 A3（库内检索）——**A 部分先完成**。
- §3.1 不依赖任何部分，可与 PART A 并行（改动极小）。
- §4.1 依赖 A1（工具改名）先落地，避免记忆条目里出现旧工具名。

---

## 六、风险与边界

| 风险 | 缓解 |
|---|---|
| auto-memory 卫生闸门拒写（复读/乱码/超 2000 字） | note 由我们生成，模板固定、短句；被拒即静默放弃，不重试 |
| resolvePaths 依赖 agent，跨工作区语义由 auto-memory 决定 | 只在会话内转调，透传原 agent，不造 agent |
| systemPrompt 注入吃上下文预算 | 静态段 ≤400 字且字节级稳定；动态快照默认关，设置页开关 |
| 两插件版本耦合（memory_log_pre 改名/改签名） | 联动全程 try/catch + 启动探测；literature 永不因联动失败而失败 |
| 隐私：阅读行为写入记忆文件 | 记忆本机明文（auto-memory 既有边界）；条目只含元数据（标题/作者/年份），**不含高亮正文与笔记内容**；设置页提供「文献事件进记忆」开关，默认开 |

## 七、不做什么

- 不做"AI 自动读库总结"后台任务（无 agent 场景的主动 LLM 调用超出插件职责）。
- 不把文献库 JSON 塞进记忆文件（库是结构化资产，走 B1 检索；记忆只存经历）。
- 不修改 auto-memory 的任何文件/代码/配置（联动是 literature 单侧适配）。
