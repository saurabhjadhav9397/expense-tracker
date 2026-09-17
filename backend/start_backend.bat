@echo off
title Expense Tracker - Backend (Flask API)
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    py -m venv venv
)

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created .env from .env.example
    echo Please edit .env and set your PostgreSQL DATABASE_URL and FLASK_SECRET_KEY.
    notepad ".env"
)

echo Installing/updating dependencies...
venv\Scripts\python.exe -m pip install -r requirements.txt

echo Starting Expense Tracker API...
venv\Scripts\python.exe app.py
pause
