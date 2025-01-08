import Logger from '../../../../helpers/logger';

export const createSafeRPCHandlers = () => ({
    post: (data: any) => {
        try {
            return data;
        } catch (error) {
            Logger.error('Error in RPC post:', error);
            throw error;
        }
    },
    on: (handler: (data: any) => void) => {
        return (data: any) => {
            try {
                return handler(data);
            } catch (error) {
                Logger.error('Error in RPC handler:', error);
                throw error;
            }
        };
    },
    serialize: (data: any) => {
        try {
            return JSON.stringify(data);
        } catch (error) {
            Logger.error('Error serializing RPC data:', error);
            throw error;
        }
    },
    deserialize: (message: string) => {
        try {
            return JSON.parse(message);
        } catch (error) {
            Logger.error('Error deserializing RPC message:', error);
            throw error;
        }
    }
});
