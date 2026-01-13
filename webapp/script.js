// ============================================
// PRO Монтаж - БЕСПЛАТНОЕ РЕШЕНИЕ
// FFmpeg.wasm в браузере + Telegram Bot API
// ============================================

// Telegram WebApp bridge (безопасно: чтобы не падало во внешнем браузере)
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : {
    ready: () => {},
    expand: () => {},
    close: () => {},
    sendData: () => {},
    showAlert: null,
    colorScheme: 'light',
    initDataUnsafe: {},
    BackButton: { show: () => {}, hide: () => {}, onClick: () => {} },
    MainButton: { hide: () => {} }
};

try { tg.ready(); } catch (e) {}
try { tg.expand(); } catch (e) {}

// Получаем параметры из query string
const urlParams = new URLSearchParams(window.location.search);
const avatarVideoUrl = decodeURIComponent(urlParams.get('video_url') || '');
const userId = (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? tg.initDataUnsafe.user.id : 'test_user';
const serverUrl = decodeURIComponent(urlParams.get('server_url') || '');

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
    addSubtitles: false,
    subtitleTemplateId: '',
    subtitleTemplates: [],
    resultBlob: null
};

let currentScreen = 1;

// ============================================
// FFmpeg Setup (v0.12+)
// ============================================

async function loadFFmpeg() {
    if (ffmpegLoaded) return true;
    
    try {
        updateProcessingStatus('Загрузка FFmpeg...', 5);
        console.log('Starting FFmpeg v0.12 load...');
        
        // Проверяем доступность FFmpeg v0.12
        if (typeof FFmpegWASM === 'undefined' || !FFmpegWASM.FFmpeg) {
            throw new Error('FFmpeg v0.12 library not loaded. Check script tags in HTML.');
        }
        
        if (typeof FFmpegUtil === 'undefined') {
            throw new Error('FFmpegUtil library not loaded. Check @ffmpeg/util script tag in HTML.');
        }
        
        console.log('FFmpeg v0.12 libraries detected');
        
        // Создаём инстанс FFmpeg v0.12 (FFmpeg из FFmpegWASM, утилиты из FFmpegUtil)
        const { FFmpeg } = FFmpegWASM;
        const { toBlobURL } = FFmpegUtil;
        
        ffmpeg = new FFmpeg();
        
        // Настраиваем логирование
        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]:', message);
        });
        
        ffmpeg.on('progress', ({ progress, time }) => {
            const percent = Math.round(progress * 100);
            const currentProgress = 40 + (percent * 0.5); // 40% до 90%
            updateProcessingStatus('Обработка видео...', currentProgress);
            console.log(`[FFmpeg Progress]: ${percent}% (time: ${time})`);
        });
        
        console.log('Loading FFmpeg core files from CDN...');
        
        // Core и WASM с CDN, worker локально
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
        const workerLocalPath = 'lib/814.ffmpeg.js';
        
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        console.log('Core JS loaded as blob URL');
        
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
        console.log('WASM loaded as blob URL');
        
        // Worker из локального файла
        const workerURL = await toBlobURL(workerLocalPath, 'text/javascript');
        console.log('Worker loaded from local file');
        
        await ffmpeg.load({ coreURL, wasmURL, workerURL });
        
        ffmpegLoaded = true;
        console.log('✅ FFmpeg v0.12 loaded successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ FFmpeg load error:', error);
        console.error('Error details:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
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
// Subtitles (ZapCap)
// ============================================

function toggleSubtitles(enabled) {
    appState.addSubtitles = !!enabled;
    const select = document.getElementById('subtitle-template');
    const hint = document.getElementById('subtitle-hint');
    if (!select) return;

    const hasTemplates = Array.isArray(appState.subtitleTemplates) && appState.subtitleTemplates.length > 0;
    select.disabled = !(appState.addSubtitles && hasTemplates);

    if (!USE_SERVER && appState.addSubtitles) {
        // В браузерном режиме ZapCap недоступен (ключи должны быть на сервере)
        safeAlert('Субтитры доступны только при серверной обработке (через server_url).');
        appState.addSubtitles = false;
        document.getElementById('add-subtitles').checked = false;
        select.disabled = true;
    }

    if (hint) {
        if (!USE_SERVER) {
            hint.textContent = '⚠️ Субтитры доступны только при серверной обработке';
        } else if (!hasTemplates) {
            hint.textContent = '⏳ Загружаем стили из ZapCap...';
        } else if (appState.addSubtitles) {
            hint.textContent = '✅ Субтитры будут добавлены через ZapCap';
        } else {
            hint.textContent = '💡 Стили подгружаются из ZapCap и применяются на сервере';
        }
    }
}

async function loadSubtitleTemplates() {
    const select = document.getElementById('subtitle-template');
    const hint = document.getElementById('subtitle-hint');
    if (!select) return;

    // По умолчанию выключено
    select.disabled = true;

    if (!USE_SERVER) {
        select.innerHTML = '<option value=\"\">Субтитры доступны только на сервере</option>';
        if (hint) hint.textContent = '⚠️ Субтитры доступны только при серверной обработке';
        return;
    }

    try {
        select.innerHTML = '<option value=\"\">Загрузка стилей...</option>';
        if (hint) hint.textContent = '⏳ Загружаем стили из ZapCap...';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${SERVER_URL}/zapcap/templates`, {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`Templates fetch failed: ${res.status}`);
        }

        const data = await res.json();
        const templates = Array.isArray(data.templates) ? data.templates : (Array.isArray(data) ? data : []);
        appState.subtitleTemplates = templates;

        if (!templates.length) {
            select.innerHTML = '<option value=\"\">Нет доступных стилей (ZapCap)</option>';
            if (hint) hint.textContent = '⚠️ ZapCap не вернул стили (проверьте ключ и доступность)';
            return;
        }

        select.innerHTML = '<option value=\"\">Выберите стиль</option>' + templates
            .filter(t => t && t.id)
            .map(t => `<option value=\"${t.id}\">${escapeHtml(t.name || t.id)}</option>`)
            .join('');

        // По умолчанию выберем первый (но только если чекбокс включён)
        if (!appState.subtitleTemplateId) {
            appState.subtitleTemplateId = templates[0].id;
        }

        if (appState.subtitleTemplateId) {
            select.value = appState.subtitleTemplateId;
        }

        toggleSubtitles(appState.addSubtitles);
    } catch (e) {
        console.warn('Failed to load ZapCap templates:', e);
        select.innerHTML = '<option value=\"\">Ошибка загрузки стилей</option>';
        if (hint) hint.textContent = '⚠️ Ошибка загрузки стилей ZapCap';
    }
}

function escapeHtml(str) {
    // Без replaceAll / optional chaining: совместимее со старыми WebView
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// Screen 4: Processing
// ============================================

// Серверная обработка (БЫСТРО! 10-20x быстрее)
// Автоопределение: сервер только для localhost, браузер для GitHub Pages
const IS_LOCAL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1');
const USE_SERVER = !!serverUrl || IS_LOCAL;
const SERVER_URL = serverUrl || 'http://localhost:8001';

async function startProcessing() {
    console.log('🔧 Processing mode:', USE_SERVER ? '⚡ SERVER' : '🌐 BROWSER');
    console.log('📍 Location:', window.location.origin);
    console.log('🖥️ Is local:', IS_LOCAL);
    console.log('🌐 Server URL:', SERVER_URL);
    
    if (USE_SERVER) {
        return await startProcessingServer();
    } else {
        return await startProcessingBrowser();
    }
}

// Серверная обработка
async function startProcessingServer() {
    if (!appState.secondVideoFile) {
        safeAlert('Пожалуйста, загрузите видео');
        return;
    }
    
    if (!appState.avatarVideoUrl) {
        safeAlert(
            '⚠️ URL аватара не найден!\n\n' +
            'Пожалуйста:\n' +
            '1. Вернитесь в бот\n' +
            '2. Создайте видео с аватаром\n' +
            '3. Нажмите "🎞️ Pro-монтаж (beta)"\n\n' +
            'Видео должно быть создано в той же сессии.'
        );
        return;
    }
    
    showScreen(4);
    
    try {
        // Шаг 1: Скачивание аватара
        updateProcessingStatus('Загрузка видео аватара...', 10);
        const avatarBlob = await fetch(appState.avatarVideoUrl).then(r => r.blob());
        
        // Шаг 2: Подготовка данных
        updateProcessingStatus('Подготовка файлов...', 20);
        
        const formData = new FormData();
        formData.append('avatar_video', avatarBlob, 'avatar.mp4');
        formData.append('second_video', appState.secondVideoFile);
        formData.append('mode', appState.mode === 'split_screen' ? 'split' : 'corner');
        formData.append('avatar_position', appState.avatarPosition);
        formData.append('avatar_size', appState.screenRatio);
        formData.append('add_subtitles', appState.addSubtitles ? 'true' : 'false');
        formData.append('subtitle_template_id', appState.subtitleTemplateId || '');
        
        console.log('🚀 Sending to server:', {
            server: SERVER_URL,
            mode: appState.mode,
            position: appState.avatarPosition,
            size: appState.screenRatio,
            add_subtitles: appState.addSubtitles,
            subtitle_template_id: appState.subtitleTemplateId || null,
            avatar_size: avatarBlob.size,
            second_size: appState.secondVideoFile.size
        });
        
        // Шаг 3: Отправка на сервер
        updateProcessingStatus('⚡ Быстрая обработка на сервере...', 30);
        
        const response = await fetch(`${SERVER_URL}/process`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || 'Server processing failed');
        }
        
        updateProcessingStatus('Загрузка результата...', 80);
        
        // Шаг 4: Получение результата
        const resultBlob = await response.blob();
        appState.resultBlob = resultBlob;
        
        updateProcessingStatus('Готово!', 100);
        
        console.log('✅ Server processing complete!', resultBlob.size, 'bytes');
        
        // Показываем результат
        setTimeout(() => showResultScreen(resultBlob), 500);
        
    } catch (error) {
        console.error('Server processing error:', error);
        
        // Если сервер не доступен, показываем ошибку
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showErrorScreen(
                '❌ Сервер обработки недоступен\n\n' +
                'Убедитесь что сервер запущен:\n' +
                '> python video_api.py\n\n' +
                'Или установите USE_SERVER = false в script.js\n' +
                'для браузерной обработки (медленнее)'
            );
        } else {
            showErrorScreen(error.message);
        }
    }
}

// Браузерная обработка (медленнее, но без сервера)
async function startProcessingBrowser() {
    if (!appState.secondVideoFile) {
        safeAlert('Пожалуйста, загрузите видео');
        return;
    }
    
    if (!appState.avatarVideoUrl) {
        safeAlert(
            '⚠️ URL аватара не найден!\n\n' +
            'Пожалуйста:\n' +
            '1. Вернитесь в бот\n' +
            '2. Создайте видео с аватаром\n' +
            '3. Нажмите "🎞️ Pro-монтаж (beta)"\n\n' +
            'Видео должно быть создано в той же сессии.'
        );
        return;
    }
    
    showScreen(4);
    
    try {
        // Шаг 1: Загрузка FFmpeg v0.12
        updateProcessingStatus('Загрузка FFmpeg...', 5);
        const loaded = await loadFFmpeg();
        if (!loaded) {
            throw new Error(
                'Не удалось загрузить FFmpeg.\n\n' +
                'Возможные причины:\n' +
                '• Нестабильное интернет-соединение\n' +
                '• Браузер не поддерживает WebAssembly\n' +
                '• Telegram WebApp заблокировал загрузку\n\n' +
                'Попробуйте:\n' +
                '1. Обновить страницу\n' +
                '2. Использовать другой браузер\n' +
                '3. Проверить интернет-соединение'
            );
        }
        
        // Шаг 2: Скачивание аватара
        updateProcessingStatus('Скачивание видео аватара...', 15);
        const avatarBlob = await fetch(appState.avatarVideoUrl).then(r => r.blob());
        appState.avatarVideoFile = new File([avatarBlob], 'avatar.mp4', { type: 'video/mp4' });
        
        // Шаг 3: Загрузка файлов в FFmpeg v0.12 (новый API)
        updateProcessingStatus('Подготовка файлов...', 25);
        const { fetchFile } = FFmpegUtil;
        
        // FFmpeg v0.12 использует writeFile вместо FS
        await ffmpeg.writeFile('avatar.mp4', await fetchFile(appState.avatarVideoFile));
        await ffmpeg.writeFile('second.mp4', await fetchFile(appState.secondVideoFile));
        
        console.log('Files written to FFmpeg filesystem');
        
        // Шаг 4: Композиция через FFmpeg
        updateProcessingStatus('Объединение видео...', 40);
        
        const { mode, avatarPosition, screenRatio } = appState;
        let ffmpegCommand = [];
        
        if (mode === 'split_screen') {
            // Split screen composition
            if (avatarPosition === 'top' || avatarPosition === 'bottom') {
                const avatarHeight = screenRatio;
                const secondHeight = 100 - screenRatio;
                
                if (avatarPosition === 'top') {
                    ffmpegCommand = [
                        '-i', 'avatar.mp4',
                        '-i', 'second.mp4',
                        '-filter_complex',
                        `[0:v]scale=720:${Math.floor(1280 * avatarHeight / 100)}:force_original_aspect_ratio=decrease,pad=720:${Math.floor(1280 * avatarHeight / 100)}:(ow-iw)/2:(oh-ih)/2[v0];` +
                        `[1:v]scale=720:${Math.floor(1280 * secondHeight / 100)}:force_original_aspect_ratio=decrease,pad=720:${Math.floor(1280 * secondHeight / 100)}:(ow-iw)/2:(oh-ih)/2[v1];` +
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
                        `[0:v]scale=720:${Math.floor(1280 * secondHeight / 100)}:force_original_aspect_ratio=decrease,pad=720:${Math.floor(1280 * secondHeight / 100)}:(ow-iw)/2:(oh-ih)/2[v0];` +
                        `[1:v]scale=720:${Math.floor(1280 * avatarHeight / 100)}:force_original_aspect_ratio=decrease,pad=720:${Math.floor(1280 * avatarHeight / 100)}:(ow-iw)/2:(oh-ih)/2[v1];` +
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
                
                if (avatarPosition === 'left') {
                    ffmpegCommand = [
                        '-i', 'avatar.mp4',
                        '-i', 'second.mp4',
                        '-filter_complex',
                        `[0:v]scale=${Math.floor(720 * avatarWidth / 100)}:1280:force_original_aspect_ratio=decrease,pad=${Math.floor(720 * avatarWidth / 100)}:1280:(ow-iw)/2:(oh-ih)/2[v0];` +
                        `[1:v]scale=${Math.floor(720 * secondWidth / 100)}:1280:force_original_aspect_ratio=decrease,pad=${Math.floor(720 * secondWidth / 100)}:1280:(ow-iw)/2:(oh-ih)/2[v1];` +
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
                        `[0:v]scale=${Math.floor(720 * secondWidth / 100)}:1280:force_original_aspect_ratio=decrease,pad=${Math.floor(720 * secondWidth / 100)}:1280:(ow-iw)/2:(oh-ih)/2[v0];` +
                        `[1:v]scale=${Math.floor(720 * avatarWidth / 100)}:1280:force_original_aspect_ratio=decrease,pad=${Math.floor(720 * avatarWidth / 100)}:1280:(ow-iw)/2:(oh-ih)/2[v1];` +
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
            // Corner overlay (аватар в углу)
            const cornerMap = {
                'top': 'W-w-10:10',
                'bottom': 'W-w-10:H-h-10',
                'left': '10:H-h-10',
                'right': 'W-w-10:H-h-10'
            };
            
            ffmpegCommand = [
                '-i', 'second.mp4',
                '-i', 'avatar.mp4',
                '-filter_complex',
                `[1:v]scale=iw*0.3:ih*0.3[ovr];[0:v][ovr]overlay=${cornerMap[avatarPosition]}[v]`,
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
        
        // Запуск FFmpeg v0.12 (используем exec вместо run)
        await ffmpeg.exec(ffmpegCommand);
        
        updateProcessingStatus('Финализация...', 90);
        
        // Чтение результата (v0.12 использует readFile)
        const data = await ffmpeg.readFile('output.mp4');
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
    console.log('PRO Montage FREE WebApp initialized');
    console.log('Avatar video URL:', avatarVideoUrl);
    console.log('User ID:', userId);
    console.log('Server URL:', serverUrl || '(not provided)');
    console.log('Processing mode:', USE_SERVER ? '⚡ SERVER' : '🌐 BROWSER');
    
    // Проверяем поддержку WebAssembly
    const supportsWasm = (() => {
        try {
            if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
                const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
                if (module instanceof WebAssembly.Module) {
                    return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
                }
            }
        } catch (e) {
            console.error('WebAssembly check failed:', e);
        }
        return false;
    })();
    
    console.log('WebAssembly support:', supportsWasm);
    console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
    
    if (!supportsWasm) {
        safeAlert(
            '⚠️ Ваш браузер не поддерживает WebAssembly!\n\n' +
            'FFmpeg.wasm требует WebAssembly для работы.\n\n' +
            'Пожалуйста, используйте современный браузер:\n' +
            '• Chrome 57+\n' +
            '• Firefox 52+\n' +
            '• Safari 11+\n' +
            '• Edge 16+'
        );
    }
    
    if (!avatarVideoUrl) {
        console.warn('No avatar video URL provided in query params');
        console.warn('URL params:', window.location.search);
        
        // Показываем предупреждение, но позволяем использовать демо
        const warningText = 
            '⚠️ Видео аватара не найдено!\n\n' +
            'Пожалуйста, откройте Pro-монтаж из бота после создания видео.\n\n' +
            'Для демонстрации будет использовано тестовое видео.';
        
        safeAlert(warningText);
        
        // Используем тестовое видео для демонстрации
        appState.avatarVideoUrl = 'https://res.cloudinary.com/demo/video/upload/dog.mp4';
    }
    
    showScreen(1);
    updateComposition();
    loadSubtitleTemplates();
    
    if (tg.colorScheme === 'dark') {
        document.body.style.background = 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)';
    }
});

console.log('=== PRO Montage FREE WebApp v1.0 (FFmpeg.wasm) ===');

