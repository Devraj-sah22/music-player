// ==============================
// STATE MANAGEMENT
// ==============================

let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let audio = new Audio();
let shuffleMode = false;
let repeatMode = false;
let volume = 0.7;
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');


// ==============================
// INITIALIZE
// ==============================

document.addEventListener('DOMContentLoaded', () => {
    loadPlaylist();
    setupAudioListeners();
    loadRecentlyPlayed();

    audio.volume = volume;
    document.getElementById('volume-fill').style.width = `${volume * 100}%`;

    // ✅ FIXED PROGRESS LISTENER
    if (window.electronAPI && window.electronAPI.on) {
        window.electronAPI.on('download-progress', (percent) => {
            const progressText = document.querySelector('.progress-text');
            if (progressText) {
                progressText.innerText = percent.toFixed(1) + '%';
            }
        });
    }
});


// ==============================
// AUDIO SETUP
// ==============================

function setupAudioListeners() {
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('loadedmetadata', updateTotalTime);
    audio.addEventListener('error', () => {
        showNotification('Error loading audio file', 'error');
    });
}


// ==============================
// PLAYLIST MANAGEMENT
// ==============================

function loadPlaylist() {
    const savedPlaylist = localStorage.getItem('playlist');
    if (savedPlaylist) {
        currentPlaylist = JSON.parse(savedPlaylist);
        renderPlaylist();
    }
}

function savePlaylist() {
    localStorage.setItem('playlist', JSON.stringify(currentPlaylist));
}

function renderPlaylist() {
    const container = document.getElementById('playlist-rows');
    if (!container) return;

    container.innerHTML = '';

    currentPlaylist.forEach((song, index) => {
        const row = createPlaylistRow(song, index);
        container.appendChild(row);
        row.style.animationDelay = `${index * 0.05}s`;
    });
}

function createPlaylistRow(song, index) {
    const row = document.createElement('div');
    row.className = `playlist-row ${index === currentIndex ? 'playing' : ''}`;

    const isFavorite = favorites.includes(song.id);

    row.innerHTML = `
        <div class="col">${index + 1}</div>
        <div class="col">${song.title || 'Unknown Title'}</div>
        <div class="col">${song.artist || 'Unknown Artist'}</div>
        <div class="col">${formatTime(song.duration) || '--:--'}</div>
        <div class="col">
            <i class="${isFavorite ? 'fas' : 'far'} fa-heart favorite-icon" 
               data-id="${song.id}"
               onclick="toggleFavorite('${song.id}', event)"></i>
        </div>
    `;

    row.addEventListener('click', (e) => {
        if (!e.target.classList.contains('fa-heart')) {
            playSong(index);
        }
    });

    return row;
}


// ==============================
// MODAL FUNCTIONS
// ==============================

function showAddSongModal() {
    const modal = document.getElementById('addSongModal');
    if (modal) modal.classList.add('show');
}

function hideAddSongModal() {
    const modal = document.getElementById('addSongModal');
    const urlSection = document.getElementById('url-input-section');
    const songUrl = document.getElementById('song-url');

    if (modal) modal.classList.remove('show');
    if (urlSection) urlSection.classList.add('hidden');
    if (songUrl) songUrl.value = '';

    showLoading(false);
}


// ==============================
// ADD SONG
// ==============================

async function addFromUrl() {
    const urlSection = document.getElementById('url-input-section');
    if (urlSection) urlSection.classList.remove('hidden');
}

async function processUrl() {
    const urlInput = document.getElementById('song-url');
    if (!urlInput) return;

    const url = urlInput.value.trim();
    if (!url) {
        showNotification('Please enter a URL', 'error');
        return;
    }

    showLoading(true);

    try {
        if (!window.electronAPI || !window.electronAPI.addSongFromUrl) {
            throw new Error('Electron API not available');
        }

        const result = await window.electronAPI.addSongFromUrl(url);

        showLoading(false); // ✅ ensure loading stops

        if (result.success) {

            const newSong = {
                id: result.id || Date.now().toString(),
                title: result.title || 'Unknown Title',
                artist: result.artist || 'Unknown Artist',
                duration: result.duration || 0,
                url: result.url,
                thumbnail: result.thumbnail
            };

            currentPlaylist.push(newSong);
            savePlaylist();
            renderPlaylist();
            addToRecentlyPlayed(newSong);

            showNotification('Song added successfully!', 'success');
            hideAddSongModal(); // ✅ close modal

        } else {
            showNotification('Error adding song: ' + (result.error || 'Unknown error'), 'error');
        }

    } catch (error) {
        showLoading(false); // ✅ prevent freeze
        console.error('Error:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}

async function addLocalFile() {
    try {
        const result = await window.electronAPI.selectLocalFile();

        if (result.success) {

            const newSong = {
                id: Date.now().toString(),
                title: result.title || 'Local File',
                artist: 'Local File',
                duration: null,
                url: result.url,
                local: true
            };

            currentPlaylist.push(newSong);
            savePlaylist();
            renderPlaylist();

            const tempAudio = new Audio();
            tempAudio.src = result.url;
            tempAudio.addEventListener('loadedmetadata', () => {
                newSong.duration = tempAudio.duration;
                savePlaylist();
                renderPlaylist();
            });

            showNotification('File added successfully!', 'success');
            hideAddSongModal();
        }

    } catch (error) {
        console.error('Error:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}



// ==============================
// PLAYBACK CONTROLS
// ==============================

function playSong(index) {
    if (index < 0 || index >= currentPlaylist.length) return;

    currentIndex = index;
    const song = currentPlaylist[index];

    try {
        audio.src = song.url;
        audio.play();
        isPlaying = true;

        updateNowPlaying(song);
        updatePlayPauseButton();
        highlightCurrentSong();
        addToRecentlyPlayed(song);

        document.title = `${song.title} - Music Player`;
    } catch (error) {
        console.error('Error playing song:', error);
        showNotification('Error playing song', 'error');
    }
}

function togglePlay() {
    if (currentIndex === -1 && currentPlaylist.length > 0) {
        playSong(0);
        return;
    }

    if (isPlaying) {
        audio.pause();
        isPlaying = false;
    } else {
        audio.play();
        isPlaying = true;
    }

    updatePlayPauseButton();
    document.querySelector('.album-art').classList.toggle('playing', isPlaying);
}

function handleSongEnd() {
    if (repeatMode) {
        audio.currentTime = 0;
        audio.play();
    } else {
        next();
    }
}

function next() {
    if (!currentPlaylist.length) return;

    let nextIndex;

    if (shuffleMode) {
        do {
            nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (nextIndex === currentIndex && currentPlaylist.length > 1);
    } else {
        nextIndex = (currentIndex + 1) % currentPlaylist.length;
    }

    playSong(nextIndex);
}

function previous() {
    if (!currentPlaylist.length) return;

    let prevIndex;

    if (shuffleMode) {
        do {
            prevIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (prevIndex === currentIndex && currentPlaylist.length > 1);
    } else {
        prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    }

    playSong(prevIndex);
}


// ==============================
// UI UPDATES
// ==============================

function updateNowPlaying(song) {
    const titleEl = document.querySelector('.song-title');
    const artistEl = document.querySelector('.song-artist');
    const albumArt = document.querySelector('.album-art');

    if (titleEl) titleEl.textContent = song.title || 'Unknown Title';
    if (artistEl) artistEl.textContent = song.artist || 'Unknown Artist';

    if (albumArt) {
        if (song.thumbnail) {
            albumArt.innerHTML = `
                <img src="${song.thumbnail}" 
                     style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
            `;
        } else {
            albumArt.innerHTML = `<i class="fas fa-music"></i>`;
        }
        albumArt.classList.toggle('playing', isPlaying);
    }
}

function updatePlayPauseButton() {
    const icon = document.querySelector('.play-pause i');
    if (icon) {
        icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
}

function updateProgress() {
    if (!audio.duration) return;

    const progress = (audio.currentTime / audio.duration) * 100;
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.querySelector('.current-time');

    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
}

function updateTotalTime() {
    const totalTimeEl = document.querySelector('.total-time');
    if (totalTimeEl) {
        totalTimeEl.textContent = formatTime(audio.duration);
    }
}

function seek(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
}

function highlightCurrentSong() {
    document.querySelectorAll('.playlist-row').forEach((row, index) => {
        row.classList.toggle('playing', index === currentIndex);
    });
}


// ==============================
// VOLUME
// ==============================

function setVolume(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;

    volume = Math.max(0, Math.min(1, percent));
    audio.volume = volume;

    const volumeFill = document.getElementById('volume-fill');
    if (volumeFill) {
        volumeFill.style.width = `${volume * 100}%`;
    }

    const icon = document.querySelector('.volume-btn i');
    if (icon) {
        if (volume === 0) icon.className = 'fas fa-volume-mute';
        else if (volume < 0.5) icon.className = 'fas fa-volume-down';
        else icon.className = 'fas fa-volume-up';
    }
}

function toggleMute() {
    if (audio.volume > 0) {
        audio.volume = 0;
        document.getElementById('volume-fill').style.width = '0%';
    } else {
        audio.volume = volume || 0.7;
        document.getElementById('volume-fill').style.width = `${audio.volume * 100}%`;
    }

    // Update icon
    const icon = document.querySelector('.volume-btn i');
    if (icon) {
        if (audio.volume === 0) icon.className = 'fas fa-volume-mute';
        else if (audio.volume < 0.5) icon.className = 'fas fa-volume-down';
        else icon.className = 'fas fa-volume-up';
    }
}


// ==============================
// SHUFFLE & REPEAT
// ==============================

function shuffle() {
    shuffleMode = !shuffleMode;
    const icon = document.querySelector('[onclick="shuffle()"] i');
    if (icon) {
        icon.style.color = shuffleMode ? 'var(--accent)' : '';
    }
}

function repeat() {
    repeatMode = !repeatMode;
    const icon = document.querySelector('[onclick="repeat()"] i');
    if (icon) {
        icon.style.color = repeatMode ? 'var(--accent)' : '';
    }
}


// ==============================
// FAVORITES
// ==============================

function toggleFavorite(songId, event) {
    event.stopPropagation();

    const index = favorites.indexOf(songId);
    if (index === -1) {
        favorites.push(songId);
    } else {
        favorites.splice(index, 1);
    }

    localStorage.setItem('favorites', JSON.stringify(favorites));

    // Update icon
    const icon = event.target;
    if (favorites.includes(songId)) {
        icon.className = 'fas fa-heart favorite-icon';
    } else {
        icon.className = 'far fa-heart favorite-icon';
    }

    // Update playlist display
    renderPlaylist();
}


// ==============================
// RECENTLY PLAYED
// ==============================

function loadRecentlyPlayed() {
    const recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    const container = document.getElementById('recently-played');

    if (!container) return;

    if (recentlyPlayed.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No recently played songs</p>';
        return;
    }

    container.innerHTML = recentlyPlayed.slice(0, 6).map(song => {
        const songIndex = currentPlaylist.findIndex(s => s.id === song.id);
        return `
            <div class="card" onclick="${songIndex !== -1 ? `playSong(${songIndex})` : ''}">
                <div class="card-image">
                    ${song.thumbnail ?
                `<img src="${song.thumbnail}" alt="${song.title}" style="width:100%;height:100%;object-fit:cover;">` :
                '<i class="fas fa-music"></i>'
            }
                </div>
                <h3>${song.title || 'Unknown Title'}</h3>
                <p>${song.artist || 'Unknown Artist'}</p>
            </div>
        `;
    }).join('');
}

function addToRecentlyPlayed(song) {
    let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    recentlyPlayed = [song, ...recentlyPlayed.filter(s => s.id !== song.id)].slice(0, 10);
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    loadRecentlyPlayed();
}


// ==============================
// UTILITY FUNCTIONS
// ==============================

function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showLoading(show) {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }
}

function showNotification(message, type) {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}


// ==============================
// DRAG & DROP SUPPORT
// ==============================

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];

    if (file && file.type.startsWith('audio/')) {
        const newSong = {
            id: Date.now().toString(),
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Local File',
            url: URL.createObjectURL(file),
            local: true
        };

        currentPlaylist.push(newSong);
        savePlaylist();
        renderPlaylist();
        showNotification('File added successfully!', 'success');
    }
});


// ==============================
// KEYBOARD SHORTCUTS
// ==============================

document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    } else if (e.code === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        next();
    } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        previous();
    }
});