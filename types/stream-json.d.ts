declare module 'stream-json' {
  export function parser(options?: unknown): NodeJS.ReadWriteStream;
}

declare module 'stream-json/streamers/StreamArray' {
  export function streamArray(options?: unknown): NodeJS.ReadWriteStream;
}
