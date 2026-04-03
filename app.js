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
    
    // Auto-play on selection
    playAudio();
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

// Initialize the app
loadPlayers();
