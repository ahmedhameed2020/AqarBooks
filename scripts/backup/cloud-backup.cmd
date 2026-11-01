@echo off
rem Scheduled entry point for scripts/backup/cloud-backup.sh (Windows Task Scheduler).
"C:\Program Files\Git\bin\bash.exe" -lc "/d/Web/AqarBooks/scripts/backup/cloud-backup.sh"
exit /b %ERRORLEVEL%
