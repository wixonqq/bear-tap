var tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

var API_URL = 'https://botandreybot-andrey5453.amvera.io';
var ADMIN_ID = 7650149888;

var playerData = {
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
    lastSpin: 0,
    isAdmin: false,
    skin: 'default',
    energyRegen: 1,
    isBanned: false
};

var lastSavedXp = 0;
var apiWorking = false;
var toasts = [];
var wheelSpinning = false;
var currentGame = null;
var crashInterval = null;
var currentMultiplier = 1.0;
var crashPoint = 0;
var minesState = null;
var ninjaState = null;
var towerState = null;
var bubblesState = null;
var purchasedItems = [];
var currentShopCategory = 'upgrades';
var lastActivity = Date.now();

function getUserId() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        return tg.initDataUnsafe.user.id;
    }
    try {
        var urlParams = new URLSearchParams(window.location.search);
        var urlUserId = urlParams.get('user_id');
        if (urlUserId) return parseInt(urlUserId);
    } catch (e) {}
    return null;
}

function applySkin(skinName) {
    var bear = document.getElementById('bear-character');
    if (!bear) return;
    bear.classList.remove('skin-gold', 'skin-diamond', 'skin-rainbow');
    if (skinName && skinName !== 'default') {
        bear.classList.add('skin-' + skinName);
    }
}

function recalculateBonuses() {
    var clickPower = 1;
    var maxEnergy = 1000;
    var energyRegen = 1;
    purchasedItems.forEach(function(item) {
        if (item === 'click_power_2') clickPower += 2;
        else if (item === 'click_power_5') clickPower += 5;
        else if (item === 'click_power_10') clickPower += 10;
        else if (item === 'max_energy_2000') maxEnergy += 2000;
        else if (item === 'max_energy_5000') maxEnergy += 5000;
        else if (item === 'energy_regen_2') energyRegen += 2;
        else if (item === 'energy_regen_5') energyRegen += 5;
    });
    playerData.clickPower = clickPower;
    playerData.maxEnergy = maxEnergy;
    playerData.energyRegen = energyRegen;
    playerData.energy = Math.min(playerData.energy, playerData.maxEnergy);
    console.log('Бонусы пересчитаны:', { clickPower: clickPower, maxEnergy: maxEnergy, energyRegen: energyRegen, energy: playerData.energy });
}

async function loadPurchases() {
    var userId = getUserId();
    if (!userId) return;
    try {
        var response = await fetch(API_URL + '/api/purchases?user_id=' + userId);
        if (response.ok) {
            var data = await response.json();
            purchasedItems = data.purchases || [];
            if (data.current_skin) {
                playerData.skin = data.current_skin;
                applySkin(playerData.skin);
            }
            recalculateBonuses();
        }
    } catch (error) {
        console.error('Ошибка загрузки покупок:', error);
    }
}

async function loadData() {
    var userId = getUserId();
    if (!userId) {
        showToast('Ошибка: не получен ID', 'error');
        loadLocalData();
        return;
    }
    var isAdmin = userId === ADMIN_ID;
    try {
        var response = await fetch(API_URL + '/api/user_data?user_id=' + userId);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (data.is_banned === 1) {
            document.getElementById('ban-overlay').style.display = 'flex';
            document.getElementById('maintenance-overlay').style.display = 'none';
            document.getElementById('main-app').style.display = 'none';
            return;
        }
        if (data.maintenance && !isAdmin) {
            document.getElementById('ban-overlay').style.display = 'none';
            document.getElementById('maintenance-overlay').style.display = 'flex';
            document.getElementById('main-app').style.display = 'none';
            return;
        } else {
            document.getElementById('ban-overlay').style.display = 'none';
            document.getElementById('maintenance-overlay').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
        }
        if (data.error) { loadLocalData(); return; }
        apiWorking = true;
        playerData = {
            xp: data.xp || 0,
            totalClicks: data.total_clicks || 0,
            energy: (data.energy !== undefined && data.energy !== null) ? data.energy : 1000,
            maxEnergy: data.max_energy || 1000,
            clickPower: data.click_power || 1,
            level: Math.floor((data.xp || 0) / 100) + 1,
            wins: data.wins || 0,
            referrals: data.referrals || 0,
            achievements: data.achievements || [],
            username: data.username || '',
            firstName: data.first_name || '',
            lastSave: Date.now(),
            lastSpin: data.last_spin || 0,
            isAdmin: isAdmin,
            skin: data.skin || 'default',
            energyRegen: data.energy_regen || 1,
            isBanned: data.is_banned === 1
        };
        applySkin(playerData.skin);
        await loadPurchases();
        lastSavedXp = playerData.xp;
        updateUI();
        updateProfile();
        renderShop();
        checkWheelTimer();
        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showToast('Не удалось загрузить данные: ' + error.message, 'error');
        loadLocalData();
    }
}

function loadLocalData() {
    var saved = localStorage.getItem('bearTapData');
    if (saved) {
        playerData = JSON.parse(saved);
        var timePassed = (Date.now() - playerData.lastSave) / 1000;
        playerData.energy = Math.min(playerData.maxEnergy || 1000, (playerData.energy || 1000) + Math.floor(timePassed / 5) * (playerData.energyRegen || 1));
    }
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        playerData.username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || 'Игрок';
        playerData.firstName = tg.initDataUnsafe.user.first_name || 'Игрок';
        playerData.isAdmin = tg.initDataUnsafe.user.id === ADMIN_ID;
    }
    updateUI();
    updateProfile();
    renderShop();
    checkWheelTimer();
    var adminBtn = document.getElementById('admin-btn');
    if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
}

function saveData() {
    playerData.lastSave = Date.now();
    localStorage.setItem('bearTapData', JSON.stringify(playerData));
}

async function saveProgress() {
    if (!apiWorking) return;
    var userId = getUserId();
    if (!userId) return;
    try {
        await fetch(API_URL + '/api/save_progress', {
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
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

function updateUI() {
    var xpBalance = document.getElementById('xp-balance');
    var xpPerTap = document.getElementById('xp-per-tap');
    var energyCurrent = document.getElementById('energy-current');
    var energyMax = document.getElementById('energy-max');
    var energyFill = document.getElementById('energy-fill');
    if (xpBalance) xpBalance.textContent = playerData.xp.toLocaleString();
    if (xpPerTap) xpPerTap.textContent = playerData.clickPower;
    if (energyCurrent) energyCurrent.textContent = Math.floor(playerData.energy);
    if (energyMax) energyMax.textContent = playerData.maxEnergy;
    if (energyFill) {
        var energyPercent = Math.min(100, Math.max(0, (playerData.energy / playerData.maxEnergy) * 100));
        energyFill.style.width = energyPercent + '%';
    }
}

function updateProfile() {
    var profileName = document.getElementById('profile-name');
    var profileLevel = document.getElementById('profile-level');
    var statWins = document.getElementById('stat-wins');
    var statXp = document.getElementById('stat-xp');
    var statRefs = document.getElementById('stat-refs');
    var statClicks = document.getElementById('stat-clicks');
    var profileXpCurrent = document.getElementById('profile-xp-current');
    var profileXpNext = document.getElementById('profile-xp-next');
    var profileXpFill = document.getElementById('profile-xp-fill');
    if (profileName) profileName.textContent = playerData.firstName || playerData.username || 'Игрок';
    if (profileLevel) profileLevel.textContent = playerData.level;
    if (statWins) statWins.textContent = playerData.wins;
    if (statXp) statXp.textContent = playerData.xp.toLocaleString();
    if (statRefs) statRefs.textContent = playerData.referrals;
    if (statClicks) statClicks.textContent = playerData.totalClicks.toLocaleString();
    if (profileXpCurrent) profileXpCurrent.textContent = playerData.xp.toLocaleString();
    if (profileXpNext) profileXpNext.textContent = (playerData.level * 100).toLocaleString();
    if (profileXpFill) {
        var xpInLevel = playerData.xp % 100;
        var xpPercent = (xpInLevel / 100) * 100;
        profileXpFill.style.width = xpPercent + '%';
    }
    updateTopLists();
    setupReferralLink();
}

async function updateTopLists() {
    var userId = getUserId();
    if (!userId) return;
    try {
        var response = await fetch(API_URL + '/api/user_data?user_id=' + userId);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        var topXpList = document.getElementById('top-xp-list');
        if (topXpList) {
            if (data.top_xp && data.top_xp.length > 0) renderTopList(topXpList, data.top_xp, 'XP');
            else topXpList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>';
        }
        var topWinsList = document.getElementById('top-wins-list');
        if (topWinsList) {
            if (data.top_wins && data.top_wins.length > 0) renderTopList(topWinsList, data.top_wins, 'побед');
            else topWinsList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>';
        }
    } catch (error) {
        var topXpList = document.getElementById('top-xp-list');
        var topWinsList = document.getElementById('top-wins-list');
        if (topXpList) topXpList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>';
        if (topWinsList) topWinsList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>';
    }
}

function renderTopList(container, data, suffix) {
    container.innerHTML = '';
    data.forEach(function(item, index) {
        var rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        var div = document.createElement('div');
        div.className = 'top-item';
        div.innerHTML = '<div class="top-rank ' + rankClass + '">' + (index + 1) + '</div><div class="top-name">' + item.name + '</div><div class="top-value">' + (item.value || item.xp).toLocaleString() + ' ' + suffix + '</div>';
        container.appendChild(div);
    });
}

function setupReferralLink() {
    var userId = getUserId();
    var botUsername = 'sporttcm_bot';
    if (!userId) return;
    var referralLink = 'https://t.me/' + botUsername + '?start=' + userId;
    var referralBtn = document.getElementById('referral-btn');
    if (referralBtn) {
        referralBtn.onclick = function() {
            navigator.clipboard.writeText(referralLink).then(function() {
                showToast('✅ Ссылка скопирована!', 'success');
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            }).catch(function() {
                showToast('❌ Ошибка копирования', 'error');
            });
        };
    }
}

function renderShop() {
    var shopList = document.getElementById('shop-list');
    var shopBalance = document.getElementById('shop-balance');
    if (!shopList) return;
    if (shopBalance) shopBalance.textContent = playerData.xp.toLocaleString();
    shopList.innerHTML = '';
    var items = [];
    if (currentShopCategory === 'upgrades') {
        items = [
            {id: 'click_power_2', name: '⚡ Сила клика x2', price: 250000, desc: 'Тапай в 2 раза эффективнее'},
            {id: 'click_power_5', name: '⚡⚡ Сила клика x5', price: 1000000, desc: 'Тапай в 5 раз эффективнее'},
            {id: 'click_power_10', name: '⚡⚡⚡ Сила клика x10', price: 5000000, desc: 'Тапай в 10 раз эффективнее'},
            {id: 'max_energy_2000', name: '🔋 Энергия 2000', price: 500000, desc: 'Больше энергии для тапов'},
            {id: 'max_energy_5000', name: '🔋 Энергия 5000', price: 2000000, desc: 'Огромный запас энергии'},
            {id: 'energy_regen_2', name: '⚡ Реген x2', price: 750000, desc: 'Энергия восстанавливается быстрее'},
            {id: 'energy_regen_5', name: '⚡⚡ Реген x5', price: 3000000, desc: 'Супер быстрая регенерация'}
        ];
    } else {
        items = [
            {id: 'skin_gold', name: '🌟 Золотой мишка', price: 1000000, desc: 'Золотой скин для мишки'},
            {id: 'skin_diamond', name: '💎 Алмазный мишка', price: 5000000, desc: 'Алмазный скин для мишки'},
            {id: 'skin_rainbow', name: '🌈 Радужный мишка', price: 10000000, desc: 'Радужный скин для мишки'}
        ];
    }
    items.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'shop-item';
        var isPurchased = purchasedItems.indexOf(item.id) !== -1;
        var canAfford = playerData.xp >= item.price;
        var btnText, btnClass, btnAction;
        if (isPurchased && item.id.indexOf('skin_') === 0) {
            var skinName = item.id.replace('skin_', '');
            if (playerData.skin === skinName) {
                btnText = '✅ Надето';
                btnClass = 'equipped';
                btnAction = null;
            } else {
                btnText = '👕 Надеть';
                btnClass = 'purchased';
                btnAction = function() { equipSkin(skinName); };
            }
        } else if (isPurchased) {
            btnText = '✅ Куплено';
            btnClass = 'purchased';
            btnAction = null;
        } else if (canAfford) {
            btnText = '🛒 Купить';
            btnClass = '';
            btnAction = function() { buyItem(item.id); };
        } else {
            btnText = '🔒 Мало XP';
            btnClass = 'disabled';
            btnAction = null;
        }
        div.innerHTML = '<div class="shop-item-info"><div class="shop-item-name">' + item.name + '</div><div class="shop-item-desc">' + item.desc + '</div><div class="shop-item-price">💰 ' + item.price.toLocaleString() + ' XP</div></div><button class="shop-buy-btn ' + btnClass + '">' + btnText + '</button>';
        if (btnAction) div.querySelector('.shop-buy-btn').onclick = btnAction;
        shopList.appendChild(div);
    });
}

async function buyItem(itemId) {
    var userId = getUserId();
    if (!userId) return;
    var items = {
        'click_power_2': {price: 250000, name: '⚡ Сила клика x2'},
        'click_power_5': {price: 1000000, name: '⚡⚡ Сила клика x5'},
        'click_power_10': {price: 5000000, name: '⚡⚡⚡ Сила клика x10'},
        'max_energy_2000': {price: 500000, name: '🔋 Энергия 2000'},
        'max_energy_5000': {price: 2000000, name: '🔋🔋 Энергия 5000'},
        'energy_regen_2': {price: 750000, name: ' Реген x2'},
        'energy_regen_5': {price: 3000000, name: '⚡ Реген x5'},
        'skin_gold': {price: 1000000, name: '🌟 Золотой мишка'},
        'skin_diamond': {price: 5000000, name: '💎 Алмазный мишка'},
        'skin_rainbow': {price: 10000000, name: '🌈 Радужный мишка'}
    };
    var item = items[itemId];
    if (!item || playerData.xp < item.price) {
        showToast('❌ Недостаточно XP!', 'error');
        return;
    }
    try {
        var response = await fetch(API_URL + '/api/buy_item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, item: itemId })
        });
        var data = await response.json();
        if (data.status === 'success') {
            showToast('✅ ' + item.name + ' куплен!', 'success');
            if (purchasedItems.indexOf(itemId) === -1) {
                purchasedItems.push(itemId);
            }
            if (itemId.indexOf('skin_') === 0) {
                var skinName = itemId.replace('skin_', '');
                applySkin(skinName);
                playerData.skin = skinName;
            }
            recalculateBonuses();
            saveData();
            await saveProgress();
            updateUI();
            renderShop();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка покупки', 'error');
    }
}

async function equipSkin(skinName) {
    var userId = getUserId();
    if (!userId) return;
    try {
        var response = await fetch(API_URL + '/api/equip_skin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, skin: skinName })
        });
        var data = await response.json();
        if (data.status === 'equipped') {
            applySkin(skinName);
            playerData.skin = skinName;
            showToast('✅ Скин "' + skinName + '" надет!', 'success');
            renderShop();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function spinWheel() {
    if (wheelSpinning) return;
    var userId = getUserId();
    if (!userId) {
        showToast('❌ Пользователь не найден', 'error');
        return;
    }
    var now = Math.floor(Date.now() / 1000);
    var timeSinceLastSpin = now - Number(playerData.lastSpin || 0);
    if (timeSinceLastSpin < 3600) {
        var remaining = Math.ceil(3600 - timeSinceLastSpin);
        var minutes = Math.floor(remaining / 60);
        var seconds = remaining % 60;
        showToast('⏳ Подождите ' + minutes + 'м ' + seconds + 'с', 'warning');
        return;
    }
    var wheel = document.getElementById('wheel');
    var spinBtn = document.getElementById('spin-btn');
    if (!wheel || !spinBtn) {
        showToast('❌ Элемент колеса не найден', 'error');
        return;
    }
    wheelSpinning = true;
    spinBtn.disabled = true;
    var prizes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
    var chances = [25, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1, 0.5, 0.5];
    var totalChance = chances.reduce(function(sum, chance) { return sum + chance; }, 0);
    var randomValue = Math.random() * totalChance;
    var cumulative = 0;
    var wonIndex = 0;
    for (var i = 0; i < chances.length; i++) {
        cumulative += chances[i];
        if (randomValue <= cumulative) {
            wonIndex = i;
            break;
        }
    }
    var segmentCount = prizes.length;
    var segmentAngle = 360 / segmentCount;
    var targetAngle = 360 - (wonIndex * segmentAngle) - (segmentAngle / 2);
    var fullRotations = 5 * 360;
    var finalRotation = fullRotations + targetAngle;
    wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform = 'rotate(' + finalRotation + 'deg)';
    setTimeout(async function() {
        try {
            var response = await fetch(API_URL + '/api/spin_wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var data = await response.json();
            if (data.error) throw new Error(data.error);
            var wonPrize = Number(data.prize || 0);
            playerData.lastSpin = Number(data.last_spin || Math.floor(Date.now() / 1000));
            playerData.xp = Number(playerData.xp || 0) + wonPrize;
            if (wonPrize > 0) {
                showToast('🎉 Вы выиграли ' + wonPrize.toLocaleString() + ' XP!', 'success');
            } else {
                showToast(' Ничего не выиграли. Попробуйте через час!', 'info');
            }
            saveData();
            await saveProgress();
            updateUI();
            updateProfile();
            checkWheelTimer();
        } catch (error) {
            console.error('Ошибка вращения:', error);
            showToast('❌ ' + (error.message || 'Ошибка вращения'), 'error');
        } finally {
            wheelSpinning = false;
            spinBtn.disabled = false;
            wheel.style.transition = 'none';
            wheel.style.transform = 'rotate(' + targetAngle + 'deg)';
            requestAnimationFrame(function() {
                wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
            });
        }
    }, 4000);
}

function checkWheelTimer() {
    var timerEl = document.getElementById('wheel-timer');
    if (!timerEl) return;
    var now = Date.now() / 1000;
    var timeSinceLastSpin = now - playerData.lastSpin;
    if (timeSinceLastSpin < 3600) {
        var remaining = Math.ceil(3600 - timeSinceLastSpin);
        var minutes = Math.floor(remaining / 60);
        var seconds = remaining % 60;
        timerEl.textContent = '⏳ Следующее вращение через: ' + minutes + 'м ' + seconds + 'с';
        timerEl.style.display = 'block';
    } else {
        timerEl.style.display = 'none';
    }
}

function openGame(game) {
    switchScreen('game-' + game);
    if (game === 'mines') initMinesGrid();
    if (game === 'ninja') initNinjaGrid();
    if (game === 'tower') initTowerGrid();
    if (game === 'bubbles') initBubblesGrid();
}

async function startCrash() {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('crash-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    currentGame = 'crash';
    currentMultiplier = 1.0;
    try {
        var response = await fetch(API_URL + '/api/crash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'start', bet: bet })
        });
        var data = await response.json();
        if (data.status === 'started') {
            crashPoint = data.crash_point;
            var display = document.getElementById('crash-multiplier');
            var cashoutBtn = document.getElementById('crash-cashout');
            var startBtn = document.getElementById('crash-start');
            if (display) { display.textContent = '1.00x'; display.style.color = '#FFD700'; }
            if (cashoutBtn) cashoutBtn.disabled = false;
            if (startBtn) startBtn.disabled = true;
            crashInterval = setInterval(function() {
                currentMultiplier += 0.01;
                if (display) display.textContent = currentMultiplier.toFixed(2) + 'x';
                if (currentMultiplier >= crashPoint) {
                    clearInterval(crashInterval);
                    if (display) { display.textContent = '💥 CRASH @ ' + crashPoint.toFixed(2) + 'x'; display.style.color = '#ff4757'; }
                    if (cashoutBtn) cashoutBtn.disabled = true;
                    if (startBtn) startBtn.disabled = false;
                    showToast(' Краш на ' + crashPoint.toFixed(2) + 'x!', 'error');
                    currentGame = null;
                    loadData();
                }
            }, 100);
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function cashoutCrash() {
    var userId = getUserId();
    if (!userId || currentGame !== 'crash') return;
    clearInterval(crashInterval);
    try {
        var response = await fetch(API_URL + '/api/crash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'cashout' })
        });
        var data = await response.json();
        if (data.status === 'won') {
            showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success');
            var display = document.getElementById('crash-multiplier');
            var cashoutBtn = document.getElementById('crash-cashout');
            var startBtn = document.getElementById('crash-start');
            if (display) { display.textContent = '✅ WON @ ' + data.multiplier.toFixed(2) + 'x'; display.style.color = '#2ed573'; }
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            loadData();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function initMinesGrid() {
    var grid = document.getElementById('mines-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 25; i++) {
        var cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.dataset.index = i;
        cell.textContent = '❓';
        cell.onclick = function() { revealMine(parseInt(this.dataset.index)); };
        grid.appendChild(cell);
    }
}

async function startMines() {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('mines-bet');
    var minesSelect = document.getElementById('mines-count');
    var bet = parseInt(betInput.value);
    var minesCount = parseInt(minesSelect.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    currentGame = 'mines';
    minesState = { bet: bet, multiplier: 1.0, revealed: [] };
    try {
        var response = await fetch(API_URL + '/api/mines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'start', bet: bet, mines: minesCount })
        });
        var data = await response.json();
        if (data.status === 'started') {
            initMinesGrid();
            var cashoutBtn = document.getElementById('mines-cashout');
            var startBtn = document.getElementById('mines-start');
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = false; }
            if (startBtn) startBtn.disabled = true;
            updateMinesInfo();
        } else {
            showToast(' ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function revealMine(index) {
    var userId = getUserId();
    if (!userId || currentGame !== 'mines') return;
    var cell = document.querySelector('.mine-cell[data-index="' + index + '"]');
    if (!cell || cell.classList.contains('revealed')) return;
    try {
        var response = await fetch(API_URL + '/api/mines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'reveal', cell: index })
        });
        var data = await response.json();
        cell.classList.add('revealed');
        if (data.status === 'lost') {
            cell.classList.add('mine');
            cell.textContent = '💣';
            showToast(' Вы подорвались на мине!', 'error');
            var cashoutBtn = document.getElementById('mines-cashout');
            var startBtn = document.getElementById('mines-start');
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = true; }
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            minesState = null;
            loadData();
        } else if (data.status === 'safe') {
            cell.classList.add('safe');
            cell.textContent = '💎';
            minesState.multiplier = data.multiplier;
            updateMinesInfo();
            var cashoutBtn = document.getElementById('mines-cashout');
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать ' + data.win.toLocaleString() + ' XP'; cashoutBtn.disabled = false; }
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function updateMinesInfo() {
    if (!minesState) return;
    var multEl = document.getElementById('mines-multiplier');
    var winEl = document.getElementById('mines-win');
    if (multEl) multEl.textContent = minesState.multiplier.toFixed(2);
    if (winEl) winEl.textContent = Math.floor(minesState.bet * minesState.multiplier).toLocaleString();
}

async function cashoutMines() {
    var userId = getUserId();
    if (!userId || currentGame !== 'mines') return;
    try {
        var response = await fetch(API_URL + '/api/mines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'cashout' })
        });
        var data = await response.json();
        if (data.status === 'won') {
            showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success');
            var cashoutBtn = document.getElementById('mines-cashout');
            var startBtn = document.getElementById('mines-start');
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = true; }
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            minesState = null;
            loadData();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function spinRoulette(color) {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('roulette-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    try {
        var response = await fetch(API_URL + '/api/roulette', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, bet: bet, color: color })
        });
        var data = await response.json();
        var resultEl = document.getElementById('roulette-result');
        if (resultEl) {
            var colorEmojis = { red: '', black: '⚫', green: '🟢' };
            var colorNames = { red: 'Красное', black: 'Чёрное', green: 'Зелёное' };
            resultEl.textContent = 'Выпало: ' + colorEmojis[data.result] + ' ' + colorNames[data.result];
            if (data.status === 'won') {
                resultEl.textContent += ' | Выигрыш: ' + data.win.toLocaleString() + ' XP! 🎉';
                resultEl.style.color = '#2ed573';
                showToast('✅ Вы выиграли ' + data.win.toLocaleString() + ' XP!', 'success');
            } else {
                resultEl.textContent += ' | Вы проиграли 😔';
                resultEl.style.color = '#ff4757';
                showToast('❌ Вы проиграли', 'error');
            }
        }
        loadData();
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function playDouble(choice) {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('double-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    try {
        var response = await fetch(API_URL + '/api/double', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, bet: bet, choice: choice })
        });
        var data = await response.json();
        var resultEl = document.getElementById('double-result');
        if (resultEl) {
            var names = { '2': '⚡ x2', '3': '🔥 x3', '5': '🌟 x5', '50': '💎 x50' };
            resultEl.textContent = 'Выпало: ' + (names[data.result] || data.result);
            if (data.status === 'won') {
                resultEl.textContent += ' | Выигрыш: ' + data.win.toLocaleString() + ' XP! 🎉';
                resultEl.style.color = '#2ed573';
                showToast('✅ Вы выиграли ' + data.win.toLocaleString() + ' XP!', 'success');
            } else {
                resultEl.textContent += ' | Вы проиграли 😔';
                resultEl.style.color = '#ff4757';
                showToast('❌ Вы проиграли', 'error');
            }
        }
        loadData();
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function initNinjaGrid() {
    var grid = document.getElementById('ninja-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 5; i++) {
        var cell = document.createElement('button');
        cell.className = 'ninja-cell';
        cell.dataset.index = i;
        cell.textContent = '';
        cell.onclick = function() { pickNinja(parseInt(this.dataset.index)); };
        grid.appendChild(cell);
    }
}

async function startNinja() {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('ninja-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    currentGame = 'ninja';
    ninjaState = { bet: bet, multiplier: 1.0, rounds: 0 };
    try {
        var response = await fetch(API_URL + '/api/ninja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'start', bet: bet })
        });
        var data = await response.json();
        if (data.status === 'started') {
            initNinjaGrid();
            var cashoutBtn = document.getElementById('ninja-cashout');
            var startBtn = document.getElementById('ninja-start');
            if (cashoutBtn) cashoutBtn.disabled = false;
            if (startBtn) startBtn.disabled = true;
            updateNinjaInfo();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function pickNinja(index) {
    var userId = getUserId();
    if (!userId || currentGame !== 'ninja') return;
    var cell = document.querySelector('.ninja-cell[data-index="' + index + '"]');
    if (!cell || cell.classList.contains('revealed')) return;
    try {
        var response = await fetch(API_URL + '/api/ninja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'pick', pick: index })
        });
        var data = await response.json();
        cell.classList.add('revealed');
        if (data.status === 'hit') {
            cell.classList.add('hit');
            cell.textContent = '🥷';
            showToast('💥 Вы попали на ниндзя!', 'error');
            var cashoutBtn = document.getElementById('ninja-cashout');
            var startBtn = document.getElementById('ninja-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            ninjaState = null;
            loadData();
        } else if (data.status === 'safe') {
            cell.classList.add('safe');
            cell.textContent = '✅';
            ninjaState.multiplier = data.multiplier;
            ninjaState.rounds = data.rounds;
            updateNinjaInfo();
        }
    } catch (error) {
        showToast(' Ошибка', 'error');
    }
}

function updateNinjaInfo() {
    if (!ninjaState) return;
    var multEl = document.getElementById('ninja-multiplier');
    var roundsEl = document.getElementById('ninja-rounds');
    var winEl = document.getElementById('ninja-win');
    if (multEl) multEl.textContent = ninjaState.multiplier.toFixed(2) + 'x';
    if (roundsEl) roundsEl.textContent = '🎯 Раунд: ' + ninjaState.rounds;
    if (winEl) winEl.textContent = '💰 Выигрыш: ' + Math.floor(ninjaState.bet * ninjaState.multiplier).toLocaleString() + ' XP';
}

async function cashoutNinja() {
    var userId = getUserId();
    if (!userId || currentGame !== 'ninja') return;
    try {
        var response = await fetch(API_URL + '/api/ninja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'cashout' })
        });
        var data = await response.json();
        if (data.status === 'won') {
            showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success');
            var cashoutBtn = document.getElementById('ninja-cashout');
            var startBtn = document.getElementById('ninja-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            ninjaState = null;
            loadData();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function initTowerGrid() {
    var grid = document.getElementById('tower-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var levels = [
        { bombs: 1, mult: 1.13 },
        { bombs: 2, mult: 1.41 },
        { bombs: 3, mult: 2.34 },
        { bombs: 4, mult: 3.91 }
    ];
    levels.forEach(function(level, idx) {
        var cell = document.createElement('div');
        cell.className = 'tower-cell';
        cell.dataset.level = idx + 1;
        cell.innerHTML = 'Ур. ' + (idx + 1) + '<br>' + level.bombs + ' <br>x' + level.mult;
        cell.onclick = function() { pickTower(parseInt(this.dataset.level)); };
        grid.appendChild(cell);
    });
}

async function startTower() {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('tower-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    currentGame = 'tower';
    towerState = { bet: bet, level: 0, multiplier: 1.0 };
    try {
        var response = await fetch(API_URL + '/api/tower', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'start', bet: bet })
        });
        var data = await response.json();
        if (data.status === 'started') {
            initTowerGrid();
            var cashoutBtn = document.getElementById('tower-cashout');
            var startBtn = document.getElementById('tower-start');
            if (cashoutBtn) cashoutBtn.disabled = false;
            if (startBtn) startBtn.disabled = true;
            updateTowerInfo();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function pickTower(level) {
    var userId = getUserId();
    if (!userId || currentGame !== 'tower') return;
    var cell = document.querySelector('.tower-cell[data-level="' + level + '"]');
    if (!cell || cell.classList.contains('revealed')) return;
    try {
        var response = await fetch(API_URL + '/api/tower', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'pick', level: level })
        });
        var data = await response.json();
        cell.classList.add('revealed');
        if (data.status === 'lost') {
            cell.classList.add('fail');
            cell.innerHTML = '💥';
            showToast('💥 Вы упали с башни!', 'error');
            var cashoutBtn = document.getElementById('tower-cashout');
            var startBtn = document.getElementById('tower-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            towerState = null;
            loadData();
        } else if (data.status === 'safe') {
            cell.classList.add('safe');
            cell.innerHTML = '✅';
            towerState.level = level;
            towerState.multiplier = data.multiplier;
            updateTowerInfo();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function updateTowerInfo() {
    if (!towerState) return;
    var levelEl = document.getElementById('tower-level');
    var multEl = document.getElementById('tower-multiplier');
    if (levelEl) levelEl.textContent = '🏁 Уровень: ' + towerState.level;
    if (multEl) multEl.textContent = 'x' + towerState.multiplier.toFixed(2);
}

async function cashoutTower() {
    var userId = getUserId();
    if (!userId || currentGame !== 'tower') return;
    try {
        var response = await fetch(API_URL + '/api/tower', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'cashout' })
        });
        var data = await response.json();
        if (data.status === 'won') {
            showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success');
            var cashoutBtn = document.getElementById('tower-cashout');
            var startBtn = document.getElementById('tower-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            towerState = null;
            loadData();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function initBubblesGrid() {
    var grid = document.getElementById('bubbles-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 16; i++) {
        var bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.dataset.index = i;
        bubble.textContent = '🫧';
        bubble.onclick = function() { popBubble(parseInt(this.dataset.index)); };
        grid.appendChild(bubble);
    }
}

async function startBubbles() {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('bubbles-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    currentGame = 'bubbles';
    bubblesState = { bet: bet, score: 0, multiplier: 1.0 };
    try {
        var response = await fetch(API_URL + '/api/bubbles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'start', bet: bet })
        });
        var data = await response.json();
        if (data.status === 'started') {
            initBubblesGrid();
            var cashoutBtn = document.getElementById('bubbles-cashout');
            var startBtn = document.getElementById('bubbles-start');
            if (cashoutBtn) cashoutBtn.disabled = false;
            if (startBtn) startBtn.disabled = true;
            updateBubblesInfo();
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function popBubble(index) {
    var userId = getUserId();
    if (!userId || currentGame !== 'bubbles') return;
    var bubble = document.querySelector('.bubble[data-index="' + index + '"]');
    if (!bubble || bubble.classList.contains('popped')) return;
    try {
        var response = await fetch(API_URL + '/api/bubbles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'pop', index: index })
        });
        var data = await response.json();
        bubble.classList.add('popped');
        if (data.status === 'bomb') {
            bubble.classList.add('bomb');
            bubble.textContent = '💣';
            showToast('💥 Вы лопнули бомбу!', 'error');
            var cashoutBtn = document.getElementById('bubbles-cashout');
            var startBtn = document.getElementById('bubbles-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            bubblesState = null;
            loadData();
        } else if (data.status === 'safe') {
            bubble.textContent = '✨';
            bubblesState.score = data.score;
            bubblesState.multiplier = data.multiplier;
            updateBubblesInfo();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function updateBubblesInfo() {
    if (!bubblesState) return;
    var scoreEl = document.getElementById('bubbles-score');
    var multEl = document.getElementById('bubbles-multiplier');
    if (scoreEl) scoreEl.textContent = '🎯 Счёт: ' + bubblesState.score;
    if (multEl) multEl.textContent = 'x' + bubblesState.multiplier.toFixed(2);
}

async function cashoutBubbles() {
    var userId = getUserId();
    if (!userId || currentGame !== 'bubbles') return;
    try {
        var response = await fetch(API_URL + '/api/bubbles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: 'cashout' })
        });
        var data = await response.json();
        if (data.status === 'won') {
            showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success');
            var cashoutBtn = document.getElementById('bubbles-cashout');
            var startBtn = document.getElementById('bubbles-start');
            if (cashoutBtn) cashoutBtn.disabled = true;
            if (startBtn) startBtn.disabled = false;
            currentGame = null;
            bubblesState = null;
            loadData();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function flipCoin(choice) {
    var userId = getUserId();
    if (!userId) return;
    var betInput = document.getElementById('coins-bet');
    var bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) {
        showToast('❌ Неверная ставка!', 'error');
        return;
    }
    var coinEl = document.getElementById('coin');
    var resultEl = document.getElementById('coins-result');
    coinEl.style.animation = 'none';
    setTimeout(function() { coinEl.style.animation = 'coinFlip 1s ease-in-out'; }, 10);
    try {
        var response = await fetch(API_URL + '/api/coins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, bet: bet, choice: choice })
        });
        var data = await response.json();
        setTimeout(function() {
            var names = { heads: '🦅 Орёл', tails: '🪙 Решка' };
            coinEl.textContent = data.result === 'heads' ? '🦅' : '';
            resultEl.textContent = 'Выпало: ' + names[data.result];
            if (data.status === 'won') {
                resultEl.textContent += ' | Выигрыш: ' + data.win.toLocaleString() + ' XP! 🎉';
                resultEl.style.color = '#2ed573';
                showToast('✅ Вы выиграли ' + data.win.toLocaleString() + ' XP!', 'success');
            } else {
                resultEl.textContent += ' | Вы проиграли 😔';
                resultEl.style.color = '#ff4757';
                showToast('❌ Вы проиграли', 'error');
            }
            loadData();
        }, 1000);
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

function showAdminPanel() {
    if (!playerData.isAdmin) {
        showToast('❌ Нет доступа!', 'error');
        return;
    }
    switchScreen('admin');
    loadAdminStats();
}

function backToProfile() {
    switchScreen('profile');
}

async function loadAdminStats() {
    var userId = getUserId();
    if (!userId) return;
    try {
        var response = await fetch(API_URL + '/api/admin_stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId })
        });
        var data = await response.json();
        if (data.total_users !== undefined) {
            document.getElementById('admin-total-users').textContent = data.total_users;
            document.getElementById('admin-active-users').textContent = data.active_users;
            document.getElementById('admin-banned-users').textContent = data.banned_users;
            document.getElementById('admin-total-xp').textContent = data.total_xp.toLocaleString();
            document.getElementById('admin-avg-xp').textContent = Math.round(data.avg_xp || 0).toLocaleString();
            document.getElementById('admin-total-refs').textContent = data.total_refs.toLocaleString();
            document.getElementById('admin-total-purchases').textContent = data.total_purchases.toLocaleString();
            document.getElementById('admin-total-revenue').textContent = data.total_revenue.toLocaleString();
            document.getElementById('admin-total-games').textContent = data.total_games.toLocaleString();
            var maintText = document.getElementById('maintenance-text');
            var maintBtn = document.getElementById('maintenance-btn');
            if (maintText) {
                maintText.textContent = data.maintenance ? 'Закрыто' : 'Открыто';
                maintText.className = data.maintenance ? 'closed' : '';
            }
            if (maintBtn) maintBtn.textContent = data.maintenance ? '🔓 Открыть доступ' : ' Закрыть доступ';
            var topList = document.getElementById('admin-top-users');
            if (topList && data.top_users && data.top_users.length > 0) {
                topList.innerHTML = '';
                data.top_users.forEach(function(user, index) {
                    var rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                    var div = document.createElement('div');
                    div.className = 'top-item';
                    div.innerHTML = '<div class="top-rank ' + rankClass + '">' + (index + 1) + '</div><div class="top-name">' + (user.name || user.username || 'User') + '</div><div class="top-value">' + user.xp.toLocaleString() + ' XP</div>';
                    topList.appendChild(div);
                });
            }
        }
    } catch (error) {
        showToast('❌ Ошибка загрузки статистики', 'error');
    }
}

async function toggleMaintenance() {
    var userId = getUserId();
    if (!userId) return;
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'toggle_maintenance' })
        });
        var data = await response.json();
        if (data.status === 'maintenance_toggled') {
            showToast(data.maintenance ? '🔒 Доступ закрыт' : '🔓 Доступ открыт', 'success');
            loadAdminStats();
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function adminGiveXP() {
    var userId = getUserId();
    var targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) {
        showToast('❌ Введите User ID', 'error');
        return;
    }
    var amount = prompt('💰 Введите количество XP для выдачи:');
    if (!amount || isNaN(amount) || amount <= 0) {
        showToast('❌ Неверное количество', 'error');
        return;
    }
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'add_xp', target_id: parseInt(targetId), amount: parseInt(amount) })
        });
        var data = await response.json();
        if (data.status === 'xp_added') {
            showToast('✅ Выдано ' + amount + ' XP пользователю ' + targetId, 'success');
            setTimeout(function() { loadData(); }, 500);
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function adminRemoveXP() {
    var userId = getUserId();
    var targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) {
        showToast('❌ Введите User ID', 'error');
        return;
    }
    var amount = prompt('➖ Введите количество XP для изъятия:');
    if (!amount || isNaN(amount) || amount <= 0) {
        showToast('❌ Неверное количество', 'error');
        return;
    }
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'remove_xp', target_id: parseInt(targetId), amount: parseInt(amount) })
        });
        var data = await response.json();
        if (data.status === 'xp_removed') {
            showToast('✅ Изъято ' + amount + ' XP у пользователя ' + targetId, 'success');
            setTimeout(function() { loadData(); }, 500);
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function adminBanUser() {
    var userId = getUserId();
    var targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) {
        showToast('❌ Введите User ID', 'error');
        return;
    }
    if (!confirm('🚫 Забанить пользователя ' + targetId + '?')) return;
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'ban', target_id: parseInt(targetId) })
        });
        var data = await response.json();
        if (data.status === 'banned') showToast('✅ Пользователь ' + targetId + ' забанен', 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function adminUnbanUser() {
    var userId = getUserId();
    var targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) {
        showToast('❌ Введите User ID', 'error');
        return;
    }
    if (!confirm('✅ Разбанить пользователя ' + targetId + '?')) return;
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'unban', target_id: parseInt(targetId) })
        });
        var data = await response.json();
        if (data.status === 'unbanned') showToast('✅ Пользователь ' + targetId + ' разбанен', 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

async function adminResetWheel() {
    var userId = getUserId();
    var targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) {
        showToast('❌ Введите User ID', 'error');
        return;
    }
    if (!confirm('🎡 Сбросить таймер колеса для пользователя ' + targetId + '?')) return;
    try {
        var response = await fetch(API_URL + '/api/admin_action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: userId, action: 'reset_wheel', target_id: parseInt(targetId) })
        });
        var data = await response.json();
        if (data.status === 'wheel_reset') showToast('✅ Колесо сброшено для ' + targetId, 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) {
        showToast('❌ Ошибка', 'error');
    }
}

document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.isBanned) {
        showToast('⛔ Вы заблокированы!', 'error');
        return;
    }
    if (playerData.energy < playerData.clickPower) {
        showToast('⚠️ Недостаточно энергии!', 'warning');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        return;
    }
    playerData.xp += playerData.clickPower;
    playerData.totalClicks++;
    playerData.energy -= playerData.clickPower;
    var newLevel = Math.floor(playerData.totalClicks / 1000) + 1;
    if (newLevel > playerData.level) {
        playerData.level = newLevel;
        showToast(' Новый уровень: ' + playerData.level + '!', 'success');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    showClickEffect(e);
    updateUI();
    updateProfile();
    saveData();
    lastActivity = Date.now();
});

function showClickEffect(e) {
    var effect = document.createElement('div');
    effect.className = 'click-effect';
    effect.textContent = '+' + playerData.clickPower;
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    effect.style.left = x + 'px';
    effect.style.top = y + 'px';
    var bearEl = document.getElementById('bear');
    if (bearEl) bearEl.appendChild(effect);
    setTimeout(function() { effect.remove(); }, 1000);
}

function switchScreen(screen) {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var navBtn = document.querySelector('.nav-btn[data-screen="' + screen + '"]');
    if (navBtn) navBtn.classList.add('active');
    var targetScreen = document.getElementById('screen-' + screen);
    if (targetScreen) targetScreen.classList.add('active');
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    if (screen === 'profile') updateProfile();
    if (screen === 'shop') renderShop();
    if (screen === 'wheel') checkWheelTimer();
    lastActivity = Date.now();
}

document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchScreen(this.dataset.screen); });
});

document.querySelectorAll('.shop-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.shop-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        currentShopCategory = this.dataset.category;
        renderShop();
    });
});

document.querySelectorAll('.game-card').forEach(function(card) {
    card.addEventListener('click', function() { openGame(this.dataset.game); });
});

document.querySelectorAll('.back-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchScreen(this.dataset.back); });
});

document.querySelectorAll('.roulette-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { spinRoulette(this.dataset.color); });
});

document.querySelectorAll('.double-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { playDouble(this.dataset.choice); });
});

document.querySelectorAll('.coins-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { flipCoin(this.dataset.choice); });
});

document.getElementById('spin-btn').addEventListener('click', spinWheel);
document.getElementById('crash-start').addEventListener('click', startCrash);
document.getElementById('crash-cashout').addEventListener('click', cashoutCrash);
document.getElementById('mines-start').addEventListener('click', startMines);
document.getElementById('mines-cashout').addEventListener('click', cashoutMines);
document.getElementById('ninja-start').addEventListener('click', startNinja);
document.getElementById('ninja-cashout').addEventListener('click', cashoutNinja);
document.getElementById('tower-start').addEventListener('click', startTower);
document.getElementById('tower-cashout').addEventListener('click', cashoutTower);
document.getElementById('bubbles-start').addEventListener('click', startBubbles);
document.getElementById('bubbles-cashout').addEventListener('click', cashoutBubbles);
document.getElementById('admin-btn').addEventListener('click', showAdminPanel);
document.getElementById('btn-back-profile').addEventListener('click', backToProfile);
document.getElementById('btn-refresh-stats').addEventListener('click', loadAdminStats);
document.getElementById('btn-give-xp').addEventListener('click', adminGiveXP);
document.getElementById('btn-remove-xp').addEventListener('click', adminRemoveXP);
document.getElementById('btn-ban').addEventListener('click', adminBanUser);
document.getElementById('btn-unban').addEventListener('click', adminUnbanUser);
document.getElementById('btn-reset-wheel').addEventListener('click', adminResetWheel);
document.getElementById('maintenance-btn').addEventListener('click', toggleMaintenance);

function showToast(text, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = text;
    document.body.appendChild(toast);
    toasts.push(toast);
    updateToastPositions();
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(function() {
            toast.remove();
            toasts = toasts.filter(function(t) { return t !== toast; });
            updateToastPositions();
        }, 300);
    }, 2500);
}

function updateToastPositions() {
    var gap = 10;
    toasts.forEach(function(toast, index) {
        var offset = index * (60 + gap);
        toast.style.top = (20 + offset) + 'px';
    });
}

setInterval(function() {
    if (playerData.energy < playerData.maxEnergy) {
        var regenAmount = playerData.energyRegen || 1;
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + regenAmount);
        updateUI();
        saveData();
    }
}, 1000);

setInterval(function() {
    saveProgress();
}, 10000);

setInterval(function() {
    checkWheelTimer();
}, 1000);

loadData();
showToast(' Тапай и зарабатывай XP!', 'success');
