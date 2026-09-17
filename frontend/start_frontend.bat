@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing React dependencies...
  call npm install
)
echo Starting React development server...
call npm run dev
pause
