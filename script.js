const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const API_URL = 'https://botandreybot-andrey5453.amvera.io';

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

let lastSavedXp = 0;
let apiWorking = false;
let toasts = [];

function getUserId() {
    if (tg.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
    
    if (tg.initData) {
        try {
            const params = new URLSearchParams(tg.initData);
            const userStr = params.get('user');
            if (userStr) {
                const userData = JSON.parse(decodeURIComponent(userStr));
                return userData.id;
            }
        } catch (e) {}
    }
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlUserId = urlParams.get('user_id') || urlParams.get('tgWebAppStartParam');
        if (urlUserId) return parseInt(urlUserId);
    } catch (e) {}
    
    return null;
}

async function loadData() {
    const userId = getUserId();
    
    if (!userId) {
        showToast('Ошибка: не получен ID', 'error');
        loadLocalData();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`);
        
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const data = await response.json();
        
        if (data.error) {
            loadLocalData();
            return;
        }
        
        apiWorking = true;
        
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
        
        lastSavedXp = playerData.xp;
        
        const timePassed = (Date.now() - playerData.lastSave) / 1000;
        playerData.energy = Math.min(
            playerData.maxEnergy,
            playerData.energy + Math.floor(timePassed / 2)
        );
        
        updateUI();
        updateProfile();
        showToast('Данные загружены!', 'success');
        
    } catch (error) {
        showToast('Не удалось загрузить данные', 'error');
        loadLocalData();
    }
}

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

function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

async function saveProgress() {
    if (!apiWorking) return;
    
    const userId = getUserId();
    if (!userId) return;
    if (playerData.xp <= lastSavedXp) return;
    
    try {
        const response = await fetch(`${API_URL}/api/save_progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                xp: playerData.xp,
                clicks: playerData.totalClicks
            })
        });
        
        if (response.ok) {
            lastSavedXp = playerData.xp;
        }
    } catch (error) {}
}

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
    
    updateTopLists();
    setupReferralLink();
}

async function updateTopLists() {
    const userId = getUserId();
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        const topXpList = document.getElementById('top-xp-list');
        if (topXpList) {
            if (data.top_xp && data.top_xp.length > 0) {
                renderTopList(topXpList, data.top_xp, 'XP');
            } else {
                topXpList.innerHTML = '<div class="empty-state">Пока пусто</div>';
            }
        }
        
        const topWinsList = document.getElementById('top-wins-list');
        if (topWinsList) {
            if (data.top_wins && data.top_wins.length > 0) {
                renderTopList(topWinsList, data.top_wins, 'побед');
            } else {
                topWinsList.innerHTML = '<div class="empty-state">Пока пусто</div>';
            }
        }
    } catch (error) {
        const topXpList = document.getElementById('top-xp-list');
        const topWinsList = document.getElementById('top-wins-list');
        if (topXpList) topXpList.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
        if (topWinsList) topWinsList.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
}

function renderTopList(container, data, suffix) {
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

function setupReferralLink() {
    const userId = getUserId();
    const botUsername = 'sporttcm_bot';
    if (!userId) return;
    
    const referralLink = `https://t.me/${botUsername}?start=${userId}`;
    
    const referralBtn = document.getElementById('referral-btn');
    if (referralBtn) {
        referralBtn.onclick = function() {
            navigator.clipboard.writeText(referralLink).then(() => {
                showToast('Ссылка скопирована!', 'success');
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            }).catch(() => {
                showToast('Ошибка копирования', 'error');
            });
        };
    }
}

document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.energy < playerData.clickPower) {
        showToast('Недостаточно энергии!', 'error');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        return;
    }
    
    playerData.xp += playerData.clickPower;
    playerData.totalClicks++;
    playerData.energy -= playerData.clickPower;
    
    const newLevel = Math.floor(playerData.totalClicks / 1000) + 1;
    if (newLevel > playerData.level) {
        playerData.level = newLevel;
        showToast(`Новый уровень: ${playerData.level}!`, 'success');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    
    showClickEffect(e);
    updateUI();
    updateProfile();
    saveData();
});

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

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const screen = this.dataset.screen;
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        
        this.classList.add('active');
        const targetScreen = document.getElementById(`screen-${screen}`);
        if (targetScreen) targetScreen.classList.add('active');
        
        if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
        if (screen === 'profile') updateProfile();
    });
});

function showToast(text, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' error' : '');
    toast.textContent = text;
    document.body.appendChild(toast);
    
    toasts.push(toast);
    updateToastPositions();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            toast.remove();
            toasts = toasts.filter(t => t !== toast);
            updateToastPositions();
        }, 300);
    }, 2500);
}

function updateToastPositions() {
    const gap = 10;
    toasts.forEach((toast, index) => {
        const offset = index * (60 + gap);
        toast.style.top = `${20 + offset}px`;
    });
}

setInterval(() => {
    if (playerData.energy < playerData.maxEnergy) {
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + 1);
        updateUI();
        saveData();
    }
}, 2000);

setInterval(saveProgress, 10000);

loadData();
showToast('Тапай и зарабатывай XP!', 'success');
