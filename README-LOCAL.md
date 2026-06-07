# 躁侯退休（VV版）本地干净版

这是一个只包含网站代码的本地版本，不包含原作者的个人数据、素材视频、截图、头像、登录信息、浏览器缓存或 Supabase 云端配置。

## 如何运行

1. 解压压缩包。
2. 进入解压后的文件夹。
3. 右键 `start-server.ps1`，选择“使用 PowerShell 运行”。
4. 看到提示后，在浏览器打开：

```text
http://localhost:5173
```

如果电脑没有 Python，请先安装 Python 3，或者先直接双击 `index.html` 试用基础页面。

## 数据保存在哪里

这个版本默认使用本机浏览器保存数据：

- TODO、目标、脑暴、文档、素材信息保存在当前浏览器的 localStorage。
- 视频、截图、附件等文件保存在当前浏览器的 IndexedDB。
- 换电脑、换浏览器或清理浏览器数据后，本地数据不会自动带过去。

## 云端说明

包里的 `supabase-config.js` 是空配置，因此不会连接原作者的数据库。

如果以后想做自己的云端同步，需要自己创建 Supabase 项目，并把自己的 Project URL 和 anon key 填入 `supabase-config.js`。
