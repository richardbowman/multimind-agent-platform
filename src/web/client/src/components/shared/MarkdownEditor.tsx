import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { Box, Paper } from '@mui/material';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $convertToMarkdownString, $convertFromMarkdownString } from '@lexical/markdown';
import { $getRoot, $createParagraphNode, $createTextNode, LexicalCommand, createCommand, COMMAND_PRIORITY_LOW, $getSelection, FORMAT_TEXT_COMMAND, $isRangeSelection } from 'lexical';
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListNode, ListItemNode } from "@lexical/list";
import { TableNode, TableCellNode, TableRowNode } from "@lexical/table";
import { CodeNode } from "@lexical/code";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CommandListenerPriority } from 'lexical'
import { mergeRegister } from '@lexical/utils';
import SaveIcon from '@mui/icons-material/Save';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import { useIPCService } from '../../contexts/IPCContext';
import { ArtifactItem } from '../../../../../tools/artifact';

interface MarkdownEditorProps {
  initialContent?: string;
  artifact?: ArtifactItem;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

const theme = {
  // Theme styling goes here
};

function onError(error: Error) {
  console.error(error);
}

type ActionPluginProps = {
  artifact?: ArtifactItem
};

export function ActionsPlugin({ artifact }: ActionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const ipcService = useIPCService();
  const { registerActions, unregisterActions } = useToolbarActions();

  function getActionSet() {
    return editor.read(() => {
      const selection = $getSelection();
      return [
        {
          id: 'bold',
          icon: <FormatBoldIcon />,
          label: $isRangeSelection(selection) && selection?.hasFormat('bold') ? 'Unbold' : 'Bold',
          onClick: () => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
          }
        },
        // artifact-specific actions
        ...(artifact && [
          {
            id: 'save',
            icon: <SaveIcon />,
            label: $isRangeSelection(selection) && selection?.hasFormat('bold') ? 'Unbold' : 'Bold',
            onClick: () => {
              if (ipcService.getRPC()) {
                editor.read(() => {
                  const markdown = $convertToMarkdownString(TRANSFORMERS);
                  ipcService.getRPC().saveArtifact({
                    ...artifact,
                    content: markdown
                  });
                });
              }
            }
          }
        ] || [])
      ]
    });
  };

  useEffect(() => {
    // Register markdown-specific toolbar actions
    registerActions('markdown-editor', getActionSet());

    return () => {
      unregisterActions('markdown-editor');
    };
  }, [editor, registerActions, unregisterActions]);

  React.useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          registerActions('markdown-editor', getActionSet());
        });
      })
    );
  }, [editor]);

  return null;
}

function RefPlugin({ editorRef } : { editorRef: any }) {
  const [editor] = useLexicalComposerContext()
  editorRef.current = editor
  return null
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  artifact,
  initialContent = '',
  onChange,
  readOnly = false
}) => {
  const editorStateRef = useRef(undefined);
  const editorRef = useRef(undefined);

  const initialConfig = {
    namespace: 'MarkdownEditor',
    theme,
    onError,
    editable: !readOnly,
    nodes: [
      LinkNode,
      AutoLinkNode,
      ListNode,
      ListItemNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      HorizontalRuleNode,
      CodeNode,
      HeadingNode,
      LinkNode,
      ListNode,
      ListItemNode,
      QuoteNode,
    ]
  };

  const handleChange = (editorState: any) => {
    // console.log(editorState);
    editorStateRef.current = editorState;
  };

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.update(() => {
          console.log('update');
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(initialContent, TRANSFORMERS);
      });
    } else {
      console.log('no editor state');
    }
  }, [initialContent]);

  return (
    <Box sx={{ p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Paper elevation={3} sx={{ p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <LexicalComposer
          initialConfig={initialConfig}
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
          <RefPlugin editorRef={editorRef} />
        </LexicalComposer>
      </Paper>
    </Box>
  );
};
