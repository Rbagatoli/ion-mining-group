@echo off
setlocal
title Check Proton Prospect Sources
echo Checking the exported public-source watchlist...
echo Keep this window open. The result path appears when checks finish.
echo.
if "%~1"=="" (
    "C:\Program Files\nodejs\node.exe" "%~dp0tools\check-prospect-sources.cjs" --latest-download
) else (
    "C:\Program Files\nodejs\node.exe" "%~dp0tools\check-prospect-sources.cjs" --input "%~1"
)
set "source_check_exit=%errorlevel%"
echo.
pause
exit /b %source_check_exit%
