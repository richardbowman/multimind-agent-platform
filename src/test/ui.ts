import blessed from 'blessed';
import * as Logger from './helpers/logger';

// Create a screen object.
export const screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    title: 'Chat Client'
});

screen.key(['escape', 'q', 'C-c'], function (ch, key) {
    return process.exit(0);
});

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
    top: '0%',
    height: '35%'
});

screen.append(channelList);

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
    height: '45%'
});

screen.append(threadList);

// Create a box to display chat messages.
export const chatBox = blessed.log({
    top: 0,
    left: '30%',
    width: '40%',
    height: '90%',
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

screen.append(chatBox);

// Create a box to enter messages.
export const inputBox = blessed.textbox({
    top: '90%',
    left: 0,
    width: '100%',
    height: 'shrink',
    keys: true,
    inputOnFocus: true,
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

screen.append(inputBox);

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
    left: '70%',
    width: '30%',
    top: '50%',
    height: '50%-3',
});

screen.append(taskList);

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
    left: '70%',
    width: '30%',
    height: '50%'
});

screen.append(artifactList);

// Focus on the input box and refresh the screen.
inputBox.focus();
screen.render();