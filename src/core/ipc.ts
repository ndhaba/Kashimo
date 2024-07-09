import EventEmitter from "events";
import { Arguments } from "typed-emitter";
import {ChildProcess} from "child_process";
import { BotOptions } from "mineflayer";

interface IPCEvents {
  addBotChest: (ids: number[]) => Promise<void> | void;
  updateBotChest: (chests: string[]) => Promise<void> | void;
  removeBotChest: (chests: string[]) => Promise<void> | void;
  ready: () => Promise<void> | void;
  shutdown: (reason?: string) => Promise<void> | void;
  start: (options: BotOptions, databasePath: string) => Promise<void> | void;
}

export default class IPCChannel extends EventEmitter {
  private otherProcess: ChildProcess | NodeJS.Process;

  /**
   * Creates an IPC channel between this process and the other
   * @param otherProcess The other process
   */
  constructor(otherProcess: ChildProcess | NodeJS.Process){
    super();
    this.otherProcess = otherProcess;
    this.otherProcess.on("message", (message: any) => {
      if(!message || !message.event || !message.data){
        return;
      }
      this.emit(message.event, ...message.data);
    });
  }

  override on<E extends keyof IPCEvents>(event: E, listener: IPCEvents[E]): this {
    super.on(event, listener);
    return this;
  }

  override once<E extends keyof IPCEvents>(event: E, listener: IPCEvents[E]): this {
    super.once(event, listener);
    return this;
  }

  send<E extends keyof IPCEvents>(event: E, ...args: Arguments<IPCEvents[E]>): void {
    if(this.otherProcess.send !== undefined){
      this.otherProcess.send({event, data: args});
    }
  }
}