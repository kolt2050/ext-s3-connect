Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "store-assets"
$sourceScreenshot = Join-Path $outDir "screenshot-main-1280x800.png"

if (-not (Test-Path $sourceScreenshot)) {
    throw "Missing $sourceScreenshot. Capture a real app screenshot before generating promo images."
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Bitmap($width, $height) {
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    return @($bitmap, $graphics)
}

function New-Font($size, $style = [System.Drawing.FontStyle]::Regular) {
    return New-Object System.Drawing.Font "Segoe UI", $size, $style, ([System.Drawing.GraphicsUnit]::Pixel)
}

function Brush($hex) {
    return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Fill-RoundRect($g, $brush, $x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
    $path.Dispose()
}

function Draw-Text($g, $text, $font, $brush, $x, $y, $w, $h) {
    $format = New-Object System.Drawing.StringFormat
    $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
    $rect = New-Object System.Drawing.RectangleF $x, $y, $w, $h
    $g.DrawString($text, $font, $brush, $rect, $format)
    $format.Dispose()
}

function Draw-Logo($g, $x, $y, $size) {
    Fill-RoundRect $g (Brush "#1769c2") $x $y $size $size ([Math]::Round($size * 0.18))
    Draw-Text $g "S3" (New-Font ($size * 0.34) ([System.Drawing.FontStyle]::Bold)) (Brush "#ffffff") ($x + $size * 0.18) ($y + $size * 0.30) ($size * 0.70) ($size * 0.42)
}

function Draw-Screenshot($g, $image, $x, $y, $w, $h) {
    Fill-RoundRect $g (Brush "#ffffff") ($x - 10) ($y - 10) ($w + 20) ($h + 20) 10
    $g.DrawImage($image, $x, $y, $w, $h)
}

function Save-Png($bitmap, $graphics, $path) {
    $graphics.Dispose()
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$screenshot = [System.Drawing.Image]::FromFile($sourceScreenshot)

try {
    $parts = New-Bitmap 440 280
    $bitmap = $parts[0]
    $graphics = $parts[1]
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f6f7f9"))
    Draw-Logo $graphics 28 28 64
    Draw-Text $graphics "S3/OBS Connect" (New-Font 31 ([System.Drawing.FontStyle]::Bold)) (Brush "#10233c") 108 34 300 42
    Draw-Text $graphics "Manage S3-compatible OBS buckets from a Chrome tab." (New-Font 17) (Brush "#536177") 110 82 285 54
    Draw-Screenshot $graphics $screenshot 54 154 332 104
    Save-Png $bitmap $graphics (Join-Path $outDir "small-promo-tile-440x280.png")

    $parts = New-Bitmap 1400 560
    $bitmap = $parts[0]
    $graphics = $parts[1]
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f6f7f9"))
    Draw-Logo $graphics 76 80 96
    Draw-Text $graphics "S3/OBS Connect" (New-Font 58 ([System.Drawing.FontStyle]::Bold)) (Brush "#10233c") 76 196 500 74
    Draw-Text $graphics "Browse, upload, preview, download, and delete objects in user-configured S3-compatible OBS buckets." (New-Font 24) (Brush "#536177") 80 286 500 118
    Draw-Screenshot $graphics $screenshot 650 70 660 412
    Save-Png $bitmap $graphics (Join-Path $outDir "marquee-promo-tile-1400x560.png")
}
finally {
    $screenshot.Dispose()
}

Write-Host "Generated Chrome Web Store promo images in $outDir from the real app screenshot."
