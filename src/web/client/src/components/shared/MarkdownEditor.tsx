import React, { useState, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { Box, Paper } from '@mui/material';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $convertToMarkdownString } from '@lexical/markdown';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
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
  const { registerActions, unregisterActions } = useToolbarActions();

  const initialConfig = {
    namespace: 'MarkdownEditor',
    theme,
    onError,
    editable: !readOnly,
    nodes: [
      // Add any custom nodes here
    ]
  };

  const handleChange = (editorState: any) => {
    // Convert Lexical editor state to markdown
    const markdown = $convertToMarkdownString(editorState);
    setEditorState(markdown);
    onChange?.(markdown);
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
  }, [registerActions, unregisterActions]);

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={3} sx={{ p: 2 }}>
        <LexicalComposer 
          initialConfig={{
            ...initialConfig,
            editorState: (editor) => {
              // Initialize editor with markdown content
              const root = $getRoot();
              const paragraph = $createParagraphNode();
              const text = $createTextNode(initialContent);
              paragraph.append(text);
              root.append(paragraph);
            }
          }}
        >
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
