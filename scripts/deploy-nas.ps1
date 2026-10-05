param(
    [Parameter(Mandatory=$true)][string]$NasHost,
    [Parameter(Mandatory=$true)][string]$CertificateDirectory,
    [Parameter(Mandatory=$true)][string]$RuntimeEnvFile
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$dockerArgs = @('--host',"tcp://${NasHost}:2376",'--tlsverify','--tlscacert',"$CertificateDirectory/ca.pem",'--tlscert',"$CertificateDirectory/cert.pem",'--tlskey',"$CertificateDirectory/key.pem")
function dn { & docker @dockerArgs @args; if ($LASTEXITCODE -ne 0) { throw 'Falló Docker en el NAS.' } }
Push-Location $projectDir
$helper = 'streamdeck-secrets-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$helperCreated = $false
try {
    dn volume create streamdeck-private | Out-Null
    dn run -d --name $helper --network none --user 0 --mount 'type=volume,src=streamdeck-private,dst=/run/secrets' --entrypoint node streamdeck-tv:1.2.0-arm64 -e 'setInterval(()=>{},10000)' | Out-Null
    $helperCreated = $true
    dn cp $RuntimeEnvFile "${helper}:/run/secrets/streamdeck.env"
    dn exec $helper chown 1000:1000 /run/secrets/streamdeck.env
    dn exec $helper chmod 600 /run/secrets/streamdeck.env
    $env:STREAMDECK_BIND_IP = $NasHost
    dn compose --project-name streamdeck -f compose.yaml up -d --wait --wait-timeout 90
    $status = Invoke-RestMethod "http://${NasHost}:3477/api/status" -TimeoutSec 15
    if (-not $status.tmdbConfigured) { throw 'El catálogo no está configurado en el NAS.' }
    Write-Output "StreamDeck comprobado: http://${NasHost}:3477/"
} finally {
    if ($helperCreated) { dn rm -f $helper | Out-Null }
    Remove-Item Env:STREAMDECK_BIND_IP -ErrorAction SilentlyContinue
    Pop-Location
}
