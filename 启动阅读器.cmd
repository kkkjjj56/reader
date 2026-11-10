@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js，或按照 README 中的方法使用 Python 启动。
  pause
  exit /b 1
)
node server.js --open
pause
