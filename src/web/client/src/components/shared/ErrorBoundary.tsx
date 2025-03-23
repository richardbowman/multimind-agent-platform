import React, { ErrorInfo, ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryProps {
    children: ReactNode;
    FallbackComponent?: React.ComponentType<{ error: Error; resetError: () => void }>;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    resetError = () => {
        this.setState({ hasError: false, error: undefined });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.FallbackComponent) {
                return <this.props.FallbackComponent error={this.state.error!} resetError={this.resetError} />;
            }
            
            return (
                <Box sx={{ p: 3 }}>
                    <Typography variant="h6" color="error" gutterBottom>
                        Something went wrong
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        {this.state.error?.message}
                    </Typography>
                    <Button 
                        variant="contained" 
                        color="primary"
                        onClick={this.resetError}
                    >
                        Try Again
                    </Button>
                </Box>
            );
        }

        return this.props.children;
    }
}
