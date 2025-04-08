export enum UpdateStatus {
    Checking = 'Checking for updates...',
    Available = 'Update available, downloading...',
    NotAvailable = 'No updates available',
    Downloading = 'Downloading update...',
    Downloaded = 'Update downloaded - Restart to install',
    Error = 'Update error'
}
