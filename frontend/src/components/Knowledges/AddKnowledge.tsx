import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useColorModeValue,
  Text,
  Box,
  VStack,
  HStack,
  Icon,
  IconButton,
  Spinner,
  Flex,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"
import { useState } from "react"
import { FiFile, FiX } from "react-icons/fi"

import { type ApiError, type KnowledgeCreate, KnowledgeFilesService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface AddKnowledgeProps {
  isOpen: boolean
  onClose: () => void
}

const AddKnowledge = ({ isOpen, onClose }: AddKnowledgeProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#2b2b2b" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const inputBg = isDark ? "#1a1a1a" : "#f7f7f7"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)"
  
  const {
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<KnowledgeCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      files: []
    },
  })

  const mutation = useMutation({
    mutationFn: (data: KnowledgeCreate) =>
      KnowledgeFilesService.createKnowledgeFiles({requestBody: data}),
    onSuccess: () => {
      showToast("Success!", "Knowledge created successfully.", "success")
      reset()
      setSelectedFiles([])
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeFiles"] })
      queryClient.invalidateQueries({ queryKey: ["knowledges"] })
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const newFiles = Array.from(files).filter(file => file.type === 'application/pdf')
      setSelectedFiles(prev => [...prev, ...newFiles])
      setValue('files', [...selectedFiles, ...newFiles] as any)
    }
    e.target.value = '' // Reset input to allow selecting the same file again
  }

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(newFiles)
    setValue('files', newFiles as any)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const onSubmit: SubmitHandler<KnowledgeCreate> = (data) => {
    if (selectedFiles.length === 0) {
      showToast("Error", "Please select at least one PDF file.", "error")
      return
    }
    mutation.mutate({ ...data, files: selectedFiles as any })
  }

  const handleModalClose = () => {
    setSelectedFiles([])
    reset()
    onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        size={{ base: "sm", md: "lg" }}
        isCentered
        closeOnOverlayClick={!mutation.isPending}
        closeOnEsc={!mutation.isPending}
      >
        <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
        <ModalContent 
          as="form" 
          onSubmit={handleSubmit(onSubmit)}
          bg={bgColor}
          borderColor={borderColor}
          borderWidth="1px"
          position="relative"
        >
          {/* Loading Overlay */}
          {mutation.isPending && (
            <Flex
              position="absolute"
              top="0"
              left="0"
              right="0"
              bottom="0"
              bg={isDark ? "blackAlpha.700" : "whiteAlpha.800"}
              backdropFilter="blur(2px)"
              zIndex="10"
              borderRadius="md"
              align="center"
              justify="center"
              direction="column"
            >
              <Spinner
                thickness="4px"
                speed="0.65s"
                emptyColor={isDark ? "gray.700" : "gray.200"}
                color="#10a37f"
                size="xl"
                mb={4}
              />
              <Text color={textColor} fontSize="lg" fontWeight="medium">
                Uploading {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}...
              </Text>
              <Text color={placeholderColor} fontSize="sm" mt={2}>
                Processing your knowledge documents
              </Text>
            </Flex>
          )}
          
          <ModalHeader color={textColor}>Add Knowledge</ModalHeader>
          <ModalCloseButton color={textColor} isDisabled={mutation.isPending} />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={selectedFiles.length === 0 && !!errors.files}>
                <FormLabel htmlFor="files" color={textColor}>
                  Upload PDF Files
                </FormLabel>
                <Box
                  position="relative"
                  borderWidth="2px"
                  borderStyle="dashed"
                  borderColor={selectedFiles.length > 0 ? "#10a37f" : borderColor}
                  borderRadius="md"
                  p={6}
                  textAlign="center"
                  bg={inputBg}
                  _hover={{ borderColor: "#10a37f", bg: isDark ? "#232323" : "#f0f0f0" }}
                  transition="all 0.2s"
                >
                  <Input
                    id="files"
                    type="file"
                    multiple
                    accept="application/pdf"
                    position="absolute"
                    top="0"
                    left="0"
                    width="100%"
                    height="100%"
                    opacity="0"
                    cursor="pointer"
                    onChange={handleFileChange}
                    isDisabled={mutation.isPending}
                  />
                  <Icon as={FiFile} boxSize={8} color={placeholderColor} mb={2} />
                  <Text color={placeholderColor} fontSize="sm">
                    Click to select PDF files or drag and drop
                  </Text>
                  <Text color={placeholderColor} fontSize="xs" mt={2}>
                    Supports multiple PDF files
                  </Text>
                </Box>
                {selectedFiles.length === 0 && errors.files && (
                  <FormErrorMessage>At least one PDF file is required.</FormErrorMessage>
                )}
              </FormControl>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <Box>
                  <Text fontSize="sm" color={textColor} mb={2} fontWeight="medium">
                    Selected Files ({selectedFiles.length})
                  </Text>
                  <VStack spacing={2} align="stretch">
                    {selectedFiles.map((file, index) => (
                      <HStack
                        key={index}
                        p={3}
                        bg={hoverBg}
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor={borderColor}
                        justify="space-between"
                      >
                        <HStack flex={1} spacing={3}>
                          <Icon as={FiFile} color="#10a37f" />
                          <VStack align="start" spacing={0} flex={1}>
                            <Text
                              fontSize="sm"
                              color={textColor}
                              fontWeight="medium"
                              noOfLines={1}
                            >
                              {file.name}
                            </Text>
                            <Text fontSize="xs" color={placeholderColor}>
                              {formatFileSize(file.size)}
                            </Text>
                          </VStack>
                        </HStack>
                        <IconButton
                          aria-label="Remove file"
                          icon={<FiX />}
                          size="sm"
                          variant="ghost"
                          color={placeholderColor}
                          _hover={{ color: "red.400", bg: isDark ? "whiteAlpha.100" : "blackAlpha.50" }}
                          onClick={() => removeFile(index)}
                          isDisabled={mutation.isPending}
                        />
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button 
              colorScheme="blue" 
              type="submit" 
              isLoading={mutation.isPending}
              loadingText="Uploading..."
              isDisabled={selectedFiles.length === 0 || mutation.isPending}
            >
              Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}` : 'Knowledge'}
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleModalClose}
              color={textColor}
              _hover={{ bg: isDark ? "whiteAlpha.100" : "blackAlpha.50" }}
              isDisabled={mutation.isPending}
            >
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default AddKnowledge
