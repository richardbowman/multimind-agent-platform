import React, { useRef, useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

interface ScrollViewProps {
  children: React.ReactNode;
  className?: string;
  autoScroll?: boolean;
  onScroll?: (isAtBottom: boolean) => void;
}

export const ScrollView: React.FC<ScrollViewProps> = ({ 
  children, 
  className, 
  autoScroll = false,
  onScroll 
}) => {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkScrollPosition = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowTopGradient(scrollTop > 0);
      const newIsAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
      setIsAtBottom(newIsAtBottom);
      onScroll?.(newIsAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (autoScroll && isAtBottom) {
      scrollToBottom();
    }
  }, [children, autoScroll, isAtBottom]);

  return (
    <Box 
      sx={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        ...(className ? { [className]: true } : {})
      }}
    >
      {showTopGradient && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '20px',
            pointerEvents: 'none',
            zIndex: 1,
            top: 0,
            background: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, rgba(255,255,255,0) 100%)`
          }}
        />
      )}
      <Box
        ref={scrollRef}
        sx={{
          height: '100%',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.divider} ${theme.palette.background.paper}`,
          '&::-webkit-scrollbar': {
            width: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: theme.palette.background.paper
          },
          '&::-webkit-scrollbar-thumb': {
            background: theme.palette.divider,
            borderRadius: '3px',
            '&:hover': {
              background: theme.palette.action.hover
            }
          }
        }}
        onScroll={checkScrollPosition}
      >
        {children}
      </Box>
      {showBottomGradient && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '20px',
            pointerEvents: 'none',
            zIndex: 1,
            bottom: 0,
            background: `linear-gradient(to top, ${theme.palette.background.paper} 0%, rgba(255,255,255,0) 100%)`
          }}
        />
      )}
    </Box>
  );
};
