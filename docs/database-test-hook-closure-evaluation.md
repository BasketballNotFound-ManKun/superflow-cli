# 数据库测试分层与旧 Git Hook 接入修复

## 约束与设计

规范事实源为用户的新测试层级要求及全局设计/评价纲领。只在本仓与受管理的本机安装资产工作；充电业务仓只读，不写其源码、.git hooks、技能或业务库，不公开业务资料。保留已发布 0.5.17，新修复发布 patch。

复用 owner：coverage/文档审查冻结测试必要性，执行 receipt/lint 核验确定事实；deployScripts 负责规范脚本与已知旧兼容入口，hook 审计与 doctor 负责实际 Git 入口诊断。独立 Agent 判断层级充分性、真实生产 statement、schema 代表性及历史证据适用性。

基线 0.5.17：直接 lint 能拒绝非空预期与真实 NULL 不符；旧 pre-commit 仍调用 sdd-* 原实现。新版根级 report lint 的 --warn-only 也隐藏错误 PASS。脚本存在、时间或版本标记不证明接入有效。

数据库逻辑保留分层：Mock Service、SQL 生成/绑定、真实同类型 DB 集成、真实 HTTP 入口分别记录。历史总数不能替代层级或入口覆盖；绑定到已验证源码/构建版本的旧证据保留，但不能放行另一个源码版本。

## Global Constraints

- 全程中文；中文提交，50 字以内；Codex/Claude 与中英文同步。
- 不修改业务仓，不访问真实业务数据库；所有公开夹具匿名。
- 不新增平行 Skill/Hook/状态机；三个托管 Agent JSON 协议不变。
- Mock 可证明隔离逻辑，不能替代必测生产 SQL/同类型数据库/入口。
- 来源未知或自定义 Hook 保留；已知旧入口转换前备份，重复部署幂等。
- 只有确定的结构/来源/版本/引擎/断言事实归 CLI；测试必要性与充分性归独立评审。

## 实施任务

### Task 1: 数据库测试合同、执行证据与文档指导

所有权：assets/scripts/superflow-review-coverage.mjs、superflow-test-report-lint.py；对应 DB/receipt/doc-review 测试、匿名数据库夹具；两语 docs/design/implement/verify/table-impact Skill 与 pipeline references。

增加已有 coverage/receipt 的可选分层扩展：case.testLayer=logic|sql-binding|database|http-entry；entry.database 冻结 engine、major、schemaSourceRefs、生产 statements[{sourceRef,id}]。语义审查发现有 DB/字段/CAS/事务等影响时必须声明 database。该入口的必要 case 集合中须有 database/http-entry 真实DB用例，不能只有逻辑或 SQL 解析；辅助 Mock/sql-binding 用例不强迫连接 DB。真实 HTTP 若冻结 DB 义务也须完成生产链和 DB 断言。

case 冻结 mockBoundary（隔离外部客户端可允许；必测 Mapper/Service 不得 mock）、需要执行的 statement 与数据断言；receipt 和原始事件回填对应 testLayer/database/mockBoundary，数据库引擎与主版本匹配，不能以 H2/SQLite替 MySQL。生产 SQL 身份和 schema 来源纳入已有 sources 指纹；写入按同业务ID before/after/expected、影响行数与非目标/旧轮次保持不变验证。哪些风险需要哪些断言由文档冻结；不靠 SQL 关键词猜。

旧非持久化 case 兼容；旧持久化 PASS 缺新合同时保留为 partial，不默许完整通过。纯逻辑任务明确无持久化影响即免 DB。匿名 SQLite回放只验证 harness；新增匿名生产 Mapper XML + 真实MySQL回放，观察 Mock绿、XML漏字段而DB失败并被门禁拦截。不得修改生产断言迎合实现。

正反例：持久化只计划Mock缺必要DB用例；正确分层通过；纯逻辑免DB；DB引擎/statement/mock边界/指纹错配拒绝；环境缺失partial；历史固定源码证据仍可引用，不替当前改动；真实SQL漏字段失败。

### Task 2: 安装兼容入口、Git 提交路径与 doctor

所有权：src/domains/skill/scripts.ts、config/manifest.ts、assets/manifest.json、hook-migration.ts、commands/doctor.ts、hook-migrate.ts；superflow-delivery-check.sh、install-sql-pre-commit.sh；对应安装/Git/doctor测试。

规范脚本来源与实际安装内容对账；已知 sdd-delivery/lint/integration/sql 入口仅委托同目录 superflow-*，转换前备份。只接管精确已知旧指纹或规范 wrapper；符号链接、未知/自定义内容保留并诊断。创建兼容入口不创建重复门禁。Git Hook 实际路径用 git --git-path 获取，支持worktree/core.hooksPath；只读发现旧调用是否已委托当前脚本。业务仓实际hook不写，通过全局受管兼容入口恢复接入。

交付检查使用同安装目录脚本；根级错误 PASS 不再 --warn-only；合理partial或纯文档冻结仍可记录，不能通过历史Blocked文本让运行时错误PASS逃逸。校验Git index中的报告/相关证据与工作树一致，防工作树绿/index红。安装脚本保留自定义Hook，不再覆盖已有未知脚本；已有Git正式提交正反例从旧调用路径执行新门禁。

### Task 3: 独立复审、全量回归、发布与本机升级

复审两项scope与全分支；记录基线→变更→回归、剩余边界、回滚条件。执行全量 test/lint/build/设计门禁/strict skill audit、pack及包安装；真实发布下一patch、推送分支/annotated tag/GitHub Release、registry安装并在本机实际旧入口路径验证。发布授权沿本任务既有授权执行；认证确认保留为人工介入，不伪装零介入。

## 回滚条件与进度

若未知资产被覆盖、纯逻辑被强加DB、有效版本绑定的历史证据被误否定、Git路径与CLI来源不同或真实MySQL反例无法复验，应修正责任层或回滚实现，不放宽断言。

- Task 1: complete（独立复审两项结论 PASS）
- Task 2: complete（定向复审 PASS/PASS）
- Task 3: complete

## 基线、回归与关切记录

基线0.5.17存在两条独立缺口：受管旧入口仍调用历史实现；新版根级交付检查使用warn-only。匿名旧Git提交负例初跑两宿主均错误退出0；委托当前门禁后NULL伪PASS退出1，正确SQL证据退出0。初步全量103文件743 tests通过，后续整改后最终数量另行记录。

真实匿名MyBatis/MySQL8.0.36从一次性Git工作区的生产形状源码实际编译和执行：Mock逻辑绿，但漏字段XML affectedRows=1/after=NULL，原始业务断言FAIL；以错误PASS声明同一观测，正式Git仍拒绝。完整XML正确落库且非目标/旧轮次快照一致，正式Git提交成功。两宿主共用同一有效DB观测，不为宿主重复启动数据库。该回放仅证明harness路径，不证明任何私有业务实现。

独立复审先后发现行快照不足、bool/number混淆、unstaged依赖漏检、悬空链接和标准安装路由漏识别。前两项数据库整改已复审关闭，后三项已用新反例修复，最终复审待记录。公开产物只含匿名夹具和已知旧脚本摘要，不含业务源码/数据/凭据。

现有CLAUDE旧delivery摘要不属于确认的历史快照，按规范保留并诊断为unknown/custom；没有用日期或同名推断所有权。若实际Git引用未知入口，doctor不应报健康，需其owner核验。既有受管Canonical文件内容/执行权限都对当前包检查。Git诊断只核对标准可登记引用，不证明任意shell流程；必须保留实际提交回放。

历史结果仅对其固定源码、入口、数据库与构建成立；当前另一个任务的新代码未由旧结果覆盖。保留历史证据不等于自动给新提交PASS。没有可比成本样本，未宣称效率/Token普遍改善。

最终代码回归：103文件746项全部通过；Lint、构建、两设计门禁、严格Skill审计16/16与0镜像缺口通过。Task2定向复审关闭P1与两P2，未发现新增问题。打包发现Python缓存，已在资产目录排除，不能把本机缓存带入公开包。发布与本机正式升级已回查。

整分支复审发现并关闭暂存删除依赖与悬空入口注册两项跨模块问题，定向复审PASS。最终包402文件，未带Python缓存；Codex/Claude×中英文4次重复安装保留自定义资产，安装版本正反例通过，lint与已审查源一致。

## 最终发布与实际接入结果（2026-10-09）

0.5.18已真实发布，官方version/latest一致，包摘要与最终测试包一致。main及annotated tag v0.5.18已推送；GitHub Release工作流37896142881成功，中英文正文已核对。官方registry的本机两个既有安装与全局资产均更新到0.5.18。

活动项目实际Git Hook只读核验：2项旧Codex引用，2项当前委托且来源一致；doctor无失败项。将同一Git Hook原文复制到一次性匿名Git仓，调用本机实际全局旧路径，复用同版本有效MySQL观测：漏字段伪PASS提交退出1，完整SQL写入提交退出0；业务仓原Hook未改。

一个旧CLAUDE delivery未命中已知摘要，保留且WARN；任何项目若实际引用未知旧入口将doctor FAIL。这是保留未知资产的设计边界，不宣称其自动迁移。仅任务自有MySQL容器清理，未操作业务数据库；临时发布网络适配未进入公开产物。

npm：https://www.npmjs.com/package/@chenmk/superflow/v/0.5.18

Release：https://github.com/BasketballNotFound-ManKun/superflow-cli/releases/tag/v0.5.18

重启Host加载更新资产；语义充分性、生产链和历史证据适用性仍由独立Agent负责。

## 0.5.19 回归夹具环境隔离修正（2026-10-09）

责任层为测试宿主适配。0.5.18 的 Git helper 未向初始化、配置、暂存和旧基线提交传入临时 HOME，而 pre-commit 用 `$HOME` 查找旧入口。因此真实宿主已装新门禁时，夹具旧 exit-0 基线被正确拒绝。锁定依赖后独立重跑原五文件：59 通过、1 失败；不是生产门禁漏放。历史 746 项记录仅代表历史执行环境。

复用两个现有 Git/安装测试，以测试专用环境 helper 清除继承的 Git 仓库、索引及配置覆盖，限定 HOME/XDG，并禁用系统/全局 Git 配置。所有 Git 子进程共用环境；进程内审计同步限定同一环境并在 finally 恢复。独立 MySQL replay 的初始化、暂存、提交也统一隔离。没有新增 Skill、Hook 或状态，没有修改生产门禁与迁移 owner。

假设：夹具结果不再取决于真实宿主安装或 Git 配置。Codex/Claude × 当前拦截门禁、自定义失败脚本、未安装三状态，以及外部 hooksPath/config-count/仓库/索引污染均覆盖。独立评审发现审计环境漏隔离，整改后外部配置注入的 8 项通过。原五文件最终 64 项通过（新增四个矩阵实例），正式证据拒绝与完整证据接受断言保留。

源码版真实匿名 MyBatis/MySQL/Git 回放：两宿主旧基线退出 0、漏字段伪 PASS 退出 1、正确生产形状 SQL 写入退出 0；不是 Mock 证明数据库落库。仅访问一次性匿名资源，不修改业务仓或真实宿主配置来通过测试。语义真实性、冻结字段完整性和源码链充分性仍由独立评审承担。

最终全量回归、发布与官方安装复验结果见 0.5.19 annotated tag 的结构化说明及交付记录。隔离包安装、双语双宿主四次更新、自定义资产保留通过；未改变资产合同。无可比成本样本，不宣称性能或 Token 收益。若夹具仍读取外部配置、审计环境未恢复或正式正反例退化，应停止发布并修复测试边界，不能降低生产断言。

本次最终 `npm test`：103 文件、750 项通过、退出 0；Lint、构建、两设计门禁、严格 Skill 审计 16/16 与 0 英文镜像缺口均通过。npm pack dry-run 与实际包均 402 文件，无测试夹具或 Python 缓存。

### 0.5.19 官方发布与升级回查

官方 npm version/latest 均为 0.5.19，dist.shasum `b89cb202779f6c6aa169da4a8d0ed763da75f256` 与验证包一致。发布提交 `6c9a0fe` 已推送 main 与发布分支，annotated tag v0.5.19 已推送；GitHub Release 工作流 `37899929141` 成功，正文含中英文更新与验证说明。npm EOTP 经账户本人完成网页认证后发布成功；registry 处理完成后才执行安装。

活动本地安装、npm 全局安装、另一个旧 Homebrew 安装均从官方 registry 更新为 0.5.19。双宿主资产与官方包经既有宿主适配后的内容一致；global doctor failed=false。活动项目按实际全局安装作用域诊断 failed=false，2 项旧 Git 引用均来源一致。显式 project scope 曾报告项目资产缺失，因为该项目使用全局安装；未向业务仓补装资产。未知旧 Claude delivery 仍为 custom/WARN，保持原有边界。

安装后原失败五文件 64/64 通过。官方包真实匿名 MyBatis/MySQL/Git：两宿主 baseline=0、omitted=1、correct=0。再只读复制活动项目实际 Hook 到匿名仓，调用真实本机 HOME 的旧 Codex 委托入口，复用本轮真实数据库观测：omitted=1、correct=0。业务仓、业务数据库和原 Hook 均未修改；只清理任务自有资源。

需重启宿主加载已更新的 Skill/Hook/MCP。测试隔离修正不证明生产业务语义；字段清单、真实执行身份和断言充分性仍须独立评审。
