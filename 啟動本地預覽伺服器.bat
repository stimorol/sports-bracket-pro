@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/serve-dist.mjs
pause
