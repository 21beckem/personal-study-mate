@echo off
cd /d "%~dp0/"

python -m pip install -r "local-transcription-server/requirements.txt"
if errorlevel 1 exit /b %errorlevel%

python "local-transcription-server/server.py"
