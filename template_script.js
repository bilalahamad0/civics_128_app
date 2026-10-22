    // Embedded Official Database of 128 Questions
    const CIVICS_QUESTIONS = __CIVICS_JSON__;
    const STATES_DATA = __STATES_JSON__;

    // Firebase Cloud Configuration
    const firebaseConfig = {
      apiKey: 'YBwN9QTFI7H4VXp5tp-zPRc_l_Fot5iyDySazIA'.split('').reverse().join(''),
      authDomain: "civics-128-app.firebaseapp.com",
      projectId: "civics-128-app",
      storageBucket: "civics-128-app.firebasestorage.app",
      messagingSenderId: "489815550351",
      appId: "1:489815550351:web:9a50950f4456dcf5c003fa",
      measurementId: "G-7M4SG4N11M"
    };

    let firebaseApp = null;
    let firebaseAuth = null;
    let firestoreDb = null;
    let firestoreUnsubscribe = null;
    let saveDebounceTimer = null;

    // User State Store (persisted in localStorage + Cloud Firestore)
    const appState = {
      selectedState: 'CA',
      currentCardIndex: 0,
      courseworkLessonIndex: 0,
      lastCardId: 1,
      lastDeckFilter: 'all',
      activeTab: 'study',
      mastered: {},
      starred: {},
      missedCounts: {},
      simPasses: 0,
      simAttempts: 0,
      speechRate: 1.0,
      speechVoice: null,
      soundFx: true,
      lastUpdated: '2026-10-21'
    };

    // Current Active User Session
    let currentUser = null;

    function getStorageKey() {
      if (currentUser && currentUser.id) {
        return 'civics128_state_' + currentUser.id;
      }
      return 'civics128_state_guest';
    }

    function updateSyncStatus(status) {
      const ind = document.getElementById('sync-indicator');
      const modalSync = document.getElementById('profile-cloud-sync');
      if (status === 'syncing') {
        if (ind) {
          ind.textContent = '🔄';
          ind.title = 'Syncing progress to Cloud Firestore...';
          ind.className = 'text-[11px] text-blue-400 animate-spin';
        }
        if (modalSync) {
          modalSync.innerHTML = '<span>🔄</span> Syncing with Cloud...';
          modalSync.className = 'font-semibold text-blue-400 flex items-center gap-1';
        }
      } else if (status === 'synced') {
        if (ind) {
          ind.textContent = '☁️';
          ind.title = 'Progress synced to Cloud Firestore';
          ind.className = 'text-[11px] text-emerald-400';
        }
        if (modalSync) {
          modalSync.innerHTML = '<span>☁️</span> Firestore Connected';
          modalSync.className = 'font-semibold text-emerald-400 flex items-center gap-1';
        }
      } else if (status === 'offline') {
        if (ind) {
          ind.textContent = '⚡';
          ind.title = 'Offline mode (cached locally)';
          ind.className = 'text-[11px] text-amber-400';
        }
        if (modalSync) {
          modalSync.innerHTML = '<span>⚡</span> Offline (Local Cache)';
          modalSync.className = 'font-semibold text-amber-400 flex items-center gap-1';
        }
      } else if (status === 'error') {
        if (ind) {
          ind.textContent = '⚠️';
          ind.title = 'Cloud sync error (local progress saved)';
          ind.className = 'text-[11px] text-rose-400';
        }
        if (modalSync) {
          modalSync.innerHTML = '<span>⚠️</span> Sync Paused';
          modalSync.className = 'font-semibold text-rose-400 flex items-center gap-1';
        }
      }
    }

    function syncStateToFirestore() {
      if (!firestoreDb || !currentUser || !currentUser.id) return;
      updateSyncStatus('syncing');

      const userDocRef = firestoreDb.collection('users').doc(currentUser.id);
      const payload = {
        id: currentUser.id,
        name: currentUser.name || 'User',
        email: currentUser.email || '',
        state: currentUser.state || appState.selectedState || 'CA',
        selectedState: appState.selectedState || 'CA',
        mastered: appState.mastered || {},
        starred: appState.starred || {},
        missedCounts: appState.missedCounts || {},
        simPasses: Number(appState.simPasses) || 0,
        simAttempts: Number(appState.simAttempts) || 0,
        courseworkLessonIndex: Number(appState.courseworkLessonIndex) || 0,
        lastCardId: Number(appState.lastCardId) || 1,
        currentCardIndex: Number(appState.currentCardIndex) || 0,
        lastDeckFilter: String(appState.lastDeckFilter || 'all'),
        speechRate: Number(appState.speechRate) || 1.0,
        soundFx: appState.soundFx !== false,
        lastUpdated: new Date().toISOString()
      };

      userDocRef.set(payload, { merge: true })
        .then(() => {
          updateSyncStatus('synced');
        })
        .catch((err) => {
          console.warn('Firestore write warning:', err);
          updateSyncStatus('offline');
        });
    }

    function resetAppStateToDefaults() {
      appState.selectedState = currentUser ? currentUser.state : 'CA';
      appState.currentCardIndex = 0;
      appState.courseworkLessonIndex = 0;
      appState.lastCardId = 1;
      appState.lastDeckFilter = 'all';
      appState.activeTab = 'study';
      appState.mastered = {};
      appState.starred = {};
      appState.missedCounts = {};
      appState.simPasses = 0;
      appState.simAttempts = 0;
      appState.speechRate = 1.0;
      appState.speechVoice = null;
      appState.soundFx = true;
      appState.lastUpdated = new Date().toISOString().slice(0, 10);
    }

    // State persistence
    function saveState() {
      try {
        const key = getStorageKey();
        localStorage.setItem(key, JSON.stringify(appState));
      } catch (e) {
        console.warn('Could not save to localStorage', e);
      }

      // Real-time debounced sync to Cloud Firestore
      if (currentUser && currentUser.id && firestoreDb) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = setTimeout(() => {
          syncStateToFirestore();
        }, 400);
      }
    }

    function loadState() {
      const key = getStorageKey();
      let found = false;
      try {
        let saved = localStorage.getItem(key);
        // Backward compatibility for existing users who already used legacy 'civics128_state'
        if (!saved && !currentUser) {
          saved = localStorage.getItem('civics128_state');
        }
        if (saved) {
          const parsed = JSON.parse(saved);
          Object.assign(appState, parsed);
          found = true;
        }
      } catch (e) {
        console.warn('Could not load localStorage', e);
      }

      if (!found && currentUser) {
        resetAppStateToDefaults();
      }

      appState.selectedState = appState.selectedState || (currentUser ? currentUser.state : 'CA');
      appState.currentCardIndex = appState.currentCardIndex || 0;
      appState.lastDeckFilter = appState.lastDeckFilter || 'all';
      appState.activeTab = appState.activeTab || 'study';
    }

    // Dynamic State Question Resolver
    // Resolves state questions (Q23, Q29, Q61, Q62) for the user's selected state
    function getResolvedQuestion(q, stateCode) {
      if (!q) return null;
      const code = stateCode || appState.selectedState || 'CA';
      const st = STATES_DATA[code] || STATES_DATA['CA'];

      if (!q.isStateSpecific) {
        return { ...q };
      }

      const copy = { ...q };
      if (q.id === 61) {
        // Governor
        copy.question = `Who is the governor of your state now? (${st.name})`;
        copy.primaryAnswer = st.gov;
        copy.answers = [st.gov, `Governor ${st.gov}`];
        copy.options = [st.gov, ...(st.govDistractors || ['Ron DeSantis', 'Greg Abbott', 'Kathy Hochul'])];
        copy.explanation = `The current Governor of ${st.name} is ${st.gov}. (USCIS Oral Tip: Name the current sitting governor of your state at the time of your naturalization interview).`;
        copy.stateNote = `State-specific question for ${st.name}. Governor: ${st.gov}`;
      } else if (q.id === 23) {
        // Senators
        copy.question = `Who is one of your state's U.S. senators now? (${st.name})`;
        copy.primaryAnswer = st.sens[0];
        copy.answers = st.altSens ? [...st.sens, ...st.altSens] : [...st.sens];
        copy.options = [st.sens[0], ...(st.senDistractors || ['Ted Cruz', 'Chuck Schumer', 'Bernie Sanders'])];
        copy.explanation = `U.S. Senators for ${st.name} are ${st.sens.join(' and ')}${st.altSens ? ' (also accepted: ' + st.altSens.join(', ') + ')' : ''}. During the USCIS interview, you only need to name ONE.`;
        copy.stateNote = `State-specific question for ${st.name}. Senators: ${st.sens.join(', ')}`;
      } else if (q.id === 62) {
        // Capital
        copy.question = `What is the capital of your state? (${st.name})`;
        copy.primaryAnswer = st.capital;
        copy.answers = [st.capital];
        copy.options = [st.capital, ...(st.capitalDistractors || ['Los Angeles', 'San Francisco', 'San Diego'])];
        copy.explanation = `The capital of ${st.name} is ${st.capital}. Common test pitfall: Make sure not to name the largest city (e.g. Los Angeles or New York City) instead of the state capital.`;
        copy.stateNote = `State-specific question for ${st.name}. Capital: ${st.capital}`;
      } else if (q.id === 29) {
        // Representative
        copy.question = `Name your U.S. representative. (${st.name})`;
        copy.primaryAnswer = st.repsHint || 'Answers will vary by congressional district.';
        copy.answers = st.sampleReps 
          ? st.sampleReps.map(r => `Representative ${r}`).concat([`Answers will vary by congressional district (in ${st.name}: e.g. ${st.sampleReps.join(', ')})`]) 
          : ['Answers will vary by congressional district.'];
        copy.explanation = `${st.name} has ${st.districts || 'multiple'} congressional districts. (For example in California: Nancy Pelosi [CA-11], Ted Lieu [CA-36], Ro Khanna [CA-17], Kevin Kiley [CA-03]). Check house.gov to find yours.`;
        copy.stateNote = `State-specific question for ${st.name}. Districts: ${st.districts || 'Varies'}`;
      }
      return copy;
    }

    // Audio & Sound FX via Web Audio API
    let audioCtx = null;
    function getAudioContext() {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function playBeep(type) {
      if (!appState.soundFx) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'correct') {
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
        } else if (type === 'wrong') {
          osc.frequency.setValueAtTime(260, now);
          osc.frequency.setValueAtTime(200, now + 0.12);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
        } else if (type === 'flip') {
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
        } else if (type === 'pass') {
          [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.12, now + idx * 0.1);
            g.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.25);
            o.start(now + idx * 0.1);
            o.stop(now + idx * 0.1 + 0.25);
          });
        }
      } catch (err) {
        // Audio policy or unsupported
      }
    }

    // Text to Speech
    function speakText(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = appState.speechRate || 1.0;
      if (appState.speechVoice) {
        const voices = window.speechSynthesis.getVoices();
        const found = voices.find(v => v.name === appState.speechVoice);
        if (found) utterance.voice = found;
      }
      window.speechSynthesis.speak(utterance);
    }

    // Toast Notifications
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      const bg = type === 'success' ? 'bg-emerald-950 border-emerald-500 text-emerald-200' :
                 type === 'error' ? 'bg-rose-950 border-rose-500 text-rose-200' :
                 type === 'warn' ? 'bg-amber-950 border-amber-500 text-amber-200' :
                 'bg-slate-900 border-blue-500 text-blue-200';
      toast.className = `p-3.5 rounded-2xl border shadow-2xl text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${bg}`;
      toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span><span>${message}</span>`;
      container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      });
      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // Top Header Stats
    function updateTopStats() {
      const total = CIVICS_QUESTIONS.length;
      const masteredCount = Object.values(appState.mastered).filter(Boolean).length;
      const starredCount = Object.values(appState.starred).filter(Boolean).length;
      const readinessPct = Math.round((masteredCount / total) * 100);

      const elM = document.getElementById('stat-mastered');
      const elS = document.getElementById('stat-starred');
      const elP = document.getElementById('stat-passes');
      const elR = document.getElementById('stat-readiness');

      if (elM) elM.textContent = `${masteredCount} / ${total}`;
      if (elS) elS.textContent = `${starredCount}`;
      if (elP) elP.textContent = `${appState.simPasses || 0}`;
      if (elR) elR.textContent = `${readinessPct}%`;

      // Update Readiness tab progress bars
      const govQs = CIVICS_QUESTIONS.filter(q => q.category === 'American Government');
      const histQs = CIVICS_QUESTIONS.filter(q => q.category === 'American History');
      const symQs = CIVICS_QUESTIONS.filter(q => q.category === 'Symbols & Holidays');
      const ex6520Qs = CIVICS_QUESTIONS.filter(q => q.is6520);
      const newQs = CIVICS_QUESTIONS.filter(q => q.origin === 'new');
      const amendedQs = CIVICS_QUESTIONS.filter(q => q.origin === 'amended');
      const stateQs = CIVICS_QUESTIONS.filter(q => q.isStateSpecific);

      const govM = govQs.filter(q => appState.mastered[q.id]).length;
      const histM = histQs.filter(q => appState.mastered[q.id]).length;
      const symM = symQs.filter(q => appState.mastered[q.id]).length;
      const ex6520M = ex6520Qs.filter(q => appState.mastered[q.id]).length;
      const newM = newQs.filter(q => appState.mastered[q.id]).length;
      const amendedM = amendedQs.filter(q => appState.mastered[q.id]).length;
      const stateM = stateQs.filter(q => appState.mastered[q.id]).length;

      const setProg = (barId, labelId, count, tot) => {
        const bar = document.getElementById(barId);
        const lbl = document.getElementById(labelId);
        const p = tot > 0 ? Math.round((count / tot) * 100) : 0;
        if (bar) bar.style.width = `${p}%`;
        if (lbl) lbl.textContent = `${count} / ${tot} Mastered (${p}%)`;
      };

      setProg('prog-bar-gov', 'prog-label-gov', govM, govQs.length);
      setProg('prog-bar-hist', 'prog-label-hist', histM, histQs.length);
      setProg('prog-bar-sym', 'prog-label-sym', symM, symQs.length);
      setProg('prog-bar-6520', 'prog-label-6520', ex6520M, ex6520Qs.length);
      setProg('prog-bar-new', 'prog-label-new', newM, newQs.length);
      setProg('prog-bar-amended', 'prog-label-amended', amendedM, amendedQs.length);
      setProg('prog-bar-state', 'prog-label-state', stateM, stateQs.length);

      const overallProg = document.getElementById('readiness-overall-pct');
      if (overallProg) overallProg.textContent = `${readinessPct}%`;

      renderStarredAndMissedHubs();
    }

    function renderStarredAndMissedHubs() {
      // Starred
      const starList = document.getElementById('starred-items-list');
      const starCount = document.getElementById('starred-count-hub');
      const starred = CIVICS_QUESTIONS.filter(q => appState.starred[q.id]);
      if (starCount) starCount.textContent = starred.length;
      if (starList) {
        if (starred.length === 0) {
          starList.innerHTML = `<div class="text-slate-500 italic py-4 text-center">No starred questions yet. Click the star icon on any card to add it here.</div>`;
        } else {
          starList.innerHTML = starred.map(q => {
            const rq = getResolvedQuestion(q, appState.selectedState);
            return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 cursor-pointer" onclick="jumpToFlashcard(${q.id})">
              <span class="truncate text-slate-200">#${q.id}. ${rq.question}</span>
              <span class="text-amber-400 font-bold ml-2 shrink-0">★</span>
            </div>`;
          }).join('');
        }
      }

      // Missed
      const missList = document.getElementById('missed-items-list');
      const missCount = document.getElementById('missed-count-hub');
      const missedIds = Object.keys(appState.missedCounts).filter(id => appState.missedCounts[id] > 0);
      if (missCount) missCount.textContent = missedIds.length;
      if (missList) {
        if (missedIds.length === 0) {
          missList.innerHTML = `<div class="text-slate-500 italic py-4 text-center">No missed questions recorded. Clean record!</div>`;
        } else {
          missList.innerHTML = missedIds.map(id => {
            const q = CIVICS_QUESTIONS.find(item => item.id === Number(id));
            if (!q) return '';
            const rq = getResolvedQuestion(q, appState.selectedState);
            return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/40 cursor-pointer" onclick="jumpToFlashcard(${q.id})">
              <span class="truncate text-slate-200">#${q.id}. ${rq.question}</span>
              <span class="text-rose-400 font-bold text-[10px] ml-2 shrink-0 bg-rose-950/60 px-1.5 py-0.5 rounded">${appState.missedCounts[id]}x missed</span>
            </div>`;
          }).join('');
        }
      }
    }

    // TAB SWITCHING
    const tabButtons = {
      study: document.getElementById('nav-study'),
      prepare: document.getElementById('nav-prepare'),
      challenge: document.getElementById('nav-challenge'),
      readiness: document.getElementById('nav-readiness'),
      coursework: document.getElementById('nav-coursework')
    };

    const tabViews = {
      study: document.getElementById('view-study'),
      prepare: document.getElementById('view-prepare'),
      challenge: document.getElementById('view-challenge'),
      readiness: document.getElementById('view-readiness'),
      coursework: document.getElementById('view-coursework')
    };

    function switchTab(tabId) {
      Object.keys(tabViews).forEach(id => {
        if (tabViews[id]) tabViews[id].classList.add('hidden');
        if (tabButtons[id]) {
          tabButtons[id].className = 'tab-btn px-4 py-3 font-semibold text-sm rounded-t-xl transition flex items-center gap-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 shrink-0';
        }
      });

      if (tabViews[tabId]) tabViews[tabId].classList.remove('hidden');
      if (tabButtons[tabId]) {
        tabButtons[tabId].className = 'tab-btn px-4 py-3 font-semibold text-sm rounded-t-xl transition flex items-center gap-2 border-b-2 border-blue-500 text-blue-400 bg-slate-800/60 shrink-0';
      }

      appState.activeTab = tabId;
      saveState();

      if (tabId === 'readiness') {
        updateTopStats();
      } else if (tabId === 'coursework') {
        initCourseworkView();
      }
    }

    Object.keys(tabButtons).forEach(id => {
      if (tabButtons[id]) {
        tabButtons[id].addEventListener('click', () => switchTab(id));
      }
    });

    // STUDY & FLASHCARDS CONTROLLER
    let currentDeck = [...CIVICS_QUESTIONS];
    let currentCardIndex = 0;
    let isFlipped = false;

    function applyStudyDeckFilter(filter, preserveIndex = false) {
      if (filter === 'all') {
        currentDeck = [...CIVICS_QUESTIONS];
      } else if (filter === '6520') {
        currentDeck = CIVICS_QUESTIONS.filter(q => q.is6520);
      } else if (filter === 'new') {
        currentDeck = CIVICS_QUESTIONS.filter(q => q.origin === 'new');
      } else if (filter === 'amended') {
        currentDeck = CIVICS_QUESTIONS.filter(q => q.origin === 'amended');
      } else if (filter === 'state') {
        currentDeck = CIVICS_QUESTIONS.filter(q => q.isStateSpecific);
      } else if (filter === 'starred') {
        currentDeck = CIVICS_QUESTIONS.filter(q => appState.starred[q.id]);
        if (currentDeck.length === 0) {
          showToast('No starred questions found! Showing all 128 questions.', 'info');
          currentDeck = [...CIVICS_QUESTIONS];
        }
      } else if (filter === 'unmastered') {
        currentDeck = CIVICS_QUESTIONS.filter(q => !appState.mastered[q.id]);
        if (currentDeck.length === 0) {
          showToast('All questions mastered! Congratulations!', 'success');
          currentDeck = [...CIVICS_QUESTIONS];
        }
      } else {
        currentDeck = CIVICS_QUESTIONS.filter(q => q.category === filter);
      }

      const deckFilterSelect = document.getElementById('study-deck-filter');
      if (deckFilterSelect) deckFilterSelect.value = filter;

      appState.lastDeckFilter = filter;
      if (!preserveIndex) {
        currentCardIndex = 0;
      }
      saveState();
      updateFlashcardView();
    }

    function updateFlashcardView() {
      if (currentDeck.length === 0) currentDeck = [...CIVICS_QUESTIONS];
      if (currentCardIndex >= currentDeck.length) currentCardIndex = 0;
      if (currentCardIndex < 0) currentCardIndex = currentDeck.length - 1;

      const rawQ = currentDeck[currentCardIndex];
      const q = getResolvedQuestion(rawQ, appState.selectedState);
      const st = STATES_DATA[appState.selectedState || 'CA'] || STATES_DATA['CA'];

      // Save position for persistence
      appState.currentCardIndex = currentCardIndex;
      appState.lastCardId = q.id;
      saveState();

      isFlipped = false;
      const flipper = document.getElementById('flashcard-flipper');
      if (flipper) flipper.classList.remove('rotate-y-180');

      const fcCounter = document.getElementById('fc-counter');
      if (fcCounter) fcCounter.textContent = `Card ${currentCardIndex + 1} of ${currentDeck.length}`;

      const fcQnumFront = document.getElementById('fc-qnum-front');
      if (fcQnumFront) fcQnumFront.textContent = `Question #${q.id}`;

      const fcCatBadge = document.getElementById('fc-cat-badge-front');
      if (fcCatBadge) fcCatBadge.textContent = q.subcategory;

      const fcQuestionText = document.getElementById('fc-question-text');
      if (fcQuestionText) fcQuestionText.textContent = q.question;

      // 65/20 Badge
      const badge6520 = document.getElementById('fc-6520-front');
      if (badge6520) {
        if (q.is6520) badge6520.classList.remove('hidden');
        else badge6520.classList.add('hidden');
      }

      // Origin Badge (New in 128 / Amended / Standard)
      const originBadge = document.getElementById('fc-origin-front');
      if (originBadge) {
        if (q.origin === 'new') {
          originBadge.textContent = '🆕 New in 128';
          originBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-600/50';
          originBadge.classList.remove('hidden');
        } else if (q.origin === 'amended') {
          originBadge.textContent = '✏️ Amended';
          originBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-600/50';
          originBadge.classList.remove('hidden');
        } else {
          originBadge.classList.add('hidden');
        }
      }

      // State Specific Badge
      const stateBadge = document.getElementById('fc-state-front');
      if (stateBadge) {
        if (q.isStateSpecific) {
          stateBadge.textContent = `📍 ${st.name} Question`;
          stateBadge.classList.remove('hidden');
        } else {
          stateBadge.classList.add('hidden');
        }
      }

      // Star Button
      const starBtn = document.getElementById('fc-btn-star-front');
      if (starBtn) {
        if (appState.starred[q.id]) {
          starBtn.classList.add('text-amber-400');
          starBtn.classList.remove('text-slate-400');
        } else {
          starBtn.classList.remove('text-amber-400');
          starBtn.classList.add('text-slate-400');
        }
      }

      // Card Back
      const fcQnumBack = document.getElementById('fc-qnum-back');
      if (fcQnumBack) fcQnumBack.textContent = `Answers: Question #${q.id}`;

      // Answers List
      const answersUl = document.getElementById('fc-answers-list');
      if (answersUl) {
        answersUl.innerHTML = q.answers.map(ans => `
          <li class="flex items-start gap-2 text-sm text-slate-100">
            <span class="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
            <span>${ans}</span>
          </li>
        `).join('');
      }

      // State-specific banner on back
      const stateBanner = document.getElementById('fc-state-banner');
      const stateBannerTitle = document.getElementById('fc-state-banner-title');
      const stateBannerDetails = document.getElementById('fc-state-banner-details');
      if (stateBanner && stateBannerTitle && stateBannerDetails) {
        if (q.isStateSpecific) {
          stateBanner.classList.remove('hidden');
          stateBannerTitle.textContent = `${st.name} Officials (${st.name}):`;
          if (q.id === 61) {
            stateBannerDetails.innerHTML = `State Governor: <strong class="text-emerald-300">${st.gov}</strong> (Always name the sitting governor at your interview date).`;
          } else if (q.id === 23) {
            stateBannerDetails.innerHTML = `U.S. Senators: <strong class="text-blue-300">${st.sens.join(' and ')}</strong> (You only need to name ONE).`;
          } else if (q.id === 62) {
            stateBannerDetails.innerHTML = `State Capital: <strong class="text-amber-300">${st.capital}</strong> (Sacramento, not Los Angeles or San Francisco).`;
          } else if (q.id === 29) {
            stateBannerDetails.innerHTML = `Representative: <strong class="text-purple-300">${st.repsHint || 'Answers will vary by congressional district.'}</strong>`;
          }
        } else {
          stateBanner.classList.add('hidden');
        }
      }

      // Origin Footnote on Back (Subtle footnote underneath the primary Study Tip)
      const originBox = document.getElementById('fc-origin-box');
      const originIcon = document.getElementById('fc-origin-icon');
      const originBadgeText = document.getElementById('fc-origin-badge-text');
      const originNoteText = document.getElementById('fc-origin-note-text');
      if (originBox && originIcon && originBadgeText && originNoteText) {
        let note = q.originNote || '';
        let badge = '';
        let icon = '📋';
        if (q.origin === 'new') {
          icon = '🆕';
          badge = 'New in 128 Test:';
          note = note || 'Newly added to the expanded 128-question civics examination pool.';
        } else if (q.origin === 'amended') {
          icon = '✏️';
          badge = 'Amended Question:';
          note = note || 'Wording, scope, or answer count amended from the older 100-question test.';
        } else {
          icon = '📋';
          badge = 'Standard Retained:';
          note = note || 'Carried over from the standard 2008 naturalization civics test.';
        }
        if (q.is6520) {
          note += ' (Designated for 65/20 Special Exemption applicants).';
        }
        originIcon.textContent = icon;
        originBadgeText.textContent = badge;
        originNoteText.textContent = note;
        originBox.classList.remove('hidden');
      }

      // Tip Text
      const tipText = document.getElementById('fc-tip-text');
      if (tipText) tipText.textContent = q.explanation;

      // Master Toggle
      const masterBtn = document.getElementById('fc-btn-master-toggle');
      if (masterBtn) {
        if (appState.mastered[q.id]) {
          masterBtn.innerHTML = '<span>✅ Mastered</span>';
          masterBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-500/60 text-xs font-semibold transition flex items-center gap-1.5';
        } else {
          masterBtn.innerHTML = '<span>✓ Mark Mastered</span>';
          masterBtn.className = 'px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-600/50 text-xs font-semibold transition flex items-center gap-1.5';
        }
      }

      // Jump select
      const jumpSelect = document.getElementById('fc-jump-select');
      if (jumpSelect) jumpSelect.value = q.id;
    }

    function flipCard() {
      playBeep('flip');
      const flipper = document.getElementById('flashcard-flipper');
      isFlipped = !isFlipped;
      if (flipper) {
        if (isFlipped) flipper.classList.add('rotate-y-180');
        else flipper.classList.remove('rotate-y-180');
      }
    }

    function nextCard() {
      currentCardIndex = (currentCardIndex + 1) % currentDeck.length;
      updateFlashcardView();
    }

    function prevCard() {
      currentCardIndex = (currentCardIndex - 1 + currentDeck.length) % currentDeck.length;
      updateFlashcardView();
    }

    function toggleStar(qid) {
      appState.starred[qid] = !appState.starred[qid];
      saveState();
      updateTopStats();
      updateFlashcardView();
      showToast(appState.starred[qid] ? '⭐ Question added to Starred!' : 'Star removed', 'info');
    }

    function toggleMastered(qid) {
      appState.mastered[qid] = !appState.mastered[qid];
      if (appState.mastered[qid]) playBeep('correct');
      saveState();
      updateTopStats();
      updateFlashcardView();
      showToast(appState.mastered[qid] ? '✅ Question marked as Mastered!' : 'Unmarked from Mastered', 'success');
    }

    function jumpToFlashcard(qid) {
      const idx = currentDeck.findIndex(q => q.id === qid);
      if (idx !== -1) {
        currentCardIndex = idx;
      } else {
        // Switch to all questions to locate
        applyStudyDeckFilter('all', false);
        currentCardIndex = CIVICS_QUESTIONS.findIndex(q => q.id === qid);
      }
      switchTab('study');
      document.getElementById('btn-mode-flashcards').click();
      updateFlashcardView();
    }

    // Touch Swipe Support for iOS / Tablets
    let touchStartX = 0;
    let touchEndX = 0;
    const cardContainer = document.getElementById('flashcard-flipper');
    if (cardContainer) {
      cardContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      cardContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }, { passive: true });
    }

    function handleSwipe() {
      const swipeDistance = touchEndX - touchStartX;
      if (Math.abs(swipeDistance) > 60) {
        if (swipeDistance < 0) {
          nextCard(); // Swiped left -> next
        } else {
          prevCard(); // Swiped right -> prev
        }
      }
    }

    // Flashcard UI event bindings
    document.getElementById('card-front')?.addEventListener('click', flipCard);
    document.getElementById('card-back')?.addEventListener('click', flipCard);
    document.getElementById('fc-btn-next')?.addEventListener('click', (e) => { e.stopPropagation(); nextCard(); });
    document.getElementById('fc-btn-prev')?.addEventListener('click', (e) => { e.stopPropagation(); prevCard(); });
    document.getElementById('fc-btn-flip')?.addEventListener('click', (e) => { e.stopPropagation(); flipCard(); });

    document.getElementById('fc-btn-star-front')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = currentDeck[currentCardIndex];
      toggleStar(q.id);
    });

    document.getElementById('fc-btn-master-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = currentDeck[currentCardIndex];
      toggleMastered(q.id);
    });

    document.getElementById('fc-btn-listen-front')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = getResolvedQuestion(currentDeck[currentCardIndex], appState.selectedState);
      speakText(q.question);
    });

    document.getElementById('fc-btn-listen-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = getResolvedQuestion(currentDeck[currentCardIndex], appState.selectedState);
      const textToSpeak = q.answers.join('. Or, ');
      speakText(textToSpeak);
    });

    document.getElementById('fc-btn-shuffle')?.addEventListener('click', () => {
      for (let i = currentDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentDeck[i], currentDeck[j]] = [currentDeck[j], currentDeck[i]];
      }
      currentCardIndex = 0;
      updateFlashcardView();
      showToast('Deck shuffled!', 'info');
    });

    document.getElementById('study-deck-filter')?.addEventListener('change', (e) => {
      applyStudyDeckFilter(e.target.value);
    });

    // Populate Jump Select
    const jumpSelect = document.getElementById('fc-jump-select');
    if (jumpSelect) {
      CIVICS_QUESTIONS.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = `Q#${q.id} - ${q.question.substring(0, 48)}...`;
        jumpSelect.appendChild(opt);
      });
      jumpSelect.addEventListener('change', (e) => {
        jumpToFlashcard(Number(e.target.value));
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('view-study').classList.contains('hidden')) return;
      if (document.getElementById('subview-flashcards').classList.contains('hidden')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        flipCard();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      }
    });

    // Subview toggle: Flashcards vs Catalog
    const btnModeFlashcards = document.getElementById('btn-mode-flashcards');
    const btnModeCatalog = document.getElementById('btn-mode-catalog');
    const subviewFlashcards = document.getElementById('subview-flashcards');
    const subviewCatalog = document.getElementById('subview-catalog');

    btnModeFlashcards?.addEventListener('click', () => {
      btnModeFlashcards.className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white shadow-md shadow-blue-900/30 transition';
      btnModeCatalog.className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white transition';
      subviewFlashcards.classList.remove('hidden');
      subviewCatalog.classList.add('hidden');
      updateFlashcardView();
    });

    btnModeCatalog?.addEventListener('click', () => {
      btnModeCatalog.className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white shadow-md shadow-blue-900/30 transition';
      btnModeFlashcards.className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white transition';
      subviewCatalog.classList.remove('hidden');
      subviewFlashcards.classList.add('hidden');
      renderCatalog();
    });

    // QUESTION CATALOG CONTROLLER
    let catalogFilterType = 'all';

    function renderCatalog() {
      const container = document.getElementById('catalog-list-container');
      const searchVal = document.getElementById('catalog-search')?.value.toLowerCase().trim() || '';
      if (!container) return;

      let list = CIVICS_QUESTIONS.filter(q => {
        if (catalogFilterType === '6520' && !q.is6520) return false;
        if (catalogFilterType === 'new' && q.origin !== 'new') return false;
        if (catalogFilterType === 'amended' && q.origin !== 'amended') return false;
        if (catalogFilterType === 'state' && !q.isStateSpecific) return false;
        if (catalogFilterType === 'gov' && q.category !== 'American Government') return false;
        if (catalogFilterType === 'hist' && q.category !== 'American History') return false;
        if (catalogFilterType === 'sym' && q.category !== 'Symbols & Holidays') return false;
        if (catalogFilterType === 'star' && !appState.starred[q.id]) return false;

        if (searchVal) {
          const rq = getResolvedQuestion(q, appState.selectedState);
          const fullText = (rq.question + ' ' + rq.answers.join(' ') + ' ' + (rq.explanation || '')).toLowerCase();
          if (!fullText.includes(searchVal)) return false;
        }
        return true;
      });

      const countLabel = document.getElementById('catalog-count-label');
      if (countLabel) countLabel.textContent = `Showing ${list.length} of ${CIVICS_QUESTIONS.length} questions`;

      container.innerHTML = list.map(rawQ => {
        const q = getResolvedQuestion(rawQ, appState.selectedState);
        const isMastered = !!appState.mastered[q.id];
        const isStarred = !!appState.starred[q.id];
        
        const originPill = q.origin === 'new' 
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-600/40">🆕 New</span>'
          : q.origin === 'amended'
          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600/40">✏️ Amended</span>'
          : '';

        const statePill = q.isStateSpecific 
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/40">📍 ${STATES_DATA[appState.selectedState || 'CA'].name}</span>`
          : '';

        return `
        <div class="p-4 rounded-2xl bg-slate-900 border ${isMastered ? 'border-emerald-500/40' : 'border-slate-800'} hover:border-slate-700 transition space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-950 text-blue-300 border border-blue-500/30">#${q.id}</span>
                <span class="text-xs text-slate-400 font-medium">${q.subcategory}</span>
                ${q.is6520 ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600/40">★ 65/20</span>' : ''}
                ${originPill}
                ${statePill}
              </div>
              <h4 class="text-base font-bold text-white pt-1">${q.question}</h4>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
              <button onclick="toggleStar(${q.id})" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 ${isStarred ? 'text-amber-400' : 'text-slate-400'} transition" title="Star question">
                ★
              </button>
              <button onclick="toggleMastered(${q.id})" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 ${isMastered ? 'text-emerald-400' : 'text-slate-400'} transition" title="Mark mastered">
                ${isMastered ? '✅' : '✓'}
              </button>
              <button onclick="jumpToFlashcard(${q.id})" class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition" title="Study in flashcards">
                Card →
              </button>
            </div>
          </div>

          <!-- Answers -->
          <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-1">
            <div class="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">USCIS Official Accepted Answers:</div>
            <ul class="space-y-1 text-slate-200">
              ${q.answers.map(ans => `<li class="flex items-start gap-1.5"><span class="text-emerald-400 shrink-0 font-bold">•</span><span>${ans}</span></li>`).join('')}
            </ul>
          </div>

          <!-- Study Tip Box -->
          ${q.explanation ? `
          <div class="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-100 flex items-start gap-2.5 shadow-sm">
            <span class="text-amber-400 text-sm leading-none shrink-0 mt-0.5">💡</span>
            <div class="leading-relaxed">
              <span class="font-bold text-amber-300">Study Tip:</span>
              <span class="text-slate-200 ml-1">${q.explanation}</span>
            </div>
          </div>` : ''}
        </div>`;
      }).join('');
    }

    // Catalog Filter Buttons
    const catFilterButtons = {
      'catalog-filter-all': 'all',
      'catalog-filter-6520': '6520',
      'catalog-filter-new': 'new',
      'catalog-filter-amended': 'amended',
      'catalog-filter-state': 'state',
      'catalog-filter-gov': 'gov',
      'catalog-filter-hist': 'hist',
      'catalog-filter-sym': 'sym',
      'catalog-filter-star': 'star'
    };

    Object.keys(catFilterButtons).forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cat-filter-btn').forEach(b => {
            b.className = 'cat-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white';
          });
          btn.className = 'cat-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white';
          catalogFilterType = catFilterButtons[btnId];
          renderCatalog();
        });
      }
    });

    document.getElementById('catalog-search')?.addEventListener('input', () => {
      renderCatalog();
    });

    // PRACTICE QUIZ CONTROLLER
    let quizQuestions = [];
    let quizCurrentIdx = 0;
    let quizScore = 0;
    let quizFormat = 'mc';
    let quizUserAnswers = [];
    let quizSelectedCount = 20;

    document.querySelectorAll('.btn-qcount').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-qcount').forEach(b => {
          b.className = 'btn-qcount p-3 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-white hover:bg-slate-700';
        });
        e.currentTarget.className = 'btn-qcount p-3 rounded-xl bg-blue-600 border border-blue-500 text-sm font-semibold text-white';
        quizSelectedCount = Number(e.currentTarget.dataset.count);
      });
    });

    function buildQuizPool() {
      const incGov = document.getElementById('chk-cat-gov')?.checked ?? true;
      const incHist = document.getElementById('chk-cat-hist')?.checked ?? true;
      const incSym = document.getElementById('chk-cat-sym')?.checked ?? true;
      const only6520 = document.getElementById('chk-filter-6520')?.checked ?? false;
      const onlyStarred = document.getElementById('chk-filter-starred')?.checked ?? false;

      let pool = CIVICS_QUESTIONS.filter(q => {
        if (only6520 && !q.is6520) return false;
        if (onlyStarred && !appState.starred[q.id]) return false;
        if (q.category === 'American Government' && !incGov) return false;
        if (q.category === 'American History' && !incHist) return false;
        if (q.category === 'Symbols & Holidays' && !incSym) return false;
        return true;
      });

      if (pool.length === 0) {
        showToast('No questions matched filters. Using full 128 questions pool.', 'info');
        pool = [...CIVICS_QUESTIONS];
      }

      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      return pool.slice(0, Math.min(quizSelectedCount, pool.length));
    }

    document.getElementById('btn-start-quiz')?.addEventListener('click', () => {
      quizFormat = document.querySelector('input[name="quiz-format"]:checked')?.value || 'mc';
      quizQuestions = buildQuizPool();
      quizCurrentIdx = 0;
      quizScore = 0;
      quizUserAnswers = [];

      document.getElementById('quiz-config-card')?.classList.add('hidden');
      document.getElementById('quiz-results-container')?.classList.add('hidden');
      document.getElementById('quiz-active-container')?.classList.remove('hidden');

      renderQuizQuestion();
    });

    function renderQuizQuestion() {
      if (quizCurrentIdx >= quizQuestions.length) {
        finishQuiz();
        return;
      }

      const rawQ = quizQuestions[quizCurrentIdx];
      const q = getResolvedQuestion(rawQ, appState.selectedState);

      document.getElementById('quiz-progress-text').textContent = `Question ${quizCurrentIdx + 1} of ${quizQuestions.length}`;
      document.getElementById('quiz-badge-mode').textContent = quizFormat === 'mc' ? 'Multiple Choice' : 'Oral Self-Check';
      document.getElementById('quiz-live-score').textContent = `${quizScore} Correct`;

      const pct = (quizCurrentIdx / quizQuestions.length) * 100;
      document.getElementById('quiz-progress-bar').style.width = `${pct}%`;

      document.getElementById('quiz-qnum').textContent = `Question #${q.id}`;
      document.getElementById('quiz-subcat').textContent = q.subcategory;
      document.getElementById('quiz-question-text').textContent = q.question;

      document.getElementById('quiz-feedback-box').classList.add('hidden');
      document.getElementById('quiz-btn-next').classList.add('hidden');

      if (quizFormat === 'mc') {
        document.getElementById('quiz-options-container').classList.remove('hidden');
        document.getElementById('quiz-oral-container').classList.add('hidden');

        const opts = [...q.options];
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]];
        }

        const container = document.getElementById('quiz-options-container');
        container.innerHTML = opts.map((opt, i) => `
          <button type="button" class="quiz-opt-btn w-full text-left p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-900 text-sm font-semibold text-slate-200 transition flex items-center justify-between" data-val="${opt.replace(/"/g, '&quot;')}">
            <span>${String.fromCharCode(65 + i)}. ${opt}</span>
            <span class="opt-icon text-base"></span>
          </button>
        `).join('');

        container.querySelectorAll('.quiz-opt-btn').forEach(btn => {
          btn.addEventListener('click', (e) => handleMCOptionClick(e.currentTarget.dataset.val, q));
        });

      } else {
        document.getElementById('quiz-options-container').classList.add('hidden');
        document.getElementById('quiz-oral-container').classList.remove('hidden');
        document.getElementById('quiz-oral-answers-box').classList.add('hidden');
      }
    }

    function handleMCOptionClick(chosenOpt, q) {
      const btns = document.querySelectorAll('.quiz-opt-btn');
      btns.forEach(b => b.disabled = true);

      const isCorrect = chosenOpt === q.primaryAnswer;
      if (isCorrect) {
        quizScore++;
        playBeep('correct');
      } else {
        playBeep('wrong');
        appState.missedCounts[q.id] = (appState.missedCounts[q.id] || 0) + 1;
        saveState();
      }

      quizUserAnswers.push({ q, chosen: chosenOpt, isCorrect });

      btns.forEach(b => {
        if (b.dataset.val === q.primaryAnswer) {
          b.className = 'quiz-opt-btn w-full text-left p-4 rounded-2xl bg-emerald-950 border-2 border-emerald-500 text-sm font-semibold text-emerald-200 transition flex items-center justify-between';
          b.querySelector('.opt-icon').textContent = '✓';
        } else if (b.dataset.val === chosenOpt && !isCorrect) {
          b.className = 'quiz-opt-btn w-full text-left p-4 rounded-2xl bg-rose-950 border-2 border-rose-500 text-sm font-semibold text-rose-200 transition flex items-center justify-between';
          b.querySelector('.opt-icon').textContent = '✗';
        } else {
          b.className = 'quiz-opt-btn w-full text-left p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-sm text-slate-500 transition flex items-center justify-between opacity-50';
        }
      });

      const fb = document.getElementById('quiz-feedback-box');
      fb.classList.remove('hidden');
      if (isCorrect) {
        fb.className = 'p-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 text-sm space-y-1';
        document.getElementById('quiz-feedback-verdict').innerHTML = '<span class="text-emerald-400 text-base">✓ Correct!</span>';
      } else {
        fb.className = 'p-4 rounded-2xl border border-rose-500/40 bg-rose-950/40 text-sm space-y-1';
        document.getElementById('quiz-feedback-verdict').innerHTML = `<span class="text-rose-400 text-base">✗ Incorrect.</span> <span class="text-slate-300 font-normal">Accepted: <strong>${q.primaryAnswer}</strong></span>`;
      }
      document.getElementById('quiz-feedback-explanation').textContent = `💡 ${q.explanation}`;

      document.getElementById('quiz-btn-next').classList.remove('hidden');
    }

    document.getElementById('quiz-btn-reveal-oral')?.addEventListener('click', () => {
      const rawQ = quizQuestions[quizCurrentIdx];
      const q = getResolvedQuestion(rawQ, appState.selectedState);
      const box = document.getElementById('quiz-oral-answers-box');
      box.classList.remove('hidden');
      const ul = document.getElementById('quiz-oral-answers-list');
      ul.innerHTML = q.answers.map(a => `<li class="flex items-center gap-2"><span class="text-emerald-400 font-bold">•</span><span>${a}</span></li>`).join('');
    });

    document.getElementById('quiz-btn-oral-correct')?.addEventListener('click', () => {
      const q = quizQuestions[quizCurrentIdx];
      quizScore++;
      playBeep('correct');
      quizUserAnswers.push({ q, chosen: 'Self-graded Correct', isCorrect: true });
      quizCurrentIdx++;
      renderQuizQuestion();
    });

    document.getElementById('quiz-btn-oral-wrong')?.addEventListener('click', () => {
      const q = quizQuestions[quizCurrentIdx];
      playBeep('wrong');
      appState.missedCounts[q.id] = (appState.missedCounts[q.id] || 0) + 1;
      saveState();
      quizUserAnswers.push({ q, chosen: 'Self-graded Incorrect', isCorrect: false });
      quizCurrentIdx++;
      renderQuizQuestion();
    });

    document.getElementById('quiz-btn-next')?.addEventListener('click', () => {
      quizCurrentIdx++;
      renderQuizQuestion();
    });

    function finishQuiz() {
      document.getElementById('quiz-active-container')?.classList.add('hidden');
      document.getElementById('quiz-results-container')?.classList.remove('hidden');

      const total = quizQuestions.length;
      const pct = Math.round((quizScore / total) * 100);
      const passed = pct >= 60;

      if (passed) playBeep('pass');
      else playBeep('wrong');

      const badge = document.getElementById('quiz-result-badge');
      const title = document.getElementById('quiz-result-title');
      const subtitle = document.getElementById('quiz-result-subtitle');

      if (passed) {
        badge.textContent = 'PASSED PRACTICE QUIZ';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-sm font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40';
        title.textContent = 'Outstanding Work!';
        subtitle.textContent = `You scored ${quizScore} out of ${total} (${pct}% accuracy). Ready for the Interview Simulator!`;
      } else {
        badge.textContent = 'NEEDS MORE DRILL';
        badge.className = 'inline-block px-4 py-1.5 rounded-full text-sm font-bold bg-amber-950 text-amber-300 border border-amber-500/40';
        title.textContent = 'Keep Studying!';
        subtitle.textContent = `You scored ${quizScore} out of ${total} (${pct}%). USCIS requires at least 60% to pass.`;
      }

      document.getElementById('res-total-count').textContent = total;
      document.getElementById('res-correct-count').textContent = quizScore;
      document.getElementById('res-incorrect-count').textContent = total - quizScore;
      document.getElementById('res-accuracy-pct').textContent = `${pct}%`;

      const breakdown = document.getElementById('quiz-breakdown-list');
      if (breakdown) {
        breakdown.innerHTML = quizUserAnswers.map((item, idx) => `
          <div class="p-3 rounded-xl bg-slate-950 border ${item.isCorrect ? 'border-emerald-500/30' : 'border-rose-500/30'} flex items-start justify-between gap-3">
            <div>
              <div class="font-bold text-white">#${item.q.id}. ${item.q.question}</div>
              <div class="text-xs ${item.isCorrect ? 'text-emerald-400' : 'text-rose-400'} mt-1">
                Your Answer: ${item.chosen} ${item.isCorrect ? '✓' : `(Correct: ${item.q.primaryAnswer})`}
              </div>
            </div>
            <button onclick="jumpToFlashcard(${item.q.id})" class="px-2.5 py-1 rounded-lg bg-slate-800 text-blue-400 hover:text-white text-[11px] font-semibold shrink-0">
              Review Card →
            </button>
          </div>
        `).join('');
      }
    }

    document.getElementById('btn-quiz-new')?.addEventListener('click', () => {
      document.getElementById('quiz-results-container')?.classList.add('hidden');
      document.getElementById('quiz-config-card')?.classList.remove('hidden');
    });

    document.getElementById('btn-quiz-goto-challenge')?.addEventListener('click', () => {
      switchTab('challenge');
      document.getElementById('btn-launch-uscis-sim')?.click();
    });

    // STATE SELECTOR & QUICK CONFIG
    function updateStateDisplay(code) {
      const st = STATES_DATA[code] || STATES_DATA['CA'];
      appState.selectedState = code;
      saveState();

      // Header pills
      const qName = document.getElementById('quick-state-name');
      const qGov = document.getElementById('quick-state-gov');
      if (qName) qName.textContent = `${st.name} (${code})`;
      if (qGov) qGov.textContent = `Gov. ${st.gov}`;

      // Readiness card
      const elCap = document.getElementById('st-capital');
      const elGov = document.getElementById('st-gov');
      const elSens = document.getElementById('st-senators');
      const elDist = document.getElementById('st-districts');
      const rBadge = document.getElementById('readiness-state-badge');

      if (elCap) elCap.textContent = st.capital;
      if (elGov) elGov.textContent = st.gov;
      if (elSens) elSens.textContent = st.sens.join(', ') + (st.altSens ? ` (${st.altSens.join(', ')})` : '');
      if (elDist) elDist.textContent = st.districts ? `${st.districts} Congressional Districts` : 'Varies by zip';
      if (rBadge) rBadge.textContent = st.name;

      // Update current card view & catalog if visible
      updateFlashcardView();
      renderCatalog();
      updateTopStats();
      if (typeof loadCourseworkLesson === 'function' && appState.courseworkLessonIndex !== undefined) {
        loadCourseworkLesson(appState.courseworkLessonIndex, false);
      }
    }

    // Populate modal state picker & signup state picker
    const modalSelect = document.getElementById('modal-select-state');
    const signupSelect = document.getElementById('signup-state');
    if (modalSelect || signupSelect) {
      if (modalSelect) modalSelect.innerHTML = '';
      if (signupSelect) signupSelect.innerHTML = '';
      Object.keys(STATES_DATA).sort().forEach(code => {
        const st = STATES_DATA[code];
        if (modalSelect) {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = `${st.name} (${code})`;
          modalSelect.appendChild(opt);
        }
        if (signupSelect) {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = `${st.name} (${code})`;
          if (code === 'CA') opt.selected = true;
          signupSelect.appendChild(opt);
        }
      });

      if (modalSelect) {
        modalSelect.addEventListener('change', (e) => {
          const st = STATES_DATA[e.target.value];
          document.getElementById('prev-state-badge').textContent = e.target.value;
          document.getElementById('prev-state-gov').textContent = st.gov;
          document.getElementById('prev-state-sen').textContent = st.sens.join(', ');
          document.getElementById('prev-state-cap').textContent = st.capital;
        });
      }
    }

    function openStateModal() {
      const modal = document.getElementById('modal-state-picker');
      if (!modal) return;
      modal.classList.remove('hidden');
      const curState = appState.selectedState || 'CA';
      if (modalSelect) {
        modalSelect.value = curState;
        modalSelect.dispatchEvent(new Event('change'));
      }
    }

    document.getElementById('btn-quick-state')?.addEventListener('click', openStateModal);
    document.getElementById('btn-change-state-readiness')?.addEventListener('click', openStateModal);
    document.getElementById('btn-close-state-modal')?.addEventListener('click', () => {
      document.getElementById('modal-state-picker')?.classList.add('hidden');
    });
    document.getElementById('btn-cancel-state')?.addEventListener('click', () => {
      document.getElementById('modal-state-picker')?.classList.add('hidden');
    });
    document.getElementById('btn-apply-state')?.addEventListener('click', () => {
      const chosen = modalSelect ? modalSelect.value : 'CA';
      updateStateDisplay(chosen);
      if (currentUser) {
        currentUser.state = chosen;
        saveSession(currentUser);
        const users = getUsersStore();
        if (users[currentUser.email]) {
          users[currentUser.email].state = chosen;
          saveUsersStore(users);
        }
      }
      document.getElementById('modal-state-picker')?.classList.add('hidden');
      showToast(`📍 Home state set to ${STATES_DATA[chosen].name}! Answers for Governor, Senators, and Capital updated.`, 'success');
    });

    // PWA & STANDALONE INSTALLATION MODAL
    const modalInstall = document.getElementById('modal-install-pwa');
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btnPrompt = document.getElementById('btn-trigger-pwa-prompt');
      if (btnPrompt) btnPrompt.classList.remove('hidden');
    });

    function checkStandaloneStatus() {
      const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      const banner = document.getElementById('standalone-active-banner');
      const label = document.getElementById('label-install-btn');
      const btn = document.getElementById('btn-open-install');

      if (isStandalone) {
        if (banner) banner.classList.remove('hidden');
        if (label) label.textContent = '⚡ Web App Active';
        if (btn) btn.className = 'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-900/80 border border-emerald-500/50 text-xs font-semibold text-emerald-200 transition shadow-sm';
      }
    }

    function openInstallModal() {
      if (!modalInstall) return;
      modalInstall.classList.remove('hidden');
      checkStandaloneStatus();

      // Auto-detect user OS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 && !isIOS;

      if (isIOS) document.getElementById('tab-inst-ios')?.click();
      else if (isMac) document.getElementById('tab-inst-mac')?.click();
      else document.getElementById('tab-inst-chrome')?.click();
    }

    document.getElementById('btn-open-install')?.addEventListener('click', openInstallModal);
    document.getElementById('btn-close-install')?.addEventListener('click', () => modalInstall?.classList.add('hidden'));
    document.getElementById('btn-close-install-done')?.addEventListener('click', () => modalInstall?.classList.add('hidden'));

    // Install Tabs
    const instTabs = {
      'tab-inst-ios': 'inst-panel-ios',
      'tab-inst-mac': 'inst-panel-mac',
      'tab-inst-chrome': 'inst-panel-chrome'
    };

    Object.keys(instTabs).forEach(tabId => {
      const tabBtn = document.getElementById(tabId);
      if (tabBtn) {
        tabBtn.addEventListener('click', () => {
          Object.keys(instTabs).forEach(t => {
            document.getElementById(t).className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
            document.getElementById(instTabs[t]).classList.add('hidden');
          });
          tabBtn.className = 'flex-1 py-2 rounded-lg bg-blue-600 text-white transition';
          document.getElementById(instTabs[tabId]).classList.remove('hidden');
        });
      }
    });

    document.getElementById('btn-trigger-pwa-prompt')?.addEventListener('click', () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            showToast('Civics 128 installation accepted!', 'success');
          }
          deferredPrompt = null;
        });
      } else {
        showToast('To install, use the browser menu or Add to Home Screen in Safari.', 'info');
      }
    });

    // Check for Updates & Refresh Cache
    document.getElementById('btn-refresh-cache')?.addEventListener('click', () => {
      showToast('Clearing app caches and loading latest updates...', 'info');
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('CLEAR_CACHE');
      }
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      }
      setTimeout(() => {
        window.location.reload(true);
      }, 500);
    });

    // SIMULATOR & SUDDEN DEATH
    let simMode = 'uscis';
    let simQuestions = [];
    let simIndex = 0;
    let simCorrectCount = 0;
    let simIncorrectCount = 0;
    let simTranscript = [];
    let suddenDeathStreak = 0;

    function startUscisSimulation() {
      simMode = 'uscis';
      const shuffled = [...CIVICS_QUESTIONS];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      simQuestions = shuffled.slice(0, 20);
      simIndex = 0;
      simCorrectCount = 0;
      simIncorrectCount = 0;
      simTranscript = [];

      document.getElementById('sim-title-badge').textContent = 'Official USCIS Oral Interview Simulator';
      document.getElementById('sim-strike-header').textContent = 'Incorrect (9 FAILS Exam)';
      document.getElementById('sim-hub-card').classList.add('hidden');
      document.getElementById('sim-conclusion-card').classList.add('hidden');
      document.getElementById('sim-active-card').classList.remove('hidden');

      renderSimQuestion();
    }

    function startSuddenDeath() {
      simMode = 'sudden-death';
      const shuffled = [...CIVICS_QUESTIONS];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      simQuestions = shuffled;
      simIndex = 0;
      simCorrectCount = 0;
      simIncorrectCount = 0;
      suddenDeathStreak = 0;
      simTranscript = [];

      document.getElementById('sim-title-badge').textContent = '⚡ Sudden Death Speedrun (1 Strike Ends Run)';
      document.getElementById('sim-strike-header').textContent = 'Strikes (Max 1)';
      document.getElementById('sim-hub-card').classList.add('hidden');
      document.getElementById('sim-conclusion-card').classList.add('hidden');
      document.getElementById('sim-active-card').classList.remove('hidden');

      renderSimQuestion();
    }

    document.getElementById('btn-launch-uscis-sim')?.addEventListener('click', startUscisSimulation);
    document.getElementById('btn-launch-sudden-death')?.addEventListener('click', startSuddenDeath);

    function renderSimQuestion() {
      if (simMode === 'uscis') {
        if (simCorrectCount >= 12) {
          finishSimulation(true, 'Passed: 12 Correct Reached!');
          return;
        }
        if (simIncorrectCount >= 9) {
          finishSimulation(false, 'Failed: 9 Incorrect Reached');
          return;
        }
        if (simIndex >= 20) {
          finishSimulation(simCorrectCount >= 12, 'Simulation Complete');
          return;
        }
      } else if (simMode === 'sudden-death') {
        if (simIncorrectCount >= 1) {
          finishSimulation(false, 'Sudden Death Strike Out');
          return;
        }
      }

      const rawQ = simQuestions[simIndex];
      const q = getResolvedQuestion(rawQ, appState.selectedState);

      document.getElementById('sim-progress-badge').textContent = simMode === 'uscis' 
        ? `Question ${simIndex + 1} of 20` 
        : `Streak: ${suddenDeathStreak}`;

      document.getElementById('sim-score-correct').textContent = `${simCorrectCount} Correct`;
      document.getElementById('sim-score-strikes').textContent = `${simIncorrectCount} Incorrect`;

      const passesDots = document.getElementById('sim-correct-dots');
      if (passesDots) {
        passesDots.innerHTML = Array(12).fill(0).map((_, i) => `
          <div class="w-3.5 h-3.5 rounded-full ${i < simCorrectCount ? 'bg-emerald-500' : 'bg-slate-800 border border-slate-700'}"></div>
        `).join('');
      }

      const strikeLimit = simMode === 'uscis' ? 9 : 1;
      const strikeDots = document.getElementById('sim-strike-dots');
      if (strikeDots) {
        strikeDots.innerHTML = Array(strikeLimit).fill(0).map((_, i) => `
          <div class="w-3.5 h-3.5 rounded-full ${i < simIncorrectCount ? 'bg-rose-500' : 'bg-slate-800 border border-slate-700'}"></div>
        `).join('');
      }

      document.getElementById('sim-question-text').textContent = q.question;
      speakText(q.question);

      document.getElementById('sim-answers-box').classList.add('hidden');
      document.getElementById('sim-oral-grading-box').classList.add('hidden');
      document.getElementById('btn-sim-reveal').classList.remove('hidden');

      const ul = document.getElementById('sim-accepted-answers-list');
      if (ul) {
        ul.innerHTML = q.answers.map(a => `<li class="flex items-center gap-2"><span class="text-emerald-400 font-bold">•</span><span>${a}</span></li>`).join('');
      }
    }

    document.getElementById('btn-sim-reveal')?.addEventListener('click', () => {
      document.getElementById('sim-answers-box').classList.remove('hidden');
      document.getElementById('sim-oral-grading-box').classList.remove('hidden');
      document.getElementById('btn-sim-reveal').classList.add('hidden');
    });

    document.getElementById('btn-sim-grade-correct')?.addEventListener('click', () => {
      handleSimAnswer(true);
    });

    document.getElementById('btn-sim-grade-incorrect')?.addEventListener('click', () => {
      handleSimAnswer(false);
    });

    function handleSimAnswer(isCorrect) {
      const rawQ = simQuestions[simIndex];
      const q = getResolvedQuestion(rawQ, appState.selectedState);

      if (isCorrect) {
        simCorrectCount++;
        suddenDeathStreak++;
        playBeep('correct');
      } else {
        simIncorrectCount++;
        playBeep('wrong');
        appState.missedCounts[q.id] = (appState.missedCounts[q.id] || 0) + 1;
        saveState();
      }

      simTranscript.push({ q, isCorrect });
      simIndex++;
      renderSimQuestion();
    }

    document.getElementById('btn-abort-sim')?.addEventListener('click', () => {
      document.getElementById('sim-active-card').classList.add('hidden');
      document.getElementById('sim-hub-card').classList.remove('hidden');
    });

    function finishSimulation(passed, reason) {
      document.getElementById('sim-active-card').classList.add('hidden');
      document.getElementById('sim-conclusion-card').classList.remove('hidden');

      if (passed) {
        playBeep('pass');
        appState.simPasses = (appState.simPasses || 0) + 1;
      } else {
        playBeep('wrong');
      }
      appState.simAttempts = (appState.simAttempts || 0) + 1;
      saveState();
      updateTopStats();

      const stamp = document.getElementById('cert-stamp-badge');
      const title = document.getElementById('cert-title');
      const subtitle = document.getElementById('cert-subtitle');

      if (passed) {
        stamp.textContent = 'USCIS PASS';
        stamp.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-emerald-950 text-emerald-300 border-2 border-emerald-500 uppercase tracking-widest';
        title.textContent = 'Congratulations! You Passed.';
        subtitle.textContent = `You met the official USCIS passing threshold with ${simCorrectCount} correct answers.`;
      } else {
        stamp.textContent = 'DID NOT PASS';
        stamp.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-rose-950 text-rose-300 border-2 border-rose-500 uppercase tracking-widest';
        title.textContent = 'Test Completed';
        subtitle.textContent = `You accumulated ${simIncorrectCount} strikes. Keep drilling with flashcards and try again!`;
      }

      document.getElementById('cert-stat-correct').textContent = simCorrectCount;
      document.getElementById('cert-stat-incorrect').textContent = simIncorrectCount;
      document.getElementById('cert-stat-asked').textContent = simIndex;
      document.getElementById('cert-timestamp').textContent = new Date().toLocaleString();

      const transcriptList = document.getElementById('cert-transcript-list');
      if (transcriptList) {
        transcriptList.innerHTML = simTranscript.map(item => `
          <div class="p-2.5 rounded-xl bg-slate-950 border ${item.isCorrect ? 'border-emerald-500/30' : 'border-rose-500/30'} flex items-center justify-between text-xs">
            <span class="truncate text-slate-200">#${item.q.id}. ${item.q.question}</span>
            <span class="${item.isCorrect ? 'text-emerald-400' : 'text-rose-400'} font-bold ml-2 shrink-0">
              ${item.isCorrect ? '✓ Correct' : '✗ Missed'}
            </span>
          </div>
        `).join('');
      }
    }

    document.getElementById('btn-cert-restart')?.addEventListener('click', () => {
      document.getElementById('sim-conclusion-card').classList.add('hidden');
      document.getElementById('sim-hub-card').classList.remove('hidden');
    });

    document.getElementById('btn-cert-goto-study')?.addEventListener('click', () => {
      document.getElementById('sim-conclusion-card').classList.add('hidden');
      document.getElementById('sim-hub-card').classList.remove('hidden');
      switchTab('study');
    });

    // SETTINGS MODAL & AUDIO
    const modalSettings = document.getElementById('modal-settings');
    document.getElementById('btn-open-settings')?.addEventListener('click', () => modalSettings?.classList.remove('hidden'));
    document.getElementById('btn-close-settings')?.addEventListener('click', () => modalSettings?.classList.add('hidden'));
    document.getElementById('btn-save-settings')?.addEventListener('click', () => modalSettings?.classList.add('hidden'));

    function populateVoices() {
      if (!('speechSynthesis' in window)) return;
      const select = document.getElementById('setting-voice');
      if (!select) return;
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      select.innerHTML = '';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.name === appState.speechVoice) opt.selected = true;
        select.appendChild(opt);
      });
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
      populateVoices();
    }

    document.getElementById('setting-voice')?.addEventListener('change', (e) => {
      appState.speechVoice = e.target.value;
      saveState();
    });

    document.getElementById('setting-rate')?.addEventListener('input', (e) => {
      appState.speechRate = parseFloat(e.target.value);
      const disp = document.getElementById('rate-display');
      if (disp) disp.textContent = `${appState.speechRate.toFixed(1)}x`;
      saveState();
    });

    document.getElementById('setting-soundfx')?.addEventListener('change', (e) => {
      appState.soundFx = e.target.checked;
      saveState();
    });

    document.getElementById('btn-test-voice')?.addEventListener('click', () => {
      speakText('The United States of America is a constitutional republic.');
    });

    // ==================== AUTHENTICATION & SECURE USER VAULT ====================
    async function hashPassword(password, salt) {
      if (window.crypto && window.crypto.subtle) {
        try {
          const enc = new TextEncoder();
          const data = enc.encode(password + ':::' + salt);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
          console.warn('Subtle crypto error, fallback invoked', e);
        }
      }
      let hash = 0;
      const str = password + ':::' + salt;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return 'fb_' + Math.abs(hash).toString(16);
    }

    function getUsersStore() {
      try {
        const raw = localStorage.getItem('civics128_users');
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveUsersStore(users) {
      try {
        localStorage.setItem('civics128_users', JSON.stringify(users));
      } catch (e) {
        console.warn('Could not save users store', e);
      }
    }

    function loadSession() {
      try {
        const raw = localStorage.getItem('civics128_session');
        if (raw) {
          currentUser = JSON.parse(raw);
        } else {
          currentUser = null;
        }
      } catch (e) {
        currentUser = null;
      }
    }

    function saveSession(user) {
      currentUser = user;
      try {
        if (user) {
          localStorage.setItem('civics128_session', JSON.stringify(user));
        } else {
          localStorage.removeItem('civics128_session');
        }
      } catch (e) {}
    }

    function initFirebase() {
      if (typeof firebase !== 'undefined' && !firebaseApp) {
        try {
          firebaseApp = firebase.initializeApp(firebaseConfig);
          firebaseAuth = firebase.auth();
          firestoreDb = firebase.firestore();

          // Enable offline IndexedDB persistence for multi-device offline-first PWA
          firestoreDb.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code === 'failed-precondition') {
              console.warn('Firestore offline persistence: Multiple tabs open');
            } else if (err.code === 'unimplemented') {
              console.warn('Firestore offline persistence not supported in this browser');
            } else {
              console.warn('Firestore offline persistence note:', err);
            }
          });
        } catch (e) {
          console.warn('Firebase init notice:', e);
        }
      }
    }

    function attachFirestoreSync(userId) {
      if (!firestoreDb || !userId) return;
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
      }

      const userDocRef = firestoreDb.collection('users').doc(userId);
      firestoreUnsubscribe = userDocRef.onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data() || {};
          let shouldUpdateUI = false;

          if (data.name && currentUser && currentUser.name !== data.name) {
            currentUser.name = data.name;
            shouldUpdateUI = true;
          }
          if (data.state && currentUser && currentUser.state !== data.state) {
            currentUser.state = data.state;
            appState.selectedState = data.state;
            shouldUpdateUI = true;
          }

          if (data.mastered && typeof data.mastered === 'object') {
            appState.mastered = { ...appState.mastered, ...data.mastered };
            shouldUpdateUI = true;
          }
          if (data.starred && typeof data.starred === 'object') {
            appState.starred = { ...appState.starred, ...data.starred };
            shouldUpdateUI = true;
          }
          if (data.missedCounts && typeof data.missedCounts === 'object') {
            appState.missedCounts = { ...appState.missedCounts, ...data.missedCounts };
            shouldUpdateUI = true;
          }
          if (typeof data.simPasses === 'number') {
            appState.simPasses = Math.max(appState.simPasses || 0, data.simPasses);
            shouldUpdateUI = true;
          }
          if (typeof data.simAttempts === 'number') {
            appState.simAttempts = Math.max(appState.simAttempts || 0, data.simAttempts);
            shouldUpdateUI = true;
          }
          if (typeof data.courseworkLessonIndex === 'number' && data.courseworkLessonIndex > (appState.courseworkLessonIndex || 0)) {
            appState.courseworkLessonIndex = data.courseworkLessonIndex;
            shouldUpdateUI = true;
          }
          if (data.selectedState && data.selectedState !== appState.selectedState) {
            appState.selectedState = data.selectedState;
            shouldUpdateUI = true;
          }

          // Cache merged state locally
          try {
            const key = getStorageKey();
            localStorage.setItem(key, JSON.stringify(appState));
          } catch (e) {}

          if (shouldUpdateUI) {
            updateTopStats();
            updateFlashcardView();
            updateReadinessDashboard();
            updateAuthUI();
          }
          updateSyncStatus('synced');
        } else {
          // Document does not exist yet on cloud, upload initial local state
          syncStateToFirestore();
        }
      }, (err) => {
        console.warn('Firestore onSnapshot listener error:', err);
        updateSyncStatus('offline');
      });
    }

    function initAuth() {
      initFirebase();

      // First check local session for instant render without white flicker
      loadSession();
      if (currentUser) {
        loadState();
      }
      updateAuthUI();

      // Listen to Firebase Auth state
      if (firebaseAuth) {
        firebaseAuth.onAuthStateChanged(async (user) => {
          if (user) {
            const email = user.email || '';
            const displayName = user.displayName || (email ? email.split('@')[0] : 'User');

            currentUser = {
              id: user.uid,
              name: displayName,
              email: email,
              state: appState.selectedState || (currentUser ? currentUser.state : 'CA'),
              createdAt: user.metadata?.creationTime || new Date().toISOString()
            };

            saveSession(currentUser);
            loadState();
            updateAuthUI();
            updateTopStats();
            updateFlashcardView();
            updateReadinessDashboard();

            // Hook up Cloud Firestore real-time listener
            attachFirestoreSync(user.uid);
          } else {
            // User signed out in Firebase
            if (firestoreUnsubscribe) {
              firestoreUnsubscribe();
              firestoreUnsubscribe = null;
            }
            currentUser = null;
            saveSession(null);
            updateAuthUI();
            updateSyncStatus('offline');
          }
        });
      }
    }

    function updateAuthUI() {
      const authGate = document.getElementById('auth-gate');
      const appShell = document.getElementById('app-shell');
      const btnUserProfile = document.getElementById('btn-user-profile');
      const userAvatarBadge = document.getElementById('user-avatar-badge');
      const userDisplayName = document.getElementById('user-display-name');

      if (currentUser) {
        if (authGate) authGate.classList.add('hidden');
        if (appShell) {
          appShell.classList.remove('hidden');
          appShell.classList.add('flex');
        }
        if (btnUserProfile) {
          btnUserProfile.classList.remove('hidden');
          btnUserProfile.classList.add('flex');
        }

        const names = (currentUser.name || 'User').trim().split(/\s+/);
        const initials = names.length > 1
          ? (names[0][0] + names[names.length - 1][0]).toUpperCase()
          : names[0].slice(0, 2).toUpperCase();

        if (userAvatarBadge) userAvatarBadge.textContent = initials;
        if (userDisplayName) userDisplayName.textContent = names[0];

        const profAvatar = document.getElementById('profile-avatar-large');
        const profName = document.getElementById('profile-user-name');
        const profEmail = document.getElementById('profile-user-email');
        const profState = document.getElementById('profile-user-state');
        const profMemberSince = document.getElementById('profile-member-since');

        if (profAvatar) profAvatar.textContent = initials;
        if (profName) profName.textContent = currentUser.name;
        if (profEmail) profEmail.textContent = currentUser.email;
        if (profState) {
          const stObj = STATES_DATA[currentUser.state];
          profState.textContent = stObj ? `${stObj.name} (${currentUser.state})` : currentUser.state;
        }
        if (profMemberSince) {
          if (currentUser.createdAt) {
            const d = new Date(currentUser.createdAt);
            profMemberSince.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          } else {
            profMemberSince.textContent = 'Active Member';
          }
        }
      } else {
        // App is locked! Show auth gate
        if (appShell) {
          appShell.classList.add('hidden');
          appShell.classList.remove('flex');
        }
        if (authGate) {
          authGate.classList.remove('hidden');
        }
        if (btnUserProfile) {
          btnUserProfile.classList.add('hidden');
          btnUserProfile.classList.remove('flex');
        }
      }
    }

    function showAuthFeedback(msg, type = 'error', isHtml = false) {
      const fb = document.getElementById('auth-feedback');
      if (!fb) return;
      if (isHtml) {
        fb.innerHTML = msg;
      } else {
        fb.textContent = msg;
      }
      fb.className = 'p-3 rounded-xl text-xs font-medium transition-all ' + 
        (type === 'error' 
          ? 'bg-rose-950/80 border border-rose-500/50 text-rose-200' 
          : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200');
      fb.classList.remove('hidden');
    }

    function clearAuthFeedback() {
      const fb = document.getElementById('auth-feedback');
      if (fb) {
        fb.textContent = '';
        fb.classList.add('hidden');
      }
    }

    function setAuthTab(tab) {
      clearAuthFeedback();
      const tabLogin = document.getElementById('tab-auth-login');
      const tabSignup = document.getElementById('tab-auth-signup');
      const formLogin = document.getElementById('form-login');
      const formSignup = document.getElementById('form-signup');
      const title = document.getElementById('auth-modal-title');

      if (tab === 'signup') {
        tabSignup?.classList.add('bg-blue-600', 'text-white');
        tabSignup?.classList.remove('text-slate-400');
        tabLogin?.classList.remove('bg-blue-600', 'text-white');
        tabLogin?.classList.add('text-slate-400');
        formLogin?.classList.add('hidden');
        formSignup?.classList.remove('hidden');
        if (title) title.textContent = 'Create Free Account';
      } else {
        tabLogin?.classList.add('bg-blue-600', 'text-white');
        tabLogin?.classList.remove('text-slate-400');
        tabSignup?.classList.remove('bg-blue-600', 'text-white');
        tabSignup?.classList.add('text-slate-400');
        formSignup?.classList.add('hidden');
        formLogin?.classList.remove('hidden');
        if (title) title.textContent = 'Sign In to Continue';
      }
    }

    function openProfileModal() {
      if (!currentUser) return;
      const modal = document.getElementById('modal-profile');
      if (!modal) return;

      const mCount = Object.keys(appState.mastered).filter(k => appState.mastered[k]).length;
      const sCount = Object.keys(appState.starred).filter(k => appState.starred[k]).length;
      const readinessPct = Math.round((mCount / 128) * 100);

      const statM = document.getElementById('profile-stat-mastered');
      const statR = document.getElementById('profile-stat-readiness');
      const statS = document.getElementById('profile-stat-starred');
      const statP = document.getElementById('profile-stat-passes');

      if (statM) statM.textContent = `${mCount} / 128`;
      if (statR) statR.textContent = `${readinessPct}%`;
      if (statS) statS.textContent = `${sCount}`;
      if (statP) statP.textContent = `${appState.simPasses || 0}`;

      modal.classList.remove('hidden');
    }

    function closeProfileModal() {
      document.getElementById('modal-profile')?.classList.add('hidden');
    }

    async function handleLogin() {
      clearAuthFeedback();
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      const email = (emailInput?.value || '').trim();
      const password = passInput?.value || '';

      if (!email || !password) {
        showAuthFeedback('Please enter both email and password.', 'error');
        return;
      }

      const btn = document.getElementById('btn-submit-login');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Signing In...';
      }

      try {
        if (firebaseAuth) {
          try {
            const userCred = await firebaseAuth.signInWithEmailAndPassword(email, password);
            const user = userCred.user;
            showToast(`👋 Welcome back, ${user.displayName || user.email}! Cloud sync active.`, 'success');
            return;
          } catch (authError) {
            console.warn('Firebase signIn attempt note:', authError.code);

            // AUTO-MIGRATION CHECK:
            // Check if user previously created this account in local browser storage before Firebase was connected
            const localUsers = getUsersStore();
            const localUser = localUsers[email.toLowerCase()];

            if (localUser) {
              const hash = await hashPassword(password, localUser.salt);
              if (hash === localUser.passwordHash) {
                // Password matches local SHA-256 vault! Seamlessly register into Firebase Auth
                showToast('🚀 Migrating your existing account to Firebase Cloud...', 'info');
                try {
                  const newCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
                  const user = newCred.user;

                  if (user.updateProfile && localUser.name) {
                    await user.updateProfile({ displayName: localUser.name });
                  }

                  // Gather existing local study progress
                  const legacyStorageKey = 'civics128_state_' + localUser.id;
                  let existingState = {};
                  try {
                    const raw = localStorage.getItem(legacyStorageKey) || localStorage.getItem('civics128_state');
                    if (raw) existingState = JSON.parse(raw);
                  } catch (e) {}

                  // Merge into appState
                  Object.assign(appState, existingState);
                  appState.selectedState = localUser.state || appState.selectedState || 'CA';

                  if (firestoreDb) {
                    await firestoreDb.collection('users').doc(user.uid).set({
                      id: user.uid,
                      name: localUser.name || 'Civics Scholar',
                      email: email,
                      state: appState.selectedState,
                      selectedState: appState.selectedState,
                      mastered: appState.mastered || {},
                      starred: appState.starred || {},
                      missedCounts: appState.missedCounts || {},
                      simPasses: Number(appState.simPasses) || 0,
                      simAttempts: Number(appState.simAttempts) || 0,
                      courseworkLessonIndex: Number(appState.courseworkLessonIndex) || 0,
                      lastCardId: Number(appState.lastCardId) || 1,
                      currentCardIndex: Number(appState.currentCardIndex) || 0,
                      lastDeckFilter: String(appState.lastDeckFilter || 'all'),
                      speechRate: Number(appState.speechRate) || 1.0,
                      soundFx: appState.soundFx !== false,
                      createdAt: localUser.createdAt || new Date().toISOString(),
                      lastUpdated: new Date().toISOString()
                    });
                  }

                  saveSession({
                    id: user.uid,
                    name: localUser.name || 'Civics Scholar',
                    email: email,
                    state: appState.selectedState,
                    createdAt: localUser.createdAt || new Date().toISOString()
                  });

                  saveState();
                  updateStateDisplay(appState.selectedState);
                  updateAuthUI();
                  showToast(`🎉 Welcome back, ${localUser.name}! Your account is now synced across all devices.`, 'success');
                  return;
                } catch (migrateErr) {
                  console.error('Migration error:', migrateErr);
                  if (migrateErr.code !== 'auth/email-already-in-use') {
                    throw migrateErr;
                  }
                }
              } else {
                showAuthFeedback('Incorrect password for this account. Please try again.', 'error');
                return;
              }
            }

            // If not found in local store (e.g. on iOS or new device)
            if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password') {
              const htmlMsg = `
                <div class="space-y-2">
                  <div class="font-semibold text-rose-200">No cloud account found with this email, or password was incorrect.</div>
                  <div class="text-[11px] text-slate-300">If you created this account on another device before cloud sync, click below to activate it:</div>
                  <button type="button" id="btn-activate-account" class="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-md">
                    ✨ Activate / Create Cloud Account with this Password →
                  </button>
                </div>
              `;
              showAuthFeedback(htmlMsg, 'error', true);
              document.getElementById('btn-activate-account')?.addEventListener('click', () => {
                quickRegisterFromLogin(email, password);
              });
              return;
            }

            let msg = authError.message;
            if (authError.code === 'auth/too-many-requests') {
              msg = 'Access temporarily disabled due to many failed login attempts. Please try again in a few minutes.';
            } else if (authError.code === 'auth/network-request-failed') {
              msg = 'Network connection issue. Please check your internet connection.';
            }
            showAuthFeedback(msg, 'error');
            return;
          }
        } else {
          // Local fallback if offline
          const users = getUsersStore();
          const user = users[email.toLowerCase()];
          if (!user) {
            showAuthFeedback('No account found with this email. Please create a free account.', 'error');
            return;
          }
          const hash = await hashPassword(password, user.salt);
          if (hash !== user.passwordHash) {
            showAuthFeedback('Incorrect password. Please try again.', 'error');
            return;
          }
          saveSession({
            id: user.id,
            name: user.name,
            email: user.email,
            state: user.state,
            createdAt: user.createdAt
          });
          loadState();
          updateAuthUI();
          showToast(`👋 Welcome back, ${user.name}! Access granted.`, 'success');
        }
      } catch (error) {
        console.error('Login error:', error);
        showAuthFeedback(error.message || 'Login failed. Please try again.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign In & Unlock App →';
        }
      }
    }

    async function quickRegisterFromLogin(email, password) {
      clearAuthFeedback();
      const btn = document.getElementById('btn-submit-login');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Activating Account...';
      }
      try {
        if (password.length < 6) {
          showAuthFeedback('Password must be at least 6 characters long.', 'error');
          return;
        }

        const defaultName = (email.split('@')[0] || 'Civics Scholar')
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());

        const stateCode = appState.selectedState || 'CA';

        if (firebaseAuth) {
          const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
          const user = userCredential.user;

          if (user.updateProfile) {
            await user.updateProfile({ displayName: defaultName });
          }

          currentUser = {
            id: user.uid,
            name: defaultName,
            email: email,
            state: stateCode,
            createdAt: new Date().toISOString()
          };
          saveSession(currentUser);
          appState.selectedState = stateCode;
          saveState();

          if (firestoreDb) {
            await firestoreDb.collection('users').doc(user.uid).set({
              id: user.uid,
              name: defaultName,
              email: email,
              state: stateCode,
              selectedState: stateCode,
              mastered: appState.mastered || {},
              starred: appState.starred || {},
              missedCounts: appState.missedCounts || {},
              simPasses: Number(appState.simPasses) || 0,
              simAttempts: Number(appState.simAttempts) || 0,
              courseworkLessonIndex: Number(appState.courseworkLessonIndex) || 0,
              lastCardId: Number(appState.lastCardId) || 1,
              currentCardIndex: Number(appState.currentCardIndex) || 0,
              lastDeckFilter: String(appState.lastDeckFilter || 'all'),
              speechRate: Number(appState.speechRate) || 1.0,
              soundFx: appState.soundFx !== false,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            });
          }

          updateStateDisplay(stateCode);
          updateAuthUI();
          showToast(`🎉 Cloud account activated for ${email}! Cross-device sync is now live.`, 'success');
        }
      } catch (err) {
        console.error('Quick registration error:', err);
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') {
          msg = 'An account with this email already exists in Firebase. Please check password.';
        } else if (err.code === 'auth/weak-password') {
          msg = 'Password must be at least 6 characters.';
        }
        showAuthFeedback(msg, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign In & Unlock App →';
        }
      }
    }

    async function handleSignup() {
      clearAuthFeedback();
      const name = (document.getElementById('signup-name')?.value || '').trim();
      const email = (document.getElementById('signup-email')?.value || '').trim();
      const stateCode = document.getElementById('signup-state')?.value || 'CA';
      const pass = document.getElementById('signup-password')?.value || '';
      const confirmPass = document.getElementById('signup-confirm-password')?.value || '';

      if (!name) {
        showAuthFeedback('Please enter your full name.', 'error');
        return;
      }
      if (!email || !email.includes('@') || !email.includes('.')) {
        showAuthFeedback('Please enter a valid email address.', 'error');
        return;
      }
      if (pass.length < 6) {
        showAuthFeedback('Password must be at least 6 characters long.', 'error');
        return;
      }
      if (pass !== confirmPass) {
        showAuthFeedback('Passwords do not match. Please re-enter.', 'error');
        return;
      }

      const btn = document.getElementById('btn-submit-signup');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creating Free Account...';
      }

      try {
        if (firebaseAuth) {
          const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, pass);
          const user = userCredential.user;
          
          if (user.updateProfile) {
            await user.updateProfile({ displayName: name });
          }

          currentUser = {
            id: user.uid,
            name: name,
            email: email,
            state: stateCode,
            createdAt: new Date().toISOString()
          };
          saveSession(currentUser);
          appState.selectedState = stateCode;
          saveState();

          if (firestoreDb) {
            await firestoreDb.collection('users').doc(user.uid).set({
              id: user.uid,
              name: name,
              email: email,
              state: stateCode,
              selectedState: stateCode,
              mastered: appState.mastered || {},
              starred: appState.starred || {},
              missedCounts: appState.missedCounts || {},
              simPasses: Number(appState.simPasses) || 0,
              simAttempts: Number(appState.simAttempts) || 0,
              courseworkLessonIndex: Number(appState.courseworkLessonIndex) || 0,
              lastCardId: Number(appState.lastCardId) || 1,
              currentCardIndex: Number(appState.currentCardIndex) || 0,
              lastDeckFilter: String(appState.lastDeckFilter || 'all'),
              speechRate: Number(appState.speechRate) || 1.0,
              soundFx: appState.soundFx !== false,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            });
          }

          updateStateDisplay(stateCode);
          updateAuthUI();
          showToast(`🎉 Welcome to Civics 128, ${name}! Your free account is created and cloud synced.`, 'success');
        } else {
          // Local fallback
          const users = getUsersStore();
          if (users[email.toLowerCase()]) {
            showAuthFeedback('An account with this email already exists. Please sign in instead.', 'error');
            return;
          }
          const salt = Math.random().toString(36).substring(2, 10);
          const hash = await hashPassword(pass, salt);
          const uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

          const newUser = {
            id: uid,
            name: name,
            email: email.toLowerCase(),
            passwordHash: hash,
            salt: salt,
            state: stateCode,
            createdAt: new Date().toISOString()
          };
          users[email.toLowerCase()] = newUser;
          saveUsersStore(users);
          saveSession({
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            state: newUser.state,
            createdAt: newUser.createdAt
          });
          appState.selectedState = stateCode;
          saveState();
          updateStateDisplay(stateCode);
          updateAuthUI();
          showToast(`🎉 Welcome to Civics 128, ${name}! Your free account is created and access is granted.`, 'success');
        }
      } catch (error) {
        console.error('Signup error:', error);
        let msg = error.message;
        if (error.code === 'auth/email-already-in-use') {
          msg = 'An account with this email already exists. Please sign in instead.';
        } else if (error.code === 'auth/weak-password') {
          msg = 'Password is too weak. Please use at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
          msg = 'The email address is not valid.';
        }
        showAuthFeedback(msg, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Create Free Account & Enter →';
        }
      }
    }

    async function handleGoogleAuth() {
      clearAuthFeedback();
      if (!firebaseAuth) {
        showAuthFeedback('Google Authentication is initializing. Please try again in a moment.', 'error');
        return;
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const result = await firebaseAuth.signInWithPopup(provider);
        const user = result.user;
        if (user) {
          const stateCode = appState.selectedState || 'CA';
          const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Civics Scholar');

          if (firestoreDb) {
            const docRef = firestoreDb.collection('users').doc(user.uid);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
              await docRef.set({
                id: user.uid,
                name: name,
                email: user.email || '',
                state: stateCode,
                selectedState: stateCode,
                mastered: appState.mastered || {},
                starred: appState.starred || {},
                missedCounts: appState.missedCounts || {},
                simPasses: Number(appState.simPasses) || 0,
                simAttempts: Number(appState.simAttempts) || 0,
                courseworkLessonIndex: Number(appState.courseworkLessonIndex) || 0,
                lastCardId: Number(appState.lastCardId) || 1,
                currentCardIndex: Number(appState.currentCardIndex) || 0,
                lastDeckFilter: String(appState.lastDeckFilter || 'all'),
                speechRate: Number(appState.speechRate) || 1.0,
                soundFx: appState.soundFx !== false,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
              });
            }
          }
          showToast(`👋 Signed in as ${name}! Cloud sync active.`, 'success');
        }
      } catch (error) {
        console.error('Google Auth error:', error);
        if (error.code === 'auth/popup-blocked') {
          showAuthFeedback('Sign-in popup was blocked by your browser. Please allow popups for civics-128-app.pages.dev.', 'error');
        } else if (error.code === 'auth/popup-closed-by-user') {
          // Closed by user, no error banner needed
        } else {
          showAuthFeedback(error.message || 'Could not sign in with Google.', 'error');
        }
      }
    }

    async function handleLogout() {
      if (firebaseAuth) {
        try {
          await firebaseAuth.signOut();
        } catch (e) {
          console.warn('Sign out warning:', e);
        }
      }
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
      }
      saveSession(null);
      currentUser = null;
      updateAuthUI();
      closeProfileModal();
      showToast('You have been logged out. Cloud sync paused.', 'info');
    }

    // Auth Event Listeners
    document.getElementById('btn-user-profile')?.addEventListener('click', openProfileModal);
    document.getElementById('tab-auth-login')?.addEventListener('click', () => setAuthTab('login'));
    document.getElementById('tab-auth-signup')?.addEventListener('click', () => setAuthTab('signup'));
    document.getElementById('link-goto-signup')?.addEventListener('click', () => setAuthTab('signup'));
    document.getElementById('link-goto-login')?.addEventListener('click', () => setAuthTab('login'));

    document.getElementById('btn-toggle-login-pass')?.addEventListener('click', () => {
      const el = document.getElementById('login-password');
      if (el) el.type = el.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('btn-toggle-signup-pass')?.addEventListener('click', () => {
      const el = document.getElementById('signup-password');
      if (el) el.type = el.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('btn-submit-login')?.addEventListener('click', handleLogin);
    document.getElementById('form-login')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });

    document.getElementById('btn-submit-signup')?.addEventListener('click', handleSignup);
    document.getElementById('form-signup')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSignup();
    });

    document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleAuth);
    document.getElementById('btn-google-signup')?.addEventListener('click', handleGoogleAuth);

    document.getElementById('btn-close-profile')?.addEventListener('click', closeProfileModal);
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('profile-btn-change-state')?.addEventListener('click', () => {
      closeProfileModal();
      openStateModal();
    });
    document.getElementById('profile-btn-export')?.addEventListener('click', () => {
      closeProfileModal();
      document.getElementById('btn-export-data')?.click();
    });

    // DATA BACKUP & RESET
    document.getElementById('btn-export-data')?.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `civics128_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Study progress exported successfully!', 'success');
    });

    const modalConfirm = document.getElementById('modal-confirm');
    document.getElementById('btn-reset-data')?.addEventListener('click', () => modalConfirm?.classList.remove('hidden'));
    document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => modalConfirm?.classList.add('hidden'));
    document.getElementById('btn-confirm-ok')?.addEventListener('click', () => {
      const key = getStorageKey();
      localStorage.removeItem(key);
      localStorage.removeItem('civics128_state');
      appState.mastered = {};
      appState.starred = {};
      appState.missedCounts = {};
      appState.simPasses = 0;
      appState.simAttempts = 0;
      appState.currentCardIndex = 0;
      modalConfirm.classList.add('hidden');
      updateTopStats();
      updateFlashcardView();
      showToast('All progress has been reset.', 'warn');
    });

    // Service Worker Registration for Offline iOS / macOS PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('Civics 128 ServiceWorker registered with scope:', reg.scope);
          })
          .catch(err => {
            console.warn('ServiceWorker registration error:', err);
          });
      });
    }

    // =========================================================================
    // 5. ANIMATED COURSEWORK & CINEMA CLASSROOM ENGINE
    // =========================================================================

    const COURSEWORK_UNITS = [
      {
        id: 1,
        title: "Principles of American Democracy & The Constitution",
        range: [1, 12],
        description: "Form of government, supreme law, Bill of Rights, amendments, and economic system.",
        icon: "🏛️"
      },
      {
        id: 2,
        title: "System of Government – Congress & Lawmaking",
        range: [13, 35],
        description: "Three branches, Legislative Branch, Senate, House of Representatives, and federal powers.",
        icon: "⚖️"
      },
      {
        id: 3,
        title: "Executive Branch – The Presidency & Cabinet",
        range: [36, 54],
        description: "The President, Vice President, Cabinet, Commander in Chief, and succession.",
        icon: "🦅"
      },
      {
        id: 4,
        title: "Judicial Branch – Supreme Court & Federal Courts",
        range: [55, 60],
        description: "Judicial review, Supreme Court justices, Chief Justice, and federal judges.",
        icon: "⚖️"
      },
      {
        id: 5,
        title: "State Government & California Leadership",
        range: [61, 67],
        description: "State vs Federal powers, Governors, California leaders, and State Capitals.",
        icon: "📍"
      },
      {
        id: 6,
        title: "Rights, Freedoms & Civic Responsibilities",
        range: [68, 72],
        description: "Voting amendments, civic duties, promises of citizenship, and naturalization rights.",
        icon: "🗳️"
      },
      {
        id: 7,
        title: "American History – Colonies, Revolution & 1800s",
        range: [73, 98],
        description: "Indigenous peoples, 13 colonies, Independence (1776), Constitution (1787), Civil War, and Lincoln.",
        icon: "📜"
      },
      {
        id: 8,
        title: "Modern History, Wars & National Symbols",
        range: [99, 128],
        description: "WWI, WWII, Civil Rights, MLK, 9/11, Flag, Anthem, Statue of Liberty, and Holidays.",
        icon: "🗽"
      }
    ];

    function getUnitForQuestionId(qid) {
      return COURSEWORK_UNITS.find(u => qid >= u.range[0] && qid <= u.range[1]) || COURSEWORK_UNITS[0];
    }

    function getQuestionArtifact(q) {
      const qid = q.id;
      const st = STATES_DATA[appState.selectedState || 'CA'] || STATES_DATA['CA'];

      if (q.isStateSpecific || [61, 62, 63, 67].includes(qid)) {
        return {
          caption: `${st.name} Leadership • Capital: ${st.capital}`,
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="caGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#047857" />
              </linearGradient>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24" />
                <stop offset="100%" stop-color="#d97706" />
              </linearGradient>
            </defs>
            <path d="M70,15 L95,15 L125,75 L115,125 L90,120 L75,90 L60,50 Z" fill="url(#caGrad)" stroke="#34d399" stroke-width="2" />
            <polygon points="88,48 91,54 97,54 92,58 94,64 88,60 82,64 84,58 79,54 85,54" fill="url(#goldGrad)" stroke="#fff" stroke-width="1" />
            <text x="96" y="52" fill="#fde047" font-size="9" font-weight="bold">${st.capital} ★</text>
            <rect x="140" y="16" width="132" height="108" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
            <text x="148" y="34" fill="#38bdf8" font-size="11" font-weight="bold">${st.name.toUpperCase()} (${appState.selectedState || 'CA'})</text>
            <text x="148" y="50" fill="#94a3b8" font-size="8.5">Governor:</text>
            <text x="148" y="63" fill="#86efac" font-size="10" font-weight="bold">${st.gov}</text>
            <text x="148" y="78" fill="#94a3b8" font-size="8.5">U.S. Senators:</text>
            <text x="148" y="91" fill="#fde047" font-size="9.5" font-weight="bold">${st.sens[0]}</text>
            <text x="148" y="104" fill="#fde047" font-size="9.5" font-weight="bold">${st.sens[1] || 'U.S. Senate'}</text>
          </svg>`
        };
      }

      if ([1, 2, 3, 4, 10, 11, 12, 79, 80, 81, 82, 83].includes(qid)) {
        return {
          caption: "The U.S. Constitution (1787) • Supreme Law of the Land",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="scrollGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef3c7" />
                <stop offset="100%" stop-color="#fde68a" />
              </linearGradient>
            </defs>
            <rect x="40" y="15" width="200" height="110" rx="8" fill="url(#scrollGrad)" stroke="#d97706" stroke-width="2" />
            <path d="M35,15 C45,10 45,25 35,20 L35,120 C45,115 45,130 35,125 Z" fill="#b45309" />
            <path d="M245,15 C235,10 235,25 245,20 L245,120 C235,115 235,130 245,125 Z" fill="#b45309" />
            <text x="140" y="45" fill="#78350f" font-size="18" font-weight="bold" font-family="Georgia, serif" text-anchor="middle" font-style="italic">We the People</text>
            <line x1="60" y1="60" x2="220" y2="60" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 2" />
            <line x1="60" y1="72" x2="220" y2="72" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 2" />
            <line x1="60" y1="84" x2="220" y2="84" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 2" />
            <line x1="60" y1="96" x2="170" y2="96" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 2" />
            <circle cx="205" cy="100" r="14" fill="#dc2626" stroke="#991b1b" stroke-width="1.5" />
            <polygon points="205,92 208,98 214,98 209,102 211,108 205,104 199,108 201,102 196,98 202,98" fill="#fbbf24" />
            <path d="M225,20 Q245,45 220,105 L218,107" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" />
          </svg>`
        };
      }

      if ([8, 9, 77, 78].includes(qid)) {
        return {
          caption: "Declaration of Independence (July 4, 1776)",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="45" y="12" width="190" height="116" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="2" />
            <text x="140" y="32" fill="#78350f" font-size="11" font-weight="bold" font-family="Georgia, serif" text-anchor="middle">IN CONGRESS, JULY 4, 1776</text>
            <text x="140" y="48" fill="#92400e" font-size="13" font-weight="bold" font-family="Georgia, serif" text-anchor="middle">The unanimous Declaration</text>
            <line x1="60" y1="62" x2="220" y2="62" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <line x1="60" y1="74" x2="220" y2="74" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <line x1="60" y1="86" x2="220" y2="86" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <text x="140" y="112" fill="#1e3a8a" font-size="15" font-family="'Brush Script MT', cursive, serif" font-weight="bold" text-anchor="middle">John Hancock</text>
          </svg>`
        };
      }

      if ([5, 6, 7, 71, 72, 84, 85].includes(qid)) {
        return {
          caption: "The Bill of Rights • First 10 Amendments (1791)",
          svg: `<svg class="w-full h-full" viewBox="0 0 320 148" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Left Tablet: Amendments I – V -->
            <rect x="6" y="4" width="150" height="140" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="2" />
            <path d="M6,12 C6,7.5 9.5,4 14,4 L148,4 C152.5,4 156,7.5 156,12 L156,26 L6,26 Z" fill="#78350f" />
            <text x="81" y="19" fill="#fef3c7" font-size="10.5" font-weight="bold" font-family="Georgia, serif" text-anchor="middle">AMENDMENTS I – V</text>
            
            <g font-family="-apple-system, BlinkMacSystemFont, sans-serif">
              <text x="14" y="44" fill="#b45309" font-weight="bold" font-size="9.5">I.</text>
              <text x="28" y="44" fill="#1c1917" font-size="9" font-weight="600">Speech, Press, Religion</text>
              
              <text x="14" y="66" fill="#b45309" font-weight="bold" font-size="9.5">II.</text>
              <text x="28" y="66" fill="#1c1917" font-size="9" font-weight="600">Right to Bear Arms</text>
              
              <text x="14" y="88" fill="#b45309" font-weight="bold" font-size="9.5">III.</text>
              <text x="28" y="88" fill="#1c1917" font-size="9" font-weight="600">No Quartering Troops</text>
              
              <text x="14" y="110" fill="#b45309" font-weight="bold" font-size="9.5">IV.</text>
              <text x="28" y="110" fill="#1c1917" font-size="9" font-weight="600">Search &amp; Seizure</text>
              
              <text x="14" y="132" fill="#b45309" font-weight="bold" font-size="9.5">V.</text>
              <text x="28" y="132" fill="#1c1917" font-size="9" font-weight="600">Due Process &amp; Rights</text>
            </g>

            <!-- Right Tablet: Amendments VI – X -->
            <rect x="164" y="4" width="150" height="140" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="2" />
            <path d="M164,12 C164,7.5 167.5,4 172,4 L306,4 C310.5,4 314,7.5 314,12 L314,26 L164,26 Z" fill="#78350f" />
            <text x="239" y="19" fill="#fef3c7" font-size="10.5" font-weight="bold" font-family="Georgia, serif" text-anchor="middle">AMENDMENTS VI – X</text>
            
            <g font-family="-apple-system, BlinkMacSystemFont, sans-serif">
              <text x="172" y="44" fill="#b45309" font-weight="bold" font-size="9.5">VI.</text>
              <text x="194" y="44" fill="#1c1917" font-size="9" font-weight="600">Speedy Public Trial</text>
              
              <text x="172" y="66" fill="#b45309" font-weight="bold" font-size="9.5">VII.</text>
              <text x="194" y="66" fill="#1c1917" font-size="9" font-weight="600">Trial by Jury</text>
              
              <text x="172" y="88" fill="#b45309" font-weight="bold" font-size="9.5">VIII.</text>
              <text x="194" y="88" fill="#1c1917" font-size="9" font-weight="600">No Cruel Punishment</text>
              
              <text x="172" y="110" fill="#b45309" font-weight="bold" font-size="9.5">IX.</text>
              <text x="194" y="110" fill="#1c1917" font-size="9" font-weight="600">Rights of the People</text>
              
              <text x="172" y="132" fill="#b45309" font-weight="bold" font-size="9.5">X.</text>
              <text x="194" y="132" fill="#1c1917" font-size="9" font-weight="600">Powers to the States</text>
            </g>
          </svg>`
        };
      }

      if ([13, 14, 15].includes(qid)) {
        return {
          caption: "3 Branches of Government • Checks & Balances",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(25, 20)">
              <polygon points="35,0 70,20 0,20" fill="#3b82f6" />
              <rect x="5" y="20" width="10" height="50" fill="#93c5fd" />
              <rect x="25" y="20" width="10" height="50" fill="#93c5fd" />
              <rect x="40" y="20" width="10" height="50" fill="#93c5fd" />
              <rect x="55" y="20" width="10" height="50" fill="#93c5fd" />
              <rect x="0" y="70" width="70" height="10" fill="#1d4ed8" />
              <text x="35" y="93" fill="#60a5fa" font-size="8.5" font-weight="bold" text-anchor="middle">LEGISLATIVE</text>
              <text x="35" y="103" fill="#94a3b8" font-size="7.5" text-anchor="middle">Congress</text>
            </g>
            <g transform="translate(105, 20)">
              <polygon points="35,0 70,20 0,20" fill="#10b981" />
              <rect x="5" y="20" width="10" height="50" fill="#6ee7b7" />
              <rect x="25" y="20" width="10" height="50" fill="#6ee7b7" />
              <rect x="40" y="20" width="10" height="50" fill="#6ee7b7" />
              <rect x="55" y="20" width="10" height="50" fill="#6ee7b7" />
              <rect x="0" y="70" width="70" height="10" fill="#047857" />
              <text x="35" y="93" fill="#34d399" font-size="8.5" font-weight="bold" text-anchor="middle">EXECUTIVE</text>
              <text x="35" y="103" fill="#94a3b8" font-size="7.5" text-anchor="middle">President</text>
            </g>
            <g transform="translate(185, 20)">
              <polygon points="35,0 70,20 0,20" fill="#f59e0b" />
              <rect x="5" y="20" width="10" height="50" fill="#fde68a" />
              <rect x="25" y="20" width="10" height="50" fill="#fde68a" />
              <rect x="40" y="20" width="10" height="50" fill="#fde68a" />
              <rect x="55" y="20" width="10" height="50" fill="#fde68a" />
              <rect x="0" y="70" width="70" height="10" fill="#b45309" />
              <text x="35" y="93" fill="#fbbf24" font-size="8.5" font-weight="bold" text-anchor="middle">JUDICIAL</text>
              <text x="35" y="103" fill="#94a3b8" font-size="7.5" text-anchor="middle">Supreme Court</text>
            </g>
            <path d="M85,35 Q140,15 195,35" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="3 3" fill="none" />
            <text x="140" y="132" fill="#e2e8f0" font-size="9" font-weight="bold" text-anchor="middle">⚖️ Checks &amp; Balances</text>
          </svg>`
        };
      }

      if (qid >= 16 && qid <= 35) {
        return {
          caption: "The U.S. Capitol • Legislative Branch (Congress)",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="75" width="240" height="45" fill="#334155" rx="3" />
            <rect x="105" y="45" width="70" height="30" fill="#475569" />
            <rect x="110" y="50" width="6" height="25" fill="#e2e8f0" />
            <rect x="122" y="50" width="6" height="25" fill="#e2e8f0" />
            <rect x="134" y="50" width="6" height="25" fill="#e2e8f0" />
            <rect x="146" y="50" width="6" height="25" fill="#e2e8f0" />
            <rect x="158" y="50" width="6" height="25" fill="#e2e8f0" />
            <path d="M110,45 C110,18 170,18 170,45 Z" fill="#e2e8f0" />
            <rect x="136" y="10" width="8" height="10" fill="#cbd5e1" />
            <circle cx="140" cy="8" r="3" fill="#fbbf24" />
            <rect x="35" y="80" width="55" height="25" fill="#1e293b" />
            <text x="62" y="96" fill="#93c5fd" font-size="8" font-weight="bold" text-anchor="middle">HOUSE</text>
            <rect x="190" y="80" width="55" height="25" fill="#1e293b" />
            <text x="217" y="96" fill="#93c5fd" font-size="8" font-weight="bold" text-anchor="middle">SENATE</text>
            <text x="140" y="132" fill="#94a3b8" font-size="9" font-weight="bold" text-anchor="middle">U.S. Capitol Building • Washington, D.C.</text>
          </svg>`
        };
      }

      if (qid >= 36 && qid <= 54) {
        return {
          caption: "The White House • Executive Branch (The Presidency)",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="40" y="45" width="200" height="60" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
            <rect x="38" y="40" width="204" height="6" fill="#e2e8f0" />
            <path d="M100,50 C100,20 180,20 180,50 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
            <polygon points="140,16 182,32 98,32" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />
            <rect x="108" y="50" width="6" height="55" fill="#cbd5e1" />
            <rect x="124" y="50" width="6" height="55" fill="#cbd5e1" />
            <rect x="150" y="50" width="6" height="55" fill="#cbd5e1" />
            <rect x="166" y="50" width="6" height="55" fill="#cbd5e1" />
            <path d="M0,120 Q140,105 280,120 L280,140 L0,140 Z" fill="#065f46" />
            <line x1="140" y1="16" x2="140" y2="4" stroke="#64748b" stroke-width="1.5" />
            <rect x="140" y="4" width="12" height="7" fill="#ef4444" />
            <text x="140" y="134" fill="#94a3b8" font-size="9" font-weight="bold" text-anchor="middle">The White House • 1600 Pennsylvania Ave</text>
          </svg>`
        };
      }

      if (qid >= 55 && qid <= 60) {
        return {
          caption: "Supreme Court of the U.S. • Highest Federal Court",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="140,15 250,45 30,45" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
            <text x="140" y="38" fill="#475569" font-size="8.5" font-weight="bold" font-family="Georgia, serif" text-anchor="middle">EQUAL JUSTICE UNDER LAW</text>
            <rect x="30" y="45" width="220" height="8" fill="#e2e8f0" />
            <rect x="45" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="75" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="105" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="135" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="165" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="195" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="225" y="53" width="10" height="55" fill="#f1f5f9" stroke="#cbd5e1" />
            <rect x="20" y="108" width="240" height="10" fill="#cbd5e1" />
            <rect x="10" y="118" width="260" height="8" fill="#94a3b8" />
            <text x="140" y="134" fill="#fbbf24" font-size="9" font-weight="bold" text-anchor="middle">⚖️ 9 Justices • Chief Justice of the United States</text>
          </svg>`
        };
      }

      if ([68, 69, 70, 107, 108].includes(qid)) {
        return {
          caption: "Civic Rights & Voting • Democratic Participation",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="80" y="50" width="120" height="75" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
            <rect x="110" y="45" width="60" height="8" rx="4" fill="#0f172a" stroke="#60a5fa" stroke-width="1.5" />
            <rect x="120" y="15" width="40" height="36" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
            <line x1="126" y1="23" x2="154" y2="23" stroke="#2563eb" stroke-width="2" />
            <line x1="126" y1="31" x2="148" y2="31" stroke="#94a3b8" stroke-width="1.5" />
            <circle cx="150" cy="31" r="3" fill="#10b981" />
            <polygon points="140,75 144,83 152,83 146,88 148,96 140,91 132,96 134,88 128,83 136,83" fill="#fde047" />
            <text x="140" y="112" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle" letter-spacing="2">OFFICIAL VOTE</text>
          </svg>`
        };
      }

      if ((qid >= 73 && qid <= 76) || qid === 86) {
        return {
          caption: "13 Original Colonies (1776) • Atlantic Coast",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="260" height="120" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
            <path d="M50,20 Q90,40 100,70 T130,120" stroke="#f59e0b" stroke-width="3" fill="none" />
            <circle cx="75" cy="30" r="4" fill="#60a5fa" /><text x="82" y="33" fill="#93c5fd" font-size="8">MA</text>
            <circle cx="85" cy="45" r="4" fill="#60a5fa" /><text x="92" y="48" fill="#93c5fd" font-size="8">NY</text>
            <circle cx="95" cy="60" r="4" fill="#60a5fa" /><text x="102" y="63" fill="#93c5fd" font-size="8">PA</text>
            <circle cx="105" cy="75" r="4" fill="#60a5fa" /><text x="112" y="78" fill="#93c5fd" font-size="8">VA</text>
            <circle cx="115" cy="95" r="4" fill="#60a5fa" /><text x="122" y="98" fill="#93c5fd" font-size="8">NC</text>
            <circle cx="125" cy="115" r="4" fill="#60a5fa" /><text x="132" y="118" fill="#93c5fd" font-size="8">GA</text>
            <g transform="translate(180, 50)">
              <path d="M0,30 L50,30 L40,42 L10,42 Z" fill="#78350f" />
              <line x1="25" y1="30" x2="25" y2="8" stroke="#451a03" stroke-width="2" />
              <path d="M25,10 Q40,16 25,24 Z" fill="#ffffff" />
              <text x="25" y="55" fill="#fde047" font-size="8" font-weight="bold" text-anchor="middle">Mayflower (1620)</text>
            </g>
          </svg>`
        };
      }

      if (qid >= 87 && qid <= 98) {
        return {
          caption: "Civil War Era & Lincoln (1861–1865) • Emancipation",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(45, 20)">
              <ellipse cx="40" cy="85" rx="36" ry="7" fill="#0f172a" />
              <rect x="18" y="25" width="44" height="60" fill="#0f172a" />
              <rect x="18" y="77" width="44" height="8" fill="#1e3a8a" />
              <text x="40" y="105" fill="#cbd5e1" font-size="9" font-weight="bold" text-anchor="middle">A. Lincoln</text>
            </g>
            <rect x="135" y="18" width="115" height="104" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="1.8" />
            <text x="192" y="36" fill="#78350f" font-size="9" font-weight="bold" text-anchor="middle">EMANCIPATION</text>
            <text x="192" y="48" fill="#78350f" font-size="8.5" font-weight="bold" text-anchor="middle">PROCLAMATION (1863)</text>
            <line x1="145" y1="60" x2="240" y2="60" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <line x1="145" y1="72" x2="240" y2="72" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <line x1="145" y1="84" x2="240" y2="84" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2" />
            <text x="192" y="105" fill="#dc2626" font-size="9" font-weight="bold" text-anchor="middle">"Forever Free"</text>
          </svg>`
        };
      }

      if (qid >= 99 && qid <= 118) {
        return {
          caption: "20th-Century History & The Civil Rights Movement",
          svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(45, 15)">
              <rect x="25" y="45" width="35" height="65" rx="4" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
              <circle cx="42" cy="38" r="5" fill="#94a3b8" />
              <line x1="42" y1="43" x2="42" y2="48" stroke="#64748b" stroke-width="2" />
              <text x="42" y="75" fill="#fbbf24" font-size="8" font-weight="bold" text-anchor="middle">"I Have a</text>
              <text x="42" y="87" fill="#fbbf24" font-size="8" font-weight="bold" text-anchor="middle">Dream"</text>
              <text x="42" y="100" fill="#e2e8f0" font-size="7" text-anchor="middle">MLK (1963)</text>
            </g>
            <g transform="translate(145, 20)">
              <circle cx="50" cy="45" r="35" fill="#0f172a" stroke="#3b82f6" stroke-width="2" />
              <polygon points="50,22 56,36 71,36 59,46 63,60 50,51 37,60 41,46 29,36 44,36" fill="#fbbf24" stroke="#d97706" stroke-width="1" />
              <text x="50" y="95" fill="#93c5fd" font-size="9" font-weight="bold" text-anchor="middle">Freedom &amp; Equality</text>
              <text x="50" y="107" fill="#64748b" font-size="8" text-anchor="middle">1900s – Modern Era</text>
            </g>
          </svg>`
        };
      }

      // Default: American Symbols & Holidays (119 to 128)
      return {
        caption: "Official National Symbols • Old Glory & Liberty Bell",
        svg: `<svg class="w-full h-full" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(25, 20)">
            <rect x="0" y="0" width="105" height="65" fill="#ef4444" rx="3" />
            <rect x="0" y="5" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="15" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="25" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="35" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="45" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="55" width="105" height="5" fill="#ffffff" />
            <rect x="0" y="0" width="45" height="35" fill="#1e3a8a" />
            <text x="22" y="22" fill="#ffffff" font-size="11" text-anchor="middle">★ ★ ★</text>
            <text x="52" y="80" fill="#94a3b8" font-size="8.5" font-weight="bold" text-anchor="middle">Old Glory (50 Stars)</text>
          </g>
          <g transform="translate(155, 15)">
            <path d="M30,10 L70,10 L75,65 Q85,75 50,75 Q15,75 25,65 Z" fill="#b45309" stroke="#78350f" stroke-width="1.5" />
            <rect x="20" y="0" width="60" height="12" rx="2" fill="#713f12" />
            <path d="M50,75 L47,60 L52,50 L48,40" stroke="#0f172a" stroke-width="2" fill="none" />
            <text x="50" y="90" fill="#fde047" font-size="9" font-weight="bold" text-anchor="middle">Liberty Bell</text>
            <text x="50" y="102" fill="#94a3b8" font-size="7.5" text-anchor="middle">Philadelphia, PA</text>
          </g>
        </svg>`
      };
    }

    // Coursework Interactive Multi-Phase State Machine
    let courseworkState = 'idle'; // 'idle' | 'playing' | 'paused' | 'completed'
    let currentLessonPhase = 'none'; // 'none' | 'question' | 'gap1' | 'answers' | 'gap2' | 'tip' | 'done'
    let phaseTimeout = null;
    let autoAdvanceTimeout = null;
    let speechWatchdogTimeout = null;
    let activeUtterance = null;

    function updatePlayButtonUI() {
      const icon = document.getElementById('cw-play-icon');
      const text = document.getElementById('cw-play-text');
      if (!icon || !text) return;

      if (courseworkState === 'playing') {
        icon.textContent = '⏸';
        text.textContent = 'Pause Lesson';
      } else if (courseworkState === 'paused') {
        icon.textContent = '▶';
        text.textContent = 'Resume Lesson';
      } else {
        icon.textContent = '▶';
        text.textContent = 'Play Lesson';
      }
    }

    function clearAllCourseworkTimers() {
      if (phaseTimeout) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
      }
      if (speechWatchdogTimeout) {
        clearTimeout(speechWatchdogTimeout);
        speechWatchdogTimeout = null;
      }
      if (autoAdvanceTimeout) {
        clearTimeout(autoAdvanceTimeout);
        autoAdvanceTimeout = null;
      }
    }

    function stopCourseworkAnimations() {
      document.getElementById('prof-mouth')?.classList.remove('mouth-talking');
      document.getElementById('prof-arm')?.classList.remove('baton-pointing');
      document.getElementById('cw-chalk-question')?.classList.remove('question-highlight-active');
      document.querySelectorAll('#cw-chalk-answers .cw-answer-pill').forEach(el => {
        el.classList.remove('answer-highlight-active');
      });
    }

    function pauseCourseworkLesson() {
      clearAllCourseworkTimers();
      courseworkState = 'paused';

      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }

      stopCourseworkAnimations();
      updatePlayButtonUI();

      const captionEl = document.getElementById('cw-live-caption');
      if (captionEl) {
        captionEl.textContent = `⏸ Lesson paused. Click "Resume Lesson" to continue.`;
      }
    }

    function resumeCourseworkLesson() {
      courseworkState = 'playing';
      updatePlayButtonUI();

      if (currentLessonPhase === 'gap1') {
        startLessonPhase('answers');
      } else if (currentLessonPhase === 'gap2') {
        startLessonPhase('tip');
      } else if (currentLessonPhase === 'done' || currentLessonPhase === 'none') {
        startLessonPhase('question');
      } else {
        // Re-run current active phase ('question', 'answers', or 'tip')
        startLessonPhase(currentLessonPhase);
      }
    }

    function playCourseworkLesson() {
      if (courseworkState === 'playing') {
        pauseCourseworkLesson();
        return;
      }

      if (courseworkState === 'paused') {
        resumeCourseworkLesson();
        return;
      }

      // Fresh play from beginning
      courseworkState = 'playing';
      updatePlayButtonUI();
      startLessonPhase('question');
    }

    function replayCourseworkLesson() {
      clearAllCourseworkTimers();
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
      stopCourseworkAnimations();
      courseworkState = 'playing';
      updatePlayButtonUI();
      startLessonPhase('question');
    }

    function speakPhaseUtterance(text, onComplete) {
      if (!('speechSynthesis' in window)) {
        const words = text.split(/\s+/).length;
        const durationMs = Math.max(2500, Math.round((words / 2.0) * 1000));
        phaseTimeout = setTimeout(() => {
          if (courseworkState === 'playing') onComplete();
        }, durationMs);
        return;
      }

      try {
        window.speechSynthesis.cancel();

        const cleanText = text.replace(/[\(\)\[\]]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        activeUtterance = utterance;

        const speedVal = parseFloat(document.getElementById('cw-speed-select')?.value || '1.0');
        const baseRate = 0.78;
        utterance.rate = Math.max(0.45, Math.min(1.4, (isNaN(speedVal) ? 1.0 : speedVal) * baseRate));

        const voices = window.speechSynthesis.getVoices();
        if (appState.speechVoice && voices.length > 0) {
          const found = voices.find(v => v.name === appState.speechVoice);
          if (found) utterance.voice = found;
        } else if (voices.length > 0) {
          const enVoice = voices.find(v => v.lang && (v.lang === 'en-US' || v.lang.startsWith('en')) && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('US')));
          if (enVoice) utterance.voice = enVoice;
        }

        let completed = false;
        function finishPhase() {
          if (completed) return;
          completed = true;
          if (speechWatchdogTimeout) {
            clearTimeout(speechWatchdogTimeout);
            speechWatchdogTimeout = null;
          }
          if (courseworkState === 'playing') {
            onComplete();
          }
        }

        utterance.onend = finishPhase;
        utterance.onerror = (err) => {
          // If canceled by pause, do NOT advance or error out
          if (err.error === 'canceled' || courseworkState === 'paused') {
            return;
          }
          console.warn('Utterance event error:', err);
          finishPhase();
        };

        const words = cleanText.split(/\s+/).length;
        const estimatedMs = Math.max(4000, Math.round((words / (1.5 * utterance.rate)) * 1000) + 2500);
        speechWatchdogTimeout = setTimeout(() => {
          if (courseworkState === 'playing') {
            finishPhase();
          }
        }, estimatedMs);

        setTimeout(() => {
          try {
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.warn('Speech speak error:', e);
            finishPhase();
          }
        }, 30);

      } catch (err) {
        console.warn('SpeechSynthesis error:', err);
        onComplete();
      }
    }

    function startLessonPhase(phase) {
      if (courseworkState !== 'playing') return;
      currentLessonPhase = phase;

      const qIndex = appState.courseworkLessonIndex || 0;
      const rawQ = CIVICS_QUESTIONS[qIndex];
      if (!rawQ) return;
      const q = getResolvedQuestion(rawQ, appState.selectedState || 'CA');

      const questionEl = document.getElementById('cw-chalk-question');
      const tipBox = document.getElementById('cw-tip-box');
      const tipPlaceholder = document.getElementById('cw-tip-placeholder');
      const captionEl = document.getElementById('cw-live-caption');
      const profArm = document.getElementById('prof-arm');
      const profMouth = document.getElementById('prof-mouth');

      // Reset active highlights
      questionEl?.classList.remove('question-highlight-active');
      document.querySelectorAll('#cw-chalk-answers .cw-answer-pill').forEach(el => {
        el.classList.remove('answer-highlight-active');
      });

      if (phase === 'question') {
        // Phase 1: Question
        questionEl?.classList.add('question-highlight-active');
        tipBox?.classList.add('hidden');
        tipBox?.classList.remove('tip-reveal-active');
        tipPlaceholder?.classList.remove('hidden');

        profArm?.classList.add('baton-pointing');
        profMouth?.classList.add('mouth-talking');

        const cleanQ = q.question.trim();
        const speechText = `Lesson ${q.id}. ${cleanQ}`;
        if (captionEl) {
          captionEl.textContent = `Lesson ${q.id}: ${cleanQ}`;
        }

        speakPhaseUtterance(speechText, () => {
          profMouth?.classList.remove('mouth-talking');
          questionEl?.classList.remove('question-highlight-active');

          if (courseworkState !== 'playing') return;
          currentLessonPhase = 'gap1';

          if (captionEl) {
            captionEl.textContent = `Lesson ${q.id}: Question spoken. Think of your oral answer...`;
          }

          // Generous gap to process question (1600ms)
          phaseTimeout = setTimeout(() => {
            if (courseworkState === 'playing') {
              startLessonPhase('answers');
            }
          }, 1600);
        });

      } else if (phase === 'answers') {
        // Phase 2: Accepted Oral Answers
        // Highlight and shake/pulse accepted oral answers
        document.querySelectorAll('#cw-chalk-answers .cw-answer-pill').forEach(el => {
          el.classList.add('answer-highlight-active');
        });

        profArm?.classList.add('baton-pointing');
        profMouth?.classList.add('mouth-talking');

        const answersList = (q.answers && q.answers.length > 0) ? q.answers : [q.primaryAnswer];
        const answersFormatted = answersList.join(', or, ');
        const speechText = answersList.length > 1
          ? `Accepted answers are: ${answersFormatted}.`
          : `The accepted answer is: ${answersList[0]}.`;

        if (captionEl) {
          captionEl.textContent = `Accepted Answer${answersList.length > 1 ? 's' : ''}: ${answersList.join(' | ')}`;
        }

        speakPhaseUtterance(speechText, () => {
          profMouth?.classList.remove('mouth-talking');
          document.querySelectorAll('#cw-chalk-answers .cw-answer-pill').forEach(el => {
            el.classList.remove('answer-highlight-active');
          });

          if (courseworkState !== 'playing') return;
          currentLessonPhase = 'gap2';

          if (captionEl) {
            captionEl.textContent = `Practice repeating the answer aloud... (Next: Study Tip)`;
          }

          // Generous gap for user to repeat and practice aloud (1800ms)
          phaseTimeout = setTimeout(() => {
            if (courseworkState === 'playing') {
              startLessonPhase('tip');
            }
          }, 1800);
        });

      } else if (phase === 'tip') {
        // Phase 3: Study Tip
        // Unhide Study Tip and animate into view with warm amber glow
        tipPlaceholder?.classList.add('hidden');
        tipBox?.classList.remove('hidden');
        tipBox?.classList.add('tip-reveal-active');

        profArm?.classList.add('baton-pointing');
        profMouth?.classList.add('mouth-talking');

        const cleanTip = q.explanation.trim();
        const speechText = `Study tip: ${cleanTip}`;

        if (captionEl) {
          captionEl.textContent = `Study Tip: ${cleanTip}`;
        }

        speakPhaseUtterance(speechText, () => {
          profMouth?.classList.remove('mouth-talking');
          profArm?.classList.remove('baton-pointing');

          if (courseworkState !== 'playing') return;
          currentLessonPhase = 'done';
          courseworkState = 'completed';
          updatePlayButtonUI();

          const autoAdvanceOn = document.getElementById('cw-toggle-autoadvance')?.checked;
          if (autoAdvanceOn && qIndex < CIVICS_QUESTIONS.length - 1) {
            if (captionEl) {
              captionEl.textContent = `✅ Lesson ${q.id} completed! Auto-advancing in 3 seconds... (Click Pause to stay)`;
            }
            autoAdvanceTimeout = setTimeout(() => {
              if (courseworkState !== 'paused') {
                loadCourseworkLesson(qIndex + 1, true);
              }
            }, 3000);
          } else {
            if (captionEl) {
              captionEl.textContent = `✅ Lesson ${q.id} completed! Try Pop Quiz or advance to Lesson ${q.id + 1}.`;
            }
          }
        });
      }
    }

    function syncCourseworkProgressUI() {
      const totalMastered = Object.keys(appState.mastered).filter(k => appState.mastered[k]).length;
      const totalQs = CIVICS_QUESTIONS.length;
      const pct = Math.round((totalMastered / totalQs) * 100);

      const progEl = document.getElementById('cw-overall-progress');
      const progPctEl = document.getElementById('cw-progress-percent');
      const pillEl = document.getElementById('cw-progress-pill');

      if (progEl) progEl.style.width = `${pct}%`;
      if (progPctEl) progPctEl.textContent = `${pct}% Completed (${totalMastered} / ${totalQs})`;

      const qIndex = appState.courseworkLessonIndex || 0;
      if (pillEl) {
        pillEl.textContent = `Lesson ${qIndex + 1} of ${totalQs} • ${totalMastered} / ${totalQs} Mastered across Curriculum`;
      }
    }

    function loadCourseworkLesson(index, autoPlay = false) {
      if (index < 0) index = 0;
      if (index >= CIVICS_QUESTIONS.length) index = CIVICS_QUESTIONS.length - 1;

      appState.courseworkLessonIndex = index;
      saveState();

      const rawQ = CIVICS_QUESTIONS[index];
      const q = getResolvedQuestion(rawQ, appState.selectedState || 'CA');
      const unit = getUnitForQuestionId(q.id);

      // Header Unit elements
      const badgeEl = document.getElementById('cw-unit-badge');
      const titleEl = document.getElementById('cw-unit-title');
      const unitSelect = document.getElementById('cw-unit-select');
      const lessonSelect = document.getElementById('cw-lesson-select');

      if (badgeEl) badgeEl.textContent = `Unit ${unit.id} of 8: ${unit.icon}`;
      if (titleEl) titleEl.textContent = unit.title;
      if (unitSelect) unitSelect.value = unit.id;
      if (lessonSelect) lessonSelect.value = index;

      // Chalkboard Header
      const numEl = document.getElementById('cw-chalk-lesson-num');
      const tagEl = document.getElementById('cw-chalk-tag');
      const catEl = document.getElementById('cw-chalk-category');

      if (numEl) numEl.textContent = `LESSON ${q.id} OF 128`;
      if (catEl) catEl.textContent = `${q.category} • ${q.subcategory}`;

      if (tagEl) {
        if (q.is6520) {
          tagEl.textContent = '★ 65/20 Special Exemption (Designated Question)';
          tagEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/90 text-amber-300 border border-amber-600/50';
        } else if (q.isStateSpecific) {
          const stName = (STATES_DATA[appState.selectedState || 'CA'] || STATES_DATA['CA']).name;
          tagEl.textContent = `📍 ${stName} State Official Question`;
          tagEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-600/50';
        } else if (q.origin === 'new') {
          tagEl.textContent = '🆕 New in 128 Pool';
          tagEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-600/50';
        } else if (q.origin === 'amended') {
          tagEl.textContent = '✏️ Amended / Expanded Wording';
          tagEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/90 text-amber-300 border border-amber-600/50';
        } else {
          tagEl.textContent = 'Official 128 Exam';
          tagEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-600/50';
        }
      }

      // Chalkboard Question & Answers
      const qEl = document.getElementById('cw-chalk-question');
      const answersEl = document.getElementById('cw-chalk-answers');
      const tipEl = document.getElementById('cw-chalk-tip');

      if (qEl) qEl.textContent = q.question;
      if (tipEl) tipEl.textContent = q.explanation;

      if (answersEl) {
        answersEl.innerHTML = q.answers.map((ans, aIdx) => `
          <div class="cw-answer-pill flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-600/30 shadow-sm transition-all duration-300">
            <span class="text-emerald-400 font-bold text-base leading-none mt-0.5">✓</span>
            <span class="chalk-font chalk-green text-base sm:text-lg font-semibold leading-snug">${ans}</span>
          </div>
        `).join('');
      }

      // Professor Speech Bubble (Pedagogical mentor guide - Study Tip shown ONLY once on main left panel)
      const bubbleEl = document.getElementById('cw-prof-bubble');
      if (bubbleEl) {
        if (q.is6520) {
          bubbleEl.textContent = `Welcome to Lesson ${q.id}! ★ 65/20 Special Exemption designated question. Listen carefully to the accepted answers.`;
        } else if (q.isStateSpecific) {
          const stName = (STATES_DATA[appState.selectedState || 'CA'] || STATES_DATA['CA']).name;
          bubbleEl.textContent = `Welcome to Lesson ${q.id}! 📍 Official state-specific question for ${stName}.`;
        } else {
          bubbleEl.textContent = `Welcome to Lesson ${q.id}! Listen to the question and repeat the accepted oral answers aloud.`;
        }
      }

      // Hide Study Tip initially until reached in narration
      const tipBox = document.getElementById('cw-tip-box');
      const tipPlaceholder = document.getElementById('cw-tip-placeholder');
      if (tipBox) {
        tipBox.classList.add('hidden');
        tipBox.classList.remove('tip-reveal-active');
      }
      if (tipPlaceholder) {
        tipPlaceholder.classList.remove('hidden');
      }

      // Visual Artifact
      const artifact = getQuestionArtifact(q);
      const artContainer = document.getElementById('cw-artifact-container');
      const artCaption = document.getElementById('cw-artifact-caption');
      if (artContainer) artContainer.innerHTML = artifact.svg;
      if (artCaption) artCaption.textContent = artifact.caption;

      // Star & Mastered Action Buttons
      const starIcon = document.getElementById('cw-star-icon');
      const masterCheck = document.getElementById('cw-master-check');
      const masterLabel = document.getElementById('cw-master-label');
      const isMastered = !!appState.mastered[q.id];
      const isStarred = !!appState.starred[q.id];

      if (starIcon) starIcon.textContent = isStarred ? '★' : '☆';
      if (masterCheck) masterCheck.textContent = isMastered ? '●' : '○';
      if (masterLabel) masterLabel.textContent = isMastered ? 'Mastered' : 'Master';

      // Close pop quiz
      document.getElementById('cw-pop-quiz-box')?.classList.add('hidden');

      // Sync Progress
      syncCourseworkProgressUI();

      // Audio & State Reset for New Lesson
      clearAllCourseworkTimers();
      courseworkState = 'idle';
      currentLessonPhase = 'none';
      stopCourseworkAnimations();
      updatePlayButtonUI();

      const captionEl = document.getElementById('cw-live-caption');
      if (captionEl) {
        captionEl.textContent = `Lesson ${q.id}: Click "Play Lesson" to listen.`;
      }

      if (autoPlay) {
        playCourseworkLesson();
      }
    }

    function togglePopQuiz() {
      const quizBox = document.getElementById('cw-pop-quiz-box');
      if (!quizBox) return;

      if (!quizBox.classList.contains('hidden')) {
        quizBox.classList.add('hidden');
        return;
      }

      const qIndex = appState.courseworkLessonIndex || 0;
      const rawQ = CIVICS_QUESTIONS[qIndex];
      const q = getResolvedQuestion(rawQ, appState.selectedState || 'CA');

      const qTextEl = document.getElementById('cw-pop-quiz-question');
      const optionsEl = document.getElementById('cw-pop-quiz-options');
      const feedbackEl = document.getElementById('cw-pop-quiz-feedback');

      if (qTextEl) qTextEl.textContent = q.question;
      if (feedbackEl) feedbackEl.classList.add('hidden');

      const options = [...(q.options || [q.primaryAnswer, 'None of the above', 'All of the above', 'Varies'])];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }

      optionsEl.innerHTML = options.map((opt, idx) => `
        <button class="cw-quiz-opt w-full text-left p-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 hover:border-indigo-400 text-slate-100 font-medium transition flex items-start gap-2.5" data-opt="${encodeURIComponent(opt)}">
          <span class="w-5 h-5 rounded-full bg-slate-700 text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0 mt-0.5">${String.fromCharCode(65 + idx)}</span>
          <span class="leading-snug">${opt}</span>
        </button>
      `).join('');

      optionsEl.querySelectorAll('.cw-quiz-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const selected = decodeURIComponent(btn.getAttribute('data-opt'));
          const isCorrect = (selected === q.primaryAnswer) || (q.answers && q.answers.includes(selected));

          optionsEl.querySelectorAll('.cw-quiz-opt').forEach(b => {
            b.disabled = true;
            const bOpt = decodeURIComponent(b.getAttribute('data-opt'));
            if ((bOpt === q.primaryAnswer) || (q.answers && q.answers.includes(bOpt))) {
              b.className = 'w-full text-left p-3 rounded-xl bg-emerald-950/80 border-2 border-emerald-500 text-emerald-200 font-semibold flex items-start gap-2.5';
            } else if (bOpt === selected && !isCorrect) {
              b.className = 'w-full text-left p-3 rounded-xl bg-rose-950/80 border-2 border-rose-500 text-rose-200 font-semibold flex items-start gap-2.5';
            } else {
              b.className = 'w-full text-left p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-500 opacity-60 flex items-start gap-2.5';
            }
          });

          if (feedbackEl) {
            feedbackEl.classList.remove('hidden');
            if (isCorrect) {
              playBeep('correct');
              feedbackEl.className = 'p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 space-y-2';
              feedbackEl.innerHTML = `
                <div class="flex items-center gap-2 font-bold text-emerald-300">
                  <span>🎉</span>
                  <span>Correct! Outstanding comprehension!</span>
                </div>
                <p class="text-[11px] text-emerald-200/90">That is the official USCIS accepted naturalization answer.</p>
                <div class="flex items-center gap-2 pt-1">
                  <button id="cw-quiz-btn-master" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition">
                    ${appState.mastered[q.id] ? '✓ Already Mastered' : '★ Mark Question as Mastered'}
                  </button>
                  <button id="cw-quiz-btn-next" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition">
                    Next Lesson ▶
                  </button>
                </div>
              `;
              document.getElementById('cw-quiz-btn-master')?.addEventListener('click', () => {
                if (!appState.mastered[q.id]) toggleMastered(q.id);
                syncCourseworkProgressUI();
                const mBtn = document.getElementById('cw-btn-mastered');
                if (mBtn) {
                  document.getElementById('cw-master-check').textContent = '●';
                  document.getElementById('cw-master-label').textContent = 'Mastered';
                }
                document.getElementById('cw-quiz-btn-master').textContent = '✓ Mastered!';
              });
              document.getElementById('cw-quiz-btn-next')?.addEventListener('click', () => {
                if (qIndex < CIVICS_QUESTIONS.length - 1) {
                  loadCourseworkLesson(qIndex + 1, false);
                }
              });
            } else {
              playBeep('wrong');
              feedbackEl.className = 'p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 space-y-1.5';
              feedbackEl.innerHTML = `
                <div class="flex items-center gap-2 font-bold text-rose-300">
                  <span>⚠️</span>
                  <span>Incorrect. The accepted answer is: "${q.primaryAnswer}".</span>
                </div>
                <p class="text-[11px] text-rose-200/90">Study Tip: ${q.explanation}</p>
              `;
            }
          }
        });
      });

      quizBox.classList.remove('hidden');
    }

    function renderCourseworkSyllabus() {
      const grid = document.getElementById('cw-syllabus-grid');
      if (!grid) return;

      grid.innerHTML = COURSEWORK_UNITS.map(unit => {
        const unitQs = CIVICS_QUESTIONS.filter(q => q.id >= unit.range[0] && q.id <= unit.range[1]);
        const unitMastered = unitQs.filter(q => appState.mastered[q.id]).length;
        const pct = Math.round((unitMastered / unitQs.length) * 100);

        return `
          <div class="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 transition flex flex-col justify-between space-y-3 group">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-2xl">${unit.icon}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${unitMastered === unitQs.length ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'}">
                  ${unitMastered} / ${unitQs.length} Mastered (${pct}%)
                </span>
              </div>
              <h4 class="text-sm font-bold text-white mt-2 group-hover:text-indigo-300 transition">
                Unit ${unit.id}: ${unit.title}
              </h4>
              <p class="text-[11px] text-slate-400 mt-1 line-clamp-2">
                ${unit.description}
              </p>
            </div>

            <div class="space-y-2 pt-2 border-t border-slate-800/80">
              <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div class="bg-indigo-500 h-full transition-all duration-300" style="width: ${pct}%"></div>
              </div>
              <button class="cw-btn-study-unit w-full py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold transition" data-start="${unit.range[0] - 1}">
                Study Unit ${unit.id} (Q${unit.range[0]}–${unit.range[1]}) ▶
              </button>
            </div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.cw-btn-study-unit').forEach(btn => {
        btn.addEventListener('click', () => {
          const startIndex = parseInt(btn.getAttribute('data-start'), 10);
          loadCourseworkLesson(startIndex, false);
          document.getElementById('cw-cinema-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function populateCourseworkLessonSelect() {
      const select = document.getElementById('cw-lesson-select');
      if (!select || select.options.length > 0) return;

      CIVICS_QUESTIONS.forEach((q, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `Lesson ${q.id}: ${q.question.slice(0, 40)}...`;
        select.appendChild(opt);
      });
    }

    let courseworkInitialized = false;
    function initCourseworkView() {
      populateCourseworkLessonSelect();
      renderCourseworkSyllabus();

      if (!courseworkInitialized) {
        courseworkInitialized = true;
        // Wire up playback buttons
        document.getElementById('cw-btn-play')?.addEventListener('click', playCourseworkLesson);
        document.getElementById('cw-btn-replay')?.addEventListener('click', replayCourseworkLesson);
        document.getElementById('cw-btn-prev')?.addEventListener('click', () => {
          const cur = appState.courseworkLessonIndex || 0;
          if (cur > 0) loadCourseworkLesson(cur - 1, isCourseworkSpeaking);
        });
        document.getElementById('cw-btn-next')?.addEventListener('click', () => {
          const cur = appState.courseworkLessonIndex || 0;
          if (cur < CIVICS_QUESTIONS.length - 1) loadCourseworkLesson(cur + 1, isCourseworkSpeaking);
        });

        // Dropdowns
        document.getElementById('cw-lesson-select')?.addEventListener('change', (e) => {
          const idx = parseInt(e.target.value, 10);
          loadCourseworkLesson(idx, isCourseworkSpeaking);
        });

        document.getElementById('cw-unit-select')?.addEventListener('change', (e) => {
          const unitId = parseInt(e.target.value, 10);
          const unit = COURSEWORK_UNITS.find(u => u.id === unitId);
          if (unit) {
            loadCourseworkLesson(unit.range[0] - 1, isCourseworkSpeaking);
          }
        });

        // Star & Mastered
        document.getElementById('cw-btn-star')?.addEventListener('click', () => {
          const cur = appState.courseworkLessonIndex || 0;
          const q = CIVICS_QUESTIONS[cur];
          toggleStar(q.id);
          const isStarred = !!appState.starred[q.id];
          const starIcon = document.getElementById('cw-star-icon');
          if (starIcon) starIcon.textContent = isStarred ? '★' : '☆';
        });

        document.getElementById('cw-btn-mastered')?.addEventListener('click', () => {
          const cur = appState.courseworkLessonIndex || 0;
          const q = CIVICS_QUESTIONS[cur];
          toggleMastered(q.id);
          const isMastered = !!appState.mastered[q.id];
          const check = document.getElementById('cw-master-check');
          const label = document.getElementById('cw-master-label');
          if (check) check.textContent = isMastered ? '●' : '○';
          if (label) label.textContent = isMastered ? 'Mastered' : 'Master';
          syncCourseworkProgressUI();
          renderCourseworkSyllabus();
        });

        // Pop Quiz toggles
        document.getElementById('cw-btn-toggle-quiz')?.addEventListener('click', togglePopQuiz);
        document.getElementById('cw-btn-close-quiz')?.addEventListener('click', () => {
          document.getElementById('cw-pop-quiz-box')?.classList.add('hidden');
        });

        // Speed change listener
        document.getElementById('cw-speed-select')?.addEventListener('change', () => {
          if (isCourseworkSpeaking) {
            replayCourseworkLesson();
          }
        });

        // Tip placeholder click to reveal
        document.getElementById('cw-tip-placeholder')?.addEventListener('click', () => {
          document.getElementById('cw-tip-placeholder')?.classList.add('hidden');
          const tBox = document.getElementById('cw-tip-box');
          if (tBox) {
            tBox.classList.remove('hidden');
            tBox.classList.add('tip-reveal-active');
          }
        });

        // Filter syllabus link
        document.getElementById('cw-filter-all')?.addEventListener('click', () => {
          renderCourseworkSyllabus();
        });

        // Keyboard Shortcuts for Coursework
        document.addEventListener('keydown', (e) => {
          if (appState.activeTab !== 'coursework') return;
          if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) return;

          if (e.key === 'ArrowLeft') {
            const cur = appState.courseworkLessonIndex || 0;
            if (cur > 0) loadCourseworkLesson(cur - 1, isCourseworkSpeaking);
          } else if (e.key === 'ArrowRight') {
            const cur = appState.courseworkLessonIndex || 0;
            if (cur < CIVICS_QUESTIONS.length - 1) loadCourseworkLesson(cur + 1, isCourseworkSpeaking);
          } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            playCourseworkLesson();
          }
        });
      }

      loadCourseworkLesson(appState.courseworkLessonIndex || 0, false);
    }



    // INITIAL APP BOOT
    window.addEventListener('DOMContentLoaded', () => {
      initAuth();
      if (currentUser) {
        loadState();
        updateTopStats();
        
        // Default to California if none selected
        const userState = appState.selectedState || (currentUser ? currentUser.state : 'CA');
        updateStateDisplay(userState);

        // Restore active deck filter or default to 'all'
        const lastFilter = appState.lastDeckFilter || 'all';
        applyStudyDeckFilter(lastFilter, true);

        // Restore card position so user resumes exactly where they left off!
        if (appState.currentCardIndex && appState.currentCardIndex > 0 && appState.currentCardIndex < currentDeck.length) {
          currentCardIndex = appState.currentCardIndex;
          updateFlashcardView();
          const curQ = currentDeck[currentCardIndex];
          showToast(`📖 Resumed study session at Card #${currentCardIndex + 1} of ${currentDeck.length}`, 'info');
        } else {
          updateFlashcardView();
        }

        // Restore active tab
        if (appState.activeTab && appState.activeTab !== 'study') {
          switchTab(appState.activeTab);
        }
      }

      initCourseworkView();
            checkStandaloneStatus();
    });
