@echo off
chcp 65001 >nul
echo.
echo === Reparar asociacion de archivos .exe ===
echo.
assoc .exe=exefile
ftype exefile="%%1" %%*
echo.
echo Listo. Ahora proba abrir Nexus-Portable.exe
echo (extraido del ZIP y copiado en el Escritorio).
echo.
pause
