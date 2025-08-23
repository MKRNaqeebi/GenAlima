import React from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { FiArrowRight } from "react-icons/fi"

import { MessagesService, type MessageCreate } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

const messagesSearchSchema = z.object({
  page: z.number().catch(1),
})

const messagesParamsSchema = z.object({
  chatId: z.string(),
})

export const Route = createFileRoute("/_layout/messages")({
  component: Messages,
  validateSearch: (search) => messagesSearchSchema.parse(search),
  parseParams: (params) => messagesParamsSchema.parse(params),
})

const PER_PAGE = 5

function getMessagesQueryOptions({ page, chatId }: { page: number; chatId?: string }) {
  return {
    queryFn: () =>
      MessagesService.readMessages({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["messages", { page, chatId }],
  }
}

interface MessageBubbleProps {
  content: string
  role: 'user' | 'assistant'
  timestamp: string
}

function MessageBubble({ content, role, timestamp }: MessageBubbleProps) {
  const isUser = role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3 max-w-md`}
        style={{ maxWidth: '70%' }}
      >
        <div 
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
            isUser ? 'bg-blue-500' : 'bg-green-500'
          }`}
        >
          {isUser ? 'U' : 'A'}
        </div>
        <div
          className={`rounded-lg p-3 ${
            isUser 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-black'
          }`}
        >
          <p className="text-sm mb-1">
            {content}
          </p>
          <p className="text-xs opacity-70">
            {new Date(timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function ChatInterface() {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const [newMessage, setNewMessage] = useState('')
  
  const { page } = Route.useSearch()
  const { chatId } = Route.useParams()
  
  const {
    data: messages,
    isPending,
  } = useQuery({
    ...getMessagesQueryOptions({ page, chatId }),
    placeholderData: (prevData) => prevData,
  })

  // Filter to show only user messages from the specific chat
  const userMessages = messages?.data.filter(message => 
    message.role === 'user' && message.chat_id === chatId
  ) || []

  const sendMessageMutation = useMutation({
    mutationFn: (data: MessageCreate) =>
      MessagesService.createMessage({ requestBody: data }),
    onSuccess: () => {
      showToast('Success!', 'Message sent successfully.', 'success')
      setNewMessage('')
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: (err: any) => {
      handleError(err, showToast)
    },
  })

  const handleSendMessage = () => {
    if (!newMessage.trim()) return
    
    sendMessageMutation.mutate({
      content: newMessage,
      role: 'user',
      chat_id: chatId,
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (isPending) {
    return (
      <div className="flex flex-col space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-96 flex flex-col">
      {/* Chat Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-4 bg-gray-50 rounded-md mb-4"
      >
        <div className="flex flex-col space-y-0">
          {userMessages.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No user messages found. Start a conversation!
            </p>
          ) : (
            userMessages.map((message) => (
              <MessageBubble
                key={message.id}
                content={message.content || 'No content'}
                role={message.role as 'user' | 'assistant'}
                timestamp={new Date().toISOString()}
              />
            ))
          )}
        </div>
      </div>

      {/* Message Input Area */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-4">
          <div className="flex items-center space-x-2 w-full">
            <input
              type="text"
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={sendMessageMutation.isPending || !newMessage.trim()}
              className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendMessageMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <FiArrowRight className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Messages() {
  const { chatId } = Route.useParams()
  
  return (
    <div className="max-w-4xl mx-auto px-4">
      <h1 className="text-2xl font-bold text-center md:text-left pt-12 mb-2">
        Chat Messages
      </h1>
      <p className="text-gray-600 mb-6">
        Chat ID: {chatId}
      </p>
      <ChatInterface />
    </div>
  )
}
