param(
  [Parameter(Mandatory = $true)]
  [string]$Email
)

$ErrorActionPreference = 'Stop'
$workerRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\worker')).Path
$wrangler = Join-Path $workerRoot 'node_modules\.bin\wrangler.cmd'

if (-not (Test-Path $wrangler)) {
  throw 'Wrangler is not installed in worker/node_modules.'
}

function Read-PlainPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$password = $null
$confirmation = $null

while ($true) {
  $password = Read-PlainPassword 'Enter the new password (8-128 characters)'
  $confirmation = Read-PlainPassword 'Enter the same password again'

  if ($password.Length -lt 8 -or $password.Length -gt 128) {
    Write-Warning 'Password must contain 8-128 characters. Please try again.'
    continue
  }
  if ($password -cne $confirmation) {
    Write-Warning 'The two passwords do not match. Check Caps Lock and the current input language, then try again.'
    continue
  }
  break
}

try {
  $iterations = 100000
  $salt = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($salt)
  } finally {
    $rng.Dispose()
  }

  $derive = [Security.Cryptography.Rfc2898DeriveBytes]::new(
    $password,
    $salt,
    $iterations,
    [Security.Cryptography.HashAlgorithmName]::SHA512
  )
  try {
    $hash = $derive.GetBytes(64)
  } finally {
    $derive.Dispose()
  }

  $storedHash = 'pbkdf2-sha512' + '$' + $iterations + '$' + [Convert]::ToBase64String($salt) + '$' + [Convert]::ToBase64String($hash)
  $safeEmail = $Email.Trim().ToLowerInvariant().Replace("'", "''")
  $safeHash = $storedHash.Replace("'", "''")
  $updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sql = "UPDATE users SET password_hash = '$safeHash', updated_at = $updatedAt WHERE lower(email) = '$safeEmail';"

  Push-Location $workerRoot
  try {
    $rawResult = & $wrangler d1 execute lexiscene --remote --command $sql --json | Out-String
    if ($LASTEXITCODE -ne 0) {
      throw 'Cloud password update failed.'
    }
    $result = $rawResult | ConvertFrom-Json
    $changes = @($result | ForEach-Object { $_.meta.changes } | Where-Object { $_ -ne $null } | Measure-Object -Sum).Sum
    if ($changes -lt 1) {
      throw "No cloud account was updated for $safeEmail. Check the email address and D1 binding."
    }
  } finally {
    Pop-Location
  }

  $loginJson = @{ email = $safeEmail; password = $password } | ConvertTo-Json -Compress
  $loginBody = [Text.Encoding]::UTF8.GetBytes($loginJson)
  $loginTargets = @(
    'https://www.lexiscene.online/api/auth/login',
    'https://lexiscene-worker.2310637142.workers.dev/api/auth/login'
  )
  $loginErrors = @()
  $verifiedTarget = $null

  foreach ($target in $loginTargets) {
    try {
      Invoke-RestMethod `
        -Uri $target `
        -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body $loginBody `
        -TimeoutSec 30 | Out-Null
      $verifiedTarget = $target
      break
    } catch {
      $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
      $detail = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
      $loginErrors += "$target -> HTTP $status`: $detail"
    }
  }

  if (-not $verifiedTarget) {
    throw "The D1 row was updated, but both production login checks failed.`n$($loginErrors -join "`n")"
  }

  Write-Host "Password updated and verified against $verifiedTarget" -ForegroundColor Green
} finally {
  $password = $null
  $confirmation = $null
  $storedHash = $null
  $safeHash = $null
  $sql = $null
  $loginJson = $null
  $loginBody = $null
}
