import React, { useRef, useState } from 'react';
import styles from './ScrollView.module.css';

interface ScrollViewProps {
  children: React.ReactNode;
  className?: string;
}

export const ScrollView: React.FC<ScrollViewProps> = ({ children, className }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowTopGradient(scrollTop > 0);
      setShowBottomGradient(scrollTop < scrollHeight - clientHeight);
    }
  };

  return (
    <div className={`${styles.scrollContainer} ${className}`}>
      {showTopGradient && <div className={styles.topGradient} />}
      <div 
        ref={scrollRef}
        className={styles.scrollContent}
        onScroll={handleScroll}
      >
        {children}
      </div>
      {showBottomGradient && <div className={styles.bottomGradient} />}
    </div>
  );
};
