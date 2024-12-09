import blessed from 'blessed';
import { markdown } from 'blessed-contrib';
import Logger from 'src/helpers/logger';

// Create a screen object.
export const screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    dockBorders: true,
    title: 'Chat Client'
});

// Create a main container box
export const tab1Box = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-3',
    style: {
        fg: 'white',
        bg: 'black'
    }
});

screen.append(tab1Box);

// Create a tab container
export const tabContainer = blessed.listbar({
    top: 0,
    left: 0,
    width: '100%',
    height: 4,
    keys: true,
    mouse: true,
    items: {
        "Chat": {
            key: "Chat",
            keys: ["C-a"],
            callback: () => { tabContainer.emit("menu", "chat"); }
        },
        "Log": {
            key: "Log",
            keys: ["C-b"],
            callback: () => { tabContainer.emit("menu", "log"); }
        },
        "Artifacts": {
            key: "Artifacts",
            keys: ["C-d"],
            callback: () => { tabContainer.emit("menu", "artifacts"); }
        }
    }
});

screen.append(tabContainer);

// Create a box to select channels.
export const channelList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    mouse: true,
    clickable: true,
    label: 'Channels',
    border: {
        type: 'line'
    },
    style: {
        header: {
            bg: 'blue'
        }
    },
    left: '0%',
    width: '30%',
    top: 3,
    height: '35%'
});

tab1Box.append(channelList);

// Create a box to select threads.
export const threadList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    mouse: true,
    clickable: true,
    label: 'Threads',
    border: {
        type: 'line'
    },
    style: {
        header: {
            bg: 'blue'
        }
    },
    left: '0%',
    width: '30%',
    top: '35%+3',
    height: '65%-5'
});

tab1Box.append(threadList);

// Create a box to display chat messages.
export const chatBox = blessed.log({
    top: 3,
    left: '30%',
    width: '40%',
    height: '100%-6',
    label: 'Chat',
    content: '',
    tags: true,
    scrollable: true,
    mouse: true,
    alwaysScroll: true,
    scrollbar: {
        style: {
            bg: 'blue'
        },
        track: {
            bg: 'gray'
        }
    },
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

tab1Box.append(chatBox);

// Create a box to enter messages.
export const inputBox = blessed.textbox({
    top: '100%-3',
    left: 0,
    width: '100%',
    height: 3,
    keys: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'red'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

tab1Box.append(inputBox);

// Create a list for tasks related to the projects in the current thread.
export const taskList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: true,
    mouse: true,
    focusable: true,
    label: 'Tasks List',
    border: {
        type: 'line'
    },
    style: {
        header: {
            bg: 'blue'
        }
    },
    left: '70%-1',
    width: '30%+1',
    top: '50%',
    height: '50%-2',
});

tab1Box.append(taskList);

// Create a list for artifacts related to the current thread.
export const artifactList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: true,
    mouse: true,
    focusable: true,
    label: 'Artifacts List',
    border: {
        type: 'line'
    },
    style: {
        header: {
            bg: 'blue'
        }
    },
    top: 3,
    left: '70%-1',
    width: '30%+1',
    height: '50%-3'
});

tab1Box.append(artifactList);

// Create a log box
export const logBox = blessed.log({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-3',
    tags: true,
    scrollable: true,
    mouse: true,
    alwaysScroll: true,
    scrollbar: {
        style: {
            bg: 'blue'
        },
        track: {
            bg: 'gray'
        }
    },
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

screen.append(logBox);

export const artifactDetailViewer = markdown({
    top: '10%',
    left: '10%',
    width: '80%',
    height: '80%',
    mouse: true,
    keys: true,
    scrollable: true,
    label: 'Artifact Viewer',
    focusable: true,
    scrollbar: {
        style: {
            bg: 'blue'
        },
        track: {
            bg: 'gray'
        }
    },
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        bg: 'black',
        fg: 'white'
    },
    shadow: true,
    draggable: true,
    hidden: true
});

screen.append(artifactDetailViewer);

// Create global artifact list and viewer
export const globalArtifactList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: true,
    mouse: true,
    focusable: true,
    label: 'All Artifacts',
    border: {
        type: 'line'
    },
    style: {
        header: {
            bg: 'blue'
        }
    },
    left: 0,
    width: '30%',
    top: 3,
    height: '100%-3',
    hidden: true
});

export const globalArtifactViewer = markdown({
    top: 3,
    left: '30%',
    width: '70%',
    height: '100%-3',
    mouse: true,
    keys: true,
    scrollable: true,
    label: 'Artifact Content',
    focusable: true,
    scrollbar: {
        style: {
            bg: 'blue'
        },
        track: {
            bg: 'gray'
        }
    },
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        bg: 'black',
        fg: 'white'
    },
    hidden: true
});

screen.append(globalArtifactList);
screen.append(globalArtifactViewer);

screen.render();

Logger.logBox = logBox;
