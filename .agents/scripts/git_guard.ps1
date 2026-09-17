# Git Guard & Command Safety Interceptor
param (
    [string]$CommandToValidate
)

if (-not $CommandToValidate) {
    exit 0
}

$forbiddenPatterns = @(
    "git reset --hard",
    "git clean -fd",
    "git clean -f",
    "git push --force",
    "git push -f",
    "git add -A",
    "git add .",
    "git checkout -- .",
    "git restore .",
    "git restore --staged .",
    "rm -rf /",
    "DROP DATABASE",
    "DROP SCHEMA public"
)

foreach ($pattern in $forbiddenPatterns) {
    if ($CommandToValidate -like "*$pattern*") {
        Write-Error "🚨 [GIT/COMMAND GUARD ERROR]: Comando bloqueado por política de segurança: '$pattern'."
        exit 1
    }
}

exit 0
