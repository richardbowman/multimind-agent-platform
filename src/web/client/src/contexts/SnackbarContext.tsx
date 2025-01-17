import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { Snackbar, IconButton, Button, LinearProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SnackbarCloseReason } from '@mui/material/Snackbar';
import { UpdateStatus } from '../../../../shared/UpdateStatus';

export interface SnackbarOptions {
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error' | 'progress';
  persist?: boolean;
  percentComplete?: number;
  onClick?: () => void;
  updateStatus?: UpdateStatus;
}

export interface SnackbarContextType {
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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  
  useEffect(() => {
    const handleUpdateStatus = (status: UpdateStatus) => {
      setUpdateStatus(status);
      setOptions({
        message: status,
        severity: 'progress',
        persist: status === UpdateStatus.Downloaded,
        updateStatus: status
      });
      setOpen(true);
    };

    const handleUpdateProgress = (progress: number) => {
      setUpdateProgress(progress);
      setOptions(prev => ({
        ...prev,
        percentComplete: progress / 100
      }));
    };
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
        autoHideDuration={options.persist ? null : 6000}
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
        message={
          <Box sx={{ width: '100%' }}>
            <Box>{options.message}</Box>
            {(options.severity === 'progress' || options.updateStatus) && (
              <LinearProgress
                variant={options.updateStatus === UpdateStatus.Downloaded ? 'indeterminate' : 'determinate'}
                value={(options.percentComplete || 0)*100}
                sx={{ 
                  mt: 1,
                  width: '100%',
                  minWidth: 300,
                  maxWidth: 500
                }}
              />
            )}
            {options.updateStatus === UpdateStatus.Downloaded && (
              <Button 
                variant="contained" 
                color="primary" 
                size="small" 
                onClick={() => (window as any).electron?.installUpdate()}
                sx={{ mt: 1 }}
              >
                Restart to Update
              </Button>
            )}
          </Box>
        }
        sx={{
          minWidth: 300, // Match the snackbar width to progress bar
          '& .MuiSnackbarContent-message': {
            width: '100%' // Make message container full width
          }
        }}
      />
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => useContext(SnackbarContext);
