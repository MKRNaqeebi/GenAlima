import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  IconButton,
  Icon,
  Text,
  useColorModeValue,
  useDisclosure,
  VStack,
  HStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Button,
} from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { FiLogOut, FiMenu, FiUser } from "react-icons/fi"

import type { UserPublic } from "../../client"
import useAuth from "../../hooks/useAuth"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const queryClient = useQueryClient()
  const isDark = useColorModeValue(false, true)
  const sidebarBg = isDark ? "#171717" : "white"
  const textColor = isDark ? "#e3e3e3" : "gray.700"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "gray.200"
  const hoverBg = isDark ? "rgba(255,255,255,0.1)" : "gray.100"
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { logout } = useAuth()

  const handleLogout = async () => {
    logout()
  }

  return (
    <>
      {/* Mobile */}
      <IconButton
        onClick={onOpen}
        display={{ base: "flex", md: "none" }}
        aria-label="Open Menu"
        position="absolute"
        fontSize="20px"
        m={4}
        icon={<FiMenu />}
      />
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent maxW="260px" bg={sidebarBg}>
          <DrawerCloseButton color={textColor} />
          <DrawerBody p={0}>
            <Flex flexDir="column" h="100%">
              {/* Logo Section */}
              <HStack px={3} py={3} spacing={2}>
                <Box
                  w={6}
                  h={6}
                  borderRadius="full"
                  bg={isDark ? "white" : "black"}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="xs" fontWeight="bold" color={isDark ? "black" : "white"}>
                    G
                  </Text>
                </Box>
              </HStack>

              {/* Main Content */}
              <Box flex="1" overflowY="auto">
                <SidebarItems onClose={onClose} />
              </Box>
              
              {/* User Profile Section */}
              {currentUser?.email && (
                <Box borderTop="1px" borderColor={borderColor} p={2}>
                  <HStack
                    px={2}
                    py={2}
                    borderRadius="6px"
                    spacing={2}
                  >
                    <Avatar size="xs" name={currentUser.email} bg={isDark ? "gray.600" : "gray.300"} />
                    <VStack align="start" spacing={0} flex={1}>
                      <Text
                        fontSize="13px"
                        fontWeight="medium"
                        color={textColor}
                        noOfLines={1}
                      >
                        {currentUser.email.split('@')[0]}
                      </Text>
                      <Text
                        fontSize="11px"
                        color={isDark ? "#8e8e8e" : "gray.500"}
                        noOfLines={1}
                      >
                        Free
                      </Text>
                    </VStack>
                  </HStack>
                  <Button
                    leftIcon={<FiLogOut />}
                    onClick={handleLogout}
                    variant="ghost"
                    w="100%"
                    justifyContent="flex-start"
                    color="red.400"
                    fontSize="sm"
                    px={2}
                    mt={1}
                    _hover={{ bg: hoverBg }}
                  >
                    Log out
                  </Button>
                </Box>
              )}
            </Flex>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Desktop */}
      <Box
        bg={sidebarBg}
        borderRight="1px"
        borderColor={borderColor}
        w="260px"
        h="100vh"
        position="sticky"
        top="0"
        display={{ base: "none", md: "flex" }}
        flexDir="column"
      >
        <Flex
          flexDir="column"
          h="100%"
        >
          {/* Logo Section */}
          <HStack px={3} py={3} spacing={2}>
            <Box
              w={6}
              h={6}
              borderRadius="full"
              bg={isDark ? "white" : "black"}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="xs" fontWeight="bold" color={isDark ? "black" : "white"}>
                G
              </Text>
            </Box>
            <Box 
              w={8}
              h={8}
              border="1px solid"
              borderColor={borderColor}
              borderRadius="6px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              _hover={{ bg: hoverBg }}
              transition="all 0.15s"
            >
              <Icon as={FiMenu} boxSize={4} color={textColor} />
            </Box>
          </HStack>

          {/* Main Content */}
          <Box flex="1" overflowY="auto">
            <SidebarItems />
          </Box>
          
          {/* User Profile Section */}
          {currentUser?.email && (
            <Box borderTop="1px" borderColor={borderColor} p={2}>
              <Menu>
                <MenuButton
                  as={Button}
                  variant="ghost"
                  w="100%"
                  px={2}
                  py={2}
                  h="auto"
                  borderRadius="6px"
                  _hover={{ bg: hoverBg }}
                  transition="all 0.15s"
                >
                  <HStack spacing={2} justify="flex-start">
                    <Avatar size="xs" name={currentUser.email} bg={isDark ? "gray.600" : "gray.300"} />
                    <VStack align="start" spacing={0}>
                      <Text
                        fontSize="13px"
                        fontWeight="medium"
                        color={textColor}
                        noOfLines={1}
                        textAlign="left"
                      >
                        {currentUser.email.split('@')[0]}
                      </Text>
                      <Text
                        fontSize="11px"
                        color={isDark ? "#8e8e8e" : "gray.500"}
                        noOfLines={1}
                      >
                        Free
                      </Text>
                    </VStack>
                  </HStack>
                </MenuButton>
                <MenuList bg={sidebarBg} borderColor={borderColor}>
                  <MenuItem icon={<FiUser />} fontSize="sm" _hover={{ bg: hoverBg }}>
                    Profile
                  </MenuItem>
                  <MenuDivider borderColor={borderColor} />
                  <MenuItem
                    icon={<FiLogOut />}
                    onClick={handleLogout}
                    color="red.400"
                    fontSize="sm"
                    _hover={{ bg: hoverBg }}
                  >
                    Log out
                  </MenuItem>
                </MenuList>
              </Menu>
            </Box>
          )}
        </Flex>
      </Box>
    </>
  )
}

export default Sidebar
