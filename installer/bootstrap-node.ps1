param([switch]$Yes)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$dataRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME '.local' }
$runtimeRoot = Join-Path $dataRoot 'superflow\node'
$library = Join-Path $PSScriptRoot '..\scripts\npm-runtime.cjs'

function Test-Node($file) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $false }
  try {
    $version = (& $file --version 2>$null).Trim()
    return $LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20
  } catch { return $false }
}
$candidates = @((Get-Command node -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }))
if ($env:NVM_SYMLINK) { $candidates += Join-Path $env:NVM_SYMLINK 'node.exe' }
if ($env:NVM_HOME) { $candidates += @(Get-ChildItem -Path "$env:NVM_HOME\v*\node.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) }
$candidates += @(Get-ChildItem -Path "$runtimeRoot\node-v*-win-*\node.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
foreach ($file in ($candidates | Select-Object -Unique)) {
  if (Test-Node $file) {
    $selected = & $file $library --select-installer-node 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $selected -PathType Leaf)) { Write-Output $selected; exit 0 }
  }
}
$base = if ($env:SUPERFLOW_NODE_DOWNLOAD_BASE_URL) { $env:SUPERFLOW_NODE_DOWNLOAD_BASE_URL.TrimEnd('/') } else { 'https://nodejs.org/dist' }
if (-not $base.StartsWith('https://')) { throw 'Node download requires HTTPS / Node 下载必须使用 HTTPS' }
$cliBin = Join-Path $dataRoot 'superflow\bin'
[Console]::Error.WriteLine("[Superflow] Install current Node LTS / 安装当前 Node LTS: $runtimeRoot`nSource / 来源: $base`nVerify SHA-256; preserve Node defaults/npm config; append only CLI path if needed / 核验 SHA-256，不改 Node 默认版本和 npm 配置，必要时仅追加命令目录: $cliBin")
if (-not $Yes) {
  if ([Console]::IsInputRedirected) { throw 'Interactive confirmation required; use -Yes / 请交互确认或使用 -Yes' }
  [Console]::Error.Write('Continue? / 是否继续？ [y/N] > ')
  if ([Console]::ReadLine() -notmatch '^(y|yes)$') { throw 'Cancelled / 已取消' }
}
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$arch = switch ($architecture) { 'x64' { 'x64' } 'arm64' { 'arm64' } default { throw 'Unsupported architecture / 不支持的架构' } }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$lock = Join-Path $runtimeRoot '.install.lock'
$lockStream = $null
$temp = Join-Path ([IO.Path]::GetTempPath()) ('superflow-node-' + [guid]::NewGuid().ToString('N'))
try {
  $lockStream = [IO.File]::Open($lock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  New-Item -ItemType Directory -Path $temp | Out-Null
  $catalog = Invoke-WebRequest -Uri "$base/index.tab" -UseBasicParsing
  $release = $catalog.Content | ConvertFrom-Csv -Delimiter "`t" | Where-Object {
    $_.version -match '^v(\d+)\.\d+\.\d+$' -and [int]$Matches[1] -ge 20 -and $_.lts -and $_.lts -ne '-'
  } | Select-Object -First 1
  if (-not $release) { throw 'Cannot identify supported LTS / 无法确认合格的 LTS' }
  $name = "node-$($release.version)-win-$arch"
  $archive = "$name.zip"
  $sums = Invoke-WebRequest -Uri "$base/$($release.version)/SHASUMS256.txt" -UseBasicParsing
  $expected = ($sums.Content -split "`n" | Where-Object { $_ -match ('^([a-fA-F0-9]{64})\s+' + [regex]::Escape($archive) + '\s*$') } | Select-Object -First 1)
  if (-not $expected) { throw 'Missing SHA-256 / 缺少 SHA-256' }
  $expected = ($expected.Trim() -split '\s+')[0]
  $archivePath = Join-Path $temp $archive
  Invoke-WebRequest -Uri "$base/$($release.version)/$archive" -OutFile $archivePath -UseBasicParsing
  if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expected) { throw 'SHA-256 mismatch / SHA-256 校验失败' }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $temp
  $staged = Join-Path $temp $name
  if (-not (Test-Node (Join-Path $staged 'node.exe')) -or -not (Test-Path (Join-Path $staged 'node_modules\npm\bin\npm-cli.js'))) { throw 'Downloaded runtime unavailable / 下载的运行时不可用' }
  $destination = Join-Path $runtimeRoot $name
  if (Test-Path -LiteralPath $destination) {
    if (-not (Test-Node (Join-Path $destination 'node.exe'))) { throw 'Preserve existing runtime / 请核验已有运行时目录' }
  } else { Move-Item -LiteralPath $staged -Destination $destination }
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($userPath -split ';') -notcontains $cliBin -and ($env:Path -split ';') -notcontains $cliBin) {
    [Environment]::SetEnvironmentVariable('Path', ((([string]$userPath).TrimEnd(';') + ';' + $cliBin).TrimStart(';')), 'User')
    [Console]::Error.WriteLine('Restart terminal/Agent to load CLI path / 请重启终端和 Agent 加载命令路径。')
  }
  Write-Output (Join-Path $destination 'node.exe')
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
  if ($lockStream) { $lockStream.Dispose(); Remove-Item -LiteralPath $lock -Force }
}
