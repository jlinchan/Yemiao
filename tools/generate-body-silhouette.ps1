param([string]$OutputPath = (Join-Path $PSScriptRoot '..\assets\body-silhouette.png'))
Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new(512, 1024, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$fill = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(142, 126, 158, 145))
try {
  $graphics.FillEllipse($fill, 190, 42, 132, 170)
  $graphics.FillRectangle($fill, 226, 190, 60, 70)
  $torso = [Drawing.Drawing2D.GraphicsPath]::new()
  $torso.AddBezier(176, 232, 196, 212, 316, 212, 336, 232)
  $torso.AddBezier(336, 232, 360, 360, 340, 534, 304, 610)
  $torso.AddBezier(304, 610, 282, 635, 230, 635, 208, 610)
  $torso.AddBezier(208, 610, 172, 534, 152, 360, 176, 232)
  $torso.CloseFigure()
  $graphics.FillPath($fill, $torso)
  $limbPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(142, 126, 158, 145), 58)
  $limbPen.StartCap = [Drawing.Drawing2D.LineCap]::Round
  $limbPen.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawBezier($limbPen, 170, 270, 132, 418, 114, 570, 94, 702)
  $graphics.DrawBezier($limbPen, 342, 270, 380, 418, 398, 570, 418, 702)
  $legPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(142, 126, 158, 145), 72)
  $legPen.StartCap = [Drawing.Drawing2D.LineCap]::Round
  $legPen.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawBezier($legPen, 224, 604, 210, 730, 204, 846, 194, 970)
  $graphics.DrawBezier($legPen, 288, 604, 302, 730, 308, 846, 318, 970)
  $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($OutputPath))
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $bitmap.Save([IO.Path]::GetFullPath($OutputPath), [Drawing.Imaging.ImageFormat]::Png)
} finally {
  $torso.Dispose(); $limbPen.Dispose(); $legPen.Dispose(); $fill.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
Write-Output "Generated $OutputPath"
