import React, { useState } from 'react';
import { Drawer, Box, styled } from '@mui/material';

const ResizableHandle = styled(Box)(({ theme }) => ({
    position: 'absolute',
    left: -4,
    top: 0,
    bottom: 0,
    width: 8,
    cursor: 'col-resize',
    zIndex: 1,
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

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = anchor === 'right' 
            ? window.innerWidth - e.clientX
            : e.clientX;
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            onWidthChange(newWidth);
        }
    };

    const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

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
