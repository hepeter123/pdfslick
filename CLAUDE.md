# PDF 工具站 — PDFSlick 项目文档

> **新对话快速上手**：直接跳到「## 当前项目状态」和「## 已修复问题记录」了解现状，再看「## 下一步待办」确定任务。

---

## 当前项目状态（2026-03-28）

### 项目基本信息
- **网站名称**：PDFSlick
- **技术栈**：纯前端（HTML + CSS + JS），有 i18n 构建步骤 `node build-i18n.js`
- **本地预览**：`python serve.py` 或 `node serve.js`，访问 http://localhost:8080
- **部署目标**：Cloudflare Pages（通过 GitHub 仓库）
- **项目根目录**：`d:/ai/PDF/`
- **工具总数**：12 个（全部已实现）

### 已完成的文件
```
d:/ai/PDF/
├── index.html                 ✅ 首页（12 个工具卡片、Trust、FAQ、Footer）
├── merge-pdf/index.html       ✅ 合并 PDF
├── compress-pdf/index.html    ✅ 压缩 PDF
├── pdf-to-jpg/index.html      ✅ PDF 转 JPG
├── jpg-to-pdf/index.html      ✅ JPG 转 PDF
├── split-pdf/index.html       ✅ 拆分 PDF
├── rotate-pdf/index.html      ✅ 旋转 PDF
├── pdf-to-png/index.html      ✅ PDF 转 PNG（无损、透明背景）
├── add-watermark/index.html   ✅ 添加水印（文字水印、可调位置/透明度/颜色）
├── unlock-pdf/index.html      ✅ 解锁 PDF（自动检测加密、密码输入）
├── protect-pdf/index.html     ✅ PDF 加密（PDF.js 渲染 + jsPDF 加密）
├── pdf-to-word/index.html     ✅ PDF 转 Word（PDF.js 文本提取 + docx 库）
├── word-to-pdf/index.html     ✅ Word 转 PDF（mammoth.js + html2pdf.js）
├── privacy.html               ✅ 隐私政策
├── css/style.css              ✅ 全局样式（Plus Jakarta Sans，主色 #E8573F）
├── js/
│   ├── app.js                 ✅ 公共逻辑（i18n、上传区、进度条、语言路径路由）
│   ├── merge.js               ✅ 合并功能
│   ├── compress.js            ✅ 压缩功能
│   ├── pdf-to-jpg.js          ✅ PDF 转 JPG
│   ├── jpg-to-pdf.js          ✅ JPG 转 PDF
│   ├── split.js               ✅ 拆分功能
│   ├── rotate.js              ✅ 旋转功能
│   ├── pdf-to-png.js          ✅ PDF 转 PNG
│   ├── watermark.js           ✅ 添加水印
│   ├── unlock.js              ✅ 解锁 PDF
│   ├── protect.js             ✅ PDF 加密
│   ├── pdf-to-word.js         ✅ PDF 转 Word
│   └── word-to-pdf.js         ✅ Word 转 PDF
├── i18n/                      ✅ 8 种语言翻译文件（en/zh/ja/ko/es/pt/fr/de）
├── build-i18n.js              ✅ 多语言页面构建脚本
├── zh/ ja/ ko/ es/ pt/ fr/ de/ ✅ 各语言独立页面（98 个生成页面）
├── sitemap.xml / robots.txt   ✅ 含 hreflang、所有 14 个英文页面
├── serve.py / serve.js        ✅ 本地开发服务器
└── assets/icons/ assets/images/  （空目录，待填充）
```

### CDN 依赖（无需安装）
| 库 | CDN URL | 用于 |
|---|---|---|
| pdf-lib 1.17.1 | `https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js` | merge/compress/split/rotate/jpg-to-pdf/watermark/unlock |
| PDF.js 3.11.174 | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js` | pdf-to-jpg/pdf-to-png/protect/pdf-to-word |
| JSZip 3.10.1 | `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` | pdf-to-jpg/pdf-to-png/split |
| jsPDF 2.5.1 | `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` | protect |
| docx 8.5.0 | `https://unpkg.com/docx@8.5.0/build/index.umd.js` | pdf-to-word |
| mammoth 1.8.0 | `https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js` | word-to-pdf |
| html2pdf.js 0.10.1 | `https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js` | word-to-pdf |

### 关键架构约定（新对话必读）
1. **脚本加载顺序**：所有工具页面必须先加载 `app.js`，再加载工具 JS。顺序错了所有功能都会失效。
   ```html
   <script src="CDN库"></script>
   <script src="/js/app.js"></script>      ← 必须第一
   <script src="/js/merge.js"></script>    ← 工具脚本在后
   ```
2. **HTML 元素 ID 规范**：全部使用 camelCase（`uploadZone`、`fileInput`、`progressContainer`、`resultSection`）。JS 文件也必须用同样的命名。
3. **i18n fallback 机制**：`applyTranslations()` 只在找到真实翻译时才替换文本（`if (val !== key)`），找不到 key 时保留 HTML 内联英文默认文字。所以 HTML 里的英文内联文本就是 fallback，不要删。
4. **进度/结果容器**：`showProgress(id)` 和 `showResult(id)` 会自动 `container.style.display=''` 显示容器，调用前不需要手动显示。`hideProgress(id)` 会设置 `display:none`。
5. **语言路由**：基于 URL 路径前缀路由（`/zh/merge-pdf/`），不再使用 `?lang=` 参数。英文页面在根目录，其他语言在 `/{lang}/` 子目录。
6. **构建步骤**：修改英文模板页面后，需运行 `node build-i18n.js` 重新生成所有语言页面。脚本会：
   - 为英文页面添加 hreflang 标签和路径路由语言切换
   - 为其他 7 种语言生成预翻译页面（title/meta/data-i18n 内容/内部链接）
   - 所有语言页面共享同一套 CSS/JS（绝对路径不变）

### 下一步待办
- [ ] 在真实浏览器中完整测试全部 12 个工具的功能（上传→处理→下载）
- [ ] 添加 Google Analytics 代码
- [ ] 添加 Google AdSense 广告代码（已有占位符）
- [ ] 上传 GitHub → 连接 Cloudflare Pages 部署
- [ ] 为 assets/icons/ 添加 favicon 和 PWA manifest
- [ ] 考虑添加 Service Worker 实现离线支持

---

## 已修复问题记录

### Bug 批次 1（2026-03-28）：语言切换菜单默认展开
**问题**：语言切换下拉菜单页面加载后默认展开，遮挡页面内容。
**根因**：HTML 使用 `class="lang-dropdown"` / `id="langBtn"` / `data-lang`，但 CSS 仅对 `.lang-switcher__dropdown` 设置 `display:none`，JS 查找 `#lang-toggle` / `#lang-dropdown` / `[data-lang-option]`，三端命名不一致导致 CSS 隐藏规则和 JS 事件绑定均失效。
**修复文件**：`css/style.css`、`js/app.js`

---

### Bug 批次 2（2026-03-28）：三个核心 Bug

#### Bug 1：翻译 key 显示为原始字符串（如 `tools.mergePdf.title`）
**根因**：`applyTranslations()` 对所有 `[data-i18n]` 元素无条件 `el.textContent = t(key)`，key 不存在时 `t(key)` 返回 key 字符串本身，覆盖了 HTML 内联英文。
**修复**：`js/app.js` 中 `applyTranslations()` 加条件 `if (val !== key)` 才替换，保留 HTML 内联文字作 fallback。

#### Bug 2：上传功能完全不响应
**根因**（三层叠加）：
1. 所有工具页面 `app.js` 在工具 JS **之后**加载 → 工具 JS 运行时 `window.i18nReady`、`setupUploadZone` 等均 undefined
2. 所有工具 JS 用 kebab-case ID（`upload-zone`、`file-input`、`status-section`、`result-section`），HTML 用 camelCase（`uploadZone`、`fileInput`、`progressContainer`、`resultSection`）→ getElementById 全返回 null
3. `showProgress()`/`showResult()` 往容器里注入子元素但从不取消 `display:none` → 容器永远不可见
**修复文件**：
- 6 个工具 HTML 页面：调换 script 加载顺序（app.js 移到前面）
- `js/app.js`：`showProgress` 加 `container.style.display=''`；`hideProgress` 加 `container.style.display='none'`；`showResult` 加 `container.style.display=''`
- 6 个工具 JS 文件：全部重写，使用与 HTML 一致的 camelCase ID

#### Bug 3：语言下拉菜单横向平铺
**状态**：CSS `display:none` 已在 Bug 批次 1 修复中正确设置。若仍看到问题，按 **Ctrl+Shift+R** 强制清除浏览器缓存。

---

## 本地开发

```bash
cd d:/ai/PDF

# Python（推荐，无需安装）
python serve.py
# 访问 http://localhost:8080

# 或 Node.js（无依赖）
node serve.js
```

也可安装 VS Code **Live Server** 扩展（作者 Ritwick Dey），右键 index.html → Open with Live Server。

---

## 后续优化提示词（备用）

- `"请测试并修复 Compress PDF 页面的功能，确保压缩后能正确显示文件大小对比并下载"`
- `"请把 i18n/en.json 补充完整，把所有工具 HTML 页面里实际用到的 data-i18n key 都加进去"`
- `"请添加 Google Analytics 4 跟踪代码，tag ID 是 G-XXXXXXXXXX"`
- `"请把 AdSense 占位符替换为真实广告代码，publisher ID 是 ca-pub-XXXXXXXXXX"`
- `"请帮我实现 PDF to Word 功能页面"`
- `"请检查移动端响应式，在 375px 宽度下上传区域和按钮是否易于触摸操作"`

---

## 原始设计提示词（备用，项目已生成无需再用）

<details>
<summary>点击展开原始提示词（一次性生成整个项目用）</summary>

## 提示词正文（直接复制以下内容）

```
你是一位资深的前端工程师和产品设计师。请帮我构建一个面向全球用户的在线 PDF 工具站，这是一个独立开发者的出海产品，需要专业、现代、值得信赖的设计感，绝对不能有廉价模板的感觉。

---

## 一、项目概述

网站名称：PDFGear Pro（暂定，你可以建议更好的名称，要求：简短好记、.com 域名可能可用、一眼能看出是 PDF 工具）

定位：免费在线 PDF 工具箱，帮助全球用户快速处理 PDF 文件，无需注册、无需安装软件。

技术栈：纯前端（HTML + CSS + JavaScript），所有 PDF 处理在浏览器端完成，不上传文件到服务器（这也是隐私卖点）。

部署平台：Cloudflare Pages（通过 GitHub 仓库部署）。

---

## 二、需要实现的功能页面

请为以下每个功能创建独立页面，每个页面都是一个完整的工具，用户进来就能直接使用：

### 核心功能（第一批上线）
1. **Merge PDF** — 合并多个 PDF 文件为一个，支持拖拽排序
2. **Compress PDF** — 压缩 PDF 文件体积，显示压缩前后大小对比
3. **PDF to JPG** — 将 PDF 每一页转换为 JPG 图片，支持批量下载
4. **JPG to PDF** — 将多张图片合并为一个 PDF 文件
5. **Split PDF** — 拆分 PDF，支持按页码范围拆分
6. **Rotate PDF** — 旋转 PDF 页面（90°/180°/270°）

### 进阶功能（第二批，先预留页面入口，标注 "Coming Soon"）
7. **PDF to Word** — PDF 转 Word 文档
8. **Word to PDF** — Word 转 PDF
9. **PDF to PNG** — PDF 转 PNG 图片
10. **Add Watermark** — 给 PDF 添加文字或图片水印
11. **Unlock PDF** — 移除 PDF 密码保护
12. **Protect PDF** — 给 PDF 添加密码保护

---

## 三、页面结构

### 1. 首页（Landing Page）
- **Hero 区域**：一句话说明价值主张，例如 "Free Online PDF Tools — No Upload, No Signup, 100% Private"，配一个主 CTA 引导用户选择工具
- **工具网格**：以卡片形式展示所有工具，每个卡片包含图标 + 工具名称 + 一句话描述，点击直接进入对应工具页
- **信任要素区**：展示三个核心卖点（浏览器端处理不上传文件 / 完全免费无限制 / 无需注册即可使用），用图标 + 简短文案
- **FAQ 区域**：5-6 个常见问题，用手风琴折叠样式
- **Footer**：包含所有工具链接、语言切换、隐私政策链接、版权信息

### 2. 工具页面（每个功能一个页面）
- 顶部导航栏，包含 Logo 和返回首页的链接，以及语言切换
- 工具标题 + 一句话描述该工具的作用
- **操作区域**：大面积的拖拽上传区域，支持点击上传和拖拽上传，视觉上要醒目
- **操作按钮**：明确的行动按钮（如 "Merge Now" "Compress Now"）
- **结果区域**：处理完成后显示下载按钮，显示处理结果信息（如压缩率、页数等）
- **使用说明**：在工具下方用 3 个步骤图示说明如何使用（Step 1: Upload → Step 2: Process → Step 3: Download）
- **SEO 内容区**：每个工具页面底部都需要一段 300-500 字的英文说明文字，解释这个工具是什么、适用场景、为什么选择我们。这段文字是给 Google 看的，帮助 SEO 排名。

---

## 四、设计要求

### 整体风格
- **专业、干净、现代**，参考 Notion、Linear、Vercel 这类产品的设计语言
- 不要用烂大街的紫色渐变或蓝色渐变，选择一个有辨识度但不刺眼的主色调
- 背景不要纯白，可以用极浅的灰或带质感的背景
- 圆角卡片、微妙的阴影、精致的间距
- 整体要让用户感觉"这是一个认真做的产品"，而不是"一个周末做的玩具"

### 字体
- 不要使用 Arial、Inter、Roboto 这些过于常见的字体
- 推荐使用 Google Fonts 中有特色但可读性好的字体组合（如标题用 Plus Jakarta Sans / DM Sans / Outfit，正文用 Source Sans 3 等）
- 字体层级要清晰：大标题、小标题、正文、辅助文字各有不同的大小和粗细

### 颜色
- 选择一个主色（用于按钮、高亮、链接），一个辅色，再加上中性色系（灰色系列用于文字和背景）
- 所有颜色用 CSS 变量定义，方便后续修改
- 确保对比度符合无障碍标准（WCAG AA）

### 动画和交互
- 页面加载时卡片有轻微的淡入动画（stagger effect）
- 按钮 hover 有平滑过渡效果
- 文件拖入上传区域时有视觉反馈（边框变色、背景变化）
- 处理进度用进度条或加载动画展示
- 不要过度动画，保持优雅克制

### 响应式
- 必须完美适配桌面端、平板和手机
- 移动端的上传区域和按钮要足够大，方便触摸操作
- 导航栏在移动端变为汉堡菜单

---

## 五、多语言支持

实现一个轻量的 i18n 方案（纯前端，不需要框架）：

### 支持语言（第一批）
- English（默认）
- 简体中文
- 日本語
- 한국어
- Español
- Português
- Français
- Deutsch

### 实现方式
- 用 JSON 文件存储每种语言的翻译文本
- 页面右上角有语言切换下拉菜单，显示国旗或语言名称
- 切换语言时不刷新页面，动态替换文本
- URL 结构建议用 `?lang=zh` 参数或 `/zh/` 路径前缀（对 SEO 更友好的方案你来决定）
- 每种语言的 SEO meta 标签（title、description）也需要翻译

---

## 六、SEO 要求

每个页面都需要：
- 独立的 `<title>` 和 `<meta description>`，针对该工具的核心关键词优化
- 合理的 H1、H2 标签层级
- 结构化数据（Schema.org 的 WebApplication 类型）
- Open Graph 和 Twitter Card meta 标签
- `sitemap.xml` 文件
- `robots.txt` 文件
- 语义化 HTML 标签
- 图片 alt 标签
- 页面加载速度优化（关键 CSS 内联、JS 延迟加载）

### SEO 关键词方向（每个工具页面针对的核心关键词）
- Merge PDF → "merge pdf online free", "combine pdf files", "pdf merger"
- Compress PDF → "compress pdf online free", "reduce pdf size", "pdf compressor"
- PDF to JPG → "pdf to jpg converter", "convert pdf to image", "pdf to jpeg online"
- JPG to PDF → "jpg to pdf converter", "image to pdf", "photo to pdf online"
- Split PDF → "split pdf online free", "separate pdf pages", "pdf splitter"
- Rotate PDF → "rotate pdf online", "rotate pdf pages", "pdf rotator"

---

## 七、技术实现

### 核心库
- **pdf-lib**（用于合并、拆分、旋转、添加水印等操作）
- **PDF.js**（Mozilla 的库，用于预览和将 PDF 渲染为图片）
- 不使用任何前端框架（React/Vue），保持纯 HTML/CSS/JS 以确保最快加载速度

### 项目结构
```
/
├── index.html                 # 首页
├── merge-pdf/index.html       # 合并 PDF
├── compress-pdf/index.html    # 压缩 PDF
├── pdf-to-jpg/index.html      # PDF 转 JPG
├── jpg-to-pdf/index.html      # JPG 转 PDF
├── split-pdf/index.html       # 拆分 PDF
├── rotate-pdf/index.html      # 旋转 PDF
├── css/
│   └── style.css              # 全局样式
├── js/
│   ├── app.js                 # 公共逻辑（导航、语言切换、主题等）
│   ├── merge.js               # 合并功能
│   ├── compress.js            # 压缩功能
│   ├── pdf-to-jpg.js          # PDF 转图片功能
│   ├── jpg-to-pdf.js          # 图片转 PDF 功能
│   ├── split.js               # 拆分功能
│   └── rotate.js              # 旋转功能
├── i18n/
│   ├── en.json
│   ├── zh.json
│   ├── ja.json
│   ├── ko.json
│   ├── es.json
│   ├── pt.json
│   ├── fr.json
│   └── de.json
├── assets/
│   ├── icons/                 # 工具图标（建议用 SVG）
│   └── images/                # 其他图片资源
├── sitemap.xml
├── robots.txt
└── privacy.html               # 隐私政策页面
```

### 重要技术细节
- 所有文件处理必须在浏览器端完成（使用 Web Workers 避免阻塞 UI）
- 处理大文件时显示进度条
- 处理完成后的文件使用 Blob URL 提供下载
- 注意内存管理，处理完成后释放 Blob URL

---

## 八、隐私政策页面

创建一个简洁的隐私政策页面，核心内容：
- 我们不上传用户文件到任何服务器
- 所有处理在用户浏览器本地完成
- 我们不收集个人信息
- 网站可能使用 Google Analytics 统计访问数据
- 网站可能展示 Google AdSense 广告

---

## 九、广告位预留

在以下位置预留 Google AdSense 广告位（先用占位符标注，后续替换为真实广告代码）：
- 工具页面的工具区域下方
- 工具页面的 SEO 内容区旁边（侧边栏位置，桌面端）
- 首页工具网格下方

---

## 十、输出要求

请按照上述项目结构，完整输出所有文件的代码。确保：
1. 代码可以直接运行，不需要任何构建步骤
2. 所有功能都是可用的（不是占位符）
3. 设计是精致的、有品质感的
4. 多语言切换是可用的
5. 所有 SEO 元素都已设置
6. 响应式在手机端表现良好

先从首页和 Merge PDF 功能开始，确保这两个页面完全可用后，再依次完成其他功能页面。
```

</details>
