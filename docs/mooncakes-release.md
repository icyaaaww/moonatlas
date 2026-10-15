# Mooncakes 核心库发布

## 版本与范围

- 已发布：`icyaaaww/moonatlas@0.1.0`；[包文档](https://mooncakes.io/docs/icyaaaww/moonatlas)。
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

发布前检查压缩包内容，在独立目录解包后重新检查、运行测试与示例，确认包不依赖仓库内被排除的网页或 npm 文件。本次已完成。
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
当前 CLI 对该预检成功响应仍返回非零退出码；记录真实响应，不将它当作正式上传。

正式 `moon publish` 返回 `200 OK`，随后 `moon view icyaaaww/moonatlas` 返回 `0.1.0`、Apache-2.0 许可证与正确 GitHub 仓库。
注册表发布时间为 **2026-10-15 08:46:56 UTC / 北京时间 16:46:56**。
发布包对应源码提交：`7cf1cf069a2acd0091c24fdcecf199a4cc179a96`。
发布 ZIP 大小：45,817 字节，含 31 个文件；从注册表安装后的全部文件已逐个核对 SHA-256，与本地发布包一致。
SHA-256：`a930a994d98ddb3b8a7e9bbb18c468f48146a81b475e426be889fdeada52f631`。

| 验证 | 结果 |
| --- | --- |
| 独立解包后 `moon check --target all` | 通过 |
| 独立解包后核心测试 | JS 40/40、Wasm GC 40/40 |
| 独立解包后 `examples/demo` | 成功输出带出处的知识库索引 |
| 全新项目 `moon add icyaaaww/moonatlas` | 从注册表下载 0.1.0；生成明确版本依赖，无本地 path 依赖 |
| 消费项目构图/出处、搜索行号、批量分类、快照与体检 API | JS 4/4、Wasm GC 4/4 |
| 消费项目 `moon check --target all` 与可执行演示 | 通过，输出正确索引 |

消费项目只在测试代码中使用根包导入，因此常规检查有 unused_package 提示；不影响 4 项外部 API 测试或可执行演示。
这些是发布/安装工程验证，不是真实用户采用记录；不使用注册表下载计数证明用户数量。
