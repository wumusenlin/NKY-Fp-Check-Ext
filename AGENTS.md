# Agent 协作规范 V2.3

> **V2.3 主要变化**（2026-05-16）：
> - 三合一：标准协作 / CC 独占 / Codex 独占 融合为一张分工模式表（替代旧的"无编排器 / Codex 独立"双章节）
> - 删除"5 文档编排模式"和"编排器模式"（→ ROADMAP 协议未来探索 R3/R4 备忘）
> - 标准流程明确 4 阶段（Phase 1 含 brainstorm 子阶段），不论谁做都必经
> - 引入根目录 [CLAUDE.md](CLAUDE.md) 作为 CC 起手入口
> - 引入 `.claude/hooks/SessionStart` + `.claude/settings.json` 硬约束
> - SOP §8 重写：push feature / merge main / push main 全部 🟢 自动（修复 0510-0514F 5 个 Sprint 沉积漏洞）
> - 借鉴外部最佳实践（shanraisshan + obra/superpowers）加入 brainstorm + Rewind > Correct + 跨模型对抗审查

## 1. 角色分工

| 角色 | 职责 |
|---|---|
| **CC（Claude Code）** | 需求分析、架构决策、CORE 文档维护、新 Sprint 分支创建+push、代码 Review、迭代收口 |
| **Codex** | 功能实现、编写自动化测试、Bug 修复 |
| **Orchestrator**（暂未启用）| 详见 ROADMAP §协议未来探索 R4 |

## 2. 文档体系

```
项目根目录/
  CLAUDE.md            ← CC 每次会话自动加载入口（指针页·不重复内容）
  AGENTS.md            ← 本文件（多 agent 合作合同）
  SPEC.md / PLAYBOOK.md / TEST_CASES.md / TASK_LOG.md / HANDOVER.md  ← 当前 Sprint 文档
  .claude/
    settings.json      ← CC 客户端硬约束（auto-allow + deny）
    hooks/             ← SessionStart 等钩子脚本

Docs/Core/             ← 永久权威（仅 CC 可修改）
  PRD / DESIGN_SA / DESIGN_UI / REGRESSION / SOP / ROADMAP / OPS_MANUAL
Docs/Sprints/[版本]/   ← 历史 Sprint 归档
prisma/schema.prisma   ← DB 字段唯一真相源
```

**CORE 文档守护原则**：
- 禁止在 SPEC / PLAYBOOK / TEST_CASES / 代码注释中重复定义业务规则、架构决策或 UI 规范
- 代码与 CORE 冲突时以 CORE 为准；如 CORE 需变更，停下来告知 CC 先更新 CORE
- 数据库字段只读 `prisma/schema.prisma`，不查文档

根目录 SPEC/PLAYBOOK/TEST_CASES/TASK_LOG 4 份只保留当前 Sprint 内容，迭代结束后进入空载状态（详见 SOP §Step 5）。

## 3. 标准开发流程（4 阶段 · 不论谁做都必经）

| 阶段 | 必须输出 | 备注 |
|------|---------|------|
| **1. 文档准备** | SPEC + PLAYBOOK + TEST_CASES + HANDOVER（在 main 上）| **含 brainstorm 子阶段**：先与用户讨论清需求边界 / 关键决策点 / 风险，确认理解一致再开始写 SPEC（防错诊断 · 详见 SOP 附录 C）|
| **2. 实施** | 代码 + 自动化测试（在 feature 分支上）| Step 1 强制握手 → Step 2-末步自动连续推进，遇 5 种 stop 才停 |
| **3. 审查** | Stage A 9 项 Checklist + CODE_REVIEW.md + Stage B User UAT | UAT 不可跳过 |
| **4. 收口** | SOP §8.1-8.6 全套（含 merge main + push origin/main）+ CORE 同步 + 归档 | 任一步失败视为 Sprint 未完成 |

## 4. 分工模式（按场景选 + CORE 铁律）

| 模式 | 文档 | 实施 | 审查 | 收口 | 适用场景 |
|------|------|------|------|------|---------|
| **标准协作**（默认）| CC | Codex | CC | CC | 90% 常规迭代 |
| **CC 独占** | CC | CC | CC（自审 + 在 TASK_LOG 写 OOB 报备）| CC | 复杂重构、协议升级、CORE 级调整（如 0514A 业务组件抽象、本次协议升级）|
| **Codex 独占** | Codex | Codex | Codex（自审 + 通知 CC）| **CC 接手** | 简单 UI 微调、小 bug fix |

**铁律**：不论何种模式，CORE 文档变更必须由 CC 主导。Codex 独占模式遇到 CORE 需变更 → 写 TASK_LOG → CC 接手。

**可选增强 · 跨模型对抗审查**（借鉴 shanraisshan）：
- CC 写的 SPEC/HANDOVER 可由 Codex 反审找漏洞（独立 context 更易发现盲点）
- Codex 实施的代码可由 CC 在 Stage A 走对抗式提问（不只是看，要假设有坑）
- 默认不强制使用，复杂 Sprint 推荐

## 5. Step 1 强制握手 + 自动连续推进

无编排器模式下（默认）：
- **Step 1** 启动握手强制 CC/Codex 复述 5 点理解，等用户书面确认
- **Step 2 → 末步** 自动连续执行（每 Step 完成立即 commit + 追加 TASK_LOG）
- 中段 self-audit / 测试失败自动重试 ≤ 2 次，仍红则停下报告
- 末步完成 → STOP（实施完成），进入 Stage A

## 6. 严重问题 = 5 种 stop 触发

1. audit/test 失败，自动重试 2 次后仍红
2. 即将触碰 SPEC § 禁区文件清单
3. 现有测试基线断言被破坏（如 i2v.spec.ts 红）
4. SPEC AC 与实际代码逻辑冲突，无法明确选择
5. 外部依赖中断（数据库 / 网关 / npm install / 网络等）

任一触发 → 立即停下，TASK_LOG 写明原因，等用户判断。其它情况自动推进。

## 7. 提交前硬性检查

```bash
npm test   # 必须全绿，有红测试禁止提交
```

测试失败 → TASK_LOG 记录原因，修复后重跑，**不得注释或跳过用例**。

## 8. TASK_LOG 格式

```
[任务ID] | [状态] | [角色] | [时间戳] | [可选摘要]
状态枚举：启动 → 代码完成 → 测试通过 → Review通过 → 归档
```

禁止修改历史记录，只追加。

**CC 会话末额外要求**：每次会话结束前必须在 TASK_LOG.md 末尾追加 `[SESSION-END]` 条目，承担 "CC → 下一个 CC 会话" 的握手职责。格式见 [SOP §附录 H](Docs/Core/SOP.md)。

## 9. 禁止事项

- `AGENTS.md` / `CLAUDE.md` 禁止 Codex 修改（仅 CC 或用户）
- `Docs/Core/` 目录仅 CC 可修改
- Codex 不得直接 push 到 main，必须经 CC Stage A
- 未经用户确认不得删除文件或执行破坏性操作（详见 SOP 附录 D 权限矩阵 🔴 类）
- `PLAYBOOK.md` 仅由 CC 撰写 Step 框架，Codex 实施时只更新状态（🔲 → ⏳ → ✅），**不得新增 / 删除 / 跳过 / 合并 Step**
- Codex 不得自主重构 / 抽象代码 — 抽象决策必须 CC 主导（详见 SOP 附录 B）
- CC 越界编辑 `src/* / tests/* / prisma/*` 必须先在 TASK_LOG 报备（详见 SOP 附录 G）
- **Rewind > Correct**：CC/Codex 走错路时优先 `/rewind` 退回失败前的状态再重新提示，**不允许 fix forward 让失败痕迹污染上下文**
