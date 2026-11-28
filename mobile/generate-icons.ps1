Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$brand = Join-Path $root 'brand'
$iconPath = Join-Path $brand 'heph-icon.png'
$logoPath = Join-Path $brand 'heph-logo.png'
$res = Join-Path $PSScriptRoot 'android/app/src/main/res'

# Icono cuadrado con fondo y logo transparente, ambos salidos de la imagen de Heph.
$iconImage = [System.Drawing.Image]::FromFile($iconPath)
$logoImage = [System.Drawing.Image]::FromFile($logoPath)
$dark = [System.Drawing.Color]::FromArgb(255, 13, 14, 20)

function Save-Image([string]$path, [int]$width, [int]$height, [object]$source, [double]$scale, [bool]$circle) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  if ($circle) {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, $width, $height)
    $graphics.SetClip($clip)
  }
  $drawW = [int]($width * $scale)
  $drawH = [int]($height * $scale)
  $x = [int](($width - $drawW) / 2)
  $y = [int](($height - $drawH) / 2)
  $graphics.DrawImage($source, $x, $y, $drawW, $drawH)
  $graphics.Dispose()
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

function Save-Splash([string]$dir, [int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($dark)
  $size = [int]([Math]::Min($width, $height) * 0.42)
  $x = [int](($width - $size) / 2)
  $y = [int](($height - $size) / 2)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($logoImage, $x, $y, $size, $size)
  $graphics.Dispose()
  $target = Join-Path $res $dir
  if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
  $bitmap.Save((Join-Path $target 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$densities = @(
  @{ name = 'mdpi'; icon = 48; foreground = 108 },
  @{ name = 'hdpi'; icon = 72; foreground = 162 },
  @{ name = 'xhdpi'; icon = 96; foreground = 216 },
  @{ name = 'xxhdpi'; icon = 144; foreground = 324 },
  @{ name = 'xxxhdpi'; icon = 192; foreground = 432 }
)
foreach ($d in $densities) {
  $dir = Join-Path $res ("mipmap-" + $d.name)
  Save-Image (Join-Path $dir 'ic_launcher.png') $d.icon $d.icon $iconImage 1.0 $false
  Save-Image (Join-Path $dir 'ic_launcher_round.png') $d.icon $d.icon $iconImage 1.0 $true
  Save-Image (Join-Path $dir 'ic_launcher_foreground.png') $d.foreground $d.foreground $logoImage 0.72 $false
}

$splashes = @(
  @{ dir = 'drawable'; w = 480; h = 320 },
  @{ dir = 'drawable-land-mdpi'; w = 480; h = 320 },
  @{ dir = 'drawable-land-hdpi'; w = 800; h = 480 },
  @{ dir = 'drawable-land-xhdpi'; w = 1280; h = 720 },
  @{ dir = 'drawable-land-xxhdpi'; w = 1600; h = 960 },
  @{ dir = 'drawable-land-xxxhdpi'; w = 1920; h = 1280 },
  @{ dir = 'drawable-port-mdpi'; w = 320; h = 480 },
  @{ dir = 'drawable-port-hdpi'; w = 480; h = 800 },
  @{ dir = 'drawable-port-xhdpi'; w = 720; h = 1280 },
  @{ dir = 'drawable-port-xxhdpi'; w = 960; h = 1600 },
  @{ dir = 'drawable-port-xxxhdpi'; w = 1280; h = 1920 }
)
foreach ($s in $splashes) { Save-Splash $s.dir $s.w $s.h }

Set-Content -Path (Join-Path $res 'values/ic_launcher_background.xml') -NoNewline -Value @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0D0E14</color>
</resources>
'@ -Encoding UTF8

$iconImage.Dispose()
$logoImage.Dispose()
Write-Output 'Iconos y splash de Heph generados.'
