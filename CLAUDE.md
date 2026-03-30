# PDFSlick 项目文档（含 AI 论文理解助手）

> **新对话快速上手**：直接跳到「## 当前项目状态」了解现状，再看「## 下一步：AI 论文理解助手重构提示词」获取完整开发指令。

---

## 当前项目状态（2026-03-30）

### 项目基本信息
- **网站名称**：PDFSlick
- **线上地址**：https://pdf-slick.com
- **技术栈**：纯前端（HTML + CSS + JS），有 i18n 构建步骤 `node build-i18n.js`
- **本地预览**：`python serve.py` 或 `node serve.js`，或 VS Code Live Server
- **部署方式**：GitHub（hepeter123/pdfslick）→ Cloudflare Workers
- **域名**：pdf-slick.com（Cloudflare 注册）
- **Google Search Console**：已验证，sitemap 已提交且 Success
- **Google Analytics**：已接入，Measurement ID: G-K5L3LS3MCY

### 已上线功能
| 状态 | 工具 | 技术方案 |
|------|------|----------|
| ✅ | Merge PDF | pdf-lib 合并 |
| ✅ | Compress PDF | pdf-lib 压缩 |
| ✅ | PDF to JPG | PDF.js + Canvas |
| ✅ | JPG to PDF | pdf-lib 嵌入图片 |
| ✅ | Split PDF | pdf-lib 拆分 |
| ✅ | Rotate PDF | pdf-lib 旋转 |
| ✅ | PDF to PNG | PDF.js + Canvas（无损，1x/2x/3x 缩放）|
| ✅ | Add Watermark | pdf-lib drawText |
| ✅ | Unlock PDF | pdf-lib 加载加密 PDF |
| ✅ | Protect PDF | PDF.js + jsPDF 加密 |
| ✅ | PDF to Word | PDF.js 文本提取 + docx 库 |
| 🔜 | Word to PDF | Coming Soon（需后端 ConvertAPI + Cloudflare Worker）|
| 🔄 | AI Paper Assistant | 已有第一版代码，需要按新设计重构 |

### 已完成的基础设施
- ✅ 多语言支持：8 种语言（en/zh/ja/ko/es/pt/fr/de），98 个生成页面
- ✅ SEO：sitemap.xml、robots.txt、hreflang、结构化数据、Open Graph
- ✅ Google Search Console 验证 + Sitemap 提交成功
- ✅ Google Analytics 跟踪代码（G-K5L3LS3MCY）
- ✅ 隐私政策页面
- ✅ 广告位预留（待接入 AdSense）
- ✅ 首页已改版（AI 主题 Hero、AI Feature 卡片、导航栏 AI Paper 链接）
- ✅ Cloudflare Worker 代理已创建（workers/ai-paper/）
- ✅ 默认语言已修复为英文

---

## 项目文件结构

```
d:/ai/PDF/
├── index.html                 ✅ 首页（已改版，AI 主题）
├── merge-pdf/index.html       ✅ 合并 PDF
├── compress-pdf/index.html    ✅ 压缩 PDF
├── pdf-to-jpg/index.html      ✅ PDF 转 JPG
├── jpg-to-pdf/index.html      ✅ JPG 转 PDF
├── split-pdf/index.html       ✅ 拆分 PDF
├── rotate-pdf/index.html      ✅ 旋转 PDF
├── pdf-to-png/index.html      ✅ PDF 转 PNG
├── add-watermark/index.html   ✅ 添加水印
├── unlock-pdf/index.html      ✅ 解锁 PDF
├── protect-pdf/index.html     ✅ PDF 加密
├── pdf-to-word/index.html     ✅ PDF 转 Word
├── word-to-pdf/index.html     🔜 Coming Soon
├── ai-paper/index.html        🔄 需重构 — AI 论文理解助手
├── privacy.html               ✅ 隐私政策
├── css/style.css              ✅ 全局样式（含 AI 页面样式）
├── js/
│   ├── app.js                 ✅ 公共逻辑（默认语言已修复为英文）
│   ├── ai-paper.js            🔄 需重构 — AI 论文助手逻辑
│   ├── merge.js ~ word-to-pdf.js  ✅ 各工具逻辑
├── i18n/                      ✅ 8 种语言翻译文件（含 AI 功能翻译）
├── build-i18n.js              ✅ 多语言构建脚本（含 ai-paper）
├── sitemap.xml / robots.txt   ✅ SEO 文件（含 ai-paper）
├── serve.py / serve.js        ✅ 本地服务器
├── workers/ai-paper/          ✅ Cloudflare Worker（AI API 代理）
│   ├── worker.js
│   ├── wrangler.toml
└── DEPLOY-AI-WORKER.md        ✅ Worker 部署指南
```

### 关键架构约定（新对话必读）
1. **脚本加载顺序**：所有页面必须先加载 `app.js`，再加载工具 JS
2. **HTML 元素 ID 规范**：全部使用 camelCase（`uploadZone`、`fileInput`）
3. **i18n fallback**：HTML 内联英文是 fallback，翻译成功才替换
4. **语言路由**：路径前缀路由（`/zh/merge-pdf/`），英文在根目录
5. **构建步骤**：修改英文模板后运行 `node build-i18n.js` 重新生成语言页面
6. **默认语言**：已固定为英文，localStorage 记住用户手动选择

---

## 下一步：AI 论文理解助手重构提示词

> 将以下内容完整复制到 VS Code 中的 Claude 对话框。请一口气完成所有步骤，不要中途停下来问我是否继续。

```
我需要重构现有的 AI Paper Assistant 功能。之前已经做了第一版，但产品定位和交互设计需要彻底调整。请阅读项目根目录下的 CLAUDE.md 了解当前项目状态。

⚠️ 重要：请一口气完成所有步骤，不要中途停下来问我是否继续。每完成一步直接开始下一步。

---

## 一、产品定位（核心变更）

### 旧定位
"AI Paper Translator" — 翻译工具，把论文翻译成其他语言

### 新定位
"AI Paper Reader" — 学术语言理解工具

核心理念：这不是翻译工具，是帮助用户真正理解论文内容的工具。翻译只是手段，理解才是目的。

目标用户的痛点不是"看不懂英文"，而是"看不懂学术语言"。即使翻译成中文，很多学术表达普通人还是理解不了。我们要做的是把学术语言变成人话。

### 竞品分析
主要竞品是 SciSpace（scispace.com）。SciSpace 功能多但复杂，翻译偏学术，界面需要学习。我们的差异化：
1. **极致简单**：上传就能用，不需要注册，不需要学习
2. **通俗理解**：不只是翻译，而是用大白话解释学术概念
3. **原文对照**：左边原文右边理解，随时验证，给用户安全感
4. **追问深入**：任何看不懂的地方都可以继续追问

---

## 二、页面布局（核心变更）

### 整体结构：分屏对照

桌面端（≥1024px）采用左右分屏布局：

```
┌─────────────────────────────────────────────────────┐
│  导航栏：Logo | Home | AI Paper(当前) | PDF Tools | 语言切换  │
├────────────────────────┬────────────────────────────┤
│                        │                            │
│    左侧：论文原文       │    右侧：AI 理解面板        │
│    （PDF 渲染显示）     │                            │
│                        │  ┌────────────────────────┐│
│    用户可以在原文中     │  │ 论文概览卡片            ││
│    选中任意文字         │  │ 标题/作者/年份/期刊     ││
│    选中后出现浮动按钮   │  └────────────────────────┘│
│    "Explain this"      │                            │
│                        │  ┌────────────────────────┐│
│    点击后右侧显示      │  │ 全文摘要（通俗语言）    ││
│    该段落的理解内容     │  │ 500 字以内              ││
│                        │  └────────────────────────┘│
│                        │                            │
│    原文段落高亮时       │  ┌────────────────────────┐│
│    右侧自动滚动到      │  │ 当前选中段落的理解      ││
│    对应的理解内容       │  │                        ││
│                        │  │ 📖 学术翻译（精确）     ││
│                        │  │ 💡 通俗解释（大白话）   ││
│                        │  │ 🔄 改写建议（如需引用） ││
│                        │  └────────────────────────┘│
│                        │                            │
│                        │  ┌────────────────────────┐│
│                        │  │ 💬 追问对话框           ││
│                        │  │ "这段什么意思？"        ││
│                        │  │ "回归分析是什么？"      ││
│                        │  └────────────────────────┘│
│                        │                            │
├────────────────────────┴────────────────────────────┤
│  分隔线可拖拽调整左右宽度比例（默认 55:45）          │
└─────────────────────────────────────────────────────┘
```

移动端（<1024px）：
- 默认显示论文原文（全屏）
- 底部有一个悬浮按钮 "AI Assistant 🤖"
- 点击后从底部弹出 AI 理解面板（占屏幕 70% 高度，可上下滑动）
- 面板内容和桌面端右侧一致
- 用户在原文中长按选中文字，自动弹出 AI 面板并显示解释

---

## 三、用户交互流程

### 阶段 1：上传论文
- 和其他工具页面一致的拖拽上传区域
- 支持 PDF 格式，文件大小限制 20MB
- 上传后立即进入分屏阅读模式

### 阶段 2：自动生成概览（上传后自动执行）
上传完成后，AI 自动完成两件事：
1. **提取论文元信息**：标题、作者、年份、期刊（AI 识别）
2. **生成全文摘要**：用通俗语言概括论文核心内容（500 字以内）

右侧面板顶部显示论文概览卡片和全文摘要。
左侧显示论文原文 PDF（用 PDF.js 渲染）。

### 阶段 3：选中理解（用户主动操作）
用户在左侧原文中选中任意一段文字：
1. 选中文字上方出现浮动工具栏，包含三个按钮：
   - "📖 Translate"（学术翻译）
   - "💡 Explain"（通俗解释）
   - "🔄 Rewrite"（改写建议）
2. 点击任一按钮，右侧面板自动滚动到对应位置并显示结果
3. 结果以卡片形式展示：

```
┌──────────────────────────────┐
│ 📖 Academic Translation      │
│ "回归分析（regression         │
│ analysis）表明两个变量之间    │
│ 存在统计学显著相关性..."      │
├──────────────────────────────┤
│ 💡 Plain Explanation          │
│ "研究者用了一种叫'回归分析'  │
│ 的统计方法，简单来说就是      │
│ 看两个东西之间有没有关系。    │
│ 结果发现确实有关系，而且      │
│ 不是偶然的巧合。"            │
├──────────────────────────────┤
│ 🔄 Rewrite Suggestion        │
│ "如需在自己的论文中引用这个   │
│ 发现，可以这样写：            │
│ '该研究通过统计分析证实了     │
│ X 与 Y 之间存在显著关联。'"  │
├──────────────────────────────┤
│ 💬 Still confused? Ask more   │
│ [输入框：输入你的问题...]     │
│                    [发送]     │
└──────────────────────────────┘
```

### 阶段 4：追问对话
- 每张理解卡片下方都有追问入口
- 用户可以针对当前段落继续提问
- AI 基于论文上下文回答，使用用户选择的目标语言
- 对话历史保留在该段落的卡片中
- 也可以在右侧面板底部的通用对话框中提问（不限于某段落）

### 阶段 5：术语卡片（自动生成）
- AI 在生成摘要时，自动识别论文中的关键专业术语（8-15 个）
- 在右侧面板中摘要下方展示为可展开的术语卡片列表
- 每张卡片包含：英文术语 + 学术定义 + 通俗解释
- 用户点击可展开/收起

### 阶段 6：导出笔记
- 右侧面板顶部有 "Export Notes" 按钮
- 导出内容包含：论文元信息 + AI 摘要 + 所有理解卡片 + 所有追问对话 + 术语卡片
- 导出为 PDF 格式（使用 jsPDF 生成）
- 这份笔记可以直接用在文献综述中

---

## 四、目标语言选择

- 右侧面板顶部（论文概览卡片上方）放一个语言选择器
- 标签："Understand in:"（而不是 "Translate to"）
- 支持的目标语言：简体中文、日本語、한국어、Español、Português、Français、Deutsch
- 切换语言后，已生成的摘要和理解内容需要重新生成
- 新的选中操作直接使用新语言

---

## 五、技术方案

### PDF 原文渲染（左侧）
- 使用 PDF.js 渲染论文原文
- 支持页面滚动、缩放
- 支持文字选择（PDF.js 的 text layer）
- 选中文字后触发浮动工具栏

### 文字选中交互
```javascript
// 监听 PDF text layer 上的 mouseup 事件
// 获取选中文字 window.getSelection()
// 在选中文字上方显示浮动工具栏
// 工具栏包含 Translate / Explain / Rewrite 三个按钮
// 点击按钮后调用对应的 AI 任务
```

### AI API 调用
通过已有的 Cloudflare Worker（workers/ai-paper/worker.js）代理调用 Claude API。

需要支持的任务类型更新为：
1. `metadata` — 提取论文元信息（标题、作者、年份、期刊）
2. `summary` — 生成全文通俗摘要
3. `terms` — 提取关键术语并生成解释卡片
4. `translate` — 学术翻译（选中段落）
5. `explain` — 通俗解释（选中段落）
6. `rewrite` — 改写建议（选中段落）
7. `chat` — 基于论文的追问对话

### System Prompt 设计

**摘要任务（summary）：**
```
You are an academic paper reading assistant. Your job is to help non-experts understand research papers. Given a research paper, provide a clear summary in {target_language} that anyone can understand, even without background in this field.

Include:
1. What problem does this paper try to solve? (in one sentence)
2. How did they approach it? (methodology in simple terms)
3. What did they find? (key results)
4. Why does it matter? (significance)

Rules:
- Use everyday language, avoid jargon
- If you must use a technical term, explain it immediately
- Use analogies and examples where helpful
- Keep it under 500 words
- Write as if explaining to a smart friend who knows nothing about this field
```

**通俗解释任务（explain）：**
```
You are an expert at explaining complex academic concepts in simple, everyday language. A user is reading a research paper and has highlighted a passage they don't understand.

Your job:
1. Explain what this passage means in {target_language} using the simplest possible language
2. If there are technical terms, explain each one as if talking to a high school student
3. Use analogies from daily life where possible
4. If the passage contains data or statistics, explain what the numbers actually mean in practical terms
5. Keep the explanation concise but thorough

The passage is from this paper:
{paper_context}

The user highlighted:
{selected_text}
```

**学术翻译任务（translate）：**
```
You are a professional academic translator. Translate the following passage from English to {target_language}.

Rules:
- Maintain academic rigor and precision
- Keep technical terms with English originals in parentheses, e.g., "回归分析（regression analysis）"
- Preserve the original meaning exactly
- Keep the same paragraph structure

Passage to translate:
{selected_text}
```

**改写建议任务（rewrite）：**
```
You are an academic writing assistant. A user wants to reference a finding from a research paper in their own writing. Help them rephrase it in {target_language} in their own words while maintaining academic integrity.

Provide 2-3 rewrite options:
1. A formal academic version (suitable for a thesis or journal paper)
2. A semi-formal version (suitable for a report or presentation)
3. A casual version (suitable for a blog post or study notes)

Each version should:
- Convey the same meaning as the original
- Use completely different sentence structure and wording
- Be clearly NOT plagiarism
- Include a suggested citation format: (Author, Year)

Original passage:
{selected_text}

Paper context:
{paper_context}
```

**术语提取任务（terms）：**
```
You are an academic vocabulary expert. From the following research paper, identify 8-15 key technical terms that a non-expert reader would likely not understand.

For each term, provide in {target_language}:
1. The English term
2. A one-line academic definition
3. A one-line plain explanation (as if explaining to a 15-year-old)
4. An example of how it's used in daily life (if applicable)

Return as JSON array:
[
  {
    "term": "regression analysis",
    "academic": "A statistical method for examining relationships between variables",
    "plain": "A way to figure out if two things are related to each other, and by how much",
    "example": "Like checking if studying more hours actually leads to better test scores"
  }
]

Paper text:
{paper_text}
```

**追问对话任务（chat）：**
```
You are a patient, knowledgeable research assistant helping someone understand an academic paper. Answer the user's question in {target_language}.

Rules:
- Base your answer ONLY on the paper content provided
- If the answer cannot be found in the paper, say so honestly
- Use simple, clear language
- If the question involves a technical concept, explain it from scratch
- Keep answers concise (under 200 words unless the question requires more detail)

Paper content:
{paper_text}

Conversation history:
{chat_history}

User's question:
{user_question}
```

### 前端实现要点（js/ai-paper.js 重构）

1. **PDF 渲染**：使用 PDF.js 在左侧渲染论文，启用 text layer 支持文字选择
2. **浮动工具栏**：监听 text layer 的 mouseup 事件，选中文字后在上方显示 Translate/Explain/Rewrite 按钮
3. **分屏布局**：左右分屏，中间分隔线可拖拽调整比例
4. **流式显示**：AI 回答使用 SSE 流式传输，前端逐字显示（打字机效果）
5. **理解卡片**：每次用户选中并请求理解，在右侧面板生成一张卡片，卡片按时间顺序排列
6. **对话上下文**：每张卡片可以展开追问对话，对话带上论文上下文
7. **术语卡片**：摘要生成后自动请求术语提取，展示为可折叠的卡片列表
8. **导出功能**：收集所有卡片和对话内容，用 jsPDF 生成 PDF 笔记

### 分屏拖拽实现
```javascript
// 中间分隔线 div.resizer
// mousedown 开始拖拽
// mousemove 时计算左右宽度百分比
// mouseup 结束拖拽
// 限制最小宽度：左侧不小于 30%，右侧不小于 25%
// 移动端不显示分隔线，使用底部弹出面板
```

---

## 六、成本控制与变现

### 免费限制（localStorage 实现）
- 每个用户每天免费处理 **1 篇论文**
- 每篇论文免费 **"Explain" 5 次**（Translate 和 Rewrite 各 5 次）
- 每篇论文免费追问 **5 个问题**
- 全文摘要和术语卡片不限次数（只在上传时生成一次，成本固定）
- 超出限制显示升级提示

### 升级提示文案
```
"You've used your free explanations for today.
Upgrade to Pro for unlimited understanding of every paper you read.

🎓 Students: $6.9/month (with .edu email)
💼 Professional: $9.9/month
📅 Annual: $79.9/year (save 33%)

[Upgrade Now]  [Maybe Later]"
```

### 按次付费选项
- 单篇论文 $1.99：该篇论文无限理解 + 无限追问（24 小时有效）
- 适合偶尔需要读论文的人

---

## 七、SEO 设置

更新 ai-paper/index.html 的 SEO 元素：
- title: "AI Paper Reader — Understand Any Academic Paper in Plain Language | PDFSlick"
- meta description: "Upload any academic paper and instantly understand it. Get plain-language explanations, academic translations, and rewrite suggestions. Highlight any passage and ask AI to explain. Free daily usage."
- H1: "AI Paper Reader"
- 关键词方向："understand academic papers", "AI paper reader", "explain research paper", "academic paper helper", "paper reading assistant", "论文阅读助手", "论文理解工具"

---

## 八、设计要求

- 和现有 PDFSlick 保持一致的设计基调（Plus Jakarta Sans 字体）
- AI 功能区域使用区分色：深蓝紫色（#6C5CE7）作为 AI 功能的标识色
- 左侧 PDF 区域背景为浅灰（模拟纸张质感）
- 右侧 AI 面板背景为白色，卡片有微妙阴影
- 浮动工具栏使用圆角胶囊形状，带阴影，出现时有轻微弹出动画
- 理解卡片之间有清晰的视觉分隔
- 追问对话使用气泡样式（用户消息右对齐，AI 回答左对齐）
- 流式输出时有光标闪烁效果
- 整体感觉：安静、专注、学术但不沉闷

---

## 九、需要修改的文件

### 重构文件（基于已有第一版修改）
1. `ai-paper/index.html` — 重构页面布局为分屏对照模式
2. `js/ai-paper.js` — 重构交互逻辑（PDF 渲染、选中高亮、理解卡片、追问对话）
3. `css/style.css` — 更新 AI 页面样式（分屏布局、浮动工具栏、卡片、对话气泡）
4. `workers/ai-paper/worker.js` — 更新任务类型和 System Prompt

### 同步更新
5. `i18n/*.json` — 更新所有 8 种语言文件中的 AI 相关翻译 key
6. `sitemap.xml` — 确认 ai-paper 页面已包含
7. 运行 `node build-i18n.js` 重新生成所有语言页面

### 不要修改
- 首页 index.html（已改版，保持不变）
- 所有现有 PDF 工具页面和 JS 文件
- app.js（除非需要为 AI 页面添加公共功能）

---

## 十、开发顺序

请按以下顺序开发，一口气全部完成，不要中途停下来：

1. 重构 `ai-paper/index.html`（分屏布局、PDF 渲染区、AI 面板、浮动工具栏、卡片容器、对话框、术语区、导出按钮）
2. 重构 `css/style.css` 中的 AI 相关样式（分屏、拖拽分隔线、浮动工具栏、理解卡片、对话气泡、术语卡片、移动端适配）
3. 重构 `js/ai-paper.js`（PDF.js 渲染、文字选中检测、浮动工具栏交互、API 调用、流式显示、理解卡片管理、追问对话、术语卡片、导出笔记、免费额度控制）
4. 更新 `workers/ai-paper/worker.js`（新的任务类型、新的 System Prompt）
5. 更新 `i18n/*.json` 所有语言文件
6. 运行 `node build-i18n.js`

注意：在 Worker 部署前，前端应有 mock/fallback 模式，使用模拟数据展示 UI 效果，方便本地测试。
```

---

## 已修复问题记录

### Bug 批次 1：语言切换菜单默认展开
**根因**：CSS/JS/HTML 三端命名不一致
**修复文件**：`css/style.css`、`js/app.js`

### Bug 批次 2：翻译 key 显示为原始字符串 + 上传功能不响应
**根因**：applyTranslations 无条件替换 + 脚本加载顺序错误 + ID 不一致
**修复文件**：`js/app.js`、6 个工具 HTML、6 个工具 JS

### Bug 批次 3：sitemap URL 域名错误
**根因**：sitemap 中使用 pdfslick.com 而非 pdf-slick.com
**修复**：全局替换，重新生成语言页面

### Bug 批次 4：默认语言为中文
**根因**：app.js 自动检测浏览器语言
**修复**：移除 navigator.language 检测，默认英文，localStorage 记住手动选择

---

## 部署流程

### 日常更新
```bash
cd d:/ai/PDF
git add .
git commit -m "描述改了什么"
git push
# Cloudflare 自动部署，等 1-2 分钟
```

### AI Worker 部署
参照 DEPLOY-AI-WORKER.md：
1. 注册 Anthropic API（https://console.anthropic.com）获取 Claude API Key
2. 安装 wrangler：`npm install -g wrangler`
3. 登录：`wrangler login`
4. 进入目录：`cd workers/ai-paper`
5. 配置密钥：`wrangler secret put CLAUDE_API_KEY`
6. 部署：`wrangler deploy`
7. 更新 `js/ai-paper.js` 中的 `WORKER_URL`

### 多语言页面重新生成
```bash
node build-i18n.js
```
每次修改英文模板页面后都要运行。