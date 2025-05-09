import { LocalChatStorage, LocalTestClient } from "../src/chat/localChatClient";
import { ChatClient } from "../src/chat/chatClient";
import MattermostClient from "../src/chat/mattermostClient";
// @ts-ignore
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createUUID } from "src/types/uuid";

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
        client = new LocalTestClient(createUUID(), 'ws://test', storage);
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
            const channelId = await client.createChannel({
                name: channelName
            });
            
            expect(channelId).toBeDefined();
            expect(typeof channelId).toBe('string');
            
            const channels = await client.getChannels();
            expect(channels).toContainEqual([channelId, channelName]);
        });

        it('should create a private channel with description and members', async () => {
            const channelName = 'private-channel';
            const description = 'Test private channel';
            const members = [createUUID(), createUUID()];
            
            const channelId = await client.createChannel({
                name: channelName,
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
            const channelId = await client.createChannel({
                name: 'test-channel'
            });
            
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
            await expect(client.deleteChannel(createUUID()))
                .rejects
                .toThrow(`Channel ${nonExistentChannel} not found`);
        });
    });

    // describe('MattermostClient', () => {
    //     let mattermostClient: MattermostClient;
    //     const testToken = 'test-token';
    //     const testUserId = 'test-user';

    //     beforeEach(() => {
    //         mattermostClient = new MattermostClient(testToken, testUserId);
    //     });

    //     it('should create a new public channel', async () => {
    //         const channelName = 'public-channel';
    //         const channelId = await mattermostClient.createChannel(channelName);
            
    //         expect(channelId).toBeDefined();
    //         expect(typeof channelId).toBe('string');
    //     });

    //     it('should create a private channel with members', async () => {
    //         const channelName = 'private-channel';
    //         const members = ['user1', 'user2'];
            
    //         const channelId = await mattermostClient.createChannel({
    //             name: channelName,
    //             isPrivate: true,
    //             members
    //         });

    //         expect(channelId).toBeDefined();
    //     });

    //     it('should delete a channel and its posts', async () => {
    //         const channelId = await mattermostClient.createChannel('test-channel');
            
    //         // Add some posts to the channel
    //         await mattermostClient.postInChannel(channelId, 'Message 1');
    //         await mattermostClient.postInChannel(channelId, 'Message 2');
            
    //         // Delete the channel
    //         await mattermostClient.deleteChannel(channelId);
    //     });

    //     it('should throw when deleting non-existent channel', async () => {
    //         const nonExistentChannel = uuidv4();
    //         await expect(mattermostClient.deleteChannel(nonExistentChannel))
    //             .rejects
    //             .toThrow(`Channel ${nonExistentChannel} not found`);
    //     });
    // });
});
