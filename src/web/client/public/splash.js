window.electron.status((message) => {
    document.getElementById('message').textContent = message;
    // Update progress bar based on message
    const progress = document.getElementById('progress');
    if (message.includes('Initializing')) {
        progress.style.width = '20%';
    } else if (message.includes('Loading')) {
        progress.style.width = '50%';
    } else if (message.includes('Starting')) {
        progress.style.width = '80%';
    } else if (message.includes('Ready')) {
        progress.style.width = '100%';
    }
});