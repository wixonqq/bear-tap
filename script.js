const tg = window.Telegram.WebApp; tg.expand(); tg.ready();
const API_URL = 'https://botandreybot-andrey5453.amvera.io';
const ADMIN_ID = 7650149888;

let playerData = { xp: 0, totalClicks: 0, energy: 1000, maxEnergy: 1000, clickPower: 1, level: 1, wins: 0, referrals: 0, achievements: [], username: '', firstName: '', lastSave: Date.now(), lastSpin: 0, isAdmin: false, skin: 'default', energyRegen: 1, isBanned: false };
let lastSavedXp = 0; let apiWorking = false; let toasts = []; let wheelSpinning = false;
let currentGame = null; let crashInterval = null; let currentMultiplier = 1.0; let crashPoint = 0;
let minesState = null; let ninjaState = null; let towerState = null;
let purchasedItems = []; let currentShopCategory = 'upgrades'; let lastActivity = Date.now();

function getUserId() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return tg.initDataUnsafe.user.id;
    try { const urlParams = new URLSearchParams(window.location.search); const urlUserId = urlParams.get('user_id'); if (urlUserId) return parseInt(urlUserId); } catch (e) {}
    return null;
}

function applySkin(skinName) {
    const bear = document.getElementById('bear-character');
    if (!bear) return;
    bear.classList.remove('skin-gold', 'skin-diamond', 'skin-rainbow');
    if (skinName && skinName !== 'default') bear.classList.add('skin-' + skinName);
}

function recalculateBonuses() {
    let clickPower = 1; let maxEnergy = 1000; let energyRegen = 1;
    purchasedItems.forEach(item => {
        if (item === 'click_power_2') clickPower += 2;
        else if (item === 'click_power_5') clickPower += 5;
        else if (item === 'click_power_10') clickPower += 10;
        else if (item === 'max_energy_2000') maxEnergy += 2000;
        else if (item === 'max_energy_5000') maxEnergy += 5000;
        else if (item === 'energy_regen_2') energyRegen += 2;
        else if (item === 'energy_regen_5') energyRegen += 5;
    });
    playerData.clickPower = clickPower; playerData.maxEnergy = maxEnergy; playerData.energyRegen = energyRegen;
    playerData.energy = Math.min(playerData.energy, playerData.maxEnergy);
}

async function loadPurchases() {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(API_URL + '/api/purchases?user_id=' + userId);
        if (response.ok) {
            const data = await response.json();
            purchasedItems = data.purchases || [];
            if (data.current_skin) { playerData.skin = data.current_skin; applySkin(playerData.skin); }
            recalculateBonuses();
        }
    } catch (error) { console.error('Load purchases error:', error); }
}

async function loadData() {
    const userId = getUserId();
    if (!userId) { showToast('Ошибка: не получен ID', 'error'); loadLocalData(); return; }
    const isAdmin = userId === ADMIN_ID;
    try {
        const response = await fetch(API_URL + '/api/user_data?user_id=' + userId);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
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
        playerData = { xp: data.xp || 0, totalClicks: data.total_clicks || 0, energy: (data.energy !== undefined && data.energy !== null) ? data.energy : 1000, maxEnergy: data.max_energy || 1000, clickPower: data.click_power || 1, level: Math.floor((data.xp || 0) / 100) + 1, wins: data.wins || 0, referrals: data.referrals || 0, achievements: data.achievements || [], username: data.username || '', firstName: data.first_name || '', lastSave: Date.now(), lastSpin: data.last_spin || 0, isAdmin: isAdmin, skin: data.skin || 'default', energyRegen: data.energy_regen || 1, isBanned: data.is_banned === 1 };
        applySkin(playerData.skin);
        await loadPurchases();
        lastSavedXp = playerData.xp; updateUI(); updateProfile(); renderShop(); checkWheelTimer();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
    } catch (error) { console.error('Load data error:', error); showToast('Не удалось загрузить данные: ' + error.message, 'error'); loadLocalData(); }
}

function loadLocalData() {
    const saved = localStorage.getItem('bearTapData');
    if (saved) { playerData = JSON.parse(saved); const timePassed = (Date.now() - playerData.lastSave) / 1000; playerData.energy = Math.min(playerData.maxEnergy || 1000, (playerData.energy || 1000) + Math.floor(timePassed / 5) * (playerData.energyRegen || 1)); }
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) { playerData.username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || 'Игрок'; playerData.firstName = tg.initDataUnsafe.user.first_name || 'Игрок'; playerData.isAdmin = tg.initDataUnsafe.user.id === ADMIN_ID; }
    updateUI(); updateProfile(); renderShop(); checkWheelTimer();
    const adminBtn = document.getElementById('admin-btn'); if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
}

function saveData() { playerData.lastSave = Date.now(); localStorage.setItem('bearTapData', JSON.stringify(playerData)); }

async function saveProgress() {
    if (!apiWorking) return; const userId = getUserId(); if (!userId) return;
    try { await fetch(API_URL + '/api/save_progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, xp: playerData.xp, clicks: playerData.totalClicks, energy: Math.floor(playerData.energy) }) }); lastSavedXp = playerData.xp; } catch (error) { console.error('Save error:', error); }
}

function updateUI() {
    const xpBalance = document.getElementById('xp-balance'); const xpPerTap = document.getElementById('xp-per-tap');
    const energyCurrent = document.getElementById('energy-current'); const energyMax = document.getElementById('energy-max'); const energyFill = document.getElementById('energy-fill');
    if (xpBalance) xpBalance.textContent = playerData.xp.toLocaleString();
    if (xpPerTap) xpPerTap.textContent = playerData.clickPower;
    if (energyCurrent) energyCurrent.textContent = Math.floor(playerData.energy);
    if (energyMax) energyMax.textContent = playerData.maxEnergy;
    if (energyFill) { const energyPercent = Math.min(100, Math.max(0, (playerData.energy / playerData.maxEnergy) * 100)); energyFill.style.width = energyPercent + '%'; }
}

function updateProfile() {
    const profileName = document.getElementById('profile-name'); const profileLevel = document.getElementById('profile-level');
    const statWins = document.getElementById('stat-wins'); const statXp = document.getElementById('stat-xp');
    const statRefs = document.getElementById('stat-refs'); const statClicks = document.getElementById('stat-clicks');
    if (profileName) profileName.textContent = playerData.firstName || playerData.username || 'Игрок';
    if (profileLevel) profileLevel.textContent = playerData.level;
    if (statWins) statWins.textContent = playerData.wins; if (statXp) statXp.textContent = playerData.xp.toLocaleString();
    if (statRefs) statRefs.textContent = playerData.referrals; if (statClicks) statClicks.textContent = playerData.totalClicks.toLocaleString();
    updateTopLists(); setupReferralLink();
}

async function updateTopLists() {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(API_URL + '/api/user_data?user_id=' + userId);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const topXpList = document.getElementById('top-xp-list');
        if (topXpList) { if (data.top_xp && data.top_xp.length > 0) renderTopList(topXpList, data.top_xp, 'XP'); else topXpList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>'; }
        const topWinsList = document.getElementById('top-wins-list');
        if (topWinsList) { if (data.top_wins && data.top_wins.length > 0) renderTopList(topWinsList, data.top_wins, 'побед'); else topWinsList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>'; }
    } catch (error) { const topXpList = document.getElementById('top-xp-list'); const topWinsList = document.getElementById('top-wins-list'); if (topXpList) topXpList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>'; if (topWinsList) topWinsList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>'; }
}

function renderTopList(container, data, suffix) {
    container.innerHTML = '';
    data.forEach(function(item, index) {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const div = document.createElement('div'); div.className = 'top-item';
        div.innerHTML = '<div class="top-rank ' + rankClass + '">' + (index + 1) + '</div><div class="top-name">' + item.name + '</div><div class="top-value">' + (item.value || item.xp).toLocaleString() + ' ' + suffix + '</div>';
        container.appendChild(div);
    });
}

function setupReferralLink() {
    const userId = getUserId(); const botUsername = 'sporttcm_bot'; if (!userId) return;
    const referralLink = 'https://t.me/' + botUsername + '?start=' + userId;
    const referralBtn = document.getElementById('referral-btn');
    if (referralBtn) { referralBtn.onclick = function() { navigator.clipboard.writeText(referralLink).then(function() { showToast('✅ Ссылка скопирована!', 'success'); }).catch(function() { showToast('❌ Ошибка копирования', 'error'); }); }; }
}

function renderShop() {
    const shopList = document.getElementById('shop-list'); const shopBalance = document.getElementById('shop-balance');
    if (!shopList) return; if (shopBalance) shopBalance.textContent = playerData.xp.toLocaleString();
    shopList.innerHTML = '';
    let items = [];
    if (currentShopCategory === 'upgrades') {
        items = [ {id: 'click_power_2', name: '⚡ Сила клика x2', price: 250000, desc: 'Тапай в 2 раза эффективнее'}, {id: 'click_power_5', name: '⚡⚡ Сила клика x5', price: 1000000, desc: 'Тапай в 5 раз эффективнее'}, {id: 'click_power_10', name: '⚡⚡⚡ Сила клика x10', price: 5000000, desc: 'Тапай в 10 раз эффективнее'}, {id: 'max_energy_2000', name: ' Энергия 2000', price: 500000, desc: 'Больше энергии для тапов'}, {id: 'max_energy_5000', name: '🔋 Энергия 5000', price: 2000000, desc: 'Огромный запас энергии'}, {id: 'energy_regen_2', name: '⚡ Реген x2', price: 750000, desc: 'Энергия восстанавливается быстрее'}, {id: 'energy_regen_5', name: '⚡⚡ Реген x5', price: 3000000, desc: 'Супер быстрая регенерация'} ];
    } else {
        items = [ {id: 'skin_gold', name: '🌟 Золотой мишка', price: 1000000, desc: 'Золотой скин для мишки'}, {id: 'skin_diamond', name: '💎 Алмазный мишка', price: 5000000, desc: 'Алмазный скин для мишки'}, {id: 'skin_rainbow', name: '🌈 Радужный мишка', price: 10000000, desc: 'Радужный скин для мишки'} ];
    }
    items.forEach(function(item) {
        const div = document.createElement('div'); div.className = 'shop-item';
        const isPurchased = purchasedItems.includes(item.id);
        const canAfford = playerData.xp >= item.price;
        let btnText, btnClass, btnAction;
        if (isPurchased && item.id.startsWith('skin_')) {
            const skinName = item.id.replace('skin_', '');
            if (playerData.skin === skinName) { btnText = '✅ Надето'; btnClass = 'equipped'; btnAction = null; }
            else { btnText = '👕 Надеть'; btnClass = 'purchased'; btnAction = function() { equipSkin(skinName); }; }
        } else if (isPurchased) { btnText = '✅ Куплено'; btnClass = 'purchased'; btnAction = null; }
        else if (canAfford) { btnText = '🛒 Купить'; btnClass = ''; btnAction = function() { buyItem(item.id); }; }
        else { btnText = '🔒 Мало XP'; btnClass = 'disabled'; btnAction = null; }
        div.innerHTML = '<div class="shop-item-info"><div class="shop-item-name">' + item.name + '</div><div class="shop-item-desc">' + item.desc + '</div><div class="shop-item-price">💰 ' + item.price.toLocaleString() + ' XP</div></div><button class="shop-buy-btn ' + btnClass + '">' + btnText + '</button>';
        if (btnAction) div.querySelector('.shop-buy-btn').onclick = btnAction;
        shopList.appendChild(div);
    });
}

async function buyItem(itemId) {
    const userId = getUserId(); if (!userId) return;
    const items = { 'click_power_2': {price: 250000, name: '⚡ Сила клика x2'}, 'click_power_5': {price: 1000000, name: '⚡ Сила клика x5'}, 'click_power_10': {price: 5000000, name: '⚡⚡ Сила клика x10'}, 'max_energy_2000': {price: 500000, name: ' Энергия 2000'}, 'max_energy_5000': {price: 2000000, name: '🔋 Энергия 5000'}, 'energy_regen_2': {price: 750000, name: ' Реген x2'}, 'energy_regen_5': {price: 3000000, name: '⚡⚡ Реген x5'}, 'skin_gold': {price: 1000000, name: ' Золотой мишка'}, 'skin_diamond': {price: 5000000, name: '💎 Алмазный мишка'}, 'skin_rainbow': {price: 10000000, name: '🌈 Радужный мишка'} };
    const item = items[itemId];
    if (!item || playerData.xp < item.price) { showToast('❌ Недостаточно XP!', 'error'); return; }
    try {
        const response = await fetch(API_URL + '/api/buy_item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, item: itemId }) });
        const data = await response.json();
        if (data.status === 'success') {
            showToast('✅ ' + item.name + ' куплен!', 'success');
            if (!purchasedItems.includes(itemId)) purchasedItems.push(itemId);
            if (itemId.startsWith('skin_')) { const skinName = itemId.replace('skin_', ''); applySkin(skinName); playerData.skin = skinName; }
            recalculateBonuses(); saveData(); await saveProgress(); updateUI(); renderShop();
        } else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка покупки', 'error'); }
}

async function equipSkin(skinName) {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(API_URL + '/api/equip_skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, skin: skinName }) });
        const data = await response.json();
        if (data.status === 'equipped') { applySkin(skinName); playerData.skin = skinName; showToast('✅ Скин "' + skinName + '" надет!', 'success'); renderShop(); }
        else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function spinWheel() {
    if (wheelSpinning) return;
    const userId = getUserId(); if (!userId) { showToast('❌ Пользователь не найден', 'error'); return; }
    const now = Math.floor(Date.now() / 1000);
    const timeSinceLastSpin = now - Number(playerData.lastSpin || 0);
    if (timeSinceLastSpin < 3600) { const remaining = Math.ceil(3600 - timeSinceLastSpin); const minutes = Math.floor(remaining / 60); const seconds = remaining % 60; showToast(' Подождите ' + minutes + 'м ' + seconds + 'с', 'warning'); return; }
    const wheel = document.getElementById('wheel-new'); const spinBtn = document.getElementById('spin-btn');
    if (!wheel || !spinBtn) { showToast('❌ Элемент колеса не найден', 'error'); return; }
    wheelSpinning = true; spinBtn.disabled = true;
    const prizes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
    const chances = [25, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1, 0.5, 0.5];
    const totalChance = chances.reduce(function(sum, chance) { return sum + chance; }, 0);
    const randomValue = Math.random() * totalChance;
    let cumulative = 0; let wonIndex = 0;
    for (let i = 0; i < chances.length; i++) { cumulative += chances[i]; if (randomValue <= cumulative) { wonIndex = i; break; } }
    const segmentCount = prizes.length; const segmentAngle = 360 / segmentCount;
    const targetAngle = 360 - (wonIndex * segmentAngle) - (segmentAngle / 2);
    const fullRotations = 5 * 360; const finalRotation = fullRotations + targetAngle;
    wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform = 'rotate(' + finalRotation + 'deg)';
    setTimeout(async function() {
        try {
            const response = await fetch(API_URL + '/api/spin_wheel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            const wonPrize = Number(data.prize || 0);
            playerData.lastSpin = Number(data.last_spin || Math.floor(Date.now() / 1000));
            playerData.xp = Number(playerData.xp || 0) + wonPrize;
            if (wonPrize > 0) { showToast('🎉 Вы выиграли ' + wonPrize.toLocaleString() + ' XP!', 'success'); }
            else { showToast('😔 Ничего не выиграли. Попробуйте через час!', 'info'); }
            saveData(); await saveProgress(); updateUI(); updateProfile(); checkWheelTimer();
        } catch (error) { console.error('Ошибка вращения:', error); showToast('❌ ' + (error.message || 'Ошибка вращения'), 'error'); }
        finally { wheelSpinning = false; spinBtn.disabled = false; wheel.style.transition = 'none'; wheel.style.transform = 'rotate(' + targetAngle + 'deg)'; requestAnimationFrame(function() { wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'; }); }
    }, 4000);
}

function checkWheelTimer() {
    const timerEl = document.getElementById('wheel-timer'); if (!timerEl) return;
    const now = Date.now() / 1000; const timeSinceLastSpin = now - playerData.lastSpin;
    if (timeSinceLastSpin < 3600) { const remaining = Math.ceil(3600 - timeSinceLastSpin); const minutes = Math.floor(remaining / 60); const seconds = remaining % 60; timerEl.textContent = '⏳ Следующее вращение через: ' + minutes + 'м ' + seconds + 'с'; timerEl.style.display = 'block'; }
    else { timerEl.style.display = 'none'; }
}

function openGame(game) { switchScreen('game-' + game); if (game === 'mines') initMinesGrid(); if (game === 'ninja') initNinjaGrid(); if (game === 'tower') initTowerGrid(); if (game === 'double') initDoubleGrid(); if (game === 'roulette') initRouletteStrip(); }

async function startCrash() {
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('crash-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'crash'; currentMultiplier = 1.0;
    try {
        const response = await fetch(API_URL + '/api/crash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet }) });
        const data = await response.json();
        if (data.status === 'started') {
            crashPoint = data.crash_point;
            const display = document.getElementById('crash-multiplier'); const cashoutBtn = document.getElementById('crash-cashout'); const startBtn = document.getElementById('crash-start');
            if (display) { display.textContent = '1.00x'; display.style.color = '#FFD700'; }
            if (cashoutBtn) cashoutBtn.disabled = false; if (startBtn) startBtn.disabled = true;
            crashInterval = setInterval(function() { currentMultiplier += 0.01; if (display) display.textContent = currentMultiplier.toFixed(2) + 'x'; if (currentMultiplier >= crashPoint) { clearInterval(crashInterval); if (display) { display.textContent = '💥 CRASH @ ' + crashPoint.toFixed(2) + 'x'; display.style.color = '#ff4757'; } if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false; showToast('💥 Краш на ' + crashPoint.toFixed(2) + 'x!', 'error'); currentGame = null; loadData(); } }, 100);
        } else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function cashoutCrash() {
    const userId = getUserId(); if (!userId || currentGame !== 'crash') return; clearInterval(crashInterval);
    try {
        const response = await fetch(API_URL + '/api/crash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) });
        const data = await response.json();
        if (data.status === 'won') { showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success'); const display = document.getElementById('crash-multiplier'); const cashoutBtn = document.getElementById('crash-cashout'); const startBtn = document.getElementById('crash-start'); if (display) { display.textContent = '✅ WON @ ' + data.multiplier.toFixed(2) + 'x'; display.style.color = '#2ed573'; } if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false; currentGame = null; loadData(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function initMinesGrid() { const grid = document.getElementById('mines-grid'); if (!grid) return; grid.innerHTML = ''; for (let i = 0; i < 25; i++) { const cell = document.createElement('button'); cell.className = 'mine-cell'; cell.dataset.index = i; cell.textContent = '❓'; cell.onclick = function() { revealMine(i); }; grid.appendChild(cell); } }

async function startMines() {
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('mines-bet'); const minesSelect = document.getElementById('mines-count');
    const bet = parseInt(betInput.value); const minesCount = parseInt(minesSelect.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast(' Неверная ставка!', 'error'); return; }
    currentGame = 'mines'; minesState = { bet: bet, multiplier: 1.0, revealed: [] };
    try {
        const response = await fetch(API_URL + '/api/mines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet, mines: minesCount }) });
        const data = await response.json();
        if (data.status === 'started') { initMinesGrid(); const cashoutBtn = document.getElementById('mines-cashout'); const startBtn = document.getElementById('mines-start'); if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = false; } if (startBtn) startBtn.disabled = true; updateMinesInfo(); }
        else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function revealMine(index) {
    const userId = getUserId(); if (!userId || currentGame !== 'mines') return;
    const cell = document.querySelector('.mine-cell[data-index="' + index + '"]'); if (!cell || cell.classList.contains('revealed')) return;
    try {
        const response = await fetch(API_URL + '/api/mines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'reveal', cell: index }) });
        const data = await response.json();
        cell.classList.add('revealed');
        if (data.status === 'lost') { cell.classList.add('mine'); cell.textContent = '💣'; showToast('💥 Вы подорвались на мине!', 'error'); const cashoutBtn = document.getElementById('mines-cashout'); const startBtn = document.getElementById('mines-start'); if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = true; } if (startBtn) startBtn.disabled = false; currentGame = null; minesState = null; loadData(); }
        else if (data.status === 'safe') { cell.classList.add('safe'); cell.textContent = '💎'; minesState.multiplier = data.multiplier; updateMinesInfo(); const cashoutBtn = document.getElementById('mines-cashout'); if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать ' + data.win.toLocaleString() + ' XP'; cashoutBtn.disabled = false; } }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function updateMinesInfo() { if (!minesState) return; const multEl = document.getElementById('mines-multiplier'); const winEl = document.getElementById('mines-win'); if (multEl) multEl.textContent = minesState.multiplier.toFixed(2); if (winEl) winEl.textContent = Math.floor(minesState.bet * minesState.multiplier).toLocaleString(); }

async function cashoutMines() {
    const userId = getUserId(); if (!userId || currentGame !== 'mines') return;
    try {
        const response = await fetch(API_URL + '/api/mines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) });
        const data = await response.json();
        if (data.status === 'won') { showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success'); const cashoutBtn = document.getElementById('mines-cashout'); const startBtn = document.getElementById('mines-start'); if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = true; } if (startBtn) startBtn.disabled = false; currentGame = null; minesState = null; loadData(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

// ROULETTE
const ROULETTE_NUMBERS = [3, 6, 8, 11, 9, 1, 5, 4, 12, 0, 7, 2, 10];
const ROULETTE_COLORS = { 0: 'green', 1: 'red', 2: 'black', 3: 'red', 4: 'black', 5: 'red', 6: 'red', 7: 'black', 8: 'black', 9: 'black', 10: 'red', 11: 'red', 12: 'black' };
let rouletteSpinning = false;

function initRouletteStrip() {
    const strip = document.getElementById('roulette-strip'); if (!strip) return;
    strip.innerHTML = '';
    for (let r = 0; r < 5; r++) {
        ROULETTE_NUMBERS.forEach(function(num) {
            const item = document.createElement('div');
            item.className = 'roulette-strip-item ' + ROULETTE_COLORS[num];
            item.textContent = num;
            strip.appendChild(item);
        });
    }
    strip.style.transform = 'translateX(0)';
}

async function placeRouletteBet(betType) {
    if (rouletteSpinning) return;
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('roulette-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    rouletteSpinning = true;
    
    const resultNumber = Math.floor(Math.random() * 13);
    const resultColor = ROULETTE_COLORS[resultNumber];
    
    const strip = document.getElementById('roulette-strip');
    const itemWidth = 80;
    const totalItems = ROULETTE_NUMBERS.length * 5;
    const targetIndex = ROULETTE_NUMBERS.length * 3 + ROULETTE_NUMBERS.indexOf(resultNumber);
    const offset = -(targetIndex * itemWidth) + (strip.parentElement.offsetWidth / 2) - (itemWidth / 2);
    
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    setTimeout(function() {
        strip.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        strip.style.transform = 'translateX(' + offset + 'px)';
    }, 50);
    
    setTimeout(async function() {
        try {
            const response = await fetch(API_URL + '/api/roulette', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, bet: bet, color: betType, result_number: resultNumber }) });
            const data = await response.json();
            const numEl = document.getElementById('roulette-result-number');
            const textEl = document.getElementById('roulette-result-text');
            if (numEl) { numEl.textContent = resultNumber; numEl.style.color = resultColor === 'red' ? '#e74c3c' : resultColor === 'green' ? '#2ecc71' : '#2c3e50'; }
            if (data.status === 'won') {
                if (textEl) textEl.textContent = '✅ Выигрыш: ' + data.win.toLocaleString() + ' XP!';
                showToast('🎉 Вы выиграли ' + data.win.toLocaleString() + ' XP!', 'success');
            } else {
                if (textEl) textEl.textContent = '❌ Вы проиграли';
                showToast('❌ Вы проиграли', 'error');
            }
            loadData();
        } catch (error) { showToast('❌ Ошибка', 'error'); }
        finally { rouletteSpinning = false; }
    }, 3100);
}

// DOUBLE
const DOUBLE_COLORS = { 1: 'red', 2: 'black', 3: 'red', 4: 'red', 5: 'black', 6: 'red', 7: 'black', 8: 'black', 9: 'black', 10: 'red', 11: 'red', 12: 'black' };
let doubleSpinning = false; let selectedDoubleNumber = null;

function initDoubleGrid() {
    const grid = document.getElementById('double-grid'); if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
        const cell = document.createElement('button');
        cell.className = 'double-cell ' + DOUBLE_COLORS[i];
        cell.textContent = i;
        cell.dataset.number = i;
        cell.onclick = function() { selectDoubleNumber(i); };
        grid.appendChild(cell);
    }
}

function selectDoubleNumber(num) {
    selectedDoubleNumber = num;
    document.querySelectorAll('.double-cell').forEach(function(c) { c.classList.remove('selected'); });
    document.querySelector('.double-cell[data-number="' + num + '"]').classList.add('selected');
}

async function playDoubleRandom() {
    if (doubleSpinning) return;
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('double-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast(' Неверная ставка!', 'error'); return; }
    if (!selectedDoubleNumber) { showToast(' Выбери число!', 'error'); return; }
    doubleSpinning = true;
    
    const resultNumber = Math.floor(Math.random() * 12) + 1;
    const numEl = document.getElementById('double-result-number');
    const textEl = document.getElementById('double-result-text');
    
    let count = 0;
    const animInterval = setInterval(function() {
        const randomNum = Math.floor(Math.random() * 12) + 1;
        if (numEl) { numEl.textContent = randomNum; numEl.style.color = DOUBLE_COLORS[randomNum] === 'red' ? '#e74c3c' : '#2c3e50'; }
        count++;
        if (count > 20) {
            clearInterval(animInterval);
            if (numEl) { numEl.textContent = resultNumber; numEl.style.color = DOUBLE_COLORS[resultNumber] === 'red' ? '#e74c3c' : '#2c3e50'; }
            
            fetch(API_URL + '/api/double', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, bet: bet, choice: selectedDoubleNumber, result: resultNumber }) })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.status === 'won') {
                    if (textEl) textEl.textContent = '✅ Выигрыш: ' + data.win.toLocaleString() + ' XP!';
                    showToast('🎉 Вы выиграли ' + data.win.toLocaleString() + ' XP!', 'success');
                } else {
                    if (textEl) textEl.textContent = '❌ Вы проиграли';
                    showToast('❌ Вы проиграли', 'error');
                }
                loadData();
            })
            .catch(function() { showToast('❌ Ошибка', 'error'); })
            .finally(function() { doubleSpinning = false; });
        }
    }, 100);
}

// NINJA
function initNinjaGrid() { const grid = document.getElementById('ninja-grid'); if (!grid) return; grid.innerHTML = ''; for (let i = 0; i < 5; i++) { const cell = document.createElement('button'); cell.className = 'ninja-cell'; cell.dataset.index = i; cell.textContent = '❓'; cell.onclick = function() { pickNinja(i); }; grid.appendChild(cell); } }

async function startNinja() {
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('ninja-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'ninja'; ninjaState = { bet: bet, multiplier: 1.0, rounds: 0 };
    try {
        const response = await fetch(API_URL + '/api/ninja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet }) });
        const data = await response.json();
        if (data.status === 'started') { initNinjaGrid(); const cashoutBtn = document.getElementById('ninja-cashout'); const startBtn = document.getElementById('ninja-start'); if (cashoutBtn) cashoutBtn.disabled = false; if (startBtn) startBtn.disabled = true; updateNinjaInfo(); }
        else { showToast(' ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function pickNinja(index) {
    const userId = getUserId(); if (!userId || currentGame !== 'ninja') return;
    const cell = document.querySelector('.ninja-cell[data-index="' + index + '"]'); if (!cell || cell.classList.contains('revealed')) return;
    try {
        const response = await fetch(API_URL + '/api/ninja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'pick', pick: index }) });
        const data = await response.json();
        cell.classList.add('revealed');
        if (data.status === 'hit') { cell.classList.add('hit'); cell.textContent = '🥷'; showToast('💥 Вы попали на ниндзя!', 'error'); const cashoutBtn = document.getElementById('ninja-cashout'); const startBtn = document.getElementById('ninja-start'); if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false; currentGame = null; ninjaState = null; loadData(); }
        else if (data.status === 'safe') { cell.classList.add('safe'); cell.textContent = '✅'; ninjaState.multiplier = data.multiplier; ninjaState.rounds = data.rounds; updateNinjaInfo(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function updateNinjaInfo() { if (!ninjaState) return; const multEl = document.getElementById('ninja-multiplier'); const roundsEl = document.getElementById('ninja-rounds'); const winEl = document.getElementById('ninja-win'); if (multEl) multEl.textContent = ninjaState.multiplier.toFixed(2) + 'x'; if (roundsEl) roundsEl.textContent = '🎯 Раунд: ' + ninjaState.rounds; if (winEl) winEl.textContent = '💰 Выигрыш: ' + Math.floor(ninjaState.bet * ninjaState.multiplier).toLocaleString() + ' XP'; }

async function cashoutNinja() {
    const userId = getUserId(); if (!userId || currentGame !== 'ninja') return;
    try {
        const response = await fetch(API_URL + '/api/ninja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) });
        const data = await response.json();
        if (data.status === 'won') { showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success'); const cashoutBtn = document.getElementById('ninja-cashout'); const startBtn = document.getElementById('ninja-start'); if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false; currentGame = null; ninjaState = null; loadData(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

// TOWER
const TOWER_MULTIPLIERS = [1.5, 2.5, 4.16, 6.94, 11.57, 19.29, 32.15, 53.58, 89.3, 148.84];
const TOWER_BOMBS_PER_FLOOR = 2;
const TOWER_COLS = 5;

function initTowerGrid() {
    const grid = document.getElementById('tower-grid-new'); if (!grid) return;
    grid.innerHTML = '';
    for (let floor = 9; floor >= 0; floor--) {
        const label = document.createElement('div');
        label.className = 'tower-floor-label';
        label.innerHTML = '<span class="mult">x' + TOWER_MULTIPLIERS[floor] + '</span><span>' + (floor + 1) + ' Floor</span>';
        grid.appendChild(label);
        for (let col = 0; col < TOWER_COLS; col++) {
            const cell = document.createElement('button');
            cell.className = 'tower-cell-new';
            cell.dataset.floor = floor;
            cell.dataset.col = col;
            cell.disabled = true;
            cell.onclick = function() { pickTowerCell(floor, col); };
            grid.appendChild(cell);
        }
    }
}

async function startTower() {
    const userId = getUserId(); if (!userId) return;
    const betInput = document.getElementById('tower-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'tower'; towerState = { bet: bet, currentFloor: 0, bombs: [] };
    try {
        const response = await fetch(API_URL + '/api/tower', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet }) });
        const data = await response.json();
        if (data.status === 'started') {
            initTowerGrid();
            towerState.bombs = data.bombs || [];
            enableFloorCells(0);
            const cashoutBtn = document.getElementById('tower-cashout'); const startBtn = document.getElementById('tower-start');
            if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = true;
        } else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function enableFloorCells(floor) {
    document.querySelectorAll('.tower-cell-new[data-floor="' + floor + '"]').forEach(function(cell) { cell.disabled = false; cell.classList.add('current'); });
}

async function pickTowerCell(floor, col) {
    const userId = getUserId(); if (!userId || currentGame !== 'tower') return;
    const cell = document.querySelector('.tower-cell-new[data-floor="' + floor + '"][data-col="' + col + '"]');
    if (!cell || cell.disabled) return;
    try {
        const response = await fetch(API_URL + '/api/tower', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'pick', floor: floor, col: col }) });
        const data = await response.json();
        if (data.status === 'bomb') {
            cell.classList.add('bomb'); cell.classList.remove('current');
            showToast('💥 Бомба! Вы проиграли!', 'error');
            document.querySelectorAll('.tower-cell-new').forEach(function(c) { c.disabled = true; });
            const cashoutBtn = document.getElementById('tower-cashout'); const startBtn = document.getElementById('tower-start');
            if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false;
            currentGame = null; towerState = null; loadData();
        } else if (data.status === 'safe') {
            cell.classList.add('safe'); cell.classList.remove('current');
            towerState.currentFloor = floor + 1;
            if (towerState.currentFloor < 10) { enableFloorCells(towerState.currentFloor); }
            else {
                document.querySelectorAll('.tower-cell-new').forEach(function(c) { c.disabled = true; });
                const cashoutBtn = document.getElementById('tower-cashout');
                if (cashoutBtn) cashoutBtn.disabled = false;
            }
        }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function cashoutTower() {
    const userId = getUserId(); if (!userId || currentGame !== 'tower') return;
    try {
        const response = await fetch(API_URL + '/api/tower', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout', floor: towerState.currentFloor }) });
        const data = await response.json();
        if (data.status === 'won') { showToast('✅ Вы забрали ' + data.win.toLocaleString() + ' XP!', 'success'); const cashoutBtn = document.getElementById('tower-cashout'); const startBtn = document.getElementById('tower-start'); if (cashoutBtn) cashoutBtn.disabled = true; if (startBtn) startBtn.disabled = false; currentGame = null; towerState = null; loadData(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function showAdminPanel() { if (!playerData.isAdmin) { showToast('❌ Нет доступа!', 'error'); return; } switchScreen('admin'); loadAdminStats(); }
function backToProfile() { switchScreen('profile'); }

async function loadAdminStats() {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(API_URL + '/api/admin_stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId }) });
        const data = await response.json();
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
            const maintText = document.getElementById('maintenance-text'); const maintBtn = document.getElementById('maintenance-btn');
            if (maintText) { maintText.textContent = data.maintenance ? 'Закрыто' : 'Открыто'; maintText.className = data.maintenance ? 'closed' : ''; }
            if (maintBtn) maintBtn.textContent = data.maintenance ? '🔓 Открыть доступ' : '🔒 Закрыть доступ';
            const topList = document.getElementById('admin-top-users');
            if (topList && data.top_users && data.top_users.length > 0) {
                topList.innerHTML = '';
                data.top_users.forEach(function(user, index) {
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                    const div = document.createElement('div'); div.className = 'top-item';
                    div.innerHTML = '<div class="top-rank ' + rankClass + '">' + (index + 1) + '</div><div class="top-name">' + (user.name || user.username || 'User') + '</div><div class="top-value">' + user.xp.toLocaleString() + ' XP</div>';
                    topList.appendChild(div);
                });
            }
        }
    } catch (error) { showToast('❌ Ошибка загрузки статистики', 'error'); }
}

async function toggleMaintenance() {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'toggle_maintenance' }) });
        const data = await response.json();
        if (data.status === 'maintenance_toggled') { showToast(data.maintenance ? '🔒 Доступ закрыт' : '🔓 Доступ открыт', 'success'); loadAdminStats(); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function adminResetWheel() {
    const userId = getUserId();
    const targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; }
    if (!confirm('🎡 Сбросить таймер колеса для пользователя ' + targetId + '?')) return;
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'reset_wheel', target_id: parseInt(targetId) }) });
        const data = await response.json();
        if (data.status === 'wheel_reset') showToast('✅ Колесо сброшено для ' + targetId, 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function adminGiveXP() {
    const userId = getUserId(); const targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; }
    const amount = prompt('💰 Введите количество XP для выдачи:');
    if (!amount || isNaN(amount) || amount <= 0) { showToast('❌ Неверное количество', 'error'); return; }
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'add_xp', target_id: parseInt(targetId), amount: parseInt(amount) }) });
        const data = await response.json();
        if (data.status === 'xp_added') { showToast('✅ Выдано ' + amount + ' XP пользователю ' + targetId, 'success'); setTimeout(function() { loadData(); }, 500); }
        else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function adminRemoveXP() {
    const userId = getUserId(); const targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; }
    const amount = prompt('➖ Введите количество XP для изъятия:');
    if (!amount || isNaN(amount) || amount <= 0) { showToast('❌ Неверное количество', 'error'); return; }
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'remove_xp', target_id: parseInt(targetId), amount: parseInt(amount) }) });
        const data = await response.json();
        if (data.status === 'xp_removed') { showToast('✅ Изъято ' + amount + ' XP у пользователя ' + targetId, 'success'); setTimeout(function() { loadData(); }, 500); }
        else { showToast('❌ ' + (data.error || 'Ошибка'), 'error'); }
    } catch (error) { showToast(' Ошибка', 'error'); }
}

async function adminBanUser() {
    const userId = getUserId(); const targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; }
    if (!confirm(' Забанить пользователя ' + targetId + '?')) return;
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'ban', target_id: parseInt(targetId) }) });
        const data = await response.json();
        if (data.status === 'banned') showToast('✅ Пользователь ' + targetId + ' забанен', 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function adminUnbanUser() {
    const userId = getUserId(); const targetId = document.getElementById('admin-user-id').value;
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; }
    if (!confirm('✅ Разбанить пользователя ' + targetId + '?')) return;
    try {
        const response = await fetch(API_URL + '/api/admin_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'unban', target_id: parseInt(targetId) }) });
        const data = await response.json();
        if (data.status === 'unbanned') showToast('✅ Пользователь ' + targetId + ' разбанен', 'success');
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error');
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

document.getElementById('bear').addEventListener('click', function(e) {
    if (playerData.isBanned) { showToast('⛔ Вы заблокированы!', 'error'); return; }
    if (playerData.energy < playerData.clickPower) { showToast('️ Недостаточно энергии!', 'warning'); if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error'); return; }
    playerData.xp += playerData.clickPower; playerData.totalClicks++; playerData.energy -= playerData.clickPower;
    const newLevel = Math.floor(playerData.totalClicks / 1000) + 1;
    if (newLevel > playerData.level) { playerData.level = newLevel; showToast('🎉 Новый уровень: ' + playerData.level + '!', 'success'); if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); }
    else { if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); }
    showClickEffect(e); updateUI(); updateProfile(); saveData(); lastActivity = Date.now();
});

function showClickEffect(e) {
    const effect = document.createElement('div'); effect.className = 'click-effect'; effect.textContent = '+' + playerData.clickPower;
    const rect = e.target.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    effect.style.left = x + 'px'; effect.style.top = y + 'px';
    const bearEl = document.getElementById('bear'); if (bearEl) bearEl.appendChild(effect);
    setTimeout(function() { effect.remove(); }, 1000);
}

function switchScreen(screen) {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    const navBtn = document.querySelector('.nav-btn[data-screen="' + screen + '"]'); if (navBtn) navBtn.classList.add('active');
    const targetScreen = document.getElementById('screen-' + screen); if (targetScreen) targetScreen.classList.add('active');
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    if (screen === 'profile') updateProfile(); if (screen === 'shop') renderShop(); if (screen === 'wheel') checkWheelTimer();
    lastActivity = Date.now();
}

document.querySelectorAll('.nav-btn').forEach(function(btn) { btn.addEventListener('click', function() { switchScreen(this.dataset.screen); }); });
document.querySelectorAll('.shop-tab').forEach(function(tab) { tab.addEventListener('click', function() { document.querySelectorAll('.shop-tab').forEach(function(t) { t.classList.remove('active'); }); this.classList.add('active'); currentShopCategory = this.dataset.category; renderShop(); }); });

function showToast(text, type) {
    type = type || 'info';
    const toast = document.createElement('div'); toast.className = 'toast ' + type; toast.textContent = text;
    document.body.appendChild(toast); toasts.push(toast); updateToastPositions();
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(-20px)'; setTimeout(function() { toast.remove(); toasts = toasts.filter(function(t) { return t !== toast; }); updateToastPositions(); }, 300); }, 2500);
}

function updateToastPositions() { const gap = 10; toasts.forEach(function(toast, index) { const offset = index * (60 + gap); toast.style.top = (20 + offset) + 'px'; }); }

setInterval(function() { if (playerData.energy < playerData.maxEnergy) { const regenAmount = playerData.energyRegen || 1; playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + regenAmount); updateUI(); saveData(); } }, 1000);
setInterval(function() { saveProgress(); }, 10000);
setInterval(function() { checkWheelTimer(); }, 1000);

loadData();
showToast('🐻 Тапай и зарабатывай XP!', 'success');
