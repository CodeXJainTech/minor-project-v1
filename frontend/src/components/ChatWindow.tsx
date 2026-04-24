import React, { useRef, useEffect } from "react";

interface SavedMessage {
  id?: number;
  from: string;
  to: string;
  ciphertext: string;
  decryptedText: string;
  type: "text" | "image";
  timestamp: number;
}

interface ChatWindowProps {
  user: string;
  activeChat: string | null;
  messages: SavedMessage[];
  input: string;
  setInput: (val: string) => void;
  onSendMessage: () => void;
  onSendImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setPreviewImage: (url: string | null) => void;
  isSending: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  user,
  activeChat,
  messages,
  input,
  setInput,
  onSendMessage,
  onSendImage,
  setPreviewImage,
  isSending,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className={`flex-1 flex flex-col bg-slate-950 ${isSending ? "cursor-wait" : ""}`}
    >
      {activeChat ? (
        <>
          <div className="h-20 px-6 border-b border-slate-800 bg-slate-900 flex items-center justify-between shadow-sm z-0">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-indigo-900/30 text-indigo-400 border border-indigo-800/50 rounded-full flex items-center justify-center font-bold text-lg shadow-inner">
                {activeChat.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {activeChat}
                </h3>
                <p className="text-xs text-green-400 font-medium flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    ></path>
                  </svg>
                  AES-256 / ECC-P256 Ratchet
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {messages.filter(
              (m) => m.to === activeChat || m.from === activeChat,
            ).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <div className="p-4 bg-slate-800/50 rounded-full">
                  <svg
                    className="w-8 h-8 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    ></path>
                  </svg>
                </div>
                <p>Send a message to initiate the Hybrid Key Exchange.</p>
              </div>
            ) : (
              messages
                .filter((m) => m.to === activeChat || m.from === activeChat)
                .map((msg, i) => {
                  const isMe = msg.from === user;
                  return (
                    <div
                      key={i}
                      className={`mb-6 flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`px-3 py-2 rounded-2xl max-w-[75%] shadow-sm ${
                          isMe
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none"
                        }`}
                      >
                        {msg.type === "image" ? (
                          <img
                            src={msg.decryptedText}
                            alt="Secure shared"
                            onClick={() => setPreviewImage(msg.decryptedText)}
                            className="max-w-full max-h-62.5 rounded-xl object-contain block mx-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                            loading="lazy"
                          />
                        ) : (
                          <p className="text-sm px-1 py-1 break-words whitespace-pre-wrap">
                            {msg.decryptedText}
                          </p>
                        )}
                      </div>
                      <div className={`mt-1 flex items-center gap-2 text-[10px] text-slate-500 max-w-[75%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800">
            <div className="flex gap-3 items-center max-w-4xl mx-auto">
              <input
                type="file"
                accept="image/*"
                id="image-upload"
                className="hidden"
                onChange={onSendImage}
                disabled={isSending}
              />
              <label
                htmlFor="image-upload"
                className={`p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl cursor-pointer transition-colors border border-slate-700 shadow-sm ${isSending ? "opacity-50 cursor-not-allowed" : ""}`}
                title="Send Encrypted Image"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  ></path>
                </svg>
              </label>

              <input
                placeholder={
                  isSending
                    ? "Uploading..."
                    : `Secure message to ${activeChat}...`
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSendMessage()}
                disabled={isSending}
                className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 rounded-xl transition-all outline-none text-slate-100 placeholder-slate-500 disabled:opacity-50 shadow-inner"
              />
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onSendMessage(); }}
                disabled={isSending || !input.trim()}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-6 h-6 transform rotate-45 -mt-1 ml-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-500">
          <svg
            className="w-20 h-20 mb-4 text-slate-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            ></path>
          </svg>
          <h2 className="text-xl font-medium text-slate-400 mb-2">
            No connection selected
          </h2>
          <p className="text-sm">
            Search for a user in the sidebar to open a secure channel.
          </p>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;