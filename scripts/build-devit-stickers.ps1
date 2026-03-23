$ffmpeg = 'C:\Users\elmer\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe'
$frameDir = 'C:\Users\elmer\Desktop\SHINSA\generated\devit-frames'
$outBase = 'C:\Users\elmer\Desktop\SHINSA\client\public\emojis\devit'
$tmpBase = 'C:\Users\elmer\Desktop\SHINSA\generated\devit-sticker-build'

New-Item -ItemType Directory -Force $outBase | Out-Null
New-Item -ItemType Directory -Force $tmpBase | Out-Null

$stickers = @(
  @{ name = 'idle'; frames = @('4-0', '4-1', '4-2', '4-3') },
  @{ name = 'scamper'; frames = @('1-0', '1-1', '1-2', '1-3') },
  @{ name = 'cheer'; frames = @('2-1', '2-2', '2-3', '2-2') },
  @{ name = 'hop'; frames = @('4-0', '2-1', '2-2', '2-3', '4-0') },
  @{ name = 'prance'; frames = @('3-0', '3-1', '3-2', '3-3') },
  @{ name = 'grin'; frames = @('4-0', '4-1', '4-2', '4-1') }
)

foreach ($sticker in $stickers) {
  $seqDir = Join-Path $tmpBase $sticker.name
  New-Item -ItemType Directory -Force $seqDir | Out-Null
  Get-ChildItem $seqDir -File | Remove-Item -Force

  $index = 1
  foreach ($frame in $sticker.frames) {
    $source = Join-Path $frameDir ($frame + '.png')
    $target = Join-Path $seqDir ('{0:D2}.png' -f $index)
    Copy-Item $source $target
    $index++
  }

  $output = Join-Path $outBase ($sticker.name + '.png')
  & $ffmpeg -loglevel error -y -framerate 6 -i (Join-Path $seqDir '%02d.png') -vf 'scale=212:316:flags=neighbor' -plays 0 -f apng $output
}

Get-ChildItem $outBase -File | Select-Object Name, Length
