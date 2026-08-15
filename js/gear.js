/**
 * 设备页脚本
 * 场景图热区 + 分类卡片 + 名称/型号详情弹窗
 */
document.documentElement.classList.add('js');

const $ = (id) => document.getElementById(id);

/** 场景热区位置（中心点 %，来自设计稿标注） */
const HOTSPOTS = [
  { key: 'm50', x: 21.5, y: 39.7, label: 'M50 Mark II' },
  { key: 'r7', x: 35.0, y: 36.0, label: 'R7' },
  { key: 'lens15', x: 45.4, y: 28.9, label: 'EF-M 15-45mm' },
  { key: 'lens55', x: 54.5, y: 29.1, label: 'EF-M 55-200mm' },
  { key: 'lens18', x: 63.9, y: 29.7, label: 'RF-S 18-150mm' },
  { key: 'filters', x: 49.2, y: 45.1, label: '滤镜 ×6' },
  { key: 'instax', x: 78.0, y: 36.0, label: '拍立得 mini12' },
  { key: 'godox', x: 81.7, y: 61.5, label: '神牛 iT22' },
  { key: 'ulanzi', x: 90.1, y: 42.4, label: 'Ulanzi VL49' },
];

let gearItems = [];

async function init() {
  try {
    const res = await fetch('data/gear.json');
    gearItems = await res.json();
  } catch (error) {
    console.warn('加载 data/gear.json 失败，使用内置数据（直接双击打开场景）', error);
    gearItems = Array.isArray(window.GEAR_DATA) ? window.GEAR_DATA : [];
  }
  renderScene();
  renderGear();
  bindModal();
}

/** 渲染场景热区 + 图例 */
function renderScene() {
  const spotEl = $('sceneSpots');
  spotEl.innerHTML = HOTSPOTS.map((h, i) => `
    <button class="scene-spot" style="left:${h.x}%; top:${h.y}%" data-key="${h.key}" aria-label="${h.label}">
      <span class="scene-spot__num">${i + 1}</span>
    </button>`).join('');

  $('sceneLegend').innerHTML = HOTSPOTS.map((h, i) => `
    <span class="scene-legend__item"><i>${i + 1}</i>${h.label}</span>`).join('');

  spotEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.scene-spot');
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === 'filters') {
      openFilterModal();
      return;
    }
    const item = gearItems.find((g) => g.key === key);
    if (item) openModal(item);
  });
}

/** 渲染分类卡片清单 */
function renderGear() {
  const list = $('gearList');
  if (!gearItems.length) {
    list.innerHTML = '<p class="gear-empty">暂无设备数据。</p>';
    return;
  }
  const order = ['机身', '镜头', '拍立得', '滤镜', '灯光'];
  const groups = {};
  gearItems.forEach((item) => {
    (groups[item.category] = groups[item.category] || []).push(item);
  });
  list.innerHTML = order
    .filter((cat) => groups[cat])
    .map((cat) => {
      const items = groups[cat];
      const icon = items[0].icon || '📦';
      return `
      <section class="gear-cat">
        <h2 class="gear-cat__title">${icon} ${cat} <span class="gear-cat__count">${items.length}</span></h2>
        <div class="gear-grid">
          ${items.map((item) => cardHTML(item)).join('')}
        </div>
      </section>`;
    })
    .join('');
}

function cardHTML(item) {
  return `
    <article class="gear-card" data-id="${item.id}" tabindex="0" role="button" aria-label="查看 ${item.name}">
      <div class="gear-card__icon">${item.icon}</div>
      <h3 class="gear-card__name">${item.name}</h3>
      <p class="gear-card__model">${item.model}</p>
      <p class="gear-card__usage">${item.usage}</p>
      <span class="gear-card__more">点击查看详情 →</span>
    </article>`;
}

function bindModal() {
  const modal = $('gearModal');
  const closeBtn = $('gearModalClose');

  $('gearList').addEventListener('click', (e) => {
    const card = e.target.closest('.gear-card');
    if (!card) return;
    const item = gearItems.find((g) => g.id === Number(card.dataset.id));
    if (item) openModal(item);
  });
  $('gearList').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.gear-card');
      if (!card) return;
      e.preventDefault();
      const item = gearItems.find((g) => g.id === Number(card.dataset.id));
      if (item) openModal(item);
    }
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('gear-modal--open')) closeModal();
  });
}

/** 打开单个设备详情（含图片） */
function openModal(item) {
  $('gearModalContent').innerHTML = `
    <div class="gear-modal__icon">${item.icon}</div>
    <h3 class="gear-modal__name">${item.name}</h3>
    <p class="gear-modal__model">${item.model}</p>
    <p class="gear-modal__usage">${item.usage}</p>
    ${item.detail ? `<p class="gear-modal__detail">${item.detail}</p>` : ''}
    ${item.specs && item.specs.length ? `
      <div class="gear-modal__specs">
        ${item.specs.map(([k, v]) => `<div class="gear-modal__spec"><span class="gear-modal__spec-k">${k}</span><span class="gear-modal__spec-v">${v}</span></div>`).join('')}
      </div>` : ''}
  `;
  showModal();
}

/** 打开滤镜清单弹窗（点击单条再进入详情） */
function openFilterModal() {
  const filters = gearItems.filter((g) => g.category === '滤镜');
  $('gearModalContent').innerHTML = `
    <div class="gear-modal__icon">🖼️</div>
    <h3 class="gear-modal__name">滤镜</h3>
    <p class="gear-modal__model">共 5 款 · 6 片 · 点击查看详情</p>
    <div class="gear-filter-list">
      ${filters.map((f) => `
        <button class="gear-filter-item" data-id="${f.id}">
          <span class="gear-filter-item__icon">${f.icon}</span>
          <span class="gear-filter-item__info">
            <span class="gear-filter-item__name">${f.name}</span>
            <span class="gear-filter-item__model">${f.model}</span>
          </span>
          <span class="gear-filter-item__arrow">›</span>
        </button>`).join('')}
    </div>`;
  $('gearModalContent').querySelector('.gear-filter-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.gear-filter-item');
    if (!btn) return;
    const item = gearItems.find((g) => g.id === Number(btn.dataset.id));
    if (item) openModal(item);
  });
  showModal();
}

function showModal() {
  const modal = $('gearModal');
  modal.classList.add('gear-modal--open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = $('gearModal');
  modal.classList.remove('gear-modal--open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', init);
