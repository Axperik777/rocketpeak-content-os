@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
npm run preview -- --port 4173

