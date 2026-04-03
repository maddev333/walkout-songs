// Global variables
let players = [];
let currentPlayer = null;
let audioPlayer = document.getElementById('audioPlayer');
let playBtn = document.getElementById('playBtn');
let pauseBtn = document.getElementById('pauseBtn');
let stopBtn = document.getElementById('stopBtn');
let playerGrid = document.getElementById('playerGrid');
let currentPlayerName = document.getElementById('currentPlayerName');
let currentSongTitle = document.getElementById('currentSongTitle');

// Announcer variables
let synth = window.speechSynthesis;
let voices = [];
let announcerEnabled = true;
let announcerVolume = 1.0;
let announcerRate = 1.0;
let selectedVoice = null;

// Load players from JSON file
async function loadPlayers() {
    try {
        const response = await fetch('players.json');
        const data = await response.json();
        players = data.players;
        renderPlayerButtons();
    } catch (error) {
        console.error('Error loading players:', error);
        currentPlayerName.textContent = 'Error loading players';
    }
}

// Render player buttons
function renderPlayerButtons() {
    playerGrid.innerHTML = '';
    
    players.forEach(player => {
        const button = document.createElement('button');
        button.className = 'player-btn';
        button.setAttribute('data-id', player.id);
        button.innerHTML = `
            ${player.name}
            <span class="player-number">#${player.number}</span>
        `;
        
        button.addEventListener('click', () => selectPlayer(player));
        playerGrid.appendChild(button);
    });
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

// Debug function to show available voices
function debugVoices() {
    const currentVoices = window.speechSynthesis.getVoices();
    console.log('Available voices:', currentVoices);
    
    if (currentVoices.length === 0) {
        alert('⚠️ No voices detected!\n\niOS requires you to:\n1. Tap any button first\n2. Go to Settings > Safari > Features > Enable Speech\n3. Try the debug button again\n\nAvailable voices will appear after user interaction.');
    } else {
        let voiceList = '📱 Available Voices:\n\n';
        currentVoices.forEach((voice, index) => {
            voiceList += `${index + 1}. ${voice.name} (${voice.lang})\n`;
        });
        alert(voiceList);
    }
}

// Initialize announcer
function initAnnouncer() {
    const voiceSelect = document.getElementById('announcerVoice');
    const volumeSlider = document.getElementById('announcerVolume');
    const rateSlider = document.getElementById('announcerRate');
    const toggle = document.getElementById('announcerToggle');
    const volumeValue = document.getElementById('volumeValue');
    const rateValue = document.getElementById('rateValue');
    const debugBtn = document.getElementById('debugVoicesBtn');
    
    // Add debug button listener
    if (debugBtn) {
        debugBtn.addEventListener('click', debugVoices);
    }
    
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

// Initialize the app
loadPlayers();
initAnnouncer();
