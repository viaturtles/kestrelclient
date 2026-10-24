# Turns cape artwork (any size, portrait) into a Minecraft cape texture.
# Minecraft's cape sheet is 64x32 (here scaled up: -Scale 16 = 1024x512). Layout in vanilla pixels:
#   (1,1) 10x16 outside (what people see behind you)   (12,1) 10x16 inside (faces your back)
#   (1,0) 10x1 top   (11,0) 10x1 bottom   (0,1) 1x16 and (11,1) 1x16 edges
# The art is scaled to cover the outside face (cropped top/bottom if needed). The inside and edges use the
# art's background colour, a little darker. Animated capes: pass several -In files (one per frame); the
# frames are stacked top to bottom in one PNG.
#
#   powershell -File tools\make-cape.ps1 -In art\kestrel-dark.png -Out public\capes\kestrel-dark.png

param(
  [Parameter(Mandatory)][string[]]$In,
  [Parameter(Mandatory)][string]$Out,
  [int]$Scale = 16
)
Add-Type -AssemblyName System.Drawing
$W = 64 * $Scale; $H = 32 * $Scale
$sheet = New-Object Drawing.Bitmap $W, ($H * $In.Count)
$g = [Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality

function Shade([Drawing.Color]$c, [double]$k) { [Drawing.Color]::FromArgb(255, [int]($c.R * $k), [int]($c.G * $k), [int]($c.B * $k)) }

for ($f = 0; $f -lt $In.Count; $f++) {
  $art = [Drawing.Image]::FromFile((Resolve-Path $In[$f]))
  $bg = ([Drawing.Bitmap]$art).GetPixel(2, 2)
  $oy = $f * $H
  $px = { param($x, $y, $w, $h) New-Object Drawing.Rectangle ($x * $Scale), ($oy + $y * $Scale), ($w * $Scale), ($h * $Scale) }
  $edge = New-Object Drawing.SolidBrush (Shade $bg 0.82)
  $inner = New-Object Drawing.SolidBrush (Shade $bg 0.9)
  foreach ($r in @((& $px 1 0 10 1), (& $px 11 0 10 1), (& $px 0 1 1 16), (& $px 11 1 1 16))) { $g.FillRectangle($edge, $r) }
  $g.FillRectangle($inner, (& $px 12 1 10 16))
  # Outside face: cover 10x16 keeping the art's proportions, centred.
  $face = & $px 1 1 10 16
  $k = [Math]::Max($face.Width / $art.Width, $face.Height / $art.Height)
  $sw = $face.Width / $k; $sh = $face.Height / $k
  $src = New-Object Drawing.RectangleF ([single](($art.Width - $sw) / 2)), ([single](($art.Height - $sh) / 2)), ([single]$sw), ([single]$sh)
  $dst = New-Object Drawing.RectangleF ([single]$face.X), ([single]$face.Y), ([single]$face.Width), ([single]$face.Height)
  $g.SetClip($face)
  $g.DrawImage($art, $dst, $src, [Drawing.GraphicsUnit]::Pixel)
  $g.ResetClip()
  $art.Dispose()
}
$dir = Split-Path -Parent $Out
if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
$sheet.Save($Out, [Drawing.Imaging.ImageFormat]::Png)
"Wrote $Out ($W x $($H * $In.Count), $($In.Count) frame(s))"
