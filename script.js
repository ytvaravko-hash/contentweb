// ============================================
// PRO Монтаж - БЕСПЛАТНОЕ РЕШЕНИЕ
// FFmpeg.wasm в браузере + Telegram Bot API
// ============================================

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Получаем video_url и bot token из query параметров
const urlParams = new URLSearchParams(window.location.search);
// ИСПРАВЛЕНИЕ: Декодируем URL (был закодирован в bot.py)
const avatarVideoUrl = urlParams.get('video_url') ? decodeURIComponent(urlParams.get('video_url')) : null;
const userId = tg.initDataUnsafe?.user?.id || 'test_user';

// FFmpeg instance
let ffmpeg = null;
let ffmpegLoaded = false;

// State
const appState = {
    mode: '',
    avatarVideoUrl: avatarVideoUrl || '',
    avatarVideoFile: null,
    secondVideoFile: null,
    avatarPosition: 'top',
    screenRatio: 50,
    resultBlob: null
};

let currentScreen = 1;

// ============================================
// FFmpeg Setup
// ============================================

async function loadFFmpeg() {
    if (ffmpegLoaded) return true;
    
    try {
        updateProcessingStatus('Загрузка FFmpeg...', 5);
        
        // Проверяем доступность SharedArrayBuffer
        if (typeof SharedArrayBuffer === 'undefined') {
            console.error('❌ SharedArrayBuffer is NOT available!');
            console.error('   Это означает, что сервер не отправляет нужные заголовки.');
            console.error('   Убедитесь, что веб-апка открыта через http://localhost:8000');
            console.error('   Запустите: start_local.bat');
            
            throw new Error(
                'Браузер заблокировал SharedArrayBuffer.\n\n' +
                '🔧 Решение:\n' +
                '1. Откройте start_local.bat\n' +
                '2. Дождитесь запуска сервера\n' +
                '3. Перезапустите Pro-монтаж'
            );
        }
        
        console.log('✅ SharedArrayBuffer is available');
        
        const { createFFmpeg, fetchFile } = FFmpeg;
        
        // Пробуем локальный путь, если не работает - fallback на CDN
        let corePathLocal = 'libs/ffmpeg-core.js';
        let corePathCDN = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';
        
        console.log('Trying local FFmpeg core...');
        ffmpeg = createFFmpeg({
            log: true,
            corePath: corePathLocal
        });
        
        try {
            await ffmpeg.load();
            console.log('✅ FFmpeg loaded successfully from LOCAL files!');
        } catch (localError) {
            console.warn('⚠️ Local FFmpeg failed:', localError.message);
            console.log('Trying CDN fallback...');
            
            // Fallback на CDN
            ffmpeg = createFFmpeg({
                log: true,
                corePath: corePathCDN
            });
            
            await ffmpeg.load();
            console.log('✅ FFmpeg loaded successfully from CDN!');
        }
        
        ffmpegLoaded = true;
        return true;
        
    } catch (error) {
        console.error('❌ FFmpeg load error:', error);
        return false;
    }
}

// ============================================
// Navigation
// ============================================

function showScreen(screenNumber) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    const targetScreen = document.querySelector(`[data-screen="${screenNumber}"]`);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        currentScreen = screenNumber;
    }
    
    updateTelegramUI();
}

function updateTelegramUI() {
    if (currentScreen > 1 && currentScreen !== 4 && currentScreen !== 5) {
        tg.BackButton.show();
        tg.BackButton.onClick(goBack);
    } else {
        tg.BackButton.hide();
    }
    tg.MainButton.hide();
}

function goBack() {
    if (currentScreen > 1) {
        showScreen(currentScreen - 1);
    }
}

// ============================================
// Screen 1: Mode Selection
// ============================================

function selectMode(mode) {
    console.log('Mode selected:', mode);
    appState.mode = mode;
    
    const modeNames = {
        'split_screen': 'Разделение экрана',
        'corner': 'В углу экрана'
    };
    
    document.getElementById('selected-mode-title').textContent = modeNames[mode];
    showScreen(2);
}

// ============================================
// Screen 2: Video Upload
// ============================================

function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Проверка размера (макс 500 МБ для браузерной обработки)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        safeAlert('Файл слишком большой! Максимум 500 МБ');
        return;
    }
    
    // Проверка типа
    if (!file.type.startsWith('video/')) {
        safeAlert('Пожалуйста, выберите видеофайл');
        return;
    }
    
    appState.secondVideoFile = file;
    
    // Обновляем UI
    document.getElementById('upload-info').innerHTML = `
        <span style="color: #4CAF50;">✓</span> ${file.name} (${formatFileSize(file.size)})
    `;
    
    // Переход к настройкам
    setTimeout(() => showScreen(3), 300);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

// ============================================
// Screen 3: Settings
// ============================================

function updateComposition() {
    const video1 = document.getElementById('comp-video-1');
    const video2 = document.getElementById('comp-video-2');
    const position = appState.avatarPosition;
    const ratio = parseInt(appState.screenRatio);
    
    video1.style.cssText = '';
    video2.style.cssText = '';
    
    if (position === 'top') {
        video2.style.cssText = `top: 0; left: 0; right: 0; height: ${ratio}%;`;
        video1.style.cssText = `bottom: 0; left: 0; right: 0; height: ${100 - ratio}%;`;
    } else if (position === 'bottom') {
        video1.style.cssText = `top: 0; left: 0; right: 0; height: ${100 - ratio}%;`;
        video2.style.cssText = `bottom: 0; left: 0; right: 0; height: ${ratio}%;`;
    } else if (position === 'left') {
        video2.style.cssText = `top: 0; bottom: 0; left: 0; width: ${ratio}%;`;
        video1.style.cssText = `top: 0; bottom: 0; right: 0; width: ${100 - ratio}%;`;
    } else if (position === 'right') {
        video1.style.cssText = `top: 0; bottom: 0; left: 0; width: ${100 - ratio}%;`;
        video2.style.cssText = `top: 0; bottom: 0; right: 0; width: ${ratio}%;`;
    }
}

function toggleGroup(groupId) {
    const content = document.getElementById(groupId);
    const toggleIcon = document.getElementById(`toggle-${groupId}`);
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggleIcon.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        toggleIcon.textContent = '▶';
    }
}

function updateSlider(type, value) {
    document.getElementById(`${type}-value`).textContent = value;
    
    if (type === 'screen') {
        appState.screenRatio = parseInt(value);
        updateComposition();
    }
}

function updateState(key, value) {
    appState[key] = value;
    if (key === 'avatarPosition') {
        updateComposition();
    }
}

// ============================================
// Screen 4: Processing (FFmpeg в браузере!)
// ============================================

async function startProcessing() {
    if (!appState.secondVideoFile) {
        safeAlert('Пожалуйста, загрузите видео');
        return;
    }
    
    console.log('=== STARTING PROCESSING ===');
    console.log('Avatar URL:', appState.avatarVideoUrl);
    console.log('Second video:', appState.secondVideoFile ? appState.secondVideoFile.name : 'none');
    
    if (!appState.avatarVideoUrl) {
        console.error('❌ Avatar URL is missing!');
        safeAlert('Ошибка: URL аватара не найден');
        return;
    }
    
    if (appState.avatarVideoUrl.includes('dog')) {
        console.error('⚠️ Using DOG test video! This is wrong!');
    }
    
    showScreen(4);
    
    try {
        // Шаг 1: Загрузка FFmpeg
        updateProcessingStatus('Загрузка FFmpeg...', 5);
        const loaded = await loadFFmpeg();
        if (!loaded) {
            // Проверяем причину
            if (typeof SharedArrayBuffer === 'undefined') {
                throw new Error(
                    '❌ SharedArrayBuffer недоступен!\n\n' +
                    'Веб-апка открыта не с того сервера.\n\n' +
                    '🔧 Решение:\n' +
                    '1. Запустите start_local.bat\n' +
                    '2. Перезапустите Pro-монтаж в боте'
                );
            }
            throw new Error('Не удалось загрузить FFmpeg. Проверьте интернет-соединение.');
        }
        
        // Шаг 2: Скачивание аватара
        updateProcessingStatus('Скачивание видео аватара...', 15);
        console.log('Fetching avatar from:', appState.avatarVideoUrl);
        const avatarBlob = await fetch(appState.avatarVideoUrl).then(r => r.blob());
        console.log('Avatar blob size:', avatarBlob.size);
        appState.avatarVideoFile = new File([avatarBlob], 'avatar.mp4', { type: 'video/mp4' });
        
        // Шаг 3: Загрузка файлов в FFmpeg
        updateProcessingStatus('Подготовка файлов...', 25);
        const { fetchFile } = FFmpeg;
        
        ffmpeg.FS('writeFile', 'avatar.mp4', await fetchFile(appState.avatarVideoFile));
        ffmpeg.FS('writeFile', 'second.mp4', await fetchFile(appState.secondVideoFile));
        
        // Шаг 4: Композиция через FFmpeg
        updateProcessingStatus('Объединение видео...', 40);
        
        const { mode, avatarPosition, screenRatio } = appState;
        let ffmpegCommand = [];
        
        if (mode === 'split_screen') {
            // Split screen composition - CROP to fill, no black bars!
            if (avatarPosition === 'top' || avatarPosition === 'bottom') {
                const avatarHeight = screenRatio;
                const secondHeight = 100 - screenRatio;
                const targetWidth = 720;
                const avatarHeightPx = Math.floor(1280 * avatarHeight / 100);
                const secondHeightPx = Math.floor(1280 * secondHeight / 100);
                
                if (avatarPosition === 'top') {
                    ffmpegCommand = [
                        '-i', 'avatar.mp4',
                        '-i', 'second.mp4',
                        '-filter_complex',
                        `[0:v]scale=${targetWidth}:${avatarHeightPx}:force_original_aspect_ratio=increase,crop=${targetWidth}:${avatarHeightPx}[v0];` +
                        `[1:v]scale=${targetWidth}:${secondHeightPx}:force_original_aspect_ratio=increase,crop=${targetWidth}:${secondHeightPx}[v1];` +
                        `[v0][v1]vstack=inputs=2[v]`,
                        '-map', '[v]',
                        '-map', '0:a?',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-c:a', 'aac',
                        '-shortest',
                        'output.mp4'
                    ];
                } else {
                    ffmpegCommand = [
                        '-i', 'second.mp4',
                        '-i', 'avatar.mp4',
                        '-filter_complex',
                        `[0:v]scale=${targetWidth}:${secondHeightPx}:force_original_aspect_ratio=increase,crop=${targetWidth}:${secondHeightPx}[v0];` +
                        `[1:v]scale=${targetWidth}:${avatarHeightPx}:force_original_aspect_ratio=increase,crop=${targetWidth}:${avatarHeightPx}[v1];` +
                        `[v0][v1]vstack=inputs=2[v]`,
                        '-map', '[v]',
                        '-map', '1:a?',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-c:a', 'aac',
                        '-shortest',
                        'output.mp4'
                    ];
                }
            } else {
                // Left/right split
                const avatarWidth = screenRatio;
                const secondWidth = 100 - screenRatio;
                const targetHeight = 1280;
                const avatarWidthPx = Math.floor(720 * avatarWidth / 100);
                const secondWidthPx = Math.floor(720 * secondWidth / 100);
                
                if (avatarPosition === 'left') {
                    ffmpegCommand = [
                        '-i', 'avatar.mp4',
                        '-i', 'second.mp4',
                        '-filter_complex',
                        `[0:v]scale=${avatarWidthPx}:${targetHeight}:force_original_aspect_ratio=increase,crop=${avatarWidthPx}:${targetHeight}[v0];` +
                        `[1:v]scale=${secondWidthPx}:${targetHeight}:force_original_aspect_ratio=increase,crop=${secondWidthPx}:${targetHeight}[v1];` +
                        `[v0][v1]hstack=inputs=2[v]`,
                        '-map', '[v]',
                        '-map', '0:a?',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-c:a', 'aac',
                        '-shortest',
                        'output.mp4'
                    ];
                } else {
                    ffmpegCommand = [
                        '-i', 'second.mp4',
                        '-i', 'avatar.mp4',
                        '-filter_complex',
                        `[0:v]scale=${secondWidthPx}:${targetHeight}:force_original_aspect_ratio=increase,crop=${secondWidthPx}:${targetHeight}[v0];` +
                        `[1:v]scale=${avatarWidthPx}:${targetHeight}:force_original_aspect_ratio=increase,crop=${avatarWidthPx}:${targetHeight}[v1];` +
                        `[v0][v1]hstack=inputs=2[v]`,
                        '-map', '[v]',
                        '-map', '1:a?',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-c:a', 'aac',
                        '-shortest',
                        'output.mp4'
                    ];
                }
            }
        } else if (mode === 'corner') {
            // Corner overlay (аватар в углу) - crop second video to fill screen
            const cornerMap = {
                'top': 'W-w-10:10',
                'bottom': 'W-w-10:H-h-10',
                'left': '10:H-h-10',
                'right': 'W-w-10:H-h-10'
            };
            
            const targetWidth = 720;
            const targetHeight = 1280;
            
            ffmpegCommand = [
                '-i', 'second.mp4',
                '-i', 'avatar.mp4',
                '-filter_complex',
                `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}[bg];` +
                `[1:v]scale=iw*0.3:ih*0.3[ovr];[bg][ovr]overlay=${cornerMap[avatarPosition]}[v]`,
                '-map', '[v]',
                '-map', '1:a?',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-shortest',
                'output.mp4'
            ];
        }
        
        console.log('FFmpeg command:', ffmpegCommand);
        
        // Запуск FFmpeg
        await ffmpeg.run(...ffmpegCommand);
        
        updateProcessingStatus('Финализация...', 90);
        
        // Чтение результата
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        appState.resultBlob = blob;
        
        updateProcessingStatus('Готово!', 100);
        
        // Показываем результат
        setTimeout(() => showResultScreen(blob), 500);
        
    } catch (error) {
        console.error('Processing error:', error);
        showErrorScreen(error.message);
    }
}

function updateProcessingStatus(text, progress) {
    document.getElementById('processing-status').textContent = text;
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = Math.round(progress) + '%';
}

// ============================================
// Screen 5: Result
// ============================================

function showResultScreen(videoBlob) {
    const videoUrl = URL.createObjectURL(videoBlob);
    document.getElementById('result-preview').src = videoUrl;
    showScreen(5);
}

function downloadVideo() {
    if (!appState.resultBlob) return;
    
    const url = URL.createObjectURL(appState.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pro_montage_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function sendToBot() {
    if (!appState.resultBlob) return;
    
    try {
        updateProcessingStatus('Отправка в бот...', 50);
        showScreen(4);
        
        // Отправляем через Telegram sendData (бот обработает)
        const reader = new FileReader();
        reader.onload = function() {
            const base64 = reader.result.split(',')[1];
            tg.sendData(JSON.stringify({
                action: 'upload_result',
                video_base64: base64,
                user_id: userId
            }));
            
            safeAlert('Видео отправлено в бот!');
            tg.close();
        };
        reader.readAsDataURL(appState.resultBlob);
        
    } catch (error) {
        console.error('Send error:', error);
        safeAlert('Ошибка отправки. Скачайте видео вручную.');
        showScreen(5);
    }
}

// ============================================
// Screen 6: Error
// ============================================

function showErrorScreen(errorMessage) {
    document.getElementById('error-text').textContent = errorMessage || 'Произошла неизвестная ошибка';
    showScreen(6);
}

// ============================================
// Utilities
// ============================================

function resetApp() {
    appState.mode = '';
    appState.secondVideoFile = null;
    appState.avatarVideoFile = null;
    appState.resultBlob = null;
    document.getElementById('video-file').value = '';
    document.getElementById('upload-info').textContent = 'Поддерживаются: MP4, MOV, AVI (до 500 МБ)';
    showScreen(1);
}

function safeAlert(message) {
    try {
        if (tg.showAlert && typeof tg.showAlert === 'function') {
            tg.showAlert(message);
        } else {
            alert(message);
        }
    } catch (e) {
        console.log('[Alert]:', message);
    }
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== PRO Montage FREE WebApp v1.1 ===');
    console.log('Avatar video URL:', avatarVideoUrl);
    console.log('Avatar URL length:', avatarVideoUrl ? avatarVideoUrl.length : 0);
    
    // ОТЛАДКА: Проверяем URL параметры
    console.log('All URL params:', window.location.search);
    const allParams = {};
    urlParams.forEach((value, key) => {
        allParams[key] = value;
    });
    console.log('Parsed params:', allParams);
    
    if (!avatarVideoUrl) {
        console.error('⚠️ NO AVATAR VIDEO URL PROVIDED!');
        console.log('This means video_url parameter is missing from URL');
    } else if (avatarVideoUrl.includes('dog')) {
        console.error('⚠️ WARNING: Avatar URL contains "dog" (test video)!');
    }
    
    showScreen(1);
    updateComposition();
    
    if (tg.colorScheme === 'dark') {
        document.body.style.background = 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)';
    }
});

console.log('=== PRO Montage FREE WebApp v1.0 (FFmpeg.wasm) ===');



