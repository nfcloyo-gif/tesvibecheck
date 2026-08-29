// ==============================================================
// VIBECHECK ENGINE - LITE VERSION (No Video Alarm)
// ==============================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(()=>{}); });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('btn-install').classList.remove('hidden');
});
document.getElementById('btn-install').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('btn-install').classList.add('hidden');
    deferredPrompt = null;
  }
});

let db;
let currentDate = new Date();
let reminderEngineInterval = null;
let chartInstance = null;
let monthlyChartInstance = null;
let calViewDate = new Date();
let eventImageBlob = null; 
let currentEditEventId = null;
let currentJournalImageBlob = null;

const catColors = { 
  'Kerja': 'text-blue-400 border-blue-500/50 bg-blue-500/10', 
  'Kesehatan': 'text-green-400 border-green-500/50 bg-green-500/10', 
  'Personal': 'text-blue-400 border-blue-500/50 bg-blue-500/10', 
  'Belajar': 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10',
  'Istirahat': 'text-indigo-400 border-indigo-500/50 bg-indigo-500/10'
};

const liburNasional = {
  "2026-01-01": "Tahun Baru Masehi", "2026-02-18": "Isra Mikraj", "2026-03-03": "Hari Raya Nyepi",
  "2026-03-20": "Idul Fitri", "2026-03-21": "Idul Fitri", "2026-04-03": "Wafat Isa Al Masih",
  "2026-05-01": "Hari Buruh", "2026-05-14": "Kenaikan Isa Al Masih", "2026-05-27": "Idul Adha",
  "2026-06-01": "Lahir Pancasila", "2026-06-16": "Tahun Baru Islam", "2026-08-17": "Kemerdekaan RI",
  "2026-08-25": "Maulid Nabi", "2026-12-25": "Hari Raya Natal"
};

function getLocalISODate(dateObj) {
  const offset = dateObj.getTimezoneOffset() * 60000;
  return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
}

async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('VibeCheckEngineDB', 3);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if(!database.objectStoreNames.contains('tasks')) database.createObjectStore('tasks', { keyPath: 'id' });
      if(!database.objectStoreNames.contains('journal')) database.createObjectStore('journal', { keyPath: 'id' });
      if(!database.objectStoreNames.contains('events')) database.createObjectStore('events', { keyPath: 'id' });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

const dbAct = {
  add: (store, data) => new Promise(res => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(data); tx.oncomplete = res; }),
  get: (store, id) => new Promise(res => { const req = db.transaction(store).objectStore(store).get(id); req.onsuccess = () => res(req.result); }),
  getAll: (store) => new Promise(res => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result); }),
  del: (store, id) => new Promise(res => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = res; })
};

// NAVIGASI TAB
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(b => {
      b.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-violet-600', 'text-white', 'shadow-md'); 
      b.classList.add('text-gray-400', 'hover:bg-white/5');
    });
    document.getElementById(`content-${btn.dataset.tab}`).classList.remove('hidden');
    btn.classList.add('bg-gradient-to-r', 'from-blue-600', 'to-violet-600', 'text-white', 'shadow-md'); 
    btn.classList.remove('text-gray-400', 'hover:bg-white/5');
    
    if (btn.dataset.tab === 'jadwal') renderTasks();
    if (btn.dataset.tab === 'jurnal') loadJournal();
    if (btn.dataset.tab === 'statistik') renderStatsTab();
  });
});

['input-date', 'input-journal-date'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => { currentDate = new Date(e.target.value); updateDateUI(); renderTasks(); loadJournal(); });
});

function changeDate(days) { currentDate.setDate(currentDate.getDate() + days); updateDateUI(); renderTasks(); loadJournal(); }
document.getElementById('btn-prev-date').onclick = () => changeDate(-1);
document.getElementById('btn-next-date').onclick = () => changeDate(1);
document.getElementById('btn-prev-journal-date').onclick = () => changeDate(-1);
document.getElementById('btn-next-journal-date').onclick = () => changeDate(1);

function updateDateUI() {
  const dStr = getLocalISODate(currentDate);
  document.getElementById('input-date').value = dStr;
  document.getElementById('input-journal-date').value = dStr;
  document.getElementById('display-date').innerText = currentDate.toLocaleDateString('id-ID', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
function updateOnlineStatus() {
  const txt = document.getElementById('status-text');
  const iconWrap = document.getElementById('status-icon-wrapper');
  if(navigator.onLine) { 
    txt.textContent = "System Ready ⚡"; txt.className = "font-bold text-gray-200 text-sm tracking-wide"; 
    iconWrap.innerHTML = '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><i data-lucide="wifi" class="relative inline-flex rounded-full w-4 h-4 text-blue-400"></i>';
  } else { 
    txt.textContent = "Offline Mode 🛡️"; txt.className = "font-bold text-gray-400 text-sm tracking-wide"; 
    iconWrap.innerHTML = '<i data-lucide="wifi-off" class="relative inline-flex rounded-full w-4 h-4 text-gray-500"></i>';
  }
  if(window.lucide) lucide.createIcons();
}

// ==========================================
// MESIN 1: TUGAS LITE (String Builder Anti-Lag)
// ==========================================
async function renderTasks() {
  const dateStr = getLocalISODate(currentDate);
  let allTasks = await dbAct.getAll('tasks');
  let dayTasks = allTasks.filter(t => t.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));

  if (dayTasks.length === 0 && allTasks.length > 0) {
    const uniqueDates = [...new Set(allTasks.map(t => t.date))].sort().reverse();
    let sourceDate = uniqueDates.find(d => d < dateStr) || uniqueDates[0]; 
    const tasksToCopy = allTasks.filter(t => t.date === sourceDate);
    if (tasksToCopy.length > 0) {
      for (const t of tasksToCopy) {
        await dbAct.add('tasks', { ...t, id: `t_${Date.now()}_${Math.random()}`, date: dateStr, completed: false });
      }
      allTasks = await dbAct.getAll('tasks');
      dayTasks = allTasks.filter(t => t.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));
    }
  }

  let htmlString = '';
  let comp = 0;

  if (dayTasks.length === 0) {
    htmlString = '<div class="glass-card rounded-3xl p-8 text-center text-gray-500 font-bold border-dashed border-2 border-gray-700">Tidak ada jadwal. Ambil nafas sejenak! 🛌</div>';
  } else {
    dayTasks.forEach(t => {
      if(t.completed) comp++;
      const colorCls = catColors[t.category] || 'text-gray-400 border-gray-500/50 bg-gray-500/10';
      
      htmlString += `
        <div class="bg-[#1a1f2e] p-4 rounded-xl border border-white/5 flex items-center gap-4 transition-all hover:bg-[#202638] group shadow-sm relative overflow-hidden">
          <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask('${t.id}', this.checked)" class="task-cb ml-2" />
          <div class="flex-1 overflow-hidden">
            <p class="font-bold text-[15px] ${t.completed ? 'line-through text-gray-500' : 'text-gray-200'} flex items-center gap-2 truncate">
              ${t.title} 
            </p>
            <div class="flex items-center gap-3 mt-1.5">
              <span class="text-xs font-semibold text-gray-400">${t.time}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${colorCls}">${t.category}</span>
            </div>
          </div>
          <button onclick="deleteTask('${t.id}')" class="p-2 text-red-400 hover:text-red-300 opacity-70 hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
        </div>`;
    });
  }

  document.getElementById('task-list-container').innerHTML = htmlString;
  document.getElementById('stat-total').innerText = dayTasks.length;
  document.getElementById('stat-completed').innerText = comp;
  
  if(window.lucide) lucide.createIcons();
  renderChart(allTasks);
  renderDailyBanner(dateStr);
}

async function toggleTask(id, isC) { const t = await dbAct.get('tasks', id); t.completed = isC; await dbAct.add('tasks', t); renderTasks(); }
async function deleteTask(id) { if(confirm('Hapus tugas ini?')) { await dbAct.del('tasks', id); renderTasks(); } }

async function saveNewTask() {
  const title = document.getElementById('t-title').value, time = document.getElementById('t-time').value;
  if(!title || !time) return alert('Nama dan Waktu tugas harus diisi!');

  await dbAct.add('tasks', {
    id: `t_${Date.now()}`, title, time, category: document.getElementById('t-category').value, date: getLocalISODate(currentDate), completed: false
  });
  document.getElementById('t-title').value = ''; renderTasks();
}

// ==========================================
// MESIN 2: KALENDER & EVENT BANNER
// ==========================================
async function renderDailyBanner(dateStr) {
  let bannerHTML = '';
  let hasEvent = false;

  const holidayName = liburNasional[dateStr];
  if (holidayName) {
    hasEvent = true;
    bannerHTML += `
      <div class="bg-gradient-to-r from-red-600 to-red-800 rounded-3xl p-6 mb-4 shadow-[0_0_20px_rgba(220,38,38,0.3)] border border-red-500/50 flex items-center gap-5">
        <div class="p-4 bg-white/20 rounded-2xl backdrop-blur-sm"><i data-lucide="flag" class="w-8 h-8 text-white"></i></div>
        <div>
          <p class="text-red-200 text-[10px] font-black tracking-widest uppercase mb-1">Peringatan / Libur Nasional</p>
          <h3 class="text-2xl font-black text-white leading-tight">${holidayName}</h3>
        </div>
      </div>`;
  }

  const allEvents = await dbAct.getAll('events');
  const dayEvents = allEvents.filter(e => e.date === dateStr);
  
  for(const ev of dayEvents) {
    hasEvent = true;
    let imgHTML = '';
    if(ev.imageBlob) {
      const imgUrl = URL.createObjectURL(ev.imageBlob);
      imgHTML = `<img src="${imgUrl}" class="w-full h-56 object-cover rounded-2xl mb-5 border border-white/10 shadow-lg">`;
    }
    bannerHTML += `
      <div class="bg-[#151923] rounded-3xl p-6 mb-4 border-l-4 border-l-blue-500 shadow-xl border-y border-r border-white/5 relative overflow-hidden transition-all hover:-translate-y-1">
        ${imgHTML}
        <p class="text-blue-400 text-[10px] font-black tracking-widest uppercase mb-2 flex items-center gap-2"><i data-lucide="calendar-star" class="w-4 h-4"></i> Event Khusus Anda</p>
        <h3 class="text-2xl font-black text-white mb-2">${ev.title}</h3>
        ${ev.description ? `<p class="text-gray-400 text-sm font-medium mb-5 bg-black/30 p-4 rounded-xl border border-white/5">${ev.description}</p>` : ''}
        <button onclick="editEventObj('${ev.id}')" class="bg-white/10 hover:bg-blue-500/20 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-2 w-full sm:w-auto"><i data-lucide="pencil" class="w-4 h-4"></i> Edit / Hapus Event</button>
      </div>`;
  }

  const bannerContainer = document.getElementById('daily-event-banner');
  bannerContainer.innerHTML = bannerHTML;
  bannerContainer.style.display = hasEvent ? 'block' : 'none';
  if(window.lucide) lucide.createIcons();
}

async function renderCalendar() {
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = getLocalISODate(new Date());

  const allTasks = await dbAct.getAll('tasks');
  const allEvents = await dbAct.getAll('events');

  let calHTML = '';
  for (let i = 0; i < firstDay; i++) { calHTML += `<div class="day-cell other-month"></div>`; }

  for (let i = 1; i <= daysInMonth; i++) {
    const loopDate = new Date(year, month, i);
    const dateStr = getLocalISODate(loopDate);
    const isToday = dateStr === todayStr;
    
    const dayTasks = allTasks.filter(t => t.date === dateStr);
    let dotsHTML = '';
    if(dayTasks.length > 0) {
      const maxDots = Math.min(dayTasks.length, 5); 
      for(let d=0; d<maxDots; d++) dotsHTML += `<div class="quest-dot"></div>`;
    }

    let badgesHTML = '';
    const holiday = liburNasional[dateStr];
    if (holiday) badgesHTML += `<div class="event-badge bg-red-600 text-white font-black truncate border border-red-400" title="${holiday}">${holiday}</div>`;

    const dayEvents = allEvents.filter(e => e.date === dateStr);
    dayEvents.forEach(e => {
      badgesHTML += `<div class="event-badge ev-${e.category}" onclick="editEventObj('${e.id}'); event.stopPropagation();">${e.title}</div>`;
    });

    calHTML += `
      <div class="day-cell ${isToday ? 'today' : ''}" onclick="selectDateFromCalendar('${dateStr}')">
        <div class="day-number">${i}</div>
        <div class="quest-dots">${dotsHTML}</div>
        <div class="event-badges">${badgesHTML}</div>
      </div>`;
  }
  document.getElementById('calendar-grid').innerHTML = calHTML;
}

function openCalendarModal() {
  const modal = document.getElementById('calendar-overlay');
  modal.classList.remove('hidden'); modal.style.display = 'block'; document.body.style.overflow = 'hidden';
  calViewDate = new Date(currentDate); renderCalendar();
}
function closeCalendarModal() {
  const modal = document.getElementById('calendar-overlay');
  modal.classList.add('hidden'); modal.style.display = 'none'; document.body.style.overflow = 'auto';
}
function calPrevMonth() { calViewDate.setMonth(calViewDate.getMonth() - 1); renderCalendar(); }
function calNextMonth() { calViewDate.setMonth(calViewDate.getMonth() + 1); renderCalendar(); }
function selectDateFromCalendar(dateStr) { currentDate = new Date(dateStr); updateDateUI(); renderTasks(); loadJournal(); closeCalendarModal(); }

// EVENT CRUD
function openAddEventModal() {
  currentEditEventId = null;
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-title').value = '';
  document.getElementById('ev-date').value = getLocalISODate(calViewDate);
  document.getElementById('ev-desc').value = '';
  document.getElementById('ev-reminder').value = '0';
  document.getElementById('ev-preview-img').style.display = 'none';
  eventImageBlob = null;
  document.getElementById('btn-ev-delete').classList.add('hidden');
  const modal = document.getElementById('modal-event-form');
  modal.classList.remove('hidden'); modal.style.display = 'flex'; 
}
function closeEventModal() { document.getElementById('modal-event-form').classList.add('hidden'); document.getElementById('modal-event-form').style.display = 'none'; }
async function previewEvImage(e) {
  const file = e.target.files[0];
  if(file) {
    eventImageBlob = new Blob([await file.arrayBuffer()], { type: file.type });
    const img = document.getElementById('ev-preview-img');
    img.src = URL.createObjectURL(eventImageBlob); img.style.display = 'block';
  }
}
async function saveEventData() {
  const title = document.getElementById('ev-title').value, date = document.getElementById('ev-date').value;
  if(!title || !date) return alert('Judul dan Tanggal wajib diisi!');
  await dbAct.add('events', {
    id: currentEditEventId || `ev_${Date.now()}`, title: title, date: date, category: document.getElementById('ev-category').value,
    description: document.getElementById('ev-desc').value, reminderDays: parseInt(document.getElementById('ev-reminder').value),
    reminderTriggeredDate: null, imageBlob: eventImageBlob 
  });
  closeEventModal();
  if(document.getElementById('calendar-overlay').style.display !== 'none') renderCalendar();
  renderTasks(); checkEventReminders();
}
async function editEventObj(id) {
  const ev = await dbAct.get('events', id); if(!ev) return;
  currentEditEventId = ev.id;
  document.getElementById('ev-id').value = ev.id; document.getElementById('ev-title').value = ev.title;
  document.getElementById('ev-date').value = ev.date; document.getElementById('ev-category').value = ev.category;
  document.getElementById('ev-desc').value = ev.description; document.getElementById('ev-reminder').value = ev.reminderDays || 0;
  eventImageBlob = ev.imageBlob;
  const img = document.getElementById('ev-preview-img');
  if(ev.imageBlob) { img.src = URL.createObjectURL(ev.imageBlob); img.style.display = 'block'; } else { img.style.display = 'none'; }
  document.getElementById('btn-ev-delete').classList.remove('hidden');
  const modal = document.getElementById('modal-event-form'); modal.classList.remove('hidden'); modal.style.display = 'flex';
}
async function deleteEvent() {
  if(!currentEditEventId) return;
  if(confirm('Hapus event ini?')) {
    await dbAct.del('events', currentEditEventId); closeEventModal();
    if(document.getElementById('calendar-overlay').style.display !== 'none') renderCalendar();
    renderTasks();
  }
}

// MESIN PENGINGAT KALENDER (H-X)
async function checkEventReminders() {
  const events = await dbAct.getAll('events');
  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = getLocalISODate(today);

  for(const ev of events) {
    if(!ev.reminderDays || ev.reminderDays === 0 || ev.reminderTriggeredDate === todayIso) continue; 
    const evDate = new Date(ev.date); evDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays === ev.reminderDays || diffDays === 0) {
      document.getElementById('rmd-title').innerText = ev.title;
      document.getElementById('rmd-desc').innerText = ev.description || 'Persiapkan dirimu, hari H hampir tiba!';
      document.getElementById('rmd-days').innerText = diffDays === 0 ? 'HARI INI! 🎉' : `H-${diffDays} MENUJU HARI H`;
      const imgEl = document.getElementById('rmd-img');
      if(ev.imageBlob) { imgEl.src = URL.createObjectURL(ev.imageBlob); imgEl.style.display = 'block'; } else { imgEl.style.display = 'none'; }
      
      const popup = document.getElementById('reminder-popup');
      popup.classList.remove('hidden'); popup.style.display = 'flex';
      ev.reminderTriggeredDate = todayIso; await dbAct.add('events', ev); break; 
    }
  }
}
function closeReminderPopup() { document.getElementById('reminder-popup').classList.add('hidden'); document.getElementById('reminder-popup').style.display = 'none'; }


// ==========================================
// MESIN 3: JURNAL & PDF
// ==========================================
document.querySelectorAll('.mood-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if(e.target.disabled) return;
    document.querySelectorAll('.mood-btn').forEach(b => { b.classList.remove('bg-violet-500/20', 'border-violet-500', 'text-white'); b.classList.add('border-gray-700', 'text-gray-400'); });
    btn.classList.add('bg-violet-500/20', 'border-violet-500', 'text-white'); btn.classList.remove('border-gray-700', 'text-gray-400');
    document.getElementById('j-mood').value = btn.dataset.mood;
  });
});

async function handleJournalPhoto(e) {
  const file = e.target.files[0]; if(!file) return;
  if(file.size > 5*1024*1024) return alert('Maksimal foto 5MB ya! ✋');
  currentJournalImageBlob = new Blob([await file.arrayBuffer()], { type: file.type });
  document.getElementById('j-photo-preview').src = URL.createObjectURL(currentJournalImageBlob);
  document.getElementById('j-photo-preview-container').classList.remove('hidden');
}
function removeJournalPhoto() {
  currentJournalImageBlob = null; document.getElementById('j-photo-input').value = '';
  document.getElementById('j-photo-preview-container').classList.add('hidden');
}

async function loadJournal() {
  const dStr = getLocalISODate(currentDate), today = getLocalISODate(new Date());
  const isToday = (dStr === today);
  const data = await dbAct.get('journal', dStr) || {};

  document.getElementById('j-tujuan').value = data.tujuan || '';
  document.getElementById('j-prioritas').value = data.prioritas || '';
  document.getElementById('j-energi-pagi').value = data.ePagi || 5; document.getElementById('val-energi-pagi').innerText = (data.ePagi || 5)+'/10';
  document.getElementById('j-pencapaian').value = data.pencapaian || '';
  document.getElementById('j-syukur').value = data.syukur || '';
  document.getElementById('j-energi-malam').value = data.eMalam || 5; document.getElementById('val-energi-malam').innerText = (data.eMalam || 5)+'/10';
  
  const savedMood = data.mood || ''; document.getElementById('j-mood').value = savedMood;
  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.remove('bg-violet-500/20', 'border-violet-500', 'text-white'); b.classList.add('border-gray-700', 'text-gray-400');
    if(b.dataset.mood === savedMood) { b.classList.add('bg-violet-500/20', 'border-violet-500', 'text-white'); b.classList.remove('border-gray-700', 'text-gray-400'); }
  });

  if(data.imageBlob) {
    currentJournalImageBlob = data.imageBlob;
    document.getElementById('j-photo-preview').src = URL.createObjectURL(currentJournalImageBlob);
    document.getElementById('j-photo-preview-container').classList.remove('hidden');
  } else { removeJournalPhoto(); }

  document.getElementById('journal-readonly-warning').style.display = isToday ? 'none' : 'flex';
  document.getElementById('btn-save-journal').style.display = isToday ? 'flex' : 'none';
  document.querySelectorAll('.j-input').forEach(el => { el.disabled = !isToday; el.style.opacity = isToday ? '1' : '0.4'; el.style.cursor = isToday ? 'auto' : 'not-allowed'; });

  const allJ = await dbAct.getAll('journal');
  document.getElementById('j-stat-total').innerText = allJ.length;
  document.getElementById('j-stat-month').innerText = allJ.filter(j => j.date.startsWith(today.substring(0,7))).length;
  let streak = 0, cd = new Date();
  while(true) {
    const cStr = getLocalISODate(cd);
    if(allJ.find(j => j.date === cStr)) { streak++; cd.setDate(cd.getDate()-1); }
    else if(cStr === today) { cd.setDate(cd.getDate()-1); } else break;
  }
  document.getElementById('j-stat-streak').innerText = streak;
}

async function saveJournalLogic() {
  await dbAct.add('journal', {
    id: getLocalISODate(currentDate), date: getLocalISODate(currentDate),
    tujuan: document.getElementById('j-tujuan').value, prioritas: document.getElementById('j-prioritas').value, ePagi: document.getElementById('j-energi-pagi').value,
    pencapaian: document.getElementById('j-pencapaian').value, syukur: document.getElementById('j-syukur').value, eMalam: document.getElementById('j-energi-malam').value, mood: document.getElementById('j-mood').value,
    imageBlob: currentJournalImageBlob
  });
  alert('Vibes dan memori terkunci! 🔒✨'); loadJournal();
}


// ==========================================
// MESIN 4: STATISTIK CHART.JS & EXPORT PDF
// ==========================================
async function renderStatsTab() {
  const allTasks = await dbAct.getAll('tasks');
  let activeDaysCount = 0, perfectDaysCount = 0, totalCompletionSum = 0, peakCompletion = 0;
  const labels30 = [], data30 = [];
  
  for(let i=29; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = getLocalISODate(d);
    const dayTasks = allTasks.filter(t => t.date === dateStr);
    labels30.push(d.getDate());
    
    if(dayTasks.length > 0) {
      activeDaysCount++;
      const comp = dayTasks.filter(t => t.completed).length;
      const rate = Math.round((comp / dayTasks.length) * 100);
      if(rate === 100) perfectDaysCount++;
      if(rate > peakCompletion) peakCompletion = rate;
      totalCompletionSum += rate; data30.push(rate);
    } else { data30.push(0); }
  }
  
  document.getElementById('stat-avg-completion').innerText = (activeDaysCount > 0 ? Math.round(totalCompletionSum / activeDaysCount) : 0) + '%';
  document.getElementById('stat-perfect-days').innerText = perfectDaysCount;
  document.getElementById('stat-active-days').innerText = activeDaysCount;
  document.getElementById('stat-peak-completion').innerText = peakCompletion + '%';
  
  if(window.consistencyChartInstance) window.consistencyChartInstance.destroy();
  const ctx30 = document.getElementById('consistencyChart').getContext('2d');
  Chart.defaults.color = '#6b7280'; Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  window.consistencyChartInstance = new Chart(ctx30, { type: 'bar', data: { labels: labels30, datasets: [{ data: data30, backgroundColor: '#4ade80', borderRadius: 4, barThickness: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}, tooltip:{callbacks:{label: function(c){return c.raw+'% selesai';}}}}, scales:{ y:{max:100, display:false}, x:{ grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } } } } });

  const year = new Date().getFullYear();
  const monthlyData = new Array(12).fill(0), monthlyTaskCount = new Array(12).fill(0), monthlyCompletedCount = new Array(12).fill(0);
  allTasks.forEach(t => {
    const tDate = new Date(t.date);
    if (tDate.getFullYear() === year) {
      const mIndex = tDate.getMonth(); monthlyTaskCount[mIndex]++;
      if (t.completed) monthlyCompletedCount[mIndex]++;
    }
  });
  for (let i = 0; i < 12; i++) { if (monthlyTaskCount[i] > 0) { monthlyData[i] = Math.round((monthlyCompletedCount[i] / monthlyTaskCount[i]) * 100); } }

  if(window.monthlyChartInstance) window.monthlyChartInstance.destroy();
  const ctxMonthly = document.getElementById('monthlyChart').getContext('2d');
  window.monthlyChartInstance = new Chart(ctxMonthly, { type: 'bar', data: { labels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"], datasets: [{ data: monthlyData, backgroundColor: '#10b981', borderRadius: 4, barThickness: 12 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return 'Rata-rata: ' + c.raw + '%'; } } } }, scales: { y: { max: 100, display: false }, x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11, weight: 'bold' } } } } } });
}

function renderChart(allTasks) {
  const labels = [], data = [];
  for(let i=29; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dT = allTasks.filter(t => t.date === getLocalISODate(d));
    labels.push(d.getDate()); data.push(dT.length ? Math.round((dT.filter(t=>t.completed).length / dT.length)*100) : 0);
  }
  if(chartInstance) chartInstance.destroy();
  const ctx = document.getElementById('perfChart').getContext('2d');
  chartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ data, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#8b5cf6', pointBorderColor: '#09090b', pointBorderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}, tooltip:{callbacks:{label: function(c){return c.raw+'% selesai';}}}}, scales:{y:{max:100, display:false}, x:{display:false}} } });
}

function openBackupModal() {
  const d = new Date(); document.getElementById('export-end').value = getLocalISODate(d);
  d.setDate(d.getDate() - 7); document.getElementById('export-start').value = getLocalISODate(d);
  document.getElementById('modal-export').classList.remove('hidden'); document.getElementById('modal-export').style.display = 'flex';
}
function closeBackupModal() { document.getElementById('modal-export').classList.add('hidden'); document.getElementById('modal-export').style.display = 'none'; }
function blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function generatePDF() {
  const start = document.getElementById('export-start').value, end = document.getElementById('export-end').value;
  const allJ = await dbAct.getAll('journal');
  const filtered = allJ.filter(j => j.date >= start && j.date <= end).sort((a,b)=>a.date.localeCompare(b.date));
  if(!filtered.length) return alert('Tidak ada catatan jurnal di tanggal tersebut.');
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  
  doc.setFontSize(22); doc.setFont(undefined, 'bold'); doc.text("VibeCheck Logs", 105, 20, { align: "center" });
  doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.text(`Rentang: ${start} hingga ${end}`, 105, 28, { align: "center" }); doc.line(20, 32, 190, 32);
  let y = 45;
  for (let i = 0; i < filtered.length; i++) {
    const j = filtered[i]; if(y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text(j.date, 20, y); y += 6; doc.setFontSize(10); doc.setFont(undefined, 'normal');
    const pr = (lbl, txt) => { if(!txt)return; const sp = doc.splitTextToSize(`${lbl}: ${txt}`, 170); doc.text(sp, 20, y); y += (sp.length * 5); };
    pr('Satu Hal Utama', j.tujuan); pr('Persiapan Hambatan', j.prioritas); pr('Pencapaian', j.pencapaian); pr('Rasa Syukur', j.syukur);
    doc.setFont(undefined, 'italic'); doc.text(`Level Baterai (Pagi: ${j.ePagi}/10 | Malam: ${j.eMalam}/10) | Vibe: ${j.mood}`, 20, y); y += 8;
    if (j.imageBlob) {
      if (y > 210) { doc.addPage(); y = 20; }
      try { const base64Img = await blobToBase64(j.imageBlob); doc.addImage(base64Img, 'JPEG', 20, y, 80, 60); y += 65; } catch (err) { console.error(err); }
    }
    y += 10; 
  }
  doc.save(`VibeCheck_Jurnal_${start}.pdf`); closeBackupModal();
}

// ==========================================
// INISIALISASI UTAMA
// ==========================================
window.onload = async () => {
  await initDB(); 
  updateDateUI(); 
  updateOnlineStatus();
  
  await renderTasks(); 
  
  await checkEventReminders();
  reminderEngineInterval = setInterval(checkEventReminders, 60000); // Mengecek pengingat kalender (H-X) setiap 1 menit

  if(window.lucide) lucide.createIcons(); 
  console.log("🔥 VibeCheck LITE v1.0 (No Alarm Engine) Siap!");
};