# Converts the one HEIC photo the client delivered (Health/IMG_1746.HEIC) to a JPEG using the Windows imaging codec (needs the
# "HEIF/HEVC Image Extensions"). The original is only READ; the JPEG is written NEXT TO the delivery folder, never over it:
#   <delivery root>\_converted\IMG_1746.jpg      (powershell -File convert-heic.ps1 -Root <delivery root>)
param([Parameter(Mandatory = $true)][string]$Root)
Add-Type -AssemblyName PresentationCore
$src = Get-ChildItem $Root -Recurse -Filter IMG_1746.HEIC | Where-Object { $_.Name -notlike '._*' } | Select-Object -First 1
if (-not $src) { throw 'IMG_1746.HEIC not found' }
$outDir = Join-Path $Root '_converted'
New-Item -ItemType Directory -Force $outDir | Out-Null
$in = [System.IO.File]::OpenRead($src.FullName)
$dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create($in, 'PreservePixelFormat', 'OnLoad')
$enc = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
$enc.QualityLevel = 95
$enc.Frames.Add($dec.Frames[0])
$out = [System.IO.File]::Create((Join-Path $outDir 'IMG_1746.jpg'))
$enc.Save($out); $out.Close(); $in.Close()
"converted: $($dec.Frames[0].PixelWidth)x$($dec.Frames[0].PixelHeight)"
