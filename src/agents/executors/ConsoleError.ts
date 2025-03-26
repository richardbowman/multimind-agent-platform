
export class ConsoleError extends Error {
    public consoleOutput?: string;

    constructor(message?: string, consoleOutput?: string) {
        super(message);
        this.consoleOutput = consoleOutput;
    }
}
