param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = 'Stop'
$env:Path = 'C:\Nexus\.node22;' + $env:Path
Set-Location 'C:\Nexus'

$cleanUrl = $Url.Trim().TrimEnd('/')
if ($cleanUrl -notmatch '^https?://') {
  throw "La URL debe empezar por http:// o https:// (recibí: $cleanUrl)"
}

$renderFile = 'C:\Nexus\render.yaml'
$renderText = Get-Content $renderFile -Raw
$renderText = $renderText -replace 'value: https://REEMPLAZA-CON-TU-URL\.onrender\.com', "value: $cleanUrl"
$renderText = $renderText -replace 'value: https://[^\s]+\.onrender\.com', "value: $cleanUrl"
Set-Content -Path $renderFile -Value $renderText -NoNewline

$envFile = 'C:\Nexus\.env'
if (Test-Path $envFile) {
  $envText = Get-Content $envFile -Raw
  $envText = $envText -replace 'PUBLIC_URL=.*', "PUBLIC_URL=$cleanUrl"
  Set-Content -Path $envFile -Value $envText -NoNewline
}

$mainFile = 'C:\Nexus\electron\main.cjs'
if (Test-Path $mainFile) {
  $mainText = Get-Content $mainFile -Raw
  $mainText = $mainText -replace "const REMOTE_UI_URL = '[^']*';", "const REMOTE_UI_URL = '$cleanUrl/';"
  Set-Content -Path $mainFile -Value $mainText -NoNewline
}

Write-Host "Compilando Nexus apuntando a $cleanUrl ..." -ForegroundColor Cyan
$env:VITE_SERVER_URL = $cleanUrl
npm install
npm run dist:portable

Get-ChildItem .\dist-electron\*.exe | Select-Object Name, @{N = 'MB'; E = { [math]::Round($_.Length / 1MB, 1) } }
