#!/bin/bash
# SDD 契约检查 Hook
# 在 Edit/Write 时自动检查代码是否符合前端联调契约。
# 包含 8 个检查器（A-H），按触发条件精确匹配。
#
# 依赖：python3、grep
# 退出码：0=允许  2=拦截（fail 级别）  0+warning=允许但输出警告
#
# 环境变量：
#   SDD_CONTRACT_HOOK_DEBUG=1  开启调试输出

INPUT=$(cat)

# 提取 file_path
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# 只检查 Java 和 Markdown 文件
case "$FILE_PATH" in
    *.java|*.md) ;;
    *) exit 0 ;;
esac

# 只在 SDD 门禁激活时检查
FILE_DIR=$(dirname "$FILE_PATH")
REPO_ROOT=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
    exit 0
fi

if [ ! -f "$REPO_ROOT/.sdd-enforced" ]; then
    exit 0
fi

# 数据库门禁未通过时，不做契约检查（由 superflow-enforce-hook.sh 拦截）
if [ ! -f "$REPO_ROOT/.db-verified" ]; then
    exit 0
fi

DEBUG=""
if [ "$SDD_CONTRACT_HOOK_DEBUG" = "1" ]; then
    DEBUG="1"
fi

# 提取 new_string（Edit）或 content（Write）用于分析
EDIT_CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
# Edit 模式：提取 new_string
ns = ti.get('new_string', '')
if ns:
    print(ns)
else:
    # Write 模式：提取 content
    print(ti.get('content', ''))
" 2>/dev/null)

if [ -z "$EDIT_CONTENT" ]; then
    exit 0
fi

WARNINGS=""
HAS_FAIL=""

log_warning() {
    WARNINGS="${WARNINGS}
⚠️ [SDD 契约检查] WARNING: $1"
}

log_fail() {
    HAS_FAIL="1"
    WARNINGS="${WARNINGS}
🚫 [SDD 契约检查] FAIL: $1"
}

log_debug() {
    if [ "$DEBUG" = "1" ]; then
        echo "[DEBUG] $1" >&2
    fi
}

# 读取文件当前内容（如果文件存在）
FILE_CONTENT=""
if [ -f "$FILE_PATH" ]; then
    FILE_CONTENT=$(cat "$FILE_PATH" 2>/dev/null)
fi

# 合并当前文件内容和编辑内容用于检查
CHECK_CONTENT="${FILE_CONTENT}
${EDIT_CONTENT}"

###############################################################################
# Hook A：文件流接口检查
#
# 触发条件：
#   - 变更的 Controller 方法中，路径或方法名包含：
#     export / download / template / 导出 / 下载 / 模板
#   - 或 @ApiOperation 包含"导出""下载模板""模板下载"
#
# 排除条件：
#   - 路径包含 status/progress/result
#   - 明确是 JSON 查询结果
#   - 方法注释写明"返回 JSON"
#
# 检查规则：
#   - 如果是成功文件接口，不应返回 Response<T>
#   - 应包含 HttpServletResponse
#   - 应设置 Content-Type
#   - 应设置 Content-Disposition
#   - tests.md 或单测应验证 header / 文件流 / 文件可打开
#
# 严重级别：
#   - 路径包含 /export 且返回 Response：fail
#   - 其他缺失：warning
###############################################################################

hook_a_file_stream() {
    # 只检查 Java Controller 文件
    case "$FILE_PATH" in
        *Controller*.java|*controller*.java) ;;
        *) return ;;
    esac

    # 检查是否包含导出/下载相关关键词
    local is_file_interface=0
    local method_names=$(echo "$EDIT_CONTENT" | grep -oiE '(export|download|template|导出|下载|模板)' || true)
    local api_op=$(echo "$EDIT_CONTENT" | grep -oiE '@ApiOperation.*"(.*导出.*|.*下载.*|.*模板.*)"' || true)

    if [ -z "$method_names" ] && [ -z "$api_op" ]; then
        return
    fi

    log_debug "Hook A: 检测到文件接口关键词"

    # 排除条件：status/progress/result 或 "返回 JSON"
    local exclude=$(echo "$EDIT_CONTENT" | grep -oiE '(status|progress|result|返回 JSON|返回JSON)' || true)
    if [ -n "$exclude" ]; then
        log_debug "Hook A: 命中排除条件，跳过"
        return
    fi

    # 检查是否返回 Response<T>
    local returns_response=$(echo "$EDIT_CONTENT" | grep -oiE 'Response<[^>]*>' | head -1 || true)
    local has_servlet_response=$(echo "$EDIT_CONTENT" | grep -oi 'HttpServletResponse' || true)
    local has_content_type=$(echo "$EDIT_CONTENT" | grep -oi 'Content-Type\|setContentType\|contentType' || true)
    local has_disposition=$(echo "$EDIT_CONTENT" | grep -oi 'Content-Disposition\|setContentDisposition\|setHeader.*attachment' || true)

    local is_export=$(echo "$EDIT_CONTENT" | grep -oi '/export' || true)

    if [ -n "$is_export" ] && [ -n "$returns_response" ] && [ -z "$has_servlet_response" ]; then
        log_fail "Hook A [文件流接口]: 路径含 /export 且返回 Response<T>，应直接操作 HttpServletResponse 返回文件流"
    else
        if [ -n "$method_names" ] || [ -n "$api_op" ]; then
            if [ -z "$has_servlet_response" ]; then
                log_warning "Hook A [文件流接口]: 疑似文件流接口但未使用 HttpServletResponse"
            fi
            if [ -z "$has_content_type" ]; then
                log_warning "Hook A [文件流接口]: 文件流接口未设置 Content-Type"
            fi
            if [ -z "$has_disposition" ]; then
                log_warning "Hook A [文件流接口]: 文件流接口未设置 Content-Disposition"
            fi
        fi
    fi
}

###############################################################################
# Hook B：导入失败码检查
#
# 触发条件：
#   - Controller 方法路径包含 /import
#   - 且返回类型或方法体出现 ImportResult
#   - 或 data 中有 failureCount/failureRows
#
# 排除条件：
#   - 普通异步导入任务创建接口，不直接返回导入结果
#   - 只返回任务 ID 的接口
#
# 检查规则：
#   - 不允许无条件 Response.ok(result)
#   - 必须存在 failureCount > 0 时返回非 0 业务 code 的分支
#   - 文档必须说明失败行时前端如何判断失败
#
# 严重级别：
#   - 有 failureCount 且无失败码分支：fail
###############################################################################

hook_b_import_failure_code() {
    case "$FILE_PATH" in
        *Controller*.java|*controller*.java|*Service*.java|*service*.java|*ServiceImpl*.java) ;;
        *) return ;;
    esac

    # 触发条件：包含 /import 或 ImportResult 或 failureCount
    local has_import_path=$(echo "$EDIT_CONTENT" | grep -oi '/import' || true)
    local has_import_result=$(echo "$EDIT_CONTENT" | grep -oi 'ImportResult\|ImportResp\|failureCount\|failureRows' || true)

    if [ -z "$has_import_path" ] && [ -z "$has_import_result" ]; then
        return
    fi

    log_debug "Hook B: 检测到导入接口关键词"

    # 排除条件：只返回任务 ID
    local task_only=$(echo "$EDIT_CONTENT" | grep -oiE '(taskId|task_id|任务ID|异步导入)' || true)
    if [ -n "$task_only" ] && [ -z "$has_import_result" ]; then
        log_debug "Hook B: 只返回任务 ID，跳过"
        return
    fi

    # 检查是否有 failureCount 但无条件返回 Response.ok
    local has_failure_count=$(echo "$EDIT_CONTENT" | grep -oi 'failureCount' || true)
    local has_ok_unconditional=$(echo "$EDIT_CONTENT" | grep -oiE 'Response\.ok\(.*result' || true)
    local has_failure_branch=$(echo "$EDIT_CONTENT" | grep -oiE '(failureCount\s*>\s*0|failureCount\s*!=\s*0|getFailureCount|hasFail)' || true)

    if [ -n "$has_failure_count" ] && [ -z "$has_failure_branch" ]; then
        log_fail "Hook B [导入失败码]: 存在 failureCount 但无失败码判断分支，failureCount > 0 时必须返回非 0 业务 code"
    elif [ -n "$has_failure_count" ] && [ -n "$has_failure_branch" ]; then
        log_debug "Hook B: 存在失败码分支，通过"
    fi
}

###############################################################################
# Hook C：Excel 日期格式检查
#
# 触发条件：
#   - 变更文件含 @ExcelProperty
#   - 且列名包含"时间""日期"
#   - 或类名/文件名包含 Import/Excel/Template
#
# 排除条件：
#   - 纯导出 DTO，不参与导入解析
#   - 文档明确要求前端只能传完整时间且有前端校验证据
#
# 检查规则：
#   - 日期解析应支持 yyyy-MM-dd，或文档明确说明不支持
#   - tests.md 或单测必须覆盖 yyyy-MM-dd
#   - 如果只有日期，应说明是否补 00:00:00
#
# 严重级别：
#   - 导入字段含日期但无格式说明：warning
#   - 已知前端模板为日期但后端只支持完整时间：fail
###############################################################################

hook_c_excel_date() {
    case "$FILE_PATH" in
        *.java) ;;
        *) return ;;
    esac

    # 触发条件
    local has_excel_prop=$(echo "$EDIT_CONTENT" | grep -oi '@ExcelProperty' || true)
    local has_date_col=$(echo "$EDIT_CONTENT" | grep -oiE '(时间|日期|date|time|Date|Time)' || true)
    local has_import_name=$(echo "$FILE_PATH" | grep -oiE '(Import|Excel|Template)' || true)

    if [ -z "$has_excel_prop" ]; then
        return
    fi

    if [ -z "$has_date_col" ] && [ -z "$has_import_name" ]; then
        return
    fi

    log_debug "Hook C: 检测到 Excel 日期字段"

    # 排除条件：纯导出 DTO
    local is_export_only=$(echo "$FILE_PATH" | grep -oiE '(Export|导出)' || true)
    local has_export_annotation=$(echo "$EDIT_CONTENT" | grep -oi 'class.*Export.*DTO\|class.*Export.*Vo\|class.*Export.*Model' || true)
    if [ -n "$is_export_only" ] || [ -n "$has_export_annotation" ]; then
        log_debug "Hook C: 纯导出 DTO，跳过"
        return
    fi

    # 检查日期格式是否兼容
    local has_short_date=$(echo "$EDIT_CONTENT" | grep -oi 'yyyy-MM-dd[^-]' || true)
    local has_full_date=$(echo "$EDIT_CONTENT" | grep -oi 'yyyy-MM-dd HH:mm:ss' || true)
    local has_date_format_annotation=$(echo "$EDIT_CONTENT" | grep -oiE '@DateTimeFormat|@JsonFormat|DateTimeFormatter|SimpleDateFormat' || true)

    if [ -n "$has_date_col" ] && [ -n "$has_import_name" ]; then
        if [ -z "$has_date_format_annotation" ]; then
            log_warning "Hook C [Excel 日期]: 导入 DTO 含日期字段但未指定日期格式，应至少兼容 yyyy-MM-dd 和 yyyy-MM-dd HH:mm:ss"
        elif [ -n "$has_full_date" ] && [ -z "$has_short_date" ]; then
            log_fail "Hook C [Excel 日期]: 后端只支持 yyyy-MM-dd HH:mm:ss，但 Excel 默认日期格式为 yyyy-MM-dd，应兼容两种格式"
        fi
    elif [ -n "$has_date_col" ]; then
        log_warning "Hook C [Excel 日期]: @ExcelProperty 含日期/时间列，确认日期格式是否兼容 yyyy-MM-dd"
    fi
}

###############################################################################
# Hook D：Excel 模板列头一致性检查
#
# 触发条件：
#   - 变更包含 EasyExcel.write 或 EasyExcel.read
#   - 或变更包含 @ExcelProperty
#
# 排除条件：
#   - 与 Excel 无关的普通 DTO
#
# 检查规则：
#   - 模板下载 DTO 和导入解析 DTO 的列头应一致
#   - api.md/tests.md 应列出列头
#   - 不得出现隐藏字段、内部 ID、状态列等已明确禁止字段
#
# 严重级别：
#   - 模板列头和导入列头明显不一致：fail
#   - 文档未列头：warning
###############################################################################

hook_d_excel_header_consistency() {
    case "$FILE_PATH" in
        *.java) ;;
        *) return ;;
    esac

    local has_excel_prop=$(echo "$EDIT_CONTENT" | grep -oi '@ExcelProperty' || true)
    local has_easyexcel=$(echo "$EDIT_CONTENT" | grep -oi 'EasyExcel' || true)

    if [ -z "$has_excel_prop" ] && [ -z "$has_easyexcel" ]; then
        return
    fi

    log_debug "Hook D: 检测到 EasyExcel 或 @ExcelProperty"

    # 检查是否有内部字段（不应出现在模板中的）
    local has_internal_id=$(echo "$EDIT_CONTENT" | grep -oiE '@ExcelProperty.*"(id|ID|状态|status|内部|internal)"' || true)
    local has_hidden_field=$(echo "$EDIT_CONTENT" | grep -oiE '@ExcelProperty.*"(create_time|update_time|create_by|update_by|deleted|is_deleted)"' || true)

    if [ -n "$has_internal_id" ] || [ -n "$has_hidden_field" ]; then
        log_warning "Hook D [Excel 列头]: @ExcelProperty 包含内部字段（id/status/create_time 等），确认是否应出现在导入模板中"
    fi

    # 如果是模板 DTO，检查是否有对应的导入 DTO
    local is_template=$(echo "$FILE_PATH" | grep -oiE '(Template|模板)' || true)
    local is_import=$(echo "$FILE_PATH" | grep -oiE '(Import|导入)' || true)

    if [ -n "$is_template" ] || [ -n "$is_import" ]; then
        # 提取列头
        local headers=$(echo "$EDIT_CONTENT" | grep -oiE '@ExcelProperty\("([^"]+)"' | sed 's/.*"\([^"]*\)".*/\1/' | sort | tr '\n' ',' || true)
        if [ -n "$headers" ]; then
            log_warning "Hook D [Excel 列头]: 检测到 DTO 列头: [${headers%,}]，请确认模板下载 DTO 和导入解析 DTO 列头一致"
        fi
    fi
}

###############################################################################
# Hook E：api.md 与 Controller 路由一致性检查
#
# 触发条件：
#   - Controller 新增/修改 @GetMapping/@PostMapping/@PutMapping/@DeleteMapping
#
# 排除条件：
#   - /internal/ 路径
#   - 第三方回调
#   - 注释标记 legacy/兼容/历史
#
# 检查规则：
#   - Controller 新增 mapping 应能在 api.md 找到
#   - 同一资源下存在固定路径和 {id} 时提示路由抢占风险
#
# 严重级别：
#   - Controller 存在但 api.md 缺失：warning
#   - {id} 抢占风险：warning
###############################################################################

hook_e_route_consistency() {
    case "$FILE_PATH" in
        *Controller*.java|*controller*.java) ;;
        *) return ;;
    esac

    # 检测新增的 mapping
    local has_new_mapping=$(echo "$EDIT_CONTENT" | grep -oiE '@(Get|Post|Put|Delete|Patch|Request)Mapping' || true)
    if [ -z "$has_new_mapping" ]; then
        return
    fi

    log_debug "Hook E: 检测到 Controller mapping 变更"

    # 排除条件
    local is_internal=$(echo "$EDIT_CONTENT" | grep -oiE '/internal/' || true)
    local is_callback=$(echo "$EDIT_CONTENT" | grep -oiE '(callback|回调|notify|通知)' || true)
    local is_legacy=$(echo "$EDIT_CONTENT" | grep -oiE '(legacy|兼容|历史|deprecated)' || true)

    if [ -n "$is_internal" ] || [ -n "$is_legacy" ]; then
        log_debug "Hook E: 命中排除条件，跳过"
        return
    fi

    # 提取路径
    local paths=$(echo "$EDIT_CONTENT" | grep -oiE '@(Get|Post|Put|Delete)Mapping\s*\(\s*"?(/[^"]*)"?|value\s*=\s*"?(/[^"]*)"?|path\s*=\s*"?(/[^"]*)"?' | grep -oiE '/[^"]+' | sed 's/"//g;s/)$//' || true)

    if [ -z "$paths" ]; then
        return
    fi

    # 检查 {id} 与固定路径冲突
    local has_id_path=$(echo "$paths" | grep -oi '{id}' || true)
    local has_fixed_path=$(echo "$EDIT_CONTENT" | grep -oiE '@(Get|Post|Put|Delete)Mapping\s*\(\s*"?(/[a-zA-Z]+)"?' | grep -vi '{' || true)

    if [ -n "$has_id_path" ] && [ -n "$has_fixed_path" ]; then
        log_warning "Hook E [路由一致性]: 同一 Controller 下存在固定路径和 {id} 路径变量，存在路由抢占风险。建议固定路径排在 {id} 之前或使用正则约束"
    fi

    # 检查是否有对应的 api.md
    local api_md_path=$(find "$REPO_ROOT/doc" -name "api.md" -type f 2>/dev/null | head -1)
    if [ -n "$api_md_path" ] && [ -f "$api_md_path" ]; then
        for p in $paths; do
            local clean_path=$(echo "$p" | sed 's/[{}]//g' | sed 's/^\///')
            local found=$(grep -oi "$clean_path" "$api_md_path" 2>/dev/null || true)
            if [ -z "$found" ]; then
                log_warning "Hook E [路由一致性]: Controller 新增路径 $p 未在 api.md 中找到对应定义，请补充接口文档"
            fi
        done
    fi
}

###############################################################################
# Hook F：数据权限决策检查（Data Permission Decision Check）
#
# 不判断具体字段名，不替用户决定是否需要数据权限。
# 只检查文档是否已做出三选一结论：
#   - 需要数据权限，并说明复用模式
#   - 不需要数据权限，并说明原因
#   - 不确定，列入待确认问题并阻塞实现
#
# 触发条件：
#   - Controller/Service/Mapper 改动
#   - 且方法名/路径/注释含访问类动作关键词
#
# 排除条件：
#   - 登录/验证码/健康检查/公开字典/枚举/静态配置
#   - 文档明确说明由统一注解/AOP/网关处理
#
# 严重级别：
#   - 无数据权限判断文档：warning
#   - 写操作无权限迹象且无文档说明：high warning
#   - 文档标记"不确定"：info，提示阻塞实现
###############################################################################

hook_f_permission_decision() {
    case "$FILE_PATH" in
        *Controller*.java|*controller*.java|*Service*.java|*service*.java|*ServiceImpl*.java|*.xml) ;;
        *) return ;;
    esac

    # 触发条件：方法名/路径含访问类动作
    local has_access_action=$(echo "$EDIT_CONTENT" | grep -oiE '(list|page|query|search|detail|get|export|update|delete|refund|approve|分页|列表|查询|详情|导出|编辑|删除|退款|审批)' || true)

    if [ -z "$has_access_action" ]; then
        return
    fi

    log_debug "Hook F: 检测到访问类动作关键词"

    # 排除条件：公开接口、登录、健康检查等
    # 注意：Java 方法声明中的 public 不是公开接口标记，需排除
    local content_without_java_modifiers=$(echo "$EDIT_CONTENT" | sed 's/public\s\+class//g; s/public\s\+\(static\)\?//g; s/private\s\+//g; s/protected\s\+//g' 2>/dev/null)
    local is_public=$(echo "$content_without_java_modifiers" | grep -oiE '(login|captcha|验证码|健康检查|health|dict|字典|enum|枚举|公开接口|no-data-scope)' || true)
    if [ -n "$is_public" ]; then
        log_debug "Hook F: 公开/登录/字典接口，跳过"
        return
    fi

    # 提取接口方法名用于提示
    local method_name=$(echo "$EDIT_CONTENT" | grep -oiE '(list[A-Z]\w+|page[A-Z]\w+|query[A-Z]\w+|search[A-Z]\w+|get[A-Z]\w+|detail[A-Z]\w+|export[A-Z]\w+|update[A-Z]\w+|delete[A-Z]\w+|refund[A-Z]\w+|approve[A-Z]\w+)' | head -1 || true)

    # 检查是否为写操作
    local is_write_op=$(echo "$EDIT_CONTENT" | grep -oiE '(update|delete|refund|approve|编辑|删除|退款|审批|@PostMapping|@PutMapping|@DeleteMapping)' || true)

    # 查找 api.md 和 design.md
    local api_md_path=$(find "$REPO_ROOT/doc" -name "api.md" -type f 2>/dev/null | head -1)
    local design_md_path=$(find "$REPO_ROOT/doc" -name "design.md" -type f 2>/dev/null | head -1)

    # 检查文档中是否有数据权限说明
    local has_permission_doc=""
    for md_file in "$api_md_path" "$design_md_path"; do
        if [ -f "$md_file" ]; then
            has_permission_doc=$(grep -oiE '(数据权限|权限边界|权限决策|角色.*范围|越权|待确认.*权限|不需要.*权限|统一.*AOP|统一.*注解|网关.*控制)' "$md_file" 2>/dev/null || true)
            if [ -n "$has_permission_doc" ]; then
                break
            fi
        fi
    done

    # 检查代码中是否使用了权限相关模式
    local has_permission_code=$(echo "$EDIT_CONTENT" | grep -oiE '(DataScope|DataPermission|@RequiresPermissions|@PreAuthorize|@Secured|checkPermission|getDataScope|getCurrentUser|getLoginUser|SecurityUtils|UserContext|TenantContext|@DataFilter)' || true)

    # 检查文档是否标记"不确定"
    local has_pending=$(echo "$has_permission_doc" | grep -oi '待确认' || true)

    if [ -n "$has_pending" ]; then
        # 文档标记不确定，提示阻塞实现
        log_warning "Hook F [数据权限决策]: api.md 已标记数据权限\"不确定\"，实现应阻塞，等待用户确认角色数据范围"
        return
    fi

    if [ -z "$has_permission_doc" ] && [ -z "$has_permission_code" ]; then
        # 无文档也无代码权限迹象
        if [ -n "$is_write_op" ]; then
            # 写操作高风险
            log_warning "Hook F [数据权限决策][HIGH] 检测到写操作接口 ${method_name:-未识别方法名}。
  未发现当前用户上下文、权限注解、归属校验或既有权限工具调用；
  文档也未说明由统一 AOP/网关控制。
  请确认是否存在越权风险；如由统一机制处理，请在 design.md/api.md 中注明。"
        else
            # 读操作普通风险
            log_warning "Hook F [数据权限决策] 检测到新增接口 ${method_name:-未识别方法名}。
  未在 api.md/design.md 中找到数据权限说明。
  请确认：
  1. 该接口是否访问业务数据；
  2. 若访问业务数据，是否需要数据权限（需要/不需要/不确定）；
  3. 若需要，复用当前仓库哪个已有权限模式；
  4. 若不确定，请列为待确认问题并询问用户。"
        fi
    fi
}

###############################################################################
# Hook G：外部 SDK 参数契约检查
#
# 触发条件：
#   - 变更包含 SDK client、RPC client、MQ client、第三方 API client
#   - 或 pom 里 SDK 版本变化
#
# 排除条件：
#   - 纯内部工具类
#
# 检查规则：
#   - api.md/design.md 必须写 SDK 参数来源
#   - tests.md 必须写真实响应或阻塞证据
#   - SDK 版本变更必须记录原因
#
# 严重级别：
#   - SDK 参数新增但无来源说明：warning
#   - SDK 版本变更但无说明：warning
###############################################################################

hook_g_sdk_contract() {
    case "$FILE_PATH" in
        *.java|*.xml|pom.xml|build.gradle) ;;
        *) return ;;
    esac

    # 触发条件
    local has_sdk=$(echo "$EDIT_CONTENT" | grep -oiE '(Client|Sdk|SDK|RPC|Feign|Dubbo|MQ|Kafka|RabbitMQ|RocketMQ|HttpClient|RestTemplate|WebClient)' || true)
    local has_sdk_import=$(echo "$EDIT_CONTENT" | grep -oiE 'import.*\.(sdk|client|rpc|feign|dubbo|mq)' || true)

    if [ -z "$has_sdk" ] && [ -z "$has_sdk_import" ]; then
        return
    fi

    # 排除条件：纯内部工具类
    local is_utility=$(echo "$FILE_PATH" | grep -oiE '(util|Utils|helper|Helper|tool|Tool)' || true)
    if [ -n "$is_utility" ] && [ -z "$has_sdk_import" ]; then
        log_debug "Hook G: 纯工具类，跳过"
        return
    fi

    log_debug "Hook G: 检测到外部 SDK/RPC/MQ 调用"

    # 检查参数来源说明
    local has_param_source=$(echo "$EDIT_CONTENT" | grep -oiE '(参数来源|来源说明|param.*from|参数.*传)' || true)

    # 检查 api.md/design.md
    local api_md_path=$(find "$REPO_ROOT/doc" -name "api.md" -type f 2>/dev/null | head -1)
    local design_md_path=$(find "$REPO_ROOT/doc" -name "design.md" -type f 2>/dev/null | head -1)

    local sdk_doc_found=""
    for md_file in "$api_md_path" "$design_md_path"; do
        if [ -f "$md_file" ]; then
            sdk_doc_found=$(grep -oi '外部依赖契约\|SDK.*参数来源\|SDK.*版本' "$md_file" 2>/dev/null || true)
            if [ -n "$sdk_doc_found" ]; then
                break
            fi
        fi
    done

    if [ -z "$sdk_doc_found" ]; then
        log_warning "Hook G [SDK 契约]: 检测到外部 SDK/RPC/MQ 调用，但 api.md/design.md 未定义外部依赖契约（参数来源、SDK 版本、响应样例）"
    fi

    # 检查 pom.xml 版本变更
    case "$FILE_PATH" in
        *pom.xml*|*build.gradle*)
            local version_change=$(echo "$EDIT_CONTENT" | grep -oiE '(version|<version>)' || true)
            if [ -n "$version_change" ]; then
                log_warning "Hook G [SDK 契约]: 检测到依赖版本变更，请确认是否有版本变更说明"
            fi
            ;;
    esac
}

###############################################################################
# Hook H：跨仓数据合同 / MyBatis-Plus 实体字段检查
#
# 触发条件：
#   - Java/XML 变更包含 @TableName、BaseMapper、@TableField
#   - 或包含 QueryWrapper/LambdaQueryWrapper/resultMap/列映射
#   - 或文档声称真实链路/联调通过
#
# 检查规则：
#   - MyBatis-Plus 实体字段必须能在真实表结构中找到
#   - 旧字段应删除或 @TableField(exist = false)
#   - 多仓共享表必须列出消费仓并做字段对账
#   - mock/test controller 证据不能替代真实入口验收
#
# 严重级别：
#   - warning/high warning，不直接全局失败；由 SDD quality gate 阻塞交付
###############################################################################

hook_h_cross_schema_contract() {
    case "$FILE_PATH" in
        *.java|*.xml|*.md) ;;
        *) return ;;
    esac

    local has_schema_mapping=$(echo "$EDIT_CONTENT" | grep -oiE '(@TableName|BaseMapper<|@TableField|LambdaQueryWrapper|QueryWrapper|resultMap|<result[[:space:]]+column=|<id[[:space:]]+column=)' || true)
    local has_real_claim=$(echo "$EDIT_CONTENT" | grep -oiE '(真实链路通过|真实入口通过|联调通过|Passed|Real integration passed)' || true)
    local has_mock_signal=$(echo "$EDIT_CONTENT" | grep -oiE '(mock|Mock|测试端点|test controller|绕过鉴权|bypass)' || true)

    if [ -n "$has_schema_mapping" ]; then
        log_warning "Hook H [跨仓数据合同][HIGH] 检测到 MyBatis/MyBatis-Plus 实体、Mapper 或查询条件变更。
  请完成跨仓数据合同对账：
  1. 明确表结构真源（版本总 SQL / database-contract / SHOW CREATE TABLE）；
  2. 列出全部消费仓（当前服务、sibling service、互联互通、回调、定时任务、测试端点）；
  3. 对照 @TableName 实体字段、BaseMapper 默认 SELECT、Mapper XML/resultMap、手写 SQL 与真实库字段；
  4. 不存在列必须删除或 @TableField(exist = false)，不得给测试库补废弃字段绕过；
  5. 字段迁移后同步查询条件，例如状态字段派生、多站点 JSON 快照等。"
    fi

    case "$FILE_PATH" in
        *.md)
            if [ -n "$has_real_claim" ] && [ -n "$has_mock_signal" ]; then
                log_warning "Hook H [真实入口验收][HIGH] 文档同时出现真实通过结论和 mock/测试端点证据。
  请把 Mock 验证、测试端点验证、真实入口验证分开记录；
  测试 Controller、mock endpoint、绕过鉴权端点只能证明局部路径；
  真实入口通过必须包含 payload、响应、trace 日志、DB 证据。"
            fi
            ;;
    esac
}

###############################################################################
# Hook I：Superpowers HOW/合同权责边界检查
#
# 触发条件：
#   - Markdown 变更包含 superpower / Superpower
#   - 尤其是 prompt 或 design 相关文档
#
# 检查规则：
#   - OpenSpec/SDD 文档是 WHAT/API/DB/tests 合同事实源
#   - Superpowers 可以接管源码级 HOW 技术详设
#   - Superpowers 不得重写 design.md/api.md/tests 或覆盖 API/DB/字段语义合同
#
# 严重级别：
#   - 明确要求 Superpowers 覆盖合同：fail
#   - 使用 Superpowers 但缺少技术详设继承章节：warning
###############################################################################

hook_i_superpower_design_boundary() {
    case "$FILE_PATH" in
        *.md) ;;
        *) return ;;
    esac

    local has_superpower=$(echo "$CHECK_CONTENT" | grep -oiE 'superpower|Superpower' || true)
    if [ -z "$has_superpower" ]; then
        return
    fi

    local risky_line=$(echo "$CHECK_CONTENT" | python3 -c '
import re, sys
text = sys.stdin.read()
allow = re.compile(r"(禁止|不得|不允许|不能|事实源|canonical|must not|do not|forbid)", re.I)
risky = re.compile(
    r"(superpower|Superpower).{0,40}(重写|替代|覆盖).{0,40}(design\.md|api\.md|tests\.md|API|DB|SQL|字段语义|合同|验收)"
    r"|"
    r"(重写|替代|覆盖).{0,40}(design\.md|api\.md|tests\.md|API|DB|SQL|字段语义|合同|验收).{0,40}(superpower|Superpower)",
    re.I,
)
for line in text.splitlines():
    if risky.search(line) and not allow.search(line):
        print(line[:240])
        break
' 2>/dev/null)

    if [ -n "$risky_line" ]; then
        log_fail "Hook I [Superpowers 边界]: 检测到疑似让 Superpowers 覆盖 OpenSpec/SDD 合同的指令：$risky_line
  OpenSpec/SDD 的 design.md、api.md、tests.md、SQL/DB、字段语义和验收门禁是合同事实源；
  Superpowers 可以接管源码级 HOW 技术详设，但不能覆盖合同。"
    fi

    case "$FILE_PATH" in
        */prompt/*.md|*prompt*.md)
            local has_strategy=$(echo "$CHECK_CONTENT" | grep -oiE 'Superpower 技术详设继承|technical_design|Superpowers 技术详设|源码级 HOW|Superpower 执行策略继承' || true)
            if [ -z "$has_strategy" ]; then
                log_warning "Hook I [Superpowers 边界]: prompt 使用了 Superpowers，但未看到 'Superpower 技术详设继承' 或 technical_design 边界。
  请从 .sdd/state.yaml 的 technical_design 继承源码级 HOW，并声明 OpenSpec/SDD 合同不可覆盖。"
            fi
            local has_field_status_risk=$(echo "$CHECK_CONTENT" | grep -oiE '字段值|状态|枚举|online|offline|上线|下线|删除|恢复|同步标记|payment|refund|支付|退款|第三方状态|running_status|offline_time' || true)
            local has_reverse_impact=$(echo "$CHECK_CONTENT" | grep -oiE '字段/状态反向影响面|Field And Status Reverse Impact|读取/过滤点|派生/同步点|跨模块消费方' || true)
            if [ -n "$has_field_status_risk" ] && [ -z "$has_reverse_impact" ]; then
                log_warning "Hook I [字段/状态反向影响面]: prompt 涉及字段/状态/枚举/同步值，但未看到反向影响面矩阵。
  请从 Superpowers technical_design 继承 writers/readers/filters/sync/consumer/test 矩阵，避免只改直接写入点。"
            fi
            ;;
    esac
}

###############################################################################
# 执行所有检查器
###############################################################################

hook_a_file_stream
hook_b_import_failure_code
hook_c_excel_date
hook_d_excel_header_consistency
hook_e_route_consistency
hook_f_permission_decision
hook_g_sdk_contract
hook_h_cross_schema_contract
hook_i_superpower_design_boundary

# 输出结果
if [ -n "$WARNINGS" ]; then
    echo "$WARNINGS"
    echo ""
    echo "[SDD 契约检查] 详细说明请参考 superflow-pipeline/references/api-design-template.md"
fi

if [ -n "$HAS_FAIL" ]; then
    exit 2
fi

exit 0
