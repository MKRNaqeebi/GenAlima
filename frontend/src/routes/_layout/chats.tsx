import {
  Container,
  Heading,
  SkeletonText,
  VStack,
  HStack,
  Box,
  Card,
  CardBody,
  Text,
  Badge,
  Icon,
  Flex,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"
import { ChatIcon, ChevronRightIcon } from "@chakra-ui/icons"

import { ChatsService } from "../../client"
import AddChat from "../../components/Chats/AddChat"
import Navbar from "../../components/Common/Navbar"
  
const chatsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/chats")({
  component: Chats,
  validateSearch: (search) => chatsSearchSchema.parse(search),
})

const PER_PAGE = 5

function getChatsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ChatsService.readChats({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["chats", { page }],
  }
}

interface ChatItemProps {
  id: string
  title: string
  template_id?: string | null
}

function ChatItem({ id, title, template_id }: ChatItemProps) {
  return (
    <Link to={`/chat/${id}`} style={{ textDecoration: 'none' }}>
      <Card
        cursor="pointer"
        transition="all 0.2s"
        _hover={{
          shadow: 'md',
          transform: 'translateY(-2px)',
          borderColor: 'blue.200'
        }}
        border="1px solid"
        borderColor="gray.200"
      >
        <CardBody>
          <Flex justify="space-between" align="center">
            <HStack spacing={3} flex={1}>
              <Box>
                <Icon as={ChatIcon} color="blue.500" boxSize={5} />
              </Box>
              <VStack align="start" spacing={1} flex={1}>
                <Text fontWeight="semibold" fontSize="md" noOfLines={1}>
                  {title || 'Untitled Chat'}
                </Text>
                <HStack spacing={2}>
                  <Text fontSize="sm" color="gray.500">
                    ID: {id.slice(0, 8)}...
                  </Text>
                  {template_id && (
                    <Badge colorScheme="blue" size="sm">
                      Template: {template_id.slice(0, 8)}...
                    </Badge>
                  )}
                </HStack>
              </VStack>
            </HStack>
            <Icon as={ChevronRightIcon} color="gray.400" boxSize={4} />
          </Flex>
        </CardBody>
      </Card>
    </Link>
  )
}

function ChatsList() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()

  const {
    data: chats,
    isPending,
  } = useQuery({
    ...getChatsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  useEffect(() => {
    // Prefetch all chats for better UX
    queryClient.prefetchQuery(getChatsQueryOptions({ page: page + 1 }))
  }, [page, queryClient])

  if (isPending) {
    return (
      <VStack spacing={4} align="stretch">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardBody>
              <HStack spacing={3}>
                <SkeletonText noOfLines={1} width="20px" />
                <VStack align="start" spacing={1} flex={1}>
                  <SkeletonText noOfLines={1} width="200px" />
                  <SkeletonText noOfLines={1} width="150px" />
                </VStack>
              </HStack>
            </CardBody>
          </Card>
        ))}
      </VStack>
    )
  }

  if (!chats?.data.length) {
    return (
      <Box textAlign="center" py={10}>
        <Icon as={ChatIcon} boxSize={12} color="gray.300" mb={4} />
        <Text fontSize="lg" color="gray.500" mb={2}>
          No chats found
        </Text>
        <Text fontSize="sm" color="gray.400">
          Create your first chat to get started
        </Text>
      </Box>
    )
  }

  return (
    <VStack spacing={3} align="stretch">
      {chats.data.map((chat) => (
        <ChatItem
          key={chat.id}
          id={chat.id}
          title={chat.title}
          template_id={chat.template_id}
        />
      ))}
    </VStack>
  )
}

function Chats() {
  return (
    <Container maxW="4xl">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12} mb={2}>
        Your Chats
      </Heading>
      <Text color="gray.600" mb={6}>
        Click on any chat to start messaging
      </Text>
      <Navbar type={"Chat"} addModalAs={AddChat} />
      <ChatsList />
    </Container>
  )
}
