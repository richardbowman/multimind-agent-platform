import '@babel/standalone';
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom';
export * as ReactDOMClient from 'react-dom/client';
export * as MaterialUI from '@mui/material';
export { ThemeProvider, createTheme } from '@mui/material/styles';

export const getTheme = (themeName) => {
    switch(themeName) {
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