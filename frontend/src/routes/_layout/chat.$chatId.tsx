import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Avatar,
  Card,
  CardBody,
  SkeletonText,
  Input,
  IconButton,
} from "@chakra-ui/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { z } from "zod"
import { ArrowForwardIcon } from "@chakra-ui/icons"

import { MessagesService, type MessageCreate } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

const chatSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/chat/$chatId")({
  component: Chat,
  validateSearch: (search) => chatSearchSchema.parse(search),
})

const PER_PAGE = 50

function getMessagesQueryOptions({ page, chatId }: { page: number; chatId: string }) {
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
    <Flex justify={isUser ? 'flex-end' : 'flex-start'} mb={4}>
      <HStack
        spacing={3}
        flexDirection={isUser ? 'row-reverse' : 'row'}
        maxW="70%"
      >
        <Avatar
          size="sm"
          name={isUser ? 'User' : 'Assistant'}
          bg={isUser ? 'blue.500' : 'green.500'}
        />
        <Card
          bg={isUser ? 'blue.500' : 'gray.100'}
          color={isUser ? 'white' : 'black'}
          borderRadius="lg"
        >
          <CardBody py={3} px={4}>
            <Text fontSize="sm" mb={1}>
              {content}
            </Text>
            <Text fontSize="xs" opacity={0.7}>
              {new Date(timestamp).toLocaleTimeString()}
            </Text>
          </CardBody>
        </Card>
      </HStack>
    </Flex>
  )
}

function ChatInterface() {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { page } = Route.useSearch()
  const { chatId } = Route.useParams()
  
  const {
    data: messages,
    isPending,
  } = useQuery({
    ...getMessagesQueryOptions({ page, chatId }),
    placeholderData: (prevData) => prevData,
  })

  // Show all messages from the specific chat (both user and assistant)
  // Reverse the order to show oldest messages first (proper chat order)
  const chatMessages = messages?.data
    .filter(message => message.chat_id === chatId)
    .reverse() || []

  // Check if the last message is from user and there's no assistant response yet
  const lastMessage = chatMessages[chatMessages.length - 1]
  const isWaitingForResponse = lastMessage?.role === 'user'

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

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
    if (!newMessage.trim() || isWaitingForResponse || sendMessageMutation.isPending) return
    
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
      <VStack spacing={4} align="stretch">
        {Array.from({ length: 3 }).map((_, index) => (
          <Box key={index}>
            <SkeletonText noOfLines={2} spacing={2} />
          </Box>
        ))}
      </VStack>
    )
  }

  return (
    <Box h="600px" display="flex" flexDirection="column">
      {/* Chat Messages Area */}
      <Box
        flex="1"
        overflowY="auto"
        p={4}
        bg="gray.50"
        borderRadius="md"
        mb={4}
      >
        <VStack spacing={0} align="stretch">
          {chatMessages.length === 0 ? (
            <Text textAlign="center" color="gray.500" py={8}>
              No messages in this chat. Start a conversation!
            </Text>
          ) : (
            chatMessages.map((message) => (
              <MessageBubble
                key={message.id}
                content={message.content || 'No content'}
                role={message.role as 'user' | 'assistant'}
                timestamp={new Date().toISOString()}
              />
            ))
          )}
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </VStack>
      </Box>

      {/* Message Input Area */}
      <Card>
        <CardBody>
          <HStack spacing={2} w="full">
            <Input
              placeholder={
                isWaitingForResponse 
                  ? "Waiting for assistant response..." 
                  : "Type your message..."
              }
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              flex="1"
              isDisabled={isWaitingForResponse || sendMessageMutation.isPending}
            />
            <IconButton
              aria-label="Send message"
              icon={<ArrowForwardIcon />}
              onClick={handleSendMessage}
              isLoading={sendMessageMutation.isPending}
              isDisabled={!newMessage.trim() || isWaitingForResponse || sendMessageMutation.isPending}
              colorScheme="blue"
            />
          </HStack>
        </CardBody>
      </Card>
    </Box>
  )
}

function Chat() {
  const { chatId } = Route.useParams()
  
  return (
    <Container maxW="4xl">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12} mb={2}>
        Chat Conversation
      </Heading>
      <Text color="gray.600" mb={6}>
        Chat ID: {chatId}
      </Text>
      <ChatInterface />
    </Container>
  )
}