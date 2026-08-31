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

启动登录器前，需要先运行 `star-launcher-backend`，Rust 端默认请求 `http://110.42.9.56:8088`。如需使用其他后端地址（如本地开发），可在启动登录器前设置：

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

## 自更新与发版

启动器内置基于 `tauri-plugin-updater` 的自更新：

- **普通更新**：启动时发现新版本 → 弹窗展示 changelog，用户可"暂不更新"。
- **强制更新**：发布记录标记 `mandatory=1` 时，所有旧版本启动即弹出不可关闭的更新窗口，自动下载安装并重启。
- 每次更新完成重启后，自动弹出该版本的 changelog。
- 完整性由 minisign 签名校验保证（端点为纯 HTTP，签名是信任边界）。

发布记录存于后端 `db_star.launcher_release` 表（迁移：`star-launcher-backend/migrations/004_launcher_release.sql`），由后端动态生成两个接口：

- `GET /api/v1/launcher/update-policy` —— 业务信封，返回 `{version, mandatory, changelog, pubDate}`，驱动弹窗档位与更新后 changelog。
- `GET /api/v1/launcher/manifest?target=..&arch=..&current_version=..` —— Tauri updater 静态清单格式的**裸 JSON**；当前版本已是最新时返回 `204 No Content`。该端点写死在 `src-tauri/tauri.conf.json` 的 `plugins.updater.endpoints`，改后端地址需同步修改。

### 一次性：签名密钥

密钥对已生成于 `%USERPROFILE%\.tauri\star-launcher.key`（私钥，**务必备份**，丢失则无法再签发更新），公钥已写入 `tauri.conf.json` 的 `plugins.updater.pubkey`。如需重新生成：

```powershell
npm run tauri -- signer generate -w "$USERPROFILE/.tauri/star-launcher.key" --ci -p ""
```

### 每次发版

1. **同步 bump 两个版本号**：`src-tauri/tauri.conf.json` 的 `version` 和 `src-tauri/Cargo.toml` 的 `[package] version`（前者是 updater 的版本依据，后者是 `currentVersion` 显示来源）。
2. **构建**（产物带签名）：

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$USERPROFILE/.tauri/star-launcher.key"
   npm run tauri build
   ```

3. 从 `src-tauri/target/release/bundle/nsis/` 取 `STAR Launcher_<版本>_x64-setup.exe` 和同名 `.sig` 文件（若构建出的是 `.nsis.zip` + `.nsis.zip.sig` 组合则上传 zip）。
4. 将安装包上传到 `https://static.starcs.cn/launcher/`。
5. 插入发布记录（`signature` 填 `.sig` 文件的**全文内容**，不是 URL）：

   ```sql
   INSERT INTO launcher_release (version, mandatory, changelog, artifact_url, signature, pub_date)
   VALUES (
       '0.2.0',
       0,  -- 1 = 强制更新
       '## 更新内容\n- 新功能 A\n- 修复 B',
       'https://static.starcs.cn/launcher/STAR Launcher_0.2.0_x64-setup.exe',
       '<.sig 文件全文>',
       UTC_TIMESTAMP(6)
   );
   ```

"最新发布"按 `pub_date` 倒序取，同版本号可重新发布（用于撤回/替换）。

### 发版验证

- 接口级（本地后端 + 迁移 + 一行测试数据）：

  ```bash
  curl "http://127.0.0.1:8080/api/v1/launcher/update-policy"
  curl "http://127.0.0.1:8080/api/v1/launcher/manifest?target=windows&arch=x86_64&current_version=0.1.0"   # 200 + 清单
  curl "http://127.0.0.1:8080/api/v1/launcher/manifest?current_version=<最新版本>"                          # 204
  ```

- 端到端：安装旧版本 → 发布高一级的版本 → 启动旧版，普通更新弹窗 → 立即更新 → 重启后弹"更新完成" changelog；把某条发布改为 `mandatory=1` 再验证强制流程。`npm run tauri dev` 下更新检查自动跳过。

服务器列表由 `src-tauri/src/lib.rs` 中的 `fetch_star_servers` command 聚合：先请求 StarCS 公共 API，再为每台服务器执行一次 A2S 延迟探测。前端模型与转换逻辑位于 `src/lib/servers.ts`。

其他展示数据由 `fetch_launcher_bootstrap` command 请求 Go 后端的 `/api/v1/bootstrap`，TypeScript 契约位于 `src/lib/launcher-api.ts`。商城购买（星光/星尘）与装备配置经由 `/api/v1/me/*` 写回后端数据库。
