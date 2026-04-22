import LoginForm from "./components/LoginForm";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import ImagePreview from "./components/ImagePreview";
import { useAuth } from "./hooks/useAuth";
import { useSocial } from "./hooks/useSocial";
import { useChat } from "./hooks/useChat";
import { useSocketListeners } from "./hooks/useSocketListeners";
import { useRatchet } from "./hooks/useRatchet";
import { Toaster } from "react-hot-toast";

export default function App() {
  const { user, myPrivateKey, handleLogin, isLoading } = useAuth();
  const { getOrCreateSessionKey } = useRatchet(user, myPrivateKey);

  const {
    activeChat,
    setActiveChat,
    input,
    setInput,
    previewImage,
    setPreviewImage,
    messages,
    sendMessage,
    sendImage,
    isSending,
  } = useChat(user, myPrivateKey, getOrCreateSessionKey);

  const {
    pendingRequests,
    setPendingRequests,
    sentRequests,
    setSentRequests,
    searchQuery,
    searchResults,
    friendsList,
    setFriendsList,
    blockedUsers,
    showBlockPanel,
    setShowBlockPanel,
    sendRequest,
    acceptRequest,
    rejectRequest,
    blockUser,
    unblockUser,
    getRelationship,
    searchUsers,
  } = useSocial(user, activeChat, setActiveChat);

  useSocketListeners({
    user,
    myPrivateKey,
    activeChat,
    setActiveChat,
    setPendingRequests,
    setSentRequests,
    setFriendsList,
    getOrCreateSessionKey,
  });

  if (!user) return <LoginForm onLogin={handleLogin} isLoading={isLoading} />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 font-sans">
      <Toaster position="top-right" reverseOrder={false} />
      <div className="w-full max-w-6xl bg-white shadow-2xl rounded-2xl overflow-hidden flex h-[85vh] border border-gray-200">
        <Sidebar
          user={user}
          activeChat={activeChat}
          setActiveChat={setActiveChat}
          pendingRequests={pendingRequests}
          sentRequests={sentRequests}
          friendsList={friendsList}
          blockedUsers={blockedUsers}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSearch={searchUsers}
          onSendRequest={sendRequest}
          onAcceptRequest={acceptRequest}
          onRejectRequest={rejectRequest}
          onBlockUser={blockUser}
          onUnblockUser={unblockUser}
          showBlockPanel={showBlockPanel}
          setShowBlockPanel={setShowBlockPanel}
          getRelationship={getRelationship}
        />
        <ChatWindow
          user={user}
          activeChat={activeChat}
          messages={messages}
          input={input}
          setInput={setInput}
          onSendMessage={sendMessage}
          onSendImage={sendImage}
          setPreviewImage={setPreviewImage}
          isSending={isSending}
        />
      </div>
      <ImagePreview
        previewImage={previewImage}
        setPreviewImage={setPreviewImage}
      />
    </div>
  );
}
