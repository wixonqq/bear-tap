const tg = window.Telegram.WebApp; tg.expand(); tg.ready();
const API_URL = 'https://botandreybot-andrey5453.amvera.io';
const ADMIN_ID = 7650149888;

let playerData = { xp: 0, totalClicks: 0, energy: 1000, maxEnergy: 1000, clickPower: 1, level: 1, wins: 0, referrals: 0, achievements: [], username: '', firstName: '', lastSave: Date.now(), lastSpin: 0, isAdmin: false, skin: 'default', energyRegen: 1, isBanned: false };
let lastSavedXp = 0; let apiWorking = false; let toasts = []; let wheelSpinning = false;
let currentGame = null; let crashInterval = null; let currentMultiplier = 1.0; let crashPoint = 0;
let minesState = null; let ninjaState = null;
let purchasedItems = [];
let currentShopCategory = 'upgrades';

function getUserId() {
    if (tg.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id;
    try { const urlParams = new URLSearchParams(window.location.search); const urlUserId = urlParams.get('user_id'); if (urlUserId) return parseInt(urlUserId); } catch (e) {}
    return null;
}

function applySkin(skinName) {
    const bear = document.getElementById('bear-character');
    if (!bear) return;
    bear.classList.remove('skin-gold', 'skin-diamond', 'skin-rainbow');
    if (skinName && skinName !== 'default') {
        bear.classList.add('skin-' + skinName);
    }
}

async function loadPurchases() {
    const userId = getUserId();
    if (!userId) return;
    try {
        const response = await fetch(`${API_URL}/api/purchases?user_id=${userId}`);
        if (response.ok) {
            const data = await response.json();
            purchasedItems = data.purchases || [];
            if (data.current_skin) {
                playerData.skin = data.current_skin;
                applySkin(playerData.skin);
            }
        }
    } catch (error) { console.error('Load purchases error:', error); }
}

async function loadData() {
    const userId = getUserId();
    if (!userId) { showToast('Ошибка: не получен ID', 'error'); loadLocalData(); return; }
    
    const isAdmin = userId === ADMIN_ID;
    
    try {
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`);
        if (!response.ok) {
            console.error('API Error:', response.status, await response.text());
            throw new Error('HTTP ' + response.status);
        }
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
        
        const adminBtn = document.getElementById('admin-btn'); 
        if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
    } catch (error) { 
        console.error('Load data error:', error);
        showToast('Не удалось загрузить данные: ' + error.message, 'error'); 
        loadLocalData(); 
    }
}
function loadLocalData() {
    const saved = localStorage.getItem('bearTapData');
    if (saved) { playerData = JSON.parse(saved); const timePassed = (Date.now() - playerData.lastSave) / 1000; playerData.energy = Math.min(playerData.maxEnergy || 1000, (playerData.energy || 1000) + Math.floor(timePassed / 2) * (playerData.energyRegen || 1)); }
    if (tg.initDataUnsafe?.user) { playerData.username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || 'Игрок'; playerData.firstName = tg.initDataUnsafe.user.first_name || 'Игрок'; playerData.isAdmin = tg.initDataUnsafe.user.id === ADMIN_ID; }
    updateUI(); updateProfile(); renderShop(); checkWheelTimer();
    const adminBtn = document.getElementById('admin-btn'); if (adminBtn && playerData.isAdmin) adminBtn.style.display = 'block';
}

function saveData() { playerData.lastSave = Date.now(); localStorage.setItem('bearTapData', JSON.stringify(playerData)); }

async function saveProgress() {
    if (!apiWorking) return; const userId = getUserId(); if (!userId) return;
    try { await fetch(`${API_URL}/api/save_progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, xp: playerData.xp, clicks: playerData.totalClicks, energy: Math.floor(playerData.energy) }) }); lastSavedXp = playerData.xp; } catch (error) { console.error('Save error:', error); }
}

function updateUI() {
    const xpBalance = document.getElementById('xp-balance'); const xpPerTap = document.getElementById('xp-per-tap');
    const energyCurrent = document.getElementById('energy-current'); const energyMax = document.getElementById('energy-max'); const energyFill = document.getElementById('energy-fill');
    if (xpBalance) xpBalance.textContent = playerData.xp.toLocaleString();
    if (xpPerTap) xpPerTap.textContent = playerData.clickPower;
    if (energyCurrent) energyCurrent.textContent = Math.floor(playerData.energy);
    if (energyMax) energyMax.textContent = playerData.maxEnergy;
    if (energyFill) { const energyPercent = (playerData.energy / playerData.maxEnergy) * 100; energyFill.style.width = energyPercent + '%'; }
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
        const response = await fetch(`${API_URL}/api/user_data?user_id=${userId}`); if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const topXpList = document.getElementById('top-xp-list');
        if (topXpList) { if (data.top_xp && data.top_xp.length > 0) renderTopList(topXpList, data.top_xp, 'XP'); else topXpList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>'; }
        const topWinsList = document.getElementById('top-wins-list');
        if (topWinsList) { if (data.top_wins && data.top_wins.length > 0) renderTopList(topWinsList, data.top_wins, 'побед'); else topWinsList.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>'; }
    } catch (error) { const topXpList = document.getElementById('top-xp-list'); const topWinsList = document.getElementById('top-wins-list'); if (topXpList) topXpList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>'; if (topWinsList) topWinsList.innerHTML = '<div class="empty-state">❌ Ошибка загрузки</div>'; }
}

function renderTopList(container, data, suffix) {
    container.innerHTML = ''; data.forEach((item, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const div = document.createElement('div'); div.className = 'top-item';
        div.innerHTML = `<div class="top-rank ${rankClass}">${index + 1}</div><div class="top-name">${item.name}</div><div class="top-value">${item.value || item.xp} ${suffix}</div>`;
        container.appendChild(div);
    });
}

function setupReferralLink() {
    const userId = getUserId(); const botUsername = 'sporttcm_bot'; if (!userId) return;
    const referralLink = `https://t.me/${botUsername}?start=${userId}`;
    const referralBtn = document.getElementById('referral-btn');
    if (referralBtn) { referralBtn.onclick = function() { navigator.clipboard.writeText(referralLink).then(() => { showToast('✅ Ссылка скопирована!', 'success'); if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); }).catch(() => { showToast('❌ Ошибка копирования', 'error'); }); }; }
}

function renderShop() {
    const shopList = document.getElementById('shop-list'); const shopBalance = document.getElementById('shop-balance');
    if (!shopList) return; if (shopBalance) shopBalance.textContent = playerData.xp.toLocaleString();
    shopList.innerHTML = '';
    
    let items = [];
    if (currentShopCategory === 'upgrades') {
        items = [
            {id: 'click_power_2', name: '⚡ Сила клика x2', price: 250000, desc: 'Тапай в 2 раза эффективнее'},
            {id: 'click_power_5', name: '⚡⚡ Сила клика x5', price: 1000000, desc: 'Тапай в 5 раз эффективнее'},
            {id: 'click_power_10', name: '⚡⚡ Сила клика x10', price: 5000000, desc: 'Тапай в 10 раз эффективнее'},
            {id: 'max_energy_2000', name: '🔋 Энергия 2000', price: 500000, desc: 'Больше энергии для тапов'},
            {id: 'max_energy_5000', name: '🔋🔋 Энергия 5000', price: 2000000, desc: 'Огромный запас энергии'},
            {id: 'energy_regen_2', name: '⚡ Реген x2', price: 750000, desc: 'Энергия восстанавливается быстрее'},
            {id: 'energy_regen_5', name: '⚡ Реген x5', price: 3000000, desc: 'Супер быстрая регенерация'}
        ];
    } else {
        items = [
            {id: 'skin_gold', name: '🌟 Золотой мишка', price: 1000000, desc: 'Золотой скин для мишки'},
            {id: 'skin_diamond', name: ' Алмазный мишка', price: 5000000, desc: 'Алмазный скин для мишки'},
            {id: 'skin_rainbow', name: '🌈 Радужный мишка', price: 10000000, desc: 'Радужный скин для мишки'}
        ];
    }
    
    items.forEach(item => {
        const div = document.createElement('div'); div.className = 'shop-item';
        const isPurchased = purchasedItems.includes(item.id);
        const canAfford = playerData.xp >= item.price;
        
        let btnText, btnClass, btnAction;
        if (isPurchased && item.id.startsWith('skin_')) {
            const skinName = item.id.replace('skin_', '');
            if (playerData.skin === skinName) {
                btnText = '✅ Надето'; btnClass = 'equipped'; btnAction = null;
            } else {
                btnText = '👕 Надеть'; btnClass = 'purchased'; btnAction = () => equipSkin(skinName);
            }
        } else if (isPurchased) {
            btnText = '✅ Куплено'; btnClass = 'purchased'; btnAction = null;
        } else if (canAfford) {
            btnText = '🛒 Купить'; btnClass = ''; btnAction = () => buyItem(item.id);
        } else {
            btnText = '❌ Мало XP'; btnClass = 'disabled'; btnAction = null;
        }
        
        div.innerHTML = `<div class="shop-item-info"><div class="shop-item-name">${item.name}</div><div class="shop-item-desc">${item.desc}</div><div class="shop-item-price"> ${item.price.toLocaleString()} XP</div></div><button class="shop-buy-btn ${btnClass}">${btnText}</button>`;
        if (btnAction) div.querySelector('.shop-buy-btn').onclick = btnAction;
        shopList.appendChild(div);
    });
}

async function buyItem(itemId) {
    const userId = getUserId(); if (!userId) return;
    const items = {
        'click_power_2': {price: 250000, name: '⚡ Сила клика x2'},
        'click_power_5': {price: 1000000, name: '⚡ Сила клика x5'},
        'click_power_10': {price: 5000000, name: '⚡⚡ Сила клика x10'},
        'max_energy_2000': {price: 500000, name: '🔋 Энергия 2000'},
        'max_energy_5000': {price: 2000000, name: '🔋 Энергия 5000'},
        'energy_regen_2': {price: 750000, name: '⚡ Реген x2'},
        'energy_regen_5': {price: 3000000, name: '⚡⚡ Реген x5'},
        'skin_gold': {price: 1000000, name: '🌟 Золотой мишка'},
        'skin_diamond': {price: 5000000, name: '💎 Алмазный мишка'},
        'skin_rainbow': {price: 10000000, name: '🌈 Радужный мишка'}
    };
    const item = items[itemId];
    if (!item || playerData.xp < item.price) { showToast('❌ Недостаточно XP!', 'error'); return; }
    try { 
        const response = await fetch(`${API_URL}/api/buy_item`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ user_id: userId, item: itemId }) 
        }); 
        const data = await response.json(); 
        if (data.status === 'success') { 
            showToast(`✅ ${item.name} куплен!`, 'success'); 
            if (itemId.startsWith('skin_')) {
                const skinName = itemId.replace('skin_', '');
                applySkin(skinName);
            }
            await loadPurchases();
            await loadData(); 
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
        }
    } catch (error) { 
        showToast('❌ Ошибка покупки', 'error'); 
    }
}

async function equipSkin(skinName) {
    const userId = getUserId(); if (!userId) return;
    try {
        const response = await fetch(`${API_URL}/api/equip_skin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, skin: skinName })
        });
        const data = await response.json();
        if (data.status === 'equipped') {
            applySkin(skinName);
            playerData.skin = skinName;
            showToast(`✅ Скин "${skinName}" надет!`, 'success');
            renderShop();
        } else {
            showToast(' ' + (data.error || 'Ошибка'), 'error');
        }
    } catch (error) {
        showToast('❌ Ошибка', 'error');
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
        showToast(`⏳ Подождите ${minutes}м ${seconds}с`, 'error'); 
        return; 
    }
    
    wheelSpinning = true; 
    const wheel = document.getElementById('wheel'); 
    const spinBtn = document.getElementById('spin-btn'); 
    spinBtn.disabled = true;
    
    const prizes = [100, 500, 1000, 5000, 10000, 20000, 30000, 0, 35000, 40000, 45000, 50000];
    const chances = [30, 25, 20, 10, 5, 3, 1, 21, 2, 1, 1, 1];
    const totalChance = chances.reduce((a, b) => a + b, 0);
    const rand = Math.floor(Math.random() * totalChance) + 1;
    let cumulative = 0;
    let wonIndex = 0;
    
    for (let i = 0; i < chances.length; i++) { 
        cumulative += chances[i]; 
        if (rand <= cumulative) { wonIndex = i; break; } 
    }
    
    const segmentAngle = 360 / 12;
    const targetAngle = 360 - (wonIndex * segmentAngle) - (segmentAngle / 2);
    const fullRotations = 5 * 360;
    const finalRotation = fullRotations + targetAngle;
    
    wheel.style.transform = `rotate(${finalRotation}deg)`;
    
    setTimeout(async () => {
        try { 
            const response = await fetch(`${API_URL}/api/spin_wheel`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ user_id: userId }) 
            }); 
            const data = await response.json(); 
            
            if (data.prize !== undefined) { 
                playerData.lastSpin = data.last_spin; 
                playerData.xp += data.prize; 
                
                if (data.prize > 0) {
                    showToast(`🎉 Вы выиграли ${data.prize} XP!`, 'success'); 
                } else {
                    showToast('😔 Ничего не выиграли. Попробуйте через час!', 'error'); 
                }
                
                updateUI(); 
                updateProfile(); 
                checkWheelTimer(); 
            } else {
                showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
            }
        } catch (error) { 
            showToast('❌ Ошибка', 'error'); 
        }
        
        wheelSpinning = false; 
        spinBtn.disabled = false; 
        wheel.style.transition = 'none'; 
        wheel.style.transform = `rotate(${targetAngle}deg)`; 
        
        setTimeout(() => { 
            wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'; 
        }, 50);
    }, 4000);
}

function checkWheelTimer() {
    const timerEl = document.getElementById('wheel-timer'); if (!timerEl) return;
    const now = Date.now() / 1000; const timeSinceLastSpin = now - playerData.lastSpin;
    if (timeSinceLastSpin < 3600) { const remaining = Math.ceil(3600 - timeSinceLastSpin); const minutes = Math.floor(remaining / 60); const seconds = remaining % 60; timerEl.textContent = `⏳ Следующее вращение через: ${minutes}м ${seconds}с`; timerEl.style.display = 'block'; } else timerEl.style.display = 'none';
}

function openGame(game) { 
    switchScreen(`game-${game}`); 
    if (game === 'mines') initMinesGrid(); 
    if (game === 'ninja') initNinjaGrid(); 
}

async function startCrash() {
    const userId = getUserId(); if (!userId) return; const betInput = document.getElementById('crash-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'crash'; currentMultiplier = 1.0;
    try { 
        const response = await fetch(`${API_URL}/api/crash`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet }) }); 
        const data = await response.json(); 
        if (data.status === 'started') { 
            crashPoint = data.crash_point; 
            const display = document.getElementById('crash-multiplier'); 
            const cashoutBtn = document.getElementById('crash-cashout'); 
            const startBtn = document.getElementById('crash-start'); 
            if (display) { display.textContent = '1.00x'; display.style.color = '#FFD700'; } 
            if (cashoutBtn) cashoutBtn.disabled = false; 
            if (startBtn) startBtn.disabled = true; 
            crashInterval = setInterval(() => { 
                currentMultiplier += 0.01; 
                if (display) display.textContent = currentMultiplier.toFixed(2) + 'x'; 
                if (currentMultiplier >= crashPoint) { 
                    clearInterval(crashInterval); 
                    if (display) { display.textContent = `💥 CRASH @ ${crashPoint.toFixed(2)}x`; display.style.color = '#ff4757'; } 
                    if (cashoutBtn) cashoutBtn.disabled = true; 
                    if (startBtn) startBtn.disabled = false; 
                    showToast(`💥 Краш на ${crashPoint.toFixed(2)}x!`, 'error'); 
                    currentGame = null; 
                    loadData(); 
                } 
            }, 100); 
        } else showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function cashoutCrash() {
    const userId = getUserId(); if (!userId || currentGame !== 'crash') return; clearInterval(crashInterval);
    try { 
        const response = await fetch(`${API_URL}/api/crash`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) }); 
        const data = await response.json(); 
        if (data.status === 'won') { 
            showToast(`✅ Вы забрали ${data.win} XP!`, 'success'); 
            const display = document.getElementById('crash-multiplier'); 
            const cashoutBtn = document.getElementById('crash-cashout'); 
            const startBtn = document.getElementById('crash-start'); 
            if (display) { display.textContent = `✅ WON @ ${data.multiplier.toFixed(2)}x`; display.style.color = '#2ed573'; } 
            if (cashoutBtn) cashoutBtn.disabled = true; 
            if (startBtn) startBtn.disabled = false; 
            currentGame = null; 
            loadData(); 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function initMinesGrid() { const grid = document.getElementById('mines-grid'); if (!grid) return; grid.innerHTML = ''; for (let i = 0; i < 25; i++) { const cell = document.createElement('button'); cell.className = 'mine-cell'; cell.dataset.index = i; cell.textContent = '❓'; cell.onclick = () => revealMine(i); grid.appendChild(cell); } }

async function startMines() {
    const userId = getUserId(); if (!userId) return; const betInput = document.getElementById('mines-bet'); const minesSelect = document.getElementById('mines-count'); const bet = parseInt(betInput.value); const minesCount = parseInt(minesSelect.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'mines'; minesState = { bet: bet, multiplier: 1.0, revealed: [] };
    try { 
        const response = await fetch(`${API_URL}/api/mines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet, mines: minesCount }) }); 
        const data = await response.json(); 
        if (data.status === 'started') { 
            initMinesGrid(); 
            const cashoutBtn = document.getElementById('mines-cashout'); 
            const startBtn = document.getElementById('mines-start'); 
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = false; } 
            if (startBtn) startBtn.disabled = true; 
            updateMinesInfo(); 
        } else showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function revealMine(index) {
    const userId = getUserId(); if (!userId || currentGame !== 'mines') return; const cell = document.querySelector(`.mine-cell[data-index="${index}"]`); if (!cell || cell.classList.contains('revealed')) return;
    try { 
        const response = await fetch(`${API_URL}/api/mines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'reveal', cell: index }) }); 
        const data = await response.json(); 
        cell.classList.add('revealed'); 
        if (data.status === 'lost') { 
            cell.classList.add('mine'); cell.textContent = '💣'; 
            showToast(' Вы подорвались на мине!', 'error'); 
            const cashoutBtn = document.getElementById('mines-cashout'); 
            const startBtn = document.getElementById('mines-start'); 
            if (cashoutBtn) { cashoutBtn.textContent = ' Забрать'; cashoutBtn.disabled = true; } 
            if (startBtn) startBtn.disabled = false; 
            currentGame = null; minesState = null; loadData(); 
        } else if (data.status === 'safe') { 
            cell.classList.add('safe'); cell.textContent = '💎'; 
            minesState.multiplier = data.multiplier; 
            updateMinesInfo(); 
            const cashoutBtn = document.getElementById('mines-cashout'); 
            if (cashoutBtn) { cashoutBtn.textContent = `💰 Забрать ${data.win} XP`; cashoutBtn.disabled = false; } 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function updateMinesInfo() { if (!minesState) return; const multEl = document.getElementById('mines-multiplier'); const winEl = document.getElementById('mines-win'); if (multEl) multEl.textContent = minesState.multiplier.toFixed(2); if (winEl) winEl.textContent = Math.floor(minesState.bet * minesState.multiplier); }

async function cashoutMines() {
    const userId = getUserId(); if (!userId || currentGame !== 'mines') return;
    try { 
        const response = await fetch(`${API_URL}/api/mines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) }); 
        const data = await response.json(); 
        if (data.status === 'won') { 
            showToast(`✅ Вы забрали ${data.win} XP!`, 'success'); 
            const cashoutBtn = document.getElementById('mines-cashout'); 
            const startBtn = document.getElementById('mines-start'); 
            if (cashoutBtn) { cashoutBtn.textContent = '💰 Забрать'; cashoutBtn.disabled = true; } 
            if (startBtn) startBtn.disabled = false; 
            currentGame = null; minesState = null; loadData(); 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function spinRoulette(color) {
    const userId = getUserId(); if (!userId) return; const betInput = document.getElementById('roulette-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    try { 
        const response = await fetch(`${API_URL}/api/roulette`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, bet: bet, color: color }) }); 
        const data = await response.json(); 
        const resultEl = document.getElementById('roulette-result'); 
        if (resultEl) { 
            const colorEmojis = {red: '🔴', black: '⚫', green: ''}; 
            const colorNames = {red: 'Красное', black: 'Чёрное', green: 'Зелёное'}; 
            resultEl.textContent = `Выпало: ${colorEmojis[data.result]} ${colorNames[data.result]}`; 
            if (data.status === 'won') { 
                resultEl.textContent += ` | Выигрыш: ${data.win} XP! 🎉`; 
                resultEl.style.color = '#2ed573'; 
                showToast(`✅ Вы выиграли ${data.win} XP!`, 'success'); 
            } else { 
                resultEl.textContent += ' | Вы проиграли 😔'; 
                resultEl.style.color = '#ff4757'; 
                showToast('❌ Вы проиграли', 'error'); 
            } 
        } 
        loadData(); 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function playDouble(choice) {
    const userId = getUserId(); if (!userId) return; const betInput = document.getElementById('double-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    try { 
        const response = await fetch(`${API_URL}/api/double`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, bet: bet, choice: choice }) }); 
        const data = await response.json(); 
        const resultEl = document.getElementById('double-result'); 
        if (resultEl) { 
            const colorEmojis = {red: '🔴', black: '⚫', green: '🟢'}; 
            const colorNames = {red: 'Красное', black: 'Чёрное', green: 'Зелёное'}; 
            resultEl.textContent = `Выпало: ${colorEmojis[data.result]} ${colorNames[data.result]}`; 
            if (data.status === 'won') { 
                resultEl.textContent += ` | Выигрыш: ${data.win} XP! 🎉`; 
                resultEl.style.color = '#2ed573'; 
                showToast(`✅ Вы выиграли ${data.win} XP!`, 'success'); 
            } else { 
                resultEl.textContent += ' | Вы проиграли 😔'; 
                resultEl.style.color = '#ff4757'; 
                showToast('❌ Вы проиграли', 'error'); 
            } 
        } 
        loadData(); 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function initNinjaGrid() { const grid = document.getElementById('ninja-grid'); if (!grid) return; grid.innerHTML = ''; for (let i = 0; i < 5; i++) { const cell = document.createElement('button'); cell.className = 'ninja-cell'; cell.dataset.index = i; cell.textContent = '❓'; cell.onclick = () => pickNinja(i); grid.appendChild(cell); } }

async function startNinja() {
    const userId = getUserId(); if (!userId) return; const betInput = document.getElementById('ninja-bet'); const bet = parseInt(betInput.value);
    if (!bet || bet < 100 || bet > playerData.xp) { showToast('❌ Неверная ставка!', 'error'); return; }
    currentGame = 'ninja'; ninjaState = { bet: bet, multiplier: 1.0, rounds: 0 };
    try { 
        const response = await fetch(`${API_URL}/api/ninja`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'start', bet: bet }) }); 
        const data = await response.json(); 
        if (data.status === 'started') { 
            initNinjaGrid(); 
            const cashoutBtn = document.getElementById('ninja-cashout'); 
            const startBtn = document.getElementById('ninja-start'); 
            if (cashoutBtn) cashoutBtn.disabled = false; 
            if (startBtn) startBtn.disabled = true; 
            updateNinjaInfo(); 
        } else showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function pickNinja(index) {
    const userId = getUserId(); if (!userId || currentGame !== 'ninja') return; const cell = document.querySelector(`.ninja-cell[data-index="${index}"]`); if (!cell || cell.classList.contains('revealed')) return;
    try { 
        const response = await fetch(`${API_URL}/api/ninja`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'pick', pick: index }) }); 
        const data = await response.json(); 
        cell.classList.add('revealed'); 
        if (data.status === 'hit') { 
            cell.classList.add('hit'); cell.textContent = '🥷'; 
            showToast(' Вы попали на ниндзя!', 'error'); 
            const cashoutBtn = document.getElementById('ninja-cashout'); 
            const startBtn = document.getElementById('ninja-start'); 
            if (cashoutBtn) cashoutBtn.disabled = true; 
            if (startBtn) startBtn.disabled = false; 
            currentGame = null; ninjaState = null; loadData(); 
        } else if (data.status === 'safe') { 
            cell.classList.add('safe'); cell.textContent = '✅'; 
            ninjaState.multiplier = data.multiplier; ninjaState.rounds = data.rounds; 
            updateNinjaInfo(); 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function updateNinjaInfo() { if (!ninjaState) return; const multEl = document.getElementById('ninja-multiplier'); const roundsEl = document.getElementById('ninja-rounds'); if (multEl) multEl.textContent = ninjaState.multiplier.toFixed(2) + 'x'; if (roundsEl) roundsEl.textContent = `Раунд: ${ninjaState.rounds}`; }

async function cashoutNinja() {
    const userId = getUserId(); if (!userId || currentGame !== 'ninja') return;
    try { 
        const response = await fetch(`${API_URL}/api/ninja`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'cashout' }) }); 
        const data = await response.json(); 
        if (data.status === 'won') { 
            showToast(`✅ Вы забрали ${data.win} XP!`, 'success'); 
            const cashoutBtn = document.getElementById('ninja-cashout'); 
            const startBtn = document.getElementById('ninja-start'); 
            if (cashoutBtn) cashoutBtn.disabled = true; 
            if (startBtn) startBtn.disabled = false; 
            currentGame = null; ninjaState = null; loadData(); 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

function showAdminPanel() { if (!playerData.isAdmin) { showToast('❌ Нет доступа!', 'error'); return; } switchScreen('admin'); loadAdminStats(); }
function backToProfile() { switchScreen('profile'); }

async function loadAdminStats() {
    const userId = getUserId(); if (!userId) return;
    try { 
        const response = await fetch(`${API_URL}/api/admin_stats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId }) }); 
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
            const maintText = document.getElementById('maintenance-text'); 
            const maintBtn = document.getElementById('maintenance-btn'); 
            if (maintText) { maintText.textContent = data.maintenance ? 'Закрыто' : 'Открыто'; maintText.className = data.maintenance ? 'closed' : ''; } 
            if (maintBtn) maintBtn.textContent = data.maintenance ? '🔓 Открыть доступ' : '🔒 Закрыть доступ'; 
            const topList = document.getElementById('admin-top-users'); 
            if (topList && data.top_users && data.top_users.length > 0) { 
                topList.innerHTML = ''; 
                data.top_users.forEach((user, index) => { 
                    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''; 
                    const div = document.createElement('div'); div.className = 'top-item'; 
                    div.innerHTML = `<div class="top-rank ${rankClass}">${index + 1}</div><div class="top-name">${user.name || user.username || 'User'}</div><div class="top-value">${user.xp.toLocaleString()} XP</div>`; 
                    topList.appendChild(div); 
                }); 
            } 
        } 
    } catch (error) { showToast('❌ Ошибка загрузки статистики', 'error'); }
}

async function toggleMaintenance() {
    const userId = getUserId(); if (!userId) return;
    try { 
        const response = await fetch(`${API_URL}/api/admin_action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: userId, action: 'toggle_maintenance' }) }); 
        const data = await response.json(); 
        if (data.status === 'maintenance_toggled') { 
            showToast(data.maintenance ? '🔒 Доступ закрыт' : ' Доступ открыт', 'success'); 
            loadAdminStats(); 
        } 
    } catch (error) { showToast('❌ Ошибка', 'error'); }
}

async function adminGiveXP() { 
    const userId = getUserId(); 
    const targetId = document.getElementById('admin-user-id').value; 
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; } 
    const amount = prompt('💰 Введите количество XP для выдачи:'); 
    if (!amount || isNaN(amount) || amount <= 0) { showToast('❌ Неверное количество', 'error'); return; } 
    try { 
        const response = await fetch(`${API_URL}/api/admin_action`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ admin_id: userId, action: 'add_xp', target_id: parseInt(targetId), amount: parseInt(amount) }) 
        }); 
        const data = await response.json(); 
        if (data.status === 'xp_added') {
            showToast(`✅ Выдано ${amount} XP пользователю ${targetId}`, 'success');
            setTimeout(() => loadData(), 500);
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
        }
    } catch (error) { 
        showToast('❌ Ошибка', 'error'); 
    } 
}

async function adminRemoveXP() { 
    const userId = getUserId(); 
    const targetId = document.getElementById('admin-user-id').value; 
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; } 
    const amount = prompt(' Введите количество XP для изъятия:'); 
    if (!amount || isNaN(amount) || amount <= 0) { showToast('❌ Неверное количество', 'error'); return; } 
    try { 
        const response = await fetch(`${API_URL}/api/admin_action`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ admin_id: userId, action: 'remove_xp', target_id: parseInt(targetId), amount: parseInt(amount) }) 
        }); 
        const data = await response.json(); 
        if (data.status === 'xp_removed') {
            showToast(`✅ Изъято ${amount} XP у пользователя ${targetId}`, 'success'); 
            setTimeout(() => loadData(), 500);
        } else {
            showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
        }
    } catch (error) { 
        showToast(' Ошибка', 'error'); 
    } 
}

async function adminBanUser() { 
    const userId = getUserId(); 
    const targetId = document.getElementById('admin-user-id').value; 
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; } 
    if (!confirm(`🚫 Забанить пользователя ${targetId}?`)) return; 
    try { 
        const response = await fetch(`${API_URL}/api/admin_action`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ admin_id: userId, action: 'ban', target_id: parseInt(targetId) }) 
        }); 
        const data = await response.json(); 
        if (data.status === 'banned') showToast(`✅ Пользователь ${targetId} забанен`, 'success'); 
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
    } catch (error) { showToast('❌ Ошибка', 'error'); } 
}

async function adminUnbanUser() { 
    const userId = getUserId(); 
    const targetId = document.getElementById('admin-user-id').value; 
    if (!userId || !targetId) { showToast('❌ Введите User ID', 'error'); return; } 
    if (!confirm(`✅ Разбанить пользователя ${targetId}?`)) return; 
    try { 
        const response = await fetch(`${API_URL}/api/admin_action`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ admin_id: userId, action: 'unban', target_id: parseInt(targetId) }) 
        }); 
        const data = await response.json(); 
        if (data.status === 'unbanned') showToast(`✅ Пользователь ${targetId} разбанен`, 'success'); 
        else showToast('❌ ' + (data.error || 'Ошибка'), 'error'); 
    } catch (error) { showToast('❌ Ошибка', 'error'); } 
}

document.getElementById('bear').addEventListener('click', function(e) { 
    if (playerData.isBanned) { showToast('⛔ Вы заблокированы!', 'error'); return; }
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
        showToast(`🎉 Новый уровень: ${playerData.level}!`, 'success'); 
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
    btn.addEventListener('click', function() { switchScreen(this.dataset.screen); }); 
});

// Вкладки магазина
document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentShopCategory = this.dataset.category;
        renderShop();
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
        const regenAmount = playerData.energyRegen || 1;
        playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + regenAmount); 
        updateUI(); 
        saveData(); 
    } 
}, 2000);

setInterval(saveProgress, 10000); 
setInterval(checkWheelTimer, 1000);

loadData(); 
showToast('🐻 Тапай и зарабатывай XP!', 'success');
