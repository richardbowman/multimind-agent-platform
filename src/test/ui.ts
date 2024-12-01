import blessed from 'blessed';
import Logger from 'src/helpers/logger';

// Create a screen object.
const screen = blessed.screen({
    smartCSR: true,
    title: 'Chat Client'
});

// Create a box to display chat messages.
export const chatBox = blessed.log({
    top: 0,
    left: 0,
    width: '50%',
    height: '90%',
    content: '',
    tags: true,
    scrollable: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

// Create a log box.
export const logBox = blessed.log({
    top: 0,
    left: '50%',
    width: '50%',
    height: '90%',
    content: '',
    scrollable: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'gray'
    }
});

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

// Append the boxes to the screen.
screen.append(chatBox);
screen.append(logBox);
screen.append(inputBox);

Logger.logBox = logBox;


// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

// Focus on the input box and refresh the screen.
inputBox.focus();
screen.render();