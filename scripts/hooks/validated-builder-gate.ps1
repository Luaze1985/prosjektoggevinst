# validated-builder-gate.ps1
# Scaffoldet av validated-builder-skillen inn i DETTE repoet
# (scripts\hooks\validated-builder-gate.ps1). Repo-lokal - ikke global.
#
# Kontrakt (samme som leveranse-fable-harness\.claude\hooks\block-secrets.ps1):
# JSON paa stdin, exit 2 = blokker (agenten faar feedback og maa fikse),
# exit 0 = tillat. Fail-open ved intern feil eller manglende config - denne
# scriptet skal ALDRI kunne laase brukeren fast fordi det ikke finner sin
# egen config.
#
# Leser .gate-config.json i repo-roten:
#   { "testCommand": "...", "buildCommand": "...", "buildArtifacts": ["dist/**"] }
# Skriver en logglinje per full gate-kjoering til gate-log.jsonl i repo-roten.

$rawInput = if ($input) { $input -join "`n" } else { [Console]::In.ReadToEnd() }
try { $json = $rawInput | ConvertFrom-Json } catch { exit 0 }

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$configPath = Join-Path $repoRoot ".gate-config.json"
if (-not (Test-Path $configPath)) { exit 0 }

try { $cfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json } catch { exit 0 }
if (-not $cfg.testCommand) { exit 0 }

$eventName = $json.hook_event_name

function Invoke-GateCommand($cmd) {
    $out = & cmd /c "$cmd 2>&1"
    return @{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n") }
}

function Write-GateLog($status, $detail) {
    $logPath = Join-Path $repoRoot "gate-log.jsonl"
    $entry = @{
        timestamp = (Get-Date).ToString("o")
        event     = $eventName
        status    = $status
        detail    = $detail
    } | ConvertTo-Json -Compress
    # Add-Content -Encoding utf8 skriver BOM paa foerste linje i PS 5.1, som
    # oedelegger JSON-parsing av linje 1 for enhver JSONL-leser (jf. samme
    # fellle dokumentert i verktoy\sync-skills.ps1). AppendAllText med en
    # BOM-loes UTF8Encoding unngaar dette.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::AppendAllText($logPath, "$entry`n", $utf8NoBom)
}

function Truncate($text, $max = 4000) {
    if ($text.Length -gt $max) { return $text.Substring(0, $max) + "`n...(kuttet)" }
    return $text
}

# PostToolUse: kun rask-sti naar den faktiske bash-kommandoen ligner
# testCommand - unngaar aa kjoere hele testsuiten paa hver eneste kommando.
if ($eventName -eq "PostToolUse") {
    $bashCmd = $json.tool_input.command
    if (-not $bashCmd -or -not $bashCmd.Contains($cfg.testCommand)) { exit 0 }
}
elseif ($eventName -ne "Stop") {
    exit 0
}

$testResult = Invoke-GateCommand $cfg.testCommand
if ($testResult.ExitCode -ne 0) {
    Write-GateLog "test-fail" $cfg.testCommand
    [Console]::Error.WriteLine("BLOKKERT (validated-builder): tester feiler.`n`n$(Truncate $testResult.Output)")
    exit 2
}

if ($cfg.buildCommand) {
    $buildResult = Invoke-GateCommand $cfg.buildCommand
    if ($buildResult.ExitCode -ne 0) {
        Write-GateLog "build-fail" $cfg.buildCommand
        [Console]::Error.WriteLine("BLOKKERT (validated-builder): bygg feiler.`n`n$(Truncate $buildResult.Output)")
        exit 2
    }
}

if ($cfg.buildArtifacts) {
    $missing = @()
    foreach ($glob in $cfg.buildArtifacts) {
        $full = Join-Path $repoRoot $glob
        if (-not (Get-ChildItem -Path $full -ErrorAction SilentlyContinue)) { $missing += $glob }
    }
    if ($missing.Count -gt 0) {
        Write-GateLog "artifacts-missing" ($missing -join ", ")
        [Console]::Error.WriteLine("BLOKKERT (validated-builder): mangler byggartefakter: $($missing -join ', ')")
        exit 2
    }
}

Write-GateLog "pass" $cfg.testCommand
exit 0
