import React, { useCallback } from 'react';                                                                                                        
import { Box, Paper } from '@mui/material';                                                                                                        
import { BoldItalicUnderlineToggles, headingsPlugin, listsPlugin, markdownShortcutPlugin, MDXEditor, MDXEditorMethods, MDXEditorProps, quotePlugin, thematicBreakPlugin, toolbarPlugin, UndoRedo } from '@mdxeditor/editor';                                                                   
import { useIPCService } from '../../contexts/IPCContext';                                                                                         
import { ArtifactItem } from '../../../../../tools/artifact';                                                                                      
import '@mdxeditor/editor/style.css';                                                                                                              
                                                                                                                                                   
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
                                                                                                                                                   
  const handleSave = useCallback(async () => {                                                                                                     
    if (artifact && ipcService.getRPC()) {                                                                                                         
      const markdown = editorRef.current?.getMarkdown() || '';                                                                                     
      await ipcService.getRPC().saveArtifact({                                                                                                     
        ...artifact,                                                                                                                               
        content: markdown                                                                                                                          
      });                                                                                                                                          
    }                                                                                                                                              
  }, [artifact, ipcService]);                                                                                                                      
                                                                                                                                                   
  return (                                                                                                                                         
    <Box sx={{ p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>                                                              
      <Paper elevation={3} sx={{ p: 2, overflow: 'scroll', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>                                            
        <MDXEditor                                                                                                                                 
          ref={editorRef}                                                                                                                          
          markdown={initialContent}                                                                                                                
          onChange={onChange}                                                                                                                      
          readOnly={readOnly}                                                                                                                      
          contentEditableClassName="prose"                                                                                                         
          plugins={[                                                                                                                               
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                </>
              )
            })                                                                                              
          ]}                                                                                                                                 
        />                                                                                                                                         
      </Paper>                                                                                                                                     
    </Box>                                                                                                                                         
  );                                                                                                                                               
}; 