$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$PythonRoot = Join-Path $ProjectRoot '.python312'
$PythonExe = Join-Path $PythonRoot 'python.exe'
$Installer = Join-Path $env:TEMP 'python-3.12.10-amd64.exe'

if (-not (Test-Path -LiteralPath $PythonExe)) {
    Write-Host 'Downloading Python 3.12.10...'
    Invoke-WebRequest `
        -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' `
        -OutFile $Installer
    Write-Host "Installing isolated Python into $PythonRoot..."
    Start-Process `
        -FilePath $Installer `
        -ArgumentList @(
            '/quiet',
            'InstallAllUsers=0',
            "TargetDir=$PythonRoot",
            'PrependPath=0',
            'Include_launcher=0',
            'Include_test=0',
            'Include_pip=1'
        ) `
        -WindowStyle Hidden `
        -Wait
}

& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install numpy onnx onnxruntime
& $PythonExe -m pip install torch --index-url https://download.pytorch.org/whl/cu128

Write-Host 'Verifying training environment...'
& $PythonExe -c "import torch, numpy, onnx, onnxruntime; print('torch', torch.__version__); print('cuda', torch.cuda.is_available()); print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
