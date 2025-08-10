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
  FiLayers,
  FiPlus
} from "react-icons/fi"
import { PiSparkle } from "react-icons/pi"

import { TemplatesService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import AddTemplate from "../../components/Templates/AddTemplate"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const templatesSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/templates")({
  component: Templates,
  validateSearch: (search) => templatesSearchSchema.parse(search),
})

const PER_PAGE = 12

function getTemplatesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      TemplatesService.readTemplates({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["templates", { page }],
  }
}

function TemplateCard({ template }: { template: any }) {
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
              <Icon as={PiSparkle} boxSize={5} color="#10a37f" />
              <Text fontSize="lg" fontWeight="semibold" color={textColor} noOfLines={1}>
                {template.title || `Template #${template.id?.slice(0, 8)}`}
              </Text>
            </HStack>
            <ActionsMenu type="Template" value={template} />
          </HStack>

          <Text 
            color={textColor} 
            fontSize="sm" 
            lineHeight="1.6"
            noOfLines={3}
            minH="60px"
          >
            {template.description || "No description available"}
          </Text>

          <HStack justify="space-between" w="100%">
            <Badge 
              colorScheme="purple" 
              variant="subtle" 
              fontSize="xs"
              px={2}
              py={1}
              borderRadius="md"
            >
              Template
            </Badge>
            <Text fontSize="xs" color={metaColor}>
              ID: {template.id?.slice(0, 8)}
            </Text>
          </HStack>
        </VStack>
      </CardBody>
    </Card>
  )
}

interface TemplatesGridProps {
  searchQuery: string
}

function TemplatesGrid({ searchQuery }: TemplatesGridProps) {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: templates,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getTemplatesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && templates?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getTemplatesQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredTemplates = (templates?.data || []).filter(template => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const title = (template.title || "").toLowerCase()
    const description = (template.description || "").toLowerCase()
    const id = (template.id || "").toLowerCase()
    
    return title.includes(query) || description.includes(query) || id.includes(query)
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
      <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6} mt={6}>
        {filteredTemplates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </Grid>
      
      {filteredTemplates.length === 0 && !isPending && (
        <Flex justify="center" align="center" py={16}>
          <VStack spacing={4}>
            <Icon as={FiLayers} boxSize={16} color={placeholderColor} />
            <Text fontSize="xl" color={textColor}>
              {searchQuery.trim() ? "No matching templates found" : "No templates yet"}
            </Text>
            <Text color={placeholderColor} textAlign="center">
              {searchQuery.trim() 
                ? "Try adjusting your search query"
                : "Create your first template to get started"
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

function Templates() {
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
                  <Icon as={PiSparkle} boxSize={8} color="#10a37f" />
                  <Text fontSize="3xl" fontWeight="bold" color={textColor}>
                    Templates
                  </Text>
                </HStack>
                <Text color={placeholderColor} fontSize="lg">
                  Manage your chat templates and prompts
                </Text>
              </VStack>
              <Button
                leftIcon={<FiPlus />}
                colorScheme="blue"
                size="md"
                onClick={onOpen}
              >
                Add Template
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
                    placeholder="Search templates..."
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

        <TemplatesGrid searchQuery={searchQuery} />
        <AddTemplate isOpen={isOpen} onClose={onClose} />
      </Box>
    </Box>
  )
}