import React, { useRef, useState, useEffect } from 'react';
import styles from './ScrollView.module.css';
import { useTheme } from '@mui/material/styles';

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
    <div className={`${styles.scrollContainer} ${className}`}>
      {showTopGradient && <div className={styles.topGradient} />}
      <div 
        ref={scrollRef}
        className={styles.scrollContent}
        onScroll={checkScrollPosition}
      >
        {children}
      </div>
      {showBottomGradient && <div className={styles.bottomGradient} />}
    </div>
  );
};
