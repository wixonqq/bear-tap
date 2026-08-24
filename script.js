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
    lastSave: Date.now(),
    lastSpin: 0
};

let lastSavedXp = 0;
let apiWorking = false;
let toasts = [];
let wheelSpinning = false;

function getUserId() {
    if (tg.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlUserId = urlParams.get('user_id');
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
        if (data.error) { loadLocalData(); return; }
        
        apiWorking = true;
        playerData = {
            xp: data.xp || 0,
            totalClicks: data.total_clicks || 0,
            energy: data.energy !== undefined ? data.energy : 1000,
            maxEnergy: data.max_energy || 1000,
            clickPower: data.click_power || 1,
            level: Math.floor((data.xp || 0) / 100) + 1,
            wins: data.wins || 0,
            referrals: data.referrals || 0,
            achievements: data.achievements || [],
            username: data.username || '',
            firstName: data.first_name || '',
            lastSave: Date.now(),
            lastSpin: data.last_spin || 0
        };
        lastSavedXp = playerData.xp;
        updateUI();
        updateProfile();
        renderShop();
        checkWheelTimer();
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
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + Math.floor(timePassed / 2));
    }
    if (tg.initDataUnsafe?.user) {
        playerData.username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || 'Игрок';
        playerData.firstName = tg.initDataUnsafe.user.first_name || 'Игрок';
    }
    updateUI();
    updateProfile();
    renderShop();
}

function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

async function saveProgress() {
    if (!apiWorking) return;
    const userId = getUserId();
    if (!userId || playerData.xp <= lastSavedXp) return;
    try {
        await fetch(`${API_URL}/api/save_progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                xp: playerData.xp,
                clicks: playerData.totalClicks,
                energy: Math.floor(playerData.energy)
            })
        });
        lastSavedXp = playerData.xp;
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
                topXpList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>';
            }
        }
    } catch (error) {
        const topXpList = document.getElementById('top-xp-list');
        if (topXpList) topXpList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>';
    }
}

function renderTopList(container, data, suffix) {
    container.innerHTML = '';
    data.forEach((item, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const div = document.createElement('div');
        div.className = 'top-item';
        div.innerHTML = `<div class="top-rank ${rankClass}">${index + 1}</div><div class="top-name">${item.name}</div><div class="top-value">${item.value || item.xp} ${suffix}</div>`;
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
                showToast('✅ Ссылка скопирована!', 'success');
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            }).catch(() => {
                showToast('❌ Ошибка копирования', 'error');
            });
        };
    }
}

function renderShop() {
    const shopList = document.getElementById('shop-list');
    const shopBalance = document.getElementById('shop-balance');
    if (!shopList) return;
    if (shopBalance) shopBalance.textContent = playerData.xp.toLocaleString();
    shopList.innerHTML = '';
    const shopItems = [
        {id: 'click_power_2', name: '⚡ Сила клика x2', price: 250000, desc: 'Тапай в 2 раза эффективнее'},
        {id: 'click_power_5', name: '⚡⚡ Сила клика x5', price: 1000000, desc: 'Тапай в 5 раз эффективнее'},
        {id: 'max_energy_2000', name: ' Энергия 2000', price: 500000, desc: 'Больше энергии для тапов'},
        {id: 'energy_regen_2', name: '⚡ Реген x2', price: 750000, desc: 'Энергия восстанавливается быстрее'}
    ];
    shopItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        const canAfford = playerData.xp >= item.price;
        div.innerHTML = `
            <div class="shop-item-info">
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.desc}</div>
                <div class="shop-item-price">💰 ${item.price.toLocaleString()} XP</div>
            </div>
            <button class="shop-buy-btn ${canAfford ? '' : 'disabled'}" ${canAfford ? '' : 'disabled'}>
                ${canAfford ? '✅ Купить' : '❌ Недостаточно'}
            </button>
        `;
        if (canAfford) {
            div.querySelector('.shop-buy-btn').onclick = () => buyItem(item.id);
        }
        shopList.appendChild(div);
    });
}

async function buyItem(itemId) {
    const userId = getUserId();
    if (!userId) return;
    const item = [
        {id: 'click_power_2', price: 250000, name: '⚡ Сила клика x2'},
        {id: 'click_power_5', price: 1000000, name: '⚡ Сила клика x5'},
        {id: 'max_energy_2000', price: 500000, name: '🔋 Энергия 2000'},
        {id: 'energy_regen_2', price: 750000, name: '⚡ Реген x2'}
    ].find(i => i.id === itemId);
    if (!item || playerData.xp < item.price) {
        showToast('❌ Недостаточно XP!', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/api/buy_item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, item: itemId })
        });
        const data = await response.json();
        if (data.status === 'success') {
            showToast(`✅ ${item.name} куплен!`, 'success');
            await loadData();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка покупки', 'error');
    }
}

async function spinWheel() {
    if (wheelSpinning) return;
    const userId = getUserId();
    if (!userId) return;
    const now = Date.now() / 1000;
    const timeSinceLastSpin = now - playerData.lastSpin;
    if (timeSinceLastSpin < 3600) {
        const remaining = Math.ceil(3600 - timeSinceLastSpin);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        showToast(` Подождите ${minutes}м ${seconds}с`, 'error');
        return;
    }
    wheelSpinning = true;
    const wheel = document.getElementById('wheel');
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    const rotations = 1440 + Math.floor(Math.random() * 360);
    wheel.style.transform = `rotate(${rotations}deg)`;
    setTimeout(async () => {
        try {
            const response = await fetch(`${API_URL}/api/spin_wheel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await response.json();
            if (data.prize) {
                showToast(`🎉 Вы выиграли: ${data.prize}!`, 'success');
                await loadData();
            } else {
                showToast('❌ ' + (data.error || 'Ошибка'), 'error');
            }
        } catch (error) {
            showToast('❌ Ошибка', 'error');
        }
        wheelSpinning = false;
        spinBtn.disabled = false;
        wheel.style.transition = 'none';
        wheel.style.transform = `rotate(${rotations % 360}deg)`;
        setTimeout(() => {
            wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        }, 50);
    }, 4000);
}

function checkWheelTimer() {
    const timerEl = document.getElementById('wheel-timer');
    if (!timerEl) return;
    const now = Date.now() / 1000;
    const timeSinceLastSpin = now - playerData.lastSpin;
    if (timeSinceLastSpin < 3600) {
        const remaining = Math.ceil(3600 - timeSinceLastSpin);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerEl.textContent = ` Следующее вращение через: ${minutes}м ${seconds}с`;
        timerEl.style.display = 'block';
    } else {
        timerEl.style.display = 'none';
    }
}

document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.energy < playerData.clickPower) {
        showToast('⚠️ Недостаточно энергии!', 'error');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        return;
    }
    playerData.xp += playerData.clickPower;
    playerData.totalClicks++;
    playerData.energy -= playerData.clickPower;
    const newLevel = Math.floor(playerData.totalClicks / 1000) + 1;
    if (newLevel > playerData.level) {
        playerData.level = newLevel;
        showToast(` Новый уровень: ${playerData.level}!`, 'success');
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
    const bearEl = document.getElementById('bear');
    if (bearEl) bearEl.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function switchScreen(screen) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-screen="${screen}"]`);
    if (navBtn) navBtn.classList.add('active');
    const targetScreen = document.getElementById(`screen-${screen}`);
    if (targetScreen) targetScreen.classList.add('active');
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    if (screen === 'profile') updateProfile();
    if (screen === 'shop') renderShop();
    if (screen === 'wheel') checkWheelTimer();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        switchScreen(this.dataset.screen);
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
setInterval(checkWheelTimer, 1000);

loadData();
showToast(' Тапай и зарабатывай XP!', 'success');
