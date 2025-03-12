import React from 'react';

interface AttachmentCardProps {
    type: 'file' | 'artifact';
    title: string;
    subtitle?: string;
    previewUrl?: string;
    onRemove: () => void;
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({ 
    type, 
    title, 
    subtitle, 
    previewUrl, 
    onRemove 
}) => {
    return (
        <div style={{
            position: 'relative',
            width: type === 'file' ? '100px' : '150px',
            height: '100px',
            borderRadius: '4px',
            overflow: 'hidden',
            flexShrink: 0,
            backgroundColor: type === 'artifact' ? '#2a2a2a' : 'transparent',
            padding: type === 'artifact' ? '8px' : '0',
            display: 'flex',
            flexDirection: type === 'artifact' ? 'column' : 'row',
            gap: '4px'
        }}>
            {type === 'file' && previewUrl && (
                <img
                    src={previewUrl}
                    alt={title}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                />
            )}
            
            {type === 'artifact' && (
                <>
                    <div style={{
                        fontSize: '0.9em',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {title}
                    </div>
                    <div style={{
                        fontSize: '0.8em',
                        color: '#aaa',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {subtitle}
                    </div>
                </>
            )}

            <button
                onClick={onRemove}
                style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                ×
            </button>
        </div>
    );
};
