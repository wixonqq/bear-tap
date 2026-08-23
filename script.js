// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Данные игрока
let playerData = {
    xp: 0,
    totalClicks: 0,
    energy: 1000,
    maxEnergy: 1000,
    clickPower: 1,
    level: 1,
    wins: 0,
    referrals: 0,
    achievements: [],
    username: '',
    firstName: '',
    lastSave: Date.now()
};

let apiAvailable = false;
const API_URL = 'http://localhost:8080'; // Замени на ngrok ссылку если есть

// Массив для хранения активных уведомлений
let activeNotifications = [];

// Загрузка данных
async function loadData() {
    const userId = tg.initDataUnsafe?.user?.id;
    
    if (!userId) {
        showNotification('⚠️ Ошибка: не получен ID пользователя', 'error');
        loadLocalData();
        return;
    }
    
    try {
        // Пытаемся загрузить с API
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.error) {
                loadLocalData();
                return;
            }
            
            // API работает! Загружаем реальные данные
            apiAvailable = true;
            playerData = {
                xp: data.xp || 0,
                totalClicks: 0,
                energy: 1000,
                maxEnergy: 1000,
                clickPower: 1,
                level: Math.floor((data.xp || 0) / 100) + 1,
                wins: data.wins || 0,
                referrals: data.referrals || 0,
                achievements: data.achievements || [],
                username: data.username,
                firstName: data.first_name,
                lastSave: Date.now()
            };
            
            const timePassed = (Date.now() - playerData.lastSave) / 1000;
            playerData.energy = Math.min(
                playerData.maxEnergy,
                playerData.energy + Math.floor(timePassed / 2)
            );
            
            showNotification('✅ Данные загружены из сервера', 'success');
        } else {
            // API недоступен
            loadLocalData();
        }
        
    } catch (error) {
        console.log('API недоступен, используем локальные данные');
        loadLocalData();
    }
    
    updateUI();
    updateProfile();
}

// Загрузка локальных данных
function loadLocalData() {
    const saved = localStorage.getItem('bearTapData');
    if (saved) {
        playerData = JSON.parse(saved);
        const timePassed = (Date.now() - playerData.lastSave) / 1000;
        playerData.energy = Math.min(
            playerData.maxEnergy,
            playerData.energy + Math.floor(timePassed / 2)
        );
    }
    
    if (tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        playerData.username = user.username || user.first_name;
        playerData.firstName = user.first_name;
    }
    
    showNotification('🐻 Тапай по мишке и зарабатывай XP!', 'success');
}

// Сохранение данных в localStorage
function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

// Сохранение прогресса на сервер
async function saveProgress() {
    if (!apiAvailable) return;
    
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        await fetch(`${API_URL}/api/save_progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({
                user_id: userId,
                xp: playerData.xp,
                clicks: playerData.totalClicks
            })
        });
    } catch (error) {
        console.log('Не удалось сохранить на сервер');
    }
}

// Обновление UI главного экрана
function updateUI() {
    document.getElementById('xp-balance').textContent = playerData.xp.toLocaleString();
    document.getElementById('xp-per-tap').textContent = playerData.clickPower;
    document.getElementById('energy-current').textContent = Math.floor(playerData.energy);
    document.getElementById('energy-max').textContent = playerData.maxEnergy;
    
    const energyPercent = (playerData.energy / playerData.maxEnergy) * 100;
    document.getElementById('energy-fill').style.width = energyPercent + '%';
}

// Обновление профиля
function updateProfile() {
    document.getElementById('profile-name').textContent = playerData.firstName || playerData.username || 'Игрок';
    document.getElementById('profile-level').textContent = playerData.level;
    document.getElementById('stat-wins').textContent = playerData.wins;
    document.getElementById('stat-xp').textContent = playerData.xp.toLocaleString();
    document.getElementById('stat-refs').textContent = playerData.referrals;
    document.getElementById('stat-clicks').textContent = playerData.totalClicks.toLocaleString();
    
    // Достижения
    const achievements = [
        { id: 'first_tap', icon: '', name: 'Первый тап', desc: 'Сделай первый клик', condition: () => playerData.totalClicks >= 1 },
        { id: 'hundred', icon: '💯', name: 'Сотня', desc: '100 кликов', condition: () => playerData.totalClicks >= 100 },
        { id: 'thousand', icon: '🔥', name: 'Тысячник', desc: '1000 кликов', condition: () => playerData.totalClicks >= 1000 },
        { id: 'winner', icon: '🏆', name: 'Победитель', desc: 'Выиграй розыгрыш', condition: () => playerData.wins >= 1 },
        { id: 'referral', icon: '👥', name: 'Реферал', desc: 'Пригласи друга', condition: () => playerData.referrals >= 1 }
    ];
    
    const achievementsList = document.getElementById('achievements-list');
    achievementsList.innerHTML = '';
    
    achievements.forEach(ach => {
        const unlocked = ach.condition() || playerData.achievements.includes(ach.id);
        
        const div = document.createElement('div');
        div.className = `achievement ${unlocked ? 'unlocked' : 'locked'}`;
        div.innerHTML = `
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-info">
                <div class="achievement-name">${ach.name}</div>
                <div class="achievement-desc">${ach.desc}</div>
            </div>
        `;
        achievementsList.appendChild(div);
    });
    
    updateTopLists();
    setupReferralLink();
}

// Обновление топов
async function updateTopLists() {
    if (!apiAvailable) {
        // Показываем только текущего пользователя
        const userId = tg.initDataUnsafe?.user?.id;
        renderTopList('top-xp-list', [
            { name: playerData.firstName || 'Ты', xp: playerData.xp }
        ], 'XP');
        renderTopList('top-wins-list', [
            { name: playerData.firstName || 'Ты', value: playerData.wins }
        ], 'побед');
        return;
    }
    
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`, {
            method: 'GET',
            mode: 'cors'
        });
        const data = await response.json();
        
        if (data.top_xp && data.top_xp.length > 0) {
            renderTopList('top-xp-list', data.top_xp, 'XP');
        }
        
        if (data.top_wins && data.top_wins.length > 0) {
            renderTopList('top-wins-list', data.top_wins, 'побед');
        }
        
    } catch (error) {
        console.log('Не удалось загрузить топы');
    }
}

function renderTopList(elementId, data, suffix) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';
    
    data.forEach((item, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const div = document.createElement('div');
        div.className = 'top-item';
        div.innerHTML = `
            <div class="top-rank ${rankClass}">${index + 1}</div>
            <div class="top-name">${item.name}</div>
            <div class="top-value">${item.value || item.xp} ${suffix}</div>
        `;
        list.appendChild(div);
    });
}

// Реферальная ссылка
function setupReferralLink() {
    const userId = tg.initDataUnsafe?.user?.id;
    const botUsername = 'sporttcm_bot';
    
    const referralLink = `https://t.me/${botUsername}?start=${userId}`;
    
    document.getElementById('referral-btn').onclick = function() {
        navigator.clipboard.writeText(referralLink).then(() => {
            showNotification('✅ Ссылка скопирована!', 'success');
            tg.HapticFeedback.notificationOccurred('success');
        }).catch(() => {
            showNotification('❌ Ошибка копирования', 'error');
        });
    };
}

// Клик по мишке
document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.energy < playerData.clickPower) {
        showNotification('⚠️ Недостаточно энергии!', 'error');
        return;
    }
    
    playerData.xp += playerData.clickPower;
    playerData.totalClicks++;
    playerData.energy -= playerData.clickPower;
    
    const newLevel = Math.floor(playerData.totalClicks / 1000) + 1;
    if (newLevel > playerData.level) {
        playerData.level = newLevel;
        showNotification(`🎉 Новый уровень: ${playerData.level}!`, 'success');
        tg.HapticFeedback.notificationOccurred('success');
    } else {
        tg.HapticFeedback.impactOccurred('medium');
    }
    
    showClickEffect(e);
    updateUI();
    updateProfile();
    saveData();
});

// Эффект клика
function showClickEffect(e) {
    const effect = document.createElement('div');
    effect.className = 'click-effect';
    effect.textContent = '+' + playerData.clickPower;
    
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    effect.style.left = x + 'px';
    effect.style.top = y + 'px';
    
    document.getElementById('bear').appendChild(effect);
    
    setTimeout(() => effect.remove(), 1000);
}

// Навигация
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const screen = this.dataset.screen;
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById(`screen-${screen}`).classList.add('active');
        
        tg.HapticFeedback.selectionChanged();
    });
});

// Уведомления с эффектом водопада
function showNotification(text, type = 'info') {
    const notif = document.createElement('div');
    notif.className = 'waterfall-notification';
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'rgba(46, 213, 115, 0.95)' : type === 'error' ? 'rgba(255, 71, 87, 0.95)' : 'rgba(0, 0, 0, 0.9)'};
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 80%;
        text-align: center;
    `;
    notif.textContent = text;
    document.body.appendChild(notif);
    
    activeNotifications.push(notif);
    updateNotificationPositions();
    
    setTimeout(() => {
        notif.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            notif.remove();
            activeNotifications = activeNotifications.filter(n => n !== notif);
            updateNotificationPositions();
        }, 300);
    }, 3000);
}

// Обновление позиций уведомлений
function updateNotificationPositions() {
    const gap = 10;
    activeNotifications.forEach((notif, index) => {
        const offset = index * (70 + gap);
        notif.style.top = `${20 + offset}px`;
    });
}

// Регенерация энергии
setInterval(() => {
    if (playerData.energy < playerData.maxEnergy) {
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + 1);
        updateUI();
        saveData();
    }
}, 2000);

// Авто-сохранение каждые 10 секунд
setInterval(saveProgress, 10000);

// Инициализация
loadData();
