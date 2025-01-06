"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidChatPost = void 0;
// Validate that userPost is a proper ChatPost
const isValidChatPost = (post) => {
    return post &&
        typeof post.id === 'string' &&
        typeof post.channel_id === 'string' &&
        typeof post.message === 'string' &&
        typeof post.user_id === 'string' &&
        typeof post.create_at === 'number' &&
        typeof post.directed_at === 'string' &&
        typeof post.props === 'object';
};
exports.isValidChatPost = isValidChatPost;
