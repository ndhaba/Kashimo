export class Action extends Promise<any> {
  private canceller: Function | undefined;
  private resolve: Function = undefined as unknown as Function;

  /**
   * Creates a new instance of an interruptable async Promise
   * @param executor The executor
   * @param canceller The cancelling function
   */
  constructor(executor: (resolve: (value?: any) => void | PromiseLike<void>, reject: (value?: any) => void | PromiseLike<void>) => void, canceller?: Function){
    super((resolve, reject) => {
      //this.resolve = resolve;
      executor(resolve, reject);
    });
    this.canceller = canceller;
  }

  static from(promise: Promise<any>, canceller?: Function){
    return new Action((resolve, reject) => {promise.then(resolve).catch(reject)}, canceller);
  }

  /**
   * Returns true if the action can be interrupted
   */
  canInterrupt(){
    return this.canceller !== undefined;
  }

  /**
   * Interrupts this action if possible
   */
  interrupt(){
    if(this.canceller){
      this.canceller();
      //this.resolve();
    }
  }
}

export interface Task {
  /** The name of the task */
  name: string;

  /** Prepares the task to take control of the bot */
  start(): Generator<Action, void, unknown>;
}

/**
 * Asynchronous sleep
 * @param ms The number of milliseconds
 * @returns The cancellable action
 */
export function sleep(ms: number): Action {
  var timeout: NodeJS.Timeout;
  return new Action(function(resolve){
    timeout = setTimeout(function(){
      resolve();
    }, ms);
  }, function(){
    clearTimeout(timeout);
  })
}