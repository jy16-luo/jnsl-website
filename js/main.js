/**
 * 摄影专题页主脚本
 * 负责导航、图集筛选/搜索、3D 环形图集查看器、滚动渐显、账号数据
 */

// 标记 JS 可用（配合 CSS 的 html.js [data-reveal] 使用，避免无 JS 时内容被隐藏）
document.documentElement.classList.add('js');

// 禁用浏览器滚动位置恢复：刷新后从页面顶部开始，避免跳到上次停留的区块（如约拍）
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
// 若 URL 残留锚点（如 #booking），移除它，避免刷新后自动跳到对应区块
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
window.scrollTo(0, 0);

/** @typedef {Object} Album
 * @property {number} id
 * @property {string} title
 * @property {string} description
 * @property {string} date
 * @property {string} year
 * @property {string} season
 * @property {string[]} styles
 * @property {boolean} featured
 * @property {string} cover
 * @property {string[]} photos
 */

/** @type {Album[]} */
let allAlbums = [];

/** @type {{ style: string, season: string, sort: string, search: string }} */
const filters = {
  style: 'all',
  season: 'all',
  sort: 'likes-desc',
  search: '',
};

/** DOM 元素缓存 */
const elements = {
  navToggle: null,
  navMenu: null,
  navLinks: null,
  searchInput: null,
  portfolioGrid: null,
  portfolioCount: null,
  portfolioEmpty: null,
  ringViewer: null,
  ringViewerClose: null,
  ringPrev: null,
  ringNext: null,
  ring: null,
  ringTitle: null,
  ringCounter: null,
};

/** 当前打开的图集与索引 */
let currentAlbum = null;
let currentIndex = 0;
let touchStartX = 0;
let touchDragging = false;

/**
 * 初始化页面
 */
async function init() {
  cacheElements();
  bindNavigation();
  bindFilters();
  bindRingViewer();
  bindScrollSpy();
  bindScrollReveal();
  bindHeaderScroll();
  bindBubbles();
  spawnBubbles();

  loadProfile();

  try {
    const response = await fetch('data/albums.json');
    allAlbums = await response.json();
  } catch (error) {
    // 直接双击打开（file://）时浏览器会拦截 fetch，改用内置数据
    console.warn('加载 data/albums.json 失败，使用内置数据（直接双击打开的场景）', error);
    allAlbums = Array.isArray(window.ALBUMS_DATA) ? window.ALBUMS_DATA : [];
  }
  if (allAlbums.length) {
    renderPortfolio();
  } else {
    elements.portfolioGrid.innerHTML =
      '<p class="portfolio__empty">图集数据加载失败，请检查 data/albums.json 是否存在。</p>';
  }
}

/**
 * 缓存常用 DOM 元素
 */
function cacheElements() {
  elements.navToggle = document.getElementById('navToggle');
  elements.navMenu = document.getElementById('navMenu');
  elements.navLinks = document.querySelectorAll('.nav__link');
  elements.searchInput = document.getElementById('searchInput');
  elements.portfolioGrid = document.getElementById('portfolioGrid');
  elements.portfolioCount = document.getElementById('portfolioCount');
  elements.portfolioEmpty = document.getElementById('portfolioEmpty');
  elements.ringViewer = document.getElementById('ringViewer');
  elements.ringViewerClose = document.getElementById('ringViewerClose');
  elements.ringPrev = document.getElementById('ringPrev');
  elements.ringNext = document.getElementById('ringNext');
  elements.ring = document.getElementById('ring');
  elements.ringTitle = document.getElementById('ringTitle');
  elements.ringDesc = document.getElementById('ringDesc');
  elements.ringDate = document.getElementById('ringDate');
  elements.ringCounter = document.getElementById('ringCounter');
}

/**
 * 绑定移动端导航与平滑滚动
 */
function bindNavigation() {
  elements.navToggle.addEventListener('click', () => {
    const isOpen = elements.navMenu.classList.toggle('open');
    elements.navToggle.classList.toggle('open', isOpen);
    elements.navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  elements.navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      elements.navMenu.classList.remove('open');
      elements.navToggle.classList.remove('open');
      elements.navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/**
 * 绑定筛选标签与搜索框
 */
function bindFilters() {
  document.querySelectorAll('.filter-group__tags').forEach((group) => {
    const filterKey = group.dataset.filter;

    group.querySelectorAll('.filter-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        group.querySelectorAll('.filter-tag').forEach((t) => t.classList.remove('active'));
        tag.classList.add('active');
        filters[filterKey] = tag.dataset.value;
        renderPortfolio();
      });
    });
  });

  elements.searchInput.addEventListener('input', (event) => {
    filters.search = /** @type {HTMLInputElement} */ (event.target).value.trim().toLowerCase();
    renderPortfolio();
  });
}

/**
 * 滚动时高亮当前导航项
 */
function bindScrollSpy() {
  const sections = document.querySelectorAll('section[id]');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          elements.navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );

  sections.forEach((section) => observer.observe(section));
}

/**
 * 滚动渐显：为 [data-reveal] 元素添加 revealed 类
 */
function bindScrollReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('revealed'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  items.forEach((el) => observer.observe(el));
}

/**
 * 导航栏滚动后加深背景
 */
function bindHeaderScroll() {
  const header = document.getElementById('header');
  if (!header) return;
  const update = () => header.classList.toggle('header--scrolled', window.scrollY > 10);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

/**
 * 悬浮风格泡泡：点击后按风格筛选作品集并滚动到作品区
 */
function bindBubbles() {
  const bubbles = document.querySelectorAll('.hero__bubble');
  bubbles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.style;
      if (!style) return;

      filters.style = style;

      // 同步激活作品集里对应的「风格」筛选按钮
      document.querySelectorAll('[data-filter="style"] .filter-tag').forEach((tag) => {
        tag.classList.toggle('active', tag.dataset.value === style);
      });

      renderPortfolio();
      const portfolio = document.getElementById('portfolio');
      if (portfolio) portfolio.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/**
 * 泡泡飘散入场：打开页面时，泡泡从头像位置依次飘散到各自位置
 */
function spawnBubbles() {
  const bubbles = document.querySelectorAll('.hero__bubble');
  if (!bubbles.length) return;

  // 等头像先出现，再开始飘散
  window.setTimeout(() => {
    bubbles.forEach((btn, i) => {
      btn.style.transitionDelay = `${0.12 + i * 0.14}s`;
      // 双 rAF 确保 transition-delay 生效后再加 .spawned
      requestAnimationFrame(() => {
        requestAnimationFrame(() => btn.classList.add('spawned'));
      });
    });
  }, 320);
}

/**
 * 根据当前筛选条件过滤并排序图集
 * @returns {Album[]}
 */
function getFilteredAlbums() {
  let result = allAlbums.filter((album) => {
    const albumStyles = album.styles && album.styles.length ? album.styles : [album.style];
    if (filters.style !== 'all' && !albumStyles.includes(filters.style)) return false;
    if (filters.season !== 'all' && album.season !== filters.season) return false;
    if (filters.sort === 'featured' && !album.featured) return false;

    if (filters.search) {
      const haystack = `${album.title} ${album.description} ${(album.styles || [album.style]).join(' ')}`.toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }

    return true;
  });

  // 排序：最新=纯按时间；热度=按 heat 值；代表作=仅代表作按热度
  result.sort((a, b) => {
    if (filters.sort === 'likes-desc' || filters.sort === 'featured') {
      return (b.heat || 0) - (a.heat || 0);
    }
    return b.date.localeCompare(a.date);
  });

  return result;
}

/**
 * 渲染图集网格（每组的封面卡片）
 */
function renderPortfolio() {
  const albums = getFilteredAlbums();

  elements.portfolioCount.textContent = `共 ${albums.length} 组图集`;
  elements.portfolioEmpty.classList.toggle('hidden', albums.length > 0);

  if (albums.length === 0) {
    elements.portfolioGrid.innerHTML = '';
    return;
  }

  elements.portfolioGrid.innerHTML = albums
    .map(
      (album, index) => `
    <article class="album-card" data-id="${album.id}" tabindex="0" role="button" aria-label="查看图集 ${album.title}" style="animation-delay:${Math.min(index * 80, 640)}ms">
      <div class="album-card__img-wrap">
        <img src="${album.cover}" alt="${album.title}" loading="lazy">
        ${album.featured ? '<span class="album-card__badge">代表作</span>' : ''}
        <span class="album-card__count">${album.photos.length} 张</span>
      </div>
      <div class="album-card__body">
        <div class="album-card__title-row">
          <h3 class="album-card__title">${album.title}</h3>
          <span class="album-card__view">查看图集 →</span>
        </div>
        <div class="album-card__tags">
          ${(album.styles || [album.style]).map((s) => `<span>${s}</span>`).join('')}
          <span>${album.season}</span>
          <span>${formatAlbumDate(album.date)}</span>
        </div>
      </div>
    </article>
  `
    )
    .join('');

  elements.portfolioGrid.querySelectorAll('.album-card').forEach((card) => {
    const id = Number(card.dataset.id);
    const album = allAlbums.find((a) => a.id === id);

    card.addEventListener('click', () => openRingViewer(album));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRingViewer(album);
      }
    });
  });
}

/**
 * 绑定 3D 图集查看器：关闭、前后切换、键盘、滑动、点击侧卡
 */
function bindRingViewer() {
  elements.ringViewerClose.addEventListener('click', closeRingViewer);

  elements.ringPrev.addEventListener('click', ringPrev);
  elements.ringNext.addEventListener('click', ringNext);

  elements.ringViewer.addEventListener('click', (event) => {
    if (event.target === elements.ringViewer) {
      closeRingViewer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!elements.ringViewer.classList.contains('ring-viewer--open')) return;
    if (event.key === 'Escape') closeRingViewer();
    if (event.key === 'ArrowLeft') ringPrev();
    if (event.key === 'ArrowRight') ringNext();
  });

  // 拖拽/滑动切换（指针事件，同时支持鼠标和触屏，跟手）
  elements.ringViewer.addEventListener('pointerdown', (event) => {
    touchStartX = event.clientX;
    touchDragging = true;
  });
  elements.ringViewer.addEventListener('pointermove', (event) => {
    if (!touchDragging) return;
    const dx = event.clientX - touchStartX;
    if (Math.abs(dx) > 3) {
      elements.ring.style.transition = 'none';
      elements.ring.style.transform = `translateX(${dx}px)`;
    }
  });
  elements.ringViewer.addEventListener('pointerup', (event) => {
    if (!touchDragging) return;
    touchDragging = false;
    const dx = event.clientX - touchStartX;
    elements.ring.style.transition = '';
    elements.ring.style.transform = '';
    if (Math.abs(dx) > 50) {
      if (dx < 0) ringNext();
      else ringPrev();
    }
  });
  elements.ringViewer.addEventListener('pointercancel', () => {
    touchDragging = false;
    elements.ring.style.transition = '';
    elements.ring.style.transform = '';
  });

  // 点击两侧卡片直接跳转
  elements.ring.addEventListener('click', (event) => {
    const card = event.target.closest('.ring__card');
    if (!card) return;
    const idx = Number(card.dataset.idx);
    if (!Number.isNaN(idx) && idx !== currentIndex) {
      currentIndex = idx;
      updateRing();
    }
  });
}

/**
 * 打开图集查看器
 * @param {Album} album
 */
function openRingViewer(album) {
  if (!album || !album.photos || !album.photos.length) return;
  currentAlbum = album;
  currentIndex = 0;
  elements.ringTitle.textContent = album.title;
  if (elements.ringDesc) elements.ringDesc.textContent = album.description || '';
  if (elements.ringDate) elements.ringDate.textContent = album.date ? `拍摄于 ${formatAlbumDateCN(album.date)}` : '';
  buildRing();
  updateRing();
  // 打开图集：暂停全局预加载，优先加载当前图集
  pauseGlobalPreload();
  elements.ringViewer.classList.add('ring-viewer--open');
  elements.ringViewer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

/**
 * 关闭图集查看器
 */
function closeRingViewer() {
  elements.ringViewer.classList.remove('ring-viewer--open');
  elements.ringViewer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  // 关闭图集：恢复全局预加载
  resumeGlobalPreload();
}

/**
 * 上一张
 */
function ringPrev() {
  if (!currentAlbum) return;
  currentIndex = (currentIndex - 1 + currentAlbum.photos.length) % currentAlbum.photos.length;
  updateRing();
}

/**
 * 下一张
 */
function ringNext() {
  if (!currentAlbum) return;
  currentIndex = (currentIndex + 1) % currentAlbum.photos.length;
  updateRing();
}

/**
 * 构建 3D 环形卡牌（只构建一次，切换时更新位置参数）
 */
function buildRing() {
  elements.ring.innerHTML = currentAlbum.photos
    .map(
      (src, i) => `
      <div class="ring__card" data-idx="${i}">
        <img data-src="${src}" alt="${currentAlbum.title} ${i + 1}" loading="lazy">
      </div>`
    )
    .join('');

  // 横图自动加宽（图片加载后根据宽高比判断）
  elements.ring.querySelectorAll('.ring__card img').forEach((img) => {
    if (img.complete && img.naturalWidth) {
      applyCardOrientation(img);
    } else {
      img.addEventListener('load', () => applyCardOrientation(img));
    }
  });
}

/**
 * 根据图片宽高比给卡片加"横图"样式（横图加宽，避免显得太小）
 * @param {HTMLImageElement} img
 */
function applyCardOrientation(img) {
  const card = img.closest('.ring__card');
  if (!card) return;
  card.classList.toggle('ring__card--landscape', img.naturalWidth > img.naturalHeight);
}

/**
 * 当前是否正在后台预加载
 */
let preloadActive = false;

/**
 * 加载环形查看器中当前可见附近的图片（前后各 2 张），
 * 加载完成后自动在浏览器空闲时继续向后预加载剩余图片
 */
function loadNearbyImages() {
  if (!currentAlbum || !elements.ring) return;
  const n = currentAlbum.photos.length;
  const range = 2;
  elements.ring.querySelectorAll('.ring__card img').forEach((img) => {
    if (img.getAttribute('src')) return; // 已加载
    const card = img.closest('.ring__card');
    if (!card) return;
    const idx = Number(card.dataset.idx);
    if (Number.isNaN(idx)) return;
    let diff = ((idx - currentIndex) % n + n) % n;
    if (diff > n / 2) diff -= n;
    if (Math.abs(diff) <= range) {
      img.src = img.dataset.src;
    }
  });
  // 空闲时继续预加载后面的图片
  schedulePreload();
}

/**
 * 逐步预加载剩余图片（从当前向后、再向前），每 80ms 加载一张，持续到全部加载完
 */
function schedulePreload() {
  if (preloadActive) return;
  preloadActive = true;
  const step = () => {
    if (!currentAlbum || !elements.ring) {
      preloadActive = false;
      return;
    }
    const img = findNextUnloaded();
    if (img) {
      img.src = img.dataset.src;
      setTimeout(step, 80);
    } else {
      preloadActive = false;
    }
  };
  setTimeout(step, 80);
}

/**
 * 环形查找下一个未加载的图片（优先向后）
 */
function findNextUnloaded() {
  const imgs = [...elements.ring.querySelectorAll('.ring__card img')];
  const anyUnloaded = imgs.some((img) => !img.getAttribute('src'));
  if (!anyUnloaded) return null;
  const n = currentAlbum.photos.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (currentIndex + step) % n;
    const img = imgs.find((i) => Number(i.closest('.ring__card').dataset.idx) === idx);
    if (img && !img.getAttribute('src')) return img;
  }
  return null;
}

/**
 * 更新环形卡牌位置（只改 CSS 变量，触发平滑过渡）
 */
function updateRing() {
  const n = currentAlbum.photos.length;
  const half = Math.min(4, Math.floor((n - 1) / 2));
  const cards = elements.ring.querySelectorAll('.ring__card');

  cards.forEach((card) => {
    const idx = Number(card.dataset.idx);
    // 计算环形最短偏移
    let offset = ((idx - currentIndex) % n + n) % n;
    if (offset > n / 2) offset -= n;
    if (offset < -n / 2) offset += n;

    const abs = Math.abs(offset);
    const isActive = offset === 0;
    const outside = abs > half;
    const scale = isActive ? 1.1 : Math.max(0.55, 1 - abs * 0.13);
    const opacity = isActive ? 1 : outside ? 0 : Math.max(0.18, 1 - abs * 0.22);

    // 窗口外的卡片禁用过渡（避免从屏幕一边横穿到另一边）
    if (outside) {
      card.style.transition = 'none';
    }
    card.style.setProperty('--o', offset);
    card.style.setProperty('--s', scale);
    card.style.setProperty('--op', opacity);
    card.classList.toggle('ring__card--active', isActive);
    if (outside) {
      void card.offsetWidth; // 强制 reflow
      card.style.transition = '';
    }
  });

  elements.ringCounter.textContent = `${currentIndex + 1} / ${n}`;

  // 按需加载当前附近图片
  loadNearbyImages();
}

/**
 * 加载账号数据（profile.json）并更新页面统计
 */
async function loadProfile() {
  try {
    const response = await fetch('data/profile.json');
    const profile = await response.json();
    applyProfile(profile);
  } catch (error) {
    console.error('加载账号数据失败:', error);
  }
}

/**
 * 将 profile.json 的数据应用到页面
 * @param {Object} profile
 */
function applyProfile(profile) {
  const fmt = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n));

  const statXhs = document.getElementById('statXhsFollowers');
  const statDy = document.getElementById('statDyFollowers');
  const statWorks = document.getElementById('statWorks');
  const xhsFollowers = profile.xiaohongshu ? profile.xiaohongshu.followers : 0;
  const dyFollowers = profile.douyin ? profile.douyin.followers : 0;
  const totalWorks = (profile.xiaohongshu ? (profile.xiaohongshu.notes || 0) : 0)
    + (profile.douyin ? (profile.douyin.works || 0) : 0);
  if (statXhs) animateCount(statXhs, xhsFollowers);
  if (statDy) animateCount(statDy, dyFollowers);
  if (statWorks) animateCount(statWorks, totalWorks);

  const xhsMeta = document.getElementById('xhsMeta');
  const dyMeta = document.getElementById('dyMeta');
  if (xhsMeta && profile.xiaohongshu) {
    xhsMeta.innerHTML = `
      <span>粉丝 ${fmt(profile.xiaohongshu.followers)}</span>
      <span>获赞 ${fmt(profile.xiaohongshu.likes)}</span>
      <span>笔记 ${profile.xiaohongshu.notes} 篇</span>`;
  }
  if (dyMeta && profile.douyin) {
    dyMeta.innerHTML = `
      <span>粉丝 ${fmt(profile.douyin.followers)}</span>
      <span>获赞 ${fmt(profile.douyin.likes)}</span>
      <span>作品 ${profile.douyin.works} 条</span>`;
  }

  const updatedAt = document.getElementById('footerUpdatedAt');
  if (updatedAt && profile.updatedAt) updatedAt.textContent = profile.updatedAt;

  const xhsLink = document.getElementById('xhsLink');
  const dyLink = document.getElementById('dyLink');
  if (xhsLink && profile.xiaohongshu && profile.xiaohongshu.profileUrl) {
    xhsLink.href = profile.xiaohongshu.profileUrl;
  }
  if (dyLink && profile.douyin && profile.douyin.profileUrl) {
    dyLink.href = profile.douyin.profileUrl;
  }
}

/**
 * 数字滚动动画（从 0 数到目标值）
 * @param {HTMLElement} el
 * @param {number} target
 */
function animateCount(el, target) {
  const duration = 1200;
  const start = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmtCount(target * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = fmtCount(target);
    }
  };
  requestAnimationFrame(tick);
}

/**
 * 统计数字格式化（416 / 1.1万）
 * @param {number} n
 * @returns {string}
 */
function fmtCount(n) {
  const rounded = Math.round(n);
  if (rounded >= 10000) return `${(rounded / 10000).toFixed(1)}万`;
  return String(rounded);
}

/**
 * 日期格式化：2026-07 -> 2026.07（用于卡片标签）
 * @param {string} date
 * @returns {string}
 */
function formatAlbumDate(date) {
  return date ? date.replace('-', '.') : '';
}

/**
 * 日期中文格式化：2026-07 -> 2026年7月（用于查看器）
 * @param {string} date
 * @returns {string}
 */
function formatAlbumDateCN(date) {
  if (!date) return '';
  const parts = date.split('-');
  return `${parts[0]} 年 ${Number(parts[1])} 月`;
}


/* ========================================
   全局图片预加载：打开首页后按优先级后台加载所有页面图片
   ======================================== */
const PRELOAD_CONCURRENCY = 4;
let preloadQueue = [];
let preloadIdx = 0;
let preloadActiveCount = 0;
let preloadStarted = false;
let preloadPaused = false;

/** 设备页图片（场景图 + 设备卡片图） */
const PRELOAD_DEVICE_IMAGES = [
  'images/devices/scene.webp',
  'images/devices/device-01-m50.jpg',
  'images/devices/device-02-r7.jpg',
  'images/devices/device-03-lens-15-45.jpg',
  'images/devices/device-04-lens-55-200.jpg',
  'images/devices/device-05-lens-18-150.jpg',
  'images/devices/device-06-instax.jpg',
  'images/devices/device-07-flash-godox.jpg',
  'images/devices/device-08-light-ulanzi.jpg',
  'images/devices/device-09-filter-soft49.jpg',
  'images/devices/device-10-filter-soft55.jpg',
  'images/devices/device-11-filter-star.jpg',
  'images/devices/device-12-filter-nd.jpg',
  'images/devices/device-13-tripod.jpg',
  'images/devices/device-14-bag-crossbody.jpg',
  'images/devices/device-15-bag-backpack.jpg',
];

/** 社媒代表作封面 */
const PRELOAD_MASTERPIECE_IMAGES = [
  'images/masterpiece/1.jpg',
  'images/masterpiece/2.jpg',
  'images/masterpiece/3.jpg',
  'images/masterpiece/4.jpg',
  'images/masterpiece/5.jpg',
  'images/masterpiece/6.jpg',
];

/** 约拍群二维码等关键图 */
const PRELOAD_GROUP_IMAGES = [
  'images/group-xhs.png',
  'images/group-douyin.jpg',
  'images/qr-xhs.jpg',
  'images/qr-douyin.png',
];

/** 启动全局预加载 */
function startGlobalPreload() {
  if (preloadStarted) return;
  if (!allAlbums || !allAlbums.length) {
    // 图集数据尚未就绪，稍后重试（最多等 10 秒）
    if (preloadStarted === false) {
      const retry = preloadRetry || 0;
      if (retry < 10) {
        preloadRetry = retry + 1;
        setTimeout(startGlobalPreload, 1000);
        return;
      }
    }
  }
  preloadStarted = true;
  buildPreloadQueue();
  for (let i = 0; i < PRELOAD_CONCURRENCY; i += 1) pumpPreload();
}
let preloadRetry = 0;

/** 暂停全局预加载（打开图集时优先加载当前图集） */
function pauseGlobalPreload() {
  preloadPaused = true;
}

/** 恢复全局预加载 */
function resumeGlobalPreload() {
  preloadPaused = false;
  if (preloadStarted) pumpPreload();
}

/** 按优先级构建预加载队列：封面/关键图 -> 作品集全部照片（默认热度顺序） */
function buildPreloadQueue() {
  const queue = [];
  const sorted = allAlbums.slice().sort((a, b) => (b.heat || 0) - (a.heat || 0));
  queue.push(...PRELOAD_DEVICE_IMAGES);
  queue.push(...PRELOAD_MASTERPIECE_IMAGES);
  queue.push(...PRELOAD_GROUP_IMAGES);
  sorted.forEach((album) => queue.push(album.cover));
  sorted.forEach((album) => queue.push(...album.photos));
  preloadQueue = [...new Set(queue)];
}

/** 并发滑动窗口：每张完成后再启动下一张 */
function pumpPreload() {
  if (preloadPaused) return;
  while (preloadActiveCount < PRELOAD_CONCURRENCY && preloadIdx < preloadQueue.length) {
    const url = preloadQueue[preloadIdx];
    preloadIdx += 1;
    preloadActiveCount += 1;
    const img = new Image();
    img.onload = img.onerror = () => {
      preloadActiveCount -= 1;
      pumpPreload();
    };
    img.src = url;
  }
}

// 页面资源加载完成后启动全局预加载（延迟一点，避免抢占首屏带宽）
window.addEventListener('load', () => {
  setTimeout(startGlobalPreload, 300);
});

document.addEventListener('DOMContentLoaded', init);
