import { SystemLogger } from "src/types/logger";

export const createSafeRPCHandlers = (Logger: SystemLogger) => ({
    post: (data: any) => {
        try {
            return data;
        } catch (error) {
            Logger.error('Error in server RPC post:', error);
            // throw error;
        }
    },
    on: (handler: (data: any) => void) => {
        return (data: any) => {
            try {
                return handler(data);
            } catch (error) {
                Logger.error('Error in server RPC handler:', error);
                // throw error;
            }
        };
    },
    serialize: (data: any) => {
        try {
            return JSON.stringify(data);
        } catch (error) {
            Logger.error('Error in server RPC serialization:', error);
            // throw error;
        }
    },
    deserialize: (message: string) => {
        try {
            return JSON.parse(message);
        } catch (error) {
            Logger.error('Error in server RPC deserialization:', error);
            // throw error;
        }
    }
});
