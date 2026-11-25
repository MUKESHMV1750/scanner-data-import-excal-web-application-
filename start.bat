@echo off
title Smart Book Scanner - Local Server
echo ====================================================
echo Starting Smart Book Scanner on http://localhost:3000
echo Camera permission will be PERMANENTLY saved!
echo ====================================================
cd /d "%~dp0"
node server.js
pause
