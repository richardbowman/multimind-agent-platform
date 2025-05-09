import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { ArtifactItem } from '../../../../../tools/artifact';
import Gantt from 'frappe-gantt';
import { GanttData } from '../../../../../schemas/GanttData';
import '../../../../../../node_modules/frappe-gantt/dist/frappe-gantt.css';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import { Save, Today, CalendarViewWeek, CalendarViewMonth, CalendarToday } from '@mui/icons-material';

interface MarkwhenRendererProps {
    content: string;
    artifact?: ArtifactItem;
}

export const GanttRenderer: React.FC<MarkwhenRendererProps> = ({ content, artifact }) => {
    let ganttData: GanttData = { tasks: [] };
    let ganttObjRef = useRef(null);
    
    try {
        if (!content) {
            throw new Error('No content provided');
        }

        const { actions, registerActions, unregisterActions } = useToolbarActions();

        useEffect(() => {
            const navigationActions = [
                {
                    id: 'save-roadmap',
                    icon: <Save />,
                    label: 'Save Roadmap',
                    onClick: async () => {
                        if (!ganttObjRef.current || !artifact) return;
                        
                        // Get current tasks from Gantt instance
                        const tasks = ganttObjRef.current.tasks.map(task => ({
                            id: task.id,
                            text: task.name,
                            start: task.start,
                            end: task.end,
                            progress: task.progress,
                            type: task.custom_class === 'summary' ? 'summary' : 'task'
                        }));

                        // Get current links if they exist
                        const links = ganttData.links || [];

                        // Create updated Gantt data
                        const updatedData = {
                            tasks,
                            links,
                            scales: ganttData.scales || []
                        };

                        try {
                            // Save updated artifact
                            await fetch(`/api/artifacts/${artifact.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    content: JSON.stringify(updatedData),
                                    metadata: {
                                        ...artifact.metadata,
                                        updatedAt: new Date().toISOString()
                                    }
                                })
                            });

                            // Show success message
                            alert('Roadmap saved successfully!');
                        } catch (error) {
                            console.error('Error saving roadmap:', error);
                            alert('Failed to save roadmap');
                        }
                    }
                },
                {
                    id: 'view-day',
                    icon: <Today />,
                    label: 'Day View',
                    onClick: () => {
                        ganttObjRef.current?.change_view_mode('Day');
                    }
                },
                {
                    id: 'view-week',
                    icon: <CalendarViewWeek />,
                    label: 'Week View',
                    onClick: () => {
                        ganttObjRef.current?.change_view_mode('Week');
                    }
                },
                {
                    id: 'view-month',
                    icon: <CalendarViewMonth />,
                    label: 'Month View',
                    onClick: () => {
                        ganttObjRef.current?.change_view_mode('Month');
                    }
                },
                {
                    id: 'view-year',
                    icon: <CalendarToday />,
                    label: 'Year View',
                    onClick: () => {
                        ganttObjRef.current?.change_view_mode('Year');
                    }
                },
                {
                    id: 'go-to-today',
                    icon: <Today />,
                    label: 'Go to Today',
                    onClick: () => {
                        ganttObjRef.current?.scroll_current();
                    }
                }
            ];
    
            registerActions('roadmap-viewer', navigationActions);
            return () => unregisterActions('roadmap-viewer');
        }, []);

        
        const parsed = JSON.parse(content);
        
        // Validate basic structure
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
            throw new Error('Invalid Gantt data structure');
        }
        
        // Validate tasks
        const validTasks = parsed.tasks.filter(task => 
            task && 
            typeof task === 'object' &&
            task.id !== undefined &&
            task.text !== undefined &&
            task.start !== undefined &&
            task.end !== undefined
        );
        
        if (validTasks.length === 0) {
            throw new Error('No valid tasks found');
        }
        
        ganttData = {
            tasks: validTasks,
            links: Array.isArray(parsed.links) ? parsed.links : [],
            scales: Array.isArray(parsed.scales) ? parsed.scales : []
        };
        
    } catch (error) {
        console.error('Error parsing Gantt data:', error);
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="error" variant="body1">
                    Error rendering Gantt chart: {error.message}
                </Typography>
                <Typography variant="caption">
                    {artifact?.metadata?.title || 'Untitled Gantt Chart'}
                </Typography>
            </Box>
        );
    }

    const ganttRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ganttRef.current && ganttData.tasks.length > 0) {
            const tasks = ganttData.tasks.map(task => {
                // Ensure required fields exist
                const id = task.id?.toString() || Math.random().toString(36).substring(2);
                const name = task.text || 'Unnamed Task';
                const start = task.start || new Date().toISOString();
                const end = task.end || new Date(Date.now() + 86400000).toISOString(); // Default 1 day duration
                
                return {
                    id,
                    name,
                    start,
                    end,
                    progress: task.progress || 0,
                    dependencies: (ganttData.links || [])
                        .filter(link => link?.target === task.id)
                        .map(link => link?.source?.toString()) || '',
                    custom_class: task.type === 'summary' ? 'summary' : ''
                };
            });

            if (!ganttObjRef.current) {
                ganttObjRef.current = new Gantt(ganttRef.current, tasks, {
                    container_height: 600,
                    view_mode: 'Month',
                    view_mode_select: true,
                    today_button: false,
                    on_date_change: (task) => {
                        console.log(task);
                    }
                });
            }

            // settings = {
            //     header_height: 50,
            //     column_width: 30,
            //     step: 24,
            //     view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
            //     bar_height: 20,
            //     bar_corner_radius: 3,
            //     arrow_curve: 5,
            //     padding: 18,
            //     view_mode: 'Month',
            //     date_format: 'YYYY-MM-DD',
            //     custom_popup_html: null
            // }
        }
    }, [ganttData]);

    return (
        <Box sx={{ width: '100%', height: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {artifact?.metadata?.title || 'Gantt Chart'}
            </Typography>
            <div ref={ganttRef} style={{ background: '#fff', width: '100%', height: '600px' }} />
        </Box>
    );
};
