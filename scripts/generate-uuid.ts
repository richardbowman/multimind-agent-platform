#!/usr/bin/env node
import { createUUID } from '../src/types/uuid';

function main() {
    // Generate a new UUID
    const uuid = createUUID(crypto.randomUUID());
    console.log(uuid);
}

main();
