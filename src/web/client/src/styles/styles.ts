export const CustomScrollbarStyles = (theme) => ({
    '&::-webkit-scrollbar': {
        width: '6px',
    },
    '&::-webkit-scrollbar-track': {
        background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
        background: 'rgba(0, 0, 0, 0.1)',
        borderRadius: '3px',
        transition: 'background-color 0.2s ease',
    },
    '&:hover::-webkit-scrollbar-thumb': {
        background: theme.palette.divider,
    }
});
