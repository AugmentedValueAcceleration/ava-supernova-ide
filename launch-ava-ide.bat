@echo off
cd /d "C:\Users\Dell\Desktop\Stew.AI\ava-supernova\packages\ide"
"node_modules\electron\dist\electron.exe" "electron-app\lib\backend\electron-main.js" "--plugins=local-dir:..\..\plugins"
