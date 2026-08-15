/**
 * 数据看板脚本
 * 读取 data/stats-history.json，渲染统计卡片、趋势图、对比图与历史表格
 */
document.documentElement.classList.add('js');

/** @type {HTMLElement} */
const $ = (id) => document.getElementById(id);

async function init() {
  let data;
  try {
    const res = await fetch('data/stats-history.json');
    data = await res.json();
  } catch (error) {
    // 直接双击打开（file://）时浏览器会拦截 fetch，改用内置数据
    console.warn('加载 data/stats-history.json 失败，使用内置数据（直接双击打开的场景）', error);
    data = window.STATS_DATA || null;
  }
  if (data && Array.isArray(data.records)) {
    render(data.records, data.updatedAt || '—');
  } else {
    $('statCards').innerHTML =
      '<p class="empty-chart">数据加载失败：请确认 data/stats-history.json 存在。</p>';
  }
}

function render(records, updatedAt) {
  $('updatedAt').textContent = updatedAt;
  if (!records.length) {
    $('statCards').innerHTML = '<p class="empty-chart">暂无数据记录。</p>';
    return;
  }
  renderCards(records);
  renderTrends(records);
  renderCompare(records[records.length - 1]);
  renderTable(records);
}

/** 数字格式化（≤9999 原样，≥1万 显示 x.x万） */
function fmt(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(Math.round(n));
}

/** 短数字格式化（用于坐标轴） */
function fmtAxis(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function renderCards(records) {
  const latest = records[records.length - 1];
  const prev = records.length >= 2 ? records[records.length - 2] : null;
  const delta = (cur, pre) => (prev == null ? '' : `<span class="stat-card__delta">${cur - pre >= 0 ? '+' : ''}${cur - pre}</span>`);

  const items = [
    { label: '小红书粉丝', value: fmt(latest.xiaohongshu.followers), d: delta(latest.xiaohongshu.followers, prev && prev.xiaohongshu.followers), cls: 'xhs' },
    { label: '小红书获赞', value: fmt(latest.xiaohongshu.likes), d: delta(latest.xiaohongshu.likes, prev && prev.xiaohongshu.likes), cls: 'xhs' },
    { label: '小红书笔记', value: String(latest.xiaohongshu.notes), d: delta(latest.xiaohongshu.notes, prev && prev.xiaohongshu.notes), cls: 'xhs' },
    { label: '抖音粉丝', value: fmt(latest.douyin.followers), d: delta(latest.douyin.followers, prev && prev.douyin.followers), cls: 'dy' },
    { label: '抖音获赞', value: fmt(latest.douyin.likes), d: delta(latest.douyin.likes, prev && prev.douyin.likes), cls: 'dy' },
    { label: '抖音作品', value: String(latest.douyin.works), d: delta(latest.douyin.works, prev && prev.douyin.works), cls: 'dy' },
  ];
  $('statCards').innerHTML = items
    .map(
      (c) => `
    <div class="stat-card stat-card--${c.cls}">
      <span class="stat-card__label">${c.label}</span>
      <span class="stat-card__value">${c.value}</span>
      ${c.d}
    </div>`
    )
    .join('');
}

function renderTrends(records) {
  const hint = $('trendHint');
  if (records.length < 2) {
    hint.textContent = '目前只有 1 次记录，更新一次数据后即可看到趋势曲线。';
    $('chartFollowers').innerHTML = '<p class="empty-chart">数据点不足，暂无法绘制趋势图</p>';
    $('chartLikes').innerHTML = '<p class="empty-chart">数据点不足，暂无法绘制趋势图</p>';
    return;
  }
  hint.textContent = `共 ${records.length} 次记录 · ${records[0].date} 至 ${records[records.length - 1].date}`;
  $('chartFollowers').innerHTML = lineChart([
    { label: '小红书粉丝', color: '#ff2442', data: records.map((r) => ({ date: r.date, v: r.xiaohongshu.followers })) },
    { label: '抖音粉丝', color: '#7c5cbf', data: records.map((r) => ({ date: r.date, v: r.douyin.followers })) },
  ]);
  $('chartLikes').innerHTML = lineChart([
    { label: '小红书获赞', color: '#ff2442', data: records.map((r) => ({ date: r.date, v: r.xiaohongshu.likes })) },
    { label: '抖音获赞', color: '#7c5cbf', data: records.map((r) => ({ date: r.date, v: r.douyin.likes })) },
  ]);
}

/** 折线图（纯 SVG） */
function lineChart(series) {
  const W = 560;
  const H = 260;
  const PAD = { top: 24, right: 20, bottom: 44, left: 60 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = series[0].data.length;
  const all = series.flatMap((s) => s.data.map((d) => d.v));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const xAt = (i) => PAD.left + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const yAt = (v) => PAD.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + ((yMax - yMin) * i) / 4;
    const y = yAt(yv);
    grid += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e8e0f0" stroke-width="1"/>`;
    grid += `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#958da8">${fmtAxis(yv)}</text>`;
  }

  const paths = series
    .map((s) => {
      const pts = s.data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(d.v)}`).join(' ');
      const dots = s.data
        .map((d, i) => `<circle cx="${xAt(i)}" cy="${yAt(d.v)}" r="3.5" fill="${s.color}"><title>${d.date} · ${fmt(d.v)}</title></circle>`)
        .join('');
      return `<path d="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    })
    .join('');

  const xLabels = series[0].data
    .map((d, i) => {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      return `<text x="${xAt(i)}" y="${H - PAD.bottom + 18}" text-anchor="${anchor}" font-size="11" fill="#958da8">${fmtDateAxis(d.date)}</text>`;
    })
    .join('');

  const legend = series
    .map((s) => `<span class="legend"><i style="background:${s.color}"></i>${s.label}</span>`)
    .join('');

  return `<div class="chart">${legend}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="趋势折线图">${grid}${paths}${xLabels}</svg></div>`;
}

/** 横轴日期短格式：2026-08-15 -> 8.15 */
function fmtDateAxis(date) {
  if (!date) return '';
  const parts = date.split('-');
  return `${Number(parts[1])}.${Number(parts[2])}`;
}

/** 分组柱状图（最新一次记录，两平台对比） */
function renderCompare(latest) {
  const groups = [
    { label: '粉丝', xhs: latest.xiaohongshu.followers, dy: latest.douyin.followers },
    { label: '获赞', xhs: latest.xiaohongshu.likes, dy: latest.douyin.likes },
    { label: '作品/笔记', xhs: latest.xiaohongshu.notes, dy: latest.douyin.works },
  ];
  const W = 560;
  const H = 260;
  const PAD = { top: 30, right: 20, bottom: 40, left: 64 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...groups.flatMap((g) => [g.xhs, g.dy]));
  const yMax = maxV * 1.15 || 1;
  const groupW = iw / groups.length;
  const barW = Math.min(44, groupW * 0.28);

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const yv = (yMax * i) / 4;
    const y = PAD.top + ih - (yv / yMax) * ih;
    grid += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e8e0f0" stroke-width="1"/>`;
    grid += `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#958da8">${fmtAxis(yv)}</text>`;
  }

  const bars = groups
    .map((g, gi) => {
      const cx = PAD.left + groupW * gi + groupW / 2;
      const x1 = cx - barW - 4;
      const x2 = cx + 4;
      const h1 = (g.xhs / yMax) * ih;
      const h2 = (g.dy / yMax) * ih;
      const y1 = PAD.top + ih - h1;
      const y2 = PAD.top + ih - h2;
      const labelY = PAD.top + ih + 24;
      return `
        <rect x="${x1}" y="${y1}" width="${barW}" height="${h1}" rx="4" fill="#ff2442">
          <title>小红书 ${g.label}: ${fmt(g.xhs)}</title>
        </rect>
        <text x="${x1 + barW / 2}" y="${y1 - 6}" text-anchor="middle" font-size="11" fill="#ff2442">${fmt(g.xhs)}</text>
        <rect x="${x2}" y="${y2}" width="${barW}" height="${h2}" rx="4" fill="#7c5cbf">
          <title>抖音 ${g.label}: ${fmt(g.dy)}</title>
        </rect>
        <text x="${x2 + barW / 2}" y="${y2 - 6}" text-anchor="middle" font-size="11" fill="#7c5cbf">${fmt(g.dy)}</text>
        <text x="${cx}" y="${labelY}" text-anchor="middle" font-size="12" fill="#6b6280">${g.label}</text>`;
    })
    .join('');

  const legend =
    '<span class="legend"><i style="background:#ff2442"></i>小红书</span><span class="legend"><i style="background:#7c5cbf"></i>抖音</span>';

  $('chartCompare').innerHTML = `<div class="chart">${legend}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="平台对比柱状图">${grid}${bars}</svg></div>`;
}

function renderTable(records) {
  const rows = [...records]
    .reverse()
    .map(
      (r) => `
    <tr>
      <td>${r.date}</td>
      <td>${fmt(r.xiaohongshu.followers)}</td>
      <td>${fmt(r.xiaohongshu.likes)}</td>
      <td>${r.xiaohongshu.notes}</td>
      <td>${fmt(r.douyin.followers)}</td>
      <td>${fmt(r.douyin.likes)}</td>
      <td>${r.douyin.works}</td>
    </tr>`
    )
    .join('');
  document.querySelector('#statsTable tbody').innerHTML = rows;
}

/** 滚动渐显 */
function bindReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('revealed'));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  items.forEach((el) => obs.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  bindReveal();
  init();
});
