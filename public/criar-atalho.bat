@echo off
chcp 65001 >nul
echo Criando atalho do Jurysone...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$htmlPath = '%USERPROFILE%\OneDrive\Documentos\claude\jurysone\app-preview\login.html';" ^
"$chromePaths = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe','C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe');" ^
"$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1;" ^
"if (-not $chrome) { $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe' };" ^
"$shortcutPath = [Environment]::GetFolderPath('Desktop') + '\Jurysone.lnk';" ^
"$shell = New-Object -ComObject WScript.Shell;" ^
"$shortcut = $shell.CreateShortcut($shortcutPath);" ^
"$shortcut.TargetPath = $chrome;" ^
"$shortcut.Arguments = '--app=\"file:///' + $htmlPath.Replace('\','/') + '\"';" ^
"$shortcut.Description = 'Jurysone - Sistema Juridico';" ^
"$shortcut.IconLocation = $chrome + ',0';" ^
"$shortcut.WorkingDirectory = [System.IO.Path]::GetDirectoryName($htmlPath);" ^
"$shortcut.Save();" ^
"Write-Host 'Atalho criado com sucesso!';"

echo.
echo ✓ Atalho "Jurysone" criado na sua Área de Trabalho!
echo.
echo Para fixar na Barra de Tarefas:
echo   1. Clique com botão DIREITO no atalho da Área de Trabalho
echo   2. Selecione "Fixar na barra de tarefas"
echo.
pause
