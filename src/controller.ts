import IPCChannel from "./core/ipc";
import logger from "./core/logger";
import * as cp from "child_process";

var b1 = cp.fork("./build/kashimo", ["bot1"]);
var b1c = new IPCChannel(b1);

b1c.once("ready", function(){
  logger.info("The bot process is ready to start!");
  b1c.send("start", {
    host: "localhost",
    port: 59001,
    username: "Kashimo",
    auth: "offline",
  }, "test.db");
});