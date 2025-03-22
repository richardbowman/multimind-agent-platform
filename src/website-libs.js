import '@babel/standalone';
import { createTheme } from '@mui/material/styles';
import { parse } from 'csv-parse/browser/esm/sync';
import { stringify } from 'csv-stringify/browser/esm/sync';

// Message handling utilities
const postMessageWithResponse = (type, data) => {
    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(2);

        const handleMessage = (event) => {
            if (event.data.requestId === requestId) {
                window.removeEventListener('message', handleMessage);

                if (event.data.type === `${type}Response`) {
                    resolve(event.data);
                } else if (event.data.type === 'error') {
                    reject(new Error(event.data.message));
                }
            }
        };

        window.addEventListener('message', handleMessage);
        window.parent.postMessage({ type, requestId, ...data }, '*');
    });
};

export const Artifacts = {
    // Expose artifact methods using postMessage
    loadArtifactContent: async (artifactId) => {
        const response = await postMessageWithResponse('loadArtifactContent', { artifactId });
        return response.content;
    },

    getArtifactMetadata: async (artifactId) => {
        const response = await postMessageWithResponse('getArtifactMetadata', { artifactId });
        return response.metadata;
    },

    listAvailableArtifacts: async () => {
        const response = await postMessageWithResponse('listAvailableArtifacts', {});
        return response.artifacts;
    }
}

// Expose CSV utilities
export const CSV = {
    parseSync: (csvString, options) => parse(csvString, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        bom: true,
        ...options
    }),
    stringifySync: (data, options) => stringify(data, {
        header: true,
        ...options
    })
};

export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom';
export * as ReactDOMClient from 'react-dom/client';
export * as MaterialUI from '@mui/material';
export * as MaterialIcons from '@mui/icons-material';

export { ThemeProvider, createTheme, alpha } from '@mui/material/styles';

window.appContainer = {};

export const getTheme = (themeName) => {
    switch (themeName) {
        case 'light':
            return createTheme({
                palette: {
                    mode: 'light',
                    primary: {
                        main: '#1976d2',
                    },
                    secondary: {
                        main: '#9c27b0',
                    },
                },
            });
        case 'dark':
            return createTheme({
                palette: {
                    mode: 'dark',
                    primary: {
                        main: '#90caf9',
                    },
                    secondary: {
                        main: '#ce93d8',
                    },
                },
            });
        case 'blue':
            return createTheme({
                palette: {
                    primary: {
                        main: '#2196f3',
                    },
                    secondary: {
                        main: '#1976d2',
                    },
                },
            });
        case 'green':
            return createTheme({
                palette: {
                    primary: {
                        main: '#4caf50',
                    },
                    secondary: {
                        main: '#2e7d32',
                    },
                },
            });
        case 'corporate':
            return createTheme({
                palette: {
                    primary: {
                        main: '#3f51b5',
                    },
                    secondary: {
                        main: '#f50057',
                    },
                },
                typography: {
                    fontFamily: 'Roboto, Arial, sans-serif',
                    fontSize: 14,
                },
            });
        default:
            return createTheme();
    }
};

