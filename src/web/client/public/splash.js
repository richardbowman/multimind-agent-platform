window.electron.status((log) => {
    alert(log);
    document.getElementById('message').textContent = log.message;
    // Update progress bar based on message
    if (log.percentComplete > 0) {
        const progress = document.getElementById('progress');
        progress.style.width = Math.floor(log.percentComplete*100) + '%';
    }
});