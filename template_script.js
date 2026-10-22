    // Embedded Official Database of 128 Questions
    const CIVICS_QUESTIONS = __CIVICS_JSON__;
    const STATES_DATA = __STATES_JSON__;

    // User State Store (persisted in localStorage)
    const appState = {
      selectedState: 'CA',
      currentCardIndex: 0,
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

    function resetAppStateToDefaults() {
      appState.selectedState = currentUser ? currentUser.state : 'CA';
      appState.currentCardIndex = 0;
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
      readiness: document.getElementById('nav-readiness')
    };

    const tabViews = {
      study: document.getElementById('view-study'),
      prepare: document.getElementById('view-prepare'),
      challenge: document.getElementById('view-challenge'),
      readiness: document.getElementById('view-readiness')
    };

    function switchTab(tabId) {
      Object.keys(tabViews).forEach(id => {
        if (tabViews[id]) tabViews[id].classList.add('hidden');
        if (tabButtons[id]) {
          tabButtons[id].className = 'tab-btn px-4 py-3 font-semibold text-sm rounded-t-xl transition flex items-center gap-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40';
        }
      });

      if (tabViews[tabId]) tabViews[tabId].classList.remove('hidden');
      if (tabButtons[tabId]) {
        tabButtons[tabId].className = 'tab-btn px-4 py-3 font-semibold text-sm rounded-t-xl transition flex items-center gap-2 border-b-2 border-blue-500 text-blue-400 bg-slate-800/60';
      }

      appState.activeTab = tabId;
      saveState();

      if (tabId === 'readiness') {
        updateTopStats();
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

    function initAuth() {
      loadSession();
      updateAuthUI();
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

    function showAuthFeedback(msg, type = 'error') {
      const fb = document.getElementById('auth-feedback');
      if (!fb) return;
      fb.textContent = msg;
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
      const email = (emailInput?.value || '').trim().toLowerCase();
      const password = passInput?.value || '';

      if (!email || !password) {
        showAuthFeedback('Please enter both email and password.', 'error');
        return;
      }

      const users = getUsersStore();
      const user = users[email];
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
      if (user.state) {
        updateStateDisplay(user.state);
      } else {
        updateTopStats();
        updateFlashcardView();
        updateReadinessDashboard();
      }

      updateAuthUI();
      showToast(`👋 Welcome back, ${user.name}! Access granted.`, 'success');
    }

    async function handleSignup() {
      clearAuthFeedback();
      const name = (document.getElementById('signup-name')?.value || '').trim();
      const email = (document.getElementById('signup-email')?.value || '').trim().toLowerCase();
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

      const users = getUsersStore();
      if (users[email]) {
        showAuthFeedback('An account with this email already exists. Please sign in instead.', 'error');
        return;
      }

      const salt = Math.random().toString(36).substring(2, 10);
      const hash = await hashPassword(pass, salt);
      const uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const newUser = {
        id: uid,
        name: name,
        email: email,
        passwordHash: hash,
        salt: salt,
        state: stateCode,
        createdAt: new Date().toISOString()
      };

      users[email] = newUser;
      saveUsersStore(users);

      saveSession({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        state: newUser.state,
        createdAt: newUser.createdAt
      });

      // Transfer any active study session to the new user account so work isn't lost
      appState.selectedState = stateCode;
      saveState();

      updateStateDisplay(stateCode);
      updateAuthUI();
      showToast(`🎉 Welcome to Civics 128, ${name}! Your free account is created and access is granted.`, 'success');
    }

    function handleLogout() {
      saveSession(null);
      currentUser = null;
      updateAuthUI();
      closeProfileModal();
      showToast('You have been logged out. Please sign in to access.', 'info');
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

      checkStandaloneStatus();
    });
