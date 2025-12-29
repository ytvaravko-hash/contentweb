"""
Серверная обработка видео для Pro-монтажа
FastAPI сервер для быстрой обработки через нативный FFmpeg
"""
import os
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Literal
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Pro Montage Video API")

# CORS для работы с веб-приложением
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Временная папка для обработки
TEMP_DIR = Path(tempfile.gettempdir()) / "pro_montage"
TEMP_DIR.mkdir(exist_ok=True)

def check_ffmpeg():
    """Проверка наличия FFmpeg"""
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        logger.info(f"FFmpeg found: {result.stdout.split()[2]}")
        return True
    except Exception as e:
        logger.error(f"FFmpeg not found: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Проверка при запуске"""
    if not check_ffmpeg():
        logger.warning("⚠️ FFmpeg not found! Install: apt-get install ffmpeg")
    else:
        logger.info("✅ FFmpeg ready!")

@app.get("/health")
async def health_check():
    """Проверка статуса API"""
    ffmpeg_available = check_ffmpeg()
    return {
        "status": "ok",
        "ffmpeg": ffmpeg_available,
        "temp_dir": str(TEMP_DIR)
    }

@app.post("/process")
async def process_video(
    avatar_video: UploadFile = File(..., description="Видео-аватар"),
    second_video: UploadFile = File(..., description="Второе видео"),
    mode: Literal["split", "corner"] = Form("split", description="Режим композиции"),
    avatar_position: Literal["top", "bottom", "left", "right"] = Form("left", description="Позиция аватара"),
    avatar_size: int = Form(50, description="Размер аватара (% для split, игнорируется для corner)")
):
    """
    Обработка видео на сервере
    
    Режимы:
    - split: Разделение экрана (два видео рядом)
    - corner: Аватар в углу
    """
    temp_files = []
    
    try:
        logger.info(f"Starting video processing: mode={mode}, position={avatar_position}, size={avatar_size}")
        
        # Сохраняем загруженные файлы
        avatar_path = TEMP_DIR / f"avatar_{os.urandom(8).hex()}.mp4"
        second_path = TEMP_DIR / f"second_{os.urandom(8).hex()}.mp4"
        output_path = TEMP_DIR / f"output_{os.urandom(8).hex()}.mp4"
        
        temp_files = [avatar_path, second_path, output_path]
        
        # Сохраняем файлы
        with open(avatar_path, "wb") as f:
            f.write(await avatar_video.read())
        with open(second_path, "wb") as f:
            f.write(await second_video.read())
        
        logger.info(f"Files saved: avatar={avatar_path.stat().st_size} bytes, second={second_path.stat().st_size} bytes")
        
        # Формируем FFmpeg команду
        if mode == "split":
            ffmpeg_command = build_split_command(
                str(avatar_path),
                str(second_path),
                str(output_path),
                avatar_position,
                avatar_size
            )
        else:  # corner
            ffmpeg_command = build_corner_command(
                str(avatar_path),
                str(second_path),
                str(output_path),
                avatar_position
            )
        
        logger.info(f"FFmpeg command: {' '.join(ffmpeg_command)}")
        
        # Запускаем FFmpeg
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='ignore')
            logger.error(f"FFmpeg error: {error_msg}")
            raise HTTPException(status_code=500, detail=f"FFmpeg processing failed: {error_msg[:500]}")
        
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="Output file not created")
        
        logger.info(f"✅ Video processed successfully: {output_path.stat().st_size} bytes")
        
        # Возвращаем файл
        return FileResponse(
            path=str(output_path),
            media_type="video/mp4",
            filename="pro_montage_result.mp4",
            background=cleanup_files_background(temp_files)
        )
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        # Очистка при ошибке
        for path in temp_files:
            if path.exists():
                path.unlink()
        raise HTTPException(status_code=500, detail=str(e))

def build_split_command(avatar: str, second: str, output: str, position: str, size: int) -> list:
    """Команда для режима split (разделение экрана)"""
    
    # Оптимизированные параметры для СКОРОСТИ
    base_params = [
        'ffmpeg',
        '-y',  # Перезаписывать
        '-i', avatar,
        '-i', second,
    ]
    
    if position in ['top', 'bottom']:
        # Вертикальное разделение
        avatar_height = int(1280 * size / 100)
        second_height = 1280 - avatar_height
        
        if position == 'top':
            filter_complex = (
                f"[0:v]scale=720:{avatar_height}:force_original_aspect_ratio=decrease,"
                f"pad=720:{avatar_height}:(ow-iw)/2:(oh-ih)/2[v0];"
                f"[1:v]scale=720:{second_height}:force_original_aspect_ratio=decrease,"
                f"pad=720:{second_height}:(ow-iw)/2:(oh-ih)/2[v1];"
                f"[v0][v1]vstack=inputs=2[v]"
            )
            audio_map = '0:a?'
        else:  # bottom
            filter_complex = (
                f"[1:v]scale=720:{second_height}:force_original_aspect_ratio=decrease,"
                f"pad=720:{second_height}:(ow-iw)/2:(oh-ih)/2[v0];"
                f"[0:v]scale=720:{avatar_height}:force_original_aspect_ratio=decrease,"
                f"pad=720:{avatar_height}:(ow-iw)/2:(oh-ih)/2[v1];"
                f"[v0][v1]vstack=inputs=2[v]"
            )
            audio_map = '1:a?'
    else:
        # Горизонтальное разделение
        avatar_width = int(720 * size / 100)
        second_width = 720 - avatar_width
        
        if position == 'left':
            filter_complex = (
                f"[0:v]scale={avatar_width}:1280:force_original_aspect_ratio=decrease,"
                f"pad={avatar_width}:1280:(ow-iw)/2:(oh-ih)/2[v0];"
                f"[1:v]scale={second_width}:1280:force_original_aspect_ratio=decrease,"
                f"pad={second_width}:1280:(ow-iw)/2:(oh-ih)/2[v1];"
                f"[v0][v1]hstack=inputs=2[v]"
            )
            audio_map = '0:a?'
        else:  # right
            filter_complex = (
                f"[1:v]scale={second_width}:1280:force_original_aspect_ratio=decrease,"
                f"pad={second_width}:1280:(ow-iw)/2:(oh-ih)/2[v0];"
                f"[0:v]scale={avatar_width}:1280:force_original_aspect_ratio=decrease,"
                f"pad={avatar_width}:1280:(ow-iw)/2:(oh-ih)/2[v1];"
                f"[v0][v1]hstack=inputs=2[v]"
            )
            audio_map = '1:a?'
    
    # ОПТИМИЗИРОВАННЫЕ параметры кодирования
    encode_params = [
        '-filter_complex', filter_complex,
        '-map', '[v]',
        '-map', audio_map,
        '-c:v', 'libx264',
        '-preset', 'veryfast',  # Быстрее чем ultrafast для размера файла
        '-crf', '28',           # Хорошее сжатие
        '-r', '25',             # 25 FPS
        '-movflags', '+faststart',  # Быстрый старт воспроизведения
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        output
    ]
    
    return base_params + encode_params

def build_corner_command(avatar: str, second: str, output: str, position: str) -> list:
    """Команда для режима corner (аватар в углу)"""
    
    # Позиции для overlay
    corner_positions = {
        'top': 'W-w-10:10',
        'bottom': 'W-w-10:H-h-10',
        'left': '10:H-h-10',
        'right': 'W-w-10:H-h-10'
    }
    
    overlay_position = corner_positions.get(position, 'W-w-10:H-h-10')
    
    return [
        'ffmpeg',
        '-y',
        '-i', second,
        '-i', avatar,
        '-filter_complex',
        f"[1:v]scale=iw*0.3:ih*0.3[ovr];[0:v][ovr]overlay={overlay_position}[v]",
        '-map', '[v]',
        '-map', '1:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-r', '25',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        output
    ]

async def cleanup_files_background(paths: list):
    """Фоновая очистка файлов после отправки"""
    await asyncio.sleep(5)  # Ждём пока файл отправится
    for path in paths:
        try:
            if path.exists():
                path.unlink()
                logger.info(f"Cleaned up: {path}")
        except Exception as e:
            logger.error(f"Cleanup error for {path}: {e}")

if __name__ == "__main__":
    # Запуск сервера
    uvicorn.run(
        "video_api:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )

