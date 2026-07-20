Add-Type -AssemblyName System.Drawing

function New-Icon($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

  # Rounded-rect background
  $rectSize = $size
  $radius = [int]($size * 0.22)
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path2.AddArc(0, 0, $d, $d, 180, 90)
  $path2.AddArc($rectSize - $d, 0, $d, $d, 270, 90)
  $path2.AddArc($rectSize - $d, $rectSize - $d, $d, $d, 0, 90)
  $path2.AddArc(0, $rectSize - $d, $d, $d, 90, 90)
  $path2.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0,0)),
    (New-Object System.Drawing.Point($size,$size)),
    [System.Drawing.Color]::FromArgb(255, 79, 109, 245),
    [System.Drawing.Color]::FromArgb(255, 61, 86, 209)
  )
  $g.FillPath($brush, $path2)

  # Calendar glyph: white rounded rect + red top bar + grid dots
  $margin = [int]($size * 0.20)
  $calW = $size - 2 * $margin
  $calH = [int]($calW * 0.86)
  $calY = $margin + [int]($size * 0.06)
  $calRadius = [int]($size * 0.07)

  $calPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cd = $calRadius * 2
  $calPath.AddArc($margin, $calY, $cd, $cd, 180, 90)
  $calPath.AddArc($margin + $calW - $cd, $calY, $cd, $cd, 270, 90)
  $calPath.AddArc($margin + $calW - $cd, $calY + $calH - $cd, $cd, $cd, 0, 90)
  $calPath.AddArc($margin, $calY + $calH - $cd, $cd, $cd, 90, 90)
  $calPath.CloseFigure()
  $g.FillPath([System.Drawing.Brushes]::White, $calPath)

  # top red bar
  $barH = [int]($calH * 0.28)
  $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 229, 72, 77))
  $g.SetClip($calPath)
  $g.FillRectangle($barBrush, $margin, $calY, $calW, $barH)
  $g.ResetClip()

  # grid dots
  $dotR = [int]($size * 0.035)
  $cols = 3
  $rows = 2
  $gridTop = $calY + $barH + [int]($size * 0.06)
  $gridBottom = $calY + $calH - [int]($size * 0.05)
  $gridLeft = $margin + [int]($size * 0.08)
  $gridRight = $margin + $calW - [int]($size * 0.08)
  $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 79, 109, 245))
  for ($r = 0; $r -lt $rows; $r++) {
    for ($c = 0; $c -lt $cols; $c++) {
      $cx = $gridLeft + ($gridRight - $gridLeft) * $c / ($cols - 1)
      $cy = $gridTop + ($gridBottom - $gridTop) * $r / ($rows - 1)
      $g.FillEllipse($dotBrush, $cx - $dotR, $cy - $dotR, $dotR * 2, $dotR * 2)
    }
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon 192 "C:\Users\ABOU\Projects\emploi-du-temps\icons\icon-192.png"
New-Icon 512 "C:\Users\ABOU\Projects\emploi-du-temps\icons\icon-512.png"
Write-Host "Icons generated."
