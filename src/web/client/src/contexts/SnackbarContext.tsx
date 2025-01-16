import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Snackbar, IconButton, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SnackbarCloseReason } from '@mui/material/Snackbar';

export interface SnackbarOptions {
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error' | 'progress';
  persist?: boolean;
  percentComplete?: number;
  onClick?: () => void;
}

interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  showSnackbar: () => {}
});

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SnackbarOptions>({
    message: '',
    severity: 'info'
  });
  
  useEffect(() => {
      // Assuming you have an electron or similar IPC service
      (window as any).electron.status((logEntry) => {
        setOptions({
          message: logEntry.message,
          severity: logEntry.type || 'info',
          percentComplete: logEntry.data.percentComplete,
          persist: true,
        });
        setOpen(true);
      });
  }, []);

  const showSnackbar = useCallback((newOptions: SnackbarOptions) => {
    setOptions(newOptions);
    setOpen(true);
  }, []);

  const handleClose = useCallback((event: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
    if (reason === 'clickaway' && options.persist) {
      return;
    }
    setOpen(false);
  }, [options.persist]);

  const handleClick = useCallback(() => {
    if (options.onClick) {
      options.onClick();
    }
    setOpen(false);
  }, [options.onClick]);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={options.persist ? null : 2000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        action={
          <>
            {options.onClick && (
              <Button color="secondary" size="small" onClick={handleClick}>
                Jump
              </Button>
            )}
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
        message={options.message}
      />
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => useContext(SnackbarContext);
