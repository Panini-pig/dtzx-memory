const state = { videos: [], filtered: [], view: 'timeline', grade: '全部', query: '', className: '3班', eventType: '' };
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const gradeCopy = { 高一: '初见', 高二: '盛夏', 高三: '远行', 毕业后: '余响' };
const classOptions = ['3班', '4班', '19班', '跨班', '校级事件'];

async function boot() {
  const response = await fetch('./videos.json');
  const data = await response.json();
  state.videos = data.videos;
  const parts = state.videos.reduce((sum, v) => sum + (v.parts?.length || 1), 0);
  $('#heroStats').innerHTML = [
    [state.videos.length, '段视频记忆'], [parts, '个影像章节'], [5, '册合集'], ['三年', '共同青春']
  ].map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  bindUI();
  applyFilters();
}

function bindUI() {
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $$('.filter-chip').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter-chip').forEach(x => x.classList.remove('active')); btn.classList.add('active');
    state.grade = btn.dataset.grade; applyFilters();
  }));
  $('#searchToggle').addEventListener('click', () => { $('#searchPanel').classList.toggle('open'); $('#searchInput').focus(); });
  $('#searchInput').addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); applyFilters(); });
  $('#dialogClose').addEventListener('click', closePlayer);
  $('#playerDialog').addEventListener('click', e => { if (e.target === $('#playerDialog')) closePlayer(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#playerDialog').open) closePlayer(); });
}

function switchView(view) {
  const change = () => {
    state.view = view;
    $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === view));
    $$('.view').forEach(x => x.classList.toggle('active', x.dataset.viewPanel === view));
    renderCurrent();
  };
  document.startViewTransition ? document.startViewTransition(change) : change();
}

function applyFilters() {
  state.filtered = state.videos.filter(v => {
    const gradeOK = state.grade === '全部' || v.cohort_grade === state.grade;
    const haystack = [v.title, v.description, v.class_scope, v.event_type, ...(v.all_tags || [])].join(' ').toLowerCase();
    return gradeOK && (!state.query || haystack.includes(state.query));
  });
  $('#resultCount').textContent = `${state.filtered.length} / ${state.videos.length} 段记忆`;
  renderCurrent();
}

function renderCurrent() {
  if (state.view === 'timeline') renderTimeline();
  if (state.view === 'classes') renderClasses();
  if (state.view === 'events') renderEvents();
}

function createCard(video, timeline = false) {
  const fragment = $('#videoCardTemplate').content.cloneNode(true);
  const article = $('.video-card', fragment);
  const image = $('img', fragment);
  image.src = video.cover_url; image.alt = video.title;
  $('.duration', fragment).textContent = video.duration;
  $('.card-kicker', fragment).textContent = `${video.event_date} · ${video.cohort_grade}`;
  $('h3', fragment).textContent = video.title;
  $('.card-tags', fragment).innerHTML = [video.event_type, ...(video.classes || []).slice(0, 1)].filter(Boolean).map(t => `<span>${escapeHTML(t)}</span>`).join('');
  $('.cover-button', fragment).addEventListener('click', () => openPlayer(video));
  if (timeline) article.classList.add('timeline-card-inner');
  return fragment;
}

function renderTimeline() {
  const rail = $('#timelineRail');
  rail.innerHTML = '';
  if (!state.filtered.length) { rail.innerHTML = '<div class="empty">这段时间暂时没有找到对应的影像。</div>'; return; }
  const ordered = [...state.filtered].sort((a,b) => a.event_date.localeCompare(b.event_date));
  ordered.forEach((video, index) => {
    const wrap = document.createElement('div'); wrap.className = `timeline-card${index === 0 ? ' focus' : ''}`;
    wrap.dataset.index = index;
    wrap.innerHTML = `<div class="timeline-marker">${escapeHTML(video.time_tag)}</div>`;
    wrap.append(createCard(video, true)); rail.append(wrap);
  });
  setupTimeline(rail, ordered);
  updateTimelineFocus(0, ordered);
}

function setupTimeline(rail, videos) {
  let down = false, startX = 0, startScroll = 0;
  const scrubber = $('#timelineScrubber');
  scrubber.min = 0; scrubber.max = Math.max(0, videos.length - 1); scrubber.value = 0;
  scrubber.oninput = () => scrollToTimelineIndex(+scrubber.value, false);
  scrubber.onchange = () => scrollToTimelineIndex(+scrubber.value, true);
  rail.onpointerdown = e => { down = true; startX = e.clientX; startScroll = rail.scrollLeft; rail.classList.add('dragging'); rail.setPointerCapture(e.pointerId); };
  rail.onpointermove = e => { if (down) rail.scrollLeft = startScroll - (e.clientX - startX) * 1.3; };
  rail.onpointerup = () => { down = false; rail.classList.remove('dragging'); };
  rail.onwheel = e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); rail.scrollLeft += e.deltaY; } };
  const focusFromScroll = () => {
    const cards = $$('.timeline-card', rail); const center = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, distance = Infinity;
    cards.forEach((card, i) => { const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center); if (d < distance) { distance = d; best = i; } });
    cards.forEach((c,i) => c.classList.toggle('focus', i === best)); updateTimelineFocus(best, videos);
  };
  rail.onscroll = throttle(focusFromScroll, 80);
  setupDial(videos, index => scrollToTimelineIndex(index));
}

function scrollToTimelineIndex(index, smooth = true) {
  const rail = $('#timelineRail'); const card = $$('.timeline-card', rail)[index];
  if (card) rail.scrollTo({ left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
}

function updateTimelineFocus(index, videos) {
  const video = videos[index]; if (!video) return;
  const [year, month = ''] = video.event_date.split('-');
  $('#activeMonth').textContent = `${year} · ${month || '—'}`;
  $('#activeGrade').textContent = `${video.cohort_grade} · ${gradeCopy[video.cohort_grade] || '记忆'}`;
  $('#dialYear').textContent = year; $('#dialMonth').textContent = month ? `${month}月` : '';
  const progress = videos.length <= 1 ? 0 : index / (videos.length - 1);
  const scrubber = $('#timelineScrubber');
  scrubber.max = Math.max(0, videos.length - 1); scrubber.value = index;
  scrubber.style.setProperty('--scrub-progress', `${progress * 100}%`);
  $('#timelinePosition').textContent = `${index + 1} / ${videos.length}`;
  $('.dial-hand').style.transform = `rotate(${progress * 300 - 150}deg)`;
  $('#railProgress').style.width = `${Math.max(3, progress * 100)}%`;
  $('#timeDial').setAttribute('aria-valuenow', index);
}

function setupDial(videos, onChange) {
  const dial = $('#timeDial'); let active = false;
  const pick = e => {
    const r = dial.getBoundingClientRect(), x = e.clientX - r.left - r.width/2, y = e.clientY - r.top - r.height/2;
    let angle = Math.atan2(y,x) * 180 / Math.PI + 90; if (angle < 0) angle += 360;
    const index = Math.round((angle / 360) * (videos.length - 1)); onChange(Math.max(0, Math.min(videos.length - 1, index)));
  };
  dial.onpointerdown = e => { active = true; dial.setPointerCapture(e.pointerId); pick(e); };
  dial.onpointermove = e => { if (active) pick(e); }; dial.onpointerup = () => active = false;
  dial.onwheel = e => { e.preventDefault(); const current = +dial.getAttribute('aria-valuenow') || 0; onChange(Math.max(0, Math.min(videos.length - 1, current + Math.sign(e.deltaY)))); };
  dial.onkeydown = e => { if (['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)) { e.preventDefault(); const d = ['ArrowRight','ArrowUp'].includes(e.key) ? 1 : -1; const current = +dial.getAttribute('aria-valuenow') || 0; onChange(Math.max(0, Math.min(videos.length - 1, current+d))); } };
}

function classVideos(name) {
  if (name === '跨班') return state.filtered.filter(v => (v.classes || []).includes('跨班'));
  if (name === '校级事件') return state.filtered.filter(v => !(v.classes || []).some(c => ['3班','4班','19班'].includes(c)));
  return state.filtered.filter(v => (v.classes || []).includes(name));
}

function renderClasses() {
  const tabs = $('#classTabs');
  tabs.innerHTML = classOptions.map(c => `<button class="class-tab${c===state.className?' active':''}" data-class="${c}">${c}<sup> ${classVideos(c).length}</sup></button>`).join('');
  $$('.class-tab', tabs).forEach(btn => btn.addEventListener('click', () => { state.className = btn.dataset.class; renderClasses(); }));
  const videos = classVideos(state.className).sort((a,b) => a.event_date.localeCompare(b.event_date));
  const feature = videos.find(v => ['毕业与告别','典礼与大会','文化艺术与演出'].includes(v.event_type)) || videos[0];
  const banner = $('#classFeature');
  if (feature) banner.innerHTML = `<img src="${feature.cover_url}" referrerpolicy="no-referrer" alt="${escapeHTML(feature.title)}"><div class="feature-copy"><span>${feature.event_date} · ${state.className}</span><h3>${escapeHTML(feature.title)}</h3><p>${escapeHTML(feature.description || '那一天的声音、光线和笑脸，都留在这一帧里。')}</p><button id="featurePlay">播放这段记忆 ▶</button></div>`;
  else banner.innerHTML = '<div class="empty">当前筛选下没有这类班级记忆。</div>';
  if (feature) $('#featurePlay').onclick = () => openPlayer(feature);
  renderGrid($('#classGrid'), videos.filter(v => v !== feature));
}

function renderEvents() {
  const counts = new Map(); state.filtered.forEach(v => counts.set(v.event_type, (counts.get(v.event_type)||0)+1));
  const types = [...counts.entries()].sort((a,b) => b[1]-a[1]);
  if (!types.some(([t]) => t === state.eventType)) state.eventType = types[0]?.[0] || '';
  $('#eventMap').innerHTML = types.map(([t,n]) => `<button class="event-node${t===state.eventType?' active':''}" data-event="${escapeHTML(t)}">${escapeHTML(t)}<em>${n}</em></button>`).join('');
  $$('.event-node').forEach(btn => btn.addEventListener('click', () => { state.eventType = btn.dataset.event; renderEvents(); }));
  const videos = state.filtered.filter(v => v.event_type === state.eventType).sort((a,b) => a.event_date.localeCompare(b.event_date));
  const grades = [...new Set(videos.map(v => v.cohort_grade))].join(' · ');
  $('#eventSummary').innerHTML = `<h3>${escapeHTML(state.eventType || '暂无结果')}</h3><p>${videos.length} 段影像 · ${grades}</p>`;
  renderGrid($('#eventGrid'), videos);
}

function renderGrid(root, videos) {
  root.innerHTML = '';
  if (!videos.length) { root.innerHTML = '<div class="empty">当前筛选下没有找到对应的影像。</div>'; return; }
  videos.forEach(v => root.append(createCard(v)));
}

function openPlayer(video) {
  $('#playerTitle').textContent = video.title; $('#playerDate').textContent = `${video.event_date} · ${video.cohort_grade}`;
  $('#playerLink').href = video.video_url;
  $('#playerFrame').src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.bvid)}&page=1&high_quality=1&autoplay=0`;
  $('#playerDialog').showModal(); document.body.style.overflow = 'hidden';
}
function closePlayer() { $('#playerFrame').src = 'about:blank'; $('#playerDialog').close(); document.body.style.overflow = ''; }
function escapeHTML(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function throttle(fn, wait) { let locked = false; return (...args) => { if (locked) return; locked = true; requestAnimationFrame(() => { fn(...args); setTimeout(() => locked=false, wait); }); }; }

boot().catch(err => { console.error(err); $('#resultCount').textContent = '记忆档案加载失败'; });
