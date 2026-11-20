$fso = New-Object -ComObject Scripting.FileSystemObject
$frontend = $fso.GetFolder((Join-Path $PSScriptRoot 'frontend')).ShortPath
$vite = $fso.GetFile((Join-Path $PSScriptRoot 'frontend\node_modules\vite\bin\vite.js')).ShortPath
$node = 'C:\PROGRA~1\nodejs\node.exe'

Set-Location $frontend
& $node $vite --host 127.0.0.1 --port 5173
