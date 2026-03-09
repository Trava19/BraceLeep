document.getElementById('year').textContent = new Date().getFullYear();

// ==================== DATI CSV (embedded per test grafico) ====================
// Originariamente i dati verrebbero dal server/braccialetto
const CSV_DATA = [
  { giorno: 'Lun', TST: 7.5, WASO: 0.6, SE: 88, risvegli: 3, DAW: 0.5, MI: 12, AI: 18 },
  { giorno: 'Mar', TST: 6.8, WASO: 0.9, SE: 82, risvegli: 5, DAW: 0.7, MI: 18, AI: 25 },
  { giorno: 'Mer', TST: 8.0, WASO: 0.4, SE: 92, risvegli: 2, DAW: 0.3, MI: 10, AI: 15 },
  { giorno: 'Gio', TST: 7.2, WASO: 0.7, SE: 85, risvegli: 4, DAW: 0.6, MI: 14, AI: 20 },
  { giorno: 'Ven', TST: 6.5, WASO: 1.1, SE: 78, risvegli: 6, DAW: 0.9, MI: 22, AI: 30 },
  { giorno: 'Sab', TST: 7.9, WASO: 0.5, SE: 90, risvegli: 3, DAW: 0.4, MI: 11, AI: 16 },
  { giorno: 'Dom', TST: 8.2, WASO: 0.3, SE: 94, risvegli: 1, DAW: 0.2, MI:  8, AI: 12 },
];

const LAST_NIGHT = CSV_DATA[6]; // Ultima notte = Domenica

const AVG_TST  = CSV_DATA.reduce((s, d) => s + d.TST, 0) / CSV_DATA.length;
const AVG_SE   = Math.round(CSV_DATA.reduce((s, d) => s + d.SE,  0) / CSV_DATA.length);
const AVG_WASO = CSV_DATA.reduce((s, d) => s + d.WASO, 0) / CSV_DATA.length;
const AVG_RISV = (CSV_DATA.reduce((s, d) => s + d.risvegli, 0) / CSV_DATA.length).toFixed(1);
const QUALITY_SCORE = AVG_SE;

/**
 * Converte ore decimali in stringa "Xh Ym" leggibile.
 * Es: 7.4 → "7h 24m"  |  0.6 → "36m"  |  8.0 → "8h"
 */
function hm(decimal) {
  const totalMin = Math.round(decimal * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}`;
}
// WASO medio arrotondato a 2 decimali (usato come metrica "Efficienza" in analytics)
const AVG_WASO_METRIC = AVG_WASO; // già calcolato sopra

// ── Calcolo deterministico fasi del sonno da dati CSV ──
// Logica fisiologica:
//   Awake   = DAW_ore (dado direttamente dal CSV)
//   Deep    = inversamente proporzionale a MI_percentuale (meno movimento → più sonno profondo)
//             Normalizzato: Deep% ~ 0.35 - (MI/100)*0.5, clampato [0.12, 0.28]
//   REM     = inversamente proporzionale ad AI_minuti (meno arousal → più REM)
//             Normalizzato: REM% ~ 0.25 - (AI/60)*0.15, clampato [0.15, 0.25]
//   Light   = TST - Awake - Deep - REM (il resto)
function calcStages(night) {
  const awake = Math.min(night.DAW, night.TST * 0.12);         // max 12% del TST
  const deepFrac  = Math.min(0.28, Math.max(0.12, 0.35 - (night.MI / 100) * 0.50));
  const remFrac   = Math.min(0.25, Math.max(0.15, 0.25 - (night.AI / 60)  * 0.15));
  const deep  = deepFrac  * (night.TST - awake);
  const rem   = remFrac   * (night.TST - awake);
  const light = night.TST - awake - deep - rem;
  return { awake, deep, rem, light };
}

// ==================== VARIABILI GLOBALI ====================
let bleDevice = null, bleServer = null, uartService = null;
let txCharacteristic = null, rxCharacteristic = null;
let connected = false, monitoring = false;
let statusCheckInterval = null, realtimeDataInterval = null;
let sleepChart = null, trendChart = null, seChart = null, wasoChart = null;
// mappa canvas-id → Chart instance per il toggle pill
const chartRegistry = {};
let currentSection = 'home';

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_UUID      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_UUID      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

let userProfile = {
  fullName:'', age:null, gender:'', weight:null,
  height:null, sleepGoal:8, activityLevel:'', sleepIssues:''
};

// ==================== AUTH ====================

function togglePassword() {
  const pwInput = document.getElementById('pw');
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
}

function showError(msg) {
  const errBox = document.getElementById('loginError');
  errBox.textContent = msg;
  errBox.style.display = 'block';
  setTimeout(() => { errBox.style.display = 'none'; }, 3000);
}

function showSuccess(msg) {
  const successBox = document.getElementById('loginSuccess');
  successBox.textContent = msg;
  successBox.style.display = 'block';
  setTimeout(() => { successBox.style.display = 'none'; }, 3000);
}

function showRegister() {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('registerBox').style.display = 'block';
}

function showLogin() {
  document.getElementById('appScreen').style.display = 'none';
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  document.getElementById('registerBox').style.display = 'none';
  document.getElementById('loginBox').style.display = 'block';
  window.loggedUserEmail = null;
  currentSection = 'home';
}

document.getElementById('email').addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
document.getElementById('pw').addEventListener('keypress',    e => { if (e.key === 'Enter') login(); });

function showLoginError(msg) {
  const errBox = document.getElementById('loginError');
  errBox.textContent = msg; errBox.style.display = 'block';
  setTimeout(() => { errBox.style.display = 'none'; }, 3000);
}

// LOGIN – skip server in modalità test grafico
async function login() {
  const email = document.getElementById('email').value.trim();
  const pw    = document.getElementById('pw').value;
  if (!email || !pw) { showError('Compila tutti i campi'); return; }

  /* ── SERVER COMMENTATO (test grafico) ──
  try {
    const res = await fetch('https://127.0.0.1:5000/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const result = await res.json();
    if (!result.success) { showError(result.message); return; }
    window.loggedUserEmail = result.email;
    document.getElementById('userName').textContent = result.email;
    caricaProfilo();
  } catch(err) { showError('Errore di connessione al server'); return; }
  */

  // TEST: accesso diretto senza server
  window.loggedUserEmail = email;
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('userName').textContent = email;
  showSuccess('Accesso effettuato!');
  initAppWithData();
}

async function register() {
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regPasswordConfirm').value;
  const termsAccepted = document.getElementById('regTerms').checked;
  const email     = document.getElementById('regEmail').value.trim();
  const errorBox  = document.getElementById('registerError');
  const successBox = document.getElementById('registerSuccess');

  errorBox.style.display = 'none'; successBox.style.display = 'none';

  if (!termsAccepted) { errorBox.textContent = 'Devi accettare i termini'; errorBox.style.display = 'block'; return; }
  if (!firstName || !lastName || !email || !password || !confirm) { errorBox.textContent = 'Compila tutti i campi'; errorBox.style.display = 'block'; return; }
  if (password !== confirm) { errorBox.textContent = 'Le password non coincidono'; errorBox.style.display = 'block'; return; }

  /* ── SERVER COMMENTATO (test grafico) ──
  try {
    const res = await fetch('https://127.0.0.1:5000/register', { ... });
    ...
  } catch(err) { ... }
  */

  successBox.style.display = 'block';
  setTimeout(() => ricarica(), 3000);
}

// ==================== BLUETOOTH (COMMENTATO – TEST GRAFICO) ====================

function log(msg) { console.log('[BLE]', msg); }
function updateStatus(msg) { document.getElementById('syncStatus').textContent = msg; }

/*
── TUTTO IL BLOCCO BLE COMMENTATO PER TEST GRAFICO ──

async function sendCommand(cmd, data = {}) { ... }
function handleNotification(event) { ... }
async function connectBLE() { ... }
async function disconnectBLE() { ... }
function onDisconnected() { ... }
async function toggleMonitoring() { ... }
*/

function toggleBracelet()  { alert('Bluetooth disabilitato in modalità test grafico.'); }
function toggleMonitoring(){ alert('Monitoraggio disabilitato in modalità test grafico.'); }

function updateBatteryLevel(level) {
  const b = document.getElementById('batteryBox');
  b.textContent = level + '%';
  b.style.color = level >= 50 ? '#22C55E' : level >= 21 ? '#FACC15' : '#EF4444';
}

function updateMonitoringUI() {
  const btn = document.getElementById('monitorBtn');
  const status = document.getElementById('monitorStatus');
  if (monitoring) {
    btn.innerHTML = '⏸️ Ferma Monitoraggio'; btn.style.background = 'rgba(239,68,68,0.8)';
    status.innerHTML = '🔴 Monitoraggio in corso...'; status.style.color = '#86efac';
  } else {
    btn.innerHTML = '▶️ Avvia Monitoraggio'; btn.style.background = 'rgba(34,197,94,0.8)';
    status.innerHTML = '⚪ Pronto per il monitoraggio'; status.style.color = 'var(--muted)';
  }
}

// ==================== INIT APP CON DATI CSV ====================

function initAppWithData() {
  // Dati real-time (simulati dall'ultima notte)
  document.getElementById('realtimeQuality').textContent = LAST_NIGHT.SE + '%';
  document.getElementById('realtimeHR').innerHTML = '58<span style="font-size:16px">BPM</span>';
  document.getElementById('realtimeMovement').textContent = LAST_NIGHT.MI + '%';
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('it-IT');
  updateBatteryLevel(72);

  // Obiettivi card
  const objSleep = document.getElementById('objSleep');
  const objImpr  = document.getElementById('objImprovement');
  if (objSleep) objSleep.textContent = hm(AVG_TST);
  if (objImpr)  objImpr.textContent  = '+' + (LAST_NIGHT.SE - CSV_DATA[0].SE) + '%';

  // Analytics header
  document.getElementById('avgQualityScore').textContent = QUALITY_SCORE;
  document.getElementById('avgSleepTime').textContent    = hm(AVG_TST);       // media TST settimanale
  const lastNightEl = document.getElementById('lastNightTST');
  if (lastNightEl) lastNightEl.textContent = hm(LAST_NIGHT.TST);
  document.getElementById('sleepEfficiency').textContent = hm(AVG_WASO);     // WASO medio (ore sveglio)

  const qi = document.getElementById('overallQuality');
  if (AVG_SE >= 90)      { qi.textContent = 'Ottima';        qi.style.color = '#22c55e'; }
  else if (AVG_SE >= 80) { qi.textContent = 'Buona';         qi.style.color = '#38bdf8'; }
  else                   { qi.textContent = 'Da migliorare'; qi.style.color = '#f59e0b'; }

  // Aggiorna label WASO card
  const wasoLabel = document.querySelector('#sleepEfficiency')?.closest('.card')?.querySelector('.small');
  // già impostato via HTML

  updateSleepStages(LAST_NIGHT);
  updateInsight();

  createLine();
  createTrend();
  createAnalyticsCharts();

  loadProfile();
  loadSettings();
}

function updateSleepStages(night) {
  const { awake, deep, rem, light } = calcStages(night);
  const total = night.TST;

  // Percentuali reali su TST
  const pct = v => Math.round((v / total) * 100);
  const pDeep  = pct(deep);
  const pLight = pct(light);
  const pRem   = pct(rem);
  const pAwake = pct(awake);

  // Le barre usano flex-basis proporzionale all'interno di stage-bar-inner
  // (il CSS mette stage-bar-inner come container 100% height, stage-bar usa height in %)
  // Altezza % = percentuale reale (la barra più alta = la fase più lunga)
  document.getElementById('stageDeep').style.height  = pDeep  + '%';
  document.getElementById('stageLight').style.height = pLight + '%';
  document.getElementById('stageRem').style.height   = pRem   + '%';
  document.getElementById('stageAwake').style.height = Math.max(6, pAwake) + '%';

  // % sopra ogni barra
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stageDeepPctLeg',  pDeep  + '%');
  set('stageLightPctLeg', pLight + '%');
  set('stageRemPctLeg',   pRem   + '%');
  set('stageAwakePctLeg', pAwake + '%');

  // Valori card sotto
  set('stageDeepH',  hm(deep));
  set('stageLightH', hm(light));
  set('stageRemH',   hm(rem));
  set('stageAwakeM', hm(awake));
}

function updateInsight() {
  const el = document.getElementById('insightText');
  if (!el) return;
  const weekBest = CSV_DATA.reduce((best, d) => d.SE > best.SE ? d : best, CSV_DATA[0]);
  el.innerHTML = `Efficienza media settimanale: <strong>${AVG_SE}%</strong> — miglior notte: <strong>${weekBest.giorno}</strong> (${weekBest.SE}%). Risvegli medi per notte: <strong>${AVG_RISV}</strong>. Tempo medio sveglio (WASO): <strong>${hm(AVG_WASO)}</strong>. ${AVG_SE < 85 ? 'Prova a mantenere orari più regolari e riduci l\'uso di schermi prima di dormire.' : 'Continua così! Il tuo sonno è nella fascia ottimale.'}`;
}

// ==================== CHARTS ====================

function showEmptyChartMessage(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.parentElement;
  const existingMsg = container.querySelector('.empty-chart-message');
  if (existingMsg) existingMsg.remove();
  const msgDiv = document.createElement('div');
  msgDiv.className = 'empty-chart-message';
  msgDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--muted);font-size:14px;pointer-events:none;';
  msgDiv.innerHTML = `<div style="font-size:40px;margin-bottom:8px;opacity:0.3;">📊</div>${message}`;
  container.style.position = 'relative';
  container.appendChild(msgDiv);
}

function hideEmptyChartMessage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const msg = canvas.parentElement.querySelector('.empty-chart-message');
  if (msg) msg.remove();
}

// HOME – Qualità sonno per ora dell'ultima notte (simulata dalle 23:00 alle 07:00)
function createLine() {
  const canvas = document.getElementById('sleepLine');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(129,140,248,0.45)');
  gradient.addColorStop(1, 'rgba(15,23,42,0)');

  // Genera profilo orario simulato basato sull'ultima notte (LAST_NIGHT)
  // Usa SE, WASO, MI per dare forma realistica alla curva
  // Struttura tipica: addormentamento → sonno leggero → profondo → REM → risveglio
  const night = LAST_NIGHT;
  const hours = ['23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00','07:00'];
  // Qualità simulata ora per ora basata sui parametri reali della notte
  // Valori scalati su base SE, depressi da WASO/MI
  const baseSE = night.SE;
  const wasoDepression = night.WASO * 15;   // più WASO → curve più basse
  const miNoise = night.MI * 0.3;           // MI aggiunge variabilità
  const profile = [
    Math.round(baseSE * 0.55 - miNoise),          // 23:00 addormentamento
    Math.round(baseSE * 0.72),                     // 00:00 N1/N2
    Math.round(baseSE * 0.92),                     // 01:00 sonno profondo
    Math.round(baseSE * 0.98),                     // 02:00 picco profondo
    Math.round(baseSE * 0.85 - wasoDepression/2),  // 03:00 primo REM
    Math.round(baseSE * 0.78 - wasoDepression/3),  // 04:00 REM/leggero
    Math.round(baseSE * 0.88),                     // 05:00 secondo ciclo profondo
    Math.round(baseSE * 0.75 - miNoise/2),         // 06:00 sonno leggero mattino
    Math.round(baseSE * 0.45),                     // 07:00 risveglio
  ].map(v => Math.max(30, Math.min(100, v)));

  if (sleepChart) sleepChart.destroy();
  sleepChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [{
        label: 'Qualità sonno (%)',
        data: profile,
        tension: 0.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: profile.map(v => v >= 90 ? '#22c55e' : v >= 70 ? '#6366f1' : '#f59e0b'),
        pointBorderWidth: 0,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#6366f1',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.4)',
          borderWidth: 1, padding: 10, displayColors: false,
          callbacks: {
            title: items => 'Ora ' + items[0].label,
            label: ctx => {
              const v = ctx.parsed.y;
              const fase = v >= 90 ? '😴 Sonno profondo' : v >= 70 ? '🌙 Sonno normale' : v >= 50 ? '💤 Sonno leggero' : '👁️ Risveglio';
              return `${fase} — ${v}%`;
            }
          }
        }
      },
      scales: {
        y: {
          display: true, min: 0, max: 100,
          grid: { color: 'rgba(148,163,184,0.08)', drawBorder: false },
          ticks: { color: 'rgba(148,163,184,0.7)', font: { size: 10 }, callback: v => v + '%' }
        },
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(226,232,240,0.7)', font: { size: 10 } }
        }
      }
    }
  });
  hideEmptyChartMessage('sleepLine');
}

// HOME – Ore di sonno (bar) + Efficienza % (linea) — toggle via pill custom
function createTrend() {
  const el = document.getElementById('weekTrend');
  if (!el) return;
  const colors = CSV_DATA.map(d => d.TST >= 7.5 ? 'rgba(52,211,153,0.9)' : d.TST >= 7 ? 'rgba(56,189,248,0.85)' : 'rgba(248,113,113,0.85)');

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: CSV_DATA.map(d => d.giorno),
      datasets: [
        {
          label: 'Ore di sonno',
          data: CSV_DATA.map(d => d.TST),
          backgroundColor: colors,
          borderRadius: 6, borderSkipped: false,
          yAxisID: 'yHours'
        },
        {
          label: 'Obiettivo (8h)',
          data: Array(7).fill(8),
          type: 'line',
          borderColor: 'rgba(255,255,255,0.20)',
          borderDash: [5, 5], borderWidth: 1.5,
          pointRadius: 0, fill: false, tension: 0,
          yAxisID: 'yHours'
        },
        {
          label: 'Efficienza (%)',
          data: CSV_DATA.map(d => d.SE),
          type: 'line',
          borderColor: '#a78bfa',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: CSV_DATA.map(d => d.SE >= 90 ? '#22c55e' : d.SE >= 80 ? '#a78bfa' : '#f59e0b'),
          pointBorderWidth: 0,
          fill: false,
          tension: 0.4,
          yAxisID: 'ySE'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.4)',
          borderWidth: 1, padding: 10,
          filter: item => item.datasetIndex !== 1,
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 0) return `  Ore sonno: ${hm(ctx.parsed.y)}`;
              if (ctx.datasetIndex === 1) return null;
              return `  Efficienza: ${ctx.parsed.y}%`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(226,232,240,0.7)', font: { size: 11 } } },
        yHours: {
          type: 'linear', position: 'left',
          beginAtZero: false, min: 5, max: 10,
          grid: { color: 'rgba(148,163,184,0.15)', drawBorder: false },
          ticks: { color: 'rgba(52,211,153,0.8)', stepSize: 1, callback: v => v + 'h' }
        },
        ySE: {
          type: 'linear', position: 'right',
          min: 60, max: 100,
          grid: { display: false },
          ticks: { color: 'rgba(167,139,250,0.8)', font: { size: 11 }, callback: v => v + '%' }
        }
      }
    }
  });
  hideEmptyChartMessage('weekTrend');
  chartRegistry['weekTrend'] = trendChart;
}

// ANALYTICS – grafici aggiuntivi
function createAnalyticsCharts() {

  // ── Trend settimanale analytics (bar ore + linea SE%) ──
  const ctxATrend = document.getElementById('analyticsWeekTrend');
  if (ctxATrend) {
    const colors = CSV_DATA.map(d => d.TST >= 7.5 ? 'rgba(52,211,153,0.9)' : d.TST >= 7 ? 'rgba(56,189,248,0.85)' : 'rgba(248,113,113,0.85)');
    new Chart(ctxATrend, {
      type: 'bar',
      data: {
        labels: CSV_DATA.map(d => d.giorno),
        datasets: [
          {
            label: 'Ore di sonno',
            data: CSV_DATA.map(d => d.TST),
            backgroundColor: colors,
            borderRadius: 6, borderSkipped: false, yAxisID: 'yH'
          },
          {
            label: 'Efficienza (%)',
            data: CSV_DATA.map(d => d.SE),
            type: 'line',
            borderColor: '#a78bfa', borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: CSV_DATA.map(d => d.SE >= 90 ? '#22c55e' : d.SE >= 80 ? '#a78bfa' : '#f59e0b'),
            pointBorderWidth: 0,
            fill: false, tension: 0.4, yAxisID: 'ySE2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.4)',
            borderWidth: 1, padding: 10,
            filter: item => item.datasetIndex !== 1,
            callbacks: {
              label: ctx => ctx.datasetIndex === 0
                ? `  Ore: ${hm(ctx.parsed.y)}`
                : `  Efficienza: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(226,232,240,0.7)', font: { size: 11 } } },
          yH: {
            type: 'linear', position: 'left', min: 5, max: 10,
            grid: { color: 'rgba(148,163,184,0.12)', drawBorder: false },
            ticks: { color: 'rgba(52,211,153,0.8)', callback: v => v + 'h', stepSize: 1 }
          },
          ySE2: {
            type: 'linear', position: 'right', min: 60, max: 100,
            grid: { display: false },
            ticks: { color: 'rgba(167,139,250,0.8)', callback: v => v + '%' }
          }
        }
      }
    });
    chartRegistry['analyticsWeekTrend'] = Chart.getChart(ctxATrend);
  }

  // Radar efficienza settimanale
  const ctxSE = document.getElementById('analyticsSeChart');
  if (ctxSE) {
    if (seChart) seChart.destroy();
    seChart = new Chart(ctxSE, {
      type: 'radar',
      data: {
        labels: CSV_DATA.map(d => d.giorno),
        datasets: [{
          label: 'Efficienza (%)',
          data: CSV_DATA.map(d => d.SE),
          backgroundColor: 'rgba(99,102,241,0.2)',
          borderColor: '#6366f1', borderWidth: 2,
          pointBackgroundColor: '#38bdf8', pointRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 60, max: 100,
            grid: { color: 'rgba(148,163,184,0.15)' },
            angleLines: { color: 'rgba(148,163,184,0.15)' },
            pointLabels: { color: 'rgba(226,232,240,0.8)', font: { size: 12 } },
            ticks: { display: false }
          }
        }
      }
    });
  }

  // Bar WASO + risvegli
  const ctxWASO = document.getElementById('analyticsWasoChart');
  if (ctxWASO) {
    if (wasoChart) wasoChart.destroy();
    wasoChart = new Chart(ctxWASO, {
      type: 'bar',
      data: {
        labels: CSV_DATA.map(d => d.giorno),
        datasets: [
          {
            label: 'WASO (ore svegli)',
            data: CSV_DATA.map(d => d.WASO),
            backgroundColor: CSV_DATA.map(d => d.WASO <= 0.4 ? 'rgba(52,211,153,0.8)' : d.WASO <= 0.7 ? 'rgba(251,191,36,0.8)' : 'rgba(248,113,113,0.8)'),
            borderRadius: 6, borderSkipped: false
          },
          {
            label: 'N° Risvegli (÷10)',
            data: CSV_DATA.map(d => d.risvegli * 0.1),
            backgroundColor: 'rgba(168,85,247,0.5)',
            borderRadius: 4, borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: 'rgba(226,232,240,0.7)', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(148,163,184,0.4)',
            borderWidth: 1, padding: 10,
            callbacks: {
              label: ctx => ctx.datasetIndex === 0 ? `WASO: ${ctx.parsed.y}h` : `Risvegli: ${CSV_DATA[ctx.dataIndex].risvegli}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(226,232,240,0.7)', font: { size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148,163,184,0.15)', drawBorder: false },
            ticks: { color: 'rgba(148,163,184,0.8)', callback: v => v + 'h' }
          }
        }
      }
    });
  }
}

// ==================== PILL TOGGLE (Trend charts) ====================

/**
 * Attiva/disattiva un dataset del trend chart tramite pill custom.
 * Usa setDatasetVisibility + update('none') per evitare freeze/animazione.
 * @param {HTMLElement} pill  - il bottone pill cliccato
 * @param {number}      dsIdx - indice del dataset da toggleare
 */
function toggleTrendDataset(pill, dsIdx) {
  // Trova il canvas associato al gruppo di pills del genitore
  const pillsGroup = pill.closest('.chart-pills');
  const canvasId   = pill.dataset.chart;
  const chart      = chartRegistry[canvasId];
  if (!chart) return;

  const isActive = pill.classList.contains('active');

  // Impedisci di nascondere tutti e due (almeno uno deve restare visibile)
  const pills = pillsGroup.querySelectorAll('.chart-pill');
  const activeCount = [...pills].filter(p => p.classList.contains('active')).length;
  if (isActive && activeCount <= 1) return;

  // Toggle stato pill
  pill.classList.toggle('active', !isActive);

  // Nasconde/mostra il dataset — 'none' evita l'animazione che causa il freeze
  chart.setDatasetVisibility(dsIdx, !isActive);
  chart.update('none');
}

// ==================== MENU ====================

function switchSection(section) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(section + 'Section').classList.add('active');
  event.target.classList.add('active');
  currentSection = section;
}

// ==================== PROFILO ====================

function loadProfile() {
  const saved = localStorage.getItem('braceleep_profile');
  if (saved) {
    userProfile = JSON.parse(saved);
    document.getElementById('fullName').value      = userProfile.fullName || '';
    document.getElementById('age').value           = userProfile.age || '';
    document.getElementById('gender').value        = userProfile.gender || '';
    document.getElementById('weight').value        = userProfile.weight || '';
    document.getElementById('height').value        = userProfile.height || '';
    document.getElementById('sleepGoal').value     = userProfile.sleepGoal || 8;
    document.getElementById('activityLevel').value = userProfile.activityLevel || '';
    document.getElementById('sleepIssues').value   = userProfile.sleepIssues || '';
    updateProfileStats();
  }
}

function saveProfile(event) {
  event.preventDefault();
  userProfile = {
    fullName:      document.getElementById('fullName').value,
    age:           parseInt(document.getElementById('age').value) || null,
    gender:        document.getElementById('gender').value,
    weight:        parseFloat(document.getElementById('weight').value) || null,
    height:        parseInt(document.getElementById('height').value) || null,
    sleepGoal:     parseFloat(document.getElementById('sleepGoal').value) || 8,
    activityLevel: document.getElementById('activityLevel').value,
    sleepIssues:   document.getElementById('sleepIssues').value
  };
  localStorage.setItem('braceleep_profile', JSON.stringify(userProfile));
  updateProfileStats();
  const successMsg = document.getElementById('profileSuccess');
  successMsg.style.display = 'block';
  setTimeout(() => { successMsg.style.display = 'none'; }, 3000);
}

async function salvaProfilo() {
  const fullName      = document.getElementById('fullName').value.trim();
  const age           = parseInt(document.getElementById('age').value);
  const gender        = document.getElementById('gender').value;
  const weight        = parseFloat(document.getElementById('weight').value);
  const height        = parseInt(document.getElementById('height').value);
  const sleepGoal     = parseFloat(document.getElementById('sleepGoal').value);
  const activityLevel = document.getElementById('activityLevel').value;
  const sleepIssues   = document.getElementById('sleepIssues').value.trim();
  const successBox    = document.getElementById('profileSuccess');
  const errorBox      = document.getElementById('registerError');
  errorBox.style.display = 'none'; successBox.style.display = 'none';

  if (!fullName)  { errorBox.textContent = 'Il nome completo è obbligatorio'; errorBox.style.display = 'block'; return; }
  if (age < 0)    { errorBox.textContent = "L'età non può essere negativa";   errorBox.style.display = 'block'; return; }
  if (height < 0) { errorBox.textContent = "L'altezza non può essere negativa"; errorBox.style.display = 'block'; return; }
  if (weight < 0) { errorBox.textContent = "Il peso non può essere negativo";  errorBox.style.display = 'block'; return; }
  if (sleepGoal <= 0) { errorBox.textContent = "L'obiettivo deve essere > 0"; errorBox.style.display = 'block'; return; }

  /* ── SERVER COMMENTATO (test grafico) ──
  try {
    const res = await fetch('https://127.0.0.1:5000/changeProfile', { ... });
    ...
  } catch(err) { ... }
  */

  userProfile = { fullName, age, gender, weight, height, sleepGoal, activityLevel, sleepIssues };
  localStorage.setItem('braceleep_profile', JSON.stringify(userProfile));
  updateProfileStats();
  successBox.style.display = 'block';
  setTimeout(() => { successBox.style.display = 'none'; }, 3000);
}

async function caricaProfilo() {
  /* ── SERVER COMMENTATO (test grafico) ──
  try {
    const res = await fetch('https://127.0.0.1:5000/caricaProfilo', { ... });
    ...
  } catch(err) { ... }
  */
  loadProfile();
}

function updateProfileStats() {
  const { weight, height, age, sleepGoal, activityLevel, sleepIssues } = userProfile;
  if (weight && height) {
    document.getElementById('bmiValue').textContent = (weight / Math.pow(height / 100, 2)).toFixed(1);
  } else {
    document.getElementById('bmiValue').textContent = '--';
  }
  let idealSleep = sleepGoal || 8;
  if (age) { if (age < 18) idealSleep = 9; else if (age > 65) idealSleep = 7; }
  document.getElementById('idealSleepValue').innerHTML = idealSleep + '<span style="font-size:14px">h</span>';
  if (weight) {
    document.getElementById('caloriesBurnValue').textContent = (weight * 0.42 * idealSleep).toFixed(0);
  } else {
    document.getElementById('caloriesBurnValue').textContent = '--';
  }
  updateSleepProfile();
}

function updateSleepProfile() {
  const { age, activityLevel, sleepIssues } = userProfile;
  let txt = '';
  if (age && activityLevel) {
    txt = '<strong>Il tuo profilo:</strong><br>';
    if (age < 25) txt += '• Fase di crescita: necessiti di più sonno profondo<br>';
    else if (age > 50) txt += "• Sonno più leggero è normale con l'età<br>";
    if (activityLevel === 'very_active' || activityLevel === 'active') txt += '• Alta attività: il recupero notturno è fondamentale<br>';
    if (sleepIssues) txt += '• Monitoriamo i tuoi problemi di sonno specifici<br>';
    txt += '<br><strong>Suggerimento:</strong> Mantieni orari regolari per migliorare la qualità.';
  } else {
    txt = 'Completa il profilo per ricevere consigli personalizzati sul tuo sonno.';
  }
  document.getElementById('sleepProfileText').innerHTML = txt;
}

// ==================== IMPOSTAZIONI ====================

function loadSettings() {
  const saved = localStorage.getItem('braceleep_settings');
  if (saved) {
    const s = JSON.parse(saved);
    document.getElementById('notificationsEnabled').checked = s.notifications || false;
    document.getElementById('darkMode').checked = s.darkMode !== false;
    document.getElementById('unitSystem').value = s.unitSystem || 'metric';
  }
}

function saveSettings() {
  const settings = {
    notifications: document.getElementById('notificationsEnabled').checked,
    darkMode:      document.getElementById('darkMode').checked,
    unitSystem:    document.getElementById('unitSystem').value
  };
  localStorage.setItem('braceleep_settings', JSON.stringify(settings));
  const successMsg = document.getElementById('settingsSuccess');
  successMsg.style.display = 'block';
  setTimeout(() => { successMsg.style.display = 'none'; }, 3000);
}

async function clearAllData() {
  if (confirm('Sei sicuro di voler cancellare tutti i dati?')) {
    /* ── SERVER COMMENTATO ──
    try { const res = await fetch('https://127.0.0.1:5000/clearAllData', { ... }); ... } catch(err) {}
    */
    localStorage.clear();
    location.reload();
  }
}

async function logout() {
  if (confirm('Sei sicuro di voler uscire?')) {
    /* ── SERVER COMMENTATO ──
    try { const res = await fetch('https://127.0.0.1:5000/logout', { ... }); ... } catch(err) {}
    */
    location.reload();
  }
}

async function changePassword() {
  const oldPw     = document.getElementById('oldPw').value;
  const newPw     = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;
  if (!oldPw || !newPw || !confirmPw) { showPwMsg('Compila tutti i campi', 'error'); return; }
  if (newPw !== confirmPw) { showPwMsg('Le nuove password non coincidono', 'error'); return; }
  /* ── SERVER COMMENTATO ──
  try { const res = await fetch('https://127.0.0.1:5000/change-password', { ... }); ... } catch(err) {}
  */
  showPwMsg('(Test) Password aggiornata localmente', 'success');
  ['oldPw','newPw','confirmPw'].forEach(id => { document.getElementById(id).value = ''; });
}

function showPwMsg(text, type) {
  const box = document.getElementById('pwMsg');
  if (!box) return;
  box.textContent = text; box.style.display = 'block';
  box.className = ''; box.classList.add(type === 'success' ? 'success' : 'error');
  setTimeout(() => { box.style.display = 'none'; }, 3000);
}

function ricarica() { location.reload(); }
