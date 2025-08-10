import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Textarea,
  Checkbox,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useColorModeValue,
  VStack,
  HStack,
  Flex,
  Spinner,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import { type ApiError, type ConnectorCreate, ConnectorsService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface AddConnectorProps {
  isOpen: boolean
  onClose: () => void
}

const AddConnector = ({ isOpen, onClose }: AddConnectorProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#2b2b2b" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const inputBg = isDark ? "#1a1a1a" : "#f7f7f7"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConnectorCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      name: "",
      description: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ConnectorCreate) =>
      ConnectorsService.createConnector({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Connector created successfully.", "success")
      reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] })
    },
  })

  const onSubmit: SubmitHandler<ConnectorCreate> = (data) => {
    mutation.mutate(data)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
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
                Creating connector...
              </Text>
              <Text color={placeholderColor} fontSize="sm" mt={2}>
                Setting up your new connector
              </Text>
            </Flex>
          )}
          <ModalHeader color={textColor}>Add Connector</ModalHeader>
          <ModalCloseButton color={textColor} isDisabled={mutation.isPending} />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired isInvalid={!!errors.name}>
                <FormLabel htmlFor="name" color={textColor}>Name</FormLabel>
                <Input
                  id="name"
                  {...register("name", {
                    required: "Name is required.",
                  })}
                  placeholder="Enter connector name"
                  type="text"
                  bg={inputBg}
                  borderColor={borderColor}
                  color={textColor}
                  _placeholder={{ color: placeholderColor }}
                  _hover={{ borderColor: "#10a37f" }}
                  _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                  isDisabled={mutation.isPending}
                />
                {errors.name && (
                  <FormErrorMessage>{errors.name.message}</FormErrorMessage>
                )}
              </FormControl>
              
              <FormControl>
                <FormLabel htmlFor="description" color={textColor}>Description</FormLabel>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Describe what this connector does"
                  bg={inputBg}
                  borderColor={borderColor}
                  color={textColor}
                  _placeholder={{ color: placeholderColor }}
                  _hover={{ borderColor: "#10a37f" }}
                  _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                  resize="vertical"
                  minH="80px"
                  isDisabled={mutation.isPending}
                />
              </FormControl>
              
              <FormControl>
                <FormLabel htmlFor="function" color={textColor}>Function</FormLabel>
                <Textarea
                  id="function"
                  {...register("function")}
                  placeholder="Enter the function code"
                  bg={inputBg}
                  borderColor={borderColor}
                  color={textColor}
                  _placeholder={{ color: placeholderColor }}
                  _hover={{ borderColor: "#10a37f" }}
                  _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                  resize="vertical"
                  minH="120px"
                  fontFamily="mono"
                  isDisabled={mutation.isPending}
                />
              </FormControl>
              
              <FormControl>
                <HStack spacing={3}>
                  <Checkbox
                    id="active"
                    {...register("active")}
                    colorScheme="green"
                    borderColor={borderColor}
                    isDisabled={mutation.isPending}
                  />
                  <FormLabel htmlFor="active" color={textColor} mb="0" cursor="pointer">
                    Active
                  </FormLabel>
                </HStack>
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button 
              colorScheme="blue" 
              type="submit" 
              isLoading={mutation.isPending}
              loadingText="Creating..."
              isDisabled={mutation.isPending}
            >
              Create Connector
            </Button>
            <Button 
              variant="ghost" 
              onClick={onClose}
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

export default AddConnector
