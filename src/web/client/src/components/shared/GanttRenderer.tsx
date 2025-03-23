import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { ArtifactItem } from '../../../../../tools/artifact';
import { Gantt } from 'frappe-gantt';
import { GanttData } from '../../../../../schemas/GanttData';

interface MarkwhenRendererProps {
    content: string;
    artifact?: ArtifactItem;
}

export const GanttRenderer: React.FC<MarkwhenRendererProps> = ({ content, artifact }) => {
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

    const ganttRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ganttRef.current && ganttData.tasks.length > 0) {
            const tasks = ganttData.tasks.map(task => ({
                id: task.id.toString(),
                name: task.text,
                start: task.start,
                end: task.end,
                progress: task.progress || 0,
                dependencies: ganttData.links
                    ?.filter(link => link.target === task.id)
                    .map(link => link.source.toString()) || '',
                custom_class: task.type === 'summary' ? 'summary' : ''
            }));

            new Gantt(ganttRef.current, tasks, {
                header_height: 50,
                column_width: 30,
                step: 24,
                view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
                bar_height: 20,
                bar_corner_radius: 3,
                arrow_curve: 5,
                padding: 18,
                view_mode: 'Month',
                date_format: 'YYYY-MM-DD',
                custom_popup_html: null
            });
        }
    }, [ganttData]);

    return (
        <Box sx={{ width: '100%', height: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {artifact?.metadata?.title || 'Gantt Chart'}
            </Typography>
            <div ref={ganttRef} style={{ width: '100%', height: '600px' }} />
        </Box>
    );
};
