// =====================================================
// GAME TRACKING & SCORING SYSTEM
// Little League AA Game Scoring
// =====================================================

// ========================================
// GAME STATE
// ========================================

let gameState = {
    gameStarted: false,
    currentInning: 1,
    halfInning: 'top',
    outs: 0,
    ourTeam: 'home',
    score: {
        home: { innings: [0, 0, 0, 0, 0, 0], total: 0 },
        visitors: { innings: [0, 0, 0, 0, 0, 0], total: 0 }
    },
    // Track runs scored by each team in each half-inning (for auto-swap rule)
    runsPerHalfInning: {
        top: [],      // visitors runs in each top half
        bottom: []    // home runs in each bottom half
    },
    runsThreshold: 4, // auto-swap after 4 runs
    bases: { first: null, second: null, third: null },
    currentBattingOrder: [],
    currentBatterIndex: 0,
    count: { balls: 0, strikes: 0, fouls: 0 },
    currentPitcherId: null,
    currentBatterId: null,
    pitchCount: 0,
    strikeCount: 0,
    gameLog: [],
    substitutions: [],
    startTime: null,
    endTime: null,
    // Opponent info
    opposingTeamName: '',
    opposingPitcherNumber: '',
    opposingPitcherName: ''
};

let battingStats = {};
let pitchingStats = {};

// Opponent pitcher stats (separate from our team's pitching stats)
let opposingPitchingStats = {
    pitchesThrown: 0,
    strikes: 0,
    balls: 0,
    walks: 0,
    strikeouts: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    stolenBasesAllowed: 0
};

let undoStack = [];
const MAX_UNDO = 50;
const MAX_PITCHES = 50;
let gameCurrentTab = 'game';
let currentViewingPlayerId = null;

// ========================================
// HELPERS
// ========================================

function getPlayerById(id) {
    return players.find(p => p.id == id);
}

function getPlayerName(id) {
    const p = getPlayerById(id);
    return p ? `#${p.number} ${p.name}` : '?';
}

// Escape user-controllable strings (player name/number/song from players.json)
// before interpolating them into HTML so they can't break out of the markup.
function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function getInningLabel() {
    const team = gameState.halfInning === 'top' ? 'Top' : 'Bottom';
    const suffix = gameState.currentInning === 1 ? 'st' : gameState.currentInning === 2 ? 'nd' : gameState.currentInning === 3 ? 'rd' : 'th';
    return `${team} ${gameState.currentInning}${suffix}`;
}

function getTeamName() {
    return gameState.halfInning === 'bottom' ? 'HOME' : 'VIS';
}

// ========================================
// TEAM POSITION & OPPONENT INFO
// ========================================

function setOurTeam(team) {
    gameState.ourTeam = team;
    saveGameState();

    // Update toggle button states
    const homeBtn = document.getElementById('teamHomeBtn');
    const visitorBtn = document.getElementById('teamVisitorBtn');
    if (homeBtn) homeBtn.classList.toggle('active', team === 'home');
    if (visitorBtn) visitorBtn.classList.toggle('active', team === 'visitors');

    renderGameUI();
}

function saveOpponentInfo() {
    const teamName = document.getElementById('opposingTeamName')?.value || '';
    const pitcherNumber = document.getElementById('opposingPitcherNumber')?.value || '';
    const pitcherName = document.getElementById('opposingPitcherName')?.value || '';

    gameState.opposingTeamName = teamName;
    gameState.opposingPitcherNumber = pitcherNumber;
    gameState.opposingPitcherName = pitcherName;
    saveGameState();
    renderOpponentDisplay();
}

function renderOpponentDisplay() {
    // Update opponent info display on the page
    const oppInfo = document.getElementById('opponentInfoDisplay');
    if (oppInfo) {
        const team = gameState.opposingTeamName || 'Opponent';
        const pitcher = gameState.opposingPitcherNumber
            ? `#${gameState.opposingPitcherNumber} ${gameState.opposingPitcherName || ''}`.trim()
            : (gameState.opposingPitcherName || 'Not set');
        oppInfo.innerHTML = `
            <div class="opponent-team-name">${team}</div>
            <div class="opponent-pitcher">P: ${pitcher}</div>
            <div class="opponent-pitch-count">Pitches: ${opposingPitchingStats.pitchesThrown}</div>
        `;
    }
}

function getPitcherPitchCount() {
    if (!gameState.currentPitcherId) return 0;
    const ps = pitchingStats[gameState.currentPitcherId];
    return ps ? ps.pitchesThrown : 0;
}

function checkPitcherLimit() {
    const count = getPitcherPitchCount();
    if (count >= MAX_PITCHES) {
        showToast(`⚠️ Pitcher has thrown ${count} pitches (max ${MAX_PITCHES}). Consider changing pitcher.`, 'warning');
        return;
    }
    if (count >= MAX_PITCHES - 5) {
        showToast(`⚠️ Pitcher at ${count} pitches - approaching ${MAX_PITCHES} pitch limit`, 'warning');
    }
}

function changePitcher(newPitcherId) {
    if (!newPitcherId) return;
    const newId = parseInt(newPitcherId);
    if (newId === gameState.currentPitcherId) return;

    pushHistory();

    const oldPitcher = getPlayerById(gameState.currentPitcherId);
    const newPitcher = getPlayerById(newId);

    gameState.currentPitcherId = newId;

    // Ensure new pitcher is in batting order
    if (!gameState.currentBattingOrder.includes(newId)) {
        gameState.currentBattingOrder.push(newId);
    }

    // Initialize pitching stats if needed
    if (!pitchingStats[newId]) {
        pitchingStats[newId] = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, inningsPitched: 0, stolenBasesAllowed: 0 };
    }

    const oldName = oldPitcher ? `#${oldPitcher.number} ${oldPitcher.name}` : 'None';
    const newName = newPitcher ? `#${newPitcher.number} ${newPitcher.name}` : 'Unknown';
    gameState.gameLog.push(`${getInningLabel()}: Pitcher change - ${oldName} → ${newName}`);

    // Sync back to the main batting order so the Batting Order tab stays in sync
    if (typeof battingOrder !== 'undefined') {
        battingOrder = [...gameState.currentBattingOrder];
    }

    // Save batting order to localStorage so it persists on refresh
    if (typeof saveBattingOrder === 'function') {
        saveBattingOrder();
    }

    saveGameState();
    renderGameUI();
    showToast(`Pitcher changed to ${newName}`, 'success');
}

function openPitcherChangeModal() {
    const modal = document.getElementById('pitcherChangeModal');
    const select = document.getElementById('newPitcherSelect');
    if (!modal || !select) return;

    // Populate with available players (excluding current pitcher)
    const availablePlayers = players.filter(p => playerAvailability[p.id] && p.id !== gameState.currentPitcherId);
    select.innerHTML = '<option value="">-- Select new pitcher --</option>' +
        availablePlayers.map(p => `<option value="${escapeHtml(p.id)}">#${escapeHtml(p.number)} ${escapeHtml(p.name)}</option>`).join('');

    modal.style.display = 'block';
}

function closePitcherChangeModal() {
    const modal = document.getElementById('pitcherChangeModal');
    if (modal) modal.style.display = 'none';
}

function confirmPitcherChange() {
    const select = document.getElementById('newPitcherSelect');
    if (select && select.value) {
        changePitcher(select.value);
    }
    closePitcherChangeModal();
}

function getOurTeamLabel() {
    return gameState.ourTeam === 'home' ? 'HOME' : 'VIS';
}

function getOpponentTeamLabel() {
    return gameState.ourTeam === 'home' ? 'VIS' : 'HOME';
}

// ========================================
// PERSISTENCE
// ========================================

function saveGameState() {
    localStorage.setItem('walkoutGameState', JSON.stringify(gameState));
    localStorage.setItem('walkoutBattingStats', JSON.stringify(battingStats));
    localStorage.setItem('walkoutPitchingStats', JSON.stringify(pitchingStats));
    localStorage.setItem('walkoutOpponentPitchingStats', JSON.stringify(opposingPitchingStats));
    localStorage.setItem('walkoutUndoStack', JSON.stringify(undoStack));
}

function loadGameState() {
    const saved = localStorage.getItem('walkoutGameState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            gameState.gameStarted = parsed.gameStarted || false;
            gameState.currentInning = parsed.currentInning || 1;
            gameState.halfInning = parsed.halfInning || 'top';
            gameState.outs = parsed.outs || 0;
            gameState.ourTeam = parsed.ourTeam || 'home';
            gameState.score.home.innings = parsed.score?.home?.innings || [0, 0, 0, 0, 0, 0];
            gameState.score.home.total = parsed.score?.home?.total || 0;
            gameState.score.visitors.innings = parsed.score?.visitors?.innings || [0, 0, 0, 0, 0, 0];
            gameState.score.visitors.total = parsed.score?.visitors?.total || 0;
            gameState.bases = parsed.bases || { first: null, second: null, third: null };
            gameState.currentBattingOrder = parsed.currentBattingOrder || [];
            gameState.currentBatterIndex = parsed.currentBatterIndex || 0;
            gameState.count = parsed.count || { balls: 0, strikes: 0, fouls: 0 };
            gameState.currentPitcherId = parsed.currentPitcherId || null;
            gameState.pitchCount = parsed.pitchCount || 0;
            gameState.strikeCount = parsed.strikeCount || 0;
            gameState.gameLog = parsed.gameLog || [];
            gameState.substitutions = parsed.substitutions || [];
            gameState.startTime = parsed.startTime || null;
            gameState.endTime = parsed.endTime || null;
            gameState.opposingTeamName = parsed.opposingTeamName || '';
            gameState.opposingPitcherNumber = parsed.opposingPitcherNumber || '';
            gameState.opposingPitcherName = parsed.opposingPitcherName || '';
            gameState.runsPerHalfInning = parsed.runsPerHalfInning || { top: [], bottom: [] };
            gameState.runsThreshold = parsed.runsThreshold || 4;
            gameState.currentBatterId = parsed.currentBatterId || null;
            undoStack = parsed.undoStack || [];
        } catch (e) {
            console.error('Error loading game state:', e);
            resetGameState();
        }
    }

    const savedBatting = localStorage.getItem('walkoutBattingStats');
    if (savedBatting) {
        try { battingStats = JSON.parse(savedBatting); } catch (e) { battingStats = {}; }
    }

    const savedPitching = localStorage.getItem('walkoutPitchingStats');
    if (savedPitching) {
        try { pitchingStats = JSON.parse(savedPitching); } catch (e) { pitchingStats = {}; }
    }

    const savedOpponentPitching = localStorage.getItem('walkoutOpponentPitchingStats');
    if (savedOpponentPitching) {
        try {
            opposingPitchingStats = JSON.parse(savedOpponentPitching);
        } catch (e) {
            opposingPitchingStats = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0 };
        }
    }

    const savedUndo = localStorage.getItem('walkoutUndoStack');
    if (savedUndo) {
        try { undoStack = JSON.parse(savedUndo); } catch (e) { undoStack = []; }
    }

    // Sync loaded game batting order back to the main batting order so the Batting Order tab stays in sync
    // Only do this when a game is actively in progress — when the game is not started, the batting order
    // from localStorage (loaded by loadBattingOrder in app.js) is the source of truth.
    if (typeof battingOrder !== 'undefined' && gameState.gameStarted && gameState.currentBattingOrder && gameState.currentBattingOrder.length > 0) {
        battingOrder = [...gameState.currentBattingOrder];
    }
}

function resetGameState() {
    gameState = {
        gameStarted: false,
        currentInning: 1,
        halfInning: 'top',
        outs: 0,
        ourTeam: 'home',
        score: {
            home: { innings: [0, 0, 0, 0, 0, 0], total: 0 },
            visitors: { innings: [0, 0, 0, 0, 0, 0], total: 0 }
        },
        runsPerHalfInning: { top: [], bottom: [] },
        runsThreshold: 4,
        bases: { first: null, second: null, third: null },
        currentBattingOrder: [],
        currentBatterIndex: 0,
        count: { balls: 0, strikes: 0, fouls: 0 },
        currentPitcherId: null,
        currentBatterId: null,
        pitchCount: 0,
        strikeCount: 0,
        gameLog: [],
        substitutions: [],
        startTime: null,
        endTime: null,
        opposingTeamName: '',
        opposingPitcherNumber: '',
        opposingPitcherName: ''
    };
    battingStats = {};
    pitchingStats = {};
    opposingPitchingStats = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, stolenBasesAllowed: 0 };
    undoStack = [];
    saveGameState();
}

// ========================================
// UNDO SYSTEM
// ========================================

function pushHistory() {
    const snapshot = {
        gameState: JSON.parse(JSON.stringify(gameState)),
        battingStats: JSON.parse(JSON.stringify(battingStats)),
        pitchingStats: JSON.parse(JSON.stringify(pitchingStats)),
        opposingPitchingStats: JSON.parse(JSON.stringify(opposingPitchingStats))
    };
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
    }
    saveGameState();
}

function undo() {
    if (undoStack.length === 0) {
        showToast('Nothing to undo.', 'info');
        return;
    }
    const snapshot = undoStack.pop();
    gameState = snapshot.gameState;
    battingStats = snapshot.battingStats;
    pitchingStats = snapshot.pitchingStats;
    opposingPitchingStats = snapshot.opposingPitchingStats || { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, stolenBasesAllowed: 0 };
    saveGameState();
    renderGameUI();
    showToast('↩️ Undo successful.', 'info');
}

// ========================================
// NEW GAME
// ========================================

async function startNewGame() {
    const confirmed = await showConfirm(
        'New Game',
        'Start a new game? This will clear all current game data.',
        []
    );
    if (!confirmed) return;

    // Preserve opponent info and team selection before reset
    const savedOpponentName = gameState.opposingTeamName;
    const savedOpponentPitcherNumber = gameState.opposingPitcherNumber;
    const savedOpponentPitcherName = gameState.opposingPitcherName;
    const savedOurTeam = gameState.ourTeam;

    resetGameState();

    // Restore opponent info and team selection
    gameState.opposingTeamName = savedOpponentName;
    gameState.opposingPitcherNumber = savedOpponentPitcherNumber;
    gameState.opposingPitcherName = savedOpponentPitcherName;
    gameState.ourTeam = savedOurTeam;

    // Set batting order from the Batting Order tab first, then fall back to lineup, then all players
    // The Batting Order tab is the primary source of truth for the batting order
    let gameLineup = [];

    // Use the saved batting order from the Batting Order tab as the primary source
    if (battingOrder.length > 0) {
        gameLineup = [...battingOrder];
    }

    // If no batting order available, fall back to the lineup (inning 1 field players)
    if (gameLineup.length === 0 && playerLineup && Object.keys(playerLineup).length > 0) {
        for (const [pid, data] of Object.entries(playerLineup)) {
            if (data.positions && data.positions[0] && data.positions[0] !== 'Bench') {
                gameLineup.push(parseInt(pid));
            }
        }
        // If we don't have enough players from lineup, add benched/available players
        if (gameLineup.length < 9) {
            for (const [pid, data] of Object.entries(playerLineup)) {
                if (!gameLineup.includes(parseInt(pid)) && data.positions && data.positions[0]) {
                    gameLineup.push(parseInt(pid));
                }
            }
        }
    }

    // If still no order, use all available players
    if (gameLineup.length === 0) {
        gameLineup = players.map(p => p.id);
    }

    gameState.currentBattingOrder = gameLineup;

    // Filter out unavailable players
    gameState.currentBattingOrder = gameState.currentBattingOrder.filter(id => playerAvailability[id]);

    // Initialize batting stats for all players
    players.forEach(p => {
        battingStats[p.id] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
    });

    // Initialize pitching stats for all players
    players.forEach(p => {
        pitchingStats[p.id] = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, inningsPitched: 0, stolenBasesAllowed: 0 };
    });

    // Set current pitcher from lineup if available
    // First, look for pitcher in inning 1 (index 0) — this is the primary pitcher
    for (const [pid, data] of Object.entries(playerLineup)) {
        if (data.positions && data.positions[0] === 'Pitcher') {
            gameState.currentPitcherId = parseInt(pid);
            break;
        }
    }
    // If no inning 1 pitcher, search other innings as fallback
    if (!gameState.currentPitcherId) {
        for (const [pid, data] of Object.entries(playerLineup)) {
            if (!data.positions) continue;
            for (let i = 1; i < NUM_INNINGS; i++) {
                if (data.positions[i] === 'Pitcher') {
                    gameState.currentPitcherId = parseInt(pid);
                    break;
                }
            }
            if (gameState.currentPitcherId) break;
        }
    }

    // Ensure the current pitcher is included in the batting order
    if (gameState.currentPitcherId && !gameState.currentBattingOrder.includes(gameState.currentPitcherId)) {
        gameState.currentBattingOrder.push(gameState.currentPitcherId);
    }

    gameState.gameStarted = true;
    gameState.startTime = new Date().toISOString();
    gameState.currentInning = 1;
    gameState.halfInning = 'top';
    gameState.outs = 0;
    gameState.count = { balls: 0, strikes: 0, fouls: 0 };
    gameState.bases = { first: null, second: null, third: null };
    gameState.currentBatterIndex = 0;
    gameState.currentBatterId = gameState.currentBattingOrder[0] || null;
    gameState.runsPerHalfInning = { top: [], bottom: [] };
    gameState.gameLog = [`Game started - ${getInningLabel()}`];

    // Sync the game batting order back to the main batting order so the Batting Order tab stays in sync
    if (typeof battingOrder !== 'undefined') {
        battingOrder = [...gameState.currentBattingOrder];
    }

    // Save the batting order so it persists after page refresh
    if (typeof saveBattingOrder === 'function') {
        saveBattingOrder();
    }

    saveGameState();
    renderGameUI();
    showToast('New game started! Visitors bat first. Auto-swap when opponent reaches 4 runs.', 'success');
}

// ========================================
// END INNING
// ========================================

function checkMercyRule() {
    // Little League mercy rule: 10+ run lead after 4 innings (or 3.5 if home team leads)
    const homeScore = gameState.score.home.total;
    const visitorScore = gameState.score.visitors.total;
    const runDiff = Math.abs(homeScore - visitorScore);

    if (runDiff >= 10 && gameState.currentInning >= 4) {
        const leadingTeam = homeScore > visitorScore ? 'Home' : 'Visitor';
        gameState.gameLog.push(`🏁 Mercy rule invoked - ${leadingTeam} leads by ${runDiff} runs after ${gameState.currentInning} innings.`);
        endGame();
        return true;
    }
    return false;
}

function endInning() {
    pushHistory();

    // Clear bases
    gameState.bases = { first: null, second: null, third: null };

    // Capture the label of the half that just ended before switching.
    const endedLabel = getInningLabel();

    // Track if we were pitching the half that just ended (before switching)
    const weWerePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    // Switch half inning
    if (gameState.halfInning === 'top') {
      gameState.halfInning = 'bottom';
      gameState.gameLog.push(`End of ${endedLabel}`);
        // Check mercy rule before starting next half
      if (checkMercyRule()) {
          renderGameUI();
          return;
        }
      gameState.gameLog.push(`Start of ${getInningLabel()}`);
    } else {
      gameState.halfInning = 'top';
      gameState.currentInning++;
      if (gameState.currentInning > 6) {
          gameState.currentInning = 6;
          endGame();
          renderGameUI();
          return;
        }
      gameState.gameLog.push(`End of ${endedLabel}`);
        // Check mercy rule before starting next half
      if (checkMercyRule()) {
          renderGameUI();
          return;
        }
      gameState.gameLog.push(`Start of ${getInningLabel()}`);
    }

    gameState.outs = 0;
    gameState.count = { balls: 0, strikes: 0, fouls: 0 };

    // Increment innings pitched for our pitcher if we were pitching the half that just ended
    if (weWerePitching && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].inningsPitched += 0.5;
    }

    // Do NOT advance the batter when an inning ends.
    // The batting order continues seamlessly across innings;
    // the batter only advances when they complete an actual at-bat.
    gameState.currentBatterId = gameState.currentBattingOrder[gameState.currentBatterIndex] || null;

    saveGameState();
    renderGameUI();
    showToast(`⏭ ${getInningLabel()}`, 'info');
}

// ========================================
// END GAME
// ========================================

function endGame() {
    // Stop any playing walkout song / announcer and cancel the cross-fade when the game ends
    if (typeof cancelCrossFade === 'function') cancelCrossFade();
    if (typeof announcerPlayer !== 'undefined' && announcerPlayer) {
        announcerPlayer.pause();
        announcerPlayer.currentTime = 0;
     }

    gameState.gameStarted = false;
    gameState.endTime = new Date().toISOString();
    gameState.gameLog.push('Game over!');

    // Sync the final batting order back to the main batting order so it persists
    if (typeof battingOrder !== 'undefined') {
        battingOrder = [...gameState.currentBattingOrder];
    }
    if (typeof saveBattingOrder === 'function') {
        saveBattingOrder();
    }

    saveGameState();
    renderGameUI();
    renderSummary();
    showToast('🏁 Game ended!', 'success');
}

// ========================================
// BATTER MANAGEMENT
// ========================================

function advanceBatter() {
    gameState.currentBatterIndex++;
    if (gameState.currentBatterIndex >= gameState.currentBattingOrder.length) {
        gameState.currentBatterIndex = 0;
    }
}

function getCurrentBatter() {
    if (!gameState.gameStarted || gameState.currentBattingOrder.length === 0) return null;
    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    return getPlayerById(batterId);
}

// ========================================
// SCORING
// ========================================

// Helper: track runs in runsPerHalfInning for the runs-this-half indicator
function trackRunsInHalf(count) {
    const halfInning = gameState.halfInning;
    if (!gameState.runsPerHalfInning[halfInning]) {
        gameState.runsPerHalfInning[halfInning] = [];
    }
    gameState.runsPerHalfInning[halfInning][gameState.currentInning - 1] =
        (gameState.runsPerHalfInning[halfInning][gameState.currentInning - 1] || 0) + count;
}

// Helper: add runs with hard cap at runsThreshold per half-inning
function addRunsCapped(team, count, reason) {
    const runsSoFar = getRunsThisHalf();
    const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
    const actualRuns = Math.min(count, runsAllowed);

    if (actualRuns <= 0) return 0;

    gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
    gameState.score[team].total += actualRuns;
    trackRunsInHalf(actualRuns);

    const teamLabel = team === 'home' ? 'Home' : 'Visitor';
    gameState.gameLog.push(`${getInningLabel()}: ${teamLabel} team scores ${actualRuns} run(s)${reason ? ' - ' + reason : ''}`);

    return actualRuns;
}

function getRunsThisHalf() {
    const halfInningIdx = gameState.currentInning - 1;
    return gameState.runsPerHalfInning[gameState.halfInning]?.[halfInningIdx] || 0;
}

function checkAutoSwap() {
    const runsThisHalf = getRunsThisHalf();

    if (runsThisHalf >= gameState.runsThreshold) {
        const teamLabel = gameState.halfInning === 'top' ? 'Visitor' : 'Home';
        gameState.gameLog.push(`${getInningLabel()}: ⚠️ ${teamLabel} reached ${runsThisHalf} runs - auto-swap!`);

        // Clear bases and outs
        gameState.bases = { first: null, second: null, third: null };
        gameState.outs = 0;
        gameState.count = { balls: 0, strikes: 0, fouls: 0 };

        // Switch half-inning (increment inning when going from bottom to top)
        if (gameState.halfInning === 'bottom') {
            gameState.halfInning = 'top';
            gameState.currentInning++;
            if (gameState.currentInning > 6) {
                gameState.currentInning = 6;
                endGame();
                return true;
            }
        } else {
            gameState.halfInning = 'bottom';
        }

        // Batting order continues seamlessly — do not reset the batter index
        gameState.currentBatterId = gameState.currentBattingOrder[gameState.currentBatterIndex] || null;
        gameState.gameLog.push(`${getInningLabel()}: ${getTeamName()} team now batting`);
        return true;
    }
    return false;
}

function addRuns(team, count) {
    pushHistory();

    // Cap runs at the threshold (4) per half-inning
    const runsSoFar = getRunsThisHalf();
    const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
    const actualRuns = Math.min(count, runsAllowed);

    if (actualRuns <= 0) {
        gameState.gameLog.push(`${getInningLabel()}: Run(s) ignored - half-inning limit reached`);
        checkAutoSwap();
        saveGameState();
        renderGameUI();
        return;
    }

    gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
    gameState.score[team].total += actualRuns;

    // Track runs for this half-inning
    trackRunsInHalf(actualRuns);

    const teamLabel = team === 'home' ? 'Home' : 'Visitor';
    gameState.gameLog.push(`${getInningLabel()}: ${teamLabel} team scores ${actualRuns} run(s)`);

    checkAutoSwap();

    saveGameState();
    renderGameUI();
}

// ========================================
// COUNT & AT-BAT LOGIC
// ========================================

function resetCount() {
    gameState.count = { balls: 0, strikes: 0, fouls: 0 };
}

function processBall() {
    if (!gameState.gameStarted) return;
    // A ball that doesn't end the at-bat should be undoable, like a strike/walk.
    if (gameState.count.balls + 1 < 4) pushHistory();
    gameState.count.balls++;
    gameState.pitchCount++;
    // Count pitches based on which team is pitching
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    // Our team pitcher stats
    if (weArePitching && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        pitchingStats[gameState.currentPitcherId].balls++;
        checkPitcherLimit();
    }
    // Opponent pitcher stats (when we are batting - they are pitching)
    if (!weArePitching) {
        opposingPitchingStats.pitchesThrown++;
        opposingPitchingStats.balls++;
    }

    if (gameState.count.balls >= 4) {
        // Walk!
        processWalk();
        return;
    }

    gameState.gameLog.push(`${getInningLabel()}: Ball ${gameState.count.balls}-${gameState.count.strikes}`);
    saveGameState();
    renderGameUI();
}

function processStrike() {
    if (!gameState.gameStarted) return;
     // A strike that doesn't end the at-bat should be undoable, like a ball/walk.
    if (gameState.count.strikes + 1 < 3) pushHistory();
    gameState.count.strikes++;
    gameState.pitchCount++;
    gameState.strikeCount++;
    // Count pitches based on which team is pitching
    const weArePitchingStrike = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                             || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    // Our team pitcher stats
    if (weArePitchingStrike && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        pitchingStats[gameState.currentPitcherId].strikes++;
        checkPitcherLimit();
    }
    // Opponent pitcher stats (when we are batting - they are pitching)
    if (!weArePitchingStrike) {
        opposingPitchingStats.pitchesThrown++;
        opposingPitchingStats.strikes++;
    }

    if (gameState.count.strikes >= 3) {
        // Strikeout!
        processStrikeout();
        return;
    }

    gameState.gameLog.push(`${getInningLabel()}: Strike ${gameState.count.balls}-${gameState.count.strikes}`);
    saveGameState();
    renderGameUI();
}

function processFoul() {
    if (!gameState.gameStarted) return;
    pushHistory();
    // Count pitches based on which team is pitching
    const weArePitchingFoul = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                           || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    // Our team pitcher stats
    if (weArePitchingFoul && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        if (gameState.count.strikes < 2) {
            pitchingStats[gameState.currentPitcherId].strikes++;
        }
        checkPitcherLimit();
    }
    // Opponent pitcher stats (when we are batting - they are pitching)
    if (!weArePitchingFoul) {
        opposingPitchingStats.pitchesThrown++;
        if (gameState.count.strikes < 2) opposingPitchingStats.strikes++;
    }

    // Foul only adds a strike if strikes < 2
    if (gameState.count.strikes < 2) {
        gameState.count.fouls++;
        gameState.count.strikes++; // Foul counts as strike unless already 2 strikes
        gameState.pitchCount++;
        gameState.strikeCount++;

        if (gameState.count.strikes >= 3) {
            processStrikeout();
            return;
        }
    } else {
        // With 2 strikes, foul just adds to foul count (doesn't add another strike)
        gameState.count.fouls++;
        gameState.pitchCount++;
    }

    gameState.gameLog.push(`${getInningLabel()}: Foul (${gameState.count.fouls})`);
    saveGameState();
    renderGameUI();
}

function processWalk() {
    pushHistory();

    // When our team is pitching, the batter is the opponent — don't credit our players
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    if (weArePitching) {
        // Opponent walked — track on our pitcher's stats, don't put our players on base
        gameState.pitchCount++;
        if (gameState.currentPitcherId) {
            pitchingStats[gameState.currentPitcherId].pitchesThrown++;
            pitchingStats[gameState.currentPitcherId].balls++;
            pitchingStats[gameState.currentPitcherId].walks++;
            checkPitcherLimit();
        }

        // Opponent runners advance on walk (forced only)
        let logMsg = `${getInningLabel()}: Walk (opponent)`;
        const isOutingTeam = gameState.halfInning === 'top' ? 'visitors' : 'home';
        let scored = 0;

        if (gameState.bases.third && gameState.bases.second && gameState.bases.first) {
            // Bases loaded - runner from 3rd scores
            const runsSoFar = getRunsThisHalf();
            const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
            const actualRuns = Math.min(1, runsAllowed);
            if (actualRuns > 0) {
                gameState.score[isOutingTeam].innings[gameState.currentInning - 1] += actualRuns;
                gameState.score[isOutingTeam].total += actualRuns;
                trackRunsInHalf(actualRuns);
                if (gameState.currentPitcherId) {
                    pitchingStats[gameState.currentPitcherId].runsAllowed++;
                }
                scored++;
                logMsg += ', opponent runner scores';
            } else {
                logMsg += ' (run ignored - limit reached)';
            }
        }

        // Advance forced runners: batter to 1st, 1st to 2nd, 2nd to 3rd
        const newBases = { first: 'OPP', second: null, third: null };
        if (gameState.bases.first) {
            newBases.second = gameState.bases.first;
        }
        if (gameState.bases.second) {
            newBases.third = gameState.bases.second;
        }
        gameState.bases = newBases;

        gameState.gameLog.push(logMsg);
        resetCount();
        // Only advance our batter when we are batting; opponent batting should not move our order
        if (!weArePitching) {
            advanceBatter();
        }
        checkAutoSwap();
        saveGameState();
        renderGameUI();
        return;
    }

    // --- Our team is batting ---
    gameState.pitchCount++;
    opposingPitchingStats.pitchesThrown++;
    opposingPitchingStats.balls++;

    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    // Walk credited to opponent pitcher (charged to their stats)
    opposingPitchingStats.walks++;

    // Walk forces ALL runners forward (loaded bases = run scores)
    let logMsg = `${getInningLabel()}: Walk`;
    let rbis = 0;

    // Check if runner on 3rd scores
    if (gameState.bases.third) {
       const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
       const runsSoFar = getRunsThisHalf();
       const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
       const actualRuns = Math.min(1, runsAllowed);
       if (actualRuns > 0) {
           gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
           gameState.score[team].total += actualRuns;
           trackRunsInHalf(actualRuns);
           // Only credit the RBI when the run actually scores (not when it is capped by the half-inning limit)
           rbis = 1;
           logMsg += ' (runner scores)';
        } else {
           logMsg += ' (run ignored - limit reached)';
        }
    }

    // Force all runners forward (only forced runners advance on a walk)
    if (gameState.bases.first) {
        if (gameState.bases.second) {
            if (gameState.bases.third) {
                // Bases loaded - runner from 3rd scores (already handled above)
            }
            gameState.bases.third = gameState.bases.second;
        }
        gameState.bases.second = gameState.bases.first;
    }
    gameState.bases.first = batterId;

    // Update batting stats
    if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0 };
    battingStats[batterId].walks++;
    battingStats[batterId].rbis += rbis;

    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitching) {
        advanceBatter();
    }
    checkAutoSwap();
    saveGameState();
    renderGameUI();
}

function processStrikeout() {
    pushHistory();
    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    const weArePitchingSO = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                         || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    // Count pitch for strikeout (the final strike)
    gameState.pitchCount++;
    gameState.strikeCount++;
    // Strikeout credited to our pitcher only when we are on the mound
    if (weArePitchingSO && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        pitchingStats[gameState.currentPitcherId].strikes++;
        pitchingStats[gameState.currentPitcherId].strikeouts++;
        checkPitcherLimit();
    }
    // Opponent pitcher gets the K only when we are batting (they are pitching)
    if (!weArePitchingSO) {
        opposingPitchingStats.pitchesThrown++;
        opposingPitchingStats.strikes++;
        opposingPitchingStats.strikeouts++;
    }

    gameState.outs++;
    // Only credit batting stats to our players when we are batting
    if (!weArePitchingSO) {
        if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
        battingStats[batterId].strikeouts++;
        battingStats[batterId].outs++;
        battingStats[batterId].atBats++;
    }

    gameState.gameLog.push(`${getInningLabel()}: Strikeout!`);

    if (gameState.outs >= 3) {
        gameState.gameLog.push(`3 outs!`);
        endInning();
        return;
    }

    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitchingSO) {
        advanceBatter();
    }
    saveGameState();
    renderGameUI();
}

function processGroundOut() {
    pushHistory();
    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    const weArePitchingGO = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                         || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    gameState.outs++;
    // Only credit batting stats to our players when we are batting
    if (!weArePitchingGO) {
        if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
        battingStats[batterId].outs++;
        battingStats[batterId].atBats++;
    }

    // Count pitch for ground out
    gameState.pitchCount++;
    if (weArePitchingGO && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        checkPitcherLimit();
    }
    if (!weArePitchingGO) {
        opposingPitchingStats.pitchesThrown++;
    }

    // Force runners to advance one base (force play)
    let logMsg = `${getInningLabel()}: Ground out`;
    if (gameState.bases.first) {
        if (gameState.bases.second) {
            if (gameState.bases.third) {
                // Bases loaded - force at 2nd, runner on 3rd stays
                gameState.bases.second = gameState.bases.first;
                gameState.bases.first = null;
                logMsg += ' (runner on 3rd holds)';
            } else {
                // Force at 1st, runner on 2nd goes to 3rd
                gameState.bases.third = gameState.bases.second;
                gameState.bases.second = gameState.bases.first;
                gameState.bases.first = null;
                logMsg += ' - runners advance';
            }
        } else {
            // Force at 1st only
            gameState.bases.second = gameState.bases.first;
            gameState.bases.first = null;
            logMsg += ' - runner from 1st to 2nd';
        }
    }
    gameState.gameLog.push(logMsg);

    if (gameState.outs >= 3) {
        gameState.gameLog.push(`3 outs!`);
        endInning();
        return;
    }

    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitchingGO) {
        advanceBatter();
    }
    saveGameState();
    renderGameUI();
}

function processFlyOut() {
    pushHistory();
    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    const weArePitchingFO = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                         || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    gameState.outs++;
    // Only credit batting stats to our players when we are batting
    if (!weArePitchingFO) {
        if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
        battingStats[batterId].outs++;
        battingStats[batterId].atBats++;
    }

    // Count pitch for fly out
    gameState.pitchCount++;
    if (weArePitchingFO && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        checkPitcherLimit();
    }
    if (!weArePitchingFO) {
        opposingPitchingStats.pitchesThrown++;
    }

    gameState.gameLog.push(`${getInningLabel()}: Fly out`);

    if (gameState.outs >= 3) {
        gameState.gameLog.push(`3 outs!`);
        endInning();
        return;
    }

    // Runners remain on base after fly out (can tag up and advance)
    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitchingFO) {
        advanceBatter();
    }
    saveGameState();
    renderGameUI();
}

function processError() {
    pushHistory();

    // Count pitch for error
    gameState.pitchCount++;
    const weArePitchingErr = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                          || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    if (weArePitchingErr && gameState.currentPitcherId) {
        pitchingStats[gameState.currentPitcherId].pitchesThrown++;
        checkPitcherLimit();
    }
    if (!weArePitchingErr) {
        opposingPitchingStats.pitchesThrown++;
    }

    // When our team is pitching, the batter is the opponent — don't credit our players
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    if (weArePitching) {
        // Opponent error — runners advance on error, but don't put our players on base
        let scored = 0;
        let logMsg = `${getInningLabel()}: Error (opponent) - batter safe`;

        if (gameState.bases.third) {
            const isOutingTeam = gameState.halfInning === 'top' ? 'visitors' : 'home';
            const runsSoFar = getRunsThisHalf();
            const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
            const actualRuns = Math.min(1, runsAllowed);
            if (actualRuns > 0) {
                gameState.score[isOutingTeam].innings[gameState.currentInning - 1] += actualRuns;
                gameState.score[isOutingTeam].total += actualRuns;
                trackRunsInHalf(actualRuns);
                scored++;
                if (gameState.currentPitcherId) {
                    pitchingStats[gameState.currentPitcherId].runsAllowed++;
                }
                logMsg += ', opponent runner from 3rd scores';
            } else {
                logMsg += ' (run ignored - limit reached)';
            }
        }
        if (gameState.bases.second) {
            logMsg += ', opponent runner from 2nd to 3rd';
        }
        if (gameState.bases.first) {
            logMsg += ', opponent runner from 1st to 2nd';
        }

        // Advance opponent runners on error (all advance 1 base), batter to 1st
        const newBases = { first: 'OPP', second: null, third: null };
        if (gameState.bases.first) {
            newBases.second = gameState.bases.first;
        }
        if (gameState.bases.second) {
            newBases.third = gameState.bases.second;
        }
        gameState.bases = newBases;

        gameState.gameLog.push(logMsg);
        resetCount();
        // Only advance our batter when we are batting; opponent batting should not move our order
        if (!weArePitching) {
            advanceBatter();
        }
        checkAutoSwap();
        saveGameState();
        renderGameUI();
        return;
    }

    // --- Our team is batting ---
    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
    battingStats[batterId].atBats++;

    // Batter safe to first, runners advance 1 base
    // Move existing runners forward
    let scored = 0;
    let logMsg = `${getInningLabel()}: Error - batter to 1st`;

    if (gameState.bases.third) {
        scored++;
        logMsg += ', runner from 3rd scores';
        gameState.bases.third = null;
    }
    if (gameState.bases.second) {
        gameState.bases.third = gameState.bases.second;
        gameState.bases.second = null;
        logMsg += ', runner from 2nd to 3rd';
    }
    if (gameState.bases.first) {
        gameState.bases.second = gameState.bases.first;
        gameState.bases.first = null;
        logMsg += ', runner from 1st to 2nd';
    }

    gameState.bases.first = batterId;

    // Cap runs at threshold per half-inning
    const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
    const runsSoFar = getRunsThisHalf();
    const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
    const actualRuns = Math.min(scored, runsAllowed);

    if (actualRuns > 0) {
        gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
        gameState.score[team].total += actualRuns;
        trackRunsInHalf(actualRuns);
    }
    if (actualRuns < scored) {
        logMsg += ` (${scored - actualRuns} run(s) ignored - limit reached)`;
    }

    gameState.gameLog.push(logMsg);

    // Update RBIs
    if (actualRuns > 0) {
        battingStats[batterId].rbis += actualRuns;
    }

    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitchingErr) {
        advanceBatter();
    }
    saveGameState();
    renderGameUI();
}

function processHit(hitType) {
    // hitType: 'single', 'double', 'triple', 'hr'
    pushHistory();

    // When our team is pitching, the batter is the opponent — don't credit our players
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    if (weArePitching) {
        // Opponent hit — track on our pitcher stats and opponent pitcher stats
        const hitDistances = { single: 1, double: 2, triple: 3, hr: 4 };
        const distance = hitDistances[hitType];

        let scored = 0;
        let logMsg = `${getInningLabel()}: ${hitType} (opponent)`;

        // Track hits allowed and pitch thrown for our pitcher
        gameState.pitchCount++;
        if (gameState.currentPitcherId) {
            pitchingStats[gameState.currentPitcherId].pitchesThrown++;
            pitchingStats[gameState.currentPitcherId].hitsAllowed++;
            checkPitcherLimit();
        }

        // Opponent runners advance - cap runs at threshold per half-inning
        const isOutingTeam = gameState.halfInning === 'top' ? 'visitors' : 'home';
        let potentialRuns = 0;

        // Get current opponent runners
        const runners = [];
        if (gameState.bases.third) runners.push({ base: 3, player: gameState.bases.third });
        if (gameState.bases.second) runners.push({ base: 2, player: gameState.bases.second });
        if (gameState.bases.first) runners.push({ base: 1, player: gameState.bases.first });

        if (hitType === 'hr') {
            potentialRuns = (gameState.bases.third ? 1 : 0) + (gameState.bases.second ? 1 : 0) + (gameState.bases.first ? 1 : 0) + 1;
            logMsg = `${getInningLabel()}: *** HOME RUN! (opponent) ***`;
        } else {
            if (gameState.bases.third) potentialRuns++;
            if (gameState.bases.second && distance >= 2) potentialRuns++;
            if (gameState.bases.first && distance >= 3) potentialRuns++;
        }

        const runsSoFar = getRunsThisHalf();
        const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
        const actualRuns = Math.min(potentialRuns, runsAllowed);

        if (actualRuns > 0) {
            gameState.score[isOutingTeam].innings[gameState.currentInning - 1] += actualRuns;
            gameState.score[isOutingTeam].total += actualRuns;
            trackRunsInHalf(actualRuns);
            scored = actualRuns;
            if (gameState.currentPitcherId) {
                pitchingStats[gameState.currentPitcherId].runsAllowed += actualRuns;
            }
        } else {
            logMsg += ' (runs ignored - limit reached)';
        }

        gameState.gameLog.push(logMsg);

        // Place remaining opponent runners after hit
        const newBases = { first: null, second: null, third: null };
        if (hitType === 'hr') {
            // Home run clears all bases
        } else {
            for (const runner of runners) {
                const finalBase = runner.base + distance;
                if (finalBase < 4) {
                    const baseName = { 1: 'first', 2: 'second', 3: 'third' }[finalBase];
                    newBases[baseName] = runner.player;
                }
            }
            // Place batter on base
            const batterBaseName = { 1: 'first', 2: 'second', 3: 'third' }[distance];
            newBases[batterBaseName] = 'OPP';
        }
        gameState.bases = newBases;

        resetCount();
        // Only advance our batter when we are batting; opponent batting should not move our order
        if (!weArePitching) {
            advanceBatter();
        }
        checkAutoSwap();
        saveGameState();
        renderGameUI();
        return;
    }

    // --- Our team is batting ---
    gameState.pitchCount++;
    opposingPitchingStats.pitchesThrown++;

    const batterId = gameState.currentBattingOrder[gameState.currentBatterIndex];
    if (!battingStats[batterId]) battingStats[batterId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };

    const hitDistances = { single: 1, double: 2, triple: 3, hr: 4 };
    const distance = hitDistances[hitType];

    // Get current runners
    const runners = [];
    if (gameState.bases.third) runners.push({ base: 3, player: gameState.bases.third });
    if (gameState.bases.second) runners.push({ base: 2, player: gameState.bases.second });
    if (gameState.bases.first) runners.push({ base: 1, player: gameState.bases.first });

    let scored = 0;
    let logMsg = `${getInningLabel()}: ${hitType}`;

    // Process runners from highest base down
    for (const runner of runners) {
        const finalBase = runner.base + distance;
        if (finalBase >= 4) {
            scored++;
        } else {
            // Store runner at new base
            runner.finalBase = finalBase;
        }
    }

    // Handle batter scoring on HR
    if (hitType === 'hr') {
        scored++; // Batter scores too
        logMsg = `${getInningLabel()}: *** HOME RUN! ***`;
    }

    // Cap runs at threshold per half-inning
    const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
    const runsSoFar = getRunsThisHalf();
    const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
    const actualRuns = Math.min(scored, runsAllowed);

    // Score actual runs (from highest base runners first, then batter on HR)
    let runsToScore = actualRuns;
    for (const runner of runners) {
        if (runsToScore <= 0) break;
        if (runner.finalBase === undefined) {
            gameState.score[team].innings[gameState.currentInning - 1]++;
            gameState.score[team].total++;
            trackRunsInHalf(1);
            if (!battingStats[runner.player]) battingStats[runner.player] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
            battingStats[runner.player].runs++;
            logMsg += `, ${getPlayerName(runner.player)} scores`;
            runsToScore--;
        }
    }
    // Batter scores on HR if still have runs left
    if (hitType === 'hr' && runsToScore > 0) {
        gameState.score[team].innings[gameState.currentInning - 1]++;
        gameState.score[team].total++;
        trackRunsInHalf(1);
        battingStats[batterId].runs++;
        runsToScore--;
    }
    if (actualRuns < scored) {
        logMsg += ` (${scored - actualRuns} run(s) ignored - limit reached)`;
    }

    // Place remaining runners
    const newBases = { first: null, second: null, third: null };
    for (const runner of runners) {
        if (runner.finalBase !== undefined) {
            const baseName = { 1: 'first', 2: 'second', 3: 'third' }[runner.finalBase];
            newBases[baseName] = runner.player;
        }
    }

    // Handle batter placement
    if (hitType === 'hr') {
        // Clear all bases
        newBases.first = null;
        newBases.second = null;
        newBases.third = null;
    } else {
        // Clear bases up to batter's destination
        for (let i = 1; i < distance; i++) {
            const baseName = { 1: 'first', 2: 'second', 3: 'third' }[i];
            newBases[baseName] = null;
        }
        // Place batter
        const batterBaseName = { 1: 'first', 2: 'second', 3: 'third' }[distance];
        newBases[batterBaseName] = batterId;
    }

    gameState.bases = newBases;

    // Update batting stats
    battingStats[batterId].atBats++;
    battingStats[batterId].totalHits++;
    if (hitType === 'single') battingStats[batterId].singles++;
    if (hitType === 'double') battingStats[batterId].doubles++;
    if (hitType === 'triple') battingStats[batterId].triples++;
    if (hitType === 'hr') {
        battingStats[batterId].homeRuns++;
    }
    battingStats[batterId].rbis += actualRuns;

    gameState.gameLog.push(logMsg);

    resetCount();
    // Only advance our batter when we are batting; opponent batting should not move our order
    if (!weArePitching) {
        advanceBatter();
    }
    checkAutoSwap();
    saveGameState();
    renderGameUI();
}

// ========================================
// SUBSTITUTIONS
// ========================================

function substitutePlayer(playerInId, playerOutId) {
    pushHistory();

    const playerInIdNum = parseInt(playerInId);
    const playerOutIdNum = parseInt(playerOutId);

    // Remove playerOutId from batting order
    const outIdx = gameState.currentBattingOrder.indexOf(playerOutIdNum);
    if (outIdx !== -1) {
        gameState.currentBattingOrder.splice(outIdx, 1);
    }

    // Add playerInId at the removed player's position (or end if not found)
    if (outIdx !== -1 && outIdx < gameState.currentBattingOrder.length) {
        gameState.currentBattingOrder.splice(outIdx, 0, playerInIdNum);
    } else {
        gameState.currentBattingOrder.push(playerInIdNum);
    }

    // If the player going out was the current batter, update currentBatterId
    if (gameState.currentBatterId === playerOutIdNum) {
        gameState.currentBatterId = playerInIdNum;
    }

    // Adjust currentBatterIndex if needed
    const newIdx = gameState.currentBattingOrder.indexOf(gameState.currentBatterId);
    if (newIdx !== -1) {
        gameState.currentBatterIndex = newIdx;
    }

    gameState.substitutions.push({
        inning: gameState.currentInning,
        half: gameState.halfInning,
        playerIn: playerInIdNum,
        playerOut: playerOutIdNum,
        time: new Date().toISOString()
    });

    // Initialize stats for new player
    if (!battingStats[playerInIdNum]) {
        battingStats[playerInIdNum] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
    }
    if (!pitchingStats[playerInIdNum]) {
        pitchingStats[playerInIdNum] = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, inningsPitched: 0, stolenBasesAllowed: 0 };
    }

    gameState.gameLog.push(`${getInningLabel()}: Sub - #${getPlayerById(playerInIdNum)?.number || '?'} ${getPlayerById(playerInIdNum)?.name || '?'} in for #${getPlayerById(playerOutIdNum)?.number || '?'} ${getPlayerById(playerOutIdNum)?.name || '?'}`);

    // Sync back to the main batting order so the Batting Order tab stays in sync
    if (typeof battingOrder !== 'undefined') {
        battingOrder = [...gameState.currentBattingOrder];
    }

    // Save batting order to localStorage so it persists on refresh
    if (typeof saveBattingOrder === 'function') {
        saveBattingOrder();
    }

    saveGameState();
    renderGameUI();
    showToast(`Sub: ${getPlayerById(playerInIdNum)?.name} for ${getPlayerById(playerOutIdNum)?.name}`, 'success');
}

// ========================================
// SUBSTITUTION MODAL
// ========================================

function openSubstitutionModal() {
    const modal = document.getElementById('substitutionModal');
    const inSelect = document.getElementById('subPlayerInSelect');
    const outSelect = document.getElementById('subPlayerOutSelect');
    if (!modal || !inSelect || !outSelect) return;

    const availablePlayers = players.filter(p => playerAvailability[p.id]);
    const gamePlayers = gameState.currentBattingOrder;

    // Players available to sub in (not in game)
    const notInGame = availablePlayers.filter(p => !gamePlayers.includes(p.id));
    inSelect.innerHTML = '<option value="">-- Select player coming in --</option>' +
        notInGame.map(p => `<option value="${escapeHtml(p.id)}">#${escapeHtml(p.number)} ${escapeHtml(p.name)}</option>`).join('');

    // Players in the game (to sub out)
    const inGame = availablePlayers.filter(p => gamePlayers.includes(p.id));
    outSelect.innerHTML = '<option value="">-- Select player going out --</option>' +
        inGame.map(p => `<option value="${escapeHtml(p.id)}">#${escapeHtml(p.number)} ${escapeHtml(p.name)}</option>`).join('');

    document.getElementById('subModalNote').textContent = '';
    modal.style.display = 'block';
}

function closeSubstitutionModal() {
    const modal = document.getElementById('substitutionModal');
    if (modal) modal.style.display = 'none';
}

function confirmSubstitution() {
    const inSelect = document.getElementById('subPlayerInSelect');
    const outSelect = document.getElementById('subPlayerOutSelect');
    if (!inSelect || !outSelect) return;

    const playerInId = parseInt(inSelect.value);
    const playerOutId = parseInt(outSelect.value);

    if (!playerInId || !playerOutId) {
        showToast('Please select both players for the substitution.', 'warning');
        return;
    }
    if (playerInId === playerOutId) {
        showToast('Cannot substitute a player for themselves.', 'warning');
        return;
    }

    substitutePlayer(playerInId, playerOutId);
    closeSubstitutionModal();
}

// ========================================
// BATTING ORDER EDITING
// ========================================

let battingOrderEditTemp = [];

function openBattingOrderModal() {
    const modal = document.getElementById('battingOrderModal');
    if (!modal) return;

    battingOrderEditTemp = [...gameState.currentBattingOrder];
    renderBattingOrderEditList();
    modal.style.display = 'block';
}

function closeBattingOrderModal() {
    const modal = document.getElementById('battingOrderModal');
    if (modal) modal.style.display = 'none';
    battingOrderEditTemp = [];
}

function renderBattingOrderEditList() {
    const list = document.getElementById('battingOrderEditList');
    if (!list) return;

    list.innerHTML = battingOrderEditTemp.map((playerId, index) => {
        const player = getPlayerById(playerId);
        const isCurrent = playerId === gameState.currentBatterId;
        return `
            <div class="batting-order-edit-item ${isCurrent ? 'current-batter' : ''}" data-index="${index}">
                <span class="bo-edit-number">${index + 1}.</span>
                <span class="bo-edit-name">${player ? `#${escapeHtml(player.number)} ${escapeHtml(player.name)}` : 'Unknown'}</span>
                ${isCurrent ? '<span class="bo-edit-badge">🏏 Current</span>' : ''}
                <div class="bo-edit-controls">
                    <button class="bo-edit-btn" onclick="moveBatterUp(${index})" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="bo-edit-btn" onclick="moveBatterDown(${index})" ${index === battingOrderEditTemp.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            </div>
        `;
    }).join('');
}

function moveBatterUp(index) {
    if (index <= 0) return;
    const temp = battingOrderEditTemp[index];
    battingOrderEditTemp[index] = battingOrderEditTemp[index - 1];
    battingOrderEditTemp[index - 1] = temp;
    renderBattingOrderEditList();
}

function moveBatterDown(index) {
    if (index >= battingOrderEditTemp.length - 1) return;
    const temp = battingOrderEditTemp[index];
    battingOrderEditTemp[index] = battingOrderEditTemp[index + 1];
    battingOrderEditTemp[index + 1] = temp;
    renderBattingOrderEditList();
}

function saveBattingOrderChanges() {
    pushHistory();

    // Find where the current batter ended up
    const newCurrentBatterIndex = battingOrderEditTemp.indexOf(gameState.currentBatterId);

    gameState.currentBattingOrder = [...battingOrderEditTemp];

    // Update current batter index to match new position
    if (newCurrentBatterIndex !== -1) {
        gameState.currentBatterIndex = newCurrentBatterIndex;
    }

    // Sync back to the main batting order so the Batting Order tab stays in sync
    if (typeof battingOrder !== 'undefined') {
        battingOrder = [...gameState.currentBattingOrder];
    }

    // Save batting order to localStorage so it persists on refresh
    if (typeof saveBattingOrder === 'function') {
        saveBattingOrder();
    }

    gameState.gameLog.push(`${getInningLabel()}: Batting order updated`);

    saveGameState();
    renderGameUI();
    closeBattingOrderModal();
    showToast('Batting order updated!', 'success');
}

// ========================================
// SKIP / NEXT BATTER
// ========================================

function skipCurrentBatter() {
    if (!gameState.gameStarted) {
        showToast('No game in progress.', 'info');
        return;
    }

    pushHistory();

    const batter = getCurrentBatter();
    const batterName = batter ? `#${escapeHtml(batter.number)} ${escapeHtml(batter.name)}` : 'Unknown';

    gameState.gameLog.push(`${getInningLabel()}: ${batterName} skipped (moved to next batter)`);

    advanceBatter();
    resetCount();

    saveGameState();
    renderGameUI();
    showToast(`Skipped to next batter`, 'info');
}

function setNextBatter(playerId) {
    if (!gameState.gameStarted) {
        showToast('No game in progress.', 'info');
        return;
    }

    const pid = parseInt(playerId);
    const idx = gameState.currentBattingOrder.indexOf(pid);
    if (idx === -1) {
        showToast('Player is not in the batting order.', 'warning');
        return;
    }

    pushHistory();

    const player = getPlayerById(pid);
    const playerName = player ? `#${escapeHtml(player.number)} ${escapeHtml(player.name)}` : 'Unknown';

    gameState.currentBatterIndex = idx;
    gameState.currentBatterId = pid;
    resetCount();

    gameState.gameLog.push(`${getInningLabel()}: Next batter set to ${playerName}`);

    saveGameState();
    renderGameUI();
    showToast(`Next batter: ${playerName}`, 'info');
}

// ========================================
// GAME LOG
// ========================================

function addGameLogEntry(message) {
    if (gameState.gameStarted) {
        gameState.gameLog.push(`${getInningLabel()}: ${message}`);
        saveGameState();
    }
}

function editGameLogEntry(index, newMessage) {
    if (index >= 0 && index < gameState.gameLog.length) {
        pushHistory();
        gameState.gameLog[index] = newMessage;
        saveGameState();
        renderGameLog();
        showToast('Log entry edited.', 'info');
    }
}

function clearGameLog() {
    pushHistory();
    gameState.gameLog = [];
    saveGameState();
    renderGameLog();
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

function exportJSON() {
    const data = {
        gameState,
        battingStats,
        pitchingStats,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exported!', 'success');
}

function exportCSV() {
    // Player batting stats CSV
    let csv = 'Player,Number,AB,1B,2B,3B,HR,H,R,RBI,BB,K,SB,OB\n';
    players.forEach(p => {
        const s = battingStats[p.id] || { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 };
        const obp = (s.atBats + s.walks) > 0 ? ((s.totalHits + s.walks) / (s.atBats + s.walks)).toFixed(3) : '.000';
        csv += `${p.name},${p.number},${s.atBats},${s.singles},${s.doubles},${s.triples},${s.homeRuns},${s.totalHits},${s.runs},${s.rbis},${s.walks},${s.strikeouts},${s.stolenBases || 0},${obp}\n`;
    });

    // Team score
    csv += `\nTeam,Total,`;
    for (let i = 1; i <= 6; i++) {
        csv += `Inn${i},`;
    }
    csv += '\n';
    csv += `Home,${gameState.score.home.total},`;
    csv += gameState.score.home.innings.join(',') + '\n';
    csv += `Visitor,${gameState.score.visitors.total},`;
    csv += gameState.score.visitors.innings.join(',') + '\n';

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
}

function exportPDF() {
    // Use window.print() for PDF generation
    const printWindow = window.open('', '_blank');
    const homeScore = gameState.score.home.total;
    const visitorScore = gameState.score.visitors.total;

    let battingHTML = '<table border="1" cellpadding="5"><tr><th>Player</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>R</th><th>RBI</th><th>BB</th><th>K</th><th>SB</th></tr>';
    players.forEach(p => {
        const s = battingStats[p.id] || { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 };
        if (s.atBats > 0 || s.runs > 0 || s.rbis > 0 || s.stolenBases > 0) {
            battingHTML += `<tr><td>#${escapeHtml(p.number)} ${escapeHtml(p.name)}</td><td>${s.atBats}</td><td>${s.totalHits}</td><td>${s.doubles}</td><td>${s.triples}</td><td>${s.homeRuns}</td><td>${s.runs}</td><td>${s.rbis}</td><td>${s.walks}</td><td>${s.strikeouts}</td><td>${s.stolenBases || 0}</td></tr>`;
        }
    });
    battingHTML += '</table>';

    printWindow.document.write(`
        <html><head><title>Game Summary</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1, h2 { color: #1e3c72; }
            table { border-collapse: collapse; margin: 10px 0; width: 100%; }
            th, td { border: 1px solid #333; padding: 8px; text-align: center; }
            th { background: #f0f0f0; }
            .score { font-size: 2em; font-weight: bold; margin: 20px 0; }
            .log { white-space: pre-wrap; font-family: monospace; }
        </style></head><body>
        <h1>⚾ Game Summary</h1>
        <div class="score">${visitorScore} - ${homeScore}</div>
        <p>Visitor - Home</p>
        <p>Date: ${new Date().toLocaleDateString()}</p>
        <h2>Box Score</h2>
        <p><strong>Home:</strong> ${gameState.score.home.innings.map((r, i) => `Inn${i + 1}: ${r}`).join(' | ')}</p>
        <p><strong>Visitor:</strong> ${gameState.score.visitors.innings.map((r, i) => `Inn${i + 1}: ${r}`).join(' | ')}</p>
        <h2>Batting Stats</h2>
        ${battingHTML}
        <h2>Game Log</h2>
        <div class="log">${gameState.gameLog.join('\n')}</div>
        <script>window.onload = () => window.print();</script>
        </body></html>
    `);
    showToast('PDF generated in new window.', 'success');
}

// ========================================
// UI RENDERING
// ========================================

function renderGameUI() {
    renderScoreboard();
    renderDiamond();
    renderBatterDisplay();
    renderBattingOrderDisplay();
    renderPitcherDisplay();
    renderOpponentRunsIndicator();
    renderCountDisplay();
    renderGameLog();
    renderStats();
    renderSubstitutions();
    renderSummary();
    updateBattingHint();
}

function renderScoreboard() {
    const el = document.getElementById('scoreboard');
    if (!el) return;

    const homeInnings = gameState.score.home.innings.map((r, i) =>
        `<div class="inning-score">${i + 1}<br>${r}</div>`
    ).join('');

    const visitorInnings = gameState.score.visitors.innings.map((r, i) =>
        `<div class="inning-score">${i + 1}<br>${r}</div>`
    ).join('');

    const outsDisplay = '●'.repeat(gameState.outs) + '○'.repeat(3 - gameState.outs);

    const isHomeOurTeam = gameState.ourTeam === 'home';

    el.innerHTML = `
        <div class="scoreboard-row" id="scoreboardRowTop">
            <div class="team-score visitors ${!isHomeOurTeam ? 'our-team-highlight' : ''}">
                <div class="team-name">VIS</div>
                <div class="team-total">${gameState.score.visitors.total}</div>
            </div>
            <div class="inning-scores">${visitorInnings}</div>
        </div>
        <div class="inning-info">
            <div class="inning-display">
                <span class="${gameState.halfInning === 'top' ? 'active-half' : ''}">▲ Top</span>
                <span class="inning-number">${gameState.currentInning}</span>
                <span class="${gameState.halfInning === 'bottom' ? 'active-half' : ''}">▼ Bot</span>
            </div>
            <div class="outs-display">Outs: ${outsDisplay}</div>
        </div>
        <div class="scoreboard-row" id="scoreboardRowBottom">
            <div class="team-score home ${isHomeOurTeam ? 'our-team-highlight' : ''}">
                <div class="team-name">HOME</div>
                <div class="team-total">${gameState.score.home.total}</div>
            </div>
            <div class="inning-scores">${homeInnings}</div>
        </div>
        <div class="score-add-buttons">
               <button class="score-up-btn" data-team="home" title="Add a run to Home">+ Home</button>
               <button class="score-up-btn" data-team="visitors" title="Add a run to Visitors">+ Vis</button>
        </div>
    `;
}

function renderDiamond() {
    const el = document.getElementById('diamondDisplay');
    if (!el) return;

    // When we're pitching, show opponent runners as generic (not our players)
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    const thirdRunner = gameState.bases.third
        ? `<div class="base base-third player-runner" data-base="third" title="${weArePitching ? 'Opponent runner' : escapeHtml(getPlayerName(gameState.bases.third))}">${weArePitching ? 'OPP' : escapeHtml(getPlayerName(gameState.bases.third))}</div>`
        : '<div class="base base-third empty"></div>';
    const secondRunner = gameState.bases.second
        ? `<div class="base base-second player-runner" data-base="second" title="${weArePitching ? 'Opponent runner' : escapeHtml(getPlayerName(gameState.bases.second))}">${weArePitching ? 'OPP' : escapeHtml(getPlayerName(gameState.bases.second))}</div>`
        : '<div class="base base-second empty"></div>';
    const firstRunner = gameState.bases.first
        ? `<div class="base base-first player-runner" data-base="first" title="${weArePitching ? 'Opponent runner' : escapeHtml(getPlayerName(gameState.bases.first))}">${weArePitching ? 'OPP' : escapeHtml(getPlayerName(gameState.bases.first))}</div>`
        : '<div class="base base-first empty"></div>';

    el.innerHTML = `
        <div class="diamond-container">
            <div class="diamond-shape">
                ${thirdRunner}
                ${secondRunner}
                ${firstRunner}
                <div class="base base-home">HOME</div>
            </div>
        </div>
        <div class="diamond-controls">
            <button class="diamond-btn" onclick="advanceRunner('third')">3rd →</button>
            <button class="diamond-btn" onclick="advanceRunner('second')">2nd →</button>
            <button class="diamond-btn" onclick="advanceRunner('first')">1st →</button>
        </div>
        <div class="diamond-controls steal-controls">
            <button class="diamond-btn steal-btn" onclick="processStolenBase('second')" title="Runner steals 2nd">1st 🏃 2nd</button>
            <button class="diamond-btn steal-btn" onclick="processStolenBase('third')" title="Runner steals 3rd">2nd 🏃 3rd</button>
            <button class="diamond-btn steal-btn" onclick="processStolenBase('home')" title="Runner steals home">3rd 🏃 Home</button>
        </div>
    `;
}

function advanceRunner(base) {
    if (!gameState.gameStarted) return;

    // When our team is pitching, bases contain opponent runners — don't manually advance them
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');
    if (weArePitching) {
        showToast('Cannot manually advance runners while pitching.', 'info');
        return;
    }

    pushHistory();

    const playerId = gameState.bases[base];
    if (!playerId) return;

    const baseOrder = { first: 1, second: 2, third: 3 };
    const nextBase = { 1: 'second', 2: 'third', 3: null };

    if (base === 'third') {
        // Score!
        const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
        const runsSoFar = getRunsThisHalf();
        const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
        const actualRuns = Math.min(1, runsAllowed);
        if (actualRuns > 0) {
            gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
            gameState.score[team].total += actualRuns;
            trackRunsInHalf(actualRuns);
            gameState.gameLog.push(`${getInningLabel()}: Runner from 3rd scores!`);
            if (battingStats[playerId]) battingStats[playerId].runs++;
        } else {
            gameState.gameLog.push(`${getInningLabel()}: Runner from 3rd advance blocked - limit reached`);
        }
    } else {
        const next = nextBase[baseOrder[base]];
        if (gameState.bases[next]) {
            // Next base occupied, score the next runner
            const nextPlayer = gameState.bases[next];
            const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
            const runsSoFar = getRunsThisHalf();
            const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
            const actualRuns = Math.min(1, runsAllowed);
            if (actualRuns > 0) {
                gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
                gameState.score[team].total += actualRuns;
                trackRunsInHalf(actualRuns);
                gameState.gameLog.push(`${getInningLabel()}: Runner from ${next} scores on advance`);
                if (battingStats[nextPlayer]) battingStats[nextPlayer].runs++;
            } else {
                gameState.gameLog.push(`${getInningLabel()}: Runner from ${next} advance blocked - limit reached`);
            }
        }
        gameState.bases[next] = playerId;
    }

    gameState.bases[base] = null;
    checkAutoSwap();
    saveGameState();
    renderGameUI();
}

function processStolenBase(targetBase) {
    if (!gameState.gameStarted) return;

    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
        || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    let runnerId = null;
    let fromBase = null;
    let logMsg = '';

    if (targetBase === 'second') {
        // Stealing 2nd: runner must be on 1st
        runnerId = gameState.bases.first;
        fromBase = 'first';
        if (!runnerId) {
            showToast('No runner on 1st to steal 2nd.', 'info');
            return;
        }
        if (gameState.bases.second) {
            showToast('2nd base is occupied.', 'info');
            return;
        }
        // Snapshot only after validation so a failed steal doesn't leave a stale undo entry.
        pushHistory();
        gameState.bases.second = runnerId;
        gameState.bases.first = null;
        logMsg = `${getInningLabel()}: ${getPlayerName(runnerId)} steals 2nd!`;
    } else if (targetBase === 'third') {
        // Stealing 3rd: runner must be on 2nd
        runnerId = gameState.bases.second;
        fromBase = 'second';
        if (!runnerId) {
            showToast('No runner on 2nd to steal 3rd.', 'info');
            return;
        }
        if (gameState.bases.third) {
            showToast('3rd base is occupied.', 'info');
            return;
        }
        // Snapshot only after validation so a failed steal doesn't leave a stale undo entry.
        pushHistory();
        gameState.bases.third = runnerId;
        gameState.bases.second = null;
        logMsg = `${getInningLabel()}: ${getPlayerName(runnerId)} steals 3rd!`;
    } else if (targetBase === 'home') {
        // Stealing home: runner must be on 3rd
        runnerId = gameState.bases.third;
        fromBase = 'third';
        if (!runnerId) {
            showToast('No runner on 3rd to steal home.', 'info');
            return;
        }
        // Snapshot only after validation so a failed steal doesn't leave a stale undo entry.
        pushHistory();
        gameState.bases.third = null;
        const team = gameState.halfInning === 'bottom' ? 'home' : 'visitors';
        const runsSoFar = getRunsThisHalf();
        const runsAllowed = Math.max(0, gameState.runsThreshold - runsSoFar);
        const actualRuns = Math.min(1, runsAllowed);

        if (actualRuns > 0) {
            gameState.score[team].innings[gameState.currentInning - 1] += actualRuns;
            gameState.score[team].total += actualRuns;
            trackRunsInHalf(actualRuns);
            logMsg = `${getInningLabel()}: ${getPlayerName(runnerId)} steals home!`;

            if (weArePitching) {
                if (gameState.currentPitcherId) {
                    pitchingStats[gameState.currentPitcherId].runsAllowed++;
                    pitchingStats[gameState.currentPitcherId].stolenBasesAllowed++;
                }
            } else {
                if (!battingStats[runnerId]) battingStats[runnerId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
                battingStats[runnerId].runs++;
                battingStats[runnerId].stolenBases++;
                opposingPitchingStats.stolenBasesAllowed++;
            }
        } else {
            logMsg = `${getInningLabel()}: ${getPlayerName(runnerId)} steal home blocked - limit reached`;
            if (weArePitching) {
                if (gameState.currentPitcherId) {
                    pitchingStats[gameState.currentPitcherId].stolenBasesAllowed++;
                }
            } else {
                if (!battingStats[runnerId]) battingStats[runnerId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
                battingStats[runnerId].stolenBases++;
                opposingPitchingStats.stolenBasesAllowed++;
            }
        }

        gameState.gameLog.push(logMsg);
        checkAutoSwap();
        saveGameState();
        renderGameUI();
        showToast(logMsg, actualRuns > 0 ? 'success' : 'info');
        return;
    }

    // For 2nd and 3rd steals
    if (weArePitching) {
        // Opponent stole on our pitcher
        if (gameState.currentPitcherId) {
            pitchingStats[gameState.currentPitcherId].stolenBasesAllowed++;
        }
    } else {
        // Our runner stole
        if (!battingStats[runnerId]) battingStats[runnerId] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
        battingStats[runnerId].stolenBases++;
        opposingPitchingStats.stolenBasesAllowed++;
    }

    gameState.gameLog.push(logMsg);
    saveGameState();
    renderGameUI();
    showToast(logMsg, 'success');
}

function renderBatterDisplay() {
    const el = document.getElementById('batterDisplay');
    if (!el) return;

    const batter = getCurrentBatter();
    if (batter) {
        const isOurBatting = (gameState.halfInning === 'bottom' && gameState.ourTeam === 'home')
                          || (gameState.halfInning === 'top' && gameState.ourTeam === 'visitors');
        el.innerHTML = `
            <div class="batter-info">
                <div class="batter-number">#${escapeHtml(batter.number)}</div>
                <div class="batter-name">${escapeHtml(batter.name)}</div>
                <div class="batter-song">"${escapeHtml(batter.song)}"</div>
                <button class="play-walkout-btn" onclick="playBatterWalkout()">▶ Song</button>
                ${isOurBatting ? '<div class="batting-status">🏏 Our team batting</div>' : '<div class="batting-status">🛡️ Opponent batting</div>'}
            </div>
        `;
    } else {
        el.innerHTML = `
            <div class="batter-info no-batter">
                <div class="batter-name">No batter selected</div>
                <div class="batter-note">Start a new game to begin</div>
            </div>
        `;
    }
}

function renderBattingOrderDisplay() {
    const el = document.getElementById('currentBattingOrderDisplay');
    if (!el) return;

    if (!gameState.gameStarted || gameState.currentBattingOrder.length === 0) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'block';

    const isOurBatting = (gameState.halfInning === 'bottom' && gameState.ourTeam === 'home')
                      || (gameState.halfInning === 'top' && gameState.ourTeam === 'visitors');

    const playersHtml = gameState.currentBattingOrder.map((playerId, index) => {
        const player = getPlayerById(playerId);
        const isCurrent = index === gameState.currentBatterIndex;
        return `
            <span style="
                padding: 4px 8px;
                background: ${isCurrent ? '#1e3c72' : '#e8f0f7'};
                color: ${isCurrent ? 'white' : '#1e3c72'};
                border-radius: 4px;
                font-weight: ${isCurrent ? 'bold' : 'normal'};
                cursor: ${isOurBatting && !isCurrent ? 'pointer' : 'default'};
            "
            ${isOurBatting && !isCurrent ? `onclick="setNextBatter(${playerId})" title="Set as next batter"` : ''}
            >
                ${index + 1}. ${player ? `#${escapeHtml(player.number)} ${escapeHtml(player.name)}` : 'Unknown'}
            </span>
        `;
    }).join('');

    const controlsHtml = isOurBatting ? `
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="bo-control-btn" onclick="openBattingOrderModal()">✏️ Edit Order</button>
            <button class="bo-control-btn" onclick="skipCurrentBatter()">⏭ Skip Batter</button>
            <button class="bo-control-btn" onclick="openSubstitutionModal()">🔄 Substitute</button>
        </div>
    ` : '';

    document.getElementById('battingOrderPlayers').innerHTML = playersHtml + controlsHtml;
}

function renderPitcherDisplay() {
    const el = document.getElementById('pitcherDisplay');
    if (!el) return;

    // Determine if we are currently pitching
    const weArePitching = (gameState.halfInning === 'top' && gameState.ourTeam === 'home')
                       || (gameState.halfInning === 'bottom' && gameState.ourTeam === 'visitors');

    const pitcher = gameState.currentPitcherId ? getPlayerById(gameState.currentPitcherId) : null;
    const pitcherNameEl = document.getElementById('pitcherName');
    const pitcherStatsEl = document.getElementById('pitcherStats');

    if (!gameState.gameStarted || !weArePitching) {
        el.style.display = 'none';
    } else {
        el.style.display = 'block';

        if (pitcher) {
            const ps = pitchingStats[pitcher.id] || { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0 };
            const atLimit = ps.pitchesThrown >= MAX_PITCHES;
            const nearLimit = ps.pitchesThrown >= MAX_PITCHES - 5;
            pitcherNameEl.textContent = `#${pitcher.number} ${pitcher.name}`;
            pitcherStatsEl.innerHTML = `
                <span class="pitcher-stat">P: ${ps.pitchesThrown}${atLimit ? ' ⚠️ MAX' : nearLimit ? ' ⚠️' : ''}</span>
                <span class="pitcher-stat">S: ${ps.strikes}</span>
                <span class="pitcher-stat">B: ${ps.balls}</span>
                <span class="pitcher-stat">K: ${ps.strikeouts}</span>
                <span class="pitcher-stat">H: ${ps.hitsAllowed}</span>
                <span class="pitcher-stat">R: ${ps.runsAllowed}</span>
                <button class="change-pitcher-btn" onclick="openPitcherChangeModal()">Change Pitcher</button>
            `;
        } else {
            pitcherNameEl.textContent = 'No pitcher assigned';
            pitcherStatsEl.innerHTML = '<button class="change-pitcher-btn" onclick="openPitcherChangeModal()">Set Pitcher</button>';
        }
    }

    // Opponent pitcher info (always update, regardless of who is pitching)
    const oppInfo = document.getElementById('opponentInfoDisplay');
    if (oppInfo) {
        const team = gameState.opposingTeamName || (gameState.ourTeam === 'home' ? 'VIS' : 'HOME');
        const pitcher = gameState.opposingPitcherNumber
            ? `#${gameState.opposingPitcherNumber} ${gameState.opposingPitcherName || ''}`.trim()
            : (gameState.opposingPitcherName || 'Not set');
        oppInfo.innerHTML = `
            <div class="opponent-team-name">${team}</div>
            <div class="opponent-pitcher">P: ${pitcher}</div>
            <div class="opponent-pitch-count">Pitches: ${opposingPitchingStats.pitchesThrown}</div>
        `;
    }
}

function renderOpponentRunsIndicator() {
    const el = document.getElementById('opponentRunsIndicator');
    if (!el || !gameState.gameStarted) return;

    const opponentTeam = gameState.ourTeam === 'home' ? 'visitors' : 'home';
    const battingTeam = gameState.halfInning === 'top' ? 'visitors' : 'home';
    const isOpponentBatting = (battingTeam === opponentTeam);

    if (!isOpponentBatting) {
        // Our team is batting — show our runs threshold
        el.style.display = 'flex';
        const halfInning = gameState.halfInning;
        const halfIdx = gameState.currentInning - 1;
        const runsThisHalf = gameState.runsPerHalfInning[halfInning]?.[halfIdx] || 0;
        const threshold = gameState.runsThreshold;

        let dots = '';
        for (let i = 0; i < threshold; i++) {
            dots += `<span class="run-dot ${i < runsThisHalf ? 'filled' : ''}"></span>`;
        }

        el.innerHTML = `
            <div class="runs-indicator">
                <span class="runs-label">🏃 Our runs this half:</span>
                <span class="runs-count">${runsThisHalf}/${threshold}</span>
                <div class="run-dots">${dots}</div>
            </div>
        `;
        return;
    }

    // Opponent is batting
    el.style.display = 'flex';
    const halfInning = gameState.halfInning;
    const halfIdx = gameState.currentInning - 1;
    const runsThisHalf = gameState.runsPerHalfInning[halfInning]?.[halfIdx] || 0;
    const threshold = gameState.runsThreshold;

    let dots = '';
    for (let i = 0; i < threshold; i++) {
        dots += `<span class="run-dot ${i < runsThisHalf ? 'filled' : ''}"></span>`;
    }

    el.innerHTML = `
        <div class="runs-indicator">
            <span class="runs-label">🏃 Opponent runs this half:</span>
            <span class="runs-count">${runsThisHalf}/${threshold}</span>
            <div class="run-dots">${dots}</div>
        </div>
    `;
}

function updateBattingHint() {
    const hint = document.getElementById('battingHint');
    if (!hint) return;

    if (gameState.ourTeam === 'home') {
        hint.innerHTML = 'Home team bats in the <strong>bottom</strong> of each inning. We pitch in the <strong>top</strong>.';
    } else {
        hint.innerHTML = 'Visitor team bats in the <strong>top</strong> of each inning. We pitch in the <strong>bottom</strong>.';
    }
}

function playBatterWalkout() {
    const batter = getCurrentBatter();
    if (batter) {
        selectPlayer(batter);
    }
}

function renderCountDisplay() {
    const el = document.getElementById('countDisplay');
    if (!el) return;

    const balls = '●'.repeat(gameState.count.balls) + '○'.repeat(4 - gameState.count.balls);
    const strikes = '●'.repeat(gameState.count.strikes) + '○'.repeat(3 - gameState.count.strikes);

    el.innerHTML = `
        <div class="count-info">
            <div class="count-row">
                <span class="count-label">Balls:</span>
                <span class="count-dots">${balls}</span>
                <span class="count-number">${gameState.count.balls}/4</span>
            </div>
            <div class="count-row">
                <span class="count-label">Strikes:</span>
                <span class="count-dots">${strikes}</span>
                <span class="count-number">${gameState.count.strikes}/3</span>
            </div>
            <div class="count-row">
                <span class="count-label">Fouls:</span>
                <span class="count-number">${gameState.count.fouls}</span>
            </div>
            <div class="count-row">
                <span class="count-label">Pitches:</span>
                <span class="count-number">${gameState.pitchCount}</span>
            </div>
        </div>
        <button class="reset-count-btn" onclick="resetCount()">Reset Count</button>
    `;
}

function renderGameLog() {
    const el = document.getElementById('gameLog');
    if (!el) return;

    el.innerHTML = gameState.gameLog.map((entry, index) =>
        `<div class="log-entry" data-index="${index}" onclick="editLogEntryInline(${index}, this)">${escapeHtml(entry)}</div>`
    ).join('');

    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
}

function editLogEntryInline(index, element) {
    const current = gameState.gameLog[index];
    const newEntry = prompt('Edit log entry:', current);
    if (newEntry !== null && newEntry.trim() !== '') {
        editGameLogEntry(index, newEntry.trim());
    }
}

function renderStats() {
    const el = document.getElementById('statsTabContent');
    if (!el) return;

    if (!gameState.gameStarted) {
        el.innerHTML = '<div class="no-stats">Start a game to see stats.</div>';
        return;
    }

    // Sort players by at-bats (desc) then name
    const sortedPlayers = [...players].sort((a, b) => {
        const aStats = battingStats[a.id] || { atBats: 0 };
        const bStats = battingStats[b.id] || { atBats: 0 };
        if (bStats.atBats !== aStats.atBats) return bStats.atBats - aStats.atBats;
        return a.name.localeCompare(b.name);
    });

    let html = `
        <div class="stats-table-wrapper">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>AB</th>
                        <th>H</th>
                        <th>AVG</th>
                        <th>1B</th>
                        <th>2B</th>
                        <th>3B</th>
                        <th>HR</th>
                        <th>R</th>
                        <th>RBI</th>
                        <th>BB</th>
                        <th>K</th>
                        <th>SB</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedPlayers.forEach(p => {
        const s = battingStats[p.id] || { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 };
        const avg = s.atBats > 0 ? (s.totalHits / s.atBats).toFixed(3).replace(/^0+/, '') : '.000';
        html += `
            <tr>
                <td>#${escapeHtml(p.number)} ${escapeHtml(p.name)}</td>
                <td>${s.atBats}</td>
                <td>${s.totalHits}</td>
                <td>${avg}</td>
                <td>${s.singles}</td>
                <td>${s.doubles}</td>
                <td>${s.triples}</td>
                <td>${s.homeRuns}</td>
                <td>${s.runs}</td>
                <td>${s.rbis}</td>
                <td>${s.walks}</td>
                <td>${s.strikeouts}</td>
                <td>${s.stolenBases || 0}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';

    // Pitching stats
    html += '<h3>Pitching Stats</h3>';
    html += '<div class="stats-table-wrapper"><table class="stats-table"><thead><tr>';
    html += '<th>Player</th><th>P</th><th>S</th><th>B</th><th>BB</th><th>K</th><th>H</th><th>R</th><th>SB</th><th>IP</th>';
    html += '</tr></thead><tbody>';

    players.forEach(p => {
        const ps = pitchingStats[p.id] || { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, inningsPitched: 0, stolenBasesAllowed: 0 };
        if (ps.pitchesThrown > 0) {
            html += `
                <tr>
                    <td>#${escapeHtml(p.number)} ${escapeHtml(p.name)}</td>
                    <td>${ps.pitchesThrown}</td>
                    <td>${ps.strikes}</td>
                    <td>${ps.balls}</td>
                    <td>${ps.walks}</td>
                    <td>${ps.strikeouts}</td>
                    <td>${ps.hitsAllowed}</td>
                    <td>${ps.runsAllowed}</td>
                    <td>${ps.stolenBasesAllowed || 0}</td>
                    <td>${ps.inningsPitched}</td>
                </tr>
            `;
        }
    });

    html += '</tbody></table></div>';

    // Opponent pitcher stats
    html += '<h3>Opponent Pitching Stats</h3>';
    const oppTeamLabel = gameState.opposingTeamName || (gameState.ourTeam === 'home' ? 'VIS' : 'HOME');
    const oppPitcherLabel = gameState.opposingPitcherNumber
        ? `#${gameState.opposingPitcherNumber} ${gameState.opposingPitcherName || ''}`.trim()
        : (gameState.opposingPitcherName || 'Opponent Pitcher');
    html += `<div class="opponent-pitcher-header">${oppTeamLabel} - P: ${oppPitcherLabel}</div>`;
    html += '<div class="stats-table-wrapper"><table class="stats-table"><thead><tr>';
    html += '<th>Stat</th><th>P</th><th>S</th><th>B</th><th>BB</th><th>K</th><th>H</th><th>R</th><th>SB</th><th>IP</th>';
    html += '</tr></thead><tbody>';
    const ops = opposingPitchingStats;
    html += `
        <tr class="opponent-pitch-row">
            <td>${oppPitcherLabel}</td>
            <td>${ops.pitchesThrown}</td>
            <td>${ops.strikes}</td>
            <td>${ops.balls}</td>
            <td>${ops.walks}</td>
            <td>${ops.strikeouts}</td>
            <td>${ops.hitsAllowed}</td>
            <td>${ops.runsAllowed}</td>
            <td>${ops.stolenBasesAllowed || 0}</td>
            <td>0.0</td>
        </tr>
    `;
    html += '</tbody></table></div>';

    el.innerHTML = html;
}

function renderSummary() {
    const el = document.getElementById('summaryTabContent');
    if (!el) return;

    const homeScore = gameState.score.home.total;
    const visitorScore = gameState.score.visitors.total;
    const gameEnd = gameState.endTime ? new Date(gameState.endTime).toLocaleString() : 'In Progress';

    let html = `
        <div class="summary-header">
            <h2>Game Summary</h2>
            <div class="final-score">
                <div class="score-team visitors-score">
                    <span>Visitor</span>
                    <span class="score-value">${visitorScore}</span>
                </div>
                <div class="score-divider">-</div>
                <div class="score-team home-score">
                    <span>Home</span>
                    <span class="score-value">${homeScore}</span>
                </div>
            </div>
            <div class="summary-date">${gameEnd}</div>
        </div>
    `;

    // Per-inning breakdown
    html += '<h3>Inning by Inning</h3>';
    html += '<div class="inning-breakdown">';
    for (let i = 0; i < 6; i++) {
        const v = gameState.score.visitors.innings[i];
        const h = gameState.score.home.innings[i];
        html += `
            <div class="inning-row">
                <div class="inning-label">Inn ${i + 1}</div>
                <div class="inning-visitors">${v}</div>
                <div class="divider">|</div>
                <div class="inning-homes">${h}</div>
            </div>
        `;
    }
    html += '</div>';

    // Batting stats
    html += '<h3>Batting Stats</h3>';
    html += '<div class="stats-table-wrapper"><table class="stats-table"><thead><tr>';
    html += '<th>Player</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>R</th><th>RBI</th><th>BB</th><th>K</th><th>SB</th>';
    html += '</tr></thead><tbody>';

    players.forEach(p => {
        const s = battingStats[p.id] || { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 };
        if (s.atBats > 0 || s.runs > 0 || s.rbis > 0 || s.stolenBases > 0) {
            html += `
                <tr>
                    <td>#${escapeHtml(p.number)} ${escapeHtml(p.name)}</td>
                    <td>${s.atBats}</td>
                    <td>${s.totalHits}</td>
                    <td>${s.doubles}</td>
                    <td>${s.triples}</td>
                    <td>${s.homeRuns}</td>
                    <td>${s.runs}</td>
                    <td>${s.rbis}</td>
                    <td>${s.walks}</td>
                    <td>${s.strikeouts}</td>
                    <td>${s.stolenBases || 0}</td>
                </tr>
            `;
        }
    });

    html += '</tbody></table></div>';

    // Game log
    html += '<h3>Game Log</h3>';
    html += '<div class="game-log-summary">';
    html += gameState.gameLog.map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('');
    html += '</div>';

    // Export buttons
    html += '<div class="export-buttons">';
    html += '<button class="export-btn" onclick="exportJSON()">📄 Export JSON</button>';
    html += '<button class="export-btn" onclick="exportCSV()">📊 Export CSV</button>';
    html += '<button class="export-btn" onclick="exportPDF()">🖨 Print / PDF</button>';
    html += '</div>';

    el.innerHTML = html;
}

function renderSubstitutions() {
    const el = document.getElementById('substitutionsPanel');
    if (!el) return;

    const availablePlayers = players.filter(p => playerAvailability[p.id]);
    const gamePlayers = gameState.currentBattingOrder;

    let html = '<h3>Substitutions</h3>';

    // Quick sub button
    html += '<div style="margin-bottom: 15px;">';
    html += '<button class="sub-action-btn" onclick="openSubstitutionModal()">🔄 Make Substitution</button>';
    html += '<button class="sub-action-btn" onclick="openBattingOrderModal()" style="margin-left: 8px;">✏️ Edit Batting Order</button>';
    html += '</div>';

    html += '<div class="sub-controls">';

    // Players available to sub in (not in game)
    const notInGame = availablePlayers.filter(p => !gamePlayers.includes(p.id));

    html += '<div class="sub-section">';
    html += '<h4>Available to Sub In (' + notInGame.length + ')</h4>';
    html += '<div class="sub-list">';
    notInGame.forEach(p => {
        html += `<button class="sub-in-btn" data-player-id="${escapeHtml(p.id)}" onclick="showSubInModal(${p.id})">${escapeHtml(p.number)} ${escapeHtml(p.name)}</button>`;
    });
    html += '</div></div>';

    // Players in the game (to sub out)
    html += '<div class="sub-section">';
    html += '<h4>Players in Game (' + gamePlayers.length + ')</h4>';
    html += '<div class="sub-list">';
    gamePlayers.forEach(pid => {
        const p = getPlayerById(pid);
        if (p) {
            html += `<button class="sub-out-btn" data-player-id="${escapeHtml(pid)}" onclick="showSubOutModal(${pid})">${escapeHtml(p.number)} ${escapeHtml(p.name)}</button>`;
        }
    });
    html += '</div></div>';

    html += '</div>';

    // Show substitution history
    if (gameState.substitutions.length > 0) {
        html += '<h4>Substitution History</h4>';
        html += '<div class="sub-history">';
        gameState.substitutions.forEach(sub => {
            const playerIn = getPlayerById(sub.playerIn);
            const playerOut = getPlayerById(sub.playerOut);
            html += `<div class="sub-entry">${getInningLabelFromSub(sub)}: ${playerIn ? `#${playerIn.number} ${playerIn.name}` : '?'} IN for ${playerOut ? `#${playerOut.number} ${playerOut.name}` : '?'}</div>`;
        });
        html += '</div>';
    }

    el.innerHTML = html;
}

function showSubInModal(playerInId) {
    // Open the new substitution modal and pre-select the player coming in
    openSubstitutionModal();
    const inSelect = document.getElementById('subPlayerInSelect');
    if (inSelect) {
        inSelect.value = playerInId;
    }
}

function showSubOutModal(playerOutId) {
    // Open the new substitution modal and pre-select the player going out
    openSubstitutionModal();
    const outSelect = document.getElementById('subPlayerOutSelect');
    if (outSelect) {
        outSelect.value = playerOutId;
    }
}

function getInningLabelFromSub(sub) {
    const team = sub.half === 'top' ? 'Top' : 'Bottom';
    const suffix = sub.inning === 1 ? 'st' : sub.inning === 2 ? 'nd' : sub.inning === 3 ? 'rd' : 'th';
    return `${team} ${sub.inning}${suffix}`;
}

// ========================================
// EVENT HANDLERS
// ========================================

function setupGameView() {
    // Game tab button
    const gameViewBtn = document.getElementById('gameViewBtn');
    if (gameViewBtn) {
        gameViewBtn.addEventListener('click', () => {
            gameViewBtn.classList.add('active');
            document.getElementById('songsViewBtn').classList.remove('active');
            document.getElementById('battingOrderBtn').classList.remove('active');
            document.getElementById('lineupBtn').classList.remove('active');
            document.getElementById('gameView').style.display = 'block';
            document.getElementById('songsView').style.display = 'none';
            document.getElementById('battingOrderView').style.display = 'none';
            document.getElementById('lineupView').style.display = 'none';
            renderGameUI();
        });
    }

    // Game sub-tabs
    document.querySelectorAll('.game-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            gameCurrentTab = tab;

            document.querySelectorAll('.game-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.game-tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(`${tab}Tab`);
            if (tabContent) tabContent.classList.add('active');

            if (tab === 'stats') renderStats();
            if (tab === 'summary') renderSummary();
        });
    });

    // At-bat buttons
    document.querySelectorAll('.atbat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            processAtBatAction(action);
        });
    });

    // Control buttons
    const newGameBtn = document.getElementById('newGameBtn');
    if (newGameBtn) newGameBtn.addEventListener('click', startNewGame);

    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undo);

    const endInningBtn = document.getElementById('endInningBtn');
    if (endInningBtn) endInningBtn.addEventListener('click', endInning);

    const endGameBtn = document.getElementById('endGameBtn');
    if (endGameBtn) {
        endGameBtn.addEventListener('click', () => {
            if (gameState.gameStarted) {
                endGame();
            }
        });
    }

    // Opponent score buttons - delegate on the stable #scoreboard parent so the
    // listener survives renderScoreboard() rewrites of the innerHTML.
    const scoreboardEl = document.getElementById('scoreboard');
    if (scoreboardEl && !scoreboardEl._delegated) {
        scoreboardEl._delegated = true;
        scoreboardEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.score-up-btn');
            if (btn) addRuns(btn.getAttribute('data-team'), 1);
       });
    }
}

function processAtBatAction(action) {
    switch (action) {
        case 'ball': processBall(); break;
        case 'strike': processStrike(); break;
        case 'foul': processFoul(); break;
        case 'single': processHit('single'); break;
        case 'double': processHit('double'); break;
        case 'triple': processHit('triple'); break;
        case 'hr': processHit('hr'); break;
        case 'walk': processWalk(); break;
        case 'so': processStrikeout(); break;
        case 'go': processGroundOut(); break;
        case 'fo': processFlyOut(); break;
        case 'error': processError(); break;
        default:
            showToast(`Unknown action: ${action}`, 'error');
    }
}

// ========================================
// INITIALIZATION
// ========================================

function initGameTracking() {
    loadGameState();

    // Populate opponent info inputs if they exist
    const oppTeamInput = document.getElementById('opposingTeamName');
    const oppPitcherNumInput = document.getElementById('opposingPitcherNumber');
    const oppPitcherNameInput = document.getElementById('opposingPitcherName');

    if (oppTeamInput) oppTeamInput.value = gameState.opposingTeamName || '';
    if (oppPitcherNumInput) oppPitcherNumInput.value = gameState.opposingPitcherNumber || '';
    if (oppPitcherNameInput) oppPitcherNameInput.value = gameState.opposingPitcherName || '';

    // Set team toggle state if we have a saved team selection
    const homeBtn = document.getElementById('teamHomeBtn');
    const visitorBtn = document.getElementById('teamVisitorBtn');
    if (homeBtn) homeBtn.classList.toggle('active', gameState.ourTeam === 'home');
    if (visitorBtn) visitorBtn.classList.toggle('active', gameState.ourTeam === 'visitors');

    // If game was in progress, make sure stats are initialized
    if (gameState.gameStarted) {
        players.forEach(p => {
            if (!battingStats[p.id]) {
                battingStats[p.id] = { atBats: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, totalHits: 0, runs: 0, rbis: 0, walks: 0, strikeouts: 0, outs: 0, stolenBases: 0 };
            }
            if (!pitchingStats[p.id]) {
                pitchingStats[p.id] = { pitchesThrown: 0, strikes: 0, balls: 0, walks: 0, strikeouts: 0, hitsAllowed: 0, runsAllowed: 0, inningsPitched: 0, stolenBasesAllowed: 0 };
            }
        });
    }

    setupGameView();
}

// Make functions available globally
window.startNewGame = startNewGame;
window.endInning = endInning;
window.endGame = endGame;
window.undo = undo;
window.advanceRunner = advanceRunner;
window.playBatterWalkout = playBatterWalkout;
window.resetCount = resetCount;
window.exportJSON = exportJSON;
window.exportCSV = exportCSV;
window.exportPDF = exportPDF;
window.substitutePlayer = substitutePlayer;
window.showSubInModal = showSubInModal;
window.showSubOutModal = showSubOutModal;
window.openSubstitutionModal = openSubstitutionModal;
window.closeSubstitutionModal = closeSubstitutionModal;
window.confirmSubstitution = confirmSubstitution;
window.openBattingOrderModal = openBattingOrderModal;
window.closeBattingOrderModal = closeBattingOrderModal;
window.saveBattingOrderChanges = saveBattingOrderChanges;
window.moveBatterUp = moveBatterUp;
window.moveBatterDown = moveBatterDown;
window.skipCurrentBatter = skipCurrentBatter;
window.setNextBatter = setNextBatter;
window.editLogEntryInline = editLogEntryInline;
window.clearGameLog = clearGameLog;
window.setOurTeam = setOurTeam;
window.saveOpponentInfo = saveOpponentInfo;
window.processStolenBase = processStolenBase;
