// Global variables
let players = [];
let battingOrder = [];
let currentPlayer = null;

// Escape user-controllable strings (player name/number/song) before interpolating
// into HTML so they can't break out of the markup.
function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
         { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Lineup configuration
const POSITIONS = [
    'Catcher',
    'Pitcher',
    '1st Base',
    '2nd Base',
    '3rd Base',
    'Shortstop',
    'Left Field',
    'Right Field',
    'Center Field',
    'Bench'
];

// Position abbreviations for compact display in the matrix
const POSITION_ABBREVS = {
    'Catcher': 'C',
    'Pitcher': 'P',
    '1st Base': '1B',
    '2nd Base': '2B',
    '3rd Base': '3B',
    'Shortstop': 'SS',
    'Left Field': 'LF',
    'Right Field': 'RF',
    'Center Field': 'CF',
    'Bench': 'BN'
};

const NUM_INNINGS = 5;
const NUM_PLAYERS_ON_FIELD = 9;
const FIELD_POSITIONS = POSITIONS.filter(p => p !== 'Bench');

let playerLineup = {}; // { playerId: { positions: [posInning1, posInning2, ...], onBench: [false, false, ...] } }

// Inning locking state — track which innings have been "played" and should be preserved
let lockedInnings = new Set(); // Set of 0-indexed inning numbers that are locked

// DOM elements
let audioPlayer = document.getElementById('audioPlayer');
let announcerPlayer = document.getElementById('announcerPlayer');
let playBtn = document.getElementById('playBtn');
let pauseBtn = document.getElementById('pauseBtn');
let stopBtn = document.getElementById('stopBtn');
let playerGrid = document.getElementById('playerGrid');
let currentPlayerName = document.getElementById('currentPlayerName');
let currentSongTitle = document.getElementById('currentSongTitle');
let battingOrderList = document.getElementById('battingOrderList');
let showUnavailableToggle = document.getElementById('showUnavailableToggle');
let lineupMatrixContent = document.getElementById('lineupMatrixContent');
let autoArrangeBtn = document.getElementById('autoArrangeBtn');
let saveLineupBtn = document.getElementById('saveLineupBtn');
let lineupBtn = document.getElementById('lineupBtn');
let lineupView = document.getElementById('lineupView');
let songsView = document.getElementById('songsView');
let battingOrderView = document.getElementById('battingOrderView');
let songsViewBtn = document.getElementById('songsViewBtn');
let battingOrderBtn = document.getElementById('battingOrderBtn');

// Player availability tracking
let playerAvailability = {}; // Object to track which players are available (true/false)

// Announcer variables
let announcerEnabled = true;
let announcerVolume = 1.0;

// Web Audio API variables for cross-fading
let audioCtx = null;
let songGainNode = null;
let songSource = null;
let fadeTimeout = null;

// ========================================
// TOAST NOTIFICATION SYSTEM
// ========================================

function showToast(message, type = 'info', benchedPlayers = []) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let benchedHTML = '';
    if (benchedPlayers && benchedPlayers.length > 0) {
      benchedHTML = '<span class="toast-benched-players">⚠️ Benched: ' + benchedPlayers.map(p => escapeHtml(p.name) + ' #' + escapeHtml(p.number)).join(', ') + '</span>';
     }
    
    toast.innerHTML = escapeHtml(message) + benchedHTML;
    container.appendChild(toast);
    
    // Remove toast after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

// ========================================
// CONFIRMATION MODAL SYSTEM
// ========================================

let confirmCallback = null;
let activeConfirmResolve = null;
let activeConfirmCleanup = null;

function showConfirm(title, message, benchedPlayers = []) {
    // If a confirm is already open, dismiss it so its handlers don't leak.
    if (activeConfirmCleanup) {
        activeConfirmCleanup();
        if (activeConfirmResolve) activeConfirmResolve(false);
        activeConfirmCleanup = null;
        activeConfirmResolve = null;
         }

    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const bodyEl = document.getElementById('confirmBody');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const closeBtn = document.getElementById('closeConfirmModal');
        let closeOnBackdrop = null;
        
        titleEl.textContent = title;
        
        let benchedHTML = '';
        if (benchedPlayers && benchedPlayers.length > 0) {
            benchedHTML = '<ul>' + benchedPlayers.map(p => '<li class="benched">⚠️ ' + escapeHtml(p.name) + ' #' + escapeHtml(p.number) + ' will be moved to bench</li>').join('') + '</ul>';
        }
        
        bodyEl.innerHTML = '<p>' + escapeHtml(message) + '</p>' + benchedHTML;
        modal.style.display = 'block';
        
        confirmCallback = resolve;
        
        function cleanup() {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
          modal.removeEventListener('click', closeOnBackdrop);
          activeConfirmCleanup = null;
          activeConfirmResolve = null;
        }
        
        function onOk() {
          cleanup();
          resolve(true);
        }
        
        function onCancel() {
          cleanup();
          resolve(false);
        }
        
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        
        // Close on backdrop click
        closeOnBackdrop = function (e) {
          if (e.target === modal) {
               cleanup();
               resolve(false);
            }
        };
        modal.addEventListener('click', closeOnBackdrop);

        activeConfirmResolve = resolve;
        activeConfirmCleanup = cleanup;
    });
}

// ========================================
// LINEUP VALIDATION
// ========================================

function validateLineup() {
    const errors = [];
    const warnings = [];
    const inningDetails = [];

    // Compute active players once at the top (used inside the loop)
    const activePlayersList = players.filter(p => playerAvailability[p.id]);
    const activePlayerCount = activePlayersList.length;
    const isSmallRoster = activePlayerCount < NUM_PLAYERS_ON_FIELD;

    // Critical positions that must be covered when roster is smaller than 9
    const criticalPositions = ['Catcher', 'Pitcher', '1st Base', '2nd Base', '3rd Base'];

    for (let inning = 0; inning < NUM_INNINGS; inning++) {
        let benchCount = 0;
        let fieldPositions = [];
        let playingPlayers = [];
        let benchedPlayers = [];

        for (const [playerId, data] of Object.entries(playerLineup)) {
            const player = players.find(p => p.id == playerId);
            if (!player) continue;

            const position = data.positions[inning];

            if (position === 'Bench') {
                // Player is on bench for this inning
                benchCount++;
                benchedPlayers.push(player);
            } else if (position) {
                // Player is on the field
                fieldPositions.push({ player, position });
                playingPlayers.push(player);
            }
        }

        // Check for duplicate positions
        const positionCounts = {};
        fieldPositions.forEach(fp => {
            positionCounts[fp.position] = (positionCounts[fp.position] || 0) + 1;
        });

        const duplicates = Object.entries(positionCounts).filter(([pos, count]) => count > 1);

        // Check for missing positions
        const assignedPositions = new Set(fieldPositions.map(fp => fp.position));

        let missingPositions = [];
        if (isSmallRoster) {
            // Only require critical positions when roster is smaller than 9
            missingPositions = criticalPositions.filter(pos => !assignedPositions.has(pos));
        } else {
            // Full roster: all field positions must be covered
            missingPositions = POSITIONS.filter(pos => pos !== 'Bench' && !assignedPositions.has(pos));
        }

        const inningLabel = getInningSuffix(inning + 1);
        let status = '';
        let isValid = true;

        // Calculate expected bench count
        const expectedBenchCount = Math.max(0, activePlayerCount - NUM_PLAYERS_ON_FIELD);

        if (benchCount !== expectedBenchCount) {
            status = `⚠️ ${benchCount} players benched (expected ${expectedBenchCount})`;
            isValid = false;
            warnings.push(`Inning ${inningLabel}: ${benchCount} players benched (expected ${expectedBenchCount})`);
        }

        // Check that all available players have a position each inning (field or Bench)
        const totalAssignedPlayers = fieldPositions.length + benchCount;
        if (totalAssignedPlayers < activePlayerCount) {
            const unassigned = activePlayerCount - totalAssignedPlayers;
            status += (status ? ' | ' : '') + `⚠️ ${unassigned} available player(s) without a position assignment`;
            warnings.push(`Inning ${inningLabel}: ${unassigned} available player(s) not assigned a position`);
            isValid = false;
        }

        if (duplicates.length > 0) {
            const dupList = duplicates.map(([pos, count]) => `${pos} (${count} players)`).join(', ');
            status += (status ? ' | ' : '') + `Duplicate positions: ${dupList}`;
            isValid = false;
            errors.push(`Inning ${inningLabel}: Duplicate positions - ${dupList}`);
        }

        if (missingPositions.length > 0) {
            status += (status ? ' | ' : '') + `Missing positions: ${missingPositions.join(', ')}`;
            isValid = false;
            errors.push(`Inning ${inningLabel}: Missing positions - ${missingPositions.join(', ')}`);
        }

        if (isValid) {
            if (isSmallRoster) {
                status = `✅ Valid - ${activePlayerCount} players, critical positions (C, P, 1B, 2B, 3B) covered`;
            } else {
                status = `✅ Valid - ${benchCount} bench, 9 unique field positions`;
            }
        }

        inningDetails.push({ inning: inningLabel, valid: isValid, benchCount, fieldPositions, duplicates, benchedPlayers });
    }

    // Check for active roster consistency
    const totalAssigned = players.filter(p => {
        const data = playerLineup[p.id];
        return data && data.positions.some(pos => pos !== null);
    }).length;

    if (!isSmallRoster && totalAssigned !== 9) {
        warnings.push(`Only ${totalAssigned} players have positions assigned (expected 9)`);
    } else if (isSmallRoster && totalAssigned < activePlayerCount) {
        warnings.push(`Only ${totalAssigned}/${activePlayerCount} available players have positions assigned`);
    }

    return { errors, warnings, inningDetails, totalAssigned, activePlayers: activePlayersList.length };
}

// ========================================
// LINEUP CONFIGURATION
// ========================================

// Helper function to get inning suffix
function getInningSuffix(inning) {
    if (inning === 1) return '1st';
    if (inning === 2) return '2nd';
    if (inning === 3) return '3rd';
    return inning + 'th';
}

// Fisher-Yates shuffle helper
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ========================================
// POSITION ROTATION ALGORITHM
// ========================================

/**
 * Count how many times a player is benched across all innings.
 */
function countBenchAppearances(allInningsAssignments) {
    const benchCounts = {};
    
    for (const assignment of allInningsAssignments) {
        for (const [playerId, pos] of Object.entries(assignment)) {
            if (!benchCounts[playerId]) benchCounts[playerId] = 0;
            if (pos === 'Bench') {
                benchCounts[playerId]++;
            }
        }
    }
    
    return benchCounts;
}

/**
 * Score how well an assignment minimizes same-position repeats across innings.
 * Lower score = better (fewer repeats).
 * Bench repeats are treated as a hard constraint — they get a massive penalty.
 */
function scorePositionAssignments(allInningsAssignments) {
    let repeatScore = 0;
    let benchRepeatPenalty = 0;
    
    for (let inning = 1; inning < allInningsAssignments.length; inning++) {
        const prev = allInningsAssignments[inning - 1];
        const curr = allInningsAssignments[inning];
        
        for (const [playerId, prevPos] of Object.entries(prev)) {
            const currPos = curr[playerId];
            if (prevPos && prevPos !== 'Bench' && currPos && currPos !== 'Bench' && prevPos === currPos) {
                repeatScore++;
            }
            // Hard constraint: bench repeats get a massive penalty
            if (prevPos === 'Bench' && currPos === 'Bench') {
                benchRepeatPenalty += 1000;
            }
        }
    }
    
    // Count bench appearances and penalize any player benched more than once
    const benchCounts = countBenchAppearances(allInningsAssignments);
    for (const [playerId, count] of Object.entries(benchCounts)) {
        if (count > 1) {
            benchRepeatPenalty += (count - 1) * 10000;
        }
    }
    
    return { repeatScore, benchRepeatPenalty, total: repeatScore + benchRepeatPenalty };
}

/**
 * Generate an optimized lineup using iterative improvement.
 * - HARD CONSTRAINT: each player benches at most once across all innings.
 * - Assigns field positions with random variety across innings.
 * - Iteratively swaps positions between consecutive innings to reduce same-position repeats.
 * - Preserves locked innings (doesn't modify them).
 *
 * @param {number[]} allAvailablePlayerIds - All available players (used to calculate bench counts).
 * @param {number} numInnings - Number of innings to generate assignments for.
 * @param {Set<number>} [playersWhoCannotBench] - Players who have already benched in locked innings
 *                                                 and should NOT be benched again.
 * @param {Object} [previousInningPositions] - Positions from the last locked inning (before the
 *                                               first unlocked inning). Maps playerId -> position.
 */
function generateOptimizedLineup(allAvailablePlayerIds, numInnings, playersWhoCannotBench = new Set(), previousInningPositions = null) {
    const fieldOnly = POSITIONS.filter(p => p !== 'Bench');
    // Calculate bench spots from ALL available players, not just those who can still bench
    const numBenchPerInning = Math.max(0, allAvailablePlayerIds.length - NUM_PLAYERS_ON_FIELD);
    
    
    // Players who can still be benched (haven't benched in locked innings)
    const canBenchIds = allAvailablePlayerIds.filter(id => !playersWhoCannotBench.has(id));
    
    const inningBenchSets = [];
    for (let inning = 0; inning < numInnings; inning++) {
        inningBenchSets.push(new Set());
    }
    
    // Fill each unlocked inning's bench to exactly numBenchPerInning players so every inning
    // has exactly 9 on the field (no missing positions). Players who already benched in a
    // locked inning are excluded from canBenchIds; when there aren't enough can-bench players
    // to avoid repeats, bench the least-benched players first so repeats spread evenly.
    const benchCounts = new Map();
    for (const id of canBenchIds) benchCounts.set(id, 0);
    const inningOrder = shuffleArray(Array.from({ length: numInnings }, (_, i) => i));
    for (const inning of inningOrder) {
      const ordered = shuffleArray([...canBenchIds]).sort((a, b) => benchCounts.get(a) - benchCounts.get(b));
      for (let k = 0; k < numBenchPerInning && k < ordered.length; k++) {
          const pid = ordered[k];
          inningBenchSets[inning].add(pid);
          benchCounts.set(pid, benchCounts.get(pid) + 1);
        }
    }
    
    // Build per-inning position assignments
    const allInningsAssignments = [];
    
    for (let inning = 0; inning < numInnings; inning++) {
        const benchSet = inningBenchSets[inning];
        const assignment = {};
        
        // Use ALL available players; benchSet already only contains players who can bench
        const fieldPlayers = allAvailablePlayerIds.filter(id => !benchSet.has(id));
        
        // Shuffle field players and positions for variety
        const shuffledFieldPlayers = shuffleArray(fieldPlayers);
        const shuffledPositions = shuffleArray([...fieldOnly]);
        
        for (let i = 0; i < fieldPlayers.length; i++) {
            assignment[shuffledFieldPlayers[i]] = shuffledPositions[i];
        }
        
        for (const playerId of benchSet) {
            assignment[playerId] = 'Bench';
        }
        
        // Safety: fill any missing players
        for (const playerId of allAvailablePlayerIds) {
            if (!assignment[playerId]) {
                assignment[playerId] = null;
            }
        }
        
        allInningsAssignments.push(assignment);
    }
    
    // Fix the boundary between the last locked inning and the first unlocked inning:
    // if a player is on the field in both, make sure they don't have the same position.
    if (previousInningPositions) {
        for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
            const firstUnlockedPos = allInningsAssignments[0][playerId];
            if (prevPos && prevPos !== 'Bench' && firstUnlockedPos && firstUnlockedPos !== 'Bench' && prevPos === firstUnlockedPos) {
                // Need to swap this player's position in the first unlocked inning.
                const otherPositions = fieldOnly.filter(p => p !== prevPos);
                if (otherPositions.length > 0) {
                    // Find who holds the target position in the first unlocked inning
                    const targetPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
                    const occupant = Object.entries(allInningsAssignments[0]).find(
                        ([pid, pos]) => pos === targetPos && pid !== playerId
                    );
                    if (occupant) {
                        const occupantId = occupant[0];
                        allInningsAssignments[0][playerId] = targetPos;
                        allInningsAssignments[0][occupantId] = prevPos;
                    } else {
                        allInningsAssignments[0][playerId] = targetPos;
                    }
                }
            }
        }
    }
    
    // ─── Iterative improvement for position variety ───
    // Swap positions between consecutive innings to reduce same-position repeats.
    // Bench assignments stay untouched (already satisfy the constraint).
    const iterations = 50;
    let bestAssignments = JSON.parse(JSON.stringify(allInningsAssignments));
    let bestScore = scorePositionAssignments(bestAssignments);
    
    // If there's a previous locked inning, score the boundary too.
    if (previousInningPositions) {
        let boundaryScore = 0;
        for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
            const firstPos = allInningsAssignments[0][playerId];
            if (prevPos && prevPos !== 'Bench' && firstPos && firstPos !== 'Bench' && prevPos === firstPos) {
                boundaryScore++;
            }
        }
        bestScore = { repeatScore: bestScore.repeatScore + boundaryScore, benchRepeatPenalty: bestScore.benchRepeatPenalty, total: bestScore.total + boundaryScore };
    }
    
    for (let iter = 0; iter < iterations; iter++) {
        const workingAssignments = JSON.parse(JSON.stringify(allInningsAssignments));
        
        // workingAssignments is indexed by generated (unlocked) inning 0..N-1, so every
        // consecutive pair compared below is two unlocked innings. The old guard
        // `lockedInnings.has(inning)` tested a generated index against real locked inning
        // numbers and wrongly skipped every comparison whenever an early inning was locked,
        // silently turning the repeat-avoidance into a no-op in the normal
        // "some innings already played/locked" case. The locked->unlocked boundary is
        // handled separately by the previousInningPositions block above.
        for (let inning = 1; inning < workingAssignments.length; inning++) {
            
            for (let trial = 0; trial < 20; trial++) {
                const prevInning = inning - 1;
                const currInning = inning;
                
                // Only swap players who are on the field in both innings
                const fieldPlayers = Object.keys(workingAssignments[currInning]).filter(
                    pid => workingAssignments[currInning][pid] !== 'Bench' &&
                           workingAssignments[prevInning][pid] !== 'Bench'
                );
                if (fieldPlayers.length === 0) continue;
                
                const randomPlayer = fieldPlayers[Math.floor(Math.random() * fieldPlayers.length)];
                const currentPos = workingAssignments[currInning][randomPlayer];
                const prevPos = workingAssignments[prevInning][randomPlayer];
                
                // If same position in both innings, try to change it
                if (currentPos === prevPos) {
                    const otherPositions = fieldOnly.filter(p => p !== prevPos && p !== currentPos);
                    if (otherPositions.length === 0) continue;
                    
                    const randomPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
                    
                    const occupant = Object.entries(workingAssignments[currInning]).find(
                        ([pid, pos]) => pos === randomPos && pid !== randomPlayer
                    );
                    
                    if (occupant) {
                        const occupantId = occupant[0];
                        const occupantPos = occupant[1];
                        workingAssignments[currInning][randomPlayer] = randomPos;
                        workingAssignments[currInning][occupantId] = currentPos;
                    }
                }
            }
        }
        
        // Also fix the locked→unlocked boundary in this trial, if applicable.
        if (previousInningPositions) {
            for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
                const firstPos = workingAssignments[0][playerId];
                if (prevPos && prevPos !== 'Bench' && firstPos && firstPos !== 'Bench' && prevPos === firstPos) {
                    const otherPositions = fieldOnly.filter(p => p !== prevPos);
                    if (otherPositions.length > 0) {
                        const targetPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
                        const occupant = Object.entries(workingAssignments[0]).find(
                            ([pid, pos]) => pos === targetPos && pid !== playerId
                        );
                        if (occupant) {
                            workingAssignments[0][playerId] = targetPos;
                            workingAssignments[0][occupant[0]] = prevPos;
                        } else {
                            workingAssignments[0][playerId] = targetPos;
                        }
                    }
                }
            }
        }
        
        const newScore = scorePositionAssignments(workingAssignments);
        
        // If checking against a previous locked inning, add boundary penalty to score.
        let effectiveScore = newScore;
        if (previousInningPositions) {
            let boundaryScore = 0;
            for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
                const firstPos = workingAssignments[0][playerId];
                if (prevPos && prevPos !== 'Bench' && firstPos && firstPos !== 'Bench' && prevPos === firstPos) {
                    boundaryScore++;
                }
            }
            effectiveScore = { repeatScore: newScore.repeatScore + boundaryScore, benchRepeatPenalty: newScore.benchRepeatPenalty, total: newScore.total + boundaryScore };
        }
        
        if (effectiveScore.total < bestScore.total) {
            bestAssignments = workingAssignments;
            bestScore = effectiveScore;
            for (let i = 0; i < allInningsAssignments.length; i++) {
                allInningsAssignments[i] = JSON.parse(JSON.stringify(workingAssignments[i]));
            }
        }
    }
    
    return bestAssignments;
}

/**
 * Generate a lineup for a small roster (fewer than 9 players).
 * Guarantees critical positions (C, P, 1B, 2B, 3B) are always covered.
 * Every available player plays every inning — no bench.
 *
 * @param {number[]} allAvailablePlayerIds - All available players.
 * @param {number} numInnings - Number of innings to generate assignments for.
 * @param {Set<number>} [playersWhoCannotBench] - Players who have already benched in locked innings.
 * @param {Object} [previousInningPositions] - Positions from the last locked inning before the
 *                                               first unlocked inning. Maps playerId -> position.
 */
function generateSmallRosterLineup(allAvailablePlayerIds, numInnings, playersWhoCannotBench = new Set(), previousInningPositions = null) {
    const fieldOnly = POSITIONS.filter(p => p !== 'Bench');
    const numField = allAvailablePlayerIds.length;

    // With fewer than 9 players, everyone plays every inning.
    // Distribute them across all field positions, ensuring critical ones are always filled.
    const allAssignments = [];

    for (let inning = 0; inning < numInnings; inning++) {
        // Shuffle positions so players rotate through different roles
        const shuffledPositions = shuffleArray([...fieldOnly]);

        const assignment = {};
        // Assign critical positions first to guarantee coverage
        const criticalPositions = ['Catcher', 'Pitcher', '1st Base', '2nd Base', '3rd Base'];
        const availableIds = shuffleArray([...allAvailablePlayerIds]);

        // Distribute players across positions, critical positions get priority
        for (let i = 0; i < availableIds.length && i < criticalPositions.length; i++) {
            assignment[availableIds[i]] = criticalPositions[i];
        }

        // Assign remaining players to remaining field positions
        const assignedPositions = new Set(Object.values(assignment));
        const remainingPositions = shuffledPositions.filter(pos => !assignedPositions.has(pos));

        let remainingIdx = 0;
        for (const playerId of availableIds) {
            if (!assignment[playerId]) {
                if (remainingIdx < remainingPositions.length) {
                    assignment[playerId] = remainingPositions[remainingIdx];
                    remainingIdx++;
                }
            }
        }

        // Fill any gaps
        for (const playerId of allAvailablePlayerIds) {
            if (!assignment[playerId]) {
                assignment[playerId] = null;
            }
        }

        allAssignments.push(assignment);
    }

    // Fix the boundary between the last locked inning and the first unlocked inning:
    // if a player is on the field in both, make sure they don't have the same position.
    if (previousInningPositions) {
        for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
            const firstUnlockedPos = allAssignments[0][playerId];
            if (prevPos && prevPos !== 'Bench' && firstUnlockedPos && prevPos === firstUnlockedPos) {
                const otherPositions = fieldOnly.filter(p => p !== prevPos);
                if (otherPositions.length > 0) {
                    const targetPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
                    const occupant = Object.entries(allAssignments[0]).find(
                        ([pid, pos]) => pos === targetPos && pid !== playerId
                    );
                    if (occupant) {
                        allAssignments[0][playerId] = targetPos;
                        allAssignments[0][occupant[0]] = prevPos;
                    } else {
                        allAssignments[0][playerId] = targetPos;
                    }
                }
            }
        }
    }

    // Iterative improvement to reduce same-position repeats
    const iterations = 50;
    let bestAssignments = JSON.parse(JSON.stringify(allAssignments));
    let bestScore = scorePositionAssignments(bestAssignments);

    // If there's a previous locked inning, score the boundary too.
    if (previousInningPositions) {
        let boundaryScore = 0;
        for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
            const firstPos = allAssignments[0][playerId];
            if (prevPos && prevPos !== 'Bench' && firstPos && prevPos === firstPos) {
                boundaryScore++;
            }
        }
        bestScore = { repeatScore: bestScore.repeatScore + boundaryScore, benchRepeatPenalty: bestScore.benchRepeatPenalty, total: bestScore.total + boundaryScore };
    }

    for (let iter = 0; iter < iterations; iter++) {
        const workingAssignments = JSON.parse(JSON.stringify(allAssignments));

        for (let inning = 1; inning < workingAssignments.length; inning++) {

            for (let trial = 0; trial < 20; trial++) {
                const prevInning = inning - 1;
                const currInning = inning;

                const fieldPlayers = Object.keys(workingAssignments[currInning]).filter(
                    pid => workingAssignments[currInning][pid] !== 'Bench' &&
                           workingAssignments[currInning][pid] &&
                           workingAssignments[prevInning][pid] !== 'Bench' &&
                           workingAssignments[prevInning][pid]
                );
                if (fieldPlayers.length < 2) continue;

                const randomPlayer = fieldPlayers[Math.floor(Math.random() * fieldPlayers.length)];
                const currentPos = workingAssignments[currInning][randomPlayer];
                const prevPos = workingAssignments[prevInning][randomPlayer];

                if (currentPos === prevPos) {
                    const otherPositions = fieldOnly.filter(p => p !== prevPos);
                    if (otherPositions.length === 0) continue;

                    const randomPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];

                    const occupant = Object.entries(workingAssignments[currInning]).find(
                        ([pid, pos]) => pos === randomPos && pid !== randomPlayer
                    );

                    if (occupant) {
                        const occupantId = occupant[0];
                        workingAssignments[currInning][randomPlayer] = randomPos;
                        workingAssignments[currInning][occupantId] = currentPos;
                    }
                }
            }
        }

        // Also fix the locked→unlocked boundary in this trial, if applicable.
        if (previousInningPositions) {
            for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
                const firstPos = workingAssignments[0][playerId];
                if (prevPos && prevPos !== 'Bench' && firstPos && prevPos === firstPos) {
                    const otherPositions = fieldOnly.filter(p => p !== prevPos);
                    if (otherPositions.length > 0) {
                        const targetPos = otherPositions[Math.floor(Math.random() * otherPositions.length)];
                        const occupant = Object.entries(workingAssignments[0]).find(
                            ([pid, pos]) => pos === targetPos && pid !== playerId
                        );
                        if (occupant) {
                            workingAssignments[0][playerId] = targetPos;
                            workingAssignments[0][occupant[0]] = prevPos;
                        } else {
                            workingAssignments[0][playerId] = targetPos;
                        }
                    }
                }
            }
        }

        const newScore = scorePositionAssignments(workingAssignments);

        // If checking against a previous locked inning, add boundary penalty to score.
        let effectiveScore = newScore;
        if (previousInningPositions) {
            let boundaryScore = 0;
            for (const [playerId, prevPos] of Object.entries(previousInningPositions)) {
                const firstPos = workingAssignments[0][playerId];
                if (prevPos && prevPos !== 'Bench' && firstPos && prevPos === firstPos) {
                    boundaryScore++;
                }
            }
            effectiveScore = { repeatScore: newScore.repeatScore + boundaryScore, benchRepeatPenalty: newScore.benchRepeatPenalty, total: newScore.total + boundaryScore };
        }

        if (effectiveScore.total < bestScore.total) {
            bestAssignments = workingAssignments;
            bestScore = effectiveScore;
            for (let i = 0; i < allAssignments.length; i++) {
                allAssignments[i] = JSON.parse(JSON.stringify(workingAssignments[i]));
            }
        }
    }

    return bestAssignments;
}

/**
 * Smart auto-arrange that:
 * 1. Uses position rotation to avoid same-position repeats across consecutive innings
 * 2. Preserves locked innings (innings already played)
 * 3. Only regenerates unlocked innings
 * 4. Ensures each player benches at most once across ALL innings (locked + unlocked)
 * 5. Unavailable players are benched for all innings
 * 6. If fewer than 9 players: guarantees critical positions (C, P, 1B, 2B, 3B)
 */
async function autoArrangeLineup() {
    // Get available players
    const availablePlayers = players.filter(p => playerAvailability[p.id]);
    const availablePlayerIds = availablePlayers.map(p => p.id);

    // Identify unavailable players to bench for all innings
    const unavailablePlayers = players.filter(p => !playerAvailability[p.id]);
    const unavailablePlayerIds = unavailablePlayers.map(p => p.id);

    if (availablePlayers.length < 1) {
        showToast('No players are available. Mark at least one player as available.', 'error');
        return;
    }
    
    // Check how many innings are unlocked
    const unlockedInnings = [];
    for (let i = 0; i < NUM_INNINGS; i++) {
        if (!lockedInnings.has(i)) {
            unlockedInnings.push(i);
        }
    }
    
    if (unlockedInnings.length === 0) {
        showToast('All innings are locked. Unlock some innings first to re-arrange.', 'warning');
        return;
    }
    
    // Show confirmation modal before proceeding
    const unavailableCount = unavailablePlayers.length;
    const msg = unavailableCount > 0
        ? `⚠️ ${unavailableCount} player(s) are unavailable and will be benched for all innings: ${unavailablePlayers.map(p => p.name + ' #' + p.number).join(', ')}.`
        : '';
    const rosterMsg = availablePlayers.length < NUM_PLAYERS_ON_FIELD
        ? ` Only ${availablePlayers.length}/9 players are available. Critical positions (C, P, 1B, 2B, 3B) will always be covered.`
        : '';
    const confirmed = await showConfirm(
        '⚡ Auto Arrange Lineup',
        `${msg}${rosterMsg}
${unlockedInnings.length < NUM_INNINGS
    ? `This will re-arrange positions for unlocked innings (${unlockedInnings.map(i => getInningSuffix(i + 1)).join(', ')}). Locked innings will be preserved.`
    : 'This will randomly assign all available players to positions across 5 innings. Each player benches at most once (if possible), and everyone gets a chance to play.'}`,
        unavailablePlayers
    );
    
    if (!confirmed) {
        showToast('Auto arrange cancelled.', 'warning');
        return;
    }
    
    // Step 1: Bench unavailable players for ALL innings (everywhere they currently have a position)
    for (const playerId of unavailablePlayerIds) {
        if (!playerLineup[playerId]) {
            playerLineup[playerId] = {
                positions: Array(NUM_INNINGS).fill(null),
                onBench: Array(NUM_INNINGS).fill(false)
            };
        }
        for (let i = 0; i < NUM_INNINGS; i++) {
            playerLineup[playerId].positions[i] = 'Bench';
            playerLineup[playerId].onBench[i] = true;
        }
    }
    
    // Step 2: Collect players already benched in locked innings — they must NOT be benched again.
    const benchedInLockedInnings = new Set();
    for (const inning of lockedInnings) {
        for (const playerId of availablePlayerIds) {
            if (playerLineup[playerId] && playerLineup[playerId].positions[inning] === 'Bench') {
                benchedInLockedInnings.add(playerId);
            }
        }
    }
    
    // Step 2b: Find the last locked inning (by index) and collect positions from it.
    // This is used to avoid same-position repeats at the locked→unlocked boundary.
    let previousInningPositions = null;
    const sortedLockedInnings = [...lockedInnings].sort((a, b) => a - b);
    const lastLockedInning = sortedLockedInnings.length > 0
        ? sortedLockedInnings[sortedLockedInnings.length - 1]
        : -1;
    
    // If the last locked inning is just before the first unlocked inning, collect positions.
    if (lastLockedInning >= 0 && unlockedInnings.length > 0) {
        const firstUnlockedIndex = unlockedInnings[0];
        if (lastLockedInning === firstUnlockedIndex - 1) {
            previousInningPositions = {};
            for (const playerId of availablePlayerIds) {
                const pos = playerLineup[playerId]?.positions[lastLockedInning];
                if (pos) {
                    previousInningPositions[playerId] = pos;
                }
            }
        }
    }
    
    // Step 3: Generate lineup assignments based on roster size
    let allAssignments;
    if (availablePlayers.length < NUM_PLAYERS_ON_FIELD) {
        // SMALL ROSTER: fewer than 9 available players
        // Every available player plays every inning; critical positions always covered.
        allAssignments = generateSmallRosterLineup(
            availablePlayerIds,
            unlockedInnings.length,
            benchedInLockedInnings,
            previousInningPositions
        );
    } else {
        // STANDARD ROSTER: 9 or more available players
        // Normal rotation with benching.
        allAssignments = generateOptimizedLineup(
            availablePlayerIds,
            unlockedInnings.length,
            benchedInLockedInnings,
            previousInningPositions
        );
    }
    
    // Step 4: Merge: write optimized assignments into unlocked innings.
    const unlockedIndexMap = {};
    unlockedInnings.forEach((inning, idx) => {
        unlockedIndexMap[inning] = idx;
    });
    
    for (const inning of unlockedInnings) {
        const assignment = allAssignments[unlockedIndexMap[inning]];
        for (const [playerId, position] of Object.entries(assignment)) {
            if (!playerLineup[playerId]) {
                playerLineup[playerId] = {
                    positions: Array(NUM_INNINGS).fill(null),
                    onBench: Array(NUM_INNINGS).fill(false)
                };
            }
            playerLineup[playerId].positions[inning] = position;
            playerLineup[playerId].onBench[inning] = (position === 'Bench');
        }
    }
    
    // Save availability and lineup
    saveAvailability();
    saveLineup();
    renderLineupMatrix();
    renderPlayerButtons();
    
    // Show button feedback
    const originalText = autoArrangeBtn.innerHTML;
    autoArrangeBtn.innerHTML = '✓ Arranged!';
    setTimeout(() => {
        autoArrangeBtn.innerHTML = originalText;
    }, 2000);
    
    const repeatInfo = calculateRepeatStats();
    const benchMsg = availablePlayers.length < NUM_PLAYERS_ON_FIELD
        ? ` (${availablePlayers.length} players, no bench needed)`
        : '';
    showToast(
        `✅ Auto-arrange complete! ${unlockedInnings.length} inning(s) regenerated.${benchMsg} Position repeats: ${repeatInfo.repeats}/${repeatInfo.totalChecks}.` +
        (repeatInfo.repeats === 0 ? ' No same-position repeats!' : ''),
        'success'
    );
}

/**
 * Calculate statistics about position repeats across innings
 */
function calculateRepeatStats() {
    let repeats = 0;
    let totalChecks = 0;
    
    for (let inning = 1; inning < NUM_INNINGS; inning++) {
        for (const playerId of Object.keys(playerLineup)) {
            const prevPos = playerLineup[playerId].positions[inning - 1];
            const currPos = playerLineup[playerId].positions[inning];
            if (prevPos && prevPos !== 'Bench' && currPos && currPos !== 'Bench') {
                totalChecks++;
                if (prevPos === currPos) {
                    repeats++;
                }
            }
        }
    }
    
    return { repeats, totalChecks };
}

// ========================================
// INNING LOCK FUNCTIONS
// ========================================

function saveLockedInnings() {
    localStorage.setItem('walkoutLockedInnings', JSON.stringify([...lockedInnings]));
}

function loadLockedInnings() {
    const saved = localStorage.getItem('walkoutLockedInnings');
    if (saved) {
        try {
            lockedInnings = new Set(JSON.parse(saved));
        } catch (e) {
            lockedInnings = new Set();
        }
    }
}

function renderInningLockButtons() {
    const container = document.getElementById('inningLockButtons');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < NUM_INNINGS; i++) {
        const btn = document.createElement('button');
        btn.className = 'inning-lock-btn' + (lockedInnings.has(i) ? ' locked' : '');
        btn.textContent = getInningSuffix(i + 1);
        btn.addEventListener('click', () => toggleInningLock(i));
        container.appendChild(btn);
    }
}

function toggleInningLock(inning) {
    if (lockedInnings.has(inning)) {
        lockedInnings.delete(inning);
        showToast(`${getInningSuffix(inning + 1)} inning unlocked.`, 'info');
    } else {
        lockedInnings.add(inning);
        showToast(`${getInningSuffix(inning + 1)} inning locked (preserved).`, 'success');
    }
    saveLockedInnings();
    renderInningLockButtons();
    renderLineupMatrix();
}

function lockAllInnings() {
    for (let i = 0; i < NUM_INNINGS; i++) {
        lockedInnings.add(i);
    }
    saveLockedInnings();
    renderInningLockButtons();
    renderLineupMatrix();
    showToast('All innings locked.', 'success');
}

function unlockAllInnings() {
    lockedInnings.clear();
    saveLockedInnings();
    renderInningLockButtons();
    renderLineupMatrix();
    showToast('All innings unlocked.', 'info');
}

// ========================================
// LINEUP FUNCTIONS
// ========================================

// Current player for position assignment
let currentPlayerForPosition = null;
let currentInningForPosition = null;

// Setup lineup view
function setupLineupView() {
    lineupBtn.addEventListener('click', () => {
        lineupBtn.classList.add('active');
        songsViewBtn.classList.remove('active');
        battingOrderBtn.classList.remove('active');
        lineupView.style.display = 'block';
        songsView.style.display = 'none';
        battingOrderView.style.display = 'none';
        renderInningLockButtons();
        renderLineupMatrix();
    });
    
    setupLineupControls();
    loadLineup();
    setupPositionAssignment();
    setupInningLockControls();
}

// Setup inning lock controls
function setupInningLockControls() {
    const lockAllBtn = document.getElementById('lockAllInningsBtn');
    const unlockAllBtn = document.getElementById('unlockAllInningsBtn');
    
    lockAllBtn.addEventListener('click', lockAllInnings);
    unlockAllBtn.addEventListener('click', unlockAllInnings);
}

// Setup lineup controls
function setupLineupControls() {
    autoArrangeBtn.addEventListener('click', autoArrangeLineup);
    document.getElementById('validateLineupBtn').addEventListener('click', validateAndShowResults);
    saveLineupBtn.addEventListener('click', saveLineup);
    document.getElementById('resetLineupBtn').addEventListener('click', resetLineup);
}

// Validate lineup and show results in the matrix info area
function validateAndShowResults() {
    const result = validateLineup();
    
    // Build validation HTML
    let validationHTML = '<div class="validation-summary">';
    
    if (result.errors.length > 0) {
        validationHTML += '<h4 style="color: #dc3545; margin-bottom: 10px;">❌ Errors Found</h4>';
        result.errors.forEach(err => {
            validationHTML += `<div class="inning-check invalid"><span class="check-icon">✗</span> ${err}</div>`;
        });
    }
    
    if (result.warnings.length > 0) {
        validationHTML += '<h4 style="color: #ffc107; margin: 10px 0;">⚠️ Warnings</h4>';
        result.warnings.forEach(warn => {
            validationHTML += `<div class="inning-check invalid"><span class="check-icon">!</span> ${warn}</div>`;
        });
    }
    
    // Show per-inning breakdown
    validationHTML += '<h4 style="color: #1e3c72; margin: 15px 0 8px 0;">📊 Inning Breakdown</h4>';
    result.inningDetails.forEach(detail => {
        const icon = detail.valid ? '<span class="check-icon" style="color: #28a745">✓</span>' : '<span class="check-icon" style="color: #dc3545">✗</span>';
        let details = '';
        
        if (detail.benchCount === 1) {
            details += '1 bench ✓';
        } else {
            details += `${detail.benchCount} benches ⚠️`;
        }
        
        if (detail.duplicates && detail.duplicates.length > 0) {
            const dupList = detail.duplicates.map(d => d[0]).join(', ');
            details += ` | Duplicates: ${dupList}`;
        }
        
        validationHTML += `<div class="inning-check ${detail.valid ? 'valid' : 'invalid'}">${icon} Inning ${detail.inning}: ${details}</div>`;
    });
    
    // Add position repeat stats
    const repeatStats = calculateRepeatStats();
    validationHTML += '<h4 style="color: #007bff; margin: 15px 0 8px 0;">🔄 Position Repeats</h4>';
    validationHTML += `<div class="inning-check ${repeatStats.repeats === 0 ? 'valid' : 'invalid'}">${repeatStats.repeats === 0 ? '<span class="check-icon" style="color: #28a745">✓</span>' : '<span class="check-icon" style="color: #ffc107">!</span>'} ${repeatStats.repeats} repeat(s) across consecutive innings (${repeatStats.totalChecks} total checks)</div>`;
    
    if (result.errors.length === 0 && result.warnings.length === 0 && repeatStats.repeats === 0) {
        validationHTML += '<div class="inning-check valid"><span class="check-icon">✓</span> Lineup is valid! All available players assigned each inning, 9 unique field positions, no position repeats.</div>';
    }
    
    validationHTML += '</div>';
    
    // Update the lineup-info area with validation results
    const lineupInfo = document.querySelector('.lineup-info');
    if (lineupInfo) {
        lineupInfo.innerHTML = '<div style="margin-bottom: 8px;"><strong>🔍 Validation Results:</strong></div>' + validationHTML;
    }
    
    // Show toast summary
    if (result.errors.length > 0) {
        showToast(`Found ${result.errors.length} error(s) in the lineup. See details below.`, 'error');
    } else if (result.warnings.length > 0) {
        showToast(`Lineup has ${result.warnings.length} warning(s). Check details below.`, 'warning');
    } else {
        showToast('✅ Lineup is valid!', 'success');
    }
}

// Render position buttons for the assignment modal
function renderPositionButtons(fromInningSelector = false) {
    const positionButtonsContainer = document.getElementById('positionButtons');
    const modal = document.getElementById('positionAssignmentModal');
    if (!positionButtonsContainer) return;

    positionButtonsContainer.innerHTML = '';

    // If no specific inning was targeted, show the inning selector so user can choose
    if (!fromInningSelector && currentInningForPosition === null) {
        const selectorDiv = document.createElement('div');
        selectorDiv.className = 'inning-selector';
        selectorDiv.innerHTML = '<span>Select Inning:</span>';
        for (let i = 1; i <= NUM_INNINGS; i++) {
            const inningBtn = document.createElement('button');
            inningBtn.className = 'inning-btn';
            inningBtn.textContent = i + (i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th') + ' Inning';
            inningBtn.addEventListener('click', () => {
                currentInningForPosition = i;
                selectorDiv.style.display = 'none';
                renderPositionButtons(true);
            });
            selectorDiv.appendChild(inningBtn);
        }
        positionButtonsContainer.appendChild(selectorDiv);
    }

    // If the inning came from the selector, show the "Assign to Selected Inning" button
    if (fromInningSelector && currentInningForPosition !== null) {
        const label = getInningSuffix(currentInningForPosition);
        const assignBtn = document.createElement('button');
        assignBtn.className = 'position-btn select-inning-btn';
        assignBtn.textContent = `Assign to ${label}`;
        assignBtn.addEventListener('click', () => {
            if (currentPlayerForPosition !== null && currentInningForPosition !== null) {
                assignPositionToPlayer(currentPlayerForPosition, POSITIONS[0], false, currentInningForPosition);
                modal.style.display = 'none';
                currentPlayerForPosition = null;
                currentInningForPosition = null;
            }
        });
        positionButtonsContainer.appendChild(assignBtn);
    }

    // Add position buttons
    POSITIONS.forEach(position => {
        const btn = document.createElement('button');
        btn.className = 'position-btn';
        btn.textContent = position;
        btn.addEventListener('click', () => {
            if (currentPlayerForPosition !== null && currentInningForPosition !== null) {
                assignPositionToPlayer(currentPlayerForPosition, position, false, currentInningForPosition);
                modal.style.display = 'none';
                currentPlayerForPosition = null;
                currentInningForPosition = null;
            }
        });
        positionButtonsContainer.appendChild(btn);
    });

    // Add cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'position-btn cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        currentPlayerForPosition = null;
        currentInningForPosition = null;
    });
    positionButtonsContainer.appendChild(cancelBtn);
}

// Setup position assignment modal
function setupPositionAssignment() {
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('positionAssignmentModal');

    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        currentPlayerForPosition = null;
        currentInningForPosition = null;
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            currentPlayerForPosition = null;
            currentInningForPosition = null;
        }
    });
}

// Open position assignment modal
function openPositionAssignmentModal(playerId, inningOverride = null) {
    const modal = document.getElementById('positionAssignmentModal');
    const modalPlayerName = document.getElementById('modalPlayerName');
    const positionButtonsContainer = document.getElementById('positionButtons');
    const inningSelector = positionButtonsContainer.querySelector('.inning-selector');
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    currentPlayerForPosition = playerId;
    // Preserve the target inning if provided (e.g., from togglePlayerInInning)
    currentInningForPosition = inningOverride;
    
    modalPlayerName.textContent = `${player.name} (#${player.number})`;
    modal.style.display = 'block';
    
    // If an inning was already specified (e.g., from a cell click), skip the inning selector
    if (inningOverride !== null) {
        renderPositionButtons(true);
    } else {
        renderPositionButtons(false);
    }
}

// Load lineup from localStorage
function loadLineup() {
    // Load locked innings
    loadLockedInnings();

    const savedLineup = localStorage.getItem('walkoutPlayerLineup');
    if (savedLineup) {
        try {
            playerLineup = JSON.parse(savedLineup);
        } catch (e) {
            playerLineup = {};
        }
    }

    // Ensure every player has a lineup entry (positions + onBench arrays)
    players.forEach(player => {
        if (!playerLineup[player.id]) {
            playerLineup[player.id] = {
                positions: Array(NUM_INNINGS).fill(null),
                onBench: Array(NUM_INNINGS).fill(false)
            };
        }
    });
}

// Auto arrange lineup: All available players must play each inning
// For little league rotation system: 9 players on field, rest on bench, everyone assigned a position each inning
// NOTE: This function is now replaced by the refined autoArrangeLineup() above
// Kept for backwards compatibility if needed

// Render lineup matrix
function renderLineupMatrix() {
    lineupMatrixContent.innerHTML = '';
    
    // In Little League, show ALL players in the matrix — everyone gets a turn
    // The availability toggle doesn't hide players from the lineup
    const sortedPlayers = getSortedPlayers();
    
    sortedPlayers.forEach(player => {
        const playerData = playerLineup[player.id] || {
            positions: Array(NUM_INNINGS).fill(null),
            onBench: Array(NUM_INNINGS).fill(false)
        };
        
        const row = document.createElement('div');
        row.className = 'matrix-row';
        row.setAttribute('data-player-id', player.id);
        
        // Determine if this player is in the active 9-man lineup or benched
        const isInActiveRoster = playerData.positions.some(pos => pos !== null);
        const isBenchRoster = playerData.onBench.every(b => b) && !isInActiveRoster;
        
        // Player name cell with click handler for manual position assignment
        const nameCell = document.createElement('div');
        nameCell.className = 'matrix-cell player-name';
        nameCell.innerHTML = `
            <div class="player-name-content">
                <span class="player-name-text">${escapeHtml(player.name)}</span>
                <span class="player-number">#${escapeHtml(player.number)}</span>
                ${!playerAvailability[player.id] ? '<span class="unavailable-badge">❌ Unavailable</span>' : ''}
                ${isInActiveRoster ? '<span class="active-roster-badge">Active Roster</span>' : ''}
                ${isBenchRoster ? '<span class="bench-roster-badge">Bench Roster</span>' : ''}
            </div>
        `;
        // Add click handler to open position assignment modal
        nameCell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!playerAvailability[player.id]) return; // Can't assign unavailable players
            openPositionAssignmentModal(player.id);
        });
        row.appendChild(nameCell);
        
        // Innings cells
        for (let inning = 0; inning < NUM_INNINGS; inning++) {
            const inningCell = document.createElement('div');
            inningCell.className = 'matrix-cell inning-cell';
            inningCell.setAttribute('data-inning', inning + 1);
            inningCell.setAttribute('data-player-id', player.id);
            
            // Add locked indicator if this inning is locked
            if (lockedInnings.has(inning)) {
                inningCell.classList.add('locked-inning');
            }
            
            const position = playerData.positions[inning];
            
            if (position === 'Bench') {
                // Player is on bench for this inning
                inningCell.classList.add('bench-cell');
                inningCell.innerHTML = '<span class="bench-badge">BN</span>';
                inningCell.title = `On Bench${(lockedInnings.has(inning) ? ' (LOCKED)' : '')}`;
            } else if (position) {
                // Player is playing this inning at a field position
                inningCell.classList.add('playing');
                const abbr = POSITION_ABBREVS[position] || position;
                inningCell.innerHTML = `<span class="position-badge">${abbr}</span>`;
                inningCell.title = `${position} (Inning ${inning + 1})${(lockedInnings.has(inning) ? ' (LOCKED)' : '')}`;
            } else {
                // No position assigned — not playing this inning
                inningCell.classList.add('not-playing');
                inningCell.innerHTML = '<span class="no-badge">–</span>';
                inningCell.title = `No position assigned (Inning ${inning + 1})${(lockedInnings.has(inning) ? ' (LOCKED)' : '')}`;
            }
            
            // Add click handler to toggle position
            inningCell.addEventListener('click', () => togglePlayerInInning(player.id, inning + 1, inningCell));
            row.appendChild(inningCell);
        }
        
        // Bench summary column
        const benchCell = document.createElement('div');
        benchCell.className = 'matrix-cell';
        let benchCount = 0;
        for (let i = 0; i < NUM_INNINGS; i++) {
            if (playerData.positions[i] === 'Bench') benchCount++;
        }
        if (benchCount > 0) {
            benchCell.innerHTML = `<span class="bench-badge">${benchCount} BN</span>`;
            benchCell.title = `Benched ${benchCount} time(s)`;
        } else {
            benchCell.innerHTML = '<span class="no-badge">–</span>';
            benchCell.title = 'Never benched';
        }
        row.appendChild(benchCell);
        
        lineupMatrixContent.appendChild(row);
    });
    
    // Render header with locked indicators
    renderLineupHeader();
}

function renderLineupHeader() {
    const header = document.querySelector('.matrix-header');
    if (!header) return;
    
    const inningHeaders = header.querySelectorAll('.inning-header');
    inningHeaders.forEach((headerEl, idx) => {
        if (lockedInnings.has(idx)) {
            headerEl.classList.add('locked');
        } else {
            headerEl.classList.remove('locked');
        }
    });
}

// Toggle player position/availability in an inning
function togglePlayerInInning(playerId, inning, cell) {
    if (!playerAvailability[playerId]) {
        return; // Can't modify unavailable players
    }
    
    // Check if this inning is locked
    const inningIndex = inning - 1;
    if (lockedInnings.has(inningIndex)) {
        showToast(`⚠️ ${getInningSuffix(inning)} inning is locked. Unlock it first to make changes.`, 'warning');
        return;
    }
    
    const playerData = playerLineup[playerId];
    if (!playerData) return;
    
    const currentPosition = playerData.positions[inning - 1];
    
    // Toggle playing status
    if (currentPosition) {
        // Remove from playing — set bench position for this inning only
        // In Little League, bench is per-inning, not permanent
        playerData.positions[inning - 1] = 'Bench';
        // Re-render the entire matrix to keep DOM in sync with data
        saveLineup();
        renderLineupMatrix();
    } else {
        // Add to playing - open position assignment modal for this specific inning
        openPositionAssignmentModal(playerId, inning);
    }
}

// Assign position to player
async function assignPositionToPlayer(playerId, position, force = false, inningOverride = null) {
    const playerData = playerLineup[playerId];
    if (!playerData) return;
    
    const player = players.find(p => p.id === playerId);
    
    // If position is 'All Innings', assign same position to all innings
    if (position === 'All Innings') {
        // Use the first position from current positions if available, otherwise use default
        const firstPosition = playerData.positions[0] || 'Catcher';
        
        // Check for position conflicts across all innings
        let conflictPlayer = null;
        for (const [pid, data] of Object.entries(playerLineup)) {
            if (parseInt(pid) !== playerId && data.positions.includes(firstPosition)) {
                conflictPlayer = players.find(p => p.id == pid);
                break;
            }
        }
        
        // Handle conflicts with override option
        if (conflictPlayer && !force) {
            // Ask user via custom confirmation modal
            const result = await showConfirm(
                'Position Conflict',
                `Player "${conflictPlayer.name}" is already using ${firstPosition} (across all innings). Override and move them to bench?`,
                [conflictPlayer]
            );
            
            if (result) {
                // User wants to override - move conflict player to bench
                playerLineup[conflictPlayer.id].positions = Array(NUM_INNINGS).fill(null);
                playerLineup[conflictPlayer.id].onBench = Array(NUM_INNINGS).fill(true);
                showToast(
                    `✅ ${player.name} assigned ${firstPosition} for all innings`,
                    'success',
                    [conflictPlayer]
                );
            } else {
                showToast('Assignment cancelled.', 'warning');
                return; // Cancel assignment
            }
        } else if (conflictPlayer && force) {
            // Force mode - automatically override without confirmation
            playerLineup[conflictPlayer.id].positions = Array(NUM_INNINGS).fill(null);
            playerLineup[conflictPlayer.id].onBench = Array(NUM_INNINGS).fill(true);
        }
        
        // Assign position to all innings (skip locked ones)
        for (let i = 0; i < NUM_INNINGS; i++) {
            if (lockedInnings.has(i)) continue; // Preserve locked innings
            playerData.positions[i] = firstPosition;
            playerData.onBench[i] = false;
        }
        saveLineup();
        renderLineupMatrix();
        return;
    }
    
    // If inningOverride is null, we need to determine which inning to assign
    if (inningOverride === null && currentInningForPosition === null) {
        showToast('Please select an inning first.', 'error');
        return;
    }
    
    const inning = inningOverride !== null ? inningOverride : currentInningForPosition;
    const inningIndex = inning - 1;
    
    // Check if this inning is locked
    if (lockedInnings.has(inningIndex)) {
        showToast(`⚠️ ${getInningSuffix(inning)} inning is locked. Unlock it first to make changes.`, 'warning');
        return;
    }
    
    // Check for position conflicts in this specific inning
    let conflictPlayer = null;
    for (const [pid, data] of Object.entries(playerLineup)) {
        if (parseInt(pid) !== playerId && data.positions[inning - 1] === position) {
            conflictPlayer = players.find(p => p.id == pid);
            break;
        }
    }
    
    // Handle conflicts with override option
    if (conflictPlayer && !force) {
        // Ask user via custom confirmation modal
        const result = await showConfirm(
            'Position Conflict',
            `${conflictPlayer.name} is already at ${position} for the ${getInningSuffix(inning)} inning. Override and move them to bench for this inning?`,
            [conflictPlayer]
        );
        
        if (result) {
            // User wants to override - move conflict player to bench for this specific inning only
            // (preserving their assignments in other innings)
            playerLineup[conflictPlayer.id].positions[inning - 1] = 'Bench';
            showToast(
                `✅ ${player.name} assigned ${position} (Inn. ${inning})`,
                'success',
                [conflictPlayer]
            );
        } else {
            showToast('Assignment cancelled.', 'warning');
            return; // Cancel assignment
        }
    } else if (conflictPlayer && force) {
        // Force mode - automatically override without confirmation
        playerLineup[conflictPlayer.id].positions[inning - 1] = 'Bench';
    }
    
    // Assign position to specific inning
    playerData.positions[inning - 1] = position;
    
    saveLineup();
    renderLineupMatrix();
}

// Save lineup to localStorage
function saveLineup() {
    localStorage.setItem('walkoutPlayerLineup', JSON.stringify(playerLineup));
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));

    // Show confirmation if the save button is visible
    if (saveLineupBtn) {
        const originalText = saveLineupBtn.innerHTML;
        saveLineupBtn.innerHTML = '✓ Saved!';
        setTimeout(() => {
            saveLineupBtn.innerHTML = originalText;
        }, 2000);
    }
}

// Reset lineup
async function resetLineup() {
    const confirmed = await showConfirm(
        'Reset Lineup',
        'This will reset all positions, bench assignments, and player availability to default. This cannot be undone.',
        []
    );
    
    if (confirmed) {
        playerLineup = {};
        players.forEach(player => {
            playerLineup[player.id] = {
                positions: Array(NUM_INNINGS).fill(null),
                onBench: Array(NUM_INNINGS).fill(false)
            };
        });
        // Reset availability to all true
        players.forEach(player => {
            playerAvailability[player.id] = true;
        });
        // Reset locked innings
        lockedInnings.clear();
        saveLockedInnings();
        localStorage.removeItem('walkoutPlayerLineup');
        localStorage.removeItem('walkoutPlayerAvailability');
        saveLineup();
        renderInningLockButtons();
        renderLineupMatrix();
        renderPlayerButtons();
        showToast('Lineup reset to default.', 'success');
    } else {
        showToast('Reset cancelled.', 'warning');
    }
}

// ========================================
// BATTING ORDER FUNCTIONS
// ========================================

// Setup view toggles
function setupViewToggles() {
    const songsViewBtn = document.getElementById('songsViewBtn');
    const battingOrderBtn = document.getElementById('battingOrderBtn');
    const lineupBtn = document.getElementById('lineupBtn');
    const gameViewBtn = document.getElementById('gameViewBtn');
    const songsView = document.getElementById('songsView');
    const battingOrderView = document.getElementById('battingOrderView');
    const lineupView = document.getElementById('lineupView');
    const gameView = document.getElementById('gameView');

    function showView(activeBtn, viewToShow) {
        songsViewBtn.classList.toggle('active', activeBtn === songsViewBtn);
        battingOrderBtn.classList.toggle('active', activeBtn === battingOrderBtn);
        lineupBtn.classList.toggle('active', activeBtn === lineupBtn);
        gameViewBtn.classList.toggle('active', activeBtn === gameViewBtn);
        songsView.style.display = viewToShow === 'songs' ? 'block' : 'none';
        battingOrderView.style.display = viewToShow === 'batting' ? 'block' : 'none';
        lineupView.style.display = viewToShow === 'lineup' ? 'block' : 'none';
        gameView.style.display = viewToShow === 'game' ? 'block' : 'none';
    }

    songsViewBtn.addEventListener('click', () => {
        showView(songsViewBtn, 'songs');
        localStorage.setItem('walkoutActiveView', 'songs');
    });
    battingOrderBtn.addEventListener('click', () => {
        showView(battingOrderBtn, 'batting');
        localStorage.setItem('walkoutActiveView', 'batting');
    });
    lineupBtn.addEventListener('click', () => {
        showView(lineupBtn, 'lineup');
        localStorage.setItem('walkoutActiveView', 'lineup');
        renderInningLockButtons();
        renderLineupMatrix();
    });
    gameViewBtn.addEventListener('click', () => {
        showView(gameViewBtn, 'game');
        localStorage.setItem('walkoutActiveView', 'game');
    });

    // Restore last active view
    const savedView = localStorage.getItem('walkoutActiveView');
    if (savedView) {
        switch (savedView) {
            case 'songs': showView(songsViewBtn, 'songs'); break;
            case 'batting': showView(battingOrderBtn, 'batting'); break;
            case 'lineup':
                showView(lineupBtn, 'lineup');
                renderInningLockButtons();
                renderLineupMatrix();
                break;
            case 'game': showView(gameViewBtn, 'game'); break;
        }
    }
}

// Setup batting order controls
function setupBattingOrderControls() {
    const resetOrderBtn = document.getElementById('resetOrderBtn');
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    
    resetOrderBtn.addEventListener('click', resetBattingOrder);
    saveOrderBtn.addEventListener('click', saveBattingOrder);
    
    showUnavailableToggle.addEventListener('change', (e) => {
        localStorage.setItem('walkoutShowUnavailable', e.target.checked);
        renderBattingOrder();
        renderPlayerButtons();
    });
}

// Render batting order list
function renderBattingOrder() {
    battingOrderList.innerHTML = '';
    
    // Get sorted players
    const sortedPlayers = getSortedPlayers();
    const showUnavailable = showUnavailableToggle.checked;
    
       sortedPlayers.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'batting-order-item';
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-id', player.id);
        
        if (!playerAvailability[player.id]) {
            item.classList.add('unavailable');
        }
        
        const position = index + 1;
        
        item.innerHTML = `
            <div class="position-number">${position}</div>
            <div class="player-info">
                <div class="player-name">${escapeHtml(player.name)}</div>
                <div class="player-number">#${escapeHtml(player.number)}</div>
                <div class="player-song">"${escapeHtml(player.song)}"</div>
            </div>
            <div class="availability-toggle">
                <label>
                    <input type="checkbox" ${playerAvailability[player.id] ? 'checked' : ''} 
                           data-player-id="${player.id}">
                    Available
                </label>
            </div>
            <div class="move-buttons">
                <button class="move-btn" data-direction="up" data-player-id="${player.id}" 
                        ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="move-btn" data-direction="down" data-player-id="${player.id}" 
                        ${index === sortedPlayers.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
        `;
        
        // Add event listeners - In batting order view, clicking doesn't play songs
        item.addEventListener('click', (e) => {
            // Don't select player if clicking on availability toggle or move buttons
            if (e.target.closest('.availability-toggle') || e.target.closest('.move-buttons')) {
                return;
            }
            // In batting order view, don't play songs - just show info
            // Users should use Songs View to play music
        });
        
        // Availability toggle
        const availCheckbox = item.querySelector('.availability-toggle input');
        availCheckbox.addEventListener('change', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            playerAvailability[player.id] = e.target.checked;
            renderBattingOrder();
            renderPlayerButtons();
            
            // Save to localStorage
            saveAvailability();
        });
        
        // Move buttons
        item.querySelectorAll('.move-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const direction = btn.getAttribute('data-direction');
                movePlayerInOrder(player.id, direction);
            });
        });
        
        // Drag and drop events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        
        battingOrderList.appendChild(item);
    });
    
      // Setup drop zone for the list - attach only once; renderBattingOrder re-runs
      // on every state change, so re-adding these would accumulate duplicate listeners.
    if (!battingOrderList._dragSetup) {
       battingOrderList._dragSetup = true;
       battingOrderList.addEventListener('dragover', (e) => {
          e.preventDefault();
          battingOrderList.classList.add('drag-over');
           });
       battingOrderList.addEventListener('dragleave', () => {
          battingOrderList.classList.remove('drag-over');
           });
       battingOrderList.addEventListener('drop', (e) => {
          battingOrderList.classList.remove('drag-over');
           });
       }
}

// Move player up or down in batting order
function movePlayerInOrder(playerId, direction) {
    const sortedPlayers = getSortedPlayers();
    const currentIndex = sortedPlayers.findIndex(p => p.id === playerId);

    if (currentIndex === -1) return;

    let newIndex;
    if (direction === 'up') {
        newIndex = currentIndex - 1;
    } else {
        newIndex = currentIndex + 1;
    }

    // Swap in the sorted array
    const temp = sortedPlayers[currentIndex];
    sortedPlayers[currentIndex] = sortedPlayers[newIndex];
    sortedPlayers[newIndex] = temp;

    // Update batting order
    battingOrder = sortedPlayers.map(p => p.id);

    // Sync with game tracking if a game is in progress
    if (typeof gameState !== 'undefined' && gameState && gameState.gameStarted) {
        gameState.currentBattingOrder = [...battingOrder];
        if (typeof saveGameState === 'function') saveGameState();
    }

    // Save batting order to localStorage so it persists on refresh
    saveBattingOrder();

    renderBattingOrder();
    renderPlayerButtons();
}

// Drag and Drop handlers
let draggedPlayerId = null;
let draggedElement = null;
let originalBattingOrder = [];

function handleDragStart(e) {
    draggedPlayerId = this.getAttribute('data-id');
    draggedElement = this;
    originalBattingOrder = [...battingOrder];
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    battingOrderList.querySelectorAll('.batting-order-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedPlayerId = null;
    draggedElement = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (this.getAttribute('data-id') === draggedPlayerId) return;
    
    const rect = this.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const height = rect.height;
    
    if (mouseY < height / 2) {
        this.parentNode.insertBefore(draggedElement, this);
    } else {
        this.parentNode.insertBefore(draggedElement, this.nextSibling);
    }
}

function handleDrop(e) {
    e.preventDefault();

    if (!draggedPlayerId) return;

    // If drag didn't change order, just restore original and bail
    const items = battingOrderList.querySelectorAll('.batting-order-item');
    const newOrder = [];
    items.forEach(item => {
        const playerId = parseInt(item.getAttribute('data-id'));
        newOrder.push(playerId);
    });

    // Only update if order actually changed
    if (JSON.stringify(newOrder) !== JSON.stringify(originalBattingOrder)) {
        battingOrder = newOrder;

        // Sync with game tracking if a game is in progress
        if (typeof gameState !== 'undefined' && gameState && gameState.gameStarted) {
            gameState.currentBattingOrder = [...battingOrder];
            if (typeof saveGameState === 'function') saveGameState();
        }

        // Save batting order to localStorage so it persists on refresh
        saveBattingOrder();

        renderBattingOrder();
        renderPlayerButtons();
    }
}

// Save batting order to localStorage
function saveBattingOrder() {
    localStorage.setItem('walkoutBattingOrder', JSON.stringify(battingOrder));
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));

    // Show confirmation if the save button is visible
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    if (saveOrderBtn) {
        const originalText = saveOrderBtn.innerHTML;
        saveOrderBtn.innerHTML = '✓ Saved!';
        setTimeout(() => {
            saveOrderBtn.innerHTML = originalText;
        }, 2000);
    }
}

// Load batting order from localStorage
function loadBattingOrder() {
    const savedOrder = localStorage.getItem('walkoutBattingOrder');
    const savedAvailability = localStorage.getItem('walkoutPlayerAvailability');
    
    if (savedOrder) {
        try {
            battingOrder = JSON.parse(savedOrder);
        } catch (e) {
            battingOrder = [];
        }
    }
    
    if (savedAvailability) {
        try {
            const avail = JSON.parse(savedAvailability);
            playerAvailability = { ...playerAvailability, ...avail };
        } catch (e) {
            // Keep defaults
        }
    }
}

// Reset batting order to default (by player ID)
async function resetBattingOrder() {
    const confirmed = await showConfirm(
        'Reset Batting Order',
        'This will reset the batting order to default and make all players available. This cannot be undone.',
        []
    );
    
    if (confirmed) {
        battingOrder = [];
        localStorage.removeItem('walkoutBattingOrder');
        
        // Reset availability to all true
        players.forEach(player => {
            playerAvailability[player.id] = true;
        });
        localStorage.removeItem('walkoutPlayerAvailability');
        
        renderBattingOrder();
        renderPlayerButtons();
        showToast('Batting order reset to default.', 'success');
    } else {
        showToast('Reset cancelled.', 'warning');
    }
}

// Save availability to localStorage
function saveAvailability() {
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));
}

// Get players sorted by current batting order
function getSortedPlayers() {
    // When a game is in progress, use the game's batting order so the
    // Batting Order tab stays in sync with Game Tracking.
    const activeOrder = (typeof gameState !== 'undefined' && gameState && gameState.gameStarted && gameState.currentBattingOrder.length > 0)
        ? gameState.currentBattingOrder
        : battingOrder;

    if (activeOrder.length === 0) {
        return [...players];
    }

    // Create a map for quick lookup
    const playerMap = {};
    players.forEach(player => {
        playerMap[player.id] = player;
    });

    // Sort by batting order
    const sorted = [...activeOrder].map(id => playerMap[id]).filter(p => p);

    // Add any players not in the batting order
    const orderedIds = new Set(activeOrder);
    const remainingPlayers = players.filter(p => !orderedIds.has(p.id));

    return [...sorted, ...remainingPlayers];
}

// ========================================
// PLAYER BUTTONS (SONGS VIEW)
// ========================================

// Render player buttons in the Songs View grid
function renderPlayerButtons() {
    if (!playerGrid) return;
    playerGrid.innerHTML = '';

    const sortedPlayers = getSortedPlayers();
    const showUnavailable = showUnavailableToggle.checked;

    sortedPlayers.forEach(player => {
        const btn = document.createElement('button');
        btn.className = 'player-btn';
        btn.setAttribute('data-id', player.id);

        if (!playerAvailability[player.id]) {
            btn.classList.add('unavailable');
        }

        btn.innerHTML = `
            ${escapeHtml(player.name)}
            <span class="player-number">#${escapeHtml(player.number)}</span>
        `;

        // Only allow clicking available players
        if (playerAvailability[player.id]) {
            btn.addEventListener('click', () => selectPlayer(player));
        }

        playerGrid.appendChild(btn);
    });
}

// ========================================
// AUDIO & PLAYER FUNCTIONS
// ========================================

// Select a player
function selectPlayer(player) {
    // Remove active class from all buttons
    document.querySelectorAll('.player-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`[data-id="${player.id}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Update current player
    currentPlayer = player;
    currentPlayerName.textContent = `${player.name} (#${player.number})`;
    currentSongTitle.textContent = `Song: "${player.song}"`;
    
    // Load audio file
    audioPlayer.src = player.audioFile;
    
    // Enable controls
    playBtn.disabled = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    
    // Announce and play
    announceAndPlay(player);
}

// Play audio
function playAudio() {
    if (currentPlayer) {
        // Connect the audio element's source to the Web Audio API gain node
        if (audioCtx && !songSource) {
            try {
                songSource = audioCtx.createMediaElementSource(audioPlayer);
                songSource.connect(songGainNode);
            } catch (e) {
                // Source already connected, ignore
                if (e.name !== 'NotSupportedError') {
                    console.warn('Media element source already connected:', e);
                }
            }
        }
        
        audioPlayer.play().catch(error => {
            console.error('Error playing audio:', error);
            alert('Please place your audio files in the "audio" folder. Check the README for setup instructions.');
        });
        pauseBtn.disabled = false;
        playBtn.disabled = true;
    }
}

// Pause audio
function pauseAudio() {
    cancelCrossFade();
    audioPlayer.pause();
    // Stop the announcer so it doesn't keep talking under a paused song
    if (announcerPlayer) announcerPlayer.pause();
    pauseBtn.disabled = true;
    playBtn.disabled = false;
}

// Stop audio
function stopAudio() {
    cancelCrossFade();
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    // Stop and reset the announcer too
    if (announcerPlayer) {
       announcerPlayer.pause();
       announcerPlayer.currentTime = 0;
    }
    // Reset gain to 0
    if (songGainNode && audioCtx) {
       songGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
       songGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    }
    pauseBtn.disabled = true;
    playBtn.disabled = false;
}

// Event listeners
playBtn.addEventListener('click', playAudio);
pauseBtn.addEventListener('click', pauseAudio);
stopBtn.addEventListener('click', stopAudio);

// Handle audio ended
audioPlayer.addEventListener('ended', () => {
    pauseBtn.disabled = true;
    playBtn.disabled = false;
});

// Initialize announcer
function initAnnouncer() {
    const volumeSlider = document.getElementById('announcerVolume');
    const toggle = document.getElementById('announcerToggle');
    const volumeValue = document.getElementById('volumeValue');
    
    // Load saved announcer settings
    const savedAnnouncerEnabled = localStorage.getItem('walkoutAnnouncerEnabled');
    if (savedAnnouncerEnabled !== null) {
        announcerEnabled = savedAnnouncerEnabled === 'true';
        toggle.checked = announcerEnabled;
    }
    const savedAnnouncerVolume = localStorage.getItem('walkoutAnnouncerVolume');
    if (savedAnnouncerVolume !== null) {
        announcerVolume = parseFloat(savedAnnouncerVolume);
        volumeSlider.value = Math.round(announcerVolume * 100);
        volumeValue.textContent = `${Math.round(announcerVolume * 100)}%`;
    }

    // Toggle announcer
    toggle.addEventListener('change', (e) => {
        announcerEnabled = e.target.checked;
        localStorage.setItem('walkoutAnnouncerEnabled', announcerEnabled);
    });

    // Volume control
    volumeSlider.addEventListener('input', (e) => {
        announcerVolume = e.target.value / 100;
        volumeValue.textContent = `${e.target.value}%`;
        announcerPlayer.volume = announcerVolume;
        localStorage.setItem('walkoutAnnouncerVolume', announcerVolume);
    });

    // Set initial volume
    announcerPlayer.volume = announcerVolume;
    
 
}

// ========================================
// CROSS-FADE AUDIO (Web Audio API)
// ========================================

/**
 * Initialize Web Audio API context and set up gain nodes for cross-fading.
 */
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create a gain node for the song (walkout music)
        songGainNode = audioCtx.createGain();
        songGainNode.connect(audioCtx.destination);
        
        // Start with song at 0 volume
        songGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    }
}

/**
 * Schedule the crossfade: fade song in while the announcer speaks, reaching full volume
 * only after the announcer finishes.
 *
 * @param {number} [announcerDuration] - Duration of the announcer audio in seconds.
 *   The song will be at ~25% volume during the announcer's speech so the player's name
 *   is clear, then fade to 100% volume after the announcer ends.
 */
function scheduleCrossFade(announcerDuration) {
    if (!currentPlayer) return;

    const FADE_OUT_DURATION = 6; // seconds to fade song out after song has been playing

    const now = audioCtx.currentTime;

    // Cancel any pending gain automation first so re-entrant calls
     // (e.g. a stale duration scheduling twice) can't leave conflicting ramps queued.
    songGainNode.gain.cancelScheduledValues(now);

    // Set song gain to 0 at the start
    songGainNode.gain.setValueAtTime(0, now);

    if (announcerDuration && announcerDuration > 0) {
        // Fade song in from 0 to 25% volume DURING the announcer's speech
        // This keeps the player's name audible over the music
        songGainNode.gain.linearRampToValueAtTime(0.25, now + announcerDuration);

        // After announcer finishes, quickly fade to full volume
        const fullVolumeTime = now + announcerDuration + 0.5;
        songGainNode.gain.linearRampToValueAtTime(1, fullVolumeTime);

        // After fade-out starts, hold at full volume for a bit, then fade out
        const fadeOutStartTime = fullVolumeTime + FADE_OUT_DURATION;
        songGainNode.gain.setValueAtTime(1, fadeOutStartTime);
        songGainNode.gain.linearRampToValueAtTime(0, fadeOutStartTime + FADE_OUT_DURATION);

        // Schedule cleanup after fade-out completes
        const totalTime = announcerDuration + 0.5 + FADE_OUT_DURATION + FADE_OUT_DURATION;
        if (fadeTimeout) clearTimeout(fadeTimeout);
        fadeTimeout = setTimeout(() => {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            songGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            songGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        }, totalTime * 1000);
    } else {
        // Fallback: announcer duration not available, use a reasonable default fade
        const FADE_IN_DURATION = 5; // seconds to fade song in

        // Fade song in from 0 to 25% volume
        songGainNode.gain.linearRampToValueAtTime(0.25, now + FADE_IN_DURATION);

        // Quickly fade to full volume, hold, then fade out
        const fullVolumeTime = now + FADE_IN_DURATION + 0.5;
        songGainNode.gain.linearRampToValueAtTime(1, fullVolumeTime);
        const fadeOutStartTime = fullVolumeTime + FADE_OUT_DURATION;
        songGainNode.gain.setValueAtTime(1, fadeOutStartTime);
        songGainNode.gain.linearRampToValueAtTime(0, fadeOutStartTime + FADE_OUT_DURATION);

        const totalTime = FADE_IN_DURATION + 0.5 + FADE_OUT_DURATION + FADE_OUT_DURATION;
        if (fadeTimeout) clearTimeout(fadeTimeout);
        fadeTimeout = setTimeout(() => {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            songGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            songGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        }, totalTime * 1000);
    }
}

/**
 * Start cross-fading: play the song (at 0 gain) and schedule it to fade in when the announcer ends,
 * then fade song out after it has been playing for the desired duration.
 */
function startCrossFade() {
    if (!currentPlayer) return;

    initAudioContext();

    // Resume AudioContext if suspended (browser policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Set song gain to 0 — song will play silently until announcer ends
    const now = audioCtx.currentTime;
    songGainNode.gain.setValueAtTime(0, now);

    // Start the song playing silently (gain is 0)
    playAudio();
}

/**
 * Cancel any active cross-fade and reset song gain to 0.
 */
function cancelCrossFade() {
    if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
    }
    if (songGainNode && audioCtx) {
        const now = audioCtx.currentTime;
        songGainNode.gain.cancelScheduledValues(now);
        songGainNode.gain.setValueAtTime(0, now);
    }
}

// Announce player name and number, then play song
function announceAndPlay(player) {
    // Cancel any active cross-fade from a previous selection
    cancelCrossFade();
    
    if (announcerEnabled) {
        // Stop any ongoing announcer audio
        announcerPlayer.pause();
        announcerPlayer.currentTime = 0;
        
        // Try to load custom announcer audio file
        const customAnnouncerFile = player.announcerFile;
        
        // Fallback: build path like 'announcers/Colin_3.wav' using Title case name
        const announcerFile = `announcers/${player.name}_${player.number}.wav`;
        const announcerSrc = customAnnouncerFile || announcerFile;
        
        announcerPlayer.src = announcerSrc;
        announcerPlayer.volume = announcerVolume;
        
        // Start the song playing silently (gain = 0) — it's buffered and ready
        startCrossFade();
        
        // When the announcer finishes, fade the song in
        // Capture announcer duration so the song fades in over the announcer's speech
        // and reaches full volume only after the announcer is done.
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        // Wait for the announcer metadata to load so we know the duration
        announcerPlayer.onloadedmetadata = () => {
            const announcerDuration = announcerPlayer.duration || 0;
            scheduleCrossFade(announcerDuration);
        };
        
        // Fallback: if metadata is already loaded, schedule immediately
        if (announcerPlayer.duration) {
            scheduleCrossFade(announcerPlayer.duration);
        }
        
        announcerPlayer.play().catch((error) => {
            console.warn(`Announcer audio not found for player ${player.name}: ${announcerSrc}. Playing song directly.`);
            // Announcer file failed to load — play song at full volume immediately
            cancelCrossFade();
            playAudio();
        });
    } else {
        // Just play the song directly (no cross-fade)
        playAudio();
    }
}

// ========================================
// LOAD PLAYERS & INIT APP
// ========================================

// Load players from JSON file
async function loadPlayers() {
    try {
        const response = await fetch('players.json');
        const data = await response.json();
        players = data.players;
        
        // Initialize availability for all players (default to available)
        players.forEach(player => {
            playerAvailability[player.id] = true;
            playerLineup[player.id] = {
                positions: Array(NUM_INNINGS).fill(null),
                onBench: Array(NUM_INNINGS).fill(false)
            };
        });
        
               // Load saved batting order if exists
        loadBattingOrder();

        // If no saved batting order, initialize with default player order
        if (battingOrder.length === 0) {
            battingOrder = players.map(p => p.id);
            saveBattingOrder();
        }

        // Load lineup if exists
        loadLineup();

        // Load show-unavailable toggle state
        const savedShowUnavailable = localStorage.getItem('walkoutShowUnavailable');
        if (savedShowUnavailable !== null) {
            showUnavailableToggle.checked = savedShowUnavailable === 'true';
        }

        // Initialize game tracking after players are loaded
        if (typeof initGameTracking === 'function') {
            initGameTracking();
        }

        renderPlayerButtons();
        renderBattingOrder();
        setupViewToggles();
        setupBattingOrderControls();
    } catch (error) {
        console.error('Error loading players:', error);
        currentPlayerName.textContent = 'Error loading players';
    }
}

// Initialize the app
loadPlayers();
initAnnouncer();
setupLineupView();
