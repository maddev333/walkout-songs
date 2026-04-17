// Global variables
let players = [];
let battingOrder = [];
let currentPlayer = null;

// ========================================
// TOAST NOTIFICATION SYSTEM
// ========================================

function showToast(message, type = 'info', benchedPlayers = []) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let benchedHTML = '';
    if (benchedPlayers && benchedPlayers.length > 0) {
        benchedHTML = '<span class="toast-benched-players">⚠️ Benched: ' + benchedPlayers.map(p => p.name + ' #' + p.number).join(', ') + '</span>';
    }
    
    toast.innerHTML = message + benchedHTML;
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

function showConfirm(title, message, benchedPlayers = []) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const bodyEl = document.getElementById('confirmBody');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const closeBtn = document.getElementById('closeConfirmModal');
        
        titleEl.textContent = title;
        
        let benchedHTML = '';
        if (benchedPlayers && benchedPlayers.length > 0) {
            benchedHTML = '<ul>' + benchedPlayers.map(p => '<li class="benched">⚠️ ' + p.name + ' #' + p.number + ' will be moved to bench</li>').join('') + '</ul>';
        }
        
        bodyEl.innerHTML = '<p>' + message + '</p>' + benchedHTML;
        modal.style.display = 'block';
        
        confirmCallback = resolve;
        
        function cleanup() {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
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
        modal.addEventListener('click', function closeOnBackdrop(e) {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        });
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
        const missingPositions = POSITIONS.filter(pos => pos !== 'Bench' && !assignedPositions.has(pos));
        
        const inningLabel = getInningSuffix(inning + 1);
        let status = '';
        let isValid = true;
        
        // Calculate expected bench count: all available players minus 9 fielders
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
            status = `✅ Valid - ${benchCount} bench, 9 unique field positions`;
        }
        
        inningDetails.push({ inning: inningLabel, valid: isValid, benchCount, fieldPositions, duplicates, benchedPlayers });
    }
    
    // Check for active roster consistency
    const activePlayers = players.filter(p => playerAvailability[p.id]);
    const totalAssigned = players.filter(p => {
        const data = playerLineup[p.id];
        return data && data.positions.some(pos => pos !== null);
    }).length;
    
    if (totalAssigned !== 9) {
        warnings.push(`Only ${totalAssigned} players have positions assigned (expected 9)`);
    }
    
    return { errors, warnings, inningDetails, totalAssigned, activePlayers: activePlayers.length };
}

// ========================================
// LINEUP CONFIGURATION

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
const NUM_INNINGS = 5;
const NUM_PLAYERS_ON_FIELD = 9;

let playerLineup = {}; // { playerId: { positions: [posInning1, posInning2, ...], onBench: [false, false, ...] } }
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

// Player availability tracking
let playerAvailability = {}; // Object to track which players are available (true/false)

// Announcer variables
let announcerEnabled = true;
let announcerVolume = 1.0;

// Load players from JSON file
async function loadPlayers() {
    try {
        const response = await fetch('players.json');
        const data = await response.json();
        players = data.players;
        
               // Initialize availability for all players (default to available)
        players.forEach(player => {
            playerAvailability[player.id] = true;
        });
        
        // Load saved batting order if exists
        loadBattingOrder();
        
        renderPlayerButtons();
        renderBattingOrder();
        setupViewToggles();
        setupBattingOrderControls();
    } catch (error) {
        console.error('Error loading players:', error);
        currentPlayerName.textContent = 'Error loading players';
    }
}

// Render player buttons
function renderPlayerButtons() {
    playerGrid.innerHTML = '';
    
    // Sort players by batting order if available
    const sortedPlayers = getSortedPlayers();
    
    // Check if we should show unavailable players (use the toggle state)
    const showUnavailable = showUnavailableToggle.checked;
    
    sortedPlayers.forEach(player => {
        // Skip unavailable players if toggle is off
        if (!playerAvailability[player.id] && !showUnavailable) {
            return;
        }
        
        const button = document.createElement('button');
        button.className = 'player-btn';
        button.setAttribute('data-id', player.id);
        
        // Check if player is unavailable
        if (!playerAvailability[player.id]) {
            button.classList.add('unavailable');
        }
        
        // Only allow clicking on available players
        if (playerAvailability[player.id]) {
            button.innerHTML = `
                ${player.name}
                <span class="player-number">#${player.number}</span>
            `;
            button.addEventListener('click', () => selectPlayer(player));
        } else {
            button.innerHTML = `
                ${player.name} (Unavailable)
                <span class="player-number">#${player.number}</span>
            `;
            button.disabled = true;
        }
        
        playerGrid.appendChild(button);
    });
}

// Get players sorted by current batting order
function getSortedPlayers() {
    if (battingOrder.length === 0) {
        return [...players];
    }
    
    // Create a map for quick lookup
    const playerMap = {};
    players.forEach(player => {
        playerMap[player.id] = player;
    });
    
    // Sort by batting order
    const sorted = [...battingOrder].map(id => playerMap[id]).filter(p => p);
    
    // Add any players not in the batting order
    const orderedIds = new Set(battingOrder);
    const remainingPlayers = players.filter(p => !orderedIds.has(p.id));
    
    return [...sorted, ...remainingPlayers];
}

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
    audioPlayer.pause();
    pauseBtn.disabled = true;
    playBtn.disabled = false;
}

// Stop audio
function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
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
    
    // Toggle announcer
    toggle.addEventListener('change', (e) => {
        announcerEnabled = e.target.checked;
    });
    
    // Volume control
    volumeSlider.addEventListener('input', (e) => {
        announcerVolume = e.target.value / 100;
        volumeValue.textContent = `${e.target.value}%`;
        announcerPlayer.volume = announcerVolume;
    });
    
    // Set initial volume
    announcerPlayer.volume = announcerVolume;
    
    // Handle announcer audio ended - play the song after announcement
    announcerPlayer.addEventListener('ended', () => {
        if (currentPlayer) {
            playAudio();
        }
    });
}

// Announce player name and number, then play song
function announceAndPlay(player) {
    if (announcerEnabled) {
        // Stop any ongoing announcer audio
        announcerPlayer.pause();
        announcerPlayer.currentTime = 0;
        
        // Try to load custom announcer audio file
        // Expected format: announcers/player_{number}.mp3
        const announcerFile = `announcers/player_${player.number}.mp3`;
        
        // Check if player has a custom announcer file path
        const customAnnouncerFile = player.announcerFile;
        const announcerSrc = customAnnouncerFile || announcerFile;
        
        announcerPlayer.src = announcerSrc;
        announcerPlayer.volume = announcerVolume;
        
        // Try to play the announcer audio
        announcerPlayer.play().catch(error => {
            console.warn(`Announcer audio not found for player ${player.name}: ${announcerSrc}. Playing song directly.`);
            // If announcer file doesn't exist, just play the song
            playAudio();
        });
    } else {
        // Just play the song directly
        playAudio();
    }
}

// ========================================
// BATTING ORDER FUNCTIONS
// ========================================

// Setup view toggles
function setupViewToggles() {
    const songsViewBtn = document.getElementById('songsViewBtn');
    const battingOrderBtn = document.getElementById('battingOrderBtn');
    const songsView = document.getElementById('songsView');
    const battingOrderView = document.getElementById('battingOrderView');
    
    songsViewBtn.addEventListener('click', () => {
        songsViewBtn.classList.add('active');
        battingOrderBtn.classList.remove('active');
        songsView.style.display = 'block';
        battingOrderView.style.display = 'none';
    });
    
    battingOrderBtn.addEventListener('click', () => {
        battingOrderBtn.classList.add('active');
        songsViewBtn.classList.remove('active');
        battingOrderView.style.display = 'block';
        songsView.style.display = 'none';
    });
}

// Setup batting order controls
function setupBattingOrderControls() {
    const resetOrderBtn = document.getElementById('resetOrderBtn');
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    
    resetOrderBtn.addEventListener('click', resetBattingOrder);
    saveOrderBtn.addEventListener('click', saveBattingOrder);
    
    showUnavailableToggle.addEventListener('change', (e) => {
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
        // Skip unavailable players if toggle is off
        if (!playerAvailability[player.id] && !showUnavailable) {
            return;
        }
        
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
                <div class="player-name">${player.name}</div>
                <div class="player-number">#${player.number}</div>
                <div class="player-song">"${player.song}"</div>
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
    
    // Setup drop zone for the list
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
        renderBattingOrder();
        renderPlayerButtons();
    }
}

// Save batting order to localStorage
function saveBattingOrder() {
    localStorage.setItem('walkoutBattingOrder', JSON.stringify(battingOrder));
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));
    
    // Show confirmation
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    const originalText = saveOrderBtn.innerHTML;
    saveOrderBtn.innerHTML = '✓ Saved!';
    setTimeout(() => {
        saveOrderBtn.innerHTML = originalText;
    }, 2000);
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
        renderLineupMatrix();
    });
    
    setupLineupControls();
    loadLineup();
    setupPositionAssignment();
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
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
        validationHTML += '<div class="inning-check valid"><span class="check-icon">✓</span> Lineup is valid! All available players assigned each inning, 9 unique field positions.</div>';
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

// Setup position assignment modal
function setupPositionAssignment() {
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('positionAssignmentModal');
    const positionButtonsContainer = document.getElementById('positionButtons');
    const inningSelector = document.createElement('div');
    inningSelector.className = 'inning-selector';
    
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
    
    // Generate inning selector
    inningSelector.innerHTML = '<span>Select Inning:</span>';
    for (let i = 1; i <= NUM_INNINGS; i++) {
        const inningBtn = document.createElement('button');
        inningBtn.className = 'inning-btn';
        inningBtn.textContent = i + (i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th') + ' Inning';
        inningBtn.addEventListener('click', () => {
            currentInningForPosition = parseInt(i);
            inningSelector.style.display = 'none';
            renderPositionButtons(true);
        });
        inningSelector.appendChild(inningBtn);
    }
    positionButtonsContainer.appendChild(inningSelector);
    
    function renderPositionButtons(fromInningSelector = false) {
        positionButtonsContainer.innerHTML = '';
        
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
        if (inningSelector) inningSelector.style.display = 'none';
        renderPositionButtons(true);
    }
}

// Load lineup from localStorage
function loadLineup() {
    // Reset all availability to true (Little League: everyone plays)
    players.forEach(player => {
        playerAvailability[player.id] = true;
    });
    
    const savedLineup = localStorage.getItem('walkoutPlayerLineup');
    if (savedLineup) {
        try {
            playerLineup = JSON.parse(savedLineup);
        } catch (e) {
            playerLineup = {};
        }
    } else {
        // Initialize lineup with all players having no position
        players.forEach(player => {
            playerLineup[player.id] = {
                positions: Array(NUM_INNINGS).fill(null),
                onBench: Array(NUM_INNINGS).fill(false)
            };
        });
    }
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

// Auto arrange lineup: All available players must play each inning
// For little league rotation system: 9 players on field, rest on bench, everyone assigned a position each inning
async function autoArrangeLineup() {
    // Get available players
    const availablePlayers = players.filter(p => playerAvailability[p.id]);
    
    if (availablePlayers.length < NUM_PLAYERS_ON_FIELD) {
        showToast(`Need at least ${NUM_PLAYERS_ON_FIELD} available players. You have ${availablePlayers.length}.`, 'error');
        return;
    }
    
    // Show confirmation modal before proceeding
    const confirmed = await showConfirm(
        '⚡ Auto Arrange Lineup',
        'This will randomly assign all available players to positions across 5 innings. Each inning, 9 players will play field positions and the rest will be on bench. Over 5 innings, everyone gets a chance to play.',
        []
    );
    
    if (!confirmed) {
        showToast('Auto arrange cancelled.', 'warning');
        return;
    }
    
    // Clear current lineup for all players
    // Also reset ALL player availability to true (Little League: everyone plays)
    players.forEach(player => {
        playerLineup[player.id] = {
            positions: Array(NUM_INNINGS).fill(null),
            onBench: Array(NUM_INNINGS).fill(false)
        };
        playerAvailability[player.id] = true;
    });
    
    // Field positions only (exclude Bench from the field positions)
    const fieldPositions = POSITIONS.filter(p => p !== 'Bench'); // 9 field positions
    
    // For each inning, assign all available players to positions
    // 9 get field positions, rest get 'Bench'
    for (let inning = 0; inning < NUM_INNINGS; inning++) {
        // Get all available players and shuffle them for this inning
        const allAvailablePlayers = shuffleArray(players.filter(p => playerAvailability[p.id]));
        
        // Shuffle field positions for variety
        const shuffledFieldPositions = shuffleArray([...fieldPositions]);
        
        // Assign first 9 players to field positions
        for (let i = 0; i < Math.min(NUM_PLAYERS_ON_FIELD, allAvailablePlayers.length); i++) {
            const player = allAvailablePlayers[i];
            playerLineup[player.id].positions[inning] = shuffledFieldPositions[i];
            playerLineup[player.id].onBench[inning] = false;
        }
        
        // Assign remaining players to 'Bench' position
        for (let i = NUM_PLAYERS_ON_FIELD; i < allAvailablePlayers.length; i++) {
            const player = allAvailablePlayers[i];
            playerLineup[player.id].positions[inning] = 'Bench';
            playerLineup[player.id].onBench[inning] = true;
        }
    }
    
    // Save availability and lineup
    saveAvailability();
    saveLineup();
    renderLineupMatrix();
    renderPlayerButtons();
    
    // Show button feedback
    const originalText = autoArrangeBtn.innerHTML;
    autoArrangeBtn.innerHTML = '✓ Auto Arranged!';
    setTimeout(() => {
        autoArrangeBtn.innerHTML = originalText;
    }, 2000);
    
    showToast(
        '✅ Auto-arrange complete! All ' + availablePlayers.length + ' players assigned to positions across 5 innings. 9 fielders + (availablePlayers.length - 9) on bench each inning.',
        'success'
    );
}

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
                <span class="player-name-text">${player.name}</span>
                <span class="player-number">#${player.number}</span>
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
            
            const position = playerData.positions[inning];
            
            if (position === 'Bench') {
                // Player is on bench for this inning
                inningCell.classList.add('bench-cell');
                inningCell.innerHTML = '<span class="bench-badge">bench</span>';
                inningCell.title = 'On bench';
            } else if (position) {
                // Player is playing this inning at a field position
                inningCell.classList.add('playing');
                inningCell.innerHTML = `<span class="position-badge">${position}</span>`;
                inningCell.title = `Playing ${position}`;
            } else {
                // No position assigned — not playing this inning
                inningCell.classList.add('not-playing');
                inningCell.innerHTML = '<span class="no-badge">-</span>';
                inningCell.title = 'Not playing this inning';
            }
            
            // Add click handler to toggle position
            inningCell.addEventListener('click', () => togglePlayerInInning(player.id, inning + 1, inningCell));
            row.appendChild(inningCell);
        }
        
        lineupMatrixContent.appendChild(row);
    });
}

// Toggle player position/availability in an inning
function togglePlayerInInning(playerId, inning, cell) {
    if (!playerAvailability[playerId]) {
        return; // Can't modify unavailable players
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
        
        // Assign position to all innings
        playerData.positions = Array(NUM_INNINGS).fill(firstPosition);
        playerData.onBench = Array(NUM_INNINGS).fill(false);
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

// Helper function to get inning suffix
function getInningSuffix(inning) {
    if (inning === 1) return '1st';
    if (inning === 2) return '2nd';
    if (inning === 3) return '3rd';
    return inning + 'th';
}

// Save lineup to localStorage
function saveLineup() {
    localStorage.setItem('walkoutPlayerLineup', JSON.stringify(playerLineup));
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));
    
    // Show confirmation
    const originalText = saveLineupBtn.innerHTML;
    saveLineupBtn.innerHTML = '✓ Saved!';
    setTimeout(() => {
        saveLineupBtn.innerHTML = originalText;
    }, 2000);
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
        localStorage.removeItem('walkoutPlayerLineup');
        localStorage.removeItem('walkoutPlayerAvailability');
        saveLineup();
        renderLineupMatrix();
        renderPlayerButtons();
        showToast('Lineup reset to default.', 'success');
    } else {
        showToast('Reset cancelled.', 'warning');
    }
}

// ========================================
// LINEUP STYLES (CSS) - Added to styles.css

// Initialize the app
loadPlayers();
initAnnouncer();
setupLineupView();
