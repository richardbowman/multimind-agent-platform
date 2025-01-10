import { LocalChatStorage, LocalTestClient } from "../localChatClient";
import { ChatClient } from "../chatClient";
import { MattermostClient } from "../mattermostClient";
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

describe('Channel Management', () => {
    let client: ChatClient;
    let storage: LocalChatStorage;
    const testUserId = 'test-user';
    const testStoragePath = './test-storage.json';

    beforeEach(async () => {
        // Clean up any previous test storage
        try {
            await fs.unlink(testStoragePath);
        } catch (error) {
            // Ignore if file doesn't exist
        }

        storage = new LocalChatStorage(testStoragePath);
        await storage.load();
        client = new LocalTestClient(testUserId, 'ws://test', storage);
    });

    afterEach(async () => {
        // Clean up test storage
        try {
            await fs.unlink(testStoragePath);
        } catch (error) {
            // Ignore if file doesn't exist
        }
    });

    describe('LocalTestClient', () => {
        it('should create a new channel with default properties', async () => {
            const channelName = 'test-channel';
            const channelId = await client.createChannel(channelName);
            
            expect(channelId).toBeDefined();
            expect(typeof channelId).toBe('string');
            
            const channels = await client.getChannels();
            expect(channels).toContainEqual([channelId, channelName]);
        });

        it('should create a private channel with description and members', async () => {
            const channelName = 'private-channel';
            const description = 'Test private channel';
            const members = ['user1', 'user2'];
            
            const channelId = await client.createChannel(channelName, {
                description,
                isPrivate: true,
                members
            });

            const channels = await client.getChannels();
            expect(channels).toContainEqual([channelId, channelName]);
            
            // Verify channel data was stored
            expect(storage.channelData[channelId]).toEqual({
                description,
                isPrivate: true,
                members
            });
        });

        it('should delete a channel and its posts', async () => {
            const channelId = await client.createChannel('test-channel');
            
            // Add some posts to the channel
            await client.postInChannel(channelId, 'Message 1');
            await client.postInChannel(channelId, 'Message 2');
            
            // Delete the channel
            await client.deleteChannel(channelId);
            
            // Verify channel is removed
            const channels = await client.getChannels();
            expect(channels).not.toContainEqual([channelId, 'test-channel']);
            
            // Verify posts are removed
            const posts = storage.posts;
            expect(posts.some(p => p.channel_id === channelId)).toBe(false);
        });

        it('should throw when deleting non-existent channel', async () => {
            const nonExistentChannel = uuidv4();
            await expect(client.deleteChannel(nonExistentChannel))
                .rejects
                .toThrow(`Channel ${nonExistentChannel} not found`);
        });
    });

    describe('MattermostClient', () => {
        // These tests would require a mock Mattermost server
        // For now we'll just test the interface compliance
        
        it('should implement createChannel method', () => {
            const mattermostClient = new MattermostClient('test-token', 'test-user');
            expect(mattermostClient.createChannel).toBeDefined();
            expect(typeof mattermostClient.createChannel).toBe('function');
        });

        it('should implement deleteChannel method', () => {
            const mattermostClient = new MattermostClient('test-token', 'test-user');
            expect(mattermostClient.deleteChannel).toBeDefined();
            expect(typeof mattermostClient.deleteChannel).toBe('function');
        });
    });
});
