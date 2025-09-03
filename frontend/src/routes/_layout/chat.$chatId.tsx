import { useState, useRef, useEffect } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { 
  FiCopy, 
  FiThumbsUp,
  FiThumbsDown,
  FiMic,
  FiArrowUp,
  FiActivity
} from "react-icons/fi"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { MessagePublic, MessagesService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

export const Route = createFileRoute("/_layout/chat/$chatId")({
  component: Chat,
})

function MetadataPopup({ metadata, onClose }: { metadata: any, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Debug Metadata</h3>
          <button 
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Close"
          >
            ✕
          </button>
        </div>
        <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto text-gray-900 dark:text-gray-100">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function getMessagesQueryOptions({ chatId }: { chatId: string }) {
  return {
    queryFn: () =>
      MessagesService.readMessagesByChat({ id: chatId }),
    queryKey: ["messages", { chatId }],
  }
}

function MessageBubble({ message, onShowMetadata }: { message: MessagePublic, onShowMetadata?: (metadata: any) => void }) {
  const isUser = message.role === 'user'
  const hasMetadata = message.meta_data && Object.keys(message.meta_data).length > 0
  const showToast = useCustomToast()
  const [isLiked, setIsLiked] = useState(false)
  const [isDisliked, setIsDisliked] = useState(false)
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      showToast('Copied!', 'Message copied to clipboard.', 'success')
    } catch (err) {
      showToast('Error', 'Failed to copy message.', 'error')
    }
  }
  
  const handleLike = () => {
    if (isDisliked) setIsDisliked(false)
    setIsLiked(!isLiked)
    if (!isLiked) {
      showToast('Liked!', 'Thanks for your feedback.', 'success')
    }
  }
  
  const handleDislike = () => {
    if (isLiked) setIsLiked(false)
    setIsDisliked(!isDisliked)
    if (!isDisliked) {
      showToast('Feedback received', 'Thanks for letting us know.', 'success')
    }
  }
  
  return (
    <div className="group max-w-4xl mx-auto px-4 py-4">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
          {isUser ? (
            <div className="bg-gray-200 dark:bg-[#2f2f2f] rounded-3xl px-5 py-1.5">
              <div className="text-gray-900 dark:text-white text-base leading-relaxed markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
              {hasMetadata && (
                <div className="flex justify-end mt-2">
                  <button 
                    type="button" 
                    onClick={() => onShowMetadata?.(message.meta_data)}
                    className="p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title="Show debug metadata"
                  >
                    <FiActivity className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="text-gray-900 dark:text-chat-text-primary text-base leading-relaxed markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
              <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={handleCopy} title="Copy message" className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-chat-hover text-gray-600 dark:text-chat-text-muted hover:text-gray-900 dark:hover:text-chat-text-primary transition-colors">
                  <FiCopy className="w-4 h-4" />
                </button>
                <button type="button" onClick={handleLike} title="Like message" className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-chat-hover text-gray-600 dark:text-chat-text-muted hover:text-gray-900 dark:hover:text-chat-text-primary transition-colors">
                  <FiThumbsUp className="w-4 h-4" />
                </button>
                <button type="button" onClick={handleDislike} title="Dislike message" className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-chat-hover text-gray-600 dark:text-chat-text-muted hover:text-gray-900 dark:hover:text-chat-text-primary transition-colors">
                  <FiThumbsDown className="w-4 h-4" />
                </button>
                {hasMetadata && (
                  <button 
                    type="button" 
                    onClick={() => onShowMetadata?.(message.meta_data)}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-chat-hover text-gray-600 dark:text-chat-text-muted hover:text-gray-900 dark:hover:text-chat-text-primary transition-colors"
                    title="Show debug metadata"
                  >
                    <FiActivity className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageInput({ onSendMessage, isLoading }: { 
  onSendMessage: (content: string) => void
  isLoading: boolean 
}) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  return (
    <div className="bg-white dark:bg-chat-bg p-4 pb-6 transition-colors">
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-end bg-white dark:bg-[#2f2f2f] border border-gray-300 dark:border-chat-border rounded-[2rem] px-4 py-4 shadow-sm">
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none text-base leading-relaxed"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <div className="flex items-center gap-2 ml-3">
            <button
              type="button"
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-all duration-200"
              title="Voice input"
            >
              <FiMic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!message.trim() || isLoading}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                message.trim() && !isLoading
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              title="Send message"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <FiArrowUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-500 text-center mt-3">
          GenAlima can make mistakes. Check important info.
        </p>
      </div>
    </div>
  )
}

function Chat() {
  const { chatId } = Route.useParams()
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showMetadataPopup, setShowMetadataPopup] = useState<any>(null)

  const {
    data: messagesData,
    isPending,
    error,
  } = useQuery(getMessagesQueryOptions({ chatId }))

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      MessagesService.createMessage({
        requestBody: { content, role: 'user', chat_id: chatId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', { chatId }] })
      queryClient.invalidateQueries({ queryKey: ['all-chats'] })
      showToast('Success!', 'Message sent successfully.', 'success')
    },
    onError: (err: any) => {
      handleError(err, showToast)
    },
  })

  const handleSendMessage = (content: string) => {
    sendMessageMutation.mutate(content)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messagesData])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 bg-white dark:bg-chat-bg h-screen transition-colors">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-chat-text-primary mb-2">Error loading chat</h2>
          <p className="text-gray-600 dark:text-chat-text-muted">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  const messages = messagesData?.data || []

  return (
    <div className="flex-1 h-screen bg-gray-50 dark:bg-chat-bg flex flex-col transition-colors">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <>
            {isPending ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-5 h-5 border-2 border-gray-500 dark:border-chat-text-muted border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-3xl mx-auto px-4">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-chat-text-primary mb-4">How can I help you today?</h2>
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            {messages.map((message: any) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                onShowMetadata={setShowMetadataPopup}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        isLoading={sendMessageMutation.isPending}
      />
      
      {/* Metadata Popup */}
      {showMetadataPopup && (
        <MetadataPopup 
          metadata={showMetadataPopup} 
          onClose={() => setShowMetadataPopup(null)} 
        />
      )}
    </div>
  )
}