import readline from "node:readline";

// Reads one line of sensitive input without echoing it to the terminal or any log.
// Falls back to an unmasked single-line read when stdin is not an interactive TTY
// (piped input), since there is no terminal to mask against.
export function promptSecret(label, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      const rl = readline.createInterface({ input, terminal: false });
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
    };

    // A single "data" event can carry more than one character: pasting into a raw-mode
    // stdin delivers the whole clipboard chunk (including any newlines it contains) as
    // one event, not one event per character. Iterate so paste and keystrokes behave alike.
    const onData = (chunk) => {
      for (const char of chunk) {
        switch (char) {
          case "\n":
          case "\r":
          case "":
            cleanup();
            output.write("\n");
            resolve(value.trim());
            return;
          case "":
            cleanup();
            output.write("\n");
            reject(new Error("Cancelled."));
            return;
          case "":
          case "\b":
            if (value.length > 0) {
              value = value.slice(0, -1);
              output.write("\b \b");
            }
            break;
          default:
            value += char;
            output.write("*");
        }
      }
    };

    input.on("data", onData);
  });
}
