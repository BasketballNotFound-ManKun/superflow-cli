param(
  [switch]$DryRun
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

Write-Info "Step 1 / 5: 校验 Node 版本"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Fail "Node.js 未安装。请先安装 Node 20+。"
  exit 1
}

$nodeVersion = (& node -v).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
  Write-Fail "Node 版本 $nodeVersion 太低，要求 20+。"
  exit 1
}
Write-Ok "Node $nodeVersion"

Write-Info "Step 2 / 5: 安装 npm 依赖"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$registry = $env:NPM_REGISTRY
if (-not $registry) {
  $registry = "https://registry.npmmirror.com"
}
Write-Info "使用 npm registry: $registry"
npm install --registry="$registry" --no-audit --no-fund
Write-Ok "npm install 完成"

Write-Info "Step 3 / 5: build 编译 TypeScript"
npm run build
Write-Ok "build 完成"

Write-Info "Step 4 / 5: 生成 superflow.cmd"
$binRoot = $env:LOCALAPPDATA
if (-not $binRoot) {
  $binRoot = Join-Path $HOME ".local"
}
$binDir = Join-Path $binRoot "superflow\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$distBin = Join-Path $scriptDir "dist\cli\index.js"
$cmdPath = Join-Path $binDir "superflow.cmd"
$cmdContent = "@echo off`r`nnode `"$distBin`" %*`r`n"
Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII
Write-Ok "superflow 命令 -> $cmdPath"

$pathItems = ($env:PATH -split ";")
if ($pathItems -notcontains $binDir) {
  Write-Warn "$binDir 不在 PATH 中。请把它加入用户 PATH 后重开终端。"
}

Write-Info "Step 5 / 5: 跑 superflow init 部署（默认同时部署 Claude Code + Codex）"
node $distBin --version

$initArgs = @("init", "--yes", "--no-openspec-init", "--no-scan")
if ($DryRun) {
  $initArgs += "--dry-run"
}
node $distBin @initArgs

Write-Ok "@chenmk/superflow 安装完成"
Write-Info "下一步建议："
Write-Host "  1. superflow doctor"
Write-Host "  2. superflow init --agent codex --dry-run"
Write-Host "  3. 重启对应 agent"
Write-Warn "Windows 上 hook 脚本需要 Git Bash 或兼容 shell，并确保 python3 可用。"
