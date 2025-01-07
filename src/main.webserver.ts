import 'reflect-metadata';
import { initializeBackend } from './initializeBackend';

// Run the main function
initializeBackend().catch(error => {
    console.error('Error in main:', error);
    process.exit(1);
});
