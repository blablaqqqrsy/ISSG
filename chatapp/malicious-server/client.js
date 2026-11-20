const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3001");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let username = "";

// Fungsi helper untuk membuat hash SHA-256 dari teks pesan
function hashMessage(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        // Buat hash dari pesan asli, lalu gabungkan ke dalam payload message
        const messageHash = hashMessage(message);
        const payload = `${message}::${messageHash}`;
        socket.emit("message", { username, message: payload });
      }
      rl.prompt();
    });
  });
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    const separatorIndex = senderMessage.lastIndexOf("::");

    if (separatorIndex === -1) {
      console.log(`[WARNING] The message from ${senderUsername} may have been changed during transmission!`);
      console.log(`${senderUsername}: ${senderMessage}`);
    } else {
      const originalMessage = senderMessage.slice(0, separatorIndex);
      const receivedHash = senderMessage.slice(separatorIndex + 2);
      const expectedHash = hashMessage(originalMessage);

      if (expectedHash === receivedHash) {
        // Hash cocok: pesan aman dan tidak diubah
        console.log(`${senderUsername}: ${originalMessage}`);
      } else {
        // Hash tidak cocok: server telah memodifikasi pesan
        console.log(`[WARNING] The message from ${senderUsername} may have been changed during transmission!`);
        console.log(`${senderUsername}: ${originalMessage}${receivedHash.slice(64)}`);
      }
    }

    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});