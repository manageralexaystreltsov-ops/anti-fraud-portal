// Unified navigation for all pages
const BASE = '/anti-fraud-portal';
const NAV_HTML = `
<nav class="topnav" id="topnav">
  <div class="topnav-inner">
    <a href="${BASE}/" class="topnav-logo">
      <span class="topnav-logo-icon">🛡️</span>
      <span class="topnav-logo-text">Aegis Recovery</span>
    </a>
    <button class="topnav-burger" id="burgerBtn" aria-label="Меню">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="burger-menu" id="burgerMenu">
  <div class="burger-menu-inner">
    <a href="${BASE}/" class="burger-link">🏠 Главная</a>
    <a href="${BASE}/services.html" class="burger-link">💼 Услуги</a>
    <a href="${BASE}/check.html" class="burger-link">📋 Проверить дело</a>
    <a href="${BASE}/apply.html" class="burger-link burger-link-cta">📝 Обратиться</a>
  </div>
</div>
`;

function initNav() {
  const existing = document.getElementById('topnav');
  if (existing) return;

  document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
  document.body.classList.add('has-nav');

  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.burger-link').forEach(a => {
    const href = a.getAttribute('href').split('/').pop() || 'index.html';
    if (href === path || (path === '' && href === '/')) {
      a.classList.add('active');
    }
  });

  document.getElementById('burgerBtn').addEventListener('click', () => {
    document.getElementById('burgerMenu').classList.toggle('open');
    document.getElementById('burgerBtn').classList.toggle('active');
  });

  document.querySelectorAll('.burger-link').forEach(a => {
    a.addEventListener('click', () => {
      document.getElementById('burgerMenu').classList.remove('open');
      document.getElementById('burgerBtn').classList.remove('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topnav') && !e.target.closest('.burger-menu')) {
      document.getElementById('burgerMenu').classList.remove('open');
      document.getElementById('burgerBtn').classList.remove('active');
    }
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
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;padding:12px 24px;border-radius:12px;font-weight:600;font-size:14px;z-index:9999;transition:all .3s;pointer-events:none;max-width:90vw;text-align:center;';
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

// Particle network background
function initParticles() {
  var canvas = document.getElementById('particlesBg');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w, h, particles = [];

  function resize() {
    w = canvas.width = canvas.parentElement.offsetWidth;
    h = canvas.height = canvas.parentElement.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function Particle() {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    this.r = Math.random() * 2 + 1;
  }
  Particle.prototype.update = function() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0 || this.x > w) this.vx *= -1;
    if (this.y < 0 || this.y > h) this.vy *= -1;
  };
  Particle.prototype.draw = function() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,185,129,0.4)';
    ctx.fill();
  };

  for (var i = 0; i < 50; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(16,185,129,' + (0.15 * (1 - dist / 150)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

// Init on load
document.addEventListener('DOMContentLoaded', function() {
  initNav();
  initParticles();
});
