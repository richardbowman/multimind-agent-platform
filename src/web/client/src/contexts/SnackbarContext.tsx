import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { Snackbar, IconButton, Button, LinearProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SnackbarCloseReason } from '@mui/material/Snackbar';
import { UpdateStatus } from '../../../../shared/UpdateStatus';
import { useIPCService } from '../contexts/IPCContext';

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
  setUpdateStatus: (status: UpdateStatus, percentComplete?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  showSnackbar: () => {},
  setUpdateStatus: () => {} 
});

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SnackbarOptions>({
    message: '',
    severity: 'info'
  });

  const ipcContext = useIPCService();
  
  function setUpdateStatus(status: UpdateStatus, percentComplete?: number) {
    setOptions({
      percentComplete,
      updateStatus: status,
      message: "Update: " + status.toString(),
      severity: 'progress',
      persist: status === UpdateStatus.Downloaded
    });
    setOpen(true);
  }

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
    <SnackbarContext.Provider value={{ showSnackbar, setUpdateStatus }}>
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
                onClick={() => ipcContext.getRPC().quitAndInstall()}
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
