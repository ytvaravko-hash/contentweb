@echo off
echo ========================================
echo   🚀 Запуск Video API сервера
echo ========================================
echo.
echo Этот сервер обрабатывает видео в 10-20 раз быстрее!
echo.

REM Добавляем FFmpeg в PATH (VOVSOFT Video Converter)
set PATH=%PATH%;C:\Program Files (x86)\VOVSOFT\Video Converter

REM Проверка FFmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ FFmpeg не найден в PATH!
    echo.
    echo Проверьте установку FFmpeg
    echo.
    pause
    exit /b 1
)

echo ✅ FFmpeg найден
echo.

REM Установка зависимостей
echo Проверка зависимостей...
pip show fastapi >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка зависимостей...
    pip install fastapi uvicorn python-multipart
)

echo.
echo ========================================
echo   Сервер запускается на:
echo   http://localhost:8001
echo ========================================
echo.
echo Для остановки нажмите Ctrl+C
echo.

REM Запуск сервера
python video_api.py

