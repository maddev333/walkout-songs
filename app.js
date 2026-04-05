// Global variables
let players = [];
let battingOrder = [];
let currentPlayer = null;
let audioPlayer = document.getElementById('audioPlayer');
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

// Player stats tracking
let playerStats = {}; // Object to track player stats (runs, outs, innings, pitches, perInningStats)
let currentInning = 1; // Track current inning number

// Announcer variables
let synth = window.speechSynthesis;
let voices = [];
let announcerEnabled = false;
let announcerVolume = 1.0;
let announcerRate = 1.0;
let selectedVoice = null;

// Load players from JSON file
async function loadPlayers() {
    try {
        const response = await fetch('players.json');
        const data = await response.json();
        players = data.players;
        
        // Initialize availability for all players (default to available)
        players.forEach(player => {
            playerAvailability[player.id] = true;
            // Initialize stats for all players with per-inning tracking
            playerStats[player.id] = {
                runs: 0,
                outs: 0,
                innings: 0,
                pitches: 0,
                perInningStats: {} // Keyed by inning number
            };
        });
        
        // Load saved batting order if exists
        loadBattingOrder();
        loadPlayerStats();
        
        renderPlayerButtons();
        renderBattingOrder();
        renderPlayerStats();
        setupViewToggles();
        setupBattingOrderControls();
        setupPlayerStatsControls();
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
    const voiceSelect = document.getElementById('announcerVoice');
    const volumeSlider = document.getElementById('announcerVolume');
    const rateSlider = document.getElementById('announcerRate');
    const toggle = document.getElementById('announcerToggle');
    const volumeValue = document.getElementById('volumeValue');
    const rateValue = document.getElementById('rateValue');
    
    // Load available voices (iOS-specific handling)
    function loadVoices() {
        // Force voice reload on iOS
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            synth.cancel(); // Cancel any ongoing speech to trigger voice reload
        }
        
        voices = synth.getVoices();
        
        console.log('Voices loaded:', voices.length);
        
        if (voices.length === 0) {
            console.warn('No voices available yet. Waiting for user interaction...');
            voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
            return;
        }
        
        voices = voices.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            // Prefer English voices
            if (a.lang.startsWith('en') && !b.lang.startsWith('en')) return -1;
            if (!a.lang.startsWith('en') && b.lang.startsWith('en')) return 1;
            return aName.localeCompare(bName);
        });
        
        voiceSelect.innerHTML = '';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
        
        // Select first English voice by default
        const englishVoiceIndex = voices.findIndex(v => v.lang.startsWith('en'));
        if (englishVoiceIndex !== -1) {
            voiceSelect.value = englishVoiceIndex;
            selectedVoice = voices[englishVoiceIndex];
            console.log('Selected voice:', selectedVoice.name);
        }
    }
    
    // Try to load voices immediately
    loadVoices();
    
    // iOS requires user interaction first, then voices become available
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
    
    // Also try loading on first user interaction (iOS specific)
    let voicesLoaded = false;
    document.addEventListener('click', function forceLoadVoices() {
        if (!voicesLoaded) {
            const newVoices = synth.getVoices();
            if (newVoices.length > 0 && voices.length === 0) {
                voicesLoaded = true;
                loadVoices();
                console.log('Voices loaded after user interaction');
            }
        }
    }, { once: true });
    
    // Toggle announcer
    toggle.addEventListener('change', (e) => {
        announcerEnabled = e.target.checked;
    });
    
    // Volume control
    volumeSlider.addEventListener('input', (e) => {
        announcerVolume = e.target.value / 100;
        volumeValue.textContent = `${e.target.value}%`;
    });
    
    // Rate/speed control
    rateSlider.addEventListener('input', (e) => {
        announcerRate = parseFloat(e.target.value);
        rateValue.textContent = `${e.target.value}x`;
    });
    
    // Voice selection
    voiceSelect.addEventListener('change', (e) => {
        selectedVoice = voices[e.target.value];
    });
}

// Announce player name and number, then play song
function announceAndPlay(player) {
    if (announcerEnabled) {
        // Cancel any ongoing speech
        synth.cancel();
        
        // Create announcement text
        const announcement = `Number ${player.number}, ${player.name}`;
        const utterance = new SpeechSynthesisUtterance(announcement);
        
        // Set voice if available
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        // Set volume and rate
        utterance.volume = announcerVolume;
        utterance.rate = announcerRate;
        utterance.pitch = 1.0;
        
        // When announcement finishes, play the song
        utterance.onend = () => {
            playAudio();
        };
        
        // Speak the announcement
        synth.speak(utterance);
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
    const playerStatsBtn = document.getElementById('playerStatsBtn');
    const songsView = document.getElementById('songsView');
    const battingOrderView = document.getElementById('battingOrderView');
    const playerStatsView = document.getElementById('playerStatsView');
    
    songsViewBtn.addEventListener('click', () => {
        songsViewBtn.classList.add('active');
        battingOrderBtn.classList.remove('active');
        playerStatsBtn.classList.remove('active');
        songsView.style.display = 'block';
        battingOrderView.style.display = 'none';
        playerStatsView.style.display = 'none';
    });
    
    battingOrderBtn.addEventListener('click', () => {
        battingOrderBtn.classList.add('active');
        songsViewBtn.classList.remove('active');
        playerStatsBtn.classList.remove('active');
        battingOrderView.style.display = 'block';
        songsView.style.display = 'none';
        playerStatsView.style.display = 'none';
    });
    
    playerStatsBtn.addEventListener('click', () => {
        playerStatsBtn.classList.add('active');
        songsViewBtn.classList.remove('active');
        battingOrderBtn.classList.remove('active');
        playerStatsView.style.display = 'block';
        songsView.style.display = 'none';
        battingOrderView.style.display = 'none';
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
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    battingOrderList.querySelectorAll('.batting-order-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (this === draggedItem) return;
    
    const rect = this.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const height = rect.height;
    
    if (mouseY < height / 2) {
        this.parentNode.insertBefore(draggedItem, this);
    } else {
        this.parentNode.insertBefore(draggedItem, this.nextSibling);
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedItem) return;
    
    // Rebuild batting order from DOM
    const items = battingOrderList.querySelectorAll('.batting-order-item');
    battingOrder = [];
    items.forEach(item => {
        const playerId = parseInt(item.getAttribute('data-id'));
        battingOrder.push(playerId);
    });
    
    renderBattingOrder();
    renderPlayerButtons();
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
function resetBattingOrder() {
    if (confirm('Reset batting order to default (by jersey number)?')) {
        battingOrder = [];
        localStorage.removeItem('walkoutBattingOrder');
        
        // Reset availability to all true
        players.forEach(player => {
            playerAvailability[player.id] = true;
        });
        localStorage.removeItem('walkoutPlayerAvailability');
        
        renderBattingOrder();
        renderPlayerButtons();
    }
}

// Save availability to localStorage
function saveAvailability() {
    localStorage.setItem('walkoutPlayerAvailability', JSON.stringify(playerAvailability));
}

// ========================================
// PLAYER STATS FUNCTIONS
// ========================================

// Setup player stats controls
function setupPlayerStatsControls() {
    const resetStatsBtn = document.getElementById('resetStatsBtn');
    const saveStatsBtn = document.getElementById('saveStatsBtn');
    
    resetStatsBtn.addEventListener('click', resetPlayerStats);
    saveStatsBtn.addEventListener('click', savePlayerStats);
}

// Render player stats list
function renderPlayerStats() {
    const playerStatsList = document.getElementById('playerStatsList');
    playerStatsList.innerHTML = '';
    
    // Calculate totals for summary
    let totalRuns = 0;
    let totalOuts = 0;
    let totalInnings = 0;
    let totalPitches = 0;
    
    // Get sorted players by batting order
    const sortedPlayers = getSortedPlayers();
    
    // Calculate totals
    sortedPlayers.forEach(player => {
        const stats = playerStats[player.id] || { runs: 0, outs: 0, innings: 0, pitches: 0 };
        totalRuns += stats.runs;
        totalOuts += stats.outs;
        totalInnings += stats.innings;
        totalPitches += stats.pitches;
    });
    
    // Create inning controls section
    const inningControls = document.createElement('div');
    inningControls.className = 'inning-controls';
    inningControls.innerHTML = `
        <div class="inning-control-group">
            <label>🏏 Current Inning:</label>
            <div class="inning-buttons">
                <button id="prevInningBtn" ${currentInning <= 1 ? 'disabled' : ''}>◀ Previous</button>
                <span class="current-inning-display">Inning ${currentInning}</span>
                <button id="nextInningBtn">Next ▶</button>
            </div>
        </div>
        <div class="inning-control-group">
            <button id="addInningBtn" class="inning-action-btn">➕ Add New Inning</button>
        </div>
    `;
    playerStatsList.appendChild(inningControls);
    
    // Add event listeners for inning controls
    document.getElementById('prevInningBtn').addEventListener('click', () => {
        if (currentInning > 1) {
            currentInning--;
            renderPlayerStats();
        }
    });
    
    document.getElementById('nextInningBtn').addEventListener('click', () => {
        currentInning++;
        renderPlayerStats();
    });
    
    document.getElementById('addInningBtn').addEventListener('click', () => {
        currentInning = Math.max(...Object.keys(playerStats[sortedPlayers[0]?.id]?.perInningStats || {}).map(Number)) + 1;
        if (currentInning === 0) currentInning = 1;
        renderPlayerStats();
    });
    
    // Create summary section
    const summarySection = document.createElement('div');
    summarySection.className = 'stats-summary';
    summarySection.innerHTML = `
        <h4>📊 Team Summary (All Innings)</h4>
        <div class="summary-row">
            <div class="summary-group">
                <label>Runs</label>
                <div class="summary-value">${totalRuns}</div>
            </div>
            <div class="summary-group">
                <label>Outs</label>
                <div class="summary-value">${totalOuts}</div>
            </div>
            <div class="summary-group">
                <label>Innings</label>
                <div class="summary-value">${totalInnings}</div>
            </div>
            <div class="summary-group">
                <label>Pitches</label>
                <div class="summary-value">${totalPitches}</div>
            </div>
        </div>
    `;
    playerStatsList.appendChild(summarySection);
    
    // Calculate current inning totals
    let inningRuns = 0;
    let inningOuts = 0;
    let inningPitches = 0;
    
    sortedPlayers.forEach(player => {
        const stats = playerStats[player.id];
        const inningStats = stats?.perInningStats?.[currentInning] || { runs: 0, outs: 0, pitches: 0 };
        inningRuns += inningStats.runs;
        inningOuts += inningStats.outs;
        inningPitches += inningStats.pitches;
    });
    
    // Create current inning summary
    const inningSummary = document.createElement('div');
    inningSummary.className = 'inning-summary';
    inningSummary.innerHTML = `
        <h4>🏏 Inning ${currentInning} Summary</h4>
        <div class="summary-row">
            <div class="summary-group">
                <label>Runs</label>
                <div class="summary-value">${inningRuns}</div>
            </div>
            <div class="summary-group">
                <label>Outs</label>
                <div class="summary-value">${inningOuts}</div>
            </div>
            <div class="summary-group">
                <label>Pitches</label>
                <div class="summary-value">${inningPitches}</div>
            </div>
        </div>
    `;
    playerStatsList.appendChild(inningSummary);
    
    // Render individual player stats for current inning
    sortedPlayers.forEach(player => {
        const stats = playerStats[player.id] || { runs: 0, outs: 0, innings: 0, pitches: 0, perInningStats: {} };
        const inningStats = stats.perInningStats[currentInning] || { runs: 0, outs: 0, pitches: 0 };
        
        const item = document.createElement('div');
        item.className = 'player-stats-item';
        item.setAttribute('data-id', player.id);
        
        const position = battingOrder.indexOf(player.id) + 1;
        const positionText = position > 0 ? position : '-';
        
        item.innerHTML = `
            <div class="stats-position">#${positionText}</div>
            <div class="stats-player-info">
                <div class="stats-player-name">${player.name}</div>
                <div class="stats-player-number">#${player.number}</div>
                <div class="stats-inning-label">Inning ${currentInning}</div>
            </div>
            <div class="stats-controls">
                <div class="stat-group">
                    <label>Runs</label>
                    <div class="stat-buttons">
                        <button class="stat-btn minus" data-stat="runs" data-player-id="${player.id}">-</button>
                        <span class="stat-value">${inningStats.runs}</span>
                        <button class="stat-btn plus" data-stat="runs" data-player-id="${player.id}">+</button>
                    </div>
                </div>
                <div class="stat-group">
                    <label>Outs</label>
                    <div class="stat-buttons">
                        <button class="stat-btn minus" data-stat="outs" data-player-id="${player.id}">-</button>
                        <span class="stat-value">${inningStats.outs}</span>
                        <button class="stat-btn plus" data-stat="outs" data-player-id="${player.id}">+</button>
                    </div>
                </div>
                <div class="stat-group">
                    <label>Pitches</label>
                    <div class="stat-buttons">
                        <button class="stat-btn minus" data-stat="pitches" data-player-id="${player.id}">-</button>
                        <span class="stat-value">${inningStats.pitches}</span>
                        <button class="stat-btn plus" data-stat="pitches" data-player-id="${player.id}">+</button>
                    </div>
                </div>
                <div class="stat-total">
                    <label>Total</label>
                    <div class="stat-total-runs">R:${stats.runs}</div>
                    <div class="stat-total-outs">O:${stats.outs}</div>
                    <div class="stat-total-pitches">P:${stats.pitches}</div>
                </div>
            </div>
        `;
        
        // Add event listeners for stat buttons
        item.querySelectorAll('.stat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const statType = btn.getAttribute('data-stat');
                const playerId = parseInt(btn.getAttribute('data-player-id'));
                const isPlus = btn.classList.contains('plus');
                
                updatePlayerStat(playerId, statType, isPlus ? 1 : -1, currentInning);
            });
        });
        
        playerStatsList.appendChild(item);
    });
}

// Update player stat (for current inning)
function updatePlayerStat(playerId, statType, delta, inningNum = null) {
    if (!playerStats[playerId]) {
        playerStats[playerId] = { 
            runs: 0, 
            outs: 0, 
            innings: 0,
            pitches: 0,
            perInningStats: {}
        };
    }
    
    // Use provided inning number or default to currentInning
    const inning = inningNum || currentInning;
    
    // Initialize per-inning stats if needed
    if (!playerStats[playerId].perInningStats[inning]) {
        playerStats[playerId].perInningStats[inning] = { runs: 0, outs: 0, pitches: 0 };
    }
    
    // Update per-inning stat
    playerStats[playerId].perInningStats[inning][statType] += delta;
    
    // Prevent negative values for per-inning stats
    if (playerStats[playerId].perInningStats[inning][statType] < 0) {
        playerStats[playerId].perInningStats[inning][statType] = 0;
    }
    
    // Recalculate totals from all innings
    recalculatePlayerTotals(playerId);
    
    renderPlayerStats();
}

// Recalculate player totals from all innings
function recalculatePlayerTotals(playerId) {
    if (!playerStats[playerId]) return;
    
    let totalRuns = 0;
    let totalOuts = 0;
    let totalPitches = 0;
    
    Object.values(playerStats[playerId].perInningStats).forEach(inningStats => {
        totalRuns += inningStats.runs;
        totalOuts += inningStats.outs;
        totalPitches += inningStats.pitches;
    });
    
    playerStats[playerId].runs = totalRuns;
    playerStats[playerId].outs = totalOuts;
    playerStats[playerId].pitches = totalPitches;
    
    // Count number of innings player has participated in
    playerStats[playerId].innings = Object.keys(playerStats[playerId].perInningStats).length;
}

// Save player stats to localStorage
function savePlayerStats() {
    localStorage.setItem('walkoutPlayerStats', JSON.stringify(playerStats));
    localStorage.setItem('walkoutCurrentInning', currentInning.toString());
    
    // Show confirmation
    const saveStatsBtn = document.getElementById('saveStatsBtn');
    const originalText = saveStatsBtn.innerHTML;
    saveStatsBtn.innerHTML = '✓ Saved!';
    setTimeout(() => {
        saveStatsBtn.innerHTML = originalText;
    }, 2000);
}

// Load player stats from localStorage
function loadPlayerStats() {
    const savedStats = localStorage.getItem('walkoutPlayerStats');
    const savedCurrentInning = localStorage.getItem('walkoutCurrentInning');
    
    if (savedStats) {
        try {
            const saved = JSON.parse(savedStats);
            // Merge saved stats with current stats structure
            Object.keys(saved).forEach(playerId => {
                if (playerStats[playerId]) {
                    playerStats[playerId] = {
                        ...playerStats[playerId],
                        ...saved[playerId]
                    };
                }
            });
            
            // Load current inning if saved
            if (savedCurrentInning) {
                currentInning = parseInt(savedCurrentInning);
            }
        } catch (e) {
            console.error('Error loading player stats:', e);
        }
    }
}

// Reset player stats
function resetPlayerStats() {
    if (confirm('Reset all player stats to zero?')) {
        players.forEach(player => {
            playerStats[player.id] = {
                runs: 0,
                outs: 0,
                innings: 0,
                pitches: 0,
                perInningStats: {}
            };
        });
        currentInning = 1;
        localStorage.removeItem('walkoutPlayerStats');
        localStorage.removeItem('walkoutCurrentInning');
        renderPlayerStats();
    }
}

// Initialize the app
loadPlayers();
initAnnouncer();
