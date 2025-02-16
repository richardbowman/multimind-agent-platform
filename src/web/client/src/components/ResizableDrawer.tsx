import React, { useState, useEffect } from 'react';
import { Drawer, Box, styled } from '@mui/material';

const ResizableHandle = styled(Box)(({ theme }) => ({
    width: '5px',
    cursor: 'ew-resize',
    padding: '4px 0 0',
    borderTop: '1px solid #ddd',
    position: 'absolute',
    top: 0,
    left: -2,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#f4f7f9',
    '&:hover': {
        backgroundColor: theme.palette.primary.main,
    },
}));

interface ResizableDrawerProps {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    onWidthChange: (newWidth: number) => void;
    children: React.ReactNode;
    anchor: 'left' | 'right';
    open: boolean;
    onClose?: () => void;
}

export const ResizableDrawer: React.FC<ResizableDrawerProps> = ({
    width,
    minWidth = 200,
    maxWidth = 800,
    onWidthChange,
    children,
    anchor,
    open,
    onClose
}) => {
    const [isResizing, setIsResizing] = useState(false);
    const [lastDownX, setLastDownX] = useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        setLastDownX(e.clientX);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        
        const offset = e.clientX - lastDownX;
        const newWidth = anchor === 'right' 
            ? Math.max(minWidth, Math.min(maxWidth, width - offset))
            : Math.max(minWidth, Math.min(maxWidth, width + offset));
        
        onWidthChange(newWidth);
        setLastDownX(e.clientX);
    };

    const handleMouseUp = () => {
        setIsResizing(false);
    };

    useEffect(() => {
        const handleMouseMoveBound = (e: MouseEvent) => handleMouseMove(e);
        const handleMouseUpBound = () => handleMouseUp();

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMoveBound);
            document.addEventListener('mouseup', handleMouseUpBound);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMoveBound);
            document.removeEventListener('mouseup', handleMouseUpBound);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <Drawer
            anchor={anchor}
            variant="persistent"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: width,
                    overflow: 'visible',
                    backgroundColor: '#2a2a2a',
                    position: 'absolute',
                }
            }}
        >
            {anchor === 'right' && (
                <ResizableHandle onMouseDown={handleMouseDown} />
            )}
            {children}
        </Drawer>
    );
};
