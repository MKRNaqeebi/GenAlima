import {
  Box,
  Container,
  Flex,
  Text,
  VStack,
  HStack,
  SkeletonText,
  IconButton,
  Textarea,
} from "@chakra-ui/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { z } from "zod"
import { 
  FiCopy, 
  FiEdit2, 
  FiRefreshCw,
  FiThumbsUp,
  FiThumbsDown,
  FiDownload,
  FiVolume2,
  FiChevronDown,
} from "react-icons/fi"

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
  const textColor = "#ffffff"
  const iconBg = "rgba(255,255,255,0.1)"
  const iconHoverBg = "rgba(255,255,255,0.15)"
  
  return (
    <Box py={4}>
      <Container maxW="3xl">
        <VStack align={isUser ? "flex-end" : "flex-start"} spacing={3}>
          {/* Message Content */}
          <Box
            bg={isUser ? "rgba(255,255,255,0.05)" : "transparent"}
            px={isUser ? 4 : 0}
            py={isUser ? 2 : 0}
            borderRadius={isUser ? "18px" : "0"}
            maxW={isUser ? "70%" : "100%"}
          >
            <Text 
              color={textColor} 
              fontSize="15px" 
              lineHeight="1.6"
              whiteSpace="pre-wrap"
            >
              {content}
            </Text>
          </Box>
          
          {/* Action buttons row - only for assistant messages */}
          {!isUser && (
            <HStack spacing={1.5}>
              <IconButton
                aria-label="Copy"
                icon={<FiCopy size={14} />}
                size="xs"
                variant="ghost"
                onClick={onCopy}
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Like"
                icon={<FiThumbsUp size={14} />}
                size="xs"
                variant="ghost"
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Dislike"
                icon={<FiThumbsDown size={14} />}
                size="xs"
                variant="ghost"
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Volume"
                icon={<FiVolume2 size={14} />}
                size="xs"
                variant="ghost"
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Edit"
                icon={<FiEdit2 size={14} />}
                size="xs"
                variant="ghost"
                onClick={onEdit}
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Download"
                icon={<FiDownload size={14} />}
                size="xs"
                variant="ghost"
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
              <IconButton
                aria-label="Regenerate"
                icon={<FiRefreshCw size={14} />}
                size="xs"
                variant="ghost"
                bg={iconBg}
                _hover={{ bg: iconHoverBg }}
                borderRadius="6px"
                minW="28px"
                h="28px"
                color="white"
              />
            </HStack>
          )}
        </VStack>
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
  
  const bgColor = "#212121"
  const inputBgColor = "#2b2b2b"
  const textColor = "#ffffff"
  const borderColor = "rgba(255,255,255,0.1)"
  const placeholderColor = "#8e8e8e"
  
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
    if (!newMessage.trim() || sendMessageMutation.isPending) return
    
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
      <Box flex="1" overflowY="auto" pb="100px">
        {chatMessages.length === 0 ? (
          <Flex h="100%" align="center" justify="center">
            <VStack spacing={4}>
              <Text fontSize="xl" fontWeight="normal" color={textColor}>
                How can I help you today?
              </Text>
            </VStack>
          </Flex>
        ) : (
          <VStack spacing={6} align="stretch" pt={8}>
            {chatMessages.map((message) => (
              <MessageBubble
                key={message.id}
                content={message.content || 'No content'}
                role={message.role as 'user' | 'assistant'}
                onCopy={() => handleCopy(message.content || '')}
              />
            ))}
            <div ref={messagesEndRef} />
          </VStack>
        )}
      </Box>

      {/* Scroll Down Button */}
      <Box margin="auto">
        <IconButton
          aria-label="Scroll to bottom"
          icon={<FiChevronDown />}
          size="sm"
          borderRadius="full"
          bg="#2b2b2b"
          color="white"
          border="1px solid"
          borderColor="rgba(255,255,255,0.1)"
          _hover={{ bg: "#3b3b3b" }}
          onClick={scrollToBottom}
        />
      </Box>
      {/* Message Input Area */}
      <Box
        bg={bgColor}
        borderColor={borderColor}
      >
        <Container maxW="3xl" py={3}>
          <HStack spacing={2} align="end">
            <Flex
              flex="1"
              bg={inputBgColor}
              borderRadius="24px"
              border="1px solid"
              borderColor={borderColor}
              align="center"
              px={4}
              py={2}
            >
              <Textarea
                ref={textareaRef}
                placeholder="Ask anything"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                flex="1"
                minH="20px"
                maxH="120px"
                overflow="auto"
                resize="none"
                border="none"
                bg="transparent"
                _focus={{ boxShadow: "none", outline: "none" }}
                _placeholder={{ color: placeholderColor }}
                color={textColor}
                fontSize="14px"
                lineHeight="20px"
                isDisabled={sendMessageMutation.isPending}
                rows={1}
              />
            </Flex>
          </HStack>
          <Text 
            fontSize="11px" 
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