import React from "react"
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
  KnowledgeFilesPublic,
  KnowledgesService,
  KnowledgesPublic
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

function KnowledgeFileCard({ file, onClick }: { file: KnowledgeFilePublic; onClick: () => void }) {
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
    <div className="bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 cursor-pointer">
      <div className="p-6">
        <div className="flex flex-col items-start space-y-4">
          <div className="flex justify-between items-start w-full">
            <div className="flex items-center space-x-3">
              <FiFileText className="w-5 h-5 text-green-600" />
              <span 
                className="text-lg font-semibold text-gray-900 dark:text-white truncate cursor-pointer hover:underline"
                onClick={handleFileClick}
              >
                {getFilename(file.file_path)}
              </span>
            </div>
            <div onClick={handleMenuClick}>
              <ActionsMenu type="Knowledge" value={{ id: file.id || "", content: getFilename(file.file_path) } as any} />
            </div>
          </div>

          <div className="flex flex-col items-start space-y-2 w-full">
            <div className="flex items-center space-x-4 w-full">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                {file.chunk_count} chunk{file.chunk_count !== 1 ? 's' : ''}
              </span>
            </div>
            
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Created {file.created_at ? formatDate(file.created_at) : "Unknown"}
            </p>
          </div>
        </div>
      </div>
    </div>
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
      const response = await KnowledgesService.readKnowledges({ skip: 0, limit: 1000 }) as KnowledgesPublic
      
      const fileKnowledge = response.data.filter((knowledge: KnowledgePublic) => {
        if (knowledge.meta && typeof knowledge.meta === 'object') {
          const meta = knowledge.meta as any
          return meta.file_path === file.file_path || 
                 meta.file_id === file.id ||
                 meta.filename === filename
        }
        return false
      })
      
      setFileContent(fileKnowledge.length > 0 ? fileKnowledge : response.data)
    } catch (error) {
      console.error('Error fetching file content:', error)
      setFileContent([])
    } finally {
      setIsLoadingContent(false)
    }
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="p-6">
              <div className="flex flex-col items-start space-y-4">
                <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/5"></div>
                <div className="animate-pulse space-y-2 w-full">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                </div>
                <div className="animate-pulse h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/5"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Show file content if a file is selected
  if (selectedFile && fileContent) {
    return (
      <div className="flex flex-col space-y-4 mt-6">
        <div className="flex items-center space-x-4">
          <button 
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            onClick={() => setSelectedFile(null)}
          >
            <FiBookOpen className="w-4 h-4" />
            <span>← Back to Files</span>
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedFile}
          </h2>
        </div>
        
        <div className="flex flex-col space-y-4">
          {fileContent.map((knowledge, index) => (
            <div key={knowledge.id} className="bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="p-6">
                <div className="flex flex-col items-start space-y-4">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                        Page {index + 1}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        ID: {knowledge.id?.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                  
                  {/* Content Section */}
                  <div className="w-full">
                    <p className="text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">
                      CONTENT
                    </p>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900 dark:text-white">
                        {knowledge.content}
                      </p>
                    </div>
                  </div>
                  
                  {/* Metadata Section */}
                  {knowledge.meta && Object.keys(knowledge.meta).length > 0 && (
                    <div className="w-full">
                      <p className="text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">
                        METADATA
                      </p>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col items-start space-y-2">
                          {Object.entries(knowledge.meta as any).map(([key, value]) => (
                            <div key={key} className="flex items-start space-x-2 w-full">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                {key}:
                              </span>
                              <span className="text-sm break-all text-gray-900 dark:text-white">
                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Show loading state when fetching content
  if (selectedFile && isLoadingContent) {
    return (
      <div className="flex flex-col space-y-4 mt-6">
        <div className="flex items-center space-x-4">
          <button 
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            onClick={() => setSelectedFile(null)}
          >
            <FiBookOpen className="w-4 h-4" />
            <span>← Back to Files</span>
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedFile}
          </h2>
        </div>
        
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center space-y-4">
            <FiBookOpen className="w-16 h-16 text-gray-400 dark:text-gray-600" />
            <p className="text-lg text-gray-900 dark:text-white">Loading content...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {filteredFiles.map((file: KnowledgeFilePublic) => (
          <KnowledgeFileCard 
            key={file.id} 
            file={file} 
            onClick={() => handleFileClick(file)}
          />
        ))}
      </div>
      
      {filteredFiles.length === 0 && !isPending && (
        <div className="flex justify-center items-center py-16">
          <div className="flex flex-col items-center space-y-4">
            <FiBookOpen className="w-16 h-16 text-gray-400 dark:text-gray-600" />
            <h3 className="text-xl text-gray-900 dark:text-white">
              {searchQuery.trim() ? "No matching files found" : "No knowledge files yet"}
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-400">
              {searchQuery.trim() 
                ? "Try adjusting your search query" 
                : "Upload your first PDF to get started"}
            </p>
          </div>
        </div>
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

  return (
    <div className="h-screen bg-gray-50 dark:bg-chat-bg w-full transition-colors flex flex-col overflow-hidden">
      <div className="px-8 pt-8 w-full flex-1 flex flex-col overflow-hidden">
        {/* Header Section - Fixed */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex flex-col items-start space-y-6">
            <div className="flex justify-between items-start w-full">
              <div className="flex flex-col items-start space-y-2">
                <div className="flex items-center space-x-3">
                  <FiBookOpen className="w-8 h-8 text-green-600" />
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Knowledge Base
                  </h1>
                </div>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  Manage your knowledge items and content
                </p>
              </div>
              <button
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                onClick={() => setIsAddOpen(true)}
              >
                <FiPlus className="w-4 h-4" />
                <span>Add Knowledge</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="w-full bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="p-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiSearch className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search knowledge items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border-0 focus:ring-0 focus:outline-none text-base bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pb-8">
          <KnowledgesGrid searchQuery={searchQuery} />
        </div>
        
        <AddKnowledge 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
        />
      </div>
    </div>
  )
}