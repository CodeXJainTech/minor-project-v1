import { useState } from "react";

interface LoginFormProps {
  onLogin: (username: string, password: string, isRegistering: boolean) => void;
  isLoading: boolean;
}

export default function LoginForm({ onLogin, isLoading }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || isLoading) return;

    onLogin(username, password, isRegistering);
  };

  return (
    <div
      className={`min-h-screen bg-slate-950 flex items-center justify-center p-4 ${isLoading ? "cursor-wait" : ""}`}
    >
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-8 py-10 text-center text-white">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Project Cipher</h1>
          <p className="text-indigo-200 text-sm font-medium">
            Zero-Knowledge Authentication
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none disabled:opacity-50 placeholder-slate-500"
              placeholder="Enter your alias"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none disabled:opacity-50 placeholder-slate-500"
              placeholder="Enter your secure password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </>
            ) : isRegistering ? (
              "Generate Proofs & Register"
            ) : (
              "Secure Login"
            )}
          </button>
        </form>

        <div className="px-8 pb-8 text-center">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            disabled={isLoading}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors disabled:opacity-50"
          >
            {isRegistering
              ? "Already have an identity? Login."
              : "New here? Establish identity."}
          </button>
        </div>
      </div>
    </div>
  );
}
