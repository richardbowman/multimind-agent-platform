import { margin, minHeight, padding } from "@mui/system";

export const CustomScrollbarStyles = (theme) => ({
    '&::-webkit-scrollbar': {
        width: '8px',
    },
    '&::-webkit-scrollbar-track': {
        background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        minHeight: '100px',
        borderRadius: '8px',
        transition: 'background-color 0.2s ease',
    },
    '&:hover::-webkit-scrollbar': {
    },
    '&:hover::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        border: 'rgba(100, 100, 100, 1)',
        transition: 'background-color 0.2s ease',
    }
});
