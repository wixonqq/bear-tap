// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();


const API_URL = 'https://botandreybot-andrey5453.amvera.io';

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

let apiWorking = false;
let activeNotifications = [];

// ===== ЗАГРУЗКА ДАННЫХ =====
async function loadData() {
    const userId = tg.initDataUnsafe?.user?.id;
    
    if (!userId) {
        showNotification('⚠️ Ошибка: не получен ID', 'error');
        loadLocalData();
        return;
    }
    
    try {
        console.log('Загрузка данных с API:', userId);
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        console.log('Статус ответа:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Получены данные:', data);
            
            if (data.error) {
                console.error('API вернул ошибку:', data.error);
                loadLocalData();
                return;
            }
            
            // API работает!
            apiWorking = true;
            
            // Сохраняем реальные данные
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
                username: data.username || '',
                firstName: data.first_name || '',
                lastSave: Date.now()
            };
            
            // Восстановление энергии
            const timePassed = (Date.now() - playerData.lastSave) / 1000;
            playerData.energy = Math.min(
                playerData.maxEnergy,
                playerData.energy + Math.floor(timePassed / 2)
            );
            
            console.log('Данные загружены:', playerData);
            updateUI();
            updateProfile();
            
            showNotification('✅ Данные загружены!', 'success');
            return;
        }
        
    } catch (error) {
        console.error('Ошибка подключения к API:', error);
    }
    
    // API недоступен - используем локальные данные
    console.log('API недоступен, используем локальные данные');
    loadLocalData();
}

// ===== ЛОКАЛЬНЫЕ ДАННЫЕ =====
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
        playerData.username = user.username || user.first_name || 'Игрок';
        playerData.firstName = user.first_name || 'Игрок';
    }
    
    updateUI();
    updateProfile();
}

// ===== СОХРАНЕНИЕ =====
function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

async function saveProgress() {
    if (!apiWorking) return;
    
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        await fetch(`${API_URL}/api/save_progress`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
            },
            mode: 'cors',
            body: JSON.stringify({
                user_id: userId,
                xp: playerData.xp,
                clicks: playerData.totalClicks
            })
        });
        console.log('Прогресс сохранён');
    } catch (error) {
        console.log('Не удалось сохранить на сервер');
    }
}

// ===== ОБНОВЛЕНИЕ UI =====
function updateUI() {
    const xpBalance = document.getElementById('xp-balance');
    const xpPerTap = document.getElementById('xp-per-tap');
    const energyCurrent = document.getElementById('energy-current');
    const energyMax = document.getElementById('energy-max');
    const energyFill = document.getElementById('energy-fill');
    
    if (xpBalance) xpBalance.textContent = playerData.xp.toLocaleString();
    if (xpPerTap) xpPerTap.textContent = playerData.clickPower;
    if (energyCurrent) energyCurrent.textContent = Math.floor(playerData.energy);
    if (energyMax) energyMax.textContent = playerData.maxEnergy;
    
    if (energyFill) {
        const energyPercent = (playerData.energy / playerData.maxEnergy) * 100;
        energyFill.style.width = energyPercent + '%';
    }
}

function updateProfile() {
    const profileName = document.getElementById('profile-name');
    const profileLevel = document.getElementById('profile-level');
    const statWins = document.getElementById('stat-wins');
    const statXp = document.getElementById('stat-xp');
    const statRefs = document.getElementById('stat-refs');
    const statClicks = document.getElementById('stat-clicks');
    
    if (profileName) profileName.textContent = playerData.firstName || playerData.username || 'Игрок';
    if (profileLevel) profileLevel.textContent = playerData.level;
    if (statWins) statWins.textContent = playerData.wins;
    if (statXp) statXp.textContent = playerData.xp.toLocaleString();
    if (statRefs) statRefs.textContent = playerData.referrals;
    if (statClicks) statClicks.textContent = playerData.totalClicks.toLocaleString();
    
    // Обновляем топы
    updateTopLists();
    
    // Настраиваем реферальную ссылку
    setupReferralLink();
}

// ===== ТОПЫ =====
async function updateTopLists() {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Топ по XP
            const topXpList = document.getElementById('top-xp-list');
            if (topXpList) {
                if (data.top_xp && data.top_xp.length > 0) {
                    renderTopList(topXpList, data.top_xp, 'XP', 'top-xp-list');
                } else {
                    topXpList.innerHTML = '<div class="loading-item">Пока пусто</div>';
                }
            }
            
            // Топ по победам
            const topWinsList = document.getElementById('top-wins-list');
            if (topWinsList) {
                if (data.top_wins && data.top_wins.length > 0) {
                    renderTopList(topWinsList, data.top_wins, 'побед', 'top-wins-list');
                } else {
                    topWinsList.innerHTML = '<div class="loading-item">Пока пусто</div>';
                }
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки топов:', error);
    }
}

function renderTopList(container, data, suffix, listId) {
    container.innerHTML = '';
    
    data.forEach((item, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const div = document.createElement('div');
        div.className = 'top-item';
        div.innerHTML = `
            <div class="top-rank ${rankClass}">${index + 1}</div>
            <div class="top-name">${item.name}</div>
            <div class="top-value">${item.value || item.xp} ${suffix}</div>
        `;
        container.appendChild(div);
    });
}

// ===== РЕФЕРАЛЬНАЯ ССЫЛКА =====
function setupReferralLink() {
    const userId = tg.initDataUnsafe?.user?.id;
    const botUsername = 'sporttcm_bot'; // Замени на username своего бота
    
    const referralLink = `https://t.me/${botUsername}?start=${userId}`;
    
    const referralBtn = document.getElementById('referral-btn');
    if (referralBtn) {
        referralBtn.onclick = function() {
            navigator.clipboard.writeText(referralLink).then(() => {
                showNotification('✅ Ссылка скопирована!', 'success');
                tg.HapticFeedback.notificationOccurred('success');
            }).catch(() => {
                showNotification('❌ Ошибка копирования', 'error');
            });
        };
    }
}

// ===== КЛИК ПО МИШКЕ =====
document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.energy < playerData.clickPower) {
        showNotification('️ Недостаточно энергии!', 'error');
        tg.HapticFeedback.notificationOccurred('error');
        return;
    }
    
    playerData.xp += playerData.clickPower;
    playerData.totalClicks++;
    playerData.energy -= playerData.clickPower;
    
    // Проверка нового уровня
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

// ===== ЭФФЕКТ КЛИКА =====
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

// ===== НАВИГАЦИЯ =====
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const screen = this.dataset.screen;
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById(`screen-${screen}`).classList.add('active');
        
        tg.HapticFeedback.selectionChanged();
        
        // Если перешли на профиль - обновляем данные
        if (screen === 'profile') {
            updateProfile();
        }
    });
});

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(text, type = 'info') {
    const notif = document.createElement('div');
    notif.className = 'waterfall-notification' + (type === 'error' ? ' error' : '');
    notif.textContent = text;
    document.body.appendChild(notif);
    
    activeNotifications.push(notif);
    updateNotificationPositions();
    
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

function updateNotificationPositions() {
    const gap = 10;
    activeNotifications.forEach((notif, index) => {
        const offset = index * (70 + gap);
        notif.style.top = `${20 + offset}px`;
    });
}

// ===== РЕГЕНЕРАЦИЯ ЭНЕРГИИ =====
setInterval(() => {
    if (playerData.energy < playerData.maxEnergy) {
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + 1);
        updateUI();
        saveData();
    }
}, 2000);

// ===== АВТОСОХРАНЕНИЕ =====
setInterval(saveProgress, 10000);

// ===== ИНИЦИАЛИЗАЦИЯ =====
console.log('Инициализация приложения...');
console.log('API_URL:', API_URL);
loadData();
showNotification('🐻 Тапай и зарабатывай XP!', 'success');
