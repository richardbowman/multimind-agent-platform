import React from 'react';
import { Box, Typography } from '@mui/material';
import { ArtifactItem } from '../../../../../tools/artifact';
import { Gantt, Willow } from 'wx-react-gantt';
import 'wx-react-gantt/dist/gantt.css';

interface MarkwhenRendererProps {
    content: string;
    artifact?: ArtifactItem;
}

interface GanttData {
    tasks: Array<{
        id: number;
        text: string;
        start: Date;
        end: Date;
        duration?: number;
        progress?: number;
        type?: 'task' | 'summary';
        parent?: number;
    }>;
    links?: Array<{
        id: number;
        source: number;
        target: number;
        type: string;
    }>;
    scales?: Array<{
        unit: string;
        step: number;
        format: string;
    }>;
}

export const MarkwhenRenderer: React.FC<MarkwhenRendererProps> = ({ content, artifact }) => {
    let ganttData: GanttData = { tasks: [] };
    
    try {
        ganttData = JSON.parse(content);
    } catch (error) {
        console.error('Error parsing Gantt data:', error);
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="error">Invalid Gantt data format</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', height: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {artifact?.metadata?.title || 'Gantt Chart'}
            </Typography>
            <Willow>
                <Gantt 
                    tasks={ganttData.tasks} 
                    links={ganttData.links} 
                    scales={ganttData.scales || [
                        { unit: 'month', step: 1, format: 'MMMM yyy' },
                        { unit: 'day', step: 1, format: 'd' }
                    ]}
                />
            </Willow>
        </Box>
    );
};
