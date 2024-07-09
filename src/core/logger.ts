const RESET = "\x1b[0m";
const GLOBAL_PREFIX = "\x1b[38;5;87mkashimo\x1b[0m";
const PROCESS_COLOR = "\x1b[38;2;255;255;0m";
const TIMESTAMP_COLOR = "\x1b[38;5;238m";

function _log(...args: any[]): void {
  let prefix = args.shift();
  let textColor = args.shift();
  for(let i in args){
    if(typeof args[i] == "string"){
      args[i] = textColor + args[i] + RESET;
    }
  }
  console.log(GLOBAL_PREFIX, PROCESS_COLOR + (process.argv[2] || "controller") + RESET, TIMESTAMP_COLOR + (new Date()).toISOString() + RESET, prefix, ...args);
}

namespace logger {
  export function error(...args: any[]): void {
    _log("\x1b[31merr\x1b[0m ", "\x1b[38;2;255;105;105m", ...args);
  }
  export function info(...args: any[]): void {
    _log("\x1b[38;5;27minfo\x1b[0m", "\x1b[38;5;255m", ...args);
  }
  export function time(name: string, time: number): void {
    info(name + ": \x1b[38;2;0;255;0m" + time + "ms");
  }
  export function warn(...args: any[]): void {
    _log("\x1b[33mwarn\x1b[0m", "\x1b[38;5;228m", ...args);
  }
};

export default logger;