// Unified navigation for all pages
const BASE = '/anti-fraud-portal';
const NAV_HTML = `
<nav class="topnav" id="topnav">
  <div class="topnav-inner">
    <a href="${BASE}/" class="topnav-logo">
      <span class="topnav-logo-icon">🛡️</span>
      <span class="topnav-logo-text">AntiFrog</span>
    </a>
    <button class="topnav-burger" id="burgerBtn" aria-label="Меню">
      <span></span><span></span><span></span>
    </button>
    <div class="topnav-links" id="navLinks">
      <a href="${BASE}/">Главная</a>
      <a href="${BASE}/quiz.html">Тест</a>
      <a href="${BASE}/services.html">Услуги</a>
      <a href="${BASE}/check.html">Проверить дело</a>
      <a href="${BASE}/apply.html" class="topnav-cta">Обратиться</a>
    </div>
  </div>
</nav>
<!-- Bottom mobile bar -->
<div class="bottombar" id="bottomBar">
  <a href="${BASE}/" class="bottombar-item"><span class="bottombar-icon">🏠</span><span>Главная</span></a>
  <a href="${BASE}/quiz.html" class="bottombar-item"><span class="bottombar-icon">🧪</span><span>Тест</span></a>
  <a href="${BASE}/apply.html" class="bottombar-item bottombar-cta"><span class="bottombar-icon">📝</span><span>Заявка</span></a>
  <a href="${BASE}/check.html" class="bottombar-item"><span class="bottombar-icon">📋</span><span>Дело</span></a>
  <a href="${BASE}/services.html" class="bottombar-item"><span class="bottombar-icon">💼</span><span>Услуги</span></a>
</div>
`;

function initNav() {
  const existing = document.getElementById('topnav');
  if (existing) return;

  document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
  document.body.classList.add('has-nav');

  // Highlight current page
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.topnav-links a, .bottombar-item').forEach(a => {
    const href = a.getAttribute('href').split('/').pop() || 'index.html';
    if (href === path || (path === '' && href === '/')) {
      a.classList.add('active');
    }
  });

  // Burger toggle
  document.getElementById('burgerBtn').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });

  // Close nav on link click
  document.querySelectorAll('.topnav-links a').forEach(a => {
    a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open'));
  });
}

// Telegram bot integration
const BOT_TOKEN = '8829750295:AAEdnt-7FPCVuVbgj6tgn7eC2_2LpY5VHCk';
const CHAT_ID = '8471070560';

async function sendToTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: 'Markdown' })
    });
    return true;
  } catch(e) { console.error('Telegram error:', e); return false; }
}

// Toast notification
function showToast(msg, type = 'success') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;padding:12px 24px;border-radius:12px;font-weight:600;font-size:14px;z-index:9999;transition:all .3s;pointer-events:none;max-width:90vw;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; }, 3000);
}

// Cases storage
function getCases() { return JSON.parse(localStorage.getItem('af_cases') || '{}'); }
function saveCases(c) { localStorage.setItem('af_cases', JSON.stringify(c)); }

// Init on load
document.addEventListener('DOMContentLoaded', initNav);
