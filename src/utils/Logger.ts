const RESET = "\x1b[0m";
const GLOBAL_PREFIX = "\x1b[38;5;87mkashimo\x1b[0m";
const TIMESTAMP_COLOR = "\x1b[38;5;238m";

function _log(...args: any[]): void {
  let prefix = args.shift();
  let textColor = args.shift();
  for(let i in args){
    if(typeof args[i] == "string"){
      args[i] = textColor + args[i] + RESET;
    }
  }
  console.log(GLOBAL_PREFIX, TIMESTAMP_COLOR + (new Date()).toISOString() + RESET, prefix, ...args);
}

namespace Logger {
  export function Error(...args: any[]): void {
    _log("\x1b[31merr\x1b[0m", "\x1b[38;2;255;105;105m", ...args);
  }
  export function Info(...args: any[]): void {
    _log("\x1b[38;5;27minfo\x1b[0m", "\x1b[38;5;255m", ...args);
  }
  export function Warn(...args: any[]): void {
    _log("\x1b[33mwarn\x1b[0m", "\x1b[38;5;228m", ...args);
  }
};

export default Logger;