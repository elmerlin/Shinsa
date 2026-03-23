$defaultFfmpeg = 'C:\Users\elmer\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe'
$frameDir = 'C:\Users\elmer\Desktop\SHINSA\client\public\emojis\heavybreathing'
$outputPath = 'C:\Users\elmer\Desktop\SHINSA\client\public\emojis\heavybreathing\heavybreathing.png'
$tmpBase = 'C:\Users\elmer\Desktop\SHINSA\generated\heavybreathing-sticker-build'
$frameRate = 8
$outputWidth = 256

$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpeg = if ($ffmpegCommand) { $ffmpegCommand.Source } else { $defaultFfmpeg }

if (-not (Test-Path $ffmpeg)) {
  throw "ffmpeg was not found. Checked PATH and '$defaultFfmpeg'."
}

$frames = Get-ChildItem $frameDir -File -Filter 'heavybreathing-*.png' |
  Sort-Object {
    if ($_.BaseName -match '(\d+)$') {
      [int]$matches[1]
    } else {
      [int]::MaxValue
    }
  }

if ($frames.Count -eq 0) {
  throw "No heavybreathing frame PNGs found in '$frameDir'."
}

New-Item -ItemType Directory -Force $tmpBase | Out-Null
Get-ChildItem $tmpBase -File -ErrorAction SilentlyContinue | Remove-Item -Force

$index = 1
foreach ($frame in $frames) {
  $target = Join-Path $tmpBase ('{0:D2}.png' -f $index)
  Copy-Item $frame.FullName $target -Force
  $index++
}

& $ffmpeg `
  -loglevel error `
  -y `
  -framerate $frameRate `
  -i (Join-Path $tmpBase '%02d.png') `
  -vf "scale=${outputWidth}:-1:flags=lanczos" `
  -plays 0 `
  -f apng `
  $outputPath

if (-not (Test-Path $outputPath)) {
  throw "Failed to generate '$outputPath'."
}

Get-Item $outputPath | Select-Object FullName, Length, LastWriteTime
