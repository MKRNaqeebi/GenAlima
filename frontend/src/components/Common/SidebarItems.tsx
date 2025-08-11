import { Box, Flex, Icon, Text, useColorModeValue, VStack, Input, InputGroup, InputLeftElement, Divider, Spinner } from "@chakra-ui/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  FiEdit, FiSearch, FiArchive, FiGrid
} from "react-icons/fi"
import { PiSparkle } from "react-icons/pi"
import { useState } from "react"
import { ChatsService } from "../../client"

interface SidebarItemsProps {
  onClose?: () => void
  isCollapsed?: boolean
}

const topMenuItems = [
  { icon: FiEdit, label: "New chat", action: "new", activePath: "/chats" },
  { icon: FiSearch, label: "Search chats", action: "search" },
  { icon: FiArchive, label: "Knowledges", path: "/knowledges" },
  { icon: PiSparkle, label: "Templates", path: "/templates" },
  { icon: FiGrid, label: "Connectors", path: "/connectors" },
]

const SidebarItems = ({ onClose, isCollapsed = false }: SidebarItemsProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  
  const isDark = useColorModeValue(false, true)
  const textColor = isDark ? "#e3e3e3" : "gray.700"
  const hoverBg = isDark ? "rgba(255,255,255,0.1)" : "gray.50"
  const activeBg = isDark ? "rgba(255,255,255,0.15)" : "gray.100"
  const activeTextColor = isDark ? "#ffffff" : "gray.900"
  const dividerColor = isDark ? "rgba(255,255,255,0.1)" : "gray.200"
  const iconColor = isDark ? "#b4b4b4" : "gray.600"
  const activeIconColor = isDark ? "#ffffff" : "gray.700"
  const sectionLabelColor = isDark ? "#8e8e8e" : "gray.500"

  // Fetch all chats from API
  const { data: chatsData, isLoading, error } = useQuery({
    queryKey: ["all-chats"],
    queryFn: () => ChatsService.readChats({ skip: 0, limit: 100 }), // Fetch up to 100 chats
  })

  const handleTopMenuClick = (action: string) => {
    if (action === "new") {
      window.location.href = '/chats'
      onClose?.()
    } else if (action === "search") {
      setSearchOpen(!searchOpen)
    }
  }

  const chats = chatsData?.data || []
  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <VStack spacing={0} align="stretch" h="100%">
      {/* Top Menu Items */}
      <VStack spacing={0.5} align="stretch" px={isCollapsed ? 1 : 2} py={2}>
        {topMenuItems.map((item) => {
          const isActive = item.path ? currentPath === item.path : 
                          item.activePath ? currentPath === item.activePath : false
          
          return item.path ? (
            <Flex
              key={item.label}
              as={Link}
              to={item.path}
              px={isCollapsed ? 2 : 3}
              py={2.5}
              borderRadius="6px"
              bg={isActive ? activeBg : "transparent"}
              color={isActive ? activeTextColor : textColor}
              fontSize="14px"
              fontWeight={isActive ? "medium" : "normal"}
              transition="all 0.15s"
              _hover={{
                bg: isActive ? activeBg : hoverBg,
                textDecoration: "none",
              }}
              onClick={onClose}
              alignItems="center"
              justifyContent={isCollapsed ? "center" : "flex-start"}
              gap={3}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon as={item.icon} boxSize={4} color={isActive ? activeIconColor : iconColor} />
              {!isCollapsed && <Text>{item.label}</Text>}
            </Flex>
          ) : (
            <Flex
              key={item.label}
              as="button"
              px={isCollapsed ? 2 : 3}
              py={2.5}
              borderRadius="6px"
              bg={isActive ? activeBg : "transparent"}
              color={isActive ? activeTextColor : textColor}
              fontSize="14px"
              fontWeight={isActive ? "medium" : "normal"}
              transition="all 0.15s"
              _hover={{
                bg: isActive ? activeBg : hoverBg,
              }}
              onClick={() => handleTopMenuClick(item.action!)}
              alignItems="center"
              justifyContent={isCollapsed ? "center" : "flex-start"}
              gap={3}
              w="100%"
              textAlign="left"
              title={isCollapsed ? item.label : undefined}
            >
              <Icon as={item.icon} boxSize={4} color={isActive ? activeIconColor : iconColor} />
              {!isCollapsed && <Text>{item.label}</Text>}
            </Flex>
          )
        })}
      </VStack>

      {/* Search Input (appears when search is clicked) */}
      {searchOpen && !isCollapsed && (
        <Box px={2} pb={2}>
          <InputGroup size="sm">
            <InputLeftElement pointerEvents="none">
              <FiSearch color={iconColor} />
            </InputLeftElement>
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              bg={hoverBg}
              border="1px solid"
              borderColor={dividerColor}
              _hover={{ borderColor: dividerColor }}
              _focus={{ borderColor: "blue.400", boxShadow: "none" }}
              color={textColor}
            />
          </InputGroup>
        </Box>
      )}

      {!isCollapsed && <Divider borderColor={dividerColor} />}

      {/* Chats Section */}
      {!isCollapsed && (
        <Box flex="1" overflowY="auto" px={2} py={3}>
          <Text 
            fontSize="12px" 
            fontWeight="semibold" 
            color={sectionLabelColor}
            px={3}
            pb={2}
          >
            Chats
          </Text>
        <VStack spacing={0.5} align="stretch">
          {isLoading ? (
            <Flex justify="center" py={4}>
              <Spinner size="sm" color={iconColor} />
            </Flex>
          ) : error ? (
            <Text fontSize="12px" color={sectionLabelColor} px={3}>
              Failed to load chats
            </Text>
          ) : filteredChats.length === 0 ? (
            <Text fontSize="12px" color={sectionLabelColor} px={3}>
              {searchQuery ? "No chats found" : "No chats yet"}
            </Text>
          ) : (
            filteredChats.map((chat) => {
              const isChatActive = currentPath === `/chat/${chat.id}`
              return (
                <Flex
                  key={chat.id}
                  as={Link}
                  to={`/chat/${chat.id}`}
                  px={3}
                  py={2}
                  borderRadius="6px"
                  bg={isChatActive ? activeBg : "transparent"}
                  color={isChatActive ? activeTextColor : textColor}
                  fontSize="13px"
                  fontWeight={isChatActive ? "medium" : "normal"}
                  transition="all 0.15s"
                  _hover={{
                    bg: isChatActive ? activeBg : hoverBg,
                    textDecoration: "none",
                  }}
                  onClick={onClose}
                  alignItems="center"
                  noOfLines={1}
                >
                  <Text noOfLines={1} w="100%">{chat.title}</Text>
                </Flex>
              )
            })
          )}
        </VStack>
      </Box>
      )}
    </VStack>
  )
}

export default SidebarItems
