@echo off
:: ╔══════════════════════════════════════════════════════════════════╗
:: ║  JURYSONE — Startup Silencioso (via BAT)                        ║
:: ║  RECOMENDADO: use iniciar-oculto.vbs ou o atalho da area        ║
:: ║  de trabalho para inicializacao 100% sem janelas.               ║
:: ╚══════════════════════════════════════════════════════════════════╝
@echo off
cd /d "%~dp0"

:: Verifica se proxy ja esta rodando (evita instancia dupla)
netstat -ano | findstr ":3002 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    goto :abre_dashboard
)

:: Inicia proxy Python SEM janela usando pythonw.exe
:: pythonw = interprete Python sem console, zero taskbar
start "" /b pythonw "%~dp0proxy\proxy.py" >> "%~dp0proxy\proxy.log" 2>&1

:: Aguarda proxy subir
timeout /t 2 /nobreak >nul

:: Inicia webhook Node sem janela (se existir)
if exist "%~dp0webhook\server.js" (
    netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
    if errorlevel 1 (
        start "" /b node "%~dp0webhook\server.js" >> "%~dp0webhook\webhook.log" 2>&1
        timeout /t 2 /nobreak >nul
    )
)

:abre_dashboard
:: Abre o dashboard no navegador padrao
start "" "%~dp0app-preview\dashboard.html"

exit /b 0
