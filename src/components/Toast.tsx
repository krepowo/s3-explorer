'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

/** Corner notification, used instead of window.alert(). An empty message hides it. */
export function Toast({
  message,
  severity = 'success',
  onClose,
}: {
  message: string;
  severity?: ToastSeverity;
  onClose: () => void;
}) {
  return (
    <Snackbar
      open={Boolean(message)}
      autoHideDuration={severity === 'error' ? 6000 : 3500}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        severity={severity}
        variant="filled"
        onClose={onClose}
        // "Dismiss" rather than MUI's default "Close", so this button is never
        // confused with a dialog's own Close button.
        closeText="Dismiss"
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
