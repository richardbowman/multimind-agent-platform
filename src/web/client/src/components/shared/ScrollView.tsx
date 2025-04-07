import React, { useRef, useState, useEffect, useCallback, forwardRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { alpha } from '@mui/system';       
import { SxProps, Theme } from '@mui/material/styles';
import { CustomScrollbarStyles } from '../../styles/styles';

interface ScrollViewProps {
  children: React.ReactNode;
  className?: string;
  autoScroll?: boolean;
  onScroll?: (isAtBottom: boolean) => void;
  sx?: SxProps<Theme>;
  innerSx?: SxProps<Theme>;
}

export const ScrollView = forwardRef<HTMLDivElement, ScrollViewProps>(({ 
  children, 
  className, 
  autoScroll = false,
  onScroll,
  sx,
  innerSx
}, ref) => {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkScrollPosition = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowTopGradient(scrollTop > 0);
      setShowBottomGradient(scrollTop < scrollHeight - clientHeight);
      const newIsAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
      setIsAtBottom(prev => {
        if (prev !== newIsAtBottom) {
          onScroll?.(newIsAtBottom);
          return newIsAtBottom;
        }
        return prev;
      });
    }
  }, [onScroll]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
      };
    }
  }, [checkScrollPosition]);

  useEffect(() => {
    if (autoScroll && isAtBottom) {
      scrollToBottom();
    }
  }, [children, autoScroll, isAtBottom]);

  // Initial check
  useEffect(() => {
    checkScrollPosition();
  }, [checkScrollPosition]);

  return (
    <Box
      className={`scroll-view ${className}`}
      sx={{
        overflow: 'hidden',
        ...sx
      }}
    >
      {showTopGradient && (
        <Box
          sx={{
            position: 'relative',
            left: 0,
            right: 0,
            height: '20px',
            pointerEvents: 'none',
            marginBottom: '-20px',
            zIndex: 1,
            top: 0,
            background: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper,0)} 100%)`
          }}
        />
      )}
      <Box
        ref={(node) => {
          if (node) {
            // Assign to both the forwarded ref and our internal ref
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
            scrollRef.current = node;
          }
        }}
        sx={{
          height: '100%',
          overflowY: 'auto',
          ...CustomScrollbarStyles(theme),
          ...innerSx
        }}
        onScroll={checkScrollPosition}
      >
        {children}
      </Box>
      {showBottomGradient && (
        <Box
          sx={{
            position: 'relative',
            left: 0,
            right: 0,
            height: '20px',
            marginTop: '-20px',
            pointerEvents: 'none',
            zIndex: 1,
            bottom: 0,
            background: `linear-gradient(to top, ${theme.palette.background.paper} 0%, rgba(255,255,255,0) 100%)`
          }}
        />
      )}
    </Box>
  );
});
