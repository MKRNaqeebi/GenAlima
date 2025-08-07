import {
  Box,
  Container,
  Flex,
  Text,
  VStack,
  HStack,
  Avatar,
  SkeletonText,
  IconButton,
  useColorModeValue,
  Textarea,
  Tooltip,
  Icon,
} from "@chakra-ui/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { z } from "zod"
import { 
  FiSend, 
  FiCopy, 
  FiEdit2, 
  FiRefreshCw,
  FiThumbsUp,
  FiThumbsDown,
  FiMic,
  FiPaperclip
} from "react-icons/fi"
import { PiSparkle } from "react-icons/pi"

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
  timestamp?: string
  onEdit?: () => void
  onCopy?: () => void
}

function MessageBubble({ content, role, onEdit, onCopy }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [showActions, setShowActions] = useState(false)
  const isDark = useColorModeValue(false, true)
  
  const bgColor = isDark ? "#212121" : "#ffffff"
  const userBgColor = isDark ? "#2b2b2b" : "#f7f7f8"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)"
  
  return (
    <Box
      bg={isUser ? userBgColor : bgColor}
      borderBottom="1px"
      borderColor={borderColor}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      position="relative"
    >
      <Container maxW="3xl" py={6}>
        <HStack spacing={4} align="start">
          {/* Avatar */}
          <Avatar
            size="sm"
            name={isUser ? 'User' : 'AI'}
            bg={isUser ? "purple.500" : isDark ? "#10a37f" : "#10a37f"}
            icon={!isUser ? <PiSparkle /> : undefined}
          />
          
          {/* Message Content */}
          <VStack align="start" flex="1" spacing={2}>
            <Text fontWeight="semibold" fontSize="sm" color={textColor}>
              {isUser ? 'You' : 'ChatGPT'}
            </Text>
            <Text 
              color={textColor} 
              fontSize="15px" 
              lineHeight="1.7"
              whiteSpace="pre-wrap"
            >
              {content}
            </Text>
            
            {/* Action buttons for assistant messages */}
            {!isUser && showActions && (
              <HStack spacing={1} mt={2}>
                <Tooltip label="Copy">
                  <IconButton
                    aria-label="Copy"
                    icon={<FiCopy />}
                    size="sm"
                    variant="ghost"
                    onClick={onCopy}
                    _hover={{ bg: hoverBg }}
                  />
                </Tooltip>
                <Tooltip label="Regenerate">
                  <IconButton
                    aria-label="Regenerate"
                    icon={<FiRefreshCw />}
                    size="sm"
                    variant="ghost"
                    _hover={{ bg: hoverBg }}
                  />
                </Tooltip>
                <Tooltip label="Good response">
                  <IconButton
                    aria-label="Good"
                    icon={<FiThumbsUp />}
                    size="sm"
                    variant="ghost"
                    _hover={{ bg: hoverBg }}
                  />
                </Tooltip>
                <Tooltip label="Bad response">
                  <IconButton
                    aria-label="Bad"
                    icon={<FiThumbsDown />}
                    size="sm"
                    variant="ghost"
                    _hover={{ bg: hoverBg }}
                  />
                </Tooltip>
              </HStack>
            )}
            
            {/* Edit button for user messages */}
            {isUser && showActions && (
              <Tooltip label="Edit">
                <IconButton
                  aria-label="Edit"
                  icon={<FiEdit2 />}
                  size="sm"
                  variant="ghost"
                  onClick={onEdit}
                  _hover={{ bg: hoverBg }}
                />
              </Tooltip>
            )}
          </VStack>
        </HStack>
      </Container>
    </Box>
  )
}

function ChatInterface() {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#212121" : "#ffffff"
  const inputBgColor = isDark ? "#2b2b2b" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.2)" : "#d9d9e3"
  const placeholderColor = isDark ? "#8e8e8e" : "#8e8e93"
  
  const { page } = Route.useSearch()
  const { chatId } = Route.useParams()
  
  const {
    data: messages,
    isPending,
  } = useQuery({
    ...getMessagesQueryOptions({ page, chatId }),
    placeholderData: (prevData) => prevData,
  })

  const chatMessages = messages?.data
    .filter(message => message.chat_id === chatId)
    .reverse() || []

  const lastMessage = chatMessages[chatMessages.length - 1]
  const isWaitingForResponse = lastMessage?.role === 'user'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [newMessage])

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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Copied!', 'Text copied to clipboard', 'success')
  }

  if (isPending) {
    return (
      <VStack spacing={4} align="stretch" p={8}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Box key={index}>
            <SkeletonText noOfLines={3} spacing={3} />
          </Box>
        ))}
      </VStack>
    )
  }

  return (
    <Flex h="100vh" w="100vw" flexDirection="column" bg={bgColor}>
      {/* Chat Messages Area */}
      <Box flex="1" overflowY="auto">
        {chatMessages.length === 0 ? (
          <Flex h="100%" align="center" justify="center">
            <VStack spacing={4}>
              <Icon as={PiSparkle} boxSize={12} color={isDark ? "#10a37f" : "#10a37f"} />
              <Text fontSize="2xl" fontWeight="semibold" color={textColor}>
                How can I help you today?
              </Text>
            </VStack>
          </Flex>
        ) : (
          <VStack spacing={0} align="stretch">
            {chatMessages.map((message) => (
              <MessageBubble
                key={message.id}
                content={message.content || 'No content'}
                role={message.role as 'user' | 'assistant'}
                onCopy={() => handleCopy(message.content || '')}
              />
            ))}
            {isWaitingForResponse && (
              <Box bg={bgColor} borderBottom="1px" borderColor={borderColor}>
                <Container maxW="3xl" py={6}>
                  <HStack spacing={4} align="start">
                    <Avatar
                      size="sm"
                      bg="#10a37f"
                      icon={<PiSparkle />}
                    />
                    <VStack align="start" flex="1" spacing={2}>
                      <Text fontWeight="semibold" fontSize="sm" color={textColor}>
                        ChatGPT
                      </Text>
                      <HStack spacing={1}>
                        <Box w={2} h={2} bg="gray.400" borderRadius="full" animation="pulse 1.5s infinite" />
                        <Box w={2} h={2} bg="gray.400" borderRadius="full" animation="pulse 1.5s infinite 0.5s" />
                        <Box w={2} h={2} bg="gray.400" borderRadius="full" animation="pulse 1.5s infinite 1s" />
                      </HStack>
                    </VStack>
                  </HStack>
                </Container>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </VStack>
        )}
      </Box>

      {/* Message Input Area */}
      <Box borderTop="1px" borderColor={borderColor} bg={bgColor}>
        <Container maxW="3xl" py={4}>
          <Flex
            bg={inputBgColor}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="12px"
            p={3}
            align="end"
            boxShadow={isDark ? "0 0 15px rgba(0,0,0,0.1)" : "0 0 15px rgba(0,0,0,0.05)"}
          >
            <IconButton
              aria-label="Attach file"
              icon={<FiPaperclip />}
              variant="ghost"
              size="sm"
              mr={2}
              isDisabled={isWaitingForResponse}
              _hover={{ bg: isDark ? "rgba(255,255,255,0.1)" : "gray.100" }}
            />
            
            <Textarea
              ref={textareaRef}
              placeholder={
                isWaitingForResponse 
                  ? "ChatGPT is thinking..." 
                  : "Message ChatGPT..."
              }
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              flex="1"
              minH="24px"
              maxH="200px"
              overflow="auto"
              resize="none"
              border="none"
              _focus={{ boxShadow: "none", outline: "none" }}
              _placeholder={{ color: placeholderColor }}
              color={textColor}
              fontSize="15px"
              lineHeight="24px"
              isDisabled={isWaitingForResponse || sendMessageMutation.isPending}
              rows={1}
            />
            
            <HStack spacing={1} ml={2}>
              <IconButton
                aria-label="Voice input"
                icon={<FiMic />}
                variant="ghost"
                size="sm"
                isDisabled={isWaitingForResponse}
                _hover={{ bg: isDark ? "rgba(255,255,255,0.1)" : "gray.100" }}
              />
              
              <IconButton
                aria-label="Send message"
                icon={<FiSend />}
                onClick={handleSendMessage}
                isLoading={sendMessageMutation.isPending}
                isDisabled={!newMessage.trim() || isWaitingForResponse || sendMessageMutation.isPending}
                size="sm"
                bg={newMessage.trim() && !isWaitingForResponse ? (isDark ? "white" : "black") : "transparent"}
                color={newMessage.trim() && !isWaitingForResponse ? (isDark ? "black" : "white") : "gray.400"}
                _hover={{
                  bg: newMessage.trim() && !isWaitingForResponse 
                    ? (isDark ? "gray.200" : "gray.800")
                    : "transparent"
                }}
                borderRadius="8px"
              />
            </HStack>
          </Flex>
          
          <Text 
            fontSize="xs" 
            color={placeholderColor} 
            textAlign="center"
            mt={2}
          >
            ChatGPT can make mistakes. Check important info.
          </Text>
        </Container>
      </Box>
    </Flex>
  )
}

function Chat() {
  return <ChatInterface />
}