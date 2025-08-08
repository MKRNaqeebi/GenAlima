import {
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useColorModeValue,
  VStack,
  HStack,
  Icon,
  Text,
} from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  FiUser,
  FiLock,
  FiMonitor,
  FiAlertTriangle,
  FiSettings,
} from "react-icons/fi"

import type { UserPublic } from "../../client"
import Appearance from "../../components/UserSettings/Appearance"
import ChangePassword from "../../components/UserSettings/ChangePassword"
import DeleteAccount from "../../components/UserSettings/DeleteAccount"
import UserInformation from "../../components/UserSettings/UserInformation"

const tabsConfig = [
  { title: "My profile", component: UserInformation, icon: FiUser },
  { title: "Password", component: ChangePassword, icon: FiLock },
  { title: "Appearance", component: Appearance, icon: FiMonitor },
  { title: "Danger zone", component: DeleteAccount, icon: FiAlertTriangle },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
})

function UserSettings() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const finalTabs = currentUser?.is_superuser
    ? tabsConfig.slice(0, 3)
    : tabsConfig

  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#171717" : "#f9fafb"
  const cardBg = isDark ? "#212121" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"

  return (
    <Box bg={bgColor} minH="100vh" pb={8} w="100%">
      <Box px={8} pt={8} w="100%">
        {/* Header Section */}
        <Box mb={8}>
          <VStack align="start" spacing={2}>
            <HStack spacing={3}>
              <Icon as={FiSettings} boxSize={8} color="#10a37f" />
              <Text fontSize="3xl" fontWeight="bold" color={textColor}>
                Settings
              </Text>
            </HStack>
            <Text color={placeholderColor} fontSize="lg">
              Manage your account settings and preferences
            </Text>
          </VStack>
        </Box>

        {/* Settings Tabs */}
        <Box
          bg={cardBg}
          borderColor={borderColor}
          borderWidth="1px"
          borderRadius="12px"
          overflow="hidden"
        >
          <Tabs variant="unstyled">
            <TabList
              borderBottom="1px solid"
              borderColor={borderColor}
              bg={isDark ? "#1a1a1a" : "#f8f9fa"}
              p={0}
              overflowX="auto"
              flexWrap="nowrap"
            >
              {finalTabs.map((tab, index) => (
                <Tab
                  key={index}
                  px={6}
                  py={4}
                  color={textColor}
                  fontSize="15px"
                  fontWeight="normal"
                  minW="fit-content"
                  whiteSpace="nowrap"
                  _selected={{
                    bg: cardBg,
                    borderBottom: "3px solid #10a37f",
                    color: textColor,
                  }}
                  _hover={{
                    bg: isDark ? "#222222" : "#f0f0f0",
                  }}
                  transition="all 0.2s"
                >
                  <HStack spacing={3}>
                    <Icon 
                      as={tab.icon} 
                      boxSize={4} 
                      color={placeholderColor}
                    />
                    <Text>
                      {tab.title}
                    </Text>
                  </HStack>
                </Tab>
              ))}
            </TabList>

            <TabPanels>
              {finalTabs.map((tab, index) => (
                <TabPanel key={index} p={8}>
                  <tab.component />
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </Box>
      </Box>
    </Box>
  )
}