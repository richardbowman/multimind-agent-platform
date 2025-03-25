import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { createTheme, CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const ThemeWrapper = () => {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const settings = useSettings();
  
  const theme = React.useMemo(() => {
    const isDark = prefersDarkMode;
    
    if (settings.theme === 'atom-one-dark') {
      return createTheme({
        palette: {
          mode: 'dark',
          primary: {
            main: '#61afef',
            contrastText: '#ffffff',
          },
          secondary: {
            main: '#c678dd',
          },
          background: {
            default: '#282c34',
            paper: '#21252b',
          },
          text: {
            primary: '#abb2bf',
            secondary: '#5c6370',
          },
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          h1: {
            fontWeight: 700,
            fontSize: '2.5rem',
          },
          h2: {
            fontWeight: 600,
            fontSize: '2rem',
          },
          h3: {
            fontWeight: 500,
            fontSize: '1.75rem',
          },
          body1: {
            fontWeight: 400,
            fontSize: '1rem',
          },
          button: {
            fontWeight: 500,
            textTransform: 'none',
          },
        },
        shape: {
          borderRadius: 8,
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 24,
                padding: '8px 24px',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundColor: '#21252b',
                boxShadow: '0px 2px 4px rgba(0,0,0,0.2)',
              },
            },
          },
        },
      });
    }

    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: '#1de9b6',
          contrastText: '#000',
        },
        secondary: {
          main: '#00bfa5',
        },
        background: {
          default: isDark ? '#121212' : '#f5f5f5',
          paper: isDark ? '#1e1e1e' : '#ffffff',
        },
      },
      typography: {
        fontFamily: 'Inter, sans-serif',
        h1: {
          fontWeight: 700,
          fontSize: '2.5rem',
        },
        h2: {
          fontWeight: 600,
          fontSize: '2rem',
        },
        h3: {
          fontWeight: 500,
          fontSize: '1.75rem',
        },
        body1: {
          fontWeight: 400,
          fontSize: '1rem',
        },
        button: {
          fontWeight: 500,
          textTransform: 'none',
        },
      },
      shape: {
        borderRadius: 8,
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 24,
              padding: '8px 24px',
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              boxShadow: prefersDarkMode 
                ? '0px 2px 4px rgba(0,0,0,0.2)' 
                : '0px 2px 4px rgba(0,0,0,0.1)',
            },
          },
        },
      },
    }),
    [prefersDarkMode, settings.theme]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  );
};

root.render(
  <React.StrictMode>
    <ThemeWrapper />
  </React.StrictMode>
);
