$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Ruta nueva a propósito: así Windows no reutiliza el ícono gris en caché.
$icoPath = 'C:\Nexus\nexus-violeta.ico'
$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(13, 14, 20))

$radius = 56
$diameter = $radius * 2
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(16, 16, $diameter, $diameter, 180, 90)
$path.AddArc($size - 16 - $diameter, 16, $diameter, $diameter, 270, 90)
$path.AddArc($size - 16 - $diameter, $size - 16 - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc(16, $size - 16 - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(88, 101, 242))
$g.FillPath($brush, $path)

$font = New-Object System.Drawing.Font('Segoe UI Semibold', 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString('N', $font, [System.Drawing.Brushes]::White, $rect, $format)
$g.Dispose()

# ICO con un PNG adentro: conserva el color (Icon.Save() lo pasaba a gris).
$pngStream = New-Object System.IO.MemoryStream
$bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $pngStream.ToArray()
$pngStream.Dispose()

$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)
$writer.Write([uint16]0)      # reservado
$writer.Write([uint16]1)      # tipo: icono
$writer.Write([uint16]1)      # cantidad de imágenes
$writer.Write([byte]0)        # ancho 256
$writer.Write([byte]0)        # alto 256
$writer.Write([byte]0)        # paleta
$writer.Write([byte]0)        # reservado
$writer.Write([uint16]1)      # planos
$writer.Write([uint16]32)     # bits por pixel
$writer.Write([uint32]$png.Length)
$writer.Write([uint32]22)     # offset de la imagen
$writer.Write($png)
$writer.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $icoStream.ToArray())
$writer.Dispose()
$icoStream.Dispose()
$bmp.Dispose()
$brush.Dispose()
$font.Dispose()
$path.Dispose()

$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$dirs = @($desktop)
$public = 'C:\Users\Public\Desktop'
if ((Test-Path $public) -and ($public -ne $desktop)) { $dirs += $public }

foreach ($dir in $dirs) {
  $lnk = Join-Path $dir 'Nexus.lnk'
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = 'C:\Nexus\dist-electron\Nexus-Portable.exe'
  $sc.WorkingDirectory = 'C:\Nexus\dist-electron'
  $sc.IconLocation = "$icoPath,0"
  $sc.Description = 'Nexus'
  $sc.Save()
  $check = $ws.CreateShortcut($lnk)
  [pscustomobject]@{
    Acceso = $lnk
    Nombre = [System.IO.Path]::GetFileNameWithoutExtension($lnk)
    Icono = $check.IconLocation
  }
}

$checkIcon = New-Object System.Drawing.Icon($icoPath)
$checkBmp = $checkIcon.ToBitmap()
$c = $checkBmp.GetPixel(128, 70)
$n = $checkBmp.GetPixel(128, 128)
Write-Host ("Verificacion: fondo R$($c.R) G$($c.G) B$($c.B) | N R$($n.R) G$($n.G) B$($n.B)") -ForegroundColor Cyan
$checkBmp.Dispose()
$checkIcon.Dispose()

try { & ie4uinit.exe -show | Out-Null } catch {}
Write-Host "Icono en color creado: $icoPath" -ForegroundColor Cyan
