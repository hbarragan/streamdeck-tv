param([string]$SdkPath, [string]$GradlePath, [switch]$IncludeCredentials)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$libraryDir = Join-Path (Split-Path -Parent $projectDir) 'Librerias APK'
if (-not $SdkPath) { $SdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $libraryDir 'android-sdk' } }
if (-not (Test-Path -LiteralPath $SdkPath)) { throw 'No se encontró Android SDK. Indica -SdkPath o ANDROID_HOME.' }
if (-not $GradlePath) {
    $gradleCandidates = @(Get-ChildItem (Join-Path $libraryDir 'gradle-home\wrapper\dists') -Filter gradle.bat -Recurse -ErrorAction SilentlyContinue)
    $GradlePath = ($gradleCandidates | Where-Object { $_.FullName -match 'gradle-8\.11\.1' } | Select-Object -First 1).FullName
    if (-not $GradlePath) { $GradlePath = (Get-Command gradle.bat -ErrorAction SilentlyContinue).Source }
}
if (-not $GradlePath) { throw 'Instala Gradle 8.11.1 o indica -GradlePath.' }
$assetsDir = Join-Path $projectDir 'android\app\src\main\assets'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectDir 'public\index.html'),(Join-Path $projectDir 'public\app.js'),(Join-Path $projectDir 'public\style.css'),(Join-Path $projectDir 'public\icon.svg'),(Join-Path $projectDir 'public\tmdb.svg') -Destination $assetsDir -Force
if ($IncludeCredentials) { & node (Join-Path $PSScriptRoot 'bundle-android-config.mjs') --include-credentials }
else { & node (Join-Path $PSScriptRoot 'bundle-android-config.mjs') }
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la configuración Android.' }
$sdkProperty = $SdkPath.Replace('\','/').Replace(':','\:')
Set-Content -LiteralPath (Join-Path $projectDir 'android\local.properties') -Value "sdk.dir=$sdkProperty" -Encoding ascii
$env:GRADLE_USER_HOME = Join-Path $libraryDir 'gradle-home'
$buildTempDir = Join-Path $projectDir '.build-temp'
New-Item -ItemType Directory -Force -Path $buildTempDir | Out-Null
# JDK Unix-domain sockets on Windows need a short temporary path.
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    $env:JAVA_TOOL_OPTIONS = $previousJavaOptions + ' "-Djava.io.tmpdir=' + $buildTempDir + '" "-Djdk.net.unixdomain.tmpdir=' + $buildTempDir + '"'
    & $GradlePath -p (Join-Path $projectDir 'android') --no-daemon assembleDebug
    $buildExitCode = $LASTEXITCODE
} finally { $env:JAVA_TOOL_OPTIONS = $previousJavaOptions }
if ($buildExitCode -ne 0) { throw 'La compilación Android ha fallado.' }
$outputDir = Join-Path $projectDir 'dist'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectDir 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $outputDir 'streamdeck-firetv.apk') -Force
Write-Host "APK lista: $outputDir\streamdeck-firetv.apk"
