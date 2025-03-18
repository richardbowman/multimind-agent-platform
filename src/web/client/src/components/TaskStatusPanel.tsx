import React, { useEffect, useRef, useMemo } from 'react';
import { 
    Box, 
    Typography,
    List,
    ListItem
} from '@mui/material';
import { useTasks } from '../contexts/TaskContext';
import { TaskCard } from './TaskCard';
import { useDataContext } from '../contexts/DataContext';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

export const TaskStatusPanel: React.FC = () => {
    const { tasks } = useTasks();
    const { handles } = useDataContext();
    const listRef = useRef<FixedSizeList>(null);

    // Sort tasks by status priority
    const sortedTasks = useMemo(() => {
        return tasks.sort((a, b) => {
            const statusPriority = {
                'inProgress': 0,
                'notStarted': 1,
                'cancelled': 2,
                'completed': 3
            };
            
            const aPriority = statusPriority[a.status] || 1;
            const bPriority = statusPriority[b.status] || 1;
            
            if (aPriority < bPriority) return -1;
            if (aPriority > bPriority) return 1;
            return 0;
        });
    }, [tasks]);

    // Auto-scroll to first in-progress task
    useEffect(() => {
        if (listRef.current) {
            const inProgressIndex = sortedTasks.findIndex(t => t.status === 'inProgress');
            if (inProgressIndex > -1) {
                listRef.current.scrollToItem(inProgressIndex, 'center');
            }
        }
    }, [sortedTasks]);

    const renderRow = ({ index, style }: ListChildComponentProps) => {
        const task = sortedTasks[index];
        return (
            <ListItem style={style} key={task.id} sx={{ p: 0 }}>
                <TaskCard 
                    task={task}
                    data-status={task.status}
                    onClick={() => {}}
                    onCheckboxClick={() => {}}
                />
            </ListItem>
        );
    };

    return (
        <Box sx={{ 
            p: 2, 
            width: 400,
            height: 600,
            display: 'flex', 
            flexDirection: 'column' 
        }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                System Task Status
            </Typography>
            
            <Box sx={{ flex: 1 }}>
                <AutoSizer>
                    {({ height, width }) => (
                        <FixedSizeList
                            ref={listRef}
                            height={height}
                            width={width}
                            itemSize={100} // Adjust based on your TaskCard height
                            itemCount={sortedTasks.length}
                            overscanCount={5}
                        >
                            {renderRow}
                        </FixedSizeList>
                    )}
                </AutoSizer>
            </Box>
        </Box>
    );
};
