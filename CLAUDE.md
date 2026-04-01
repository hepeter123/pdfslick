# PDFSlick 项目文档

> 最后更新：2026-03-31

---

## 一、项目概览

| 项 | 值 |
|---|---|
| **网站名称** | PDFSlick |
| **线上地址** | https://pdf-slick.com |
| **技术栈** | 纯前端（HTML + CSS + JS），AI 功能通过 Cloudflare Worker 代理 |
| **部署方式** | GitHub（hepeter123/pdfslick）→ Cloudflare Pages 自动部署 |
| **域名** | pdf-slick.com（Cloudflare 注册） |
| **AI API** | DeepSeek-V3（通过 Cloudflare Worker 代理，密钥在 Worker 环境变量中） |
| **AI Worker URL** | https://pdfslick-ai-paper.hepeter139.workers.dev |
| **Google Analytics** | G-K5L3LS3MCY |
| **Google Search Console** | 已验证，sitemap 已提交 |
| **多语言** | 8 种（en/zh/ja/ko/es/pt/fr/de），120 个页面 |
| **本地预览** | `node serve.js`（端口 8080） |

### 核心产品定位

**两大功能模块：**

1. **AI Paper Reader（核心功能）** — 学术论文辅助阅读
   - 上传 PDF → 左右分屏（左原文 / 右 AI 聊天）
   - 选中文字 → Explain（通俗解释）/ Translate（学术翻译）/ Rewrite（改写建议）
   - 自由提问、生成摘要、提取关键术语
   - 竞品对标：SciSpace。差异化：极致简单 + 通俗理解 + 无需注册

2. **PDF 工具站** — 纯前端 PDF 处理（文件不上传到服务器）
   - 12 个工具，全部浏览器本地处理，隐私安全

---

## 二、功能状态

| 状态 | 功能 | 技术方案 |
|------|------|----------|
| ✅ | AI Paper Reader | PDF.js 渲染 + DeepSeek API（流式 SSE）|
| ✅ | Merge PDF | pdf-lib |
| ✅ | Compress PDF | pdf-lib |
| ✅ | Split PDF | pdf-lib |
| ✅ | Rotate PDF | pdf-lib |
| ✅ | PDF to JPG | PDF.js + Canvas |
| ✅ | PDF to PNG | PDF.js + Canvas（1x/2x/3x 缩放）|
| ✅ | JPG to PDF | pdf-lib |
| ✅ | Add Watermark | pdf-lib drawText |
| ✅ | Unlock PDF | pdf-lib |
| ✅ | Protect PDF | PDF.js + jsPDF 加密 |
| ✅ | PDF to Word | PDF.js 文本提取 + docx 库 |
| 🔜 | Word to PDF | 需后端：ConvertAPI + Cloudflare Worker（代码已写好，未部署）|

### AI Paper Reader 详细功能

| 功能 | 状态 | 说明 |
|------|------|------|
| PDF 上传与渲染 | ✅ | PDF.js 4.8.69，支持缩放、文字选择 |
| 文字选中 + 浮动工具栏 | ✅ | Translate / Explain / Rewrite 三按钮 |
| 对话式聊天面板 | ✅ | 类 ChatGPT 气泡界面，支持 Markdown |
| 流式输出（打字机效果）| ✅ | SSE 流式 + 实时 Markdown 渲染 |
| 智能自动滚动 | ✅ | MutationObserver + 用户滚动暂停 + "New reply" 提示 |
| 摘要 & 术语提取 | ✅ | 按钮触发，AI 生成 |
| 图片/表格检测 | ✅ | PDF operator list 分析 + overlay + 操作菜单 |
| 导出笔记 | ✅ | 收集对话历史，新窗口打印 |
| 免费额度控制 | ✅ | localStorage，每日/每篇论文限额（当前测试设 999）|
| 手机端适配 | ✅ | 底部弹出面板，DOM 移动（非复制）|
| DeepSeek API 接入 | ✅ | Worker 已部署，API 测试通过 |
| 付费系统 | ❌ | 定价页面已展示，但支付未接入 |

---

## 三、文件结构

```
pdfslick-main/
├── index.html                    首页（AI 主题）
├── ai-paper/index.html           AI Paper Reader 页面
├── merge-pdf/index.html          合并 PDF
├── compress-pdf/index.html       压缩 PDF
├── split-pdf/index.html          拆分 PDF
├── rotate-pdf/index.html         旋转 PDF
├── pdf-to-jpg/index.html         PDF 转 JPG
├── pdf-to-png/index.html         PDF 转 PNG
├── jpg-to-pdf/index.html         JPG 转 PDF
├── add-watermark/index.html      添加水印
├── unlock-pdf/index.html         解锁 PDF
├── protect-pdf/index.html        PDF 加密
├── pdf-to-word/index.html        PDF 转 Word
├── word-to-pdf/index.html        Word 转 PDF（Coming Soon）
├── privacy.html                  隐私政策
├── css/style.css                 全局样式（~4900 行，含 AI 页面样式）
├── js/
│   ├── app.js                    公共逻辑（i18n、导航、上传组件、动画）
│   ├── ai-paper.js               AI 论文阅读器全部逻辑
│   ├── merge.js ~ word-to-pdf.js 各工具逻辑
├── i18n/
│   ├── en.json ~ de.json         8 种语言翻译文件
├── build-i18n.js                 多语言构建脚本（生成 /zh/ /ja/ 等目录）
├── sitemap.xml                   SEO sitemap
├── robots.txt                    SEO robots
├── serve.js / serve.py           本地开发服务器
├── workers/
│   ├── ai-paper/
│   │   ├── worker.js             Cloudflare Worker（DeepSeek API 代理）
│   │   └── wrangler.toml         Worker 配置
│   └── word-to-pdf/              Word 转 PDF Worker（未部署）
├── .env                          本地环境变量（不提交 git）
├── MIMA.env                      API 密钥备份（不提交 git）
├── .gitignore                    排除 .env / MIMA.env / node_modules
└── CLAUDE.md                     本文件
```

---

## 四、架构约定

1. **脚本加载顺序**：所有页面先加载 `app.js`，再加载工具 JS
2. **HTML 元素 ID**：camelCase（`uploadZone`、`fileInput`）
3. **i18n fallback**：HTML 内联英文是 fallback，翻译成功才替换；JS 中用 `i18n(key, fallback)`
4. **语言路由**：路径前缀（`/zh/merge-pdf/`），英文在根目录
5. **构建步骤**：修改英文 HTML 模板后运行 `node build-i18n.js`
6. **默认语言**：英文，localStorage 记住用户手动选择
7. **AI mock 模式**：`WORKER_URL` 为空时自动使用模拟数据
8. **CSS 变量**：全站统一设计系统（`--color-ai: #6C5CE7` 为 AI 功能标识色）

---

## 五、AI Worker 架构

```
浏览器 ──POST /api/ai-paper──► Cloudflare Worker ──POST──► DeepSeek API
       ◄─── SSE 流式响应 ────                   ◄── SSE ──
```

- **Worker 地址**：https://pdfslick-ai-paper.hepeter139.workers.dev
- **API**：DeepSeek-V3（`deepseek-chat`），OpenAI 兼容格式
- **密钥**：存在 Worker 环境变量 `DEEPSEEK_API_KEY`（加密存储）
- **前端 WORKER_URL**：`js/ai-paper.js` 第 16 行

### 支持的任务类型

| task | 用途 | max_tokens | temperature |
|------|------|-----------|-------------|
| metadata | 提取论文元信息 | 256 | 0 |
| summary | 全文通俗摘要 | 2048 | 0.3 |
| terms | 关键术语提取（JSON） | 2048 | 0.1 |
| translate | 学术翻译 | 1024 | 0.1 |
| explain | 通俗解释 | 1024 | 0.5 |
| rewrite | 改写建议 | 1024 | 0.6 |
| chat | 自由问答 | 1024 | 0.5 |

### 省钱优化

- explain/translate/rewrite：只发选中文本 + 前后 500 字上下文（~3KB），不发全文
- chat：发论文前 15000 字 + 最近 10 轮对话
- summary/terms：发论文前 15000 字

---

## 六、部署流程

### 日常更新（前端）
```bash
# 修改代码后
node build-i18n.js          # 重新生成语言页面
git add .
git commit -m "描述改了什么"
git push                     # Cloudflare 自动部署，1-2 分钟生效
```

### AI Worker 部署
```bash
cd workers/ai-paper
wrangler login               # 首次需要
wrangler deploy              # 部署/更新 Worker
wrangler secret put DEEPSEEK_API_KEY  # 设置密钥（首次/更换时）
```

### Word-to-PDF Worker（未部署）
需要：
1. 注册 ConvertAPI（convertapi.com，免费 250 次）
2. `cd workers/word-to-pdf && wrangler deploy`
3. `wrangler secret put CONVERTAPI_SECRET`
4. 更新 `js/word-to-pdf.js` 中的 WORKER_URL
5. 取消 `word-to-pdf/index.html` 中的脚本注释

---

## 七、上线前 TODO

- [ ] `ai-paper.js` 第 11 行 `FREE_PAPERS_PER_DAY` 从 999 改回 1
- [ ] 接入支付系统（定价页面已有，按钮无功能）
- [ ] Worker CORS 限制为 `pdf-slick.com`（当前是 `*`）
- [ ] 添加 favicon 和 OG 图片
- [ ] JS/CSS 压缩（当前未 minify）

---

## 八、已修复的历史 Bug

| 问题 | 根因 | 修复 |
|------|------|------|
| 语言切换菜单默认展开 | CSS/JS/HTML 命名不一致 | 统一命名 |
| 翻译 key 显示原始字符串 | applyTranslations 无条件替换 + 脚本加载顺序 | 修复条件判断+加载顺序 |
| sitemap URL 域名错误 | 用了 pdfslick.com 而非 pdf-slick.com | 全局替换 |
| 默认语言为中文 | navigator.language 检测 | 移除，固定英文 |
| 手机端 AI 面板不同步 | innerHTML 复制（死快照） | 改为 DOM 移动 |
| alert() 硬编码英文 | 未用 i18n | 改为 Toast + 8 语言翻译 |
