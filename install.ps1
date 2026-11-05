param(
  [switch]$DryRun,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Write-Info($Message) {
  Write-Host $Message -ForegroundColor Blue
}

function Write-Ok($Message) {
  Write-Host "OK $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Write-Fail($Message) {
  Write-Host "FAIL $Message" -ForegroundColor Red
}

Write-Info "Step 1 / 6: 校验 Node 版本"
if ($null -eq $env:SUPERFLOW_INSTALL_USER_PATH) { $env:SUPERFLOW_INSTALL_USER_PATH = $env:Path }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = & (Join-Path $scriptDir 'installer\bootstrap-node.ps1') -Yes:$Yes
if ($LASTEXITCODE -ne 0 -or -not $node) { throw 'Node bootstrap did not complete / Node 引导未完成' }
$env:Path = (Split-Path -Parent $node) + ';' + $env:Path
$nodeVersion = (& $node -v).TrimStart("v")
Write-Ok "Node $nodeVersion"

Write-Info "Step 2 / 6: 安装 npm 依赖"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$registry = $env:NPM_REGISTRY
if (-not $registry) {
  $registry = "https://registry.npmmirror.com"
}
Write-Info "使用 npm registry: $registry"
& $node (Join-Path $scriptDir 'scripts\npm-runtime.cjs') install --registry="$registry" --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed: $LASTEXITCODE" }
Write-Ok "npm install 完成"

Write-Info "Step 3 / 6: build 编译 TypeScript"
& $node (Join-Path $scriptDir 'scripts\npm-runtime.cjs') run build
if ($LASTEXITCODE -ne 0) { throw "build failed: $LASTEXITCODE" }
Write-Ok "build 完成"

Write-Info "Step 4 / 6: 生成 superflow.cmd"
$binRoot = $env:LOCALAPPDATA
if (-not $binRoot) {
  $binRoot = Join-Path $HOME ".local"
}
$binDir = Join-Path $binRoot "superflow\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$distBin = Join-Path $scriptDir "dist\app\cli.js"
$distMcpBin = Join-Path $scriptDir "dist\mcp\server.js"
$cmdPath = Join-Path $binDir "superflow.cmd"
$mcpCmdPath = Join-Path $binDir "superflow-mcp.cmd"
& $node -e 'require(process.argv[1]).installLaunchers(process.argv[2],process.argv[3],process.execPath)' (Join-Path $scriptDir 'installer\launchers.cjs') $binDir $scriptDir
if ($LASTEXITCODE -ne 0) { throw 'CLI launcher installation failed / 命令入口安装失败' }
Write-Ok "superflow 命令 -> $cmdPath"
Write-Ok "superflow-mcp 命令 -> $mcpCmdPath"

$pathItems = ($env:PATH -split ";")
if ($pathItems -notcontains $binDir) {
  Write-Warn "$binDir 不在 PATH 中。请把它加入用户 PATH 后重开终端。"
}

Write-Info "Step 5 / 6: 跑 superflow init 全局部署"
& $node $distBin --version

$hasCodex = $null -ne (Get-Command codex -ErrorAction SilentlyContinue)
$hasClaude = $null -ne (Get-Command claude -ErrorAction SilentlyContinue)
$detectedAgents = @()
if ($hasCodex) { $detectedAgents += "codex" }
if ($hasClaude) { $detectedAgents += "claude" }
if ($detectedAgents.Count -eq 0) {
  Write-Fail "未检测到 Codex 或 Claude CLI，无法部署 Agent Skills 与托管 MCP。"
  exit 1
}
$agentValue = $detectedAgents -join ","

$initArgs = @(
  "init", "--yes", "--overwrite", "--no-openspec-init", "--no-scan",
  "--scope", "global", "--agent", $agentValue
)
if ($DryRun) {
  Write-Info "DryRun：init 与 MCP 只打印计划；依赖、构建和本地命令仍会更新。"
  $initArgs += "--dry-run"
}

$bootstrapDir = Join-Path ([System.IO.Path]::GetTempPath()) (
  "superflow-bootstrap-" + [System.Guid]::NewGuid().ToString("N")
)
New-Item -ItemType Directory -Force -Path $bootstrapDir | Out-Null
Push-Location $bootstrapDir
try {
  & $node $distBin @initArgs
  if ($LASTEXITCODE -ne 0) { throw "initialization failed: $LASTEXITCODE" }
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $bootstrapDir -ErrorAction SilentlyContinue
}

Write-Info "Step 6 / 6: 核对初始化已注册的托管 MCP"
$mcpArgs = @("mcp", "status", "--agent", $agentValue)
if ($DryRun) {
  $mcpArgs += "--dry-run"
}
& $node $distBin @mcpArgs
if ($LASTEXITCODE -ne 0) { throw "MCP status failed: $LASTEXITCODE" }
Write-Ok "托管 MCP 已按本机 Agent 安装情况完成注册"

Write-Ok "@chenmk/superflow 安装完成"
Write-Info "下一步建议："
Write-Host "  1. superflow doctor"
Write-Host "  2. superflow mcp status --agent $agentValue"
Write-Host "  3. 重启对应 agent"
Write-Host "  4. superflow init --agent $agentValue --dry-run"
Write-Warn "Windows 上 hook 脚本需要 Git Bash 或兼容 shell，并确保 python3 可用。"
