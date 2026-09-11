@echo off
title MendoCash
cd /d "%~dp0"

if not exist "frontend\node_modules" (
    echo Instalando dependencias del frontend...
    cd frontend
    call npm.cmd install
    cd ..
)

if not exist "frontend\dist" (
    echo Compilando la aplicacion...
    cd frontend
    call npm.cmd run build
    cd ..
)

if not exist "backend\node_modules" (
    echo Instalando dependencias del backend...
    cd backend
    call npm.cmd install
    cd ..
)

echo.
echo ============================================================
echo  MendoCash esta iniciando...
echo  Abre en este equipo:  http://localhost:4000
echo ============================================================
echo.
start "" http://localhost:4000
cd backend
node src/server.js
pause
