import React, { useState, useEffect } from 'react';
import { Channel } from '../../shared/types';

interface ChannelListProps {
    onChannelSelect: (channelId: string) => void;
    currentChannelId: string | null;
}

export const ChannelList: React.FC<ChannelListProps> = ({
    onChannelSelect,
    currentChannelId
}) => {
    const [channels, setChannels] = useState<Channel[]>([]);

    useEffect(() => {
        // TODO: Replace with actual WebSocket connection
        const mockChannels: Channel[] = [
            { id: 'general', name: 'General' },
            { id: 'random', name: 'Random' },
            { id: 'projects', name: 'Projects' }
        ];
        setChannels(mockChannels);
    }, []);

    return (
        <div className="channel-list">
            <h2>Channels</h2>
            <ul>
                {channels.map(channel => (
                    <li
                        key={channel.id}
                        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''}`}
                        onClick={() => onChannelSelect(channel.id)}
                    >
                        # {channel.name}
                    </li>
                ))}
            </ul>
        </div>
    );
};
