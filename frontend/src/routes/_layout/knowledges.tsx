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
  Grid,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { 
  FiSearch, 
  FiBookOpen, 
  FiFileText,
  FiPlus
} from "react-icons/fi"

import { KnowledgePublic, KnowledgesService } from "../../client"
import AddKnowledge from "../../components/Knowledges/AddKnowledge"
import ActionsMenu from "../../components/Common/ActionsMenu"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const knowledgesSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/knowledges")({
  component: Knowledges,
  validateSearch: (search) => knowledgesSearchSchema.parse(search),
})

const PER_PAGE = 12

function getKnowledgesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      KnowledgesService.readKnowledges({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["knowledges", { page }],
  }
}

function KnowledgeCard({ knowledge }: { knowledge: KnowledgePublic }) {
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
              <Icon as={FiFileText} boxSize={5} color="#10a37f" />
              <Text fontSize="lg" fontWeight="semibold" color={textColor}>
                Knowledge #{knowledge.id?.slice(0, 8)}
              </Text>
            </HStack>
            <ActionsMenu type="Knowledge" value={knowledge} />
          </HStack>

          <Text 
            color={textColor} 
            fontSize="sm" 
            lineHeight="1.6"
            noOfLines={4}
            minH="80px"
          >
            {knowledge.content || "No content available"}
          </Text>

          {knowledge.meta && (
            <Box w="100%">
              <Text fontSize="xs" color={metaColor} mb={2}>
                Metadata:
              </Text>
              <Badge 
                colorScheme="blue" 
                variant="subtle" 
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {(() => {
                  const metaStr = typeof knowledge.meta === 'string' 
                    ? knowledge.meta 
                    : JSON.stringify(knowledge.meta || {})
                  return metaStr.slice(0, 50) + (metaStr.length > 50 ? '...' : '')
                })()}
              </Badge>
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  )
}

function KnowledgesGrid() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: knowledges,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getKnowledgesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && knowledges?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getKnowledgesQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredKnowledges = knowledges?.data || []

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
                <SkeletonText noOfLines={1} w="60%" />
                <SkeletonText noOfLines={4} w="100%" />
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
      <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6} mt={6}>
        {filteredKnowledges.map((knowledge: KnowledgePublic) => (
          <KnowledgeCard key={knowledge.id} knowledge={knowledge} />
        ))}
      </Grid>
      
      {filteredKnowledges.length === 0 && !isPending && (
        <Flex justify="center" align="center" py={16}>
          <VStack spacing={4}>
            <Icon as={FiBookOpen} boxSize={16} color={placeholderColor} />
            <Text fontSize="xl" color={textColor}>
              No knowledges yet
            </Text>
            <Text color={placeholderColor} textAlign="center">
              Create your first knowledge item to get started
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

function Knowledges() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
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
                  <Icon as={FiBookOpen} boxSize={8} color="#10a37f" />
                  <Text fontSize="3xl" fontWeight="bold" color={textColor}>
                    Knowledge Base
                  </Text>
                </HStack>
                <Text color={placeholderColor} fontSize="lg">
                  Manage your knowledge items and content
                </Text>
              </VStack>
              <Button
                leftIcon={<FiPlus />}
                colorScheme="green"
                onClick={() => setIsAddOpen(true)}
              >
                Add Knowledge
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
                    placeholder="Search knowledge items..."
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

        <KnowledgesGrid />
        
        <AddKnowledge 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
        />
      </Box>
    </Box>
  )
}