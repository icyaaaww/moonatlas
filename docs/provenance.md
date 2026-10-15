# 来源、依赖与生态定位

## 实现来源

MoonAtlas 为本次独立设计的 MoonBit 核心和浏览器应用，不是某个现有项目的逐文件移植。
不把“Markdown 思维导图”称为未被探索的生态空白，也不声称世界首创。
基础 JSON bridge 与 .mbtx 构建组织方式参考同作者 MoonGuard；未改动 MoonGuard 工作区。
测试和演示资料由本项目生成，不含真实团队文档、真实事故或用户采用记录。

代码使用 Apache-2.0；见根目录 LICENSE。

## 有限范围的重叠检查

2026-10-15 开发过程中查阅了本地 Mooncakes 索引和相关 GitHub README。
索引缓存约为 2026-10-13；该检查不是对所有库与商业产品的穷尽调查。正式申报前应刷新索引并重新比对。

| 项目 | 已观察到的定位 | MoonAtlas 的实现重点 |
| --- | --- | --- |
| Xiao-li-He/MoonMarkMind | 单 Markdown 大纲编辑、SVG/HTML 导出、浏览器工具 | 跨文档原文证据、持续保留人工分类、资料集版本对比 |
| ZSeanYves/markitdown | 多格式内容转换 | 消费 Markdown/TXT；不重复构建格式转换器 |
| Rz-coder8848/moon-neo4j | Neo4j 客户端/协议 | 无数据库的有界本地文档图谱 |

MoonMarkMind: https://github.com/Xiao-li-He/MoonMarkMind ，索引版本 0.1.0，Apache-2.0。
Mooncakes: https://mooncakes.io 。未复制上述项目的代码或素材。
这些差异是工程定位，不代表审核通过或竞争优势已获用户验证。

## 依赖

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| MoonBit core | 核心类型、集合、JSON 等 | Apache-2.0，第三方来源另见 core NOTICE |
| moonbitlang/async 0.22.4（本机解析版本） | .mbtx 构建文件/命令操作 | Apache-2.0 |
| esbuild 0.28.2 | 开发时离线打包 | MIT |
| @playwright/test 1.64.1 | 开发时 Chromium 流程测试 | Apache-2.0 |

Node.js 开发服务器仅用内置模块；浏览器应用没有生产 npm 依赖。
MoonBit 编译后的 core 及编译器运行时位于生成文件中；打包器默认保留 legal comments。
离线交付包附本项目 LICENSE 与依赖许可副本。Node 依赖锁定在 package-lock.json；
.mbtx 工具链依赖可能随工具链解析更新，记录版本见 validation.md。
