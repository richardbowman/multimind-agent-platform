import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Box } from '@mui/material';
import { Snackbar, IconButton, Button, LinearProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { SnackbarCloseReason } from '@mui/material/Snackbar';
import { UpdateStatus } from '../../../../types/UpdateStatus';
import { useIPCService } from '../contexts/IPCContext';

export interface ProgressMeter {
  id: string;
  message: string;
  percentComplete: number;
}

export interface SnackbarOptions {
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error' | 'progress';
  persist?: boolean;
  percentComplete?: number;
  onClick?: () => void;
  updateStatus?: UpdateStatus;
  progressMeters?: ProgressMeter[];
}

export interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions) => void;
  setUpdateStatus: (status: UpdateStatus, percentComplete?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  showSnackbar: () => { },
  setUpdateStatus: () => { }
});

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SnackbarOptions>({
    message: '',
    severity: 'info',
    progressMeters: []
  });

  const ipcContext = useIPCService();

  useEffect(() => {
    const statusHandler = (log) => {
      // Update progress bar based on message
      if (log.details.percentComplete !== undefined && log.details.percentComplete >= 0) {
        setOpen(true);
        setOptions(prev => {
          const existingMeters = prev.progressMeters || [];
          const meterIndex = existingMeters.findIndex(m => m.id === log.details.id);

          // Only create meter if we have a valid percentage
          if (log.details.percentComplete !== undefined) {
            const newMeter = {
              id: log.details.id,
              message: log.message,
              percentComplete: log.details.percentComplete
            };

            let updatedMeters = meterIndex >= 0
              ? [
                ...existingMeters.slice(0, meterIndex),
                newMeter,
                ...existingMeters.slice(meterIndex + 1)
              ]
              : [...existingMeters, newMeter];

            // If progress is complete, schedule removal after 2 seconds
            if (log.details.percentComplete >= 1) {
              setTimeout(() => {
                setOptions(prev => ({
                  ...prev,
                  progressMeters: prev.progressMeters?.filter(m => m.id !== log.details.id) || []
                }));
              }, 2000);
            }

            return {
              ...prev,
              progressMeters: updatedMeters,
              persist: log.details.percentComplete < 1,
              severity: 'progress',
              message: '' // Clear the message when showing progress
            };
          }
          return prev;
        });
      } else {
        setOpen(true);
        setOptions(prev => ({
          ...prev,
          message: log.message,
          severity: 'info',
          progressMeters: [] // Clear progress meters when showing regular messages
        }));
      };
    };

    const removeCallback = (window as any).electron.status(statusHandler);

    // Cleanup listener when component unmounts
    return () => {
      removeCallback();
    };
  }, []);

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
        sx={{
          '& .MuiSnackbarContent-root': {
            backgroundColor: theme => theme.palette.background.paper,
            color: theme => theme.palette.text.primary,
            boxShadow: theme => theme.shadows[6],
            borderLeft: theme => `4px solid ${theme.palette.primary.main}`,
            minWidth: 300,
            maxWidth: 500,
          },
          '& .MuiButton-text': {
            color: theme => theme.palette.primary.main,
          },
          '& .MuiLinearProgress-root': {
            backgroundColor: theme => theme.palette.action.disabledBackground,
          },
          '& .MuiLinearProgress-bar': {
            backgroundColor: theme => theme.palette.primary.main,
          },
          minWidth: 300, // Match the snackbar width to progress bar
          '& .MuiSnackbarContent-message': {
            width: '100%' // Make message container full width
          }
        }}
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
            {(options.severity === 'progress' || options.updateStatus || options.progressMeters?.length) && (
              <Box sx={{ width: '100%', mt: 1 }}>
                {options.progressMeters?.map((meter) => (
                  <Box key={meter.id} sx={{ mb: 1 }}>
                    <Box sx={{ fontSize: '0.8rem', mb: 0.5 }}>{meter.message}</Box>
                    <LinearProgress
                      variant="determinate"
                      value={meter.percentComplete * 100}
                      sx={{
                        width: '100%',
                        minWidth: 300,
                        maxWidth: 500
                      }}
                    />
                  </Box>
                ))}
                {options.updateStatus && (
                  <LinearProgress
                    variant={options.updateStatus === UpdateStatus.Downloaded ? 'indeterminate' : 'determinate'}
                    value={(options.percentComplete || 0) * 100}
                    sx={{
                      width: '100%',
                      minWidth: 300,
                      maxWidth: 500
                    }}
                  />
                )}
              </Box>
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
      />
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => useContext(SnackbarContext);
