// ============================================
// PRO Монтаж - Настройки для бота
// Видео обрабатывается на VPS сервере (быстро!)
// ============================================

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Получаем video_url из параметров (для отображения информации)
const urlParams = new URLSearchParams(window.location.search);
const avatarVideoUrl = urlParams.get('video_url') ? decodeURIComponent(urlParams.get('video_url')) : null;

// State
const appState = {
    mode: '',
    avatarPosition: 'top',
    screenRatio: 50
};

let currentScreen = 1;

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
    if (currentScreen > 1 && currentScreen < 4) {
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
// Screen 2: Settings
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
// Screen 3: Confirm & Send to Bot
// ============================================

function confirmSettings() {
    // Показываем экран подтверждения
    showScreen(3);
    
    // Обновляем информацию о выбранных настройках
    const modeNames = {
        'split_screen': '📱 Разделение экрана',
        'corner': '📐 В углу экрана'
    };
    
    const positionNames = {
        'top': 'Сверху',
        'bottom': 'Снизу',
        'left': 'Слева',
        'right': 'Справа'
    };
    
    document.getElementById('confirm-mode').textContent = modeNames[appState.mode] || appState.mode;
    document.getElementById('confirm-position').textContent = positionNames[appState.avatarPosition] || appState.avatarPosition;
    document.getElementById('confirm-ratio').textContent = appState.screenRatio + '%';
}

function sendSettingsToBot() {
    // Формируем данные для бота
    const dataToSend = {
        mode: appState.mode,
        avatar_position: appState.avatarPosition,
        screen_ratio: appState.screenRatio,
        taskId: Date.now().toString()
    };
    
    console.log('Sending settings to bot:', dataToSend);
    console.log('Telegram WebApp available:', !!tg);
    console.log('initData:', tg.initData);
    
    // Проверяем, открыта ли веб-апка через Telegram
    if (!tg.initData || tg.initData === '') {
        console.error('WebApp not opened via Telegram!');
        
        // Показываем инструкцию
        document.getElementById('error-message').innerHTML = `
            <b>Веб-апка открыта не через Telegram!</b><br><br>
            Чтобы отправить настройки:<br>
            1. Откройте бота в Telegram<br>
            2. Создайте видео аватара<br>
            3. Нажмите "Pro-монтаж"<br>
            4. Выберите настройки<br><br>
            <b>Выбранные настройки:</b><br>
            Режим: ${appState.mode}<br>
            Позиция: ${appState.avatarPosition}<br>
            Размер: ${appState.screenRatio}%
        `;
        showScreen(5);
        return;
    }
    
    // Отправляем данные боту через Telegram WebApp API
    try {
        const jsonData = JSON.stringify(dataToSend);
        console.log('Calling tg.sendData with:', jsonData);
        
        tg.sendData(jsonData);
        
        console.log('sendData called successfully!');
        
        // Показываем сообщение об успехе
        showScreen(4);
        
        // Закрываем через 1.5 секунды
        setTimeout(() => {
            console.log('Closing WebApp...');
            tg.close();
        }, 1500);
        
    } catch (error) {
        console.error('Error sending data:', error);
        document.getElementById('error-message').innerHTML = `
            <b>Ошибка отправки:</b><br>
            ${error.message}<br><br>
            Попробуйте закрыть и открыть веб-апку заново.
        `;
        showScreen(5);
    }
}

// ============================================
// Utilities
// ============================================

function resetApp() {
    appState.mode = '';
    appState.avatarPosition = 'top';
    appState.screenRatio = 50;
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
    console.log('=== PRO Montage WebApp v2.0 (VPS Processing) ===');
    console.log('Telegram WebApp object:', tg);
    console.log('initData:', tg.initData);
    console.log('initDataUnsafe:', tg.initDataUnsafe);
    console.log('Avatar video URL:', avatarVideoUrl ? 'provided' : 'not provided');
    
    // Проверяем, открыта ли веб-апка через Telegram
    if (!tg.initData || tg.initData === '') {
        console.warn('⚠️ WebApp opened directly in browser, not via Telegram');
        console.warn('sendData() will not work!');
    } else {
        console.log('✅ WebApp opened via Telegram');
    }
    
    showScreen(1);
    updateComposition();
    
    if (tg.colorScheme === 'dark') {
        document.body.style.background = 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)';
    }
});

console.log('=== PRO Montage WebApp v2.0 (VPS Processing) ===');
