# STAR Launcher

一个使用 Tauri 2、React、TypeScript、Vite、Tailwind CSS 4 和 shadcn/ui 结构初始化的服务器列表 Demo。

## 功能

- 服务器名称、地区、地图、模式、人数和延迟展示
- 首页服务器列表、公告、关键词搜索与状态过滤
- 通过 Tauri Rust command 拉取 StarCS 公共服务器 API
- 列表加载后并发执行一次 A2S UDP 延迟探测
- 公告、商城、库存与个人资料通过 STAR Launcher Go 后端获取
- 商城、库存与个人中心四个主导航页面
- 服务器详情、收藏状态和维护状态反馈
- 跟随系统 / 浅色 / 深色三档主题并持久化用户选择
- 本地 StarCS 品牌图标资源
- 响应式桌面布局
- Tauri 2 桌面窗口配置

## 开发

```bash
npm install
npm run tauri dev
```

启动登录器前，需要先运行 `star-launcher-backend`，默认地址为 `http://127.0.0.1:8080`。如需使用其他后端地址，可在启动登录器前设置：

```powershell
$env:STAR_LAUNCHER_BACKEND_URL = "https://launcher-api.example.com"
npm run tauri dev
```

只预览前端：

```bash
npm run dev
```

## 构建

```bash
npm run build
npm run tauri build
```

shadcn/ui 配置位于 `components.json`，可以继续通过 CLI 添加组件：

```bash
npx shadcn@latest add dialog
```

服务器列表由 `src-tauri/src/lib.rs` 中的 `fetch_star_servers` command 聚合：先请求 StarCS 公共 API，再为每台服务器执行一次 A2S 延迟探测。前端模型与转换逻辑位于 `src/lib/servers.ts`。

其他展示数据由 `fetch_launcher_bootstrap` command 请求 Go 后端的 `/api/v1/bootstrap`，TypeScript 契约位于 `src/lib/launcher-api.ts`。兑换与购买目前只在登录器内演示，尚未写回后端。
