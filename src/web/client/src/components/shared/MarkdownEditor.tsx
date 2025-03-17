import React, { useState, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { Box, Paper } from '@mui/material';
import { Toolbar } from './MarkdownToolbar';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface MarkdownEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

const theme = {
  // Theme styling goes here
};

function onError(error: Error) {
  console.error(error);
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ 
  initialContent = '',
  onChange,
  readOnly = false
}) => {
  const [editorState, setEditorState] = useState(initialContent);
  const { registerActions } = useToolbarActions();

  const initialConfig = {
    namespace: 'MarkdownEditor',
    theme,
    onError,
    editable: !readOnly,
    editorState: initialContent
  };

  const handleChange = (editorState: string) => {
    setEditorState(editorState);
    onChange?.(editorState);
  };

  useEffect(() => {
    // Register markdown-specific toolbar actions
    registerActions('markdown-editor', [
      {
        id: 'bold',
        icon: <span>B</span>,
        label: 'Bold',
        onClick: () => {/* Bold action */}
      },
      // Add more toolbar actions here
    ]);

    return () => {
      // Cleanup toolbar actions
      unregisterActions('markdown-editor');
    };
  }, [registerActions]);

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={3} sx={{ p: 2 }}>
        <LexicalComposer initialConfig={initialConfig}>
          {!readOnly && <Toolbar />}
          <RichTextPlugin
            contentEditable={
              <ContentEditable 
                style={{
                  minHeight: '200px',
                  resize: 'vertical',
                  overflow: 'auto',
                  border: '1px solid #ddd',
                  padding: '8px',
                  borderRadius: '4px'
                }}
              />
            }
            placeholder={
              <div style={{ position: 'absolute', top: '8px', left: '8px', color: '#999' }}>
                Start writing...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangePlugin onChange={handleChange} />
        </LexicalComposer>
      </Paper>
    </Box>
  );
};
