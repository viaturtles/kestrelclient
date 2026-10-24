# Makes res/kestrel/icons/kestrel-small.png: the Kestrel bird for tiny sizes (Tab list, 7-8 GUI pixels).
# The real logo, shrunk to 48x48 with high-quality filtering (no thickening, so the gaps between the wing
# strokes stay open and it still reads as our bird), then the half-transparent edge pixels are made firmer
# so the thin strokes don't fade to grey. Run from src-tauri\core.
Add-Type -AssemblyName System.Drawing
$src = [Drawing.Bitmap]::FromFile((Resolve-Path "res\kestrel\icons\kestrel.png"))
$n = 48
$out = New-Object Drawing.Bitmap $n, $n
$g = [Drawing.Graphics]::FromImage($out)
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, $n, $n)
$g.Dispose()
$src.Dispose()
# Firmer strokes: alpha through a curve that lifts the middle (0 stays 0, 255 stays 255), white.
for ($y = 0; $y -lt $n; $y++) { for ($x = 0; $x -lt $n; $x++) {
  $a = $out.GetPixel($x, $y).A / 255.0
  $a = [Math]::Min(1.0, [Math]::Pow($a, 0.6) * 1.15)
  if ($a -lt 0.08) { $a = 0 }
  $out.SetPixel($x, $y, [Drawing.Color]::FromArgb([int]($a * 255), 255, 255, 255))
} }
$out.Save((Join-Path (Get-Location) "res\kestrel\icons\kestrel-small.png"), [Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
"kestrel-small.png: ${n}x${n}"
