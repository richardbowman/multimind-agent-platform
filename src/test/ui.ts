import blessed from 'blessed';
import { markdown } from 'blessed-contrib';
import Logger from 'src/helpers/logger';

// Create a screen object first
export const screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    dockBorders: true,
    title: 'Chat Client'
});

// Create splash screen box
export const splashBox = blessed.box({
    top: '10%',
    left: '10%',
    width: '80%',
    height: '80%',
    align: 'center',
    valign: 'middle',
    content: 
`_   _ _____ _____ _  __
 | \\ | |_   _/ ____| |/ /
 |  \\| | | || |    | ' / 
 | . \` | | || |    |  <  
 | |\\  |_| || |____| . \\ 
 |_| \\_|___|\\_____||_|\\_\\
  
 Neural Intelligence Collaboration Kit`,
    style: {
        fg: 'green',
        bg: 'black',
        transparent: true
    },
    tags: true,
    hidden: true
});


// Create a tab container
export const tabContainer = blessed.listbar({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    keys: true,
    mouse: true,
    commands: {
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

// Create a container for Tab 1
export const tab1Box = blessed.box({
    top: 2,
    left: 0,
    width: '100%',
    height: '100%-3',
    style: {
        fg: 'white',
        bg: 'black'
    }
});

screen.append(tab1Box);
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
    left: 0,
    width: '30%',
    top: 0,
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
    top: '35%',
    height: '65%-2'
});

tab1Box.append(threadList);

// Create a box to display chat messages.
export const chatBox = blessed.log({
    top: 0,
    left: '30%',
    width: '40%',
    height: '100%-3',
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

// Create a textarea to enter messages.
export const inputBox = blessed.textarea({
    top: '100%-5',
    left: 0,
    width: '100%',
    height: 5,
    keys: true,
    mouse: true,
    inputOnFocus: true,
    vi: true, // Enable vi-style keybindings
    cursorKeys: true, // Enable cursor key movement
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

export const taskDetailViewer = markdown({
    top: '10%',
    left: '10%',
    width: '80%',
    height: '80%',
    mouse: true,
    keys: true,
    scrollable: true,
    label: 'Task Viewer',
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

screen.append(taskDetailViewer);

// Create a main container box
export const tab3Box = blessed.box({
    top: 2,
    left: 0,
    width: '100%',
    height: '100%-2',
    style: {
        fg: 'white',
        bg: 'black'
    },
    hidden: true
});

screen.append(tab3Box);

// Create type filter dropdown
export const artifactTypeFilter = blessed.listbar({
    keys: true,
    mouse: true,
    label: 'Filter by Type',
    border: {
        type: 'line'
    },
    style: {
        selected: {
            bg: 'blue',
            fg: 'white'
        }
    },
    left: 0,
    width: '100%',
    top: 0,
    height: 3,
    commands: {
        'allitems': {
            key: 'All Items',
            callback: () => { artifactTypeFilter.emit('filter', 'allitems')}
        }
    }
});

tab3Box.append(artifactTypeFilter)

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
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
        style: {
            bg: 'blue'
        },
        track: {
            bg: 'gray'
        }
    },
    left: 0,
    width: '30%',
    top: 3,
    height: '100%-3'
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
    alwaysScroll: true,
    scrollbar: {
        ch: ' ',
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
    }
});

tab3Box.append(globalArtifactList);
tab3Box.append(globalArtifactViewer);

screen.append(splashBox);
screen.render();

Logger.logBox = logBox;
