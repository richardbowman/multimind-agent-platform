window.electron.status((log) => {
    document.getElementById('message').textContent = log.message;
    // Update progress bar based on message
    if (log.details.percentComplete > 0) {
        const progress = document.getElementById('progress');
        progress.style.width = Math.floor(log.details.percentComplete*100) + '%';
    }
});