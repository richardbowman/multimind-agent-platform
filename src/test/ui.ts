import blessed from 'blessed';
import Logger from 'src/helpers/logger';

// Create a screen object.
export const screen = blessed.screen({
    smartCSR: true,
    title: 'Chat Client'
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
    left: '70%',
    width: '30%',
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
    // inputOnFocus: true,
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

export const artifactList = blessed.list({
    keys: true,
    fg: 'green',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: true,
    mouse: true,
    focusable: true,
    label: 'Artifact List',
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
    height: '90%',
    hidden: true
  });
  
  export const artifactDetail = blessed.box({
    keys: true,
    fg: 'green',
    label: 'Artifact Detail',
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    border: {
      type: 'line'
    },
    style: {
      header: {
        bg: 'blue'
      }
    },
    width: '70%',
    height: '90%',
    left: '30%',
    hidden: true
  });
  
screen.append(artifactList);
screen.append(artifactDetail);

Logger.logBox = logBox;


// Focus on the input box and refresh the screen.
inputBox.focus();
screen.render();