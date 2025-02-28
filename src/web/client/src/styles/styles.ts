export const CustomScrollbarStyles = (theme) => ({
    '&::-webkit-scrollbar': {
        width: '6px',
    },
    '&::-webkit-scrollbar-track': {
        background: `${theme.palette.divider} ${theme.palette.background.paper}`,
    },
    '&::-webkit-scrollbar-thumb': {
        background: '#666',
        borderRadius: '3px',
    },
    '&::-webkit-scrollbar-thumb:hover': {
        background: '#888',
    }
});