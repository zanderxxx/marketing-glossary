// ── Config ──
const DATA_URL   = './data/glossary.json';
const SUBMIT_URL = 'https://marketing-glossary.vercel.app/api/submit-word';
const CATS_ORDER = ['全部', '通用', 'Social', '3C 数码', '小红书', '抖音', '直播', 'NEW'];

// ── State ──
let BUILTIN        = [];
let customTerms    = [];
let localEdits     = {};
let allTerms       = [];
let searchQuery    = '';
let activeCategory = '全部';
let nextId         = 10001;
let modalMode      = 'add';
let editingId      = null;

// ── Persist ──
function loadCustom() {
  try { return JSON.parse(localStorage.getItem('mktTermsCustom') || '[]'); } catch { return []; }
}
function saveCustom() {
  localStorage.setItem('mktTermsCustom', JSON.stringify(customTerms));
}
function loadEdits() {
  try { return JSON.parse(localStorage.getItem('mktTermsEdits') || '{}'); } catch { return {}; }
}
function saveEdits() {
  localStorage.setItem('mktTermsEdits', JSON.stringify(localEdits));
}
function buildAllTerms() {
  const builtinWithEdits = BUILTIN.map(t => {
    const edit = localEdits[t.id];
    return edit ? { ...t, ...edit } : t;
  });
  return [...builtinWithEdits, ...customTerms];
}

// ── Filter ──
function getFiltered() {
  let list = allTerms;
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(t => {
      const cn  = (t.cn  || '').toLowerCase();
      const en  = (t.en  || '').toLowerCase();
      const def = (t.def || '').toLowerCase();
      return cn.includes(q) || en.includes(q) || def.includes(q);
    });
  }
  if (activeCategory !== '全部') {
    list = list.filter(t => t.cat === activeCategory);
  }
  return list;
}

// ── Highlight ──
function hl(text, q) {
  if (!q || !text) return escHtml(text || '');
  const escaped  = escHtml(text);
  const escapedQ = escHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(escapedQ, 'gi'), m => `<mark>${m}</mark>`);
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render cards ──
function renderCards() {
  const grid  = document.getElementById('termsGrid');
  const empty = document.getElementById('emptyState');
  const filtered = getFiltered();
  const q = searchQuery.trim().toLowerCase();

  if (filtered.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.classList.add('visible');
    return;
  }

  grid.style.display = 'grid';
  empty.classList.remove('visible');

  const isOdd = filtered.length % 2 === 1;

  grid.innerHTML = filtered.map((t, i) => {
    const cn          = t.cn  || '';
    const en          = t.en  || '';
    const cat         = t.cat || '';
    const def         = t.def || '';
    const ex          = t.ex  || '';
    const contributor = t.contributor || '';
    const isCustom    = !!t._custom;
    const isPending   = !!t._pending;
    const isLast      = isOdd && i === filtered.length - 1;

    return `<div class="term-card${isLast ? ' last-solo' : ''}" data-id="${t.id}">
      <div class="card-header">
        <div class="card-titles">
          <div class="term-cn">${hl(cn, q)}</div>
          <div class="term-en">${hl(en, q)}</div>
        </div>
        <div class="card-badges">
          <span class="badge badge-cat">${escHtml(cat)}</span>
          ${isPending  ? '<span class="badge badge-pending">审核中</span>' : ''}
          ${isCustom && !isPending ? '<span class="badge badge-custom">自定义</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        ${def ? `<div class="card-row">
          <span class="card-label">定义</span>
          <span class="card-text def">${hl(def, q)}</span>
        </div>` : ''}
        ${ex ? `<div class="card-row">
          <span class="card-label">例句/使用场景</span>
          <span class="card-text">${escHtml(ex)}</span>
        </div>` : ''}
        ${contributor ? `<div class="card-row">
          <span class="card-label">贡献者</span>
          <span class="card-text">${escHtml(contributor)}</span>
        </div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-edit" onclick="openEditModal(${t.id})" title="编辑">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
          </svg>
        </button>
        ${isCustom ? `<button class="btn-delete" onclick="deleteCustom(${t.id})" title="删除">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1l7 7M8 1L1 8"/></svg>
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Render tabs ──
function getCategories() {
  let base = allTerms;
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    base = base.filter(t =>
      t.cn.toLowerCase().includes(q) ||
      t.en.toLowerCase().includes(q) ||
      (t.def || '').toLowerCase().includes(q)
    );
  }
  const counts = {};
  base.forEach(t => { const c = t.cat || '其他'; counts[c] = (counts[c] || 0) + 1; });
  return { counts, total: base.length };
}

function renderTabs() {
  const nav = document.getElementById('categoryNav');
  const { counts, total } = getCategories();
  const allCats = CATS_ORDER.filter(c => c === '全部' || counts[c] !== undefined);
  Object.keys(counts).forEach(c => { if (!CATS_ORDER.includes(c)) allCats.push(c); });
  nav.innerHTML = allCats.map(cat => {
    const cnt = cat === '全部' ? total : (counts[cat] || 0);
    const isActive = activeCategory === cat;
    return `<button class="cat-btn${isActive ? ' active' : ''}" onclick="setCategory('${escHtml(cat)}')">${escHtml(cat)}<span class="cat-count">${cnt}</span></button>`;
  }).join('');
  if (typeof renderStickySelect === 'function') renderStickySelect();
}

function setCategory(cat) {
  activeCategory = cat;
  renderTabs();
  renderCards();
}

// ── Search ──
document.getElementById('searchInput').addEventListener('input', function () {
  searchQuery = this.value;
  document.getElementById('searchClear').classList.toggle('visible', !!searchQuery);
  renderTabs();
  renderCards();
});
document.getElementById('searchClear').addEventListener('click', function () {
  const inp = document.getElementById('searchInput');
  inp.value = ''; searchQuery = '';
  this.classList.remove('visible');
  inp.focus();
  renderTabs(); renderCards();
});

// ── Long-press logic ──
let lpTimer = null;
let lpTarget = null;

function startLongPress(e) {
  const card = e.target.closest('.term-card');
  if (!card) return;
  if (e.target.closest('button')) return;
  lpTarget = card;
  lpTimer = setTimeout(() => {
    clearLongPress(false);
    document.querySelectorAll('.term-card.long-pressed').forEach(c => c.classList.remove('long-pressed'));
    card.classList.add('long-pressed');
  }, 500);
}
function clearLongPress() {
  clearTimeout(lpTimer);
  lpTimer = null;
}

document.getElementById('termsGrid').addEventListener('mousedown', startLongPress);
document.getElementById('termsGrid').addEventListener('touchstart', startLongPress, { passive: true });
document.getElementById('termsGrid').addEventListener('mouseup', () => clearLongPress());
document.getElementById('termsGrid').addEventListener('mouseleave', () => clearLongPress());
document.getElementById('termsGrid').addEventListener('touchend', () => clearLongPress());
document.getElementById('termsGrid').addEventListener('touchmove', () => clearLongPress(), { passive: true });
document.addEventListener('click', function (e) {
  if (!e.target.closest('.term-card')) {
    document.querySelectorAll('.term-card.long-pressed').forEach(c => c.classList.remove('long-pressed'));
  }
});

// ── Delete custom ──
function deleteCustom(id) {
  customTerms = customTerms.filter(t => t.id !== id);
  saveCustom();
  allTerms = buildAllTerms();
  renderTabs(); renderCards();
  showToast('已删除词汇');
}

// ── Modal ──
const overlay = document.getElementById('modalOverlay');
const fabBtn  = document.getElementById('fabBtn');

fabBtn.addEventListener('click', openAddModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function openAddModal() {
  modalMode = 'add';
  editingId = null;
  clearForm();
  document.getElementById('modalTitle').textContent = '提交词汇';
  document.getElementById('modalSubmit').textContent = '提交词汇';
  populateCatSelect();
  overlay.classList.add('open');
  document.getElementById('f_cn').focus();
}

function openEditModal(id) {
  document.querySelectorAll('.term-card.long-pressed').forEach(c => c.classList.remove('long-pressed'));
  const term = allTerms.find(t => t.id === id);
  if (!term) return;

  modalMode = 'edit';
  editingId = id;
  clearForm();
  document.getElementById('modalTitle').textContent = '编辑词汇';
  document.getElementById('modalSubmit').textContent = '保存修改';
  populateCatSelect();

  document.getElementById('f_cn').value = term.cn || '';
  document.getElementById('f_en').value = term.en || '';
  document.getElementById('f_cat').value = term.cat || '';
  document.getElementById('f_def').value = term.def || '';
  document.getElementById('f_ex').value  = term.ex  || '';
  document.getElementById('f_contributor').value = term.contributor || '';

  overlay.classList.add('open');
  document.getElementById('f_cn').focus();
}

function closeModal() {
  overlay.classList.remove('open');
  clearForm();
}

function populateCatSelect() {
  const sel  = document.getElementById('f_cat');
  const cats = CATS_ORDER.filter(c => c !== '全部');
  allTerms.forEach(t => { if (t.cat && !cats.includes(t.cat)) cats.push(t.cat); });
  sel.innerHTML = '<option value="">— 选择分类 —</option>' +
    cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  if (activeCategory !== '全部') sel.value = activeCategory;
}

function clearForm() {
  ['f_cn', 'f_en', 'f_cat', 'f_def', 'f_ex', 'f_contributor'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('error');
  });
}

document.getElementById('modalSubmit').addEventListener('click', () => {
  const cn          = document.getElementById('f_cn').value.trim();
  const en          = document.getElementById('f_en').value.trim();
  const cat         = document.getElementById('f_cat').value;
  const def         = document.getElementById('f_def').value.trim();
  const ex          = document.getElementById('f_ex').value.trim();
  const contributor = document.getElementById('f_contributor').value.trim();

  let valid = true;
  [['f_cn', cn], ['f_en', en], ['f_cat', cat], ['f_def', def], ['f_ex', ex], ['f_contributor', contributor]].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!val) { el.classList.add('error'); valid = false; }
    else { el.classList.remove('error'); }
  });
  if (!valid) return;

  if (modalMode === 'add') {
    // Optimistic UI: show locally right away with _pending flag
    const optimistic = { id: nextId++, cn, en, cat, def, ex, contributor, _custom: true, _pending: true };
    customTerms.unshift(optimistic);
    saveCustom();
    allTerms = buildAllTerms();
    closeModal();
    activeCategory = cat;
    renderTabs(); renderCards();
    showToast('提交中…');

    // Background API call
    fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cn, en, cat, def, ex, contributor }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          // Update local entry with real server ID, clear pending
          customTerms = customTerms.map(t =>
            (t._pending && t.cn === cn && t.en === en)
              ? { ...t, id: data.id, _pending: false }
              : t
          );
          saveCustom();
          allTerms = buildAllTerms();
          renderTabs(); renderCards();
          showToast('词汇已提交，所有人可见 ✓');
        } else {
          // Rejected by server: remove optimistic entry
          customTerms = customTerms.filter(t => !(t._pending && t.cn === cn && t.en === en));
          saveCustom();
          allTerms = buildAllTerms();
          renderTabs(); renderCards();
          const reason = (data.details && data.details[0]) || data.error || '请检查内容后重试';
          showToast('提交未通过：' + reason);
        }
      })
      .catch(() => {
        // Network error: keep pending entry so user can see it locally
        showToast('网络错误，词汇已暂存本地');
      });

  } else {
    // Edit mode (local only)
    const isCustom = customTerms.some(t => t.id === editingId);
    if (isCustom) {
      customTerms = customTerms.map(t =>
        t.id === editingId ? { ...t, cn, en, cat, def, ex, contributor } : t
      );
      saveCustom();
    } else {
      localEdits[editingId] = { cn, en, cat, def, ex, contributor };
      saveEdits();
    }
    allTerms = buildAllTerms();
    closeModal();
    renderTabs(); renderCards();
    showToast('修改已保存 ✓');
  }
});

// ── Toast ──
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Sticky Bar ──
const stickyBar          = document.getElementById('stickyBar');
const stickyCats         = document.getElementById('stickyCats');
const stickySearchBtn    = document.getElementById('stickySearchBtn');
const stickySearchExpand = document.getElementById('stickySearchExpand');
const stickySearchInput  = document.getElementById('stickySearchInput');
const stickySearchClose  = document.getElementById('stickySearchClose');

function renderStickySelect() {
  if (!stickyCats) return;
  const { counts, total } = getCategories();
  const allCats = CATS_ORDER.filter(c => c === '全部' || counts[c] !== undefined);
  Object.keys(counts).forEach(c => { if (!CATS_ORDER.includes(c)) allCats.push(c); });
  stickyCats.innerHTML = allCats.map(cat => {
    const cnt = cat === '全部' ? total : (counts[cat] || 0);
    const isActive = activeCategory === cat;
    return `<button class="sticky-cat-btn${isActive ? ' active' : ''}" onclick="setCategory('${escHtml(cat)}')">${escHtml(cat)}<span class="cat-count">${cnt}</span></button>`;
  }).join('');
}

stickySearchBtn.addEventListener('click', function () {
  stickyBar.classList.add('search-open');
  stickySearchInput.focus();
});

stickySearchClose.addEventListener('click', function () {
  stickyBar.classList.remove('search-open');
  if (stickySearchInput.value) {
    stickySearchInput.value = '';
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    document.getElementById('searchClear').classList.remove('visible');
    renderTabs(); renderCards();
  }
});

stickySearchInput.addEventListener('input', function () {
  document.getElementById('searchInput').value = this.value;
  searchQuery = this.value;
  document.getElementById('searchClear').classList.toggle('visible', !!searchQuery);
  renderTabs(); renderCards();
});

document.getElementById('searchInput').addEventListener('input', function () {
  stickySearchInput.value = this.value;
});

const sentinel = document.getElementById('categoryNav');
const observer = new IntersectionObserver(
  ([entry]) => {
    if (!entry.isIntersecting) {
      stickyBar.classList.add('visible');
      if (searchQuery) {
        stickySearchInput.value = searchQuery;
        stickyBar.classList.add('search-open');
      } else {
        stickyBar.classList.remove('search-open');
      }
      renderStickySelect();
    } else {
      stickyBar.classList.remove('visible');
    }
  },
  { threshold: 0, rootMargin: '-56px 0px 0px 0px' }
);
observer.observe(sentinel);

// ── Particle Wave Background ──
(function () {
  const canvas = document.getElementById('particleCanvas');
  const ctx    = canvas.getContext('2d');
  const hero   = canvas.parentElement;
  const COUNT  = 72;
  let W, H, pts, raf;

  function resize() {
    W = hero.offsetWidth;
    H = hero.offsetHeight + 200;
    canvas.width  = W;
    canvas.height = H;
  }

  function mkPt() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.15,
      r:     Math.random() * 1.8 + 0.6,
      alpha: Math.random() * 0.10 + 0.04,
      phase: Math.random() * Math.PI * 2,
      freq:  Math.random() * 0.0015 + 0.0008,
    };
  }

  function init() {
    resize();
    pts = Array.from({ length: COUNT }, mkPt);
  }

  let t = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, W, H);
    t++;
    pts.forEach(p => {
      p.x += p.vx + Math.sin(t * p.freq + p.phase) * 0.35;
      p.y += p.vy + Math.cos(t * p.freq * 0.8 + p.phase) * 0.22;
      if (p.x < -15) p.x = W + 15;
      if (p.x > W + 15) p.x = -15;
      if (p.y < -15) p.y = H + 15;
      if (p.y > H + 15) p.y = -15;
    });
    const MAX = 140;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(0,0,0,${(1 - d / MAX) * 0.055})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${p.alpha})`;
      ctx.fill();
    });
  }

  init();
  frame();
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); init(); frame(); });
})();

// ── JSON-LD SEO injection ──
function injectJsonLd(terms) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: '营销术语词典 · Marketing Terms Glossary',
    description: '中英文数字营销术语词典，收录通用营销、小红书、抖音、直播电商、3C数码等领域术语',
    url: 'https://zanderxxx.github.io/marketing-glossary/',
    hasDefinedTerm: terms.slice(0, 200).map(t => ({
      '@type': 'DefinedTerm',
      name: `${t.cn} (${t.en})`,
      description: t.def || '',
      inDefinedTermSet: 'https://zanderxxx.github.io/marketing-glossary/',
    })),
  });
  document.head.appendChild(script);
}

// ── Init (async) ──
async function init() {
  try {
    const res  = await fetch(DATA_URL);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    BUILTIN = data.terms;

    customTerms = loadCustom();
    localEdits  = loadEdits();
    allTerms    = buildAllTerms();
    nextId      = Math.max(...allTerms.map(t => t.id || 0), 10000) + 1;

    document.getElementById('loadingState').style.display = 'none';

    renderTabs();
    renderCards();
    renderStickySelect();
    injectJsonLd(BUILTIN);
  } catch (err) {
    console.error('Failed to load glossary:', err);
    document.getElementById('loadingState').textContent = '加载失败，请刷新重试';
  }
}

init();
