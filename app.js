/* ═══════════ DSA Training App — JS ═══════════ */
(function () {
  'use strict';

  // ── State ──
  let DATA = { jobs: {}, items: {}, meta: {} };
  let history = JSON.parse(localStorage.getItem('dsa_history') || '[]');
  let favorites = JSON.parse(localStorage.getItem('dsa_favorites') || '[]');
  let currentFilter = 'all';
  let currentDraw = null;
  let timerInterval = null;
  let timeLeft = 120; // 2:00

  // ── Init ──
  async function init() {
    try {
      const res = await fetch('/data/summaries.json');
      DATA = await res.json();
    } catch (e) {
      console.warn('No summaries.json yet, using empty data');
    }
    setupNav();
    setupEncyclopedia();
    setupTraining();
    setupHistory();
    setupModal();
    registerSW();
  }

  // ── Service Worker ──
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // ── Navigation ──
  function setupNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  // ── Encyclopedia ──
  function setupEncyclopedia() {
    const jobCount = Object.keys(DATA.jobs || {}).length;
    const itemCount = Object.keys(DATA.items || {}).length;
    document.getElementById('job-count').textContent = `(${jobCount})`;
    document.getElementById('item-count').textContent = `(${itemCount})`;

    renderEncyclopedia();

    document.getElementById('search-input').addEventListener('input', renderEncyclopedia);
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderEncyclopedia();
      });
    });
  }

  function renderEncyclopedia() {
    const query = (document.getElementById('search-input').value || '').toLowerCase();
    const list = document.getElementById('encyclopedia-list');
    let html = '';

    const entries = [];
    if (currentFilter !== 'item') {
      Object.entries(DATA.jobs || {}).forEach(([name, summary]) => {
        entries.push({ name, summary, type: 'job' });
      });
    }
    if (currentFilter !== 'job') {
      Object.entries(DATA.items || {}).forEach(([name, summary]) => {
        entries.push({ name, summary, type: 'item' });
      });
    }

    const filtered = query
      ? entries.filter(e => e.name.toLowerCase().includes(query) || (e.summary || '').toLowerCase().includes(query))
      : entries;

    // Sort: favorites first, then alphabetical
    filtered.sort((a, b) => {
      const aFav = favorites.includes(a.type + ':' + a.name) ? 0 : 1;
      const bFav = favorites.includes(b.type + ':' + b.name) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });

    filtered.forEach(e => {
      const preview = (e.summary || '').substring(0, 60) + ((e.summary || '').length > 60 ? '…' : '');
      const typeLabel = e.type === 'job' ? '👤 職業' : '📦 物品';
      html += `<div class="card ${e.type}" data-type="${e.type}" data-name="${esc(e.name)}">
        <div class="card-type">${typeLabel}</div>
        <div class="card-name">${esc(e.name)}</div>
        ${preview ? `<div class="card-preview">${esc(preview)}</div>` : ''}
      </div>`;
    });

    if (!filtered.length) {
      html = '<div class="empty-state"><p>找不到結果</p></div>';
    }

    list.innerHTML = html;

    // Click handler
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        showDetail(card.dataset.type, card.dataset.name);
      });
    });
  }

  function showDetail(type, name) {
    const summary = type === 'job' ? DATA.jobs[name] : DATA.items[name];
    const favKey = type + ':' + name;
    const isFav = favorites.includes(favKey);
    const badge = type === 'job' ? '<span class="badge job">👤 職業</span>' : '<span class="badge item">📦 物品</span>';

    document.getElementById('modal-body').innerHTML = `
      <button class="fav-btn" data-key="${esc(favKey)}">${isFav ? '⭐' : '☆'}</button>
      ${badge}
      <h2>${esc(name)}</h2>
      <div class="summary-text">${esc(summary || '撮要尚未生成')}</div>
    `;

    document.getElementById('modal').style.display = 'flex';

    // Fav toggle
    document.querySelector('.fav-btn').addEventListener('click', function () {
      const key = this.dataset.key;
      const idx = favorites.indexOf(key);
      if (idx >= 0) { favorites.splice(idx, 1); this.textContent = '☆'; }
      else { favorites.push(key); this.textContent = '⭐'; }
      localStorage.setItem('dsa_favorites', JSON.stringify(favorites));
    });
  }

  // ── Modal ──
  function setupModal() {
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', e => {
      if (e.target.id === 'modal') closeModal();
    });
  }
  function closeModal() { document.getElementById('modal').style.display = 'none'; }

  // ── Training ──
  function setupTraining() {
    updateStats();
    document.getElementById('btn-draw').addEventListener('click', startDraw);
    document.getElementById('btn-done').addEventListener('click', () => finishDraw('completed'));
    document.getElementById('btn-skip').addEventListener('click', () => finishDraw('skipped'));
    document.getElementById('btn-again').addEventListener('click', startDraw);
    document.getElementById('btn-back').addEventListener('click', resetTraining);
  }

  function updateStats() {
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = history.filter(h => h.date === today).length;
    const jobCount = Object.keys(DATA.jobs || {}).length;
    const itemCount = Object.keys(DATA.items || {}).length;

    document.getElementById('stat-total').textContent = history.length;
    document.getElementById('stat-today').textContent = todayCount;
    document.getElementById('stat-combos').textContent = (jobCount * itemCount).toLocaleString() || '31,000+';
  }

  function startDraw() {
    const jobs = Object.keys(DATA.jobs || {});
    const items = Object.keys(DATA.items || {});
    if (!jobs.length || !items.length) {
      alert('撮要數據尚未載入，請稍後再試');
      return;
    }

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const item = items[Math.floor(Math.random() * items.length)];
    currentDraw = { job, item, startTime: Date.now() };

    document.getElementById('draw-job').textContent = job;
    document.getElementById('draw-item').textContent = item;

    showState('training-active');
    startTimer();
  }

  function startTimer() {
    timeLeft = 120;
    const total = 120;
    updateTimerDisplay();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      
      // Progress bar
      const pct = (timeLeft / total) * 100;
      const bar = document.getElementById('timer-bar');
      bar.style.width = pct + '%';

      const timer = document.getElementById('timer-display');
      bar.className = 'timer-bar';
      timer.className = 'timer';

      if (timeLeft <= 30) {
        bar.classList.add('danger');
        timer.classList.add('danger');
      } else if (timeLeft <= 60) {
        bar.classList.add('warning');
        timer.classList.add('warning');
      }

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        finishDraw('timeout');
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(Math.max(0, timeLeft) / 60);
    const s = Math.max(0, timeLeft) % 60;
    document.getElementById('timer-display').textContent = m + ':' + String(s).padStart(2, '0');
  }

  function finishDraw(status) {
    if (timerInterval) clearInterval(timerInterval);
    if (!currentDraw) return;

    const elapsed = Math.round((Date.now() - currentDraw.startTime) / 1000);
    const record = {
      job: currentDraw.job,
      item: currentDraw.item,
      status,
      elapsed,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString()
    };

    history.unshift(record);
    localStorage.setItem('dsa_history', JSON.stringify(history));

    // Show result with summaries
    const jobSummary = DATA.jobs[currentDraw.job] || '（撮要未生成）';
    const itemSummary = DATA.items[currentDraw.item] || '（撮要未生成）';

    const statusEmoji = status === 'completed' ? '✅ 完成' : status === 'skipped' ? '⏭️ 跳過' : '⏰ 超時';
    const timeStr = Math.floor(elapsed / 60) + '分' + (elapsed % 60) + '秒';

    document.getElementById('result-content').innerHTML = `
      <p style="text-align:center;margin-bottom:16px;"><strong>${statusEmoji}</strong> — 用時 ${timeStr}</p>
      <h3>📋 職業撮要：${esc(currentDraw.job)}</h3>
      <p>${esc(jobSummary)}</p>
      <h3>📦 物品撮要：${esc(currentDraw.item)}</h3>
      <p>${esc(itemSummary)}</p>
    `;

    showState('training-result');
    updateStats();
    renderHistory();
    currentDraw = null;
  }

  function resetTraining() {
    showState('training-start');
    updateStats();
  }

  function showState(id) {
    ['training-start', 'training-active', 'training-result'].forEach(s => {
      document.getElementById(s).style.display = s === id ? 'block' : 'none';
    });
  }

  // ── History ──
  function setupHistory() {
    renderHistory();
    document.getElementById('btn-clear-history').addEventListener('click', () => {
      if (confirm('確定清除所有訓練記錄？')) {
        history = [];
        localStorage.setItem('dsa_history', JSON.stringify(history));
        renderHistory();
        updateStats();
      }
    });
  }

  function renderHistory() {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    const clearBtn = document.getElementById('btn-clear-history');

    if (!history.length) {
      empty.style.display = 'block';
      list.innerHTML = '';
      clearBtn.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    clearBtn.style.display = 'block';

    list.innerHTML = history.slice(0, 50).map(h => {
      const statusClass = h.status === 'completed' ? 'completed' : 'skipped';
      const statusText = h.status === 'completed' ? '✅ 完成' : h.status === 'skipped' ? '⏭️ 跳過' : '⏰ 超時';
      const time = h.elapsed ? Math.floor(h.elapsed / 60) + '分' + (h.elapsed % 60) + '秒' : '';
      return `<div class="history-card">
        <div class="history-meta">${h.date} ${time ? '· ' + time : ''}</div>
        <div class="history-combo">${esc(h.job)} × ${esc(h.item)}</div>
        <div class="history-status ${statusClass}">${statusText}</div>
      </div>`;
    }).join('');
  }

  // ── Util ──
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', init);
})();
