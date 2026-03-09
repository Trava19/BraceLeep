document.getElementById('year').textContent = new Date().getFullYear();

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

let seChart = null;
let wasoChart = null;
const chartRegistry = {};

const LAST_NIGHT = CSV_DATA[6]; // Ultima notte = Domenica

const AVG_TST  = CSV_DATA.reduce((s, d) => s + d.TST, 0) / CSV_DATA.length;
const AVG_SE   = Math.round(CSV_DATA.reduce((s, d) => s + d.SE,  0) / CSV_DATA.length);
const AVG_WASO = CSV_DATA.reduce((s, d) => s + d.WASO, 0) / CSV_DATA.length;
const AVG_RISV = (CSV_DATA.reduce((s, d) => s + d.risvegli, 0) / CSV_DATA.length).toFixed(1);
const QUALITY_SCORE = AVG_SE;

  // Variabili globali
  let bleDevice = null;
  let bleServer = null;
  let uartService = null;
  let txCharacteristic = null;
  let rxCharacteristic = null;
  let connected = false;
  let monitoring = false;
  let statusCheckInterval = null;
  let realtimeDataInterval = null;
  let sleepChart = null;
  let trendChart = null;
  let currentSection = 'home';

  // Dati profilo utente (salvati in localStorage)
  let userProfile = {
    fullName: '',
    age: null,
    gender: '',
    weight: null,
    height: null,
    sleepGoal: 8,
    activityLevel: '',
    sleepIssues: ''
  };

  // UUIDs per Nordic UART Service
  const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  function togglePassword() {
    const pwInput = document.getElementById('pw');
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  }



// Mostra messaggio di errore
function showError(msg) {
  const errBox = document.getElementById('loginError');
  errBox.textContent = msg;
  errBox.style.display = 'block';
  setTimeout(() => { errBox.style.display = 'none'; }, 3000);
}

// Mostra messaggio di successo
function showSuccess(msg) {
  const successBox = document.getElementById('loginSuccess');
  successBox.textContent = msg;
  successBox.style.display = 'block';
  setTimeout(() => { successBox.style.display = 'none'; }, 3000);
}

// Funzione login completa

// Mostra form di registrazione
// Mostra schermata di registrazione
function showRegister() {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('registerBox').style.display = 'block';
}

// Torna al login
function showLogin() {
  // Nascondi tutta l'app
  document.getElementById('appScreen').style.display = 'none';

  // Nascondi tutte le sezioni interne
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.remove('active');
  });

  // Mostra solo il login
  document.getElementById('registerBox').style.display = 'none';
  document.getElementById('loginBox').style.display = 'block';

  // Reset stato utente
  window.loggedUserEmail = null;
  currentSection = 'home';
}



// ============================================
// Invio con tasto Enter negli input
document.getElementById('email').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') login();
});
document.getElementById('pw').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') login();
});


function showLoginError(msg) {
  const errBox = document.getElementById('loginError');
  errBox.textContent = msg;
  errBox.style.display = 'block';

  setTimeout(() => {
    errBox.style.display = 'none';
  }, 3000);
}


  // ==================== BLUETOOTH BLE ====================

  function log(msg) {
    console.log('[BLE]', msg);
  }

  function updateStatus(msg) {
    document.getElementById('syncStatus').textContent = msg;
  }

  async function sendCommand(cmd, data = {}) {
    if (!txCharacteristic) {
      log('TX Characteristic non disponibile');
      return;
    }

    const command = {
      cmd: cmd,
      ...data
    };

    const commandStr = JSON.stringify(command);
    log('Invio comando: ' + commandStr);

    try {
      const encoder = new TextEncoder();
      await txCharacteristic.writeValue(encoder.encode(commandStr));
      return true;
    } catch (error) {
      log('Errore invio comando: ' + error);
      return false;
    }
  }

  function handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const message = decoder.decode(value);

    log('Ricevuto: ' + message);

    try {
      const response = JSON.parse(message);
      
      switch(response.type) {
        case 'connected':
          log('Dispositivo connesso: ' + response.data.device);
          updateBatteryLevel(response.data.battery);
          break;

        case 'status':
          updateBatteryLevel(response.data.battery);
          monitoring = response.data.monitoring;
          updateMonitoringUI();
          break;

        case 'realtime':
          updateRealtimeData(response.data);
          break;

        case 'last_night':
          updateSleepChart(response.data);
          break;

        case 'week_trend':
          updateTrendChart(response.data);
          break;

        case 'monitoring':
          monitoring = response.data.monitoring;
          updateMonitoringUI();
          log('Monitoraggio ' + response.data.status);
          break;
      }
    } catch (e) {
      log('Errore parsing risposta: ' + e);
    }
  }

  async function toggleBracelet() {
    if (!connected) {
      await connectBLE();
    } else {
      await disconnectBLE();
    }
  }

  async function connectBLE() {
    const chip = document.getElementById('braceletChip');
    const btn = document.getElementById('connectBtn');

    // Verifica supporto Web Bluetooth
    if (!navigator.bluetooth) {
      alert('Il tuo browser non supporta Web Bluetooth API.\n\nUsa Chrome, Edge o Opera su desktop/Android.');
      return;
    }

    try {
      chip.innerHTML = "Braccialetto: <strong>Ricerca...</strong>";
      chip.classList.add('glowing');
      btn.textContent = '🔍 Ricerca in corso...';
      btn.disabled = true;
      updateStatus('Ricerca dispositivi BLE...');

      // Richiedi dispositivo BLE
      log('Richiesta dispositivo BLE...');
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'BraceLeep' }],
        optionalServices: [UART_SERVICE_UUID]
      });

      log('Dispositivo selezionato: ' + bleDevice.name);
      chip.innerHTML = "Braccialetto: <strong>Connessione...</strong>";
      chip.classList.add('glowing');
      updateStatus('Connessione a ' + bleDevice.name + '...');

      // Gestisci disconnessione
      bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

      // Connetti al server GATT
      log('Connessione GATT...');
      bleServer = await bleDevice.gatt.connect();
      log('Server GATT connesso');

      // Ottieni servizio UART
      log('Ricerca servizio UART...');
      uartService = await bleServer.getPrimaryService(UART_SERVICE_UUID);
      log('Servizio UART trovato');

      // Ottieni caratteristiche TX e RX
      log('Ricerca caratteristiche...');
      txCharacteristic = await uartService.getCharacteristic(UART_TX_UUID);
      rxCharacteristic = await uartService.getCharacteristic(UART_RX_UUID);
      log('Caratteristiche trovate');

      // Abilita notifiche su RX
      await rxCharacteristic.startNotifications();
      rxCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
      log('Notifiche abilitate');

      // Connessione completata
      connected = true;
      chip.innerHTML = "Braccialetto: <strong>Connesso</strong>";
      chip.classList.add('glowing');
      updateStatus('Connesso! Sincronizzato alle ' + new Date().toLocaleTimeString('it-IT'));
      btn.textContent = '🔌 Disconnetti';
      btn.disabled = false;
      document.getElementById('monitorBtn').disabled = false;

      log('✓ Connessione completata');

      // Richiedi dati iniziali
      setTimeout(() => {
        sendCommand('status');
        sendCommand('last_night');
        sendCommand('week_trend');
      }, 500);

      // Avvia polling periodico
      statusCheckInterval = setInterval(() => {
        sendCommand('status');
      }, 10000);

      realtimeDataInterval = setInterval(() => {
        sendCommand('realtime');
      }, 2000);

    } catch (error) {
      log('Errore connessione: ' + error);
      chip.innerHTML = "Braccialetto: <strong>Errore</strong>";
      chip.classList.remove('glowing');
      updateStatus('Errore: ' + error.message);
      btn.textContent = '🔍 Cerca Braccialetto';
      btn.disabled = false;

      setTimeout(() => {
        chip.innerHTML = "Braccialetto: <strong>Non connesso</strong>";
        updateStatus('In attesa di connessione...');
      }, 3000);
    }
  }

  async function disconnectBLE() {
    log('Disconnessione...');

    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
      statusCheckInterval = null;
    }

    if (realtimeDataInterval) {
      clearInterval(realtimeDataInterval);
      realtimeDataInterval = null;
    }

    if (bleDevice && bleDevice.gatt.connected) {
      await bleDevice.gatt.disconnect();
    }

    onDisconnected();
  }

  function onDisconnected() {
    log('Dispositivo disconnesso');
    connected = false;
    monitoring = false;

    const chip = document.getElementById('braceletChip');
    const btn = document.getElementById('connectBtn');

    chip.innerHTML = "Braccialetto: <strong>Non connesso</strong>";
    chip.classList.remove('glowing');
    updateStatus('Disconnesso');
    btn.textContent = '🔍 Cerca Braccialetto';
    btn.disabled = false;
    document.getElementById('monitorBtn').disabled = true;

    // Reset UI
    document.getElementById('realtimeQuality').textContent = '--';
    document.getElementById('realtimeHR').innerHTML = '--<span style="font-size:16px">BPM</span>';
    document.getElementById('realtimeMovement').textContent = '--';
    document.getElementById('lastUpdate').textContent = '--';
    document.getElementById('batteryBox').textContent = '--';
    updateMonitoringUI();
  }

  async function toggleMonitoring() {
    if (!connected) return;

    if (!monitoring) {
      await sendCommand('start_monitoring');
    } else {
      await sendCommand('stop_monitoring');
    }
  }

  // ==================== UI UPDATES ====================

  function updateBatteryLevel(level) {
    const batteryBox = document.getElementById('batteryBox');
    batteryBox.textContent = level + "%";
    
    if (level >= 50) {
      batteryBox.style.color = "#22C55E";
    } else if (level >= 21) {
      batteryBox.style.color = "#FACC15";
    } else {
      batteryBox.style.color = "#EF4444";
    }
  }

  function updateMonitoringUI() {
    const btn = document.getElementById('monitorBtn');
    const status = document.getElementById('monitorStatus');
    
    if (monitoring) {
      btn.innerHTML = '⏸️ Ferma Monitoraggio';
      btn.style.background = 'rgba(239,68,68,0.8)';
      status.innerHTML = '🔴 Monitoraggio in corso...';
      status.style.color = '#86efac';
    } else {
      btn.innerHTML = '▶️ Avvia Monitoraggio';
      btn.style.background = 'rgba(34,197,94,0.8)';
      status.innerHTML = '⚪ Pronto per il monitoraggio';
      status.style.color = 'var(--muted)';
    }
  }

  function updateRealtimeData(data) {
    document.getElementById('realtimeQuality').textContent = data.sleep_quality;
    document.getElementById('realtimeHR').innerHTML = `${data.heart_rate}<span style="font-size:16px">BPM</span>`;
    document.getElementById('realtimeMovement').textContent = data.movement;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('it-IT');
    updateBatteryLevel(data.battery);
  }

  function updateSleepChart(data) {
    if (sleepChart && data && data.times && data.values && data.times.length > 0) {
      sleepChart.data.labels = data.times;
      sleepChart.data.datasets[0].data = data.values;
      sleepChart.update();
      hideEmptyChartMessage('sleepLine');
      log('Grafico sonno aggiornato');
    }
  }

  function updateTrendChart(data) {
    if (trendChart && data && data.days && data.hours && data.days.length > 0) {
      trendChart.data.labels = data.days;
      trendChart.data.datasets[0].data = data.hours;
      trendChart.update();
      hideEmptyChartMessage('weekTrend');
      log('Grafico trend aggiornato');
    }
  }

  // ==================== CHARTS ====================

  function showEmptyChartMessage(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    const container = canvas.parentElement;
    
    // Rimuovi messaggio precedente se esiste
    const existingMsg = container.querySelector('.empty-chart-message');
    if (existingMsg) {
      existingMsg.remove();
    }
    
    // Crea nuovo messaggio
    const msgDiv = document.createElement('div');
    msgDiv.className = 'empty-chart-message';
    msgDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--muted);font-size:14px;pointer-events:none;';
    msgDiv.innerHTML = `<div style="font-size:40px;margin-bottom:8px;opacity:0.3;">📊</div>${message}`;
    
    container.style.position = 'relative';
    container.appendChild(msgDiv);
  }

  function hideEmptyChartMessage(canvasId) {
    const canvas = document.getElementById(canvasId);
    const container = canvas.parentElement;
    const msg = container.querySelector('.empty-chart-message');
    if (msg) {
      msg.remove();
    }
  }
/*
  function createLine(){
    const canvas = document.getElementById('sleepLine');
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(129, 140, 248, 0.45)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');

    sleepChart = new Chart(ctx,{
      type:'line',
      data:{
        labels:[],
        datasets:[{
          label:'Qualità del sonno',
          data:[],
          tension:0.45,
          pointRadius:4,
          pointHoverRadius:6,
          pointBackgroundColor:'#38bdf8',
          pointBorderWidth:0,
          fill:true,
          backgroundColor:gradient,
          borderColor:'#6366f1',
          borderWidth:2.5
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(15,23,42,0.95)',
            borderColor:'rgba(148,163,184,0.4)',
            borderWidth:1,
            padding:10,
            displayColors:false,
            callbacks:{
              label:(ctx)=>`Qualità: ${ctx.parsed.y}`
            }
          }
        },
        scales:{
          y:{display:false},
          x:{
            grid:{display:false},
            ticks:{
              color:'rgba(226,232,240,0.7)',
              font:{size:11}
            }
          }
        }
      }
    });
    
    // Mostra messaggio se non ci sono dati
    showEmptyChartMessage('sleepLine', 'Connetti il braccialetto per visualizzare i dati');
  }

  function createTrend(){
    const ctx=document.getElementById('weekTrend').getContext('2d');
    trendChart = new Chart(ctx,{
      type:'bar',
      data:{
        labels:[],
        datasets:[{
          label:'Ore di sonno',
          data:[],
          backgroundColor:[
            'rgba(56, 189, 248, 0.85)',
            'rgba(56, 189, 248, 0.75)',
            'rgba(129, 140, 248, 0.9)',
            'rgba(129, 140, 248, 0.9)',
            'rgba(248, 113, 113, 0.85)',
            'rgba(52, 211, 153, 0.9)',
            'rgba(56, 189, 248, 0.85)'
          ],
          borderRadius:6,
          borderSkipped:false
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(15,23,42,0.95)',
            borderColor:'rgba(148,163,184,0.4)',
            borderWidth:1,
            padding:10,
            displayColors:false,
            callbacks:{
              label:(ctx)=>`${ctx.parsed.y.toFixed(1)} ore`
            }
          }
        },
        scales:{
          x:{
            grid:{display:false},
            ticks:{
              color:'rgba(226,232,240,0.7)',
              font:{size:11}
            }
          },
          y:{
            beginAtZero:true,
            grid:{
              color:'rgba(148,163,184,0.2)',
              drawBorder:false
            },
            ticks:{
              color:'rgba(148,163,184,0.8)',
              stepSize:1
            }
          }
        }
      }
    });
    
    // Mostra messaggio se non ci sono dati
    showEmptyChartMessage('weekTrend', 'Connetti il braccialetto per visualizzare i dati');
  }*/

  // ==================== GESTIONE MENU ====================

  function switchSection(section) {
    // Rimuovi classe active da tutti i nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });

    // Rimuovi classe active da tutte le sezioni
    document.querySelectorAll('.section').forEach(sec => {
      sec.classList.remove('active');
    });

    // Aggiungi classe active alla sezione corrente
    document.getElementById(section + 'Section').classList.add('active');
    
    // Aggiungi classe active al nav item corrente
    event.target.classList.add('active');
    
    currentSection = section;
  }



  // ==================== GESTIONE PROFILO ====================


  //TODO : togli la funzione che tanto c'è già quella giusta
  function loadProfile() {
    const saved = localStorage.getItem('braceleep_profile');
    if (saved) {
      userProfile = JSON.parse(saved);
      
      // Popola i campi del form
      document.getElementById('fullName').value = userProfile.fullName || '';
      document.getElementById('age').value = userProfile.age || '';
      document.getElementById('gender').value = userProfile.gender || '';
      document.getElementById('weight').value = userProfile.weight || '';
      document.getElementById('height').value = userProfile.height || '';
      document.getElementById('sleepGoal').value = userProfile.sleepGoal || 8;
      document.getElementById('activityLevel').value = userProfile.activityLevel || '';
      document.getElementById('sleepIssues').value = userProfile.sleepIssues || '';
      
      updateProfileStats();
    }
  }

  //TODO : togli la funzione che tanto c'è già quella giusta

  function saveProfile(event) {
    event.preventDefault();
    
    userProfile = {
      fullName: document.getElementById('fullName').value,
      age: parseInt(document.getElementById('age').value) || null,
      gender: document.getElementById('gender').value,
      weight: parseFloat(document.getElementById('weight').value) || null,
      height: parseInt(document.getElementById('height').value) || null,
      sleepGoal: parseFloat(document.getElementById('sleepGoal').value) || 8,
      activityLevel: document.getElementById('activityLevel').value,
      sleepIssues: document.getElementById('sleepIssues').value
    };
    
    localStorage.setItem('braceleep_profile', JSON.stringify(userProfile));
    
    updateProfileStats();
    
    // Mostra messaggio di successo
    const successMsg = document.getElementById('profileSuccess');
    successMsg.style.display = 'block';
    setTimeout(() => {
      successMsg.style.display = 'none';
    }, 3000);
  }

  //TODO : non so se questa funzione potrà essermi utile per fare i garfici

  function updateProfileStats() {
    const { weight, height, age, sleepGoal, activityLevel } = userProfile;
    
    // Calcola BMI
    if (weight && height) {
      const heightM = height / 100;
      const bmi = (weight / (heightM * heightM)).toFixed(1);
      document.getElementById('bmiValue').textContent = bmi;
    } else {
      document.getElementById('bmiValue').textContent = '--';
    }
    
    // Calcola sonno ideale basato su età
    let idealSleep = sleepGoal || 8;
    if (age) {
      if (age < 18) idealSleep = 9;
      else if (age > 65) idealSleep = 7;
    }
    document.getElementById('idealSleepValue').innerHTML = idealSleep + '<span style="font-size:14px">h</span>';
    
    // Stima calorie bruciate durante il sonno
    if (weight) {
      const caloriesPerHour = weight * 0.42; // Formula approssimativa
      const caloriesPerNight = (caloriesPerHour * idealSleep).toFixed(0);
      document.getElementById('caloriesBurnValue').textContent = caloriesPerNight;
    } else {
      document.getElementById('caloriesBurnValue').textContent = '--';
    }
    
    // Aggiorna profilo sonno
    updateSleepProfile();
  }

  function updateSleepProfile() {
    const { age, activityLevel, sleepIssues } = userProfile;
    let profileText = '';
    
    if (age && activityLevel) {
      profileText = '<strong>Il tuo profilo:</strong><br>';
      
      if (age < 25) {
        profileText += '• Fase di crescita: necessiti di più sonno profondo<br>';
      } else if (age > 50) {
        profileText += '• Sonno più leggero è normale con l\'età<br>';
      }
      
      if (activityLevel === 'very_active' || activityLevel === 'active') {
        profileText += '• Alta attività: il recupero notturno è fondamentale<br>';
      }
      
      if (sleepIssues && sleepIssues !== '') {
        profileText += '• Monitoriamo i tuoi problemi di sonno specifici<br>';
      }
      
      profileText += '<br><strong>Suggerimento:</strong> Mantieni orari regolari per migliorare la qualità.';
    } else {
      profileText = 'Completa il profilo per ricevere consigli personalizzati sul tuo sonno.';
    }
    
    document.getElementById('sleepProfileText').innerHTML = profileText;
  }

  // ==================== GESTIONE IMPOSTAZIONI ====================

function loadSettings() { // TODO: fallo giusto e non uesta merda ua
  const saved = localStorage.getItem('braceleep_settings');
  if (saved) {
    const settings = JSON.parse(saved);
    document.getElementById('notificationsEnabled').checked = settings.notifications || false;
    document.getElementById('darkMode').checked = settings.darkMode !== false;
    document.getElementById('unitSystem').value = settings.unitSystem || 'metric';
    document.getElementById('language').value = settings.language || 'it';
  }
}

function saveSettings() {
  const settings = {
    notifications: document.getElementById('notificationsEnabled').checked,
    darkMode: document.getElementById('darkMode').checked,
    unitSystem: document.getElementById('unitSystem').value,
    language: document.getElementById('language').value
  };
  
  localStorage.setItem('braceleep_settings', JSON.stringify(settings));
  
  const successMsg = document.getElementById('settingsSuccess');
  successMsg.style.display = 'block';
  setTimeout(() => {
    successMsg.style.display = 'none';
  }, 3000);
}

// ==================== CHIAMATE ALLE API ====================

async function login() {
  const email = document.getElementById('email').value.trim();
  const pw = document.getElementById('pw').value;

  if (!email || !pw) {
    showError('Compila tutti i campi');
    return;
  }

  try {
    const res = await fetch('https://127.0.0.1:5000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });

    const result = await res.json();

    if (result.success) {
      // Salva email utente
      window.loggedUserEmail = result.email;

      // Aggiorna UI: nasconde login e mostra app
      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';

      // Aggiorna utente nella UI
      document.getElementById('userName').textContent = result.email;

      initAppWithData(result.profile);

      showSuccess('Accesso effettuato!');
    } else {
      showError(result.message);
    }
  } catch (err) {
    showError('Errore di connessione al server');
  }

  caricaProfilo();
}

// 

async function register() {
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regPasswordConfirm').value;
  const termsAccepted = document.getElementById('regTerms').checked;
  const email = document.getElementById('regEmail').value.trim(); 

  if (!termsAccepted) {
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "Devi accettare i termini e condizioni";
    errorBox.style.display = 'block';
    return;
  }

  const errorBox = document.getElementById('registerError');
  const successBox = document.getElementById('registerSuccess');

  // Reset messaggi
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  // Validazione campi obbligatori
  if (!firstName || !lastName || !email || !password || !confirm) {
    errorBox.textContent = "Compila tutti i campi";
    errorBox.style.display = 'block';
    return;
  }

  if (password !== confirm) {
    errorBox.textContent = "Le password non coincidono";
    errorBox.style.display = 'block';
    return;
  }

  if(firstName.length > 20){
    errorBox.textContent = "Il nome è troppo lungo (max 20 caratteri)";
    errorBox.style.display = 'block';
    return;
  }

  if(lastName.length > 20){
    errorBox.textContent = "Il cognome è troppo lungo (max 20 caratteri)";
    errorBox.style.display = 'block';
    return;
  }

  if(email.length > 50){
    errorBox.textContent = "L'email è troppo lunga (max 50 caratteri)";
    errorBox.style.display = 'block';
    return;
  }

  if(password.length > 255){
    errorBox.textContent = "La password è troppo lunga (max 255 caratteri)";
    errorBox.style.display = 'block';
    return;
  }



  try {
    const res = await fetch('https://127.0.0.1:5000/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        nome: firstName,      // <-- cambiato da first_name
        cognome: lastName,    // <-- cambiato da last_name
        password: password
      })
    });

    const result = await res.json();

    if (result.success) {
      successBox.style.display = 'block';
      setTimeout(() => {
        ricarica();
      }, 5000);
    } else {
      errorBox.textContent = result.message;
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.textContent = "Errore di connessione al server";
    errorBox.style.display = 'block';
  }
}



async function changePassword() {
  const oldPw = document.getElementById('oldPw').value;
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;

  const userEmail = window.loggedUserEmail;

  if (!oldPw || !newPw || !confirmPw) {
    showPwMsg('Compila tutti i campi', 'error');
    return;
  }

  if (newPw !== confirmPw) {
    showPwMsg('Le nuove password non coincidono', 'error');
    return;
  }

  try {
    const res = await fetch('https://127.0.0.1:5000/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        oldPw: oldPw,
        newPw: newPw
      })
    });

    const result = await res.json();
    console.log(result);

    if (result.success) {
      showPwMsg(result.message, 'success');
      document.getElementById('oldPw').value = '';
      document.getElementById('newPw').value = '';
      document.getElementById('confirmPw').value = '';
    } else {
      showPwMsg(result.message, 'error');
    }
  } catch (err) {
    showPwMsg('Errore di connessione al server', 'error');
  }
}

function showPwMsg(text, type) {
  const box = document.getElementById('pwMsg');

  if (!box) {
    console.error('Elemento #pwMsg non trovato');
    return;
  }

  box.textContent = text;
  box.style.display = 'block';

  box.className = '';
  box.classList.add(type === 'success' ? 'success' : 'error');

  setTimeout(() => {
    box.style.display = 'none';
  }, 3000);
}



async function salvaProfilo() {
  const fullName = document.getElementById('fullName').value.trim();
  const age = parseInt(document.getElementById('age').value.trim());
  const gender = document.getElementById('gender').value;
  const weight = parseFloat(document.getElementById('weight').value.trim());
  const height = parseInt(document.getElementById('height').value.trim());
  const sleepGoal = parseFloat(document.getElementById('sleepGoal').value.trim());
  const activityLevel = document.getElementById('activityLevel').value;
  const sleepIssues = document.getElementById('sleepIssues').value.trim();
  const successBox = document.getElementById('profileSuccess');
  const errorBox = document.getElementById('registerError');

  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!fullName){
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "Il nome completo è obbligatorio";
    errorBox.style.display = 'block';
    return;
  }

  if(age<0){
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "L'età non può essere negativa";
    errorBox.style.display = 'block';
    return;
  }

  if(height<0){
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "L'altezza non può essere negativa";
    errorBox.style.display = 'block';
    return;
  }

  if(weight<0){
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "Il peso non può essere negativo";
    errorBox.style.display = 'block';
    return;
  }
  if(sleepGoal<=0){
    const errorBox = document.getElementById('registerError');
    errorBox.textContent = "L'obiettivo di sonno deve essere maggiore di 0";
    errorBox.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('https://127.0.0.1:5000/changeProfile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_completo: fullName,
        eta: age,
        genere: gender,
        peso: weight,
        altezza: height,
        obiettivo_sonno: sleepGoal,
        livello_attivita: activityLevel,
        problemi_sonno: sleepIssues
      })
    });

    const result = await res.json();

    if (result.success) {
      successBox.style.display = 'block';
    } else {
      errorBox.textContent = result.message;
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.textContent = "Errore di connessione al server";
    errorBox.style.display = 'block';
  }
}


async function caricaProfilo(){
  const userEmail = window.loggedUserEmail;

  const successBox = document.getElementById('profileSuccess');
  const errorBox = document.getElementById('registerError');

  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  try {
    const res = await fetch('https://127.0.0.1:5000/caricaProfilo', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail
      })
    });

    const result = await res.json();

    if (result.success) {
      document.getElementById('fullName').value = result.profile.nome_completo;
      document.getElementById('age').value = result.profile.eta;
      document.getElementById('gender').value = result.profile.genere;
      document.getElementById('weight').value = result.profile.peso;
      document.getElementById('height').value = result.profile.altezza;
      document.getElementById('sleepGoal').value = result.profile.obiettivo_sonno;
      document.getElementById('activityLevel').value = result.profile.livello_attivita;
      document.getElementById('sleepIssues').value = result.profile.problemi_sonno;
    } else {
      errorBox.textContent = result.message;
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.textContent = "Errore di connessione al server";
    errorBox.style.display = 'block';
  }
    
}

// Clear all data

async function clearAllData() {
  if (confirm('Sei sicuro di voler cancellare tutti i dati?')) {
      // Ricarica la pagina per resettare lo stato
    
    
    const successBox = document.getElementById('profileSuccess');
    const errorBox = document.getElementById('registerError');
    errorBox.style.display = 'none';
    successBox.style.display = 'none';

    try{
      const res = await fetch('https://127.0.0.1:5000/clearAllData', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await res.json();

      if (result.success) {
        successBox.style.display = 'block';
        location.reload();
      }else{
        errorBox.textContent = "Errore";
        errorBox.style.display = 'block';
      }
    }catch(err){

    }
  }
}



 async function logout() {

    if (confirm('Sei sicuro di voler uscire?')) {
      // Ricarica la pagina per resettare lo stato
      try{
        const res = await fetch('https://127.0.0.1:5000/logout', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const result = await res.json();

      if (result.success) {
        
        console.log('Logout effettuato');
        location.reload();
      }else{

        console.log('Errore durante il logout:', result.message);
      }
    }catch(err){
      console.log('Errore durante il logout:', err);
    }
    }
  }

  function ricarica(){
    location.reload();
  }


  // PARTE GRAFICA

function hm(decimal) {
  const totalMin = Math.round(decimal * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}`;
}

function calcStages(night) {
  const awake = Math.min(night.DAW, night.TST * 0.12);         // max 12% del TST
  const deepFrac  = Math.min(0.28, Math.max(0.12, 0.35 - (night.MI / 100) * 0.50));
  const remFrac   = Math.min(0.25, Math.max(0.15, 0.25 - (night.AI / 60)  * 0.15));
  const deep  = deepFrac  * (night.TST - awake);
  const rem   = remFrac   * (night.TST - awake);
  const light = night.TST - awake - deep - rem;
  return { awake, deep, rem, light };
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

  caricaProfilo();
  loadSettings();
}

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
