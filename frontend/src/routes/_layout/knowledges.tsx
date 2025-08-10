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

import { 
  KnowledgePublic, 
  KnowledgeFilesService, 
  KnowledgeFilePublic, 
  KnowledgeFilesPublic 
} from "../../client"
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

function getKnowledgeFilesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      KnowledgeFilesService.readKnowledgeFiles({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }) as Promise<KnowledgeFilesPublic>,
    queryKey: ["knowledgeFiles", { page }],
  }
}

// Legacy function - kept for potential future use
// function getKnowledgesQueryOptions({ page }: { page: number }) {
//   return {
//     queryFn: () =>
//       KnowledgesService.readKnowledges({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
//     queryKey: ["knowledges", { page }],
//   }
// }

function KnowledgeFileCard({ file, onClick }: { file: KnowledgeFilePublic; onClick: () => void }) {
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#2b2b2b" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)"
  const metaColor = isDark ? "#8e8e8e" : "#6b7280"

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getFilename = (filePath: string) => {
    return filePath.split('/').pop() || filePath
  }

  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick()
  }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

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
    >
      <CardBody p={6}>
        <VStack align="start" spacing={4}>
          <HStack justify="space-between" w="100%">
            <HStack spacing={3}>
              <Icon as={FiFileText} boxSize={5} color="#10a37f" />
              <Text 
                fontSize="lg" 
                fontWeight="semibold" 
                color={textColor} 
                noOfLines={1}
                cursor="pointer"
                _hover={{ textDecoration: "underline" }}
                onClick={handleFileClick}
              >
                {getFilename(file.file_path)}
              </Text>
            </HStack>
            <Box onClick={handleMenuClick}>
              <ActionsMenu type="Knowledge" value={{ id: file.id || "", content: getFilename(file.file_path) } as any} />
            </Box>
          </HStack>

          <VStack align="start" spacing={2} w="100%">
            <HStack spacing={4} w="100%">
              <Badge 
                colorScheme="blue" 
                variant="subtle" 
                fontSize="xs"
                px={2}
                py={1}
                borderRadius="md"
              >
                {file.chunk_count} chunk{file.chunk_count !== 1 ? 's' : ''}
              </Badge>
            </HStack>
            
            <Text fontSize="xs" color={metaColor}>
              Created {file.created_at ? formatDate(file.created_at) : "Unknown"}
            </Text>
          </VStack>
        </VStack>
      </CardBody>
    </Card>
  )
}

interface KnowledgesGridProps {
  searchQuery: string
}

function KnowledgesGrid({ searchQuery }: KnowledgesGridProps) {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<KnowledgePublic[] | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: knowledgeFiles,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getKnowledgeFilesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && knowledgeFiles?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getKnowledgeFilesQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredFiles = ((knowledgeFiles as any)?.data || []).filter((file: KnowledgeFilePublic) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const filename = file.file_path.toLowerCase()
    const id = (file.id || "").toLowerCase()
    
    return filename.includes(query) || id.includes(query)
  })

  const handleFileClick = async (file: KnowledgeFilePublic) => {
    const filename = file.file_path.split('/').pop() || file.file_path
    setSelectedFile(filename)
    setIsLoadingContent(true)
    
    try {
      const response = await KnowledgeFilesService.readKnowledgeFiles()
      setFileContent((response as any).data)
    } catch (error) {
      console.error('Error fetching file content:', error)
      setFileContent([])
    } finally {
      setIsLoadingContent(false)
    }
  }

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

  // Show file content if a file is selected
  if (selectedFile && fileContent) {
    return (
      <VStack spacing={4} align="stretch" mt={6}>
        <HStack spacing={4}>
          <Button 
            leftIcon={<FiBookOpen />} 
            variant="ghost" 
            onClick={() => setSelectedFile(null)}
            color={textColor}
          >
            ← Back to Files
          </Button>
          <Text fontSize="lg" fontWeight="semibold" color={textColor}>
            {selectedFile}
          </Text>
        </HStack>
        
        <VStack spacing={4} align="stretch">
          {fileContent.map((knowledge, index) => (
            <Card key={knowledge.id} bg={bgColor} borderColor={borderColor} borderWidth="1px">
              <CardBody p={6}>
                <VStack align="start" spacing={3}>
                  <HStack justify="space-between" w="100%">
                    <Text fontSize="sm" fontWeight="medium" color={textColor}>
                      Page {index + 1}
                    </Text>
                    <Text fontSize="xs" color={placeholderColor}>
                      {knowledge.id?.slice(0, 8)}
                    </Text>
                  </HStack>
                  <Text color={textColor} fontSize="sm" lineHeight="1.6">
                    {knowledge.content}
                  </Text>
                </VStack>
              </CardBody>
            </Card>
          ))}
        </VStack>
      </VStack>
    )
  }

  // Show loading state when fetching content
  if (selectedFile && isLoadingContent) {
    return (
      <VStack spacing={4} align="stretch" mt={6}>
        <HStack spacing={4}>
          <Button 
            leftIcon={<FiBookOpen />} 
            variant="ghost" 
            onClick={() => setSelectedFile(null)}
            color={textColor}
          >
            ← Back to Files
          </Button>
          <Text fontSize="lg" fontWeight="semibold" color={textColor}>
            {selectedFile}
          </Text>
        </HStack>
        
        <Flex justify="center" py={16}>
          <VStack spacing={4}>
            <Icon as={FiBookOpen} boxSize={16} color={placeholderColor} />
            <Text fontSize="lg" color={textColor}>Loading content...</Text>
          </VStack>
        </Flex>
      </VStack>
    )
  }

  return (
    <>
      <Grid templateColumns="repeat(auto-fill, minmax(350px, 1fr))" gap={6} mt={6}>
        {filteredFiles.map((file: KnowledgeFilePublic) => (
          <KnowledgeFileCard 
            key={file.id} 
            file={file} 
            onClick={() => handleFileClick(file)}
          />
        ))}
      </Grid>
      
      {filteredFiles.length === 0 && !isPending && (
        <Flex justify="center" align="center" py={16}>
          <VStack spacing={4}>
            <Icon as={FiBookOpen} boxSize={16} color={placeholderColor} />
            <Text fontSize="xl" color={textColor}>
              {searchQuery.trim() ? "No matching files found" : "No knowledge files yet"}
            </Text>
            <Text color={placeholderColor} textAlign="center">
              {searchQuery.trim() 
                ? "Try adjusting your search query" 
                : "Upload your first PDF to get started"}
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
                colorScheme="blue"
                size="md"
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

        <KnowledgesGrid searchQuery={searchQuery} />
        
        <AddKnowledge 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
        />
      </Box>
    </Box>
  )
}