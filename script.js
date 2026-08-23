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

// Загрузка данных из бота
async function loadData() {
    const userId = tg.initDataUnsafe?.user?.id;
    
    if (!userId) {
        showNotification('⚠️ Ошибка: не получен ID пользователя', 'error');
        return;
    }
    
    try {
        // Загружаем данные с API
        const response = await fetch(`http://localhost:8080/api/user_data?user_id=${userId}`);
        const data = await response.json();
        
        if (data.error) {
            showNotification(`⚠️ ${data.error}`, 'error');
            // Используем локальные данные как запасной вариант
            loadLocalData();
            return;
        }
        
        // Сохраняем данные
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
        
        // Восстановление энергии
        const timePassed = (Date.now() - playerData.lastSave) / 1000;
        playerData.energy = Math.min(
            playerData.maxEnergy,
            playerData.energy + Math.floor(timePassed / 2)
        );
        
        // Обновляем UI
        updateUI();
        updateProfile();
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showNotification('⚠️ Ошибка загрузки данных', 'error');
        loadLocalData();
    }
}

// Загрузка локальных данных (запасной вариант)
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
    
    updateUI();
    updateProfile();
}

// Сохранение данных
function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

// Сохранение прогресса на сервер
async function saveProgress() {
    const userId = tg.initDataUnsafe?.user?.id;
    
    if (!userId) return;
    
    try {
        await fetch('http://localhost:8080/api/save_progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                xp: playerData.xp,
                clicks: playerData.totalClicks
            })
        });
    } catch (error) {
        console.error('Ошибка сохранения:', error);
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

// Обновление профиля с реальными данными
function updateProfile() {
    document.getElementById('profile-name').textContent = playerData.firstName || playerData.username || 'Игрок';
    document.getElementById('profile-level').textContent = playerData.level;
    document.getElementById('stat-wins').textContent = playerData.wins;
    document.getElementById('stat-xp').textContent = playerData.xp.toLocaleString();
    document.getElementById('stat-refs').textContent = playerData.referrals;
    document.getElementById('stat-clicks').textContent = playerData.totalClicks.toLocaleString();
    
    // Достижения
    const achievements = [
        { id: 'first_tap', icon: '🌱', name: 'Первый тап', desc: 'Сделай первый клик', condition: () => playerData.totalClicks >= 1 },
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
    
    // Топы
    updateTopLists();
    
    // Реферальная ссылка
    setupReferralLink();
}

// Обновление топов
function updateTopLists() {
    // Здесь данные придут с API
    // Пока заглушки
    const topXP = [
        { name: 'Andrey', value: 15420 },
        { name: 'Masha', value: 12300 },
        { name: 'Ivan', value: 9800 }
    ];
    
    const topWins = [
        { name: 'Masha', value: 5 },
        { name: 'Andrey', value: 3 },
        { name: 'Ivan', value: 2 }
    ];
    
    renderTopList('top-xp-list', topXP, 'XP');
    renderTopList('top-wins-list', topWins, 'побед');
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
            <div class="top-value">${item.value} ${suffix}</div>
        `;
        list.appendChild(div);
    });
}

// Реферальная ссылка
function setupReferralLink() {
    const userId = tg.initDataUnsafe?.user?.id;
    const botUsername = 'sporttcm_bot'; // Замени на свой username бота
    
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

// Уведомления
function showNotification(text, type = 'info') {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'rgba(46, 213, 115, 0.9)' : type === 'error' ? 'rgba(255, 71, 87, 0.9)' : 'rgba(0, 0, 0, 0.9)'};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 10000;
        animation: slideDown 0.3s ease;
    `;
    notif.textContent = text;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 2000);
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
showNotification('🐻 Тапай по мишке и зарабатывай XP!', 'success');
