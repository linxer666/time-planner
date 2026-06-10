# 双线计划台

面向「算法实习 + 备考国考/广东省考」双线并行场景的个人时间管理网站。

采用 AI Finance 风格配色（蓝紫渐变、青绿点缀、白卡片大圆角），使用纯前端（HTML + CSS + JavaScript）+ Supabase 实现云端存储。

## 功能模块

### 今日计划
- 早上填今日计划（专注方向 + 目标），晚上填今日总结
- 国考 / 广东省考倒计时
- 本周完成率、紧急任务、本周重点展示

### 实习项目管理
- 项目 → 里程碑 → 任务 三级结构
- 本周重点（最多 3 条）、技术学习清单、实习日志

### 考公备考中心
- 刷题记录（APP + 纸质卷）+ 按题型分模块的正确率趋势图（行测/申论切换）
- 看课进度跟踪与打卡
- 错题本、每日总结、考试日历

### 资料库
- 上传 PDF / Word，分类标签，搜索，在线预览

### 申论积累（独立模块）
- 侧边栏 **申论积累** 独立入口
- 自动抓取 [人民锐评](http://opinion.people.com.cn/GB/436867/index.html) 与 [学习时评](https://news.southcn.com/node_85bedd3e4b)
- AI 提炼论点、金句、论据、对策框架
- 顶部展示「今日申论积累」，下方素材库可搜索、按主题/来源筛选、收藏

## 快速开始

### 1. 本地运行

```powershell
# 右键运行或在 PowerShell 中执行
.\start-server.ps1
```

浏览器打开：http://localhost:5173

未配置 Supabase 时，数据保存在浏览器 localStorage + IndexedDB（资料文件）。

### 2. 部署到 GitHub Pages（固定网址）

第一次部署：

```powershell
cd d:\Project\Python\time_planner
powershell -ExecutionPolicy Bypass -File .\deploy-github.ps1
```

或直接双击 `deploy-github.bat`（推荐，无需改系统策略）。

脚本会引导你登录 GitHub、创建仓库并开启 Pages。完成后访问：

`https://你的GitHub用户名.github.io/time-planner/`

以后改完功能，再运行一次 `.\deploy-github.ps1`（或 `git push`）即可自动更新网站。

**线上站登录 / 上传资料**：Supabase → **Authentication** → **URL Configuration**，在 **Redirect URLs** 里加上你的 Pages 地址，例如：

`https://linxer666.github.io/time-planner/`

资料上传走 Supabase Storage，需已执行 `supabase-storage.sql`。若上传报类型错误，在 SQL Editor 里重新执行该文件即可。

### 3. 配置 Supabase 数据库（推荐）

#### 第一步：创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com) 注册并 **New Project**
2. 记下数据库密码（仅 Supabase 后台用，网站不需要填）

#### 第二步：执行建表 SQL

在 Supabase Dashboard → **SQL Editor** → New query，按顺序执行：

| 顺序 | 文件 | 作用 |
|------|------|------|
| 1 | [`supabase-schema.sql`](supabase-schema.sql) | 建表 + 行级安全 RLS |
| 2 | [`supabase-storage.sql`](supabase-storage.sql) | 资料库 bucket + 文件权限 |
| 3 | [`supabase-migration.sql`](supabase-migration.sql) | 仅旧库升级时需要 |
| 4 | [`supabase-essay-schema.sql`](supabase-essay-schema.sql) | 申论积累表（收藏等个人数据） |

新建项目执行 1、2、4 即可。每条 SQL 点 **Run**，看到 Success 就行。

#### 第三步：开启邮箱登录

Dashboard → **Authentication** → **Providers** → Email 保持开启。

> 开发阶段可在 Authentication → Settings 关闭「Confirm email」，注册后可直接登录。

#### 第四步：填入前端配置

```powershell
copy supabase-config.example.js supabase-config.js
```

编辑 `supabase-config.js`，填入 Settings → **API** 里的：

- **Project URL** → `url`
- **anon public key** → `anonKey`

#### 第五步：验证

1. `Ctrl+F5` 刷新 http://localhost:5173
2. 侧边栏注册账号 → 登录
3. 左下角应显示「云端 + 本地」
4. 添加一条今日任务，点 **同步云端**，去 Supabase → **Table Editor** 看 `daily_tasks` 是否有数据

### 存储架构说明

| 层级 | 技术 | 存什么 |
|------|------|--------|
| 结构化数据 | Supabase PostgreSQL | 项目、任务、刷题记录、看课进度、设置等 |
| 资料文件 | Supabase Storage (`materials` bucket) | PDF / Word，按 `用户ID/文件名` 隔离 |
| 离线兜底 | localStorage + IndexedDB | 未登录或断网时本地可用；登录后可同步 |

**同步逻辑：**

- 登录 / 恢复会话 / 切回页面 → **自动双向同步**（本地与云端合并，含考试倒计时等设置）
- 每次增删改 → 自动 upsert 到云端对应表；修改设置 → 自动写入 `user_settings`
- 某张表拉取失败不会拖垮全部数据（单表容错）
- 点「同步云端」→ 手动触发完整双向同步（与自动逻辑相同）

**仍仅本机的内容：** 资料上传云端失败时标记为 `local_only` 的 PDF，需在该设备重新上传并确认提示「资料已上传到云端」。

### 常见问题

**Q: 登录后数据没了？**  
先点「导出备份」。若云端是空的、本地有数据，重新登录会自动上传；也可手动点「同步云端」。

**Q: 表已存在 / policy 已存在？**  
脚本支持重复执行。若报列不存在，再跑一遍 `supabase-migration.sql`。

**Q: 资料上传失败？**  
确认执行了 `supabase-storage.sql`，且已登录。

**Q: `supabase-config.js` 要提交 git 吗？**  
不要，已加入 `.gitignore`。只提交 `supabase-config.example.js`。

### 3. 浏览器提醒

侧边栏「提醒设置」中：
- 设置早上（默认 9:30）和晚上（默认 22:00）提醒时间
- 点击「开启浏览器提醒」授权通知
- 到点会弹出系统通知，点击跳转填写计划/总结

> 注意：浏览器通知需要页面曾被打开过；完全关闭浏览器后部分环境可能无法收到。

## 文件结构

```
time_planner/
├── index.html
├── styles.css          # 基础 UI（AI Finance 配色系统）
├── planner.css         # 本项目的模块样式
├── app.js              # 主逻辑、导航、认证
├── supabase-config.js          # Supabase 配置（本地创建，勿提交）
├── supabase-config.example.js  # 配置模板
├── supabase-schema.sql         # 数据库建表 + RLS
├── supabase-storage.sql        # 资料库 Storage
├── supabase-migration.sql      # 旧库增量迁移
├── modules/
│   ├── data-store.js   # 数据层（本地 + 云端）
│   ├── notifications.js
│   ├── dashboard.js
│   ├── projects.js
│   ├── exam.js
│   └── materials.js
└── start-server.ps1
```

## 申论积累流水线

### 手动运行

```powershell
copy .env.example .env   # 填入 AI_API_KEY

.\scripts\run_essay_pipeline.ps1          # 爬取 + AI 提炼
.\scripts\run_essay_pipeline.ps1 -Daily # 每日模式：每源抓1篇、各提炼1篇
```

### 每天自动更新（二选一）

**方案 A：本机定时（适合本地看）**

```powershell
.\scripts\setup_essay_scheduler.ps1
# 每天 07:00 自动跑，日志在 logs/essay-daily-YYYYMMDD.log
```

**方案 B：GitHub Actions（适合线上站，电脑关机也能更新）**

1. 仓库 Settings → Secrets → Actions，添加：
   - `AI_API_URL`
   - `AI_API_KEY`
   - `AI_MODEL`
2. push 代码后，`.github/workflows/essay-daily.yml` 每天北京时间 07:00 自动：
   - 爬取人民锐评 + 学习时评
   - AI 提炼并更新 `data/essay_public.json`
   - 自动 commit + push → GitHub Pages 同步

**本机定时且同步线上：**

```powershell
.\scripts\setup_essay_scheduler.ps1 -Push
```

每日模式会：每源抓取 1 篇新文章 → 南方/人民各提炼 1 篇 → 更新「今日推荐」两篇。

## 数据备份

侧边栏登录后可：
- **导出备份**：下载 JSON 文件
- **导入备份**：从 JSON 恢复数据

## 设计原则

- 每次记录不超过 3 分钟
- 详细字段均为选填，核心数字必填
- 网站负责量化追踪，详细笔记继续在 wolai 写（总结可附 wolai 链接）
