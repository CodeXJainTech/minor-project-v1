import { useState} from "react";

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
}

export default function LoginForm({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (username && password) onLogin(username, password);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <form
        onSubmit={handleSubmit}
        className="p-8 border border-green-500 bg-gray-900 shadow-[0_0_15px_rgba(0,255,0,0.2)] rounded"
      >
        <h2 className="text-2xl mb-6 text-center text-green-400 font-bold tracking-widest font-mono">
          CYBER_CHAT
        </h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full mb-4 p-2 bg-black border border-green-800 text-green-400 focus:outline-none focus:border-green-400"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          className="w-full mb-6 p-2 bg-black border border-green-800 text-green-400 focus:outline-none focus:border-green-400"
        />
        <button className="w-full p-2 bg-green-900 hover:bg-green-700 text-black font-bold uppercase transition-colors">
          Initialize Connection
        </button>
      </form>
    </div>
  );
}