import React, { useEffect } from 'react';
import { Channel } from '../../../../types/types';
import { useWebSocket } from '../contexts/WebSocketContext';

interface ChannelListProps {}

export const ChannelList: React.FC<ChannelListProps> = () => {
    const { channels, currentChannelId, setCurrentChannelId } = useWebSocket();

    return (
        <div className="channel-list">
            <h2>Channels ({channels.length})</h2>
            {channels.length === 0 && <div>Loading channels...</div>}
            <ul>
                {channels.map(channel => (
                    <li
                        key={channel.id}
                        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''}`}
                        onClick={() => setCurrentChannelId(channel.id)}
                    >
                        # {channel.name}
                    </li>
                ))}
            </ul>
        </div>
    );
};
