export interface BrowserElectron {
    send (channel: string, data: any) : void;
    receive (channel: string, func: (...args: any[]) => void) : void;
    status (func: (...args: any[]) => void) : void;
    pathForFile (path: File) : string;
    posixPathForFile (path: File) : string;
}
