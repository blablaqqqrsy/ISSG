const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3003");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate pasangan kunci RSA untuk masing-masing client
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let targetUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    users.set(username, publicKey);
    console.log(`Welcome, ${username} to the chat`);

    // Daftarkan RSA public key milik user ke server
    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        let match;
        if ((match = message.match(/^!secret (\w+)$/))) {
          const target = match[1];
          if (!users.has(target)) {
            console.log(`User "${target}" not found in chat.`);
          } else {
            targetUsername = target;
            console.log(`Now secretly chatting with ${targetUsername}`);
          }
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else if (targetUsername !== "") {
          // Enkripsi pesan menggunakan RSA Public Key milik targetUsername
          const targetPublicKey = users.get(targetUsername);
          const encryptedBuffer = crypto.publicEncrypt(
            targetPublicKey,
            Buffer.from(message)
          );
          const ciphertextHex = encryptedBuffer.toString("hex");

          socket.emit("message", {
            username,
            message: `ENC::${ciphertextHex}`,
          });
        } else {
          // Kirim pesan biasa (tanpa enkripsi) ke semua user
          socket.emit("message", { username, message });
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

  if (senderUsername !== username) {
    if (senderMessage.startsWith("ENC::")) {
      const ciphertextHex = senderMessage.slice(5);
      try {
        // Coba dekripsi dengan privateKey milik client ini
        const decryptedBuffer = crypto.privateDecrypt(
          privateKey,
          Buffer.from(ciphertextHex, "hex")
        );
        console.log(`${senderUsername} (secret): ${decryptedBuffer.toString("utf8")}`);
      } catch (err) {
        // Gagal dekripsi = pesan ini bukan untuk user ini, tampilkan ciphertext
        console.log(`${senderUsername}: ${ciphertextHex}`);
      }
    } else {
      console.log(`${senderUsername}: ${senderMessage}`);
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