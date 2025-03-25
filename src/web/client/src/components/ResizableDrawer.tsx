import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Box, styled, SxProps } from '@mui/material';

const ResizableHandle = styled(Box)(({ theme }) => ({
    width: '1px',
    cursor: 'ew-resize',
    padding: '4px 0 0',
    position: 'absolute',
    top: 0,
    left: -2,
    bottom: 0,
    zIndex: 100,
    backgroundColor: theme.palette.divider,
    '&:hover': {
        backgroundColor: theme.palette.primary.main,
    },
}));

interface ResizableDrawerProps {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    onWidthChange: (newWidth: number) => void;
    onResizeEnd?: (newWidth: number) => void;
    children: React.ReactNode;
    anchor: 'left' | 'right';
    sx? : SxProps;
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
    sx,
    onClose,
    onResizeEnd
}) => {
    const [isResizing, setIsResizing] = useState(false);
    const [lastDownX, setLastDownX] = useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        setLastDownX(e.clientX);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        const offset = e.clientX - lastDownX;
        const newWidth = anchor === 'right' 
            ? Math.max(minWidth, Math.min(maxWidth, width - offset))
            : Math.max(minWidth, Math.min(maxWidth, width + offset));
        
        onWidthChange(newWidth);
        setLastDownX(e.clientX);
    }, [isResizing, lastDownX, width, minWidth, maxWidth, anchor, onWidthChange]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (isResizing && onResizeEnd) {
            // const offset = e.clientX - lastDownX;
            // const newWidth = anchor === 'right' 
            //     ? Math.max(minWidth, Math.min(maxWidth, width - offset))
            //     : Math.max(minWidth, Math.min(maxWidth, width + offset));
    
            // onResizeEnd(newWidth);
        }
        setIsResizing(false);
    }, [isResizing, onResizeEnd, width]);

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
    }, [isResizing]); // Removed handleMouseMove and handleMouseUp from dependencies

    return (
        <Drawer
            anchor={anchor}
            variant="persistent"
            open={open}
            onClose={onClose}
            sx={sx}
            PaperProps={{
                sx: {
                    zIndex: 1,
                    borderLeft: 0,
                    width: width,
                    overflow: 'visible',
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
