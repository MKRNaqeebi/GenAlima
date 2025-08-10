import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Card,
  CardBody,
  SkeletonText,
  useColorModeValue,
  Icon,
  Badge,
  Button,
  Grid,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { 
  FiSearch, 
  FiGrid, 
  FiZap,
  FiPlay,
  FiPause,
  FiPlus
} from "react-icons/fi"

import { ConnectorsService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import AddConnector from "../../components/Connectors/AddConnector"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const connectorsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/connectors")({
  component: Connectors,
  validateSearch: (search) => connectorsSearchSchema.parse(search),
})

const PER_PAGE = 12

function getConnectorsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ConnectorsService.readConnectors({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["connectors", { page }],
  }
}

function ConnectorCard({ connector }: { connector: any }) {
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#2b2b2b" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)"
  const metaColor = isDark ? "#8e8e8e" : "#6b7280"

  return (
    <Card
      bg={bgColor}
      borderColor={borderColor}
      borderWidth="1px"
      _hover={{ 
        bg: hoverBg,
        transform: "translateY(-2px)",
        boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.1)" 
      }}
      transition="all 0.2s"
      cursor="pointer"
    >
      <CardBody p={6}>
        <VStack align="start" spacing={4}>
          <HStack justify="space-between" w="100%">
            <HStack spacing={3}>
              <Icon 
                as={connector.active ? FiZap : FiPause} 
                boxSize={5} 
                color={connector.active ? "#10a37f" : metaColor} 
              />
              <Text fontSize="lg" fontWeight="semibold" color={textColor} noOfLines={1}>
                {connector.name || `Connector #${connector.id?.slice(0, 8)}`}
              </Text>
            </HStack>
            <ActionsMenu type="Connector" value={connector} />
          </HStack>

          <Text 
            color={textColor} 
            fontSize="sm" 
            lineHeight="1.6"
            noOfLines={3}
            minH="60px"
          >
            {connector.description || "No description available"}
          </Text>

          {connector.function && (
            <Box w="100%">
              <Text fontSize="xs" color={metaColor} mb={2}>
                Function:
              </Text>
              <Badge 
                colorScheme="cyan" 
                variant="subtle" 
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {connector.function.slice(0, 50) + (connector.function.length > 50 ? '...' : '')}
              </Badge>
            </Box>
          )}

          <HStack justify="space-between" w="100%">
            <HStack spacing={2}>
              <Badge 
                colorScheme={connector.active ? "green" : "gray"} 
                variant="subtle" 
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {connector.active ? "Active" : "Inactive"}
              </Badge>
            </HStack>
            <Text fontSize="xs" color={metaColor}>
              ID: {connector.id?.slice(0, 8)}
            </Text>
          </HStack>
        </VStack>
      </CardBody>
    </Card>
  )
}

interface ConnectorsGridProps {
  searchQuery: string
}

function ConnectorsGrid({ searchQuery }: ConnectorsGridProps) {
  const queryClient = useQueryClient()
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: connectors,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getConnectorsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && connectors?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getConnectorsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredConnectors = (connectors?.data || []).filter(connector => {
    const matchesFilter = filterActive === null || connector.active === filterActive
    
    if (!searchQuery.trim()) return matchesFilter
    
    const query = searchQuery.toLowerCase()
    const name = (connector.name || "").toLowerCase()
    const description = (connector.description || "").toLowerCase()
    const func = (connector.function || "").toLowerCase()
    const id = (connector.id || "").toLowerCase()
    
    const matchesSearch = name.includes(query) || 
      description.includes(query) || 
      func.includes(query) || 
      id.includes(query)
    
    return matchesSearch && matchesFilter
  })

  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#212121" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"

  if (isPending) {
    return (
      <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={6} mt={6}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} bg={bgColor} borderColor={borderColor} borderWidth="1px">
            <CardBody p={6}>
              <VStack align="start" spacing={4}>
                <SkeletonText noOfLines={1} w="70%" />
                <SkeletonText noOfLines={3} w="100%" />
                <SkeletonText noOfLines={1} w="40%" />
              </VStack>
            </CardBody>
          </Card>
        ))}
      </Grid>
    )
  }

  return (
    <>
      {/* Filter Bar */}
      <HStack spacing={4} mb={6}>
        <Button
          size="sm"
          variant={filterActive === null ? "solid" : "ghost"}
          colorScheme={filterActive === null ? "blue" : "gray"}
          onClick={() => setFilterActive(null)}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filterActive === true ? "solid" : "ghost"}
          colorScheme={filterActive === true ? "green" : "gray"}
          onClick={() => setFilterActive(true)}
          leftIcon={<FiPlay />}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={filterActive === false ? "solid" : "ghost"}
          colorScheme={filterActive === false ? "red" : "gray"}
          onClick={() => setFilterActive(false)}
          leftIcon={<FiPause />}
        >
          Inactive
        </Button>
      </HStack>

      <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6}>
        {filteredConnectors.map((connector) => (
          <ConnectorCard key={connector.id} connector={connector} />
        ))}
      </Grid>
      
      {filteredConnectors.length === 0 && !isPending && (
        <Flex justify="center" align="center" py={16}>
          <VStack spacing={4}>
            <Icon as={FiGrid} boxSize={16} color={placeholderColor} />
            <Text fontSize="xl" color={textColor}>
              {searchQuery.trim() || filterActive !== null ? "No matching connectors found" : "No connectors yet"}
            </Text>
            <Text color={placeholderColor} textAlign="center">
              {searchQuery.trim() || filterActive !== null
                ? "Try adjusting your search or filter"
                : "Create your first connector to get started"
              }
            </Text>
          </VStack>
        </Flex>
      )}

      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Connectors() {
  const [searchQuery, setSearchQuery] = useState("")
  const { isOpen, onOpen, onClose } = useDisclosure()
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
          <VStack align="start" spacing={6}>
            <HStack justify="space-between" w="100%">
              <VStack align="start" spacing={2}>
                <HStack spacing={3}>
                  <Icon as={FiGrid} boxSize={8} color="#10a37f" />
                  <Text fontSize="3xl" fontWeight="bold" color={textColor}>
                    Connectors
                  </Text>
                </HStack>
                <Text color={placeholderColor} fontSize="lg">
                  Manage your API connectors and integrations
                </Text>
              </VStack>
              <Button
                leftIcon={<FiPlus />}
                colorScheme="blue"
                size="md"
                onClick={onOpen}
              >
                Add Connector
              </Button>
            </HStack>

            {/* Search Bar */}
            <Card w="100%" bg={cardBg} borderColor={borderColor} borderWidth="1px">
              <CardBody p={4}>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <FiSearch color={placeholderColor} />
                  </InputLeftElement>
                  <Input
                    placeholder="Search connectors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    border="none"
                    _focus={{ boxShadow: "none", outline: "none" }}
                    _placeholder={{ color: placeholderColor }}
                    color={textColor}
                    fontSize="15px"
                  />
                </InputGroup>
              </CardBody>
            </Card>
          </VStack>
        </Box>

        <ConnectorsGrid searchQuery={searchQuery} />
        <AddConnector isOpen={isOpen} onClose={onClose} />
      </Box>
    </Box>
  )
}