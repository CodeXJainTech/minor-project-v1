import React from "react";

interface SidebarProps {
  user: string;
  activeChat: string | null;
  setActiveChat: (name: string | null) => void;
  pendingRequests: string[];
  sentRequests: string[];
  friendsList: string[];
  blockedUsers: string[];
  searchResults: any[];
  searchQuery: string;
  onSearch: (query: string) => void;
  onSendRequest: (target: string) => void;
  onAcceptRequest: (target: string) => void;
  onRejectRequest: (target: string) => void;
  onBlockUser: (target: string) => void;
  onUnblockUser: (target: string) => void;
  showBlockPanel: boolean;
  setShowBlockPanel: (show: boolean) => void;
  getRelationship: (username: string) => "friend" | "sent" | "pending" | "none";
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeChat,
  setActiveChat,
  pendingRequests,
  sentRequests,
  friendsList,
  blockedUsers,
  searchResults,
  searchQuery,
  onSearch,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onBlockUser,
  onUnblockUser,
  showBlockPanel,
  setShowBlockPanel,
  getRelationship,
}) => {
  return (
    <div className="w-1/4 max-w-sm bg-gray-50 border-r border-gray-200 flex flex-col z-10">
      <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Project Cipher</h2>
          <p className="text-xs text-indigo-200 mt-1 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            {user}
          </p>
        </div>
        <button
          onClick={() => setShowBlockPanel(!showBlockPanel)}
          className="p-2 hover:bg-indigo-700 rounded-lg transition"
          title="Settings"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            ></path>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            ></path>
          </svg>
        </button>
      </div>

      {showBlockPanel && (
        <div className="m-4 p-3 bg-red-50 rounded-xl border border-red-200 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider">
              Blocked Users
            </h3>
            <button
              onClick={() => setShowBlockPanel(false)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              ✕
            </button>
          </div>
          {blockedUsers.length === 0 ? (
            <p className="text-xs text-red-400 italic">No blocked users.</p>
          ) : (
            blockedUsers.map((blockedName) => (
              <div
                key={blockedName}
                className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-red-100"
              >
                <span className="font-medium text-sm text-gray-700">
                  {blockedName}
                </span>
                <button
                  onClick={() => onUnblockUser(blockedName)}
                  className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-md hover:bg-green-700 transition"
                >
                  Unblock
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="m-4 p-3 bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm">
          <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">
            Incoming Requests
          </h3>
          {pendingRequests.map((requester) => (
            <div
              key={requester}
              className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-indigo-100"
            >
              <span className="font-medium text-sm text-gray-700">
                {requester}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onAcceptRequest(requester)}
                  className="px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-md hover:bg-indigo-700 transition"
                >
                  Accept
                </button>
                <button
                  onClick={() => onRejectRequest(requester)}
                  className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-md hover:bg-red-600 transition"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sentRequests.length > 0 && (
        <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
          <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
            Awaiting Response
          </h3>
          {sentRequests.map((target) => (
            <div
              key={target}
              className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-amber-100"
            >
              <span className="font-medium text-sm text-gray-700">
                {target}
              </span>
              <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-100 rounded-md">
                Pending...
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 border-b border-gray-200 bg-white relative">
        <input
          type="text"
          placeholder="Search global network..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
        />

        {searchResults.length > 0 && (
          <div className="absolute left-4 right-4 top-14 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
            {searchResults.map((result) => {
              const rel = getRelationship(result.username);
              return (
                <div
                  key={result.username}
                  className="flex justify-between items-center p-3 hover:bg-gray-50 border-b last:border-0"
                >
                  <span className="text-sm font-medium text-gray-800">
                    {result.username}
                  </span>
                  {rel === "friend" ? (
                    <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-md">
                      ✓ Friends
                    </span>
                  ) : rel === "sent" ? (
                    <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-md">
                      Pending...
                    </span>
                  ) : rel === "pending" ? (
                    <button
                      onClick={() => onAcceptRequest(result.username)}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition font-medium"
                    >
                      Accept
                    </button>
                  ) : (
                    <button
                      onClick={() => onSendRequest(result.username)}
                      className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-black transition font-medium"
                    >
                      Invite
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 bg-white">
        {friendsList.length > 0 ? (
          <div className="space-y-1">
            <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Secure Channels
            </p>
            {friendsList.map((chatUsername) => (
              <div key={chatUsername} className="group flex items-center gap-0">
                <button
                  onClick={() => setActiveChat(chatUsername)}
                  className={`flex-1 text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                    activeChat === chatUsername
                      ? "bg-indigo-50 border border-indigo-100"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="h-10 w-10 bg-gray-100 text-gray-600 border border-gray-200 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                    {chatUsername.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-medium truncate ${activeChat === chatUsername ? "text-indigo-700" : "text-gray-800"}`}
                    >
                      {chatUsername}
                    </p>
                    <p className="text-[10px] text-green-500 font-medium uppercase tracking-wider">
                      Encrypted Link Active
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => onBlockUser(chatUsername)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all mr-1 shrink-0"
                  title={`Block ${chatUsername}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    ></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
            <svg
              className="w-10 h-10 mb-3 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              ></path>
            </svg>
            <p className="text-sm">
              Search the database to find users and establish a connection.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
