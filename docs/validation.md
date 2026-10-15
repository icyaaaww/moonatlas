# 验证记录

日期：2026-10-15。以下为本机实际执行结果，不代表远程 CI、真实用户试用或全浏览器认证。

## 环境

- Windows，本地 D 盘工作目录。
- moon 0.1.20261012 (748b63c)，moonc v0.10.15+943464bfa。
- moonrun 0.1.20261012。
- Node.js v24.19.0。
- esbuild 0.28.2；Playwright 1.64.1；Chromium 156.0.8078.4。
- .mbtx 当前解析到 moonbitlang/async 0.22.4。

## 结果

| 检查 | 本机结果 |
| --- | --- |
| moon check --target all | 通过 |
| moon test --target js | 23 项通过，含 README 文档测试 |
| moon test --target wasm-gc | 同样 23 项通过 |
| moon info / moon fmt | 完成，生成接口已保存 |
| moon run examples/demo --target js | 输出含“回滚”跨文档线索的 Markdown 索引 |
| npm run build | 生成 MoonBit JS 核心及独立 HTML |
| npm test | 9 项通过 |
| npm run test:browser | 9 项 Chromium 流程通过 |
| 桌面 / 手机截图 | 已检查 1440×1000、390×844；手机页面无横向溢出 |

核心覆盖来源行号与身份、围栏、TXT、主题偏好、归并循环、引用状态、重复文档、
确定性排序、快照变化、重命名歧义、偏好迁移、导出转义及资源上限。

Node 集成覆盖编译后的实际 MoonBit bridge、格式拒绝、项目恢复、UTF-8、目录路径、
分享 HTML 的 script 边界转义、静态服务器白名单及无写入端点。
上限资料集含 200 篇、3,000 个标题、199 条链式归并规则，保留全部出处；
一次本地构建测量约 103 ms。只用于确认该用例可完成，不是通用性能承诺。

Chromium 使用独立测试环境、file:// 页面和离线网络设置，覆盖：

1. 地图、标题展开与准确原文定位。
2. 导入、分类修改、下载项目并重新打开。
3. 完整快照替换中的唯一重命名与分类延续。
4. 用户确认的概念归并和两份原文证据。
5. 含 HTML/script 字符串的资料导出、离线重开、字面显示。
6. 无效项目和错误编码被拒绝且现有资料集不变。
7. 已选标题前插入文字后，依稳定身份更新原文定位。
8. SVG 导出可由 XML 解析器读取且无 script 元素。
9. 原文全文检索、手机页面宽度和布局。

## 已知工具链提示与未验证项

- .mbtx 构建出现 `Duplicate import ... async/internal/c_buffer` 提示，来源于依赖导入，退出码为 0，产物及测试通过。
- 测试运行器提示 NO_COLOR/FORCE_COLOR 冲突，仅影响终端颜色。
- 已编写 Linux / Windows GitHub Actions，但未上传并实际运行远程 CI。
- 没有验证 Firefox、Safari、移动端真实设备、屏幕阅读器和各种第三方 Markdown 方言。
- 未进行真实用户试用、语义正确性评估或外部知识库连接验证。
- 包尚未发布到 Mooncakes；当前依赖版本/命名占位仍需发布前确认。

截图在本地 `test-results/desktop-map.png` 与 `test-results/mobile-map.png`，不把测试产物默认提交进 Git。
