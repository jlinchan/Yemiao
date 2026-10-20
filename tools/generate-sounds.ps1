param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets\audio')
)

$ErrorActionPreference = 'Stop'
$sampleRate = 16000
$seconds = 8
$sampleCount = $sampleRate * $seconds
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

function Write-WaveFile {
  param([string]$Name, [scriptblock]$SampleGenerator)
  $path = Join-Path $resolvedOutput "$Name.wav"
  $stream = [System.IO.File]::Create($path)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $dataSize = $sampleCount * 2
    $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
    $writer.Write([int](36 + $dataSize))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
    $writer.Write([int]16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([int]$sampleRate)
    $writer.Write([int]($sampleRate * 2))
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([int]$dataSize)
    for ($i = 0; $i -lt $sampleCount; $i++) {
      $value = & $SampleGenerator $i $sampleRate
      $value = [Math]::Max(-0.95, [Math]::Min(0.95, $value))
      $writer.Write([int16]($value * 32767))
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

$random = [System.Random]::new(7319)
$rainState = 0.0
Write-WaveFile 'rain' {
  param($i, $rate)
  $noise = ($random.NextDouble() * 2 - 1)
  $script:rainState = $script:rainState * 0.72 + $noise * 0.28
  $drops = if (($i % 1597) -lt 18) { [Math]::Sin(($i % 1597) / 18.0 * [Math]::PI) * 0.08 } else { 0 }
  ($script:rainState * 0.13) + $drops
}

$random = [System.Random]::new(4403)
$breezeState = 0.0
Write-WaveFile 'breeze' {
  param($i, $rate)
  $noise = ($random.NextDouble() * 2 - 1)
  $script:breezeState = $script:breezeState * 0.985 + $noise * 0.015
  $swell = 0.55 + 0.45 * [Math]::Sin(2 * [Math]::PI * $i / ($rate * 5.3))
  $script:breezeState * $swell * 0.28
}

$random = [System.Random]::new(1011)
$lakeState = 0.0
Write-WaveFile 'lake' {
  param($i, $rate)
  $noise = ($random.NextDouble() * 2 - 1)
  $script:lakeState = $script:lakeState * 0.97 + $noise * 0.03
  $wave = [Math]::Sin(2 * [Math]::PI * $i / ($rate * 3.9)) * 0.08
  ($script:lakeState * 0.16) + $wave
}

$random = [System.Random]::new(991)
Write-WaveFile 'white' {
  param($i, $rate)
  ($random.NextDouble() * 2 - 1) * 0.105
}

Write-WaveFile 'complete' {
  param($i, $rate)
  $t = $i / $rate
  $envelope = [Math]::Exp(-5.5 * $t)
  ([Math]::Sin(2 * [Math]::PI * 523.25 * $t) * 0.16 + [Math]::Sin(2 * [Math]::PI * 659.25 * $t) * 0.08) * $envelope
}

Write-Output "Generated audio assets in $resolvedOutput"
