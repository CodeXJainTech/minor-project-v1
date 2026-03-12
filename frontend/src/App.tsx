import { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import { socket } from './services/socket';
// import { encryptCae, decryptCae } from './crypto/caesar';
import { encryptAes, decryptAes } from './crypto/aes_js';

interface MessagePayload {
  from: string;
  to: string;
  ciphertext: string;
}

export default function App() {
  const [user, setUser] = useState("");
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [target, setTarget] = useState("");
  const [input, setInput] = useState("");

  const handleLogin = async (username: string, password: string) => {
    const res = await fetch("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      setUser(username);
      socket.connect();
      socket.emit("register", username);
    } else {
      alert("Access Denied.");
    }
  };

  useEffect(() => {
    socket.on("receive_message", (data: MessagePayload) => {
      setMessages((prev) => [...prev, data]);
    });
    return () => {
      socket.off("receive_message");
    };
  }, []);

  const sendMessage = () => {
    if (!input) return;
    if(target == user){
      return;
    }
    if((target != "userA") && (target != "userB")){
      return;
    }
    // THE E2EE MAGIC HAPPENS HERE
    const encryptedText = encryptAes(input);
    const payload: MessagePayload = {
      from: user,
      to: target,
      ciphertext: encryptedText,
    };

    socket.emit("private_message", payload);
    setMessages((prev) => [...prev, payload]);
    setInput("");
  };

  if (!user) return <LoginForm onLogin={handleLogin} />;

  return (
    <div className="max-w-4xl mx-auto p-6 h-screen flex flex-col">
      <div className="flex justify-between items-center mb-4 border-b border-green-800 pb-2">
        <h1 className="text-xl font-bold text-green-500">
          SECURE_CHANNEL // {user}
        </h1>
      </div>

      <div className="flex-1 bg-gray-900 border border-green-800 p-4 mb-4 overflow-y-auto">
        {messages.map((msg, i) => {
          // DECRYPT FOR DISPLAY
          const decryptedText = decryptAes(msg.ciphertext);
          const isMe = msg.from === user;
          return (
            <div
              key={i}
              className={`mb-2 ${isMe ? "text-right" : "text-left"}`}
            >
              <span className="text-gray-500 text-sm">[{msg.from}]: </span>
              <span className={isMe ? "text-green-300" : "text-blue-400"}>
                {decryptedText}{" "}
                <span className="text-xs text-gray-600">
                  (Raw: {msg.ciphertext})
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          placeholder="Target User (e.g., userB)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-1/4 p-2 bg-black border border-green-800 text-green-400 focus:outline-none"
        />
        <input
          placeholder="Enter message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 p-2 bg-black border border-green-800 text-green-400 focus:outline-none"
        />
        <button
          onClick={sendMessage}
          className="px-6 bg-green-900 hover:bg-green-700 text-black font-bold"
        >
          SEND
        </button>
      </div>
    </div>
  );
}