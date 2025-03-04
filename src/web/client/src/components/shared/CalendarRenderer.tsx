import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Box } from '@mui/material';
import { CalendarEvent } from '../../../../../tools/artifact';
import { NavigateBeforeIcon, NavigateNextIcon } from '@mui/icons-material';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface CalendarRendererProps {
    events: CalendarEvent[];
}

export const CalendarRenderer: React.FC<CalendarRendererProps> = ({ events }) => {
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();
    const localizer = momentLocalizer(moment);
    const [view, setView] = useState<'month' | 'week' | 'day'>('month');
    const [date, setDate] = useState(new Date());

    const formattedEvents = events.map(event => ({
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        description: event.description,
        location: event.location
    }));

    const handlePrevious = useCallback(() => {
        setDate(prev => {
            const newDate = new Date(prev);
            if (view === 'month') {
                newDate.setMonth(newDate.getMonth() - 1);
            } else if (view === 'week') {
                newDate.setDate(newDate.getDate() - 7);
            } else {
                newDate.setDate(newDate.getDate() - 1);
            }
            return newDate;
        });
    }, [view]);

    const handleNext = useCallback(() => {
        setDate(prev => {
            const newDate = new Date(prev);
            if (view === 'month') {
                newDate.setMonth(newDate.getMonth() + 1);
            } else if (view === 'week') {
                newDate.setDate(newDate.getDate() + 7);
            } else {
                newDate.setDate(newDate.getDate() + 1);
            }
            return newDate;
        });
    }, [view]);

    const handleToday = useCallback(() => {
        setDate(new Date());
    }, []);

    const handleViewChange = useCallback((newView: 'month' | 'week' | 'day') => {
        setView(newView);
    }, []);

    useEffect(() => {
        const calendarActions = [
            {
                id: 'calendar-prev',
                icon: <NavigateBeforeIcon />,
                label: 'Previous',
                onClick: handlePrevious
            },
            {
                id: 'calendar-next',
                icon: <NavigateNextIcon />,
                label: 'Next',
                onClick: handleNext
            },
            {
                id: 'calendar-today',
                label: 'Today',
                onClick: handleToday
            },
            {
                id: 'calendar-view-month',
                label: 'Month',
                onClick: () => handleViewChange('month'),
                variant: view === 'month' ? 'contained' : 'outlined'
            },
            {
                id: 'calendar-view-week',
                label: 'Week',
                onClick: () => handleViewChange('week'),
                variant: view === 'week' ? 'contained' : 'outlined'
            },
            {
                id: 'calendar-view-day',
                label: 'Day',
                onClick: () => handleViewChange('day'),
                variant: view === 'day' ? 'contained' : 'outlined'
            }
        ];

        registerActions('calendar', calendarActions);
        return () => unregisterActions('calendar');
    }, [handlePrevious, handleNext, handleToday, handleViewChange, view, registerActions, unregisterActions]);

    useEffect(() => {
        updateActionState('calendar-view-month', { variant: view === 'month' ? 'contained' : 'outlined' });
        updateActionState('calendar-view-week', { variant: view === 'week' ? 'contained' : 'outlined' });
        updateActionState('calendar-view-day', { variant: view === 'day' ? 'contained' : 'outlined' });
    }, [view, updateActionState]);

    return (
        <Box sx={{ height: '70vh', mt: 2 }}>
            <Calendar
                localizer={localizer}
                events={formattedEvents}
                startAccessor="start"
                endAccessor="end"
                view={view}
                onView={setView}
                date={date}
                onNavigate={setDate}
                defaultView="month"
                views={['month', 'week', 'day']}
                style={{ height: '100%' }}
            />
        </Box>
    );
};
