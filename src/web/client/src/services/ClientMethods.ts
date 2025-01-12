import { ClientMessage } from '../shared/IPCInterface';
import { LogParam } from '../../../../llm/LLMLogger';

export const createClientMethods = (emit: (event: string | symbol, ...args: any[]) => boolean) => ({
    onMessage: (messages: ClientMessage[]) => {
        emit('onMessage', messages);
    },
    onLogUpdate: (update: LogParam) => {
        emit('onLogUpdate', update);
    },
    onBackendStatus: (status: { configured: boolean; ready: boolean; message?: string }) => {
        emit('onBackendStatus', status);
    }
});
