const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3002");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate pasangan RSA Public & Private Key untuk client ini
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let registeredUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    users.set(username, publicKey);
    console.log(`Welcome, ${username} to the chat`);

    // Daftarkan RSA public key asli milik user ke server
    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        let match;
        if ((match = message.match(/^!impersonate (\w+)$/))) {
          username = match[1];
          console.log(`Now impersonating as ${username}`);
        } else if (message.match(/^!exit$/)) {
          username = registeredUsername;
          console.log(`Now you are ${username}`);
        } else {
          // Tandatangani pesan dengan privateKey milik client pengirim
          const signature = crypto
            .sign("sha256", Buffer.from(`${username}:${message}`), privateKey)
            .toString("hex");

          const payload = `${message}::${signature}`;
          socket.emit("message", { username, message: payload });
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username: newUsername, publicKey: newPublicKey } = data;
  users.set(newUsername, newPublicKey);
  console.log(`${newUsername} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;

  const separatorIndex = senderMessage.lastIndexOf("::");
  const originalMessage =
    separatorIndex !== -1 ? senderMessage.slice(0, separatorIndex) : senderMessage;
  const receivedSignature =
    separatorIndex !== -1 ? senderMessage.slice(separatorIndex + 2) : "";

  const senderPublicKey = users.get(senderUsername);
  let isVerified = false;

  if (senderPublicKey && receivedSignature) {
    try {
      isVerified = crypto.verify(
        "sha256",
        Buffer.from(`${senderUsername}:${originalMessage}`),
        senderPublicKey,
        Buffer.from(receivedSignature, "hex")
      );
    } catch (err) {
      isVerified = false;
    }
  }

  if (isVerified) {
    // Jangan tampilkan ulang pesan valid milik diri sendiri
    if (senderUsername !== username) {
      console.log(`${senderUsername}: ${originalMessage}`);
      rl.prompt();
    }
  } else {
    // Tampilkan peringatan jika signature tidak cocok atau user tidak terdaftar
    console.log(`[WARNING] ${senderUsername}: ${originalMessage} -> this user is fake`);
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