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
        
        // Add event listeners
        item.addEventListener('click', (e) => {
            // Don't select player if clicking on availability toggle or move buttons
            if (e.target.closest('.availability-toggle') || e.target.closest('.move-buttons')) {
                return;
            }
            // Only select if player is available
            if (!playerAvailability[player.id]) {
                return;
            }
            selectPlayer(player);
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

// Initialize the app
loadPlayers();
initAnnouncer();
