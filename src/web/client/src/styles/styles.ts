import { Theme } from "@mui/material";

export const CustomScrollbarStyles = (theme: Theme) => ({
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

export const CustomScrollbarStyleProp = (theme: Theme) : React.CSSProperties => ({
    '&::WebkitScrollbar': {
        width: '8px'
    },
    '&::WebkitScrollbarTrack': {
        background: 'transparent',
    },
    '&::WebkitScrollbarThumb': {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        minHeight: '100px',
        borderRadius: '8px',
        transition: 'background-color 0.2s ease',
    },
    '&:hover::WebkitScrollbar': {
    },
    '&:hover::WebkitScrollbarThumb': {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        border: 'rgba(100, 100, 100, 1)',
        transition: 'background-color 0.2s ease',
    }
});
