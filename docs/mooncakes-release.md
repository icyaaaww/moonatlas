# Mooncakes 核心库发布

## 版本与范围

- 计划发布：`icyaaaww/moonatlas@0.1.0`。
- 对应网页应用：MoonAtlas 1.0.0；网页版本和库版本独立编号。
- 当前本机发布工具要求包主版本为 0，因此核心库首次使用 0.1.0。
- 核心库包含多文档图谱、原文证据、字面搜索、分类、内部引用、体检、快照比较和导出 API。
- `.moonignore` 明确限定发布内容：核心源码、40 项核心/文档测试、运行示例、库 README、许可证与相关架构/来源说明。
- 网页、生成的 JS、Node 开发依赖、浏览器测试、私有资料和构建缓存不进入 Mooncakes 包。

## 发布前检查

```sh
moon check --target all
moon info
moon fmt
moon test --target js
moon test --target wasm-gc
moon run examples/demo --target js
moon package --list
```

还需检查压缩包内容，在独立目录解包后重新检查、运行测试与示例，确认包不依赖仓库内被排除的网页或 npm 文件。
本项目只依赖 MoonBit 标准库，不需要用户提供 API Key 或上传原文。

## 登录与发布

在拥有 `icyaaaww` 命名空间的账号下执行 `moon login`，随后用 `moon whoami` 确认账号。
凭据仅保存在本机工具链目录；不要提交凭据、在日志中打印令牌或把授权码发到聊天中。
本机工具链使用 `D:\Codex\MoonGuard\work\moon-toolchain`，CLI 登录与发布需使用同一个 `MOON_HOME`。

```sh
moon publish --dry-run
moon publish
```

## 发布后验收

1. `moon view icyaaaww/moonatlas` 确认可见版本、许可证和源码地址。
2. 在全新的消费项目中执行 `moon add icyaaaww/moonatlas`，确认实际解析到本次发布版本。
3. 消费项目在 `moon.pkg` 导入根包，调用构图、搜索、分类及更新比较 API；运行 JS/Wasm GC 测试和演示。
4. 在网页包文档与仓库发布说明中记录可核对的结果，不把本地压缩包当成已经发布。

## 本次状态

已确认登录账号为 `icyaaaww`。独立解包后的全目标检查、JS/Wasm GC 各 40 项测试和运行示例均通过。
服务端预检返回 `202 Accepted`，正文明确为 `Dry run completed successfully. No changes were made.`，对应 `icyaaaww/moonatlas@0.1.0`。
当前 CLI 对该预检成功响应仍返回非零退出码；记录真实响应，不将它当作正式上传。实际发布与消费项目验证尚待执行。
