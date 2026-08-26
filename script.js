const tg = window.Telegram?.WebApp || null;
if (tg) { tg.expand(); tg.ready(); }

const API_URL = 'https://botandreybot-andrey5453.amvera.io';
const ADMIN_ID = 7650149888;
const MIN_BET = 100;

let playerData = {
    xp: 0, totalClicks: 0, energy: 1000, maxEnergy: 1000,
    clickPower: 1, level: 1, wins: 0, referrals: 0,
    achievements: [], username: '', firstName: '', lastSave: Date.now(),
    lastSpin: 0, isAdmin: false, skin: 'default', energyRegen: 1,
    isBanned: false
};

let apiWorking = false;
let toasts = [];
let wheelSpinning = false;
let tapInProgress = false;
let currentGame = null;
let crashInterval = null;
let crashState = null;
let minesState = null;
let ninjaState = null;
let towerState = null;
let bubblesState = null;
let purchasedItems = [];
let currentShopCategory = 'upgrades';
let selectedRouletteNumbers = [];
let selectedNinjaBombs = 1;
let rouletteTimer = null;
let rouletteBusy = false;
let doubleBusy = false;
let coinBusy = false;
let energyInterval = null;

function getUserId() {
    const tgId = tg?.initDataUnsafe?.user?.id;
    if (tgId) return Number(tgId);
    try {
        const id = new URLSearchParams(location.search).get('user_id');
        return id ? Number(id) : null;
    } catch { return null; }
}

function haptic(type = 'light') {
    try {
        if (type === 'success') tg?.HapticFeedback?.notificationOccurred('success');
        else if (type === 'error') tg?.HapticFeedback?.notificationOccurred('error');
        else tg?.HapticFeedback?.impactOccurred(type);
    } catch {}
}

function money(value) { return Number(value || 0).toLocaleString('ru-RU'); }

function showToast(text, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    toasts.push(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    updateToastPositions();
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            toast.remove();
            toasts = toasts.filter(item => item !== toast);
            updateToastPositions();
        }, 300);
    }, 2800);
}

function updateToastPositions() {
    toasts.forEach((toast, index) => {
        toast.style.top = `${20 + index * 62}px`;
    });
}

function applySkin(skin) {
    const bear = document.getElementById('bear-character');
    if (!bear) return;
    bear.classList.remove('skin-gold', 'skin-diamond', 'skin-rainbow');
    if (skin && skin !== 'default') bear.classList.add(`skin-${skin}`);
}

function setAccessState({ banned = false, maintenance = false, isAdmin = false }) {
    const ban = document.getElementById('ban-overlay');
    const maintenanceEl = document.getElementById('maintenance-overlay');
    const app = document.getElementById('main-app');
    if (ban) ban.style.display = banned ? 'flex' : 'none';
    if (maintenanceEl) maintenanceEl.style.display = (maintenance && !isAdmin) ? 'flex' : 'none';
    if (app) app.style.display = (banned || (maintenance && !isAdmin)) ? 'none' : 'block';
}

async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

async function loadPurchases() {
    const userId = getUserId();
    if (!userId) return;
    try {
        const data = await api(`/api/purchases?user_id=${userId}`);
        purchasedItems = data.purchases || [];
        playerData.skin = data.current_skin || playerData.skin;
        applySkin(playerData.skin);
    } catch (error) { console.error(error); }
}

function startEnergyRegenTimer() {
    if (energyInterval) clearInterval(energyInterval);
    energyInterval = setInterval(() => {
        if (playerData.energy < playerData.maxEnergy) {
            playerData.energy = Math.min(playerData.maxEnergy, playerData.energy + (playerData.energyRegen || 1));
            updateUI();
        }
    }, 1000);
}

function updateUI() {
    const xpEl = document.getElementById('xp-balance');
    const perTapEl = document.getElementById('xp-per-tap');
    const curEnergyEl = document.getElementById('energy-current');
    const maxEnergyEl = document.getElementById('energy-max');
    const fillEl = document.getElementById('energy-fill');

    if (xpEl) xpEl.textContent = money(playerData.xp);
    if (perTapEl) perTapEl.textContent = playerData.clickPower;
    if (curEnergyEl) curEnergyEl.textContent = Math.floor(playerData.energy);
    if (maxEnergyEl) maxEnergyEl.textContent = playerData.maxEnergy;
    
    if (fillEl) {
        const percent = playerData.maxEnergy > 0 ? (playerData.energy / playerData.maxEnergy) * 100 : 0;
        fillEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
}

function updateProfile() {
    const xp = Number(playerData.xp || 0);
    const level = Math.floor(xp / 100) + 1;
    const current = xp % 100;
    playerData.level = level;

    const nameEl = document.getElementById('profile-name');
    const lvlEl = document.getElementById('profile-level');
    const winsEl = document.getElementById('stat-wins');
    const statXpEl = document.getElementById('stat-xp');
    const refsEl = document.getElementById('stat-refs');
    const clicksEl = document.getElementById('stat-clicks');

    if (nameEl) nameEl.textContent = playerData.firstName || playerData.username || 'Игрок';
    if (lvlEl) lvlEl.textContent = level;
    if (winsEl) winsEl.textContent = playerData.wins;
    if (statXpEl) statXpEl.textContent = money(xp);
    if (refsEl) refsEl.textContent = playerData.referrals;
    if (clicksEl) clicksEl.textContent = money(playerData.totalClicks);

    const fill = document.getElementById('profile-xp-fill');
    const currentEl = document.getElementById('profile-xp-current');
    const nextEl = document.getElementById('profile-xp-next');
    if (fill) fill.style.width = `${current}%`;
    if (currentEl) currentEl.textContent = current;
    if (nextEl) nextEl.textContent = 100;

    setupReferralLink();
    updateTopLists();
}

function setupReferralLink() {
    const button = document.getElementById('referral-btn');
    const id = getUserId();
    if (!button || !id) return;
    const link = `https://t.me/sporttcm_bot?start=${id}`;
    button.onclick = async () => {
        try {
            await navigator.clipboard.writeText(link);
            showToast('✅ Реферальная ссылка скопирована!', 'success');
            haptic('success');
        } catch { showToast('❌ Не удалось скопировать ссылку', 'error'); }
    };
}

async function updateTopLists() {
    const id = getUserId();
    if (!id) return;
    try {
        const data = await api(`/api/user_data?user_id=${id}`);
        renderTopList(document.getElementById('top-xp-list'), data.top_xp || [], 'XP');
        renderTopList(document.getElementById('top-wins-list'), data.top_wins || [], 'побед');
    } catch (error) { console.error(error); }
}

function renderTopList(container, rows, suffix) {
    if (!container) return;
    if (!rows || !rows.length) {
        container.innerHTML = '<div class="empty-state">🔄 Пока пусто</div>';
        return;
    }
    container.innerHTML = rows.map((row, index) => {
        const rank = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        return `<div class="top-item"><div class="top-rank ${rank}">${index + 1}</div><div class="top-name">${row.name || 'Игрок'}</div><div class="top-value">${money(row.value ?? row.xp)} ${suffix}</div></div>`;
    }).join('');
}

async function loadData() {
    const id = getUserId();
    if (!id) { loadLocalData(); showToast('⚠️ ID пользователя не найден', 'warning'); return; }
    try {
        const data = await api(`/api/user_data?user_id=${id}`);
        const isAdmin = id === ADMIN_ID;
        setAccessState({ banned: data.is_banned === 1, maintenance: !!data.maintenance, isAdmin });
        if (data.is_banned === 1 || (data.maintenance && !isAdmin)) return;
        apiWorking = true;
        playerData = {
            ...playerData,
            xp: Number(data.xp || 0),
            totalClicks: Number(data.total_clicks || 0),
            energy: Number(data.energy ?? 1000),
            maxEnergy: Number(data.max_energy || 1000),
            clickPower: Number(data.click_power || 1),
            level: Math.floor(Number(data.xp || 0) / 100) + 1,
            wins: Number(data.wins || 0), referrals: Number(data.referrals || 0),
            achievements: data.achievements || [], username: data.username || '',
            firstName: data.first_name || '', lastSpin: Number(data.last_spin || 0),
            isAdmin, skin: data.skin || 'default', energyRegen: Number(data.energy_regen || 1),
            isBanned: data.is_banned === 1, lastSave: Date.now()
        };
        await loadPurchases();
        updateUI(); updateProfile(); renderShop(); checkWheelTimer(); initRouletteNumbers();
        startEnergyRegenTimer();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = isAdmin ? 'block' : 'none';
    } catch (error) {
        console.error(error);
        loadLocalData();
        showToast(`❌ Ошибка загрузки: ${error.message}`, 'error');
    }
}

function loadLocalData() {
    try {
        const saved = JSON.parse(localStorage.getItem('bearTapData') || 'null');
        if (saved) playerData = { ...playerData, ...saved };
    } catch {}
    const user = tg?.initDataUnsafe?.user;
    if (user) {
        playerData.username = user.username || user.first_name || 'Игрок';
        playerData.firstName = user.first_name || 'Игрок';
        playerData.isAdmin = Number(user.id) === ADMIN_ID;
    }
    updateUI(); updateProfile(); renderShop(); initRouletteNumbers(); startEnergyRegenTimer();
}

async function saveProgress() {
    if (!apiWorking || currentGame || tapInProgress) return;
    const id = getUserId();
    if (!id) return;
    try {
        await api('/api/save_progress', { method: 'POST', body: JSON.stringify({ user_id: id, energy: Math.floor(playerData.energy) }) });
    } catch (error) { console.error(error); }
}

async function tapBear(event) {
    if (tapInProgress || currentGame) return;
    const id = getUserId();
    if (!id) return showToast('❌ Пользователь не найден', 'error');
    tapInProgress = true;
    try {
        const data = await api('/api/tap', { method: 'POST', body: JSON.stringify({ user_id: id }) });
        playerData.xp = data.xp;
        playerData.totalClicks = data.total_clicks;
        playerData.energy = data.energy;
        playerData.maxEnergy = data.max_energy;
        updateUI(); updateProfile(); showClickEffect(event); haptic('light');
    } catch (error) {
        if (error.message.toLowerCase().includes('energy')) showToast('⚠️ Недостаточно энергии', 'warning');
        else showToast(`❌ ${error.message}`, 'error');
    } finally { tapInProgress = false; }
}

function showClickEffect(event) {
    const bear = document.getElementById('bear');
    if (!bear) return;
    const effect = document.createElement('div');
    effect.className = 'click-effect';
    effect.textContent = `+${playerData.clickPower}`;
    const rect = bear.getBoundingClientRect();
    effect.style.left = `${event.clientX - rect.left}px`;
    effect.style.top = `${event.clientY - rect.top}px`;
    bear.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function switchScreen(screen) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`screen-${screen}`)?.classList.add('active');
    if (screen === 'profile') updateProfile();
    if (screen === 'shop') renderShop();
    if (screen === 'wheel') checkWheelTimer();
    if (screen === 'games') { initTowerGrid(); initBubblesGrid(); }
    if (screen === 'game-roulette') { fetchGameHistory('roulette'); initRouletteTrackSegments(); }
    if (screen === 'game-double') { fetchGameHistory('double'); initDoubleTrackSegments(); }
}

function renderShop() {
    const list = document.getElementById('shop-list');
    const balance = document.getElementById('shop-balance');
    if (!list) return;
    if (balance) balance.textContent = money(playerData.xp);
    
    const items = currentShopCategory === 'upgrades' ? [
        ['click_power_2', '⚡ Сила клика +2', 250000, 'Увеличивает награду за тап'],
        ['click_power_5', '⚡⚡ Сила клика +5', 1000000, 'Ещё больше XP за тап'],
        ['click_power_10', '⚡⚡⚡ Сила клика +10', 5000000, 'Максимальная сила клика'],
        ['max_energy_2000', '🔋 Энергия +2000', 500000, 'Увеличивает запас энергии'],
        ['max_energy_5000', '🔋🔋 Энергия +5000', 2000000, 'Огромный запас энергии'],
        ['energy_regen_2', '⚡ Регенерация +2', 750000, 'Энергия восстанавливается быстрее'],
        ['energy_regen_5', '⚡⚡ Регенерация +5', 3000000, 'Очень быстрая регенерация']
    ] : [
        ['skin_gold', '🌟 Золотой мишка', 1000000, 'Золотой внешний вид'],
        ['skin_diamond', '💎 Алмазный мишка', 5000000, 'Алмазный внешний вид'],
        ['skin_rainbow', '🌈 Радужный мишка', 10000000, 'Радужный внешний вид']
    ];

    list.innerHTML = items.map(([id, name, price, desc]) => {
        const purchased = purchasedItems.includes(id);
        const skin = id.startsWith('skin_');
        const equipped = skin && playerData.skin === id.replace('skin_', '');
        let text = purchased ? (equipped ? '✅ Надето' : skin ? '👕 Надеть' : '✅ Куплено') : playerData.xp >= price ? '🛒 Купить' : '🔒 Мало XP';
        return `<div class="shop-item"><div class="shop-item-info"><div class="shop-item-name"&gt;${name}</div><div class="shop-item-desc">${desc}</div><div class="shop-item-price">💰 ${money(price)} XP</div></div><button class="shop-buy-btn ${equipped ? 'equipped' : purchased ? 'purchased' : playerData.xp < price ? 'disabled' : ''}" data-item="${id}" ${(!purchased && playerData.xp < price) || equipped ? 'disabled' : ''}>${text}</button></div>`;
    }).join('');

    list.querySelectorAll('[data-item]').forEach(btn => btn.onclick = () => {
        const id = btn.dataset.item;
        if (id.startsWith('skin_') && purchasedItems.includes(id)) equipSkin(id.replace('skin_', ''));
        else buyItem(id);
    });
}

async function buyItem(item) {
    const id = getUserId();
    if (!id) return;
    try {
        const data = await api('/api/buy_item', { method: 'POST', body: JSON.stringify({ user_id: id, item }) });
        showToast(`✅ Улучшение успешно куплено!`, 'success');
        haptic('success');
        await loadData();
        renderShop();
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function equipSkin(skin) {
    try {
        await api('/api/equip_skin', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), skin }) });
        playerData.skin = skin; applySkin(skin); renderShop(); showToast('✅ Скин надет', 'success');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function checkWheelTimer() {
    const el = document.getElementById('wheel-timer');
    if (!el) return;
    const remaining = Math.max(0, 3600 - (Date.now() / 1000 - playerData.lastSpin));
    if (remaining <= 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    el.textContent = `⏳ Следующее вращение через: ${minutes}м ${seconds}с`;
}

async function spinWheel() {
    if (wheelSpinning) return;
    if (Date.now() / 1000 - playerData.lastSpin < 3600) return showToast('⏳ Колесо ещё не готово', 'warning');
    const wheel = document.getElementById('wheel');
    const button = document.getElementById('spin-btn');
    wheelSpinning = true; button.disabled = true;
    const target = Math.floor(Math.random() * 13);
    const angle = 360 - target * (360 / 13) - (360 / 13) / 2;
    if (wheel) wheel.style.transform = `rotate(${1800 + angle}deg)`;
    try {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const data = await api('/api/spin_wheel', { method: 'POST', body: JSON.stringify({ user_id: getUserId() }) });
        playerData.xp = Number(data.xp);
        playerData.lastSpin = Number(data.last_spin);
        updateUI(); updateProfile();
        showToast(data.prize > 0 ? `🎉 Вы выиграли ${money(data.prize)} XP!` : '😔 Выпал нулевой приз', data.prize > 0 ? 'success' : 'info');
        checkWheelTimer();
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
    finally { wheelSpinning = false; button.disabled = false; }
}

function openGame(game) {
    switchScreen(`game-${game}`);
    if (game === 'roulette') { initRouletteNumbers(); fetchGameHistory('roulette'); }
    if (game === 'double') { fetchGameHistory('double'); }
    if (game === 'ninja') initNinjaGrid();
    if (game === 'tower') initTowerGrid();
    if (game === 'bubbles') initBubblesGrid();
    if (game === 'mines') initMinesGrid();
}

function validateBet(id) {
    const valInput = document.getElementById(id);
    if (!valInput) return null;
    const value = Number(valInput.value);
    if (!Number.isInteger(value) || value < MIN_BET || value > playerData.xp) {
        showToast(`❌ Ставка от ${MIN_BET} XP и не выше баланса`, 'error');
        return null;
    }
    return value;
}

// GAME HISTORY LOADING & RENDERING
async function fetchGameHistory(game) {
    const userId = getUserId();
    if (!userId) return;
    try {
        const data = await api(`/api/game_history?game=${game}&user_id=${userId}`);
        renderGameHistory(game, data.history || []);
    } catch (e) { console.error(e); }
}

function renderGameHistory(game, history) {
    const container = document.getElementById(`${game}-history`);
    if (!container) return;
    if (!history || history.length === 0) {
        container.innerHTML = '<span style="font-size:13px; color:#aaa; margin: 10px auto;">История пуста 🍀</span>';
        return;
    }
    container.innerHTML = history.map(item => {
        if (game === 'roulette') {
            const parts = item.split('_');
            const num = parts[0];
            const color = parts[1] || 'black';
            return `<div class="history-chip ${color}">${num}</div>`;
        } else if (game === 'double') {
            const parts = item.split('_');
            const val = parts[1] || '2';
            return `<div class="history-chip x${val}">x${val}</div>`;
        }
        return '';
    }).join('');
}

// CRASH
async function startCrash() {
    if (currentGame) return;
    const bet = validateBet('crash-bet'); if (!bet) return;
    currentGame = 'crash';
    try {
        const data = await api('/api/crash', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'start', bet }) });
        crashState = { bet, crashPoint: Number(data.crash_point), multiplier: 1 };
        document.getElementById('crash-start').disabled = true;
        document.getElementById('crash-cashout').disabled = false;
        crashInterval = setInterval(() => {
            crashState.multiplier = Math.round((crashState.multiplier + 0.01) * 100) / 100;
            const multEl = document.getElementById('crash-multiplier');
            if (multEl) multEl.textContent = `${crashState.multiplier.toFixed(2)}x`;
            if (crashState.multiplier >= crashState.crashPoint) finishCrash(false);
        }, 100);
    } catch (error) { currentGame = null; showToast(`❌ ${error.message}`, 'error'); }
}

async function finishCrash(cashout) {
    if (!crashState) return;
    clearInterval(crashInterval);
    document.getElementById('crash-cashout').disabled = true;
    document.getElementById('crash-start').disabled = false;
    try {
        const data = await api('/api/crash', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: cashout ? 'cashout' : 'crash' }) });
        if (data.status === 'won') showToast(`🎉 Выигрыш ${money(data.win)} XP (${Number(data.multiplier).toFixed(2)}x)`, 'success');
        else showToast(`💥 Краш на ${Number(data.multiplier || crashState.crashPoint).toFixed(2)}x`, 'error');
        showResultModal(data.status === 'won' ? '🎉 Победа!' : '💥 Краш!', data.status === 'won' ? `+${money(data.win)} XP` : 'Ставка потеряна', data.status === 'won');
        currentGame = null; crashState = null; await loadData();
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); currentGame = null; }
}

function cashoutCrash() { if (currentGame === 'crash') finishCrash(true); }

// MINES
function initMinesGrid() {
    const grid = document.getElementById('mines-grid'); if (!grid) return;
    grid.innerHTML = Array.from({ length: 25 }, (_, i) => `<button class="mine-cell" data-index="${i}">❓</button>`).join('');
    grid.querySelectorAll('.mine-cell').forEach(cell => cell.onclick = () => revealMine(Number(cell.dataset.index)));
}

async function startMines() {
    if (currentGame) return;
    const bet = validateBet('mines-bet'); if (!bet) return;
    const countSelect = document.getElementById('mines-count');
    const mines = countSelect ? Number(countSelect.value) : 5;
    try {
        await api('/api/mines', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'start', bet, mines }) });
        currentGame = 'mines'; minesState = { bet, multiplier: 1 };
        initMinesGrid();
        document.getElementById('mines-start').disabled = true; 
        document.getElementById('mines-cashout').disabled = false; 
        updateMinesInfo();
        showToast('🎮 Игра начата! Выбирайте клетки', 'info');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function revealMine(index) {
    if (currentGame !== 'mines') return;
    const cell = document.querySelector(`.mine-cell[data-index="${index}"]`);
    if (!cell || cell.classList.contains('revealed')) return;
    try {
        const data = await api('/api/mines', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'reveal', cell: index }) });
        cell.classList.add('revealed');
        if (data.status === 'lost') {
            cell.classList.add('mine'); cell.textContent = '💣';
            if (data.mines) {
                data.mines.forEach(m => {
                    const c = document.querySelector(`.mine-cell[data-index="${m}"]`);
                    if (c) { c.classList.add('revealed', 'mine'); c.textContent = '💣'; }
                });
            }
            showToast('💥 Вы подорвались!', 'error'); 
            showResultModal('💥 Взрыв!', 'Вы проиграли ставку', false);
            endGameUI('mines');
        } else {
            cell.classList.add('safe'); cell.textContent = '💎'; 
            minesState.multiplier = Number(data.multiplier); 
            updateMinesInfo();
        }
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function updateMinesInfo() {
    if (!minesState) return;
    const multEl = document.getElementById('mines-multiplier');
    const winEl = document.getElementById('mines-win');
    if (multEl) multEl.textContent = minesState.multiplier.toFixed(2);
    if (winEl) winEl.textContent = money(minesState.bet * minesState.multiplier);
}

async function cashoutMines() {
    if (currentGame !== 'mines') return;
    try {
        const data = await api('/api/mines', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'cashout' }) });
        showToast(`🎉 Вы забрали ${money(data.win)} XP!`, 'success'); 
        showResultModal('🎉 Победа!', `+${money(data.win)} XP`, true); 
        endGameUI('mines'); 
        await loadData();
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function endGameUI(game) {
    currentGame = null;
    if (game === 'mines') { document.getElementById('mines-start').disabled = false; document.getElementById('mines-cashout').disabled = true; minesState = null; }
    if (game === 'ninja') { document.getElementById('ninja-start').disabled = false; document.getElementById('ninja-cashout').disabled = true; ninjaState = null; }
    if (game === 'tower') { document.getElementById('tower-start').disabled = false; document.getElementById('tower-cashout').disabled = true; towerState = null; }
    if (game === 'bubbles') { document.getElementById('bubbles-start').disabled = false; document.getElementById('bubbles-cashout').disabled = true; bubblesState = null; }
}

// ROULETTE TRACK AND ANIMATION
function initRouletteTrackSegments() {
    const track = document.getElementById('roulette-track');
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
    
    let html = '';
    // Создаем длинную ленту сегментов для реалистичного вращения
    for (let i = 0; i < 80; i++) {
        const num = i % 13;
        const color = num === 0 ? 'green' : (num % 2 !== 0 ? 'black' : 'red');
        html += `<div class="roulette-segment ${color}">${num}</div>`;
    }
    track.innerHTML = html;
}

function selectWinningRouletteSegment(winningNum, winningColor) {
    const track = document.getElementById('roulette-track');
    if (!track) return;
    const targetIdx = 55; // Сегмент ближе к концу, на котором остановится pointer
    const segments = track.querySelectorAll('.roulette-segment');
    if (segments[targetIdx]) {
        segments[targetIdx].className = `roulette-segment ${winningColor}`;
        segments[targetIdx].textContent = winningNum;
    }
    const segmentWidth = 60; // Штрих CSS (.roulette-segment { min-width: 60px; })
    const containerWidth = document.querySelector('.roulette-track-container').offsetWidth;
    const offset = -(targetIdx * segmentWidth - containerWidth / 2 + segmentWidth / 2);
    
    track.style.transition = 'transform 3.5s cubic-bezier(0.1, 0.8, 0.1, 1)';
    track.style.transform = `translateX(${offset}px)`;
}

// ROULETTE ACTION
function initRouletteNumbers() {
    const grid = document.getElementById('roulette-numbers-grid'); if (!grid) return;
    selectedRouletteNumbers = [];
    grid.innerHTML = Array.from({ length: 13 }, (_, i) => `<button class="number-chip ${i === 0 ? 'green' : i % 2 ? 'black' : 'red'}" data-number="${i}">${i}</button>`).join('');
    grid.querySelectorAll('.number-chip').forEach(btn => btn.onclick = () => {
        const n = Number(btn.dataset.number);
        if (selectedRouletteNumbers.includes(n)) { selectedRouletteNumbers = selectedRouletteNumbers.filter(x => x !== n); btn.classList.remove('selected'); }
        else if (selectedRouletteNumbers.length < 3) { selectedRouletteNumbers.push(n); btn.classList.add('selected'); }
        else showToast('⚠️ Максимум 3 числа', 'warning');
    });
}

async function spinRoulette(color) {
    if (rouletteBusy) return;
    const bet = validateBet('roulette-bet'); if (!bet) return;
    rouletteBusy = true;
    initRouletteTrackSegments();
    const resultEl = document.getElementById('roulette-result');
    if (resultEl) resultEl.textContent = '🎰 Рулетка крутится...';
    
    try {
        const data = await api('/api/roulette', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), bet, color }) });
        selectWinningRouletteSegment(data.winning_number, data.result);
        
        await new Promise(resolve => setTimeout(resolve, 3600));
        const names = { red: '🔴 Красное', black: '⚫ Чёрное', green: '🟢 Зелёное' };
        if (resultEl) resultEl.textContent = `🎯 Выпало: ${names[data.result]} (${data.winning_number})`;
        
        showToast(data.status === 'won' ? `🎉 Вы выиграли ${money(data.win)} XP!` : '❌ Ставка проиграла', data.status === 'won' ? 'success' : 'error');
        showResultModal(data.status === 'won' ? '🎉 Победа!' : '❌ Проигрыш', data.status === 'won' ? `+${money(data.win)} XP` : 'Ставка сгорела', data.status === 'won');
        await loadData();
        fetchGameHistory('roulette');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
    finally { rouletteBusy = false; }
}

async function spinRouletteNumbers() {
    if (rouletteBusy || selectedRouletteNumbers.length === 0) return showToast('⚠️ Выберите 1–3 числа', 'warning');
    const bet = validateBet('roulette-bet'); if (!bet) return;
    rouletteBusy = true;
    initRouletteTrackSegments();
    const resultEl = document.getElementById('roulette-result');
    if (resultEl) resultEl.textContent = '🎰 Рулетка крутится...';
    
    try {
        const data = await api('/api/roulette_numbers', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), bet, numbers: selectedRouletteNumbers }) });
        const colorResult = data.winning_number === 0 ? 'green' : (data.winning_number % 2 !== 0 ? 'black' : 'red');
        selectWinningRouletteSegment(data.winning_number, colorResult);
        
        await new Promise(resolve => setTimeout(resolve, 3600));
        if (resultEl) resultEl.textContent = `🎯 Выпало число: ${data.winning_number}`;
        
        showToast(data.status === 'won' ? `🎉 Вы выиграли ${money(data.win)} XP (${data.multiplier}x)!` : '❌ Число не угадано', data.status === 'won' ? 'success' : 'error');
        showResultModal(data.status === 'won' ? '🎉 Победа!' : '❌ Проигрыш', data.status === 'won' ? `+${money(data.win)} XP` : 'Ставка сгорела', data.status === 'won');
        await loadData();
        fetchGameHistory('roulette');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
    finally { rouletteBusy = false; }
}

// DOUBLE SPIN & ANIMATION
function initDoubleTrackSegments() {
    const track = document.getElementById('double-track');
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
    
    let html = '';
    const mults = ['2', '3', '5', '50'];
    for (let i = 0; i < 80; i++) {
        const val = mults[i % 4];
        html += `<div class="double-segment x${val}">x${val}</div>`;
    }
    track.innerHTML = html;
}

function selectWinningDoubleSegment(choice) {
    const track = document.getElementById('double-track');
    if (!track) return;
    const targetIdx = 55;
    const segments = track.querySelectorAll('.double-segment');
    if (segments[targetIdx]) {
        segments[targetIdx].className = `double-segment x${choice}`;
        segments[targetIdx].textContent = `x${choice}`;
    }
    const segmentWidth = 60;
    const containerWidth = document.querySelector('.roulette-track-container').offsetWidth;
    const offset = -(targetIdx * segmentWidth - containerWidth / 2 + segmentWidth / 2);
    
    track.style.transition = 'transform 3.5s cubic-bezier(0.1, 0.8, 0.1, 1)';
    track.style.transform = `translateX(${offset}px)`;
}

async function playDouble(choice) {
    if (doubleBusy) return;
    const bet = validateBet('double-bet'); if (!bet) return;
    doubleBusy = true;
    initDoubleTrackSegments();
    const resEl = document.getElementById('double-result');
    if (resEl) resEl.textContent = '🎲 Вращение колеса Double...';
    
    try {
        const data = await api('/api/double', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), bet, choice }) });
        
        // Показываем анимацию на треке
        selectWinningDoubleSegment(choice);
        
        await new Promise(resolve => setTimeout(resolve, 3600));
        if (resEl) resEl.textContent = `${data.status === 'won' ? '🎉 Успех' : '😔 Мимо'}: Выбран множитель ${choice}x`;
        
        showToast(data.status === 'won' ? `🎉 Выигрыш ${money(data.win)} XP — ${choice}x` : '❌ Проигрыш', data.status === 'won' ? 'success' : 'error');
        showResultModal(data.status === 'won' ? '🎉 Удача!' : '❌ Мимо', data.status === 'won' ? `+${money(data.win)} XP` : 'Ставка проиграла', data.status === 'won');
        await loadData();
        fetchGameHistory('double');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
    finally { doubleBusy = false; }
}

// NINJA
function initNinjaGrid() {
    const grid = document.getElementById('ninja-grid'); if (!grid) return;
    grid.innerHTML = Array.from({ length: 4 }, (_, i) => `<button class="ninja-cell" data-index="${i}">❓</button>`).join('');
    grid.querySelectorAll('.ninja-cell').forEach(btn => btn.onclick = () => pickNinja(Number(btn.dataset.index)));
}

function selectNinjaBombs(bombs) {
    selectedNinjaBombs = bombs;
    document.querySelectorAll('.ninja-bomb-option').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.bombs) === bombs));
}

async function startNinja() {
    if (currentGame) return;
    const bet = validateBet('ninja-bet'); if (!bet) return;
    try {
        await api('/api/ninja', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'start', bet, bombs: selectedNinjaBombs }) });
        currentGame = 'ninja'; ninjaState = { bet, multiplier: 1, rounds: 0 };
        initNinjaGrid(); 
        document.getElementById('ninja-start').disabled = true; 
        document.getElementById('ninja-cashout').disabled = false; 
        updateNinjaInfo();
        showToast('🥷 Ниндзя начат!', 'info');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function pickNinja(index) {
    if (currentGame !== 'ninja') return;
    const cell = document.querySelector(`.ninja-cell[data-index="${index}"]`); 
    if (!cell || cell.classList.contains('revealed')) return;
    try {
        const data = await api('/api/ninja', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'pick', pick: index }) });
        cell.classList.add('revealed');
        if (data.status === 'hit') { 
            cell.classList.add('hit'); cell.textContent = '💣'; 
            
            // Открываем все спрятанные бомбы ниндзя при взрыве
            if (data.bombs) {
                data.bombs.forEach(b => {
                    const c = document.querySelector(`.ninja-cell[data-index="${b}"]`);
                    if (c) { c.classList.add('revealed', 'hit'); c.textContent = '💣'; }
                });
            }
            // Все свободные клетки отмечаем как безопасные (зелёные)
            document.querySelectorAll('.ninja-cell').forEach(c => {
                const idx = Number(c.dataset.index);
                if (!data.bombs.includes(idx)) { c.classList.add('revealed', 'safe'); c.textContent = '💎'; }
            });

            showToast('💥 Бомба ниндзя!', 'error'); 
            showResultModal('💥 Взрыв!', 'Вы попали на ниндзя', false);
            endGameUI('ninja'); 
        } else { 
            cell.classList.add('safe'); cell.textContent = '💎'; 
            ninjaState.multiplier = data.multiplier; 
            ninjaState.rounds = data.rounds; 
            updateNinjaInfo(); 
        }
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function updateNinjaInfo() {
    if (!ninjaState) return;
    const multEl = document.getElementById('ninja-multiplier');
    const roundsEl = document.getElementById('ninja-rounds');
    const winEl = document.getElementById('ninja-win');
    if (multEl) multEl.textContent = `${ninjaState.multiplier.toFixed(2)}x`;
    if (roundsEl) roundsEl.textContent = `🎯 Раунд: ${ninjaState.rounds}`;
    if (winEl) winEl.textContent = `💰 Выигрыш: ${money(ninjaState.bet * ninjaState.multiplier)} XP`;
}

async function cashoutNinja() {
    if (currentGame !== 'ninja') return;
    try { 
        const data = await api('/api/ninja', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'cashout' }) }); 
        showToast(`🎉 Вы забрали ${money(data.win)} XP!`, 'success'); 
        showResultModal('🎉 Победа!', `+${money(data.win)} XP`, true);
        endGameUI('ninja'); 
        await loadData(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

// TOWER
function initTowerGrid() {
    const grid = document.getElementById('tower-grid'); if (!grid) return;
    grid.innerHTML = Array.from({ length: 5 }, (_, row) => `<div class="tower-row" data-row="${row}">${Array.from({ length: 5 }, (_, col) => `<button class="tower-cell" data-row="${row}" data-col="${col}">❓</button>`).join('')}</div>`).reverse().join('');
    grid.querySelectorAll('.tower-cell').forEach(cell => cell.onclick = () => pickTower(Number(cell.dataset.row), Number(cell.dataset.col)));
}

async function startTower() {
    if (currentGame) return;
    const bet = validateBet('tower-bet'); if (!bet) return;
    try {
        await api('/api/tower', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'start', bet }) });
        currentGame = 'tower'; towerState = { bet, row: 0, multiplier: 1 };
        initTowerGrid(); 
        document.getElementById('tower-start').disabled = true; 
        document.getElementById('tower-cashout').disabled = false; 
        updateTowerInfo();
        showToast('🗼 Башня начата!', 'info');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function pickTower(row, col) {
    if (currentGame !== 'tower' || !towerState || row !== towerState.row) return showToast('⚠️ Выбирайте ячейки текущего этажа снизу вверх', 'warning');
    try {
        const data = await api('/api/tower', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'pick', row, col }) });
        const cell = document.querySelector(`.tower-cell[data-row="${row}"][data-col="${col}"]`);
        if (data.status === 'lost') { 
            if (cell) { cell.classList.add('fail'); cell.textContent = '💣'; }
            
            // При проигрыше показываем все бомбы и все правильные ячейки на всей башне!
            if (data.bombs) {
                for (let r = 0; r < 5; r++) {
                    const rowBombs = data.bombs[r];
                    for (let c = 0; c < 5; c++) {
                        const targetCell = document.querySelector(`.tower-cell[data-row="${r}"][data-col="${c}"]`);
                        if (targetCell) {
                            targetCell.classList.add('revealed');
                            if (rowBombs.includes(c)) {
                                targetCell.classList.add('fail');
                                targetCell.textContent = '💣';
                            } else {
                                targetCell.classList.add('safe');
                                targetCell.textContent = '💎';
                            }
                        }
                    }
                }
            }
            
            showToast('💥 Башня взорвалась!', 'error'); 
            showResultModal('💥 Обвал!', 'Вы проиграли ставку', false);
            endGameUI('tower'); 
        } else { 
            if (cell) { cell.classList.add('safe'); cell.textContent = '💎'; }
            towerState.row = data.next_row; 
            towerState.multiplier = data.multiplier; 
            updateTowerInfo(); 
            if (towerState.row >= 5) cashoutTower(); 
        }
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function updateTowerInfo() {
    if (!towerState) return;
    const lvlEl = document.getElementById('tower-level');
    const multEl = document.getElementById('tower-multiplier');
    if (lvlEl) lvlEl.textContent = `📊 Этаж: ${towerState.row}`;
    if (multEl) multEl.textContent = `x${towerState.multiplier.toFixed(2)}`;
}

async function cashoutTower() {
    if (currentGame !== 'tower') return;
    try { 
        const data = await api('/api/tower', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'cashout' }) }); 
        showToast(`🎉 Вы забрали ${money(data.win)} XP!`, 'success'); 
        showResultModal('🎉 Победа на башне!', `+${money(data.win)} XP`, true);
        endGameUI('tower'); 
        await loadData(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

// BUBBLES
function initBubblesGrid() {
    const grid = document.getElementById('bubbles-grid'); if (!grid) return;
    grid.innerHTML = Array.from({ length: 16 }, (_, i) => `<button class="bubble" data-index="${i}">🫧</button>`).join('');
    grid.querySelectorAll('.bubble').forEach(btn => btn.onclick = () => popBubble(Number(btn.dataset.index)));
}

async function startBubbles() {
    if (currentGame) return;
    const bet = validateBet('bubbles-bet'); if (!bet) return;
    try { 
        await api('/api/bubbles', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'start', bet }) }); 
        currentGame = 'bubbles'; bubblesState = { bet, score: 0, multiplier: 1 }; 
        initBubblesGrid(); 
        document.getElementById('bubbles-start').disabled = true; 
        document.getElementById('bubbles-cashout').disabled = false; 
        updateBubblesInfo(); 
        showToast('🫧 Игра в пузыри начата!', 'info');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function popBubble(index) {
    if (currentGame !== 'bubbles') return;
    const bubble = document.querySelector(`.bubble[data-index="${index}"]`); 
    if (!bubble || bubble.classList.contains('popped')) return;
    try { 
        const data = await api('/api/bubbles', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'pop', index }) }); 
        bubble.classList.add('popped'); 
        if (data.status === 'bomb') { 
            bubble.classList.add('bomb'); bubble.textContent = '💣'; 
            
            // При проиграше показываем все бомбы и безопасные пузыри на поле!
            if (data.bombs) {
                for (let i = 0; i < 16; i++) {
                    const targetBubble = document.querySelector(`.bubble[data-index="${i}"]`);
                    if (targetBubble) {
                        targetBubble.classList.add('popped');
                        if (data.bombs.includes(i)) {
                            targetBubble.classList.add('bomb');
                            targetBubble.textContent = '💣';
                        } else {
                            targetBubble.classList.add('popped');
                            targetBubble.style.backgroundColor = '#2ed573';
                            targetBubble.textContent = '💎';
                        }
                    }
                }
            }

            showToast('💥 Бомба в пузыре!', 'error'); 
            showResultModal('💥 Взрыв!', 'Попались на бомбу', false);
            endGameUI('bubbles'); 
        } else { 
            bubble.textContent = '💎'; 
            bubblesState.score = data.score; 
            bubblesState.multiplier = data.multiplier; 
            updateBubblesInfo(); 
        } 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

function updateBubblesInfo() {
    if (!bubblesState) return;
    const scoreEl = document.getElementById('bubbles-score');
    const multEl = document.getElementById('bubbles-multiplier');
    if (scoreEl) scoreEl.textContent = `🎯 Счёт: ${bubblesState.score}`;
    if (multEl) multEl.textContent = `x${bubblesState.multiplier.toFixed(2)}`;
}

async function cashoutBubbles() {
    if (currentGame !== 'bubbles') return;
    try { 
        const data = await api('/api/bubbles', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), action: 'cashout' }) }); 
        showToast(`🎉 Вы забрали ${money(data.win)} XP!`, 'success'); 
        showResultModal('🎉 Победа!', `+${money(data.win)} XP`, true);
        endGameUI('bubbles'); 
        await loadData(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

// COINS (МОНЕТКА)
async function flipCoin(choice) {
    if (coinBusy) return;
    const bet = validateBet('coins-bet'); if (!bet) return;
    coinBusy = true;
    const coin = document.getElementById('coin');
    if (coin) {
        coin.classList.remove('coin-flip', 'tails', 'heads'); 
        void coin.offsetWidth; 
        coin.classList.add('coin-flip');
    }
    try {
        const data = await api('/api/coins', { method: 'POST', body: JSON.stringify({ user_id: getUserId(), bet, choice }) });
        setTimeout(() => {
            if (coin) {
                if (data.result === 'tails') coin.classList.add('tails');
                coin.textContent = data.result === 'heads' ? '🦅' : '🪙';
            }
            const resEl = document.getElementById('coins-result');
            if (resEl) resEl.textContent = `🎯 Выпало: ${data.result === 'heads' ? '🦅 Орёл' : '🪙 Решка'}`;
            showToast(data.status === 'won' ? `🎉 Выигрыш ${money(data.win)} XP` : '❌ Проигрыш', data.status === 'won' ? 'success' : 'error');
            showResultModal(data.status === 'won' ? '🎉 Победа!' : '❌ Проигрыш', data.status === 'won' ? `+${money(data.win)} XP` : 'Монетка упала не так', data.status === 'won');
            loadData();
        }, 1000);
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
    finally { setTimeout(() => coinBusy = false, 1100); }
}

function showResultModal(title, text, success) {
    let modal = document.getElementById('result-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'result-modal'; modal.className = 'result-modal';
        modal.innerHTML = '<div class="result-box"><div class="result-title"></div><div class="result-text"></div><button class="result-close">Продолжить</button></div>';
        document.body.appendChild(modal); 
        modal.querySelector('.result-close').onclick = () => modal.classList.remove('visible');
    }
    modal.querySelector('.result-title').textContent = title;
    modal.querySelector('.result-text').textContent = text;
    modal.querySelector('.result-box').className = 'result-box'; // reset classes
    modal.querySelector('.result-box').classList.add(success ? 'success' : 'error');
    modal.classList.add('visible');
}

function showAdminPanel() { if (playerData.isAdmin) { switchScreen('admin'); loadAdminStats(); } }
function backToProfile() { switchScreen('profile'); }

async function loadAdminStats() {
    try {
        const data = await api('/api/admin_stats', { method: 'POST', body: JSON.stringify({ admin_id: getUserId() }) });
        for (const [id, key] of Object.entries({ 
            'admin-total-users': 'total_users', 
            'admin-active-users': 'active_users', 
            'admin-banned-users': 'banned_users', 
            'admin-total-xp': 'total_xp', 
            'admin-total-games': 'total_games' 
        })) {
            const el = document.getElementById(id);
            if (el) el.textContent = money(data[key]);
        }
        const maintText = document.getElementById('maintenance-text');
        const maintBtn = document.getElementById('maintenance-btn');
        if (maintText) maintText.textContent = data.maintenance ? 'Закрыто' : 'Открыто';
        if (maintBtn) maintBtn.textContent = data.maintenance ? '🔓 Открыть доступ' : '🔒 Закрыть доступ';
        renderTopList(document.getElementById('admin-top-users'), data.top_users || [], 'XP');
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); }
}

async function toggleMaintenance() { 
    try { 
        await api('/api/admin_action', { method: 'POST', body: JSON.stringify({ admin_id: getUserId(), action: 'toggle_maintenance' }) }); 
        loadAdminStats(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); } 
}

async function adminResetWheel() { 
    const targetInput = document.getElementById('admin-user-id');
    const target_id = Number(targetInput?.value || getUserId()); 
    try { 
        await api('/api/admin_action', { method: 'POST', body: JSON.stringify({ admin_id: getUserId(), action: 'reset_wheel', target_id }) }); 
        showToast('✅ Таймер колеса сброшен', 'success'); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); } 
}

async function adminGiveXP() { adminXP('add_xp', '💰 Сколько XP выдать?'); }
async function adminRemoveXP() { adminXP('remove_xp', '➖ Сколько XP забрать?'); }

async function adminXP(action, promptText) { 
    const targetInput = document.getElementById('admin-user-id');
    const target_id = Number(targetInput?.value); 
    const amount = Number(prompt(promptText)); 
    if (!target_id || !amount || amount <= 0) return showToast('❌ Неверный ID или сумма', 'error'); 
    try { 
        await api('/api/admin_action', { method: 'POST', body: JSON.stringify({ admin_id: getUserId(), action, target_id, amount }) }); 
        showToast('✅ Операция выполнена', 'success'); 
        loadAdminStats(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); } 
}

async function adminBanUser() { adminModeration('ban', '🚫 Забанить пользователя?'); }
async function adminUnbanUser() { adminModeration('unban', '✅ Разбанить пользователя?'); }

async function adminModeration(action, text) { 
    const targetInput = document.getElementById('admin-user-id');
    const target_id = Number(targetInput?.value); 
    if (!target_id || !confirm(text)) return; 
    try { 
        await api('/api/admin_action', { method: 'POST', body: JSON.stringify({ admin_id: getUserId(), action, target_id }) }); 
        showToast('✅ Готово', 'success'); 
        loadAdminStats(); 
    } catch (error) { showToast(`❌ ${error.message}`, 'error'); } 
}

// LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    const bearBtn = document.getElementById('bear');
    if (bearBtn) bearBtn.addEventListener('click', tapBear);

    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.screen)));
    document.querySelectorAll('.shop-tab').forEach(tab => tab.addEventListener('click', () => { 
        document.querySelectorAll('.shop-tab').forEach(x => x.classList.remove('active')); 
        tab.classList.add('active'); 
        currentShopCategory = tab.dataset.category; 
        renderShop(); 
    }));

    const ninjaControls = document.getElementById('ninja-bomb-options');
    if (ninjaControls) ninjaControls.querySelectorAll('.ninja-bomb-option').forEach(btn => btn.onclick = () => selectNinjaBombs(Number(btn.dataset.bombs)));
});

setInterval(checkWheelTimer, 1000);
setInterval(saveProgress, 10000);
loadData();
