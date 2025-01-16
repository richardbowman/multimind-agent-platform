export async function sleep(delay = 1000) {
    await new Promise(resolve => setTimeout(resolve, delay));
}