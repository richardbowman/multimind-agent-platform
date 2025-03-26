import React, { useActionState, useCallback, useEffect } from 'react';
import { Box, Paper, useTheme } from '@mui/material';
import { BoldItalicUnderlineToggles, ChangeCodeMirrorLanguage, CodeBlockNode, codeBlockPlugin, codeMirrorPlugin, CodeToggle, ConditionalContents, CreateLink, diffSourcePlugin, DiffSourceToggleWrapper, headingsPlugin, imagePlugin, InsertCodeBlock, InsertFrontmatter, InsertTable, linkDialogPlugin, linkPlugin, listsPlugin, ListsToggle, markdownShortcutPlugin, MDXEditor, MDXEditorMethods, MDXEditorProps, quotePlugin, tablePlugin, thematicBreakPlugin, toolbarPlugin, UndoRedo } from '@mdxeditor/editor';
import { useIPCService } from '../../contexts/IPCContext';
import { ArtifactItem } from '../../../../../tools/artifact';
import '@mdxeditor/editor/style.css';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import SaveIcon from '@mui/icons-material/Save';

interface MarkdownEditorProps {
  initialContent?: string;
  artifact?: ArtifactItem;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  artifact,
  initialContent = '',
  onChange,
  readOnly = false
}) => {
  const ipcService = useIPCService();
  const editorRef = React.useRef<MDXEditorMethods>(null);
  const theme = useTheme();
  const { actions: toolbarActions, registerActions, unregisterActions } = useToolbarActions();

  const handleSave = useCallback(async () => {
    if (artifact && ipcService.getRPC()) {
      const markdown = editorRef.current?.getMarkdown() || '';
      await ipcService.getRPC().saveArtifact({
        ...artifact,
        content: markdown
      });
    }
  }, [artifact, ipcService]);

  useEffect(() => {
    const mermaidActions = [
      {
        id: 'markdown-save',
        icon: <SaveIcon />,
        label: 'Save',
        onClick: handleSave
      }
    ];

    registerActions('markdown', mermaidActions);
    return () => unregisterActions('markdown');
  }, [toolbar, registerActions, unregisterActions, handleSave]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setMarkdown(initialContent);
    }
  }, [initialContent]);

  return (
    <Box sx={{ p: 2, overflow: 'hidden', display: 'flex', flex:1, flexDirection: 'column' }}>
      <Paper elevation={3} sx={{ p: 2, overflow: 'scroll', display: 'flex', flex:1, flexDirection: 'column' }}>
        <MDXEditor
          ref={editorRef}
          markdown={initialContent}
          readOnly={readOnly}
          darkMode={theme.palette.mode === 'dark'}
          contentEditableClassName="prose"
          onError={({ error, source }) => {
            console.error(error, source);
          }}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            thematicBreakPlugin(),
            diffSourcePlugin(),
            imagePlugin(),
            tablePlugin(),
            codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
            codeMirrorPlugin({ codeBlockLanguages: { '': "Unknown", js: 'JavaScript',json: 'JSON', css: 'CSS', mermaid: 'Mermaid', markdown: 'Markdown' } }),
            toolbarPlugin({
              toolbarContents: () => (
                <DiffSourceToggleWrapper>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                  <ListsToggle />
                  <CreateLink />
                  <InsertTable />
                  <InsertCodeBlock />
                  <CodeToggle />
                </DiffSourceToggleWrapper>
              )
            }),
            markdownShortcutPlugin(),
          ]}
        />
      </Paper>
    </Box>
  );
}; 
